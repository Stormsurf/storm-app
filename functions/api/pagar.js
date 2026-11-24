/**
 * STORM · Pagar con tarjeta dentro de la página de Storm (sin saltar a la aplicación de Mercado Pago)
 *
 * Todos los cobros (Anual, Adultos, Verano, reservas) crean primero una orden de Mercado Pago con su link (checkout_url).
 * En vez de mandar directo a ese link (que en el celular abre la app de Mercado Pago si está instalada),
 * se manda a /pagar/?o=<id de la orden>. Ahí la persona elige:
 *   - Pagar con tarjeta: el formulario de tarjeta de Mercado Pago (Card Payment Brick) dentro de la página.
 *   - Pagar con su cuenta Mercado Pago: el link de siempre.
 *
 * Con tarjeta se crea una orden nueva (cobro automático) con el MISMO monto y la MISMA referencia (AA-, AD-, AV-, ES-),
 * leídos de la orden original en Mercado Pago (nadie puede cambiar el monto). Si la tarjeta es rechazada, la orden
 * original no se toca y se puede intentar de nuevo. Si se aprueba, se avisa al programa que corresponde
 * igual que lo haría Mercado Pago (aviso ?mp=1), y ese programa confirma por la referencia.
 *
 * Variables en Cloudflare: MP_TOKEN (ya está), MP_PUBLIC_KEY (Public Key de producción, APP_USR-...).
 *
 * Tarjeta extranjera (Flow, flow.cl): Mercado Pago Chile exige RUT y no acepta pasaportes. Con Flow (Webpay) pagan sin RUT.
 *   Aparece solo si Cloudflare tiene FLOW_API_KEY y FLOW_SECRET (flow.cl > Mi cuenta > Integraciones). Opcional FLOW_API=https://sandbox.flow.cl/api.
 *   Se crea un cobro Flow por el mismo monto y referencia de la orden de Mercado Pago. Cuando Flow avisa que está pagado:
 *   - Reservas (ES-): /api/reservas?flowok=1 vuelve a revisar en Flow y confirma.
 *   - Anual, Adultos, Verano: se avisa al programa de la planilla (accion 'pago-flow', firmado con CLAVE_WEB).
 *
 * Webpay Plus (Transbank, integración por cuenta propia): igual que Flow, pero más barato. Si está configurado, se usa en vez de Flow.
 *   Variables: WEBPAY_CODIGO (código de comercio 5970...) y WEBPAY_LLAVE (API Key Secret que manda Transbank).
 *   WEBPAY_PRUEBA=1 usa el ambiente de integración de Transbank con sus datos públicos de prueba (para la vista previa y la validación).
 *   Webpay no avisa por detrás: el pago se confirma (commit) cuando la persona vuelve a /api/pagar?webpay=vuelta.
 *   Con Webpay activo, /pagar ofrece SOLO Webpay (Isidora 24-11): todo lo online entra por un solo código de comercio,
 *   que se declara exento de IVA. Por eso el link de pago es solo para clases: rentas y tienda (con IVA) se cobran con POS.
 */

const MP_API = 'https://api.mercadopago.com';
const ANUAL = 'https://script.google.com/macros/s/AKfycbyFZiJBhEoWR3-mekjXfea3O0BbDItazLHQRUkCpWOUZOwJ4612kgiGsg4ocWpGBgO3/exec';  // Anual y Adultos
const VERANO = 'https://script.google.com/macros/s/AKfycbzSHDu8whWWNwq-EFwaWqwKOtyU5pnyPuixutUI8sd5twFaTjDibN11TA3bMH_UddTo/exec';
const PUBLIC_KEY = 'APP_USR-d9421f08-0996-410b-bd5c-5947565d6099'; // Public Key de producción (es pública, no es secreta)
const FLOW_API = 'https://www.flow.cl/api';
const WEBPAY_PROD = 'https://webpay3g.transbank.cl', WEBPAY_INT = 'https://webpay3gint.transbank.cl';
const WEBPAY_INT_CODIGO = '597055555532', WEBPAY_INT_LLAVE = '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C'; // datos públicos de prueba de Transbank
const REF_OK = /^(AA|AD|AV|ES|LK|PRUEBA)-[\w-]+$/; // LK- = link de pago de la Tienda (productos, rentas y clases) // PRUEBA- solo en la vista previa

