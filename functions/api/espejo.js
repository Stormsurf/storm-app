/**
 * STORM · Espejo rápido de la planilla Anual (Cloudflare D1, tabla "espejo").
 *
 * Por qué: cada pregunta a Google (Apps Script) tarda 2 a 9 segundos. El programa de la planilla Anual
 * manda aquí cada minuto (solo si algo cambió) una copia de lo que muestra el Panel, y la app la lee
 * desde Cloudflare en menos de medio segundo. La planilla sigue siendo la fuente: la app igual le pregunta
 * a Google por detrás y se actualiza si hay algo más nuevo.
 *
 * Recibir copia (desde Apps Script): { tipo:'subir', clave:'anual', ts, firma, datos }  firma = HMAC(CLAVE_WEB, 'espejo|' + ts)
 * Leer (desde la app):              { accion:'panel', email, ts, firma }                 misma sesión del Panel
 */
const SESION_DIAS = 365;
const ADMINS = ['isidoravergara@gmail.com', 'contacto@stormsurf.cl'];
const norm = s => String(s == null ? '' : s).trim().toLowerCase();
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function hmac(clave, texto) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto));
  return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function tabla(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS espejo (clave TEXT PRIMARY KEY, datos TEXT NOT NULL, ms INTEGER NOT NULL)').run();
}

export async function onRequestPost({ request, env }) {
  let d = {};
  try { d = await request.json(); } catch (_) { try { d = JSON.parse(await request.text()); } catch (x) { return json({ ok: false, error: 'Datos inválidos' }, 400); } }
  if (!env.CLAVE_WEB || !env.DB) return json({ ok: false, error: 'Espejo sin configurar' }, 503);
  const db = env.DB;
  try {
    if (d.tipo === 'subir') {
      const edad = Date.now() / 1000 - Number(d.ts);
      if (!(edad < 900 && edad > -600) || await hmac(env.CLAVE_WEB, 'espejo|' + d.ts) !== String(d.firma || '').toLowerCase()) return json({ ok: false, error: 'Firma' }, 403);
      if (!/^[a-z0-9-]{1,40}$/.test(String(d.clave || '')) || !d.datos) return json({ ok: false, error: 'Datos' }, 400);
      await tabla(db);
      await db.prepare('INSERT OR REPLACE INTO espejo (clave, datos, ms) VALUES (?, ?, ?)').bind(d.clave, JSON.stringify(d.datos), Date.now()).run();
      return json({ ok: true });
    }
    // Lectura: misma sesión del Panel (correo + firma CLAVE_WEB).
    const edad = Date.now() / 1000 - Number(d.ts);
    if (!d.email || !(edad < SESION_DIAS * 86400 && edad > -600) || await hmac(env.CLAVE_WEB, norm(d.email) + '|' + d.ts) !== String(d.firma || '').toLowerCase())
      return json({ ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' });
    if (d.accion !== 'panel') return json({ ok: false, error: 'Acción desconocida' });
    await tabla(db);
    const fila = await db.prepare('SELECT datos, ms FROM espejo WHERE clave = ?').bind('anual').first();
    if (!fila) return json({ ok: false, error: 'Sin copia todavía' });
    const A = JSON.parse(fila.datos), email = norm(d.email);
    const rol = ADMINS.includes(email) ? 'admin' : (A.roles || {})[email] || '';
    if (!rol || !A.panel || !A.panel[rol]) return json({ ok: false, error: 'Sin acceso' });
    return json({ ok: true, ms: fila.ms, datos: Object.assign({}, A.panel[rol], { miGrupo: (A.miGrupo || {})[email] || [] }) });
  } catch (x) {
    return json({ ok: false, error: x.message }, 500);
  }
}
