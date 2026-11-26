/**
 * STORM · Autorización y exención de responsabilidad de Academia Anual y Academia de Verano (Cloudflare D1, tabla "autorizaciones").
 *
 * Por qué: la Armada pide ver que el apoderado de cada niño firmó la autorización. Al tocar un alumno en el Panel se ve
 * quién la aceptó o firmó y cuándo, y se abre el documento. Si falta, el Panel manda un link para firmarla con el dedo.
 *
 * Una fila por alumno y por forma de aceptarla:
 *   como 'web'     → marcó la casilla al inscribirse y pagar en la web de Storm (pestaña Pagos de la planilla, ref AA- / AV-)
 *   como 'shopify' → marcó la casilla en el checkout de Shopify (pedidos #5101xx de Verano, antes de Mercado Pago)
 *   como 'firma'   → la aceptó (casilla + nombre y RUT) en app.stormsurf.cl/autorizacion, link que manda Storm desde el Panel
 *
 * Recibir de la planilla (Apps Script): { tipo:'subir', ts, firma, filas:[{academia, alumno, apoderado, rut, correo, fecha, ref}] }
 *   firma = HMAC(CLAVE_WEB, 'autorizacion|' + ts)
 * Panel (misma sesión del Panel: correo + firma CLAVE_WEB):
 *   { accion:'lista' }                    → todas, sin la imagen de la firma
 *   { accion:'doc', id }                  → una, con la imagen de la firma (para ver o imprimir el documento)
 *   { accion:'link', academia, alumno }   → link para que el apoderado la firme (solo administradores)
 * Público (link del apoderado):
 *   { accion:'ver', a, n, k }             → nombre del alumno y si ya está firmada
 *   { accion:'firmar', a, n, k, apoderado, rut, acepta, firma }
 */
const SESION_DIAS = 365;
const ADMINS = ['isidoravergara@gmail.com', 'contacto@stormsurf.cl'];
const ACADEMIAS = ['anual', 'verano'];
const norm = s => String(s == null ? '' : s).trim().toLowerCase();
const llave = s => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const MINUS = ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'van', 'von'];
const nombrePropio = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().split(' ')
  .map((w, i) => i && MINUS.includes(w) ? w : w.replace(/(^|[-'])(\p{L})/gu, (m, a, c) => a + c.toUpperCase())).join(' ');
const t = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);

async function hmac(clave, texto) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto));
  return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function tabla(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS autorizaciones (id TEXT PRIMARY KEY, academia TEXT NOT NULL, alumno TEXT NOT NULL, apoderado TEXT NOT NULL DEFAULT '', rut TEXT NOT NULL DEFAULT '', correo TEXT NOT NULL DEFAULT '', fecha TEXT NOT NULL, como TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', firma TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', creada_ms INTEGER NOT NULL)").run();
}
const ahoraChile = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute;
};
// Clave del link para firmar: no se puede adivinar sin CLAVE_WEB, y sirve solo para ese alumno de esa academia.
const claveLink = async (env, a, n) => (await hmac(env.CLAVE_WEB, 'aut|' + a + '|' + llave(n))).slice(0, 24);

async function sesion(env, d) {
  const edad = Date.now() / 1000 - Number(d.ts);
  if (!d.email || !(edad < SESION_DIAS * 86400 && edad > -600) || await hmac(env.CLAVE_WEB, norm(d.email) + '|' + d.ts) !== String(d.firma || '').toLowerCase())
    throw new Error('Tu sesión expiró. Vuelve a entrar.');
  const email = norm(d.email);
  if (ADMINS.includes(email)) return 'admin';
  // Los roles del equipo vienen en la copia rápida de la planilla Anual (pestaña Equipo).
  const fila = await env.DB.prepare('SELECT datos FROM espejo WHERE clave = ?').bind('anual').first().catch(() => null);
  const rol = fila ? (JSON.parse(fila.datos).roles || {})[email] || '' : '';
  if (!rol) throw new Error('Sin acceso');
  return rol;
}