// Transferencia (Isidora 24-11): Anual, Adultos y Verano se pagan SOLO por transferencia hasta el 30-11 (hora Chile).
// La familia ve los datos del banco y sube el comprobante; al subirlo el pago queda anotado. Desde el 1-12 vuelve Webpay solo.
const BANCO = { titular: 'Storm SpA', rut: '77.957.792-9', banco: 'Banco de Chile - Edwards', tipo: 'Cuenta Vista', numero: '1367824213', correo: 'contacto@stormsurf.cl' };
const TRANSFERENCIA_HASTA = '2026-11-30';
const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const soloTransferencia = ref => /^(AA|AD|AV)-/.test(String(ref || '')) && hoyChile() <= TRANSFERENCIA_HASTA;
const MAX_COMPROBANTE = 4 * 1024 * 1024; // base64 (~3 MB de archivo); las fotos se achican en el celular antes de subir
async function compTabla(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS comprobantes (clave TEXT PRIMARY KEY, orden TEXT NOT NULL, ref TEXT NOT NULL, monto INTEGER NOT NULL DEFAULT 0, archivo TEXT NOT NULL DEFAULT '', tipo TEXT NOT NULL DEFAULT '', datos TEXT NOT NULL DEFAULT '', creada_ms INTEGER NOT NULL)").run();
}
// Boleta exenta (Isidora 24-11): desde el 1-12 el SII de Storm queda en "Siempre emito boleta". Cada pago con Webpay
// (clases y Academia, todo exento) lleva su boleta exenta electrónica (tipo 41), que emite SimpleFactura (secreto SIMPLEFACTURA_TOKEN).
// Se guarda en D1 (tabla boletas, una por pago). Si SimpleFactura falla, la revisión automática (cada 5 min) la reintenta.
const BOLETA_DESDE = '2026-12-01';
const SF_API = 'https://api.simplefactura.cl';
const EMISOR = { RUTEmisor: '77957792-9', RznSocEmisor: 'Storm SpA', GiroEmisor: 'Otros tipos de enseñanza n.c.p.', DirOrigen: 'Cam Las Brisas LT B Las Brisas', CmnaOrigen: 'Navidad' };
const NOMBRE_REF = ref => /^AA-/.test(ref) ? 'Academia Anual de surf' : /^AD-/.test(ref) ? 'Academia Adultos de surf' : /^AV-/.test(ref) ? 'Academia de Verano de surf' : 'Clase de surf';
async function boletaTabla(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS boletas (pago TEXT PRIMARY KEY, ref TEXT NOT NULL, monto INTEGER NOT NULL, detalle TEXT NOT NULL DEFAULT '', fecha TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente', folio INTEGER, error TEXT NOT NULL DEFAULT '', intentos INTEGER NOT NULL DEFAULT 0, creada_ms INTEGER NOT NULL)").run();
}
/** Llama a SimpleFactura y emite la boleta exenta. Devuelve { folio } o { error }. */
async function sfBoleta(env, b) {
  const doc = { Documento: { Encabezado: {
      IdDoc: { TipoDTE: 41, FchEmis: b.fecha, FchVenc: b.fecha, IndServicio: 3 },
      Emisor: EMISOR,
      Receptor: { RUTRecep: '66666666-6', RznSocRecep: 'Cliente', DirRecep: 'Navidad', CmnaRecep: 'Navidad' },
      Totales: { MntExe: b.monto, MntTotal: b.monto } },
    Detalle: [{ NroLinDet: 1, NmbItem: b.detalle.slice(0, 80), QtyItem: 1, PrcItem: b.monto, MontoItem: b.monto, IndExe: 1 }] },
    Observaciones: b.ref };
  try {
    const x = await fetch((env.SF_API || SF_API) + '/invoiceV2/' + encodeURIComponent(env.SF_SUCURSAL || 'Casa Matriz'), { method: 'POST', headers: { Authorization: 'Bearer ' + env.SIMPLEFACTURA_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
    const t = await x.text(); let r = {}; try { r = JSON.parse(t); } catch (_) {}
    const folio = r && r.data && Number(r.data.folio);
    return x.status === 200 && folio ? { folio } : { error: ('HTTP ' + x.status + ' ' + t).slice(0, 800) };
  } catch (e) { return { error: String(e && e.message || e).slice(0, 500) }; }
}
/** Emite (una sola vez por pago) la boleta exenta de un pago Webpay. pago = 'webpay:<token>'. */
export async function emitirBoleta(env, pago, ref, monto, fecha) {
  if (!env.DB || !env.SIMPLEFACTURA_TOKEN || !(env.BOLETA_PRUEBA ? /^(AA|AD|AV|ES|LK|PRUEBA)-/ : /^(AA|AD|AV|ES|LK)-/).test(String(ref || '')) || (fecha < BOLETA_DESDE && !env.BOLETA_PRUEBA)) return null;
  await boletaTabla(env.DB);
  await env.DB.prepare('INSERT OR IGNORE INTO boletas (pago, ref, monto, detalle, fecha, creada_ms) VALUES (?, ?, ?, ?, ?, ?)').bind(pago, ref, Math.round(Number(monto)), NOMBRE_REF(ref), fecha, Date.now()).run();
  const b = await env.DB.prepare("SELECT * FROM boletas WHERE pago = ? AND estado != 'emitida'").bind(pago).first();
  if (!b) return null;
  const r = await sfBoleta(env, b);
  await env.DB.prepare('UPDATE boletas SET estado = ?, folio = ?, error = ?, intentos = intentos + 1 WHERE pago = ?').bind(r.folio ? 'emitida' : 'error', r.folio || null, r.error || '', pago).run();
  return r;
}
const sfAmbiente = env => env.SF_AMBIENTE === '1' ? 1 : 0; // 0 = pruebas (certificación), 1 = oficial (producción)
/** PDF de una boleta (lo ve la familia en su comprobante y el equipo en el Panel). */
async function boletaPdf(env, folio) {
  const x = await fetch((env.SF_API || SF_API) + '/dte/pdf', { method: 'POST', headers: { Authorization: 'Bearer ' + env.SIMPLEFACTURA_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ credenciales: { rutEmisor: EMISOR.RUTEmisor, nombreSucursal: env.SF_SUCURSAL || 'Casa Matriz' }, dteReferenciadoExterno: { folio: Number(folio), codigoTipoDte: 41, ambiente: sfAmbiente(env) } }) });
  return x.status === 200 ? x.arrayBuffer() : null;
}
/** Boletas del mes para el Panel (Finanzas). */
export async function boletasMes(env, mes) {
  if (!env.DB) return null;
  await boletaTabla(env.DB);
  const l = (await env.DB.prepare('SELECT * FROM boletas WHERE substr(fecha, 1, 7) = ? ORDER BY creada_ms DESC').bind(mes).all()).results;
  return { emitidas: l.filter(b => b.estado === 'emitida').length, total: l.filter(b => b.estado === 'emitida').reduce((t, b) => t + b.monto, 0),
    lista: l.map(b => ({ fecha: b.fecha, ref: b.ref, monto: b.monto, detalle: b.detalle, folio: b.folio, estado: b.estado, link: b.estado === 'emitida' ? '/api/pagar?boleta=' + encodeURIComponent(String(b.pago).replace(/^webpay:/, '')) : '' })) };
}
/** Reintenta las boletas que fallaron (lo llama la revisión automática cada 5 min; máx. 10 intentos). */
export async function reintentarBoletas(env) {
  if (!env.DB || !env.SIMPLEFACTURA_TOKEN) return 0;
  await boletaTabla(env.DB);
  const l = (await env.DB.prepare("SELECT * FROM boletas WHERE estado != 'emitida' AND intentos < 10 ORDER BY creada_ms LIMIT 5").all()).results;
  for (const b of l) { const r = await sfBoleta(env, b); await env.DB.prepare('UPDATE boletas SET estado = ?, folio = ?, error = ?, intentos = intentos + 1 WHERE pago = ?').bind(r.folio ? 'emitida' : 'error', r.folio || null, r.error || '', b.pago).run(); }
  return l.length;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fallo = m => json({ ok: false, error: m });
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';');
const html = cuerpo => new Response('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Storm · Pago de prueba</title><style>body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 20px;color:#0b2a3c}.b{display:inline-block;background:#0b2a3c;color:#fff;padding:14px 20px;border-radius:12px;text-decoration:none;border:0;font-size:16px}</style></head><body>' + cuerpo + '</body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

const MOTIVOS = {
  cc_rejected_insufficient_amount: 'La tarjeta no tiene saldo o cupo suficiente.',
  insufficient_amount: 'La tarjeta no tiene saldo o cupo suficiente.',
  cc_rejected_bad_filled_security_code: 'Revisa el código de seguridad de la tarjeta.',
  bad_filled_security_code: 'Revisa el código de seguridad de la tarjeta.',
  cc_rejected_bad_filled_date: 'Revisa la fecha de vencimiento de la tarjeta.',
  bad_filled_date: 'Revisa la fecha de vencimiento de la tarjeta.',
  cc_rejected_bad_filled_card_number: 'Revisa el número de la tarjeta.',
  bad_filled_card_number: 'Revisa el número de la tarjeta.',
  cc_rejected_call_for_authorize: 'Tu banco pide autorizar este pago. Llama a tu banco o prueba con otra tarjeta.',
  call_for_authorize: 'Tu banco pide autorizar este pago. Llama a tu banco o prueba con otra tarjeta.',
  cc_rejected_card_disabled: 'La tarjeta no está activa. Prueba con otra tarjeta.',
  card_disabled: 'La tarjeta no está activa. Prueba con otra tarjeta.',
  cc_rejected_duplicated_payment: 'Ya hiciste un pago igual hace un momento. Revisa tu correo antes de pagar de nuevo.',
  duplicated_payment: 'Ya hiciste un pago igual hace un momento. Revisa tu correo antes de pagar de nuevo.',
  cc_rejected_high_risk: 'Mercado Pago no aprobó este pago. Prueba con otra tarjeta o paga con tu cuenta Mercado Pago.',
  high_risk: 'Mercado Pago no aprobó este pago. Prueba con otra tarjeta o paga con tu cuenta Mercado Pago.',
  invalid_card_token: 'Hubo un problema con los datos de la tarjeta. Intenta de nuevo.'
};

async function mp(env, path, opt = {}) {
  let code = 0, body = null;
  try {
    const r = await fetch((env.MP_API || MP_API) + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + env.MP_TOKEN, 'Content-Type': 'application/json' }, opt.headers || {}) }));
    code = r.status; body = await r.json().catch(() => null);
  } catch (_) {}
  return { code, body };
}

