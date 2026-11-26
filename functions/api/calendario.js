/**
 * STORM · Calendario Academia Anual rápido (Cloudflare D1, tabla "espejo", clave "cal-<mes>").
 *
 * Por qué: cada pregunta a la planilla (Apps Script) tarda 2 a 4 segundos, y Mi clase y la página de pago
 * piden varios meses. Aquí se guarda la última respuesta de la planilla y se entrega al tiro; si tiene más
 * de 2 minutos, se vuelve a preguntar a la planilla por detrás para la próxima vez. La planilla sigue siendo
 * la fuente (pestaña Calendario). Son datos públicos (fechas y horarios), sin datos de alumnos.
 *
 * GET o POST /api/calendario?mes=diciembre%202026  →  la misma respuesta de la acción 'calendario' de la planilla.
 */
const API = 'https://script.google.com/macros/s/AKfycbyFZiJBhEoWR3-mekjXfea3O0BbDItazLHQRUkCpWOUZOwJ4612kgiGsg4ocWpGBgO3/exec';
const FRESCO_MS = 2 * 60 * 1000;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS) });

async function planilla(mes) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ accion: 'calendario', mes }) });
  const d = await r.json();
  if (!d || !d.ok) throw new Error((d && d.error) || 'La planilla no respondió');
  return d;
}

async function responder(request, env, ctx) {
  const url = new URL(request.url);
  let mes = url.searchParams.get('mes') || '';
  if (!mes && request.method === 'POST') { try { mes = (JSON.parse(await request.text()) || {}).mes || ''; } catch (_) {} }
  mes = String(mes).trim().toLowerCase();
  if (!/^[a-zéáíóú]{4,12} \d{4}$/.test(mes)) return json({ ok: false, error: 'Mes inválido' }, 400);
  const db = env.DB, clave = 'cal-' + mes.replace(' ', '-');
  let fila = null;
  if (db) {
    try {
      await db.prepare('CREATE TABLE IF NOT EXISTS espejo (clave TEXT PRIMARY KEY, datos TEXT NOT NULL, ms INTEGER NOT NULL)').run();
      fila = await db.prepare('SELECT datos, ms FROM espejo WHERE clave = ?').bind(clave).first();
    } catch (_) {}
  }
  const guardar = async () => {
    const d = await planilla(mes);
    if (db) await db.prepare('INSERT OR REPLACE INTO espejo (clave, datos, ms) VALUES (?, ?, ?)').bind(clave, JSON.stringify(d), Date.now()).run();
    return d;
  };
  if (fila) {
    if (Date.now() - fila.ms > FRESCO_MS) ctx.waitUntil(guardar().catch(() => {}));
    return json(Object.assign(JSON.parse(fila.datos), { ms: fila.ms }));
  }
  try { return json(await guardar()); } catch (x) { return json({ ok: false, error: x.message }, 502); }
}

export const onRequestGet = ({ request, env, waitUntil }) => responder(request, env, { waitUntil });
export const onRequestPost = ({ request, env, waitUntil }) => responder(request, env, { waitUntil });
export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });
