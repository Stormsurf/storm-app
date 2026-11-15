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
 */

const MP_API = 'https://api.mercadopago.com';
const ANUAL = 'https://script.google.com/macros/s/AKfycbyFZiJBhEoWR3-mekjXfea3O0BbDItazLHQRUkCpWOUZOwJ4612kgiGsg4ocWpGBgO3/exec';  // Anual y Adultos
const VERANO = 'https://script.google.com/macros/s/AKfycbzSHDu8whWWNwq-EFwaWqwKOtyU5pnyPuixutUI8sd5twFaTjDibN11TA3bMH_UddTo/exec';
const REF_OK = /^(AA|AD|AV|ES)-[\w-]+$/;

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fallo = m => json({ ok: false, error: m });

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
    const r = await fetch(MP_API + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + env.MP_TOKEN, 'Content-Type': 'application/json' }, opt.headers || {}) }));
    code = r.status; body = await r.json().catch(() => null);
  } catch (_) {}
  return { code, body };
}

/** La orden original, solo si es de Storm (referencia conocida). */
async function leerOrden(env, id) {
  if (!/^ORD[A-Z0-9]{10,40}$/.test(String(id || ''))) return null;
  const { code, body } = await mp(env, '/v1/orders/' + encodeURIComponent(id));
  if (code !== 200 || !body || !REF_OK.test(String(body.external_reference || ''))) return null;
  // Reservas: solo mientras el horario sigue guardado para esa persona
  if (/^ES-/.test(body.external_reference) && body.status === 'created' && env.DB) {
    const r = await env.DB.prepare('SELECT estado FROM reservas WHERE ref = ?').bind(body.external_reference).first();
    if (!r || r.estado !== 'pendiente') body.status = r && r.estado === 'pagada' ? 'processed' : 'expired';
  }
  return body;
}

/** Avisa al programa que corresponde, igual que el aviso de Mercado Pago. Ese programa vuelve a leer la orden en Mercado Pago. */
async function avisar(env, ref, id, origen) {
  const body = JSON.stringify({ type: 'order', action: 'order.processed', data: { id } });
  const url = /^ES-/.test(ref) ? null : (/^AV-/.test(ref) ? VERANO : ANUAL) + '?mp=1&type=order&data.id=' + encodeURIComponent(id);
  if (/^ES-/.test(ref)) {
    // Reservas: la reserva guarda el número de orden; se cambia por el nuevo y se revisa.
    if (env.DB) await env.DB.prepare("UPDATE reservas SET orden_mp = ? WHERE ref = ? AND estado IN ('pendiente', 'vencida')").bind(String(id), ref).run();
    try { await fetch(origen + '/api/reservas?mp=1&data.id=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); } catch (_) {}
    return;
  }
  try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'manual' }); } catch (_) {}
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (!env.MP_TOKEN) return fallo('El pago en línea no está activo en este momento. Escríbenos por WhatsApp.');

  if (request.method === 'GET') {
    const o = await leerOrden(env, url.searchParams.get('o'));
    if (!o) return fallo('No encontramos este pago. Vuelve atrás e intenta de nuevo.');
    const online = (o.config && o.config.online) || {};
    const it = (o.items || [])[0] || {};
    return json({
      ok: true, estado: o.status, monto: Number(o.total_amount), titulo: it.title || o.description || 'Pago Storm',
      cuenta: o.checkout_url || '', vuelta: online.success_url || '', volver: online.failure_url || '',
      publicKey: env.MP_PUBLIC_KEY || ''
    });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
  let d = {};
  try { d = await request.json(); } catch (_) {}
  const o = await leerOrden(env, d.o);
  if (!o) return fallo('No encontramos este pago. Vuelve atrás e intenta de nuevo.');
  if (o.status !== 'created') return fallo(o.status === 'processed' ? 'Este pago ya está hecho.' : 'Este pago ya no está disponible. Vuelve atrás e intenta de nuevo.');
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