/** La orden original, solo si es de Storm (referencia conocida). */
async function leerOrden(env, id, url) {
  if (!/^ORD[A-Z0-9]{10,40}$/.test(String(id || ''))) return null;
  const { code, body } = await mp(env, '/v1/orders/' + encodeURIComponent(id));
  if (code !== 200 || !body || !REF_OK.test(String(body.external_reference || ''))) return null;
  if (/^PRUEBA-/.test(body.external_reference) && !/\.storm-app\.pages\.dev$/.test(url.hostname)) return null;
  // Reservas: solo mientras el horario sigue guardado para esa persona
  if (/^ES-/.test(body.external_reference) && body.status === 'created' && env.DB) {
    const r = await env.DB.prepare('SELECT estado FROM reservas WHERE ref = ?').bind(body.external_reference).first();
    if (!r || r.estado !== 'pendiente') body.status = r && r.estado === 'pagada' ? 'processed' : 'expired';
  }
  // Link de pago de la Tienda: solo mientras sigue esperando pago
  if (/^LK-/.test(body.external_reference) && body.status === 'created' && env.DB) {
    const L = await env.DB.prepare('SELECT estado FROM links WHERE ref = ?').bind(body.external_reference).first().catch(() => null);
    if (!L || L.estado !== 'pendiente') body.status = L && L.estado === 'pagada' ? 'processed' : 'expired';
  }
  return body;
}