export async function onRequestPost({ request, env }) {
  let d = {};
  try { d = await request.json(); } catch (_) { return json({ ok: false, error: 'Datos inválidos' }, 400); }
  if (!env.CLAVE_WEB || !env.DB) return json({ ok: false, error: 'Sin configurar' }, 503);
  const db = env.DB;
  try {
    await tabla(db);
    if (d.tipo === 'subir') {
      const edad = Date.now() / 1000 - Number(d.ts);
      if (!(edad < 900 && edad > -600) || await hmac(env.CLAVE_WEB, 'autorizacion|' + d.ts) !== String(d.firma || '').toLowerCase()) return json({ ok: false, error: 'Firma' }, 403);
      const filas = (Array.isArray(d.filas) ? d.filas : []).slice(0, 2000)
        .map(f => ({ academia: norm(f.academia), alumno: nombrePropio(t(f.alumno)), apoderado: nombrePropio(t(f.apoderado)), rut: t(f.rut, 20), correo: norm(t(f.correo)), fecha: t(f.fecha, 16), ref: t(f.ref, 40), como: f.como === 'shopify' ? 'shopify' : 'web' }))
        .filter(f => ACADEMIAS.includes(f.academia) && f.alumno.length > 1 && /^\d{4}-\d{2}-\d{2}/.test(f.fecha) && f.ref);
      const st = filas.map(f => db.prepare("INSERT INTO autorizaciones (id, academia, alumno, apoderado, rut, correo, fecha, como, ref, creada_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET alumno = excluded.alumno, apoderado = excluded.apoderado, rut = CASE WHEN excluded.rut <> '' THEN excluded.rut ELSE autorizaciones.rut END, correo = excluded.correo, fecha = excluded.fecha")
        .bind(f.academia + '|' + f.ref + '|' + llave(f.alumno), f.academia, f.alumno, f.apoderado, f.rut, f.correo, f.fecha, f.como, f.ref, Date.now()));
      for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
      return json({ ok: true, filas: filas.length });
    }

    // ---- Link del apoderado ----
    if (d.accion === 'ver' || d.accion === 'firmar') {
      const a = norm(d.a), n = nombrePropio(t(d.n, 80));
      if (!ACADEMIAS.includes(a) || n.length < 2 || String(d.k || '') !== await claveLink(env, a, n)) return json({ ok: false, error: 'Este link no es válido. Escríbenos por WhatsApp.' });
      const ya = await db.prepare("SELECT apoderado, fecha FROM autorizaciones WHERE academia = ? AND como = 'firma' AND id LIKE ? ORDER BY fecha DESC LIMIT 1").bind(a, a + '|firma|' + llave(n) + '|%').first();
      if (d.accion === 'ver') return json({ ok: true, academia: a, alumno: n, firmada: ya ? { apoderado: ya.apoderado, fecha: ya.fecha } : null });
      const apoderado = nombrePropio(t(d.apoderado, 80)), rut = t(d.rut, 20), firma = String(d.firma || '');
      if (apoderado.length < 3) throw new Error('Falta tu nombre y apellido.');
      if (!/^[0-9kK.\- ]{7,14}$/.test(rut)) throw new Error('Revisa tu RUT.');
      if (!d.acepta) throw new Error('Marca que leíste y aceptas.');
      // Basta con la casilla (Isidora 26-11): la firma con el dedo es opcional y hoy la página no la pide.
      if (firma && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(firma) || firma.length > 400000)) throw new Error('Firma no válida.');
      const fecha = ahoraChile();
      await db.prepare('INSERT INTO autorizaciones (id, academia, alumno, apoderado, rut, correo, fecha, como, ref, firma, ip, creada_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(a + '|firma|' + llave(n) + '|' + Date.now(), a, n, apoderado, rut, '', fecha, 'firma', '', firma, request.headers.get('CF-Connecting-IP') || '', Date.now()).run();
      return json({ ok: true, academia: a, alumno: n, firmada: { apoderado, fecha } });
    }

    // ---- Panel ----
    const rol = await sesion(env, d);
    if (d.accion === 'lista') {
      const r = await db.prepare("SELECT id, academia, alumno, apoderado, rut, fecha, como, ref, firma <> '' AS firmada FROM autorizaciones ORDER BY fecha DESC").all();
      return json({ ok: true, autorizaciones: r.results.map(x => Object.assign(x, { firmada: !!x.firmada }, rol === 'admin' ? {} : { rut: '' })) });
    }
    if (d.accion === 'doc') {
      const x = await db.prepare('SELECT id, academia, alumno, apoderado, rut, correo, fecha, como, ref, firma FROM autorizaciones WHERE id = ?').bind(t(d.id, 200)).first();
      if (!x) throw new Error('No encontramos esa autorización.');
      return json({ ok: true, autorizacion: x });
    }
    if (d.accion === 'link') {
      if (rol !== 'admin') throw new Error('Solo administradores.');
      const a = norm(d.academia), n = nombrePropio(t(d.alumno, 80));
      if (!ACADEMIAS.includes(a) || n.length < 2) throw new Error('Alumno no válido.');
      const url = new URL(request.url);
      const base = /(^|\.)storm-app\.pages\.dev$/.test(url.hostname) ? url.origin : 'https://app.stormsurf.cl';
      return json({ ok: true, link: base + '/autorizacion/?a=' + a + '&n=' + encodeURIComponent(n) + '&k=' + await claveLink(env, a, n) });
    }
    return json({ ok: false, error: 'Acción desconocida' });
  } catch (x) {
    return json({ ok: false, error: x.message });
  }
}