/** Avisa al programa que corresponde, igual que el aviso de Mercado Pago. Ese programa vuelve a leer la orden en Mercado Pago. */
async function avisar(env, ref, id, origen) {
  if (/^PRUEBA-/.test(ref)) return;
  const body = JSON.stringify({ type: 'order', action: 'order.processed', data: { id } });
  if (/^LK-/.test(ref)) { // link de pago de la Tienda: se guarda el número de orden nuevo y se revisa en /api/reservas
    if (env.DB) await env.DB.prepare("UPDATE links SET orden_mp = ? WHERE ref = ? AND estado = 'pendiente'").bind(String(id), ref).run();
    try { await fetch(origen + '/api/reservas?mp=1&data.id=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); } catch (_) {}
    return;
  }
  const url = /^ES-/.test(ref) ? null : (/^AV-/.test(ref) ? VERANO : ANUAL) + '?mp=1&type=order&data.id=' + encodeURIComponent(id);
  if (/^ES-/.test(ref)) {
    // Reservas: la reserva guarda el número de orden; se cambia por el nuevo y se revisa.
    if (env.DB) await env.DB.prepare("UPDATE reservas SET orden_mp = ? WHERE ref = ? AND estado IN ('pendiente', 'vencida')").bind(String(id), ref).run();
    try { await fetch(origen + '/api/reservas?mp=1&data.id=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); } catch (_) {}
    return;
  }
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'manual' }); } catch (_) {}
}

// ---------- Flow ----------
const flowListo = env => !!(env.FLOW_API_KEY && env.FLOW_SECRET);
async function hmacHex(clave, txt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(txt)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function flow(env, ruta, p, post) {
  p = Object.assign({ apiKey: env.FLOW_API_KEY }, p);
  const s = await hmacHex(env.FLOW_SECRET, Object.keys(p).sort().map(k => k + p[k]).join(''));
  const q = new URLSearchParams(Object.assign({}, p, { s })), u = (env.FLOW_API || FLOW_API) + ruta;
  try {
    const x = post ? await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q.toString() }) : await fetch(u + '?' + q.toString());
    const o = await x.json().catch(() => null);
    if (!x.ok) console.error('Flow', ruta, x.status, JSON.stringify(o));
    return x.ok ? o : null;
  } catch (e) { console.error(e); return null; }
}
const opcional = st => { try { return JSON.parse(st.optional || '{}') || {}; } catch (_) { return {}; } };

// ---------- Webpay Plus ----------
const webpayCfg = env => env.WEBPAY_CODIGO && env.WEBPAY_LLAVE ? { api: env.WEBPAY_API || WEBPAY_PROD, codigo: env.WEBPAY_CODIGO, llave: env.WEBPAY_LLAVE }
  : env.WEBPAY_PRUEBA ? { api: WEBPAY_INT, codigo: WEBPAY_INT_CODIGO, llave: WEBPAY_INT_LLAVE } : null;
async function webpay(env, metodo, ruta, body) {
  const c = webpayCfg(env);
  try {
    const x = await fetch(c.api + '/rswebpaytransaction/api/webpay/v1.2/transactions' + ruta, { method: metodo, headers: { 'Tbk-Api-Key-Id': c.codigo, 'Tbk-Api-Key-Secret': c.llave, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const o = await x.json().catch(() => null);
    if (!x.ok) console.error('Webpay', metodo, ruta, x.status, JSON.stringify(o));
    return x.ok ? o : null;
  } catch (e) { console.error(e); return null; }
}

/** Pago hecho fuera de Mercado Pago (Flow o Webpay): avisa al programa que corresponde. id = 'flow:<n>' o 'webpay:<token>'. */
async function avisarExterno(env, ref, id, monto, origen, token, tipo) {
  if (/^PRUEBA-/.test(ref)) return;
  if (/^(ES|LK)-/.test(ref)) {
    try { await fetch(origen + '/api/reservas?externo=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, token }) }); } catch (_) {}
    return;
  }
  if (!env.CLAVE_WEB) return;
  const ts = String(Math.floor(Date.now() / 1000)); monto = String(Math.round(Number(monto)));
  // tipo (Webpay): 'debito' o 'credito', para la comisión en Finanzas (débito/prepago 1,49% + IVA, crédito 2,29% + IVA)
  const firma = await hmacHex(env.CLAVE_WEB, 'flow|' + ref + '|' + id + '|' + monto + '|' + ts + (tipo ? '|' + tipo : ''));
  try { await fetch(/^AV-/.test(ref) ? VERANO : ANUAL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ accion: 'pago-flow', ref, id, monto, ts, firma }, tipo ? { tipo } : {})), redirect: 'follow' }); } catch (_) {}
}

/** Revisa el cobro en Flow (estado 2 = pagado) y, si está pagado, avisa al programa que corresponde. Devuelve { st, o, pagado }. */
async function revisarFlow(env, token, origen) {
  const st = await flow(env, '/payment/getStatus', { token: String(token || '') });
  if (!st) return {};
  const op = opcional(st), o = op.o ? (await mp(env, '/v1/orders/' + encodeURIComponent(op.o))).body : null;
  const ref = o && o.external_reference;
  if (Number(st.status) !== 2 || !ref || !REF_OK.test(ref) || String(st.commerceOrder).indexOf(ref) !== 0) return { st, o, pagado: false };
  if (Math.round(Number(st.amount)) < Math.round(Number(o.total_amount))) { console.error('Flow monto distinto', ref, st.amount, o.total_amount); return { st, o, pagado: false }; }
  await avisarExterno(env, ref, 'flow:' + st.flowOrder, st.amount, origen, token);
  return { st, o, pagado: true };
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  // Vista previa (*.storm-app.pages.dev) sin llaves de Transbank: Webpay en modo prueba (datos públicos de prueba, no cobra de verdad)
  // Vista previa también: boletas en el ambiente de pruebas de SimpleFactura, sin esperar el 1-12
  const env = /\.storm-app\.pages\.dev$/.test(url.hostname) ? Object.assign({}, context.env, context.env.WEBPAY_CODIGO ? {} : { WEBPAY_PRUEBA: '1' }, { BOLETA_PRUEBA: '1', SF_AMBIENTE: '0' }) : context.env;
  if (!env.MP_TOKEN) return fallo('El pago en línea no está activo en este momento. Escríbenos por WhatsApp.');

  const origen = /(^|\.)storm-app\.pages\.dev$/.test(url.hostname) ? url.origin : 'https://app.stormsurf.cl';

  // Webpay: la persona vuelve de Transbank. token_ws = terminó de pagar (se confirma con commit); TBK_TOKEN = anuló; solo TBK_ORDEN_COMPRA = se le acabó el tiempo.
  if (url.searchParams.get('webpay') && webpayCfg(env)) {
    let q = url.searchParams;
    if (request.method === 'POST') try { q = new URLSearchParams([...q, ...(await request.formData())]); } catch (_) {}
    const tok = q.get('token_ws') || '', oid = q.get('o') || '';
    // Producto de prueba $50: cualquier resultado se muestra aquí mismo, con el detalle (para Transbank)
    if (q.get('p50') && (!tok || q.get('TBK_TOKEN'))) return html('<h1>Pago de prueba no realizado</h1><p>' + (q.get('TBK_TOKEN') ? 'El pago se anuló en Webpay (o hubo un error en el formulario).' : 'Se acabó el tiempo en Webpay o no llegó el pago.') + '</p><p>Orden: ' + esc(q.get('TBK_ORDEN_COMPRA')) + '<br>Token: ' + esc(q.get('TBK_TOKEN') || tok) + '</p><p><a class="b" href="/api/pagar?prueba50=1">Intentar de nuevo</a></p>');
    const vuelve = est => Response.redirect(origen + '/pagar/?o=' + encodeURIComponent(oid) + '&flow=' + est, 303);
    // Error en el formulario + "intentar nuevamente": llegan token_ws y TBK_TOKEN juntos → no se confirma (igual que una anulación)
    if (!tok || q.get('TBK_TOKEN')) return /\.storm-app\.pages\.dev$/.test(url.hostname) && q.get('TBK_TOKEN') ? Response.redirect(origen + '/pagar/?o=' + encodeURIComponent(oid) + '&flow=error&tk=' + encodeURIComponent(q.get('TBK_TOKEN')), 303) : vuelve('error');
    let c = await webpay(env, 'PUT', '/' + encodeURIComponent(tok));
    if (!c) c = await webpay(env, 'GET', '/' + encodeURIComponent(tok)); // si ya se había confirmado (recargó la página)
    const p50 = !!(q.get('p50') || (c && /^PRUEBA50-/.test(String(c.session_id || '')))); // producto de prueba $50 que pide Transbank
    const o = c && c.session_id && !p50 ? (await mp(env, '/v1/orders/' + encodeURIComponent(c.session_id))).body : null;
    const ref = o && o.external_reference;
    const ok = c && c.status === 'AUTHORIZED' && Number(c.response_code) === 0 && (p50 ? Math.round(Number(c.amount)) === 50 : ref && REF_OK.test(ref) && Math.round(Number(c.amount)) >= Math.round(Number(o.total_amount)));
    if (p50 && !ok) return html('<h1>Pago de prueba no aprobado</h1><p>' + (c ? 'Estado: ' + esc(c.status) + ' · código ' + esc(c.response_code) + ' · monto ' + esc(c.amount) : 'Transbank no respondió al confirmar: ' + esc(ultimoError)) + '</p><p>Token: ' + esc(tok) + '</p><p><a href="/api/pagar?prueba50=1">Intentar de nuevo</a></p>');
    if (!ok) { console.log('webpay no aprobado', c && c.status, c && c.response_code); return /\.storm-app\.pages\.dev$/.test(url.hostname) ? Response.redirect(origen + '/pagar/?o=' + encodeURIComponent(oid) + '&flow=error&tk=' + encodeURIComponent(tok), 303) : vuelve('error'); }
    if (!p50) await avisarExterno(env, ref, 'webpay:' + tok, c.amount, origen, tok, ['VD', 'VP'].includes(c.payment_type_code) ? 'debito' : 'credito');
    const bo = p50 ? null : await Promise.race([emitirBoleta(env, 'webpay:' + tok, ref, c.amount, hoyChile()).catch(() => null), new Promise(r => setTimeout(() => r(null), 8000))]);
    // Comprobante (lo pide Transbank): se muestra en /pagar y desde ahí sigue a la página de siempre
    const cp = new URLSearchParams({ o: oid, comprobante: '1', oc: c.buy_order || '', m: String(Math.round(Number(c.amount))), ac: c.authorization_code || '', d: (c.card_detail || {}).card_number || '',
      f: c.transaction_date || '', t: c.payment_type_code || '', n: String(c.installments_number || 0) });
    if (bo && bo.folio) { cp.set('bo', String(bo.folio)); cp.set('bk', tok); } // boleta exenta: la familia la ve y descarga en su comprobante
    if (p50 || /\.storm-app\.pages\.dev$/.test(url.hostname)) cp.set('tk', tok); // vista previa: token visible para la validación de Transbank
    return Response.redirect(origen + '/pagar/?' + cp.toString(), 303);
  }

  // Flow avisa el pago (POST con token) y devuelve al cliente (?flow=vuelta, POST o GET con token)
  const fl = url.searchParams.get('flow');
  if (fl && flowListo(env)) {
    let token = url.searchParams.get('token') || '';
    if (request.method === 'POST') try { const f = await request.formData(); token = String(f.get('token') || token); } catch (_) {}
    const r = token ? await revisarFlow(env, token, origen) : {};
    if (fl !== 'vuelta') return json({ ok: true });
    const o = r.o || {}, online = (o.config && o.config.online) || {}, oid = url.searchParams.get('o') || o.id || '';
    if (r.pagado) return Response.redirect(/^PRUEBA-/.test(o.external_reference || '') ? origen + '/pagar/?listo=1' : (online.success_url || origen + '/'), 303);
    const pend = r.st && Number(r.st.status) === 1;
    return Response.redirect(origen + '/pagar/?o=' + encodeURIComponent(oid) + '&flow=' + (pend ? 'pendiente' : 'error'), 303);
  }

  // Vista previa: prueba de boleta exenta en SimpleFactura (ambiente de pruebas). /api/pagar?sfprueba=1
  if (request.method === 'GET' && url.searchParams.get('sfprueba') && /\.storm-app\.pages\.dev$/.test(url.hostname)) {
    if (!env.SIMPLEFACTURA_TOKEN) return json({ ok: false, error: 'Falta SIMPLEFACTURA_TOKEN' });
    const h = { Authorization: 'Bearer ' + env.SIMPLEFACTURA_TOKEN, 'Content-Type': 'application/json' }, out = {};
    for (const amb of [0, 1]) { try { const x = await fetch(SF_API + '/folios/consultar', { method: 'POST', headers: h, body: JSON.stringify({ credenciales: { rutEmisor: EMISOR.RUTEmisor, nombreSucursal: 'Casa Matriz' }, ambiente: amb }) }); out['folios' + amb] = x.status + ' ' + (await x.text()).slice(0, 800); } catch (e) { out['folios' + amb] = String(e); } }
    if (url.searchParams.get('pdf')) { const pdf = await boletaPdf(env, url.searchParams.get('pdf')); return pdf ? new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } }) : json({ ok: false, error: 'sin PDF' }); }
    if (url.searchParams.get('emitir')) { const k = 'PRUEBA' + Date.now(); out.boleta = await emitirBoleta(env, 'webpay:' + k, 'PRUEBA-' + k, Number(url.searchParams.get('monto')) || 1000, hoyChile()); out.recibo = '/pagar/?comprobante=1&o=&oc=O' + k + '&m=' + (Number(url.searchParams.get('monto')) || 1000) + '&ac=123456&d=6623&t=VD&bo=' + ((out.boleta && out.boleta.folio) || '') + '&bk=' + k; }
    return json(out);
  }
  if (request.method === 'GET' && url.searchParams.get('boleta') && env.DB) {
    await boletaTabla(env.DB);
    const b = await env.DB.prepare("SELECT * FROM boletas WHERE pago = ? AND estado = 'emitida'").bind('webpay:' + url.searchParams.get('boleta')).first();
    const pdf = b && await boletaPdf(env, b.folio).catch(() => null);
    if (!pdf) return html('<h1>Boleta no disponible</h1><p>Intenta de nuevo en unos minutos.</p>');
    return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Boleta Storm ' + b.folio + '.pdf"', 'Cache-Control': 'private, no-store' } });
  }
  if (request.method === 'GET' && url.searchParams.get('comprobante') && env.DB) {
    await compTabla(env.DB);
    const c = await env.DB.prepare('SELECT * FROM comprobantes WHERE clave = ?').bind(String(url.searchParams.get('comprobante'))).first();
    if (!c) return html('<h1>Comprobante no encontrado</h1>');
    const bin = Uint8Array.from(atob(c.datos), ch => ch.charCodeAt(0));
    return new Response(bin, { headers: { 'Content-Type': c.tipo, 'Content-Disposition': 'inline; filename="' + (c.ref + (c.tipo === 'application/pdf' ? '.pdf' : '.jpg')) + '"', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } });
  }
  if (request.method === 'GET') {
    // Producto de prueba de $50 (lo pide Transbank para pasar a producción): /api/pagar?prueba50=1
    if (url.searchParams.get('prueba50') && webpayCfg(env)) {
      if (!url.searchParams.get('ir')) return html('<h1>Producto de prueba Storm</h1><p>Pago de prueba de <b>$50</b> con Webpay (Transbank), para validar el medio de pago.</p><p><a class="b" href="/api/pagar?prueba50=1&ir=1">Pagar $50 con Webpay</a></p>');
      const c = await webpay(env, 'POST', '', { buy_order: 'P' + Date.now().toString(36).toUpperCase(), session_id: 'PRUEBA50-' + Date.now(), amount: 50, return_url: origen + '/api/pagar?webpay=vuelta&p50=1&o=' });
      if (!c || !c.url || !c.token) return html('<h1>No pudimos conectar con Webpay</h1><p>Intenta de nuevo en un momento.</p>');
      return html('<p>Te llevamos a Webpay…</p><form id="f" method="POST" action="' + esc(c.url) + '"><input type="hidden" name="token_ws" value="' + esc(c.token) + '"><button class="b">Continuar</button></form><script>document.getElementById("f").submit()</script>');
    }
    // Vista previa: cobro de prueba de $1.000 para probar la tarjeta de verdad (después se devuelve en Mercado Pago)
    if (url.searchParams.get('prueba') && /\.storm-app\.pages\.dev$/.test(url.hostname)) {
      const ref = 'PRUEBA-' + Date.now(), vuelta = url.origin + '/pagar/?listo=1';
      const { body } = await mp(env, '/v1/orders', { method: 'POST', headers: { 'X-Idempotency-Key': ref }, body: JSON.stringify({ type: 'online', processing_mode: 'manual', total_amount: '1000', external_reference: ref, description: 'Prueba Storm', items: [{ title: 'Prueba de pago Storm', quantity: 1, unit_price: '1000' }], config: { online: { success_url: vuelta, failure_url: vuelta, auto_return: 'approved' }, payment_method: { max_installments: 1 } } }) });
      return Response.redirect(url.origin + '/pagar/?o=' + encodeURIComponent((body && body.id) || ''), 302);
    }
    const o = await leerOrden(env, url.searchParams.get('o'), url);
    if (!o) return fallo('No encontramos este pago. Vuelve atrás e intenta de nuevo.');
    const online = (o.config && o.config.online) || {};
    const it = (o.items || [])[0] || {};
    // Link de pago de la Tienda: el cliente ve el detalle de lo que paga (cada producto, renta y clase con su precio)
    let carro = null;
    if (/^LK-/.test(String(o.external_reference || '')) && env.DB) {
      const L = await env.DB.prepare('SELECT nombre, partes FROM links WHERE ref = ?').bind(o.external_reference).first().catch(() => null);
      let ps = []; try { ps = JSON.parse((L && L.partes) || '[]'); } catch (_) {}
      const ver = p => p.cliente || (p.tipo === 'renta' ? 'Arriendo de equipo' : p.tipo === 'clase' ? 'Clase de surf' : p.detalle);
      if (ps.length) carro = { nombre: String((L && L.nombre) || '').split(' ')[0], items: ps.map(p => ({ t: ver(p), m: Number(p.monto) || 0 })) };
    }
    const tr = soloTransferencia(o.external_reference);
    let subido = false;
    if (tr && env.DB) { await compTabla(env.DB); subido = !!(await env.DB.prepare('SELECT clave FROM comprobantes WHERE orden = ?').bind(o.id).first()); }
    return json({ carro, transferencia: tr ? BANCO : null, subido,
      ok: true, estado: o.status, monto: Number(o.total_amount), titulo: it.title || o.description || 'Pago Storm',
      cuenta: o.checkout_url || '', vuelta: online.success_url || '', volver: online.failure_url || '',
      publicKey: env.MP_PUBLIC_KEY || PUBLIC_KEY, flow: flowListo(env) || !!webpayCfg(env), webpay: !!webpayCfg(env)
    });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
  let d = {};
  try { d = await request.json(); } catch (_) {}
  const o = await leerOrden(env, d.o, url);
  if (!o) return fallo('No encontramos este pago. Vuelve atrás e intenta de nuevo.');
  if (o.status !== 'created') return fallo(o.status === 'processed' ? 'Este pago ya está hecho.' : 'Este pago ya no está disponible. Vuelve atrás e intenta de nuevo.');
  if (d.comprobante) {
    const ref = String(o.external_reference || ''), c = d.comprobante;
    if (!soloTransferencia(ref) || !env.DB) return fallo('Este pago se hace con tarjeta.');
    const tipo = String(c.tipo || ''), datos = String(c.datos || '');
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(tipo) || !/^[A-Za-z0-9+/=]+$/.test(datos)) return fallo('Sube una foto o un PDF del comprobante.');
    if (datos.length > MAX_COMPROBANTE) return fallo('El archivo es muy grande. Sube una foto o captura de pantalla.');
    await compTabla(env.DB);
    const ya = await env.DB.prepare('SELECT clave FROM comprobantes WHERE orden = ?').bind(o.id).first();
    if (!ya) {
      const clave = Array.from(crypto.getRandomValues(new Uint8Array(15)), b => b.toString(16).padStart(2, '0')).join('');
      const monto = Math.round(Number(o.total_amount));
      await env.DB.prepare('INSERT INTO comprobantes (clave, orden, ref, monto, archivo, tipo, datos, creada_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(clave, o.id, ref, monto, String(c.nombre || '').slice(0, 120), tipo, datos, Date.now()).run();
      await avisarExterno(env, ref, 'transferencia:' + clave, monto, origen);
    }
    const online = (o.config && o.config.online) || {};
    return json({ ok: true, vuelta: online.success_url || '' });
  }
  if (d.flow && webpayCfg(env)) {
    const ref = o.external_reference;
    const c = await webpay(env, 'POST', '', { buy_order: 'S' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(), session_id: o.id, amount: Math.round(Number(o.total_amount)), return_url: origen + '/api/pagar?webpay=vuelta&o=' + encodeURIComponent(o.id) });
    if (!c || !c.url || !c.token) return fallo('No pudimos conectar con Webpay. Intenta de nuevo en un momento.');
    if (/^ES-/.test(ref) && env.DB) await env.DB.prepare("UPDATE reservas SET orden_mp = ?, medio = 'Webpay' WHERE ref = ? AND estado IN ('pendiente', 'vencida')").bind('webpay:' + c.token, ref).run();
    if (/^LK-/.test(ref) && env.DB) await env.DB.prepare("UPDATE links SET orden_mp = ? WHERE ref = ? AND estado = 'pendiente'").bind('webpay:' + c.token, ref).run();
    return json({ ok: true, url: c.url, token_ws: c.token }); // la página manda el token por POST (como pide Transbank)
  }
  if (d.flow) {
    if (!flowListo(env)) return fallo('Este medio de pago no está disponible. Escríbenos por WhatsApp.');
    const correo = String(d.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return fallo('Revisa tu correo. / Please check your email.');
    const ref = o.external_reference, it = (o.items || [])[0] || {};
    const c = await flow(env, '/payment/create', {
      commerceOrder: (ref + '-F' + Date.now().toString(36)).slice(0, 45), subject: String(it.title || o.description || 'Pago Storm').slice(0, 250),
      currency: 'CLP', amount: String(Math.round(Number(o.total_amount))), email: correo, paymentMethod: '9',
      urlConfirmation: origen + '/api/pagar?flow=1', urlReturn: origen + '/api/pagar?flow=vuelta&o=' + encodeURIComponent(o.id),
      optional: JSON.stringify({ o: o.id }), timeout: '3600'
    }, true);
    if (!c || !c.url || !c.token) return fallo('No pudimos conectar con Flow. Intenta de nuevo en un momento.');
    if (/^ES-/.test(ref) && env.DB) await env.DB.prepare("UPDATE reservas SET orden_mp = ?, medio = 'Flow' WHERE ref = ? AND estado IN ('pendiente', 'vencida')").bind('flow:' + c.token, ref).run();
    if (/^LK-/.test(ref) && env.DB) await env.DB.prepare("UPDATE links SET orden_mp = ? WHERE ref = ? AND estado = 'pendiente'").bind('flow:' + c.token, ref).run();
    return json({ ok: true, url: c.url + '?token=' + c.token });
  }
  const token = String(d.token || ''), metodo = String(d.payment_method_id || ''), tipo = d.payment_type === 'debit_card' ? 'debit_card' : (d.payment_type === 'prepaid_card' ? 'prepaid_card' : 'credit_card');
  const correo = String(d.email || '').trim().toLowerCase();
  if (token.length < 32 || !metodo) return fallo('Revisa los datos de la tarjeta.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return fallo('Revisa tu correo.');

  const ref = o.external_reference;
  const orden = {
    type: 'online', processing_mode: 'automatic', total_amount: String(o.total_amount), external_reference: ref,
    description: o.description || 'Pago Storm', payer: Object.assign({ email: correo }, d.identification && d.identification.number ? { identification: { type: String(d.identification.type || ''), number: String(d.identification.number) } } : {}),
    items: (o.items || []).map(i => ({ title: i.title, quantity: i.quantity || 1, unit_price: String(i.unit_price) })),
    transactions: { payments: [{ amount: String(o.total_amount), payment_method: { id: metodo, type: tipo, token, installments: 1 } }] }
  };
  const { code, body } = await mp(env, '/v1/orders', { method: 'POST', headers: { 'X-Idempotency-Key': 'tarjeta-' + token.slice(0, 60) }, body: JSON.stringify(orden) });
  const n = (body && body.data) || body || {};
  const pago = ((n.transactions || {}).payments || [])[0] || {};
  if (code < 300 && n.status === 'processed' && n.status_detail === 'accredited') {
    const origen = /(^|\.)storm-app\.pages\.dev$/.test(url.hostname) ? url.origin : 'https://app.stormsurf.cl';
    await avisar(env, ref, n.id, origen); // antes de volver, para que al llegar ya salga pagado
    const online = (o.config && o.config.online) || {};
    return json({ ok: true, vuelta: online.success_url || '' });
  }
  const motivo = pago.status_detail || n.status_detail || ((body && body.errors && body.errors[0] && body.errors[0].details) || []).join(' ');
  const clave = Object.keys(MOTIVOS).find(k => String(motivo).indexOf(k) >= 0);
  console.log('pagar rechazado', ref, code, n.status, motivo);
  return fallo(clave ? MOTIVOS[clave] : 'La tarjeta fue rechazada. Prueba con otra tarjeta o paga con tu cuenta Mercado Pago.');
}
