/**
 * STORM · Escuela — reservas de clases particulares
 * Corre en Cloudflare (Pages Functions) con la base de datos D1 "storm-reservas" (binding DB).
 *
 * Público (sin cuenta):  disponibilidad · reservar · estado
 * Agenda Storm (misma sesión del Panel Storm, misma firma CLAVE_WEB): escuela · editar · cancelar · disponible · semana · manual · instructor · ajustes
 * Tarea (cada 5 min, con TAREA_CLAVE): revisa pagos pendientes, libera horarios no pagados y manda recordatorios.
 *
 * Variables/secretos en Cloudflare (Pages > storm-app > Configuración > Variables y secretos):
 *   MP_TOKEN      Access token de Mercado Pago (el mismo de la Academia Anual)
 *   CLAVE_WEB     La misma clave del Panel (CLAVE_WEB de los programas de las academias)
 *   CLAVE_CORREO  Clave del programa de correos de contacto@stormsurf.cl
 *   TAREA_CLAVE   Clave para la revisión automática
 */

const TZ = 'America/Santiago';
const MP_API = 'https://api.mercadopago.com';
let PAGINA = 'https://app.stormsurf.cl/reservar/';
let PANEL = 'https://app.stormsurf.cl/agenda/';
const CORREO_URL = 'https://script.google.com/macros/s/AKfycbzmzD794KtxFxndjERPQ8kneEvRMyBmd7tmcgD7Rvdl6eJv2ZsHDsFBnAvluCQYDOZ7/exec';
const CORREO_STORM = 'isidoravergara@gmail.com';
const MAPA = 'https://maps.app.goo.gl/xcFSTmgfwwKACqfb7';
const TRAER = ['Traje de baño (para usar debajo del wetsuit)', 'Toalla', 'Bloqueador solar', 'Botella con agua', 'Ropa cómoda para después de la clase'];
const WHATSAPP = '56977744306';
const SESION_DIAS = 365;
const BLOQUE = 30; // minutos

const AJUSTES_BASE = {
  precios: { 1: 35000, 2: 60000, 3: 75000, 4: 100000, 5: 100000 },
  pagos: { 1: 15000, 2: 20000, 3: 25000, 4: 25000, 5: 30000, grupo: 25000 }, // pago al instructor por clase
  horarios: ['08:30', '09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00'], // bloques seguidos de 1:30 (08:30 solo domingo en la semana tipo, antes de la Academia de las 10:00)
  duracion: 90,          // minutos
  minHoras: 3,           // anticipación mínima
  horaTarde: '23:59',    // clases antes de esta hora se reservan hasta cierreNoche del día anterior (hoy: todas; en verano se puede bajar a 13:00)
  cierreNoche: '20:00',  // las de la mañana se reservan hasta esta hora del día anterior
  diasAdelante: 60,
  retencionMin: 30,      // minutos que se guarda el horario mientras pagan
  maxWeb: 5,             // más personas = por WhatsApp
  maxSeguidas: 2,
  // Enero y febrero: la Academia de Verano usa lun, mar, jue y vie de 9:00 a 12:00; en ese rato queda 1 instructor para particulares
  // Esos días la primera clase parte 9:30 (no llegar junto con los niños de la Academia): 9:00 → 9:30 y 10:30 → 11:00
  verano: { meses: [1, 2], dias: [1, 2, 4, 5], desde: '09:00', hasta: '12:00', instructores: 1, cambios: { '09:00': '09:30', '10:30': '11:00' } },
  horasLink: 24,         // reservas anotadas a mano con link de pago: horas que se guarda el horario        // se juntan las clases en el mismo instructor hasta 2 seguidas
  lugar: 'Playa de Matanzas',
  admins: ['isidoravergara@gmail.com', 'contacto@stormsurf.cl']
};
const INSTRUCTORES_BASE = ['Diego', 'Iñaki', 'Francisco', 'Emerson'];
const FIJOS_BASE = [['Francisco', 6, '09:00', '11:00', 'Taller municipal'], ['Francisco', 0, '12:00', '14:00', 'Taller municipal']];
const ANUAL_API = 'https://script.google.com/macros/s/AKfycbyFZiJBhEoWR3-mekjXfea3O0BbDItazLHQRUkCpWOUZOwJ4612kgiGsg4ocWpGBgO3/exec';

// ---------- utilidades ----------
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const norm = s => String(s == null ? '' : s).trim().toLowerCase();
const clp = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
const MINUS = ['de', 'del', 'la', 'las', 'los', 'y', 'e'];
const nombrePropio = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().split(' ')
  .map((p, i) => (i > 0 && MINUS.includes(p)) ? p : p.replace(/^./, c => c.toUpperCase())).join(' ');
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function err(msg) { const e = new Error(msg); e.publico = true; return e; }

/** Hora de Chile ahora: { fecha:'AAAA-MM-DD', hora:'HH:MM' } */
function ahoraChile(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
const aMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };
const deMin = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
function normHora(h) {
  const m = String(h || '').trim().match(/^(\d{1,2})(?:[:.h](\d{2}))?$/);
  if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return '';
  return m[1].padStart(2, '0') + ':' + (m[2] || '00');
}
const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
const diaUTC = f => { const [y, m, d] = f.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const diaSemana = f => new Date(diaUTC(f)).getUTCDay();
// Semana tipo de un instructor nuevo: todos los horarios; los antes de las 9:00 solo el domingo
const horasBase = (a, dia) => a.horarios.filter(h => dia === 0 || h >= '09:00');
const sumarDias = (f, n) => new Date(diaUTC(f) + n * 86400000).toISOString().slice(0, 10);
/** minutos "de reloj de Chile" desde 1970: sirven para comparar fechas y horas locales */
const minLocal = (f, h) => diaUTC(f) / 60000 + aMin(h);
const fechaLarga = f => { const d = new Date(diaUTC(f)); return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()]; };
/** Duración de una reserva: la propia (anotadas a mano, ej. 1 hora) o la general */
const durDe = (a, r) => Number(r && r.duracion) || a.duracion;
const bloquesDe = (hora, duracion) => { const ini = Math.floor(aMin(hora) / BLOQUE) * BLOQUE, n = Math.ceil(duracion / BLOQUE); return Array.from({ length: n }, (_, k) => deMin(ini + k * BLOQUE)); };

// ---------- lectura ----------
async function ajustes(db) {
  const { results } = await db.prepare('SELECT clave, valor FROM ajustes').all();
  const a = JSON.parse(JSON.stringify(AJUSTES_BASE));
  results.forEach(r => { try { a[r.clave] = JSON.parse(r.valor); } catch (_) {} });
  a.horarios = [...new Set((a.horarios || []).map(normHora).filter(Boolean))].sort();
  return a;
}
async function instructores(db) {
  let { results } = await db.prepare('SELECT * FROM instructores ORDER BY orden, nombre').all();
  if (!results.length) { // primera vez: carga el equipo de la Escuela con todos los horarios disponibles
    const a = await ajustes(db);
    const st = [];
    INSTRUCTORES_BASE.forEach((n, i) => {
      st.push(db.prepare('INSERT OR IGNORE INTO instructores (nombre, orden) VALUES (?, ?)').bind(n, i));
      for (let d = 0; d < 7; d++) st.push(db.prepare('INSERT OR IGNORE INTO semana (instructor, dia, horas) VALUES (?, ?, ?)').bind(n, d, JSON.stringify(horasBase(a, d))));
    });
    FIJOS_BASE.forEach(f => st.push(db.prepare("INSERT INTO ocupaciones (origen, instructor, dia, desde, hasta, motivo) VALUES ('fijo', ?, ?, ?, ?, ?)").bind(...f)));
    await db.batch(st);
    results = (await db.prepare('SELECT * FROM instructores ORDER BY orden, nombre').all()).results;
  }
  return results;
}
const parseLista = s => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };

/** Grupos por instructor (cada grupo se cobra como una clase de su tamaño):
 *  - menores de 8: de a 2 por instructor; si sobra uno, va con los demás (o, si no hay más, con el último par: 3 niños = 1 instructor) (menores de 5: clase individual, aviso en la página);
 *  - (ninos: reservado por si se vuelve a separar por edades; hoy siempre 0)
 *  - desde 12 años cuenta como adulto; máximo 5 por instructor.
 *  Ej.: 4 niños = 2+2; 3 niños = 3; 5 niños = 2+3; 3 niños + 1 adulto = 2+2; 3 niños + 2 adultos = 2+3; 4 niños + 1 adulto = 2+3; 4 adultos + 1 niño = 5. */
const edades = r => { const t = []; if (r.menores) t.push(r.menores + ' menor' + (r.menores === 1 ? '' : 'es') + ' de 8'); if (r.ninos) t.push(r.ninos + ' de 7 a 11'); return t.length ? ' (' + t.join(', ') + ')' : ''; };
const MAX_MENORES = 2, MAX_NINOS = 3, MAX_GRUPO = 5;
function cotizar(a, personas, menores, ninos) {
  personas = Math.floor(Number(personas)); menores = Math.floor(Number(menores) || 0); ninos = Math.floor(Number(ninos) || 0);
  if (!(personas >= 1)) throw err('Elige cuántas personas son.');
  if (menores < 0 || ninos < 0 || menores + ninos > personas) throw err('Revisa cuántos son niños.');
  const grupos = [];
  const pares = Math.floor(menores / MAX_MENORES);
  for (let k = 0; k < pares; k++) grupos.push({ personas: MAX_MENORES, ninos: true });
  let resto = personas - pares * MAX_MENORES; // incluye al niño que sobra
  if (pares && resto === 1) { grupos[grupos.length - 1].personas += 1; resto = 0; } // una sola persona suelta (niño o adulto) va con el último par
  if (resto > 0) {
    // cuántos instructores para el resto: hasta 5 por grupo y hasta 3 niños de 7-11 por grupo; repartidos parejo
    const n = personas > a.maxWeb && !ninos ? 1 : Math.max(Math.ceil(resto / MAX_GRUPO), Math.ceil(ninos / MAX_NINOS), 1);
    for (let g = 0; g < n; g++) grupos.push({ personas: Math.floor(resto / n) + (g < resto % n ? 1 : 0), ninos: false });
  }
  let precio = 0, pago = 0;
  grupos.forEach(g => {
    g.precio = Number(a.precios[g.personas]) || 0;
    g.pago = Number(g.personas <= 5 ? a.pagos[g.personas] : a.pagos.grupo) || Number(a.pagos.grupo) || 0;
    precio += g.precio; pago += g.pago;
  });
  return { personas, menores, ninos, instructores: grupos.length, grupos, precio, pagoInstructor: pago };
}

/** Academia Anual (todos los instructores) y horas fijas de cada uno (talleres, etc.). */
async function leerOcupaciones(db, desde, hasta) {
  const { results } = await db.prepare("SELECT * FROM ocupaciones WHERE fecha = '' OR fecha BETWEEN ? AND ?").bind(desde, hasta).all();
  return results;
}
/** ¿La clase (hora + duración) se cruza con algo que el instructor ya tiene ese día? Devuelve el motivo. */
function cruce(ocu, inst, fecha, hora, duracion) {
  const ini = aMin(hora), fin = ini + duracion, dia = diaSemana(fecha);
  const o = ocu.find(o => (o.instructor === '*' || o.instructor === inst) && (o.fecha ? o.fecha === fecha : o.dia === dia) && aMin(o.desde) < fin && aMin(o.hasta) > ini);
  return o ? o.motivo || 'Ocupado' : '';
}
/** Copia las clases de la Academia Anual desde el calendario Storm (planilla Anual). Si Google no responde, quedan las de la última vez. */
async function sincronizarAnual(env, forzar) {
  const db = env.DB, ultimo = await db.prepare("SELECT valor FROM ajustes WHERE clave = 'anualSync'").first();
  const ult = ultimo ? JSON.parse(ultimo.valor) : {};
  if (!forzar && ult.ms && Date.now() - ult.ms < 3600000) return ult;
  const hoy = ahoraChile().fecha, [y, m] = hoy.split('-').map(Number), filas = [];
  for (let k = 0; k < 3; k++) {
    const mm = (m - 1 + k) % 12, yy = y + Math.floor((m - 1 + k) / 12);
    const r = await fetch(env.ANUAL_API || ANUAL_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', body: JSON.stringify({ accion: 'calendario', mes: MESES[mm] + ' ' + yy }) });
    const d = await r.json();
    if (!d.ok) throw new Error('Calendario Anual: ' + (d.error || r.status));
    (d.clases || []).forEach(c => {
      const h = String(c.horario || '').match(/\d{1,2}[:.]\d{2}/g) || [];
      if (esFecha(c.fecha) && h.length >= 2 && c.fecha >= hoy) filas.push([c.fecha, normHora(h[0]), normHora(h[1]), 'Academia Anual · ' + (c.clase || '')]);
    });
  }
  const st = [db.prepare("DELETE FROM ocupaciones WHERE origen = 'anual'")];
  filas.forEach(f => st.push(db.prepare("INSERT INTO ocupaciones (origen, instructor, fecha, desde, hasta, motivo) VALUES ('anual', '*', ?, ?, ?, ?)").bind(...f)));
  const info = { ms: Date.now(), cuando: hoy + ' ' + ahoraChile().hora, clases: filas.length };
  st.push(db.prepare("INSERT OR REPLACE INTO ajustes (clave, valor) VALUES ('anualSync', ?)").bind(JSON.stringify(info)));
  await db.batch(st);
  return info;
}

/** Ocupación y disponibilidad de los próximos días. */
async function estadoAgenda(db, a, desde, hasta) {
  const ahoraMs = Date.now();
  const ins = await instructores(db);
  const [sem, exc, blo, ocu] = await Promise.all([
    db.prepare('SELECT * FROM semana').all(),
    db.prepare('SELECT * FROM excepciones WHERE fecha BETWEEN ? AND ?').bind(desde, hasta).all(),
    db.prepare('SELECT instructor, fecha, hora, ref, hasta FROM bloques WHERE fecha BETWEEN ? AND ? AND (hasta = 0 OR hasta > ?)').bind(desde, hasta, ahoraMs).all(),
    leerOcupaciones(db, desde, hasta)
  ]);
  const semana = {}; sem.results.forEach(r => { (semana[r.instructor] = semana[r.instructor] || {})[r.dia] = parseLista(r.horas); });
  const excep = {}; exc.results.forEach(r => { excep[r.instructor + '|' + r.fecha + '|' + r.hora] = !!r.libre; });
  const ocupado = new Set(blo.results.map(r => r.instructor + '|' + r.fecha + '|' + r.hora));
  const disponible = (inst, fecha, hora) => {
    const k = inst + '|' + fecha + '|';
    if ((k + hora) in excep) return excep[k + hora];
    if (k in excep) return excep[k];
    return ((semana[inst] || {})[diaSemana(fecha)] || []).includes(horaBase(a, fecha, hora));
  };
  const enOtraCosa = (inst, fecha, hora, dur) => cruce(ocu, inst, fecha, hora, dur || a.duracion);
  const sinChoque = (inst, fecha, hora, dur) => !enOtraCosa(inst, fecha, hora, dur) && bloquesDe(hora, dur || a.duracion).every(b => !ocupado.has(inst + '|' + fecha + '|' + b));
  const libre = (inst, fecha, hora) => disponible(inst, fecha, hora) && sinChoque(inst, fecha, hora);
  return { ins, semana, excep, ocupado, disponible, libre, sinChoque, bloques: blo.results };
}

/** ¿Se puede reservar ese horario ahora? (anticipación y nunca de noche para la mañana) */
function permitido(a, fecha, hora, ahora = ahoraChile()) {
  const ya = minLocal(ahora.fecha, ahora.hora), clase = minLocal(fecha, hora);
  if (clase - ya < a.minHoras * 60) return false;
  if (clase > minLocal(sumarDias(ahora.fecha, a.diasAdelante), '23:59')) return false;
  if (aMin(hora) < aMin(a.horaTarde) && ya > minLocal(sumarDias(fecha, -1), a.cierreNoche)) return false;
  return true;
}

/** Tope de la Academia de Verano: si la clase cae en ese rato, solo pueden darla los instructores que ya tienen particulares ahí,
 *  más los que falten para llegar al tope (1). lista = nombres ya ordenados; devuelve la lista recortada. */
const esVerano = (a, fecha) => { const v = a.verano; return !!v && (v.meses || []).includes(+fecha.slice(5, 7)) && (v.dias || []).includes(diaSemana(fecha)); };
/** Horarios de ese día (en días de Academia de Verano, corridos según verano.cambios) */
const horasDia = (a, fecha) => esVerano(a, fecha) ? [...new Set(a.horarios.map(h => (a.verano.cambios || {})[h] || h))].sort() : a.horarios;
/** Hora de la semana tipo que corresponde (11:00 de verano = 10:30 de la semana tipo) */
const horaBase = (a, fecha, hora) => { if (!esVerano(a, fecha)) return hora; const c = a.verano.cambios || {}; return Object.keys(c).find(k => c[k] === hora) || hora; };
function topeVerano(a, ag, fecha, hora, lista) {
  const v = a.verano;
  if (!esVerano(a, fecha)) return lista;
  const ini = aMin(hora), fin = ini + a.duracion, d = aMin(v.desde), h = aMin(v.hasta);
  if (fin <= d || ini >= h) return lista;
  const usados = new Set(ag.bloques.filter(b => b.fecha === fecha && aMin(b.hora) >= d && aMin(b.hora) < h).map(b => b.instructor));
  const cupo = Math.max(0, (Number(v.instructores) || 0) - usados.size);
  return lista.filter(n => usados.has(n)).concat(lista.filter(n => !usados.has(n)).slice(0, cupo));
}

async function disponibilidad(db, d) {
  const a = await ajustes(db);
  const hoy = ahoraChile();
  const personas = Math.max(1, Math.min(a.maxWeb, Math.floor(Number(d.personas) || 1)));
  const c = cotizar(a, personas, Math.min(personas, Math.floor(Number(d.menores) || 0)), Math.floor(Number(d.ninos) || 0));
  const hasta = sumarDias(hoy.fecha, a.diasAdelante);
  const ag = await estadoAgenda(db, a, hoy.fecha, hasta);
  const activos = ag.ins.filter(i => i.activo);
  const dias = {};
  for (let f = hoy.fecha; f <= hasta; f = sumarDias(f, 1)) {
    const horas = horasDia(a, f).filter(h => permitido(a, f, h, hoy) && topeVerano(a, ag, f, h, activos.filter(i => ag.libre(i.nombre, f, h)).map(i => i.nombre)).length >= c.instructores);
    if (horas.length) dias[f] = horas;
  }
  return { ok: true, precios: a.precios, maxWeb: a.maxWeb, duracion: a.duracion, lugar: a.lugar, whatsapp: WHATSAPP, cotizacion: c, dias, hoy: hoy.fecha, hasta };
}

// ---------- reservar y pagar ----------
const nuevaClave = () => [...crypto.getRandomValues(new Uint8Array(9))].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
const linkFicha = r => PAGINA + 'ficha/?r=' + encodeURIComponent(r.ref) + '&k=' + encodeURIComponent(r.clave || '');
const nuevaRef = () => { const t = ahoraChile(); return 'ES-' + t.fecha.slice(2).replace(/-/g, '') + '-' + t.hora.replace(':', '') + '-' + Math.floor(Math.random() * 9000 + 1000); };
const shuffle = arr => { const x = arr.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/** Instructores libres a esa hora: primero los que ya tienen una clase justo antes o justo después (clases seguidas, sin esperar en el agua);
 *  entre iguales, al azar. */
/** aMano: Isidora anota a cualquier hora; sirve cualquier instructor sin otra clase, primero los que marcaron disponible. */
function elegir(ag, a, fecha, hora, aMano, dur) {
  const antes = deMin(aMin(hora) - BLOQUE), despues = deMin(Math.floor(aMin(hora) / BLOQUE) * BLOQUE + Math.ceil(a.duracion / BLOQUE) * BLOQUE);
  const tiene = (n, m) => ag.ocupado.has(n + '|' + fecha + '|' + deMin(m));
  const pegado = n => {
    if (!tiene(n, aMin(antes)) && !tiene(n, aMin(despues))) return 0;
    // cuántas clases seguidas quedaría haciendo (bloques ocupados pegados + esta)
    let blo = Math.ceil(a.duracion / BLOQUE);
    for (let m = aMin(antes); tiene(n, m); m -= BLOQUE) blo++;
    for (let m = aMin(despues); tiene(n, m); m += BLOQUE) blo++;
    return blo / Math.ceil(a.duracion / BLOQUE) > (a.maxSeguidas || 2) ? -1 : 1;
  };
  // clases que ya tiene ese día: si nadie tiene una pegada, va al que tiene menos (así trabajan todos)
  const nDia = n => new Set(ag.bloques.filter(b => b.instructor === n && b.fecha === fecha).map(b => b.ref)).size;
  const sirve = aMano ? (n, f, h) => ag.sinChoque(n, f, h, dur) : ag.libre, marco = n => ag.disponible(n, fecha, hora) ? 1 : 0;
  return shuffle(ag.ins.filter(i => i.activo && sirve(i.nombre, fecha, hora)).map(i => i.nombre)).sort((x, y) => (aMano ? marco(y) - marco(x) : 0) || pegado(y) - pegado(x) || nDia(x) - nDia(y));
}
/** Tarifas propias por instructor (ej. Diego cobra más). Vacío = tabla general. */
async function tarifas(db) {
  const { results } = await db.prepare('SELECT nombre, tarifas FROM instructores').all();
  const t = {}; results.forEach(r => { try { const x = JSON.parse(r.tarifas || 'null'); if (x) t[r.nombre] = x; } catch (_) {} });
  return t;
}
/** Cuánto gana cada instructor en esta clase. Cada uno toma un grupo (pareja de niños o el resto); los extras se pagan como grupo.
 *  Si Isidora escribió el pago a mano, se reparte igual entre todos. */
function repartirPago(a, tar, personas, menores, ninos, ins, pagoManual) {
  const out = {};
  if (pagoManual != null) { const base = Math.floor(pagoManual / Math.max(1, ins.length)); ins.forEach((n, k) => out[n] = base + (k === 0 ? pagoManual - base * ins.length : 0)); out._manual = 1; return out; }
  const c = cotizar(a, personas, menores, ninos);
  ins.forEach((n, k) => {
    const g = c.grupos[k], clave = g && g.personas <= 5 ? g.personas : 'grupo', t = tar[n] || {};
    out[n] = Number(t[clave]) || Number(a.pagos[clave]) || Number(t.grupo) || Number(a.pagos.grupo) || 0;
  });
  return out;
}
const sumaPagos = p => Object.keys(p).filter(k => k !== '_manual').reduce((t, k) => t + (Number(p[k]) || 0), 0);
/** Pagos por instructor de una reserva guardada (las antiguas sin detalle se reparten igual). */
function pagosDe(r) {
  try { const p = JSON.parse(r.pagos || 'null'); if (p) { delete p._manual; return p; } } catch (_) {}
  const l = parseLista(r.instructores), o = {}; l.forEach(i => o[i] = Math.round((r.pago_instructor || 0) / Math.max(1, l.length))); return o;
}

/** Guarda la reserva y ocupa los bloques en un solo paso: si alguien tomó el horario un segundo antes, falla entera. */
async function guardarReserva(db, a, r, hastaMs) {
  r.pagos = repartirPago(a, await tarifas(db), r.personas, r.menores, r.ninos || 0, r.instructores, r.pagoManual == null ? null : r.pagoManual);
  r.pago_instructor = sumaPagos(r.pagos);
  const st = [db.prepare(`INSERT INTO reservas (ref, creada, creada_ms, estado, fecha, hora, personas, menores, ninos, instructores, nombre, telefono, correo, comentario, total, pago_instructor, medio, orden_mp, nota, clave, pagos, duracion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(r.ref, r.creada, r.creada_ms, r.estado, r.fecha, r.hora, r.personas, r.menores, r.ninos || 0, JSON.stringify(r.instructores),
      r.nombre, r.telefono, r.correo, r.comentario, r.total, r.pago_instructor, r.medio, r.orden_mp || '', r.nota || '', r.clave || (r.clave = nuevaClave()), JSON.stringify(r.pagos), Number(r.duracion) || 0)];
  r.instructores.forEach(i => bloquesDe(r.hora, durDe(a, r)).forEach(b => st.push(db.prepare('INSERT INTO bloques (instructor, fecha, hora, ref, hasta) VALUES (?, ?, ?, ?, ?)').bind(i, r.fecha, b, r.ref, hastaMs))));
  await db.batch(st);
}
const limpiarRetenciones = db => db.prepare('DELETE FROM bloques WHERE hasta > 0 AND hasta < ?').bind(Date.now()).run();

async function reservar(env, d) {
  const db = env.DB, a = await ajustes(db);
  const fecha = String(d.fecha || ''), hora = normHora(d.hora);
  if (!esFecha(fecha) || !hora || !horasDia(a, fecha).includes(hora)) throw err('Elige un día y un horario.');
  const personas = Math.floor(Number(d.personas));
  if (!(personas >= 1 && personas <= a.maxWeb)) throw err('Para más de ' + a.maxWeb + ' personas escríbenos por WhatsApp.');
  const c = cotizar(a, personas, d.menores, d.ninos);
  const nombre = nombrePropio(d.nombre), telefono = String(d.telefono || '').trim(), correo = norm(d.correo), comentario = String(d.comentario || '').trim().slice(0, 500);
  if (nombre.length < 2) throw err('Escribe tu nombre.');
  if (telefono.replace(/\D/g, '').length < 8) throw err('Revisa tu teléfono.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw err('Revisa tu correo.');
  if (!d.acepta) throw err('Para reservar, acepta las condiciones.');
  if (!permitido(a, fecha, hora)) throw err('Ese horario ya no se puede reservar. Elige otro.');
  if (!env.MP_TOKEN) throw err('Las reservas en línea no están activas en este momento. Escríbenos por WhatsApp.');
  await limpiarRetenciones(db);
  const ref = nuevaRef(), t = ahoraChile();
  const base = { ref, creada: t.fecha + ' ' + t.hora, creada_ms: Date.now(), estado: 'pendiente', fecha, hora, personas, menores: c.menores, ninos: c.ninos, nombre, telefono, correo, comentario,
    total: c.precio, pago_instructor: c.pagoInstructor, medio: 'Mercado Pago' };
  // Instructor al azar entre los libres; si dos personas reservan a la vez, el segundo intenta con otro.
  let elegido = null;
  for (let intento = 0; intento < 3 && !elegido; intento++) {
    const ag = await estadoAgenda(db, a, fecha, fecha);
    const libres = topeVerano(a, ag, fecha, hora, elegir(ag, a, fecha, hora));
    if (libres.length < c.instructores) break;
    const r = Object.assign({}, base, { instructores: libres.slice(0, c.instructores) });
    try { await guardarReserva(db, a, r, Date.now() + a.retencionMin * 60000); elegido = r; }
    catch (x) { if (!/UNIQUE|constraint/i.test(String(x.message))) throw x; }
  }
  if (!elegido) throw err('Ese horario se acaba de ocupar. Elige otro.');
  const o = await crearOrden(env, elegido);
  if (!o) {
    await db.batch([db.prepare('DELETE FROM bloques WHERE ref = ?').bind(ref), db.prepare("UPDATE reservas SET estado = 'cancelada', nota = ? WHERE ref = ?").bind('Mercado Pago no respondió', ref)]);
    throw err('No pudimos conectar con Mercado Pago. Intenta de nuevo en un momento.');
  }
  return { ok: true, url: o.url, ref, total: c.precio };
}

/** Crea el cobro en Mercado Pago y lo deja anotado en la reserva. Devuelve { id, url } o null si Mercado Pago no respondió. */
async function crearOrden(env, r) {
  const vuelta = PAGINA + '?ref=' + encodeURIComponent(r.ref) + '&pago=';
  const orden = {
    type: 'online', processing_mode: 'manual', total_amount: String(r.total), external_reference: r.ref,
    description: 'Clase de surf Storm', ...(r.correo ? { payer: { email: r.correo } } : {}),
    items: [{ title: 'Clase de surf Storm · ' + r.personas + (r.personas === 1 ? ' persona' : ' personas') + ' · ' + fechaLarga(r.fecha) + ' ' + r.hora, quantity: 1, unit_price: String(r.total) }],
    config: { online: { success_url: vuelta + 'ok', pending_url: vuelta + 'pendiente', failure_url: vuelta + 'error', auto_return: 'approved' } }
  };
  let res = {}, code = 0;
  try {
    const x = await fetch((env.MP_API || MP_API) + '/v1/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.MP_TOKEN, 'X-Idempotency-Key': r.ref }, body: JSON.stringify(orden) });
    code = x.status; res = await x.json().catch(() => ({}));
  } catch (_) {}
  if (code >= 300 || !res.checkout_url) return null;
  await env.DB.prepare('UPDATE reservas SET orden_mp = ?, link_pago = ? WHERE ref = ?').bind(String(res.id || ''), res.checkout_url, r.ref).run();
  return { id: res.id, url: res.checkout_url };
}

/** Consulta la orden en Mercado Pago y, si está pagada, confirma la reserva. */
async function revisarPago(env, r, ctx) {
  if (!r || r.estado !== 'pendiente' && r.estado !== 'vencida' || !r.orden_mp || !env.MP_TOKEN) return r && r.estado;
  let o = null;
  try {
    const x = await fetch((env.MP_API || MP_API) + '/v1/orders/' + encodeURIComponent(r.orden_mp), { headers: { Authorization: 'Bearer ' + env.MP_TOKEN } });
    if (x.ok) o = await x.json();
  } catch (_) {}
  if (!o) return r.estado;
  if (o.status === 'processed' && o.status_detail === 'accredited') return confirmar(env, r, Number(o.total_paid_amount || o.total_amount), ctx);
  if (['canceled', 'expired', 'failed', 'refunded'].includes(o.status)) {
    await env.DB.batch([env.DB.prepare('DELETE FROM bloques WHERE ref = ?').bind(r.ref), env.DB.prepare("UPDATE reservas SET estado = 'vencida' WHERE ref = ? AND estado = 'pendiente'").bind(r.ref)]);
    return 'vencida';
  }
  return r.estado;
}

async function confirmar(env, r, monto, ctx) {
  const db = env.DB, a = await ajustes(db);
  if (Math.round(monto) < r.total) { await db.prepare("UPDATE reservas SET estado = 'revisar', nota = ? WHERE ref = ?").bind('Monto pagado distinto: ' + clp(monto), r.ref).run(); return 'revisar'; }
  const ch = await db.prepare("UPDATE reservas SET estado = 'pagada' WHERE ref = ? AND estado IN ('pendiente', 'vencida')").bind(r.ref).run();
  if (!ch.meta || !ch.meta.changes) return (await db.prepare('SELECT estado FROM reservas WHERE ref = ?').bind(r.ref).first() || {}).estado;
  // Deja fijos los bloques; si se habían liberado (pagó muy tarde), los vuelve a tomar.
  const ins = parseLista(r.instructores), bl = bloquesDe(r.hora, durDe(a, r));
  const tiene = await db.prepare('SELECT COUNT(*) AS n FROM bloques WHERE ref = ?').bind(r.ref).first();
  if ((tiene && tiene.n) === ins.length * bl.length) await db.prepare('UPDATE bloques SET hasta = 0 WHERE ref = ?').bind(r.ref).run();
  else {
    try {
      await db.batch([db.prepare('DELETE FROM bloques WHERE ref = ?').bind(r.ref)].concat(ins.flatMap(i => bl.map(b => db.prepare('INSERT INTO bloques (instructor, fecha, hora, ref, hasta) VALUES (?, ?, ?, ?, 0)').bind(i, r.fecha, b, r.ref)))));
    } catch (_) {
      await db.prepare("UPDATE reservas SET estado = 'revisar', nota = 'Pagó tarde y el instructor ya tenía otra clase: asígnale otro instructor' WHERE ref = ?").bind(r.ref).run();
      tarea(ctx, correoStorm(env, 'Revisar reserva ' + r.ref, 'Llegó el pago de ' + r.nombre + ' (' + fechaLarga(r.fecha) + ' ' + r.hora + '), pero el instructor ya tenía otra clase. Asígnale otro instructor en Agenda Storm.'));
      return 'revisar';
    }
  }
  const final = Object.assign({}, r, { estado: 'pagada' });
  tarea(ctx, avisarReserva(env, final, a));
  tarea(ctx, pushNueva(env, final, a, true));
  return 'pagada';
}
const tarea = (ctx, p) => { if (ctx && ctx.waitUntil) ctx.waitUntil(p.catch(e => console.error(e))); else return p.catch(e => console.error(e)); };

async function estado(env, d, ctx) {
  const r = await env.DB.prepare('SELECT * FROM reservas WHERE ref = ?').bind(String(d.ref || '')).first();
  if (!r) throw err('No encontramos la reserva.');
  const est = await revisarPago(env, r, ctx);
  return { ok: true, estado: est, fecha: r.fecha, fechaLarga: fechaLarga(r.fecha), hora: r.hora, personas: r.personas, total: r.total, nombre: r.nombre.split(' ')[0], correo: r.correo,
    ficha: est === 'pagada' || est === 'revisar' ? linkFicha(r) : '' };
}

// ---------- notificaciones a la app (Panel Storm / Agenda Storm, OneSignal) ----------
// Llegan a quien tenga la app con notificaciones activadas y haya entrado con ese correo. Requiere ONESIGNAL_KEY (secreto en Cloudflare).
const ONESIGNAL_APP = 'be18352b-5820-4912-aa46-d851890394a3';
async function enviarPush(env, correos, titulo, texto) {
  const a = [...new Set((correos || []).map(norm).filter(Boolean))];
  if (!env.ONESIGNAL_KEY || !a.length) return false;
  const r = await fetch('https://api.onesignal.com/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: (/^os_v2_/.test(env.ONESIGNAL_KEY) ? 'Key ' : 'Basic ') + env.ONESIGNAL_KEY }, // llaves nuevas (os_v2_) o antiguas
    body: JSON.stringify({ app_id: ONESIGNAL_APP, target_channel: 'push', include_aliases: { external_id: a }, headings: { en: titulo, es: titulo }, contents: { en: texto, es: texto }, url: PANEL }) });
  if (!r.ok) console.error('push', r.status, await r.text());
  return r.ok;
}
const correosDe = async (db, nombres) => (await db.prepare('SELECT nombre, correo FROM instructores').all()).results.filter(i => nombres.includes(i.nombre) && i.correo).map(i => i.correo);
const diaCorto = f => { const t = fechaLarga(f); return t.charAt(0).toUpperCase() + t.slice(1); };
const quienClase = r => r.nombre + ' · ' + r.personas + ' persona' + (r.personas === 1 ? '' : 's');
/** Clase nueva: a los instructores de la clase y (si reservó el cliente) a las administradoras */
async function pushNueva(env, r, a, aAdmins) {
  const ins = parseLista(r.instructores), dur = durDe(a, r);
  const cuando = diaCorto(r.fecha) + ' · ' + r.hora + ' a ' + deMin(aMin(r.hora) + dur);
  const p = [enviarPush(env, await correosDe(env.DB, ins), 'Nueva clase particular 🏄', cuando + '\n' + quienClase(r) + (ins.length > 1 ? ' · con ' + ins.join(' y ') : ''))];
  if (aAdmins) p.push(enviarPush(env, a.admins, 'Nueva reserva 🏄 ' + clp(r.total), cuando + '\n' + quienClase(r) + ' · ' + ins.join(' y ')));
  await Promise.all(p);
}
/** Resumen del día siguiente (una vez, desde las 19:00): a cada instructor sus clases y a las administradoras todas */
async function pushResumen(env, a) {
  const t = ahoraChile();
  if (aMin(t.hora) < aMin('19:00') || aMin(t.hora) > aMin('21:30')) return 0;
  const man = sumarDias(t.fecha, 1);
  const ya = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'resumenPush'").first();
  if (ya && JSON.parse(ya.valor) === man) return 0;
  await env.DB.prepare("INSERT OR REPLACE INTO ajustes (clave, valor) VALUES ('resumenPush', ?)").bind(JSON.stringify(man)).run();
  const { results } = await env.DB.prepare("SELECT * FROM reservas WHERE fecha = ? AND estado IN ('pagada', 'revisar') ORDER BY hora").bind(man).all();
  if (!results.length) return 0;
  const porIns = {};
  results.forEach(r => parseLista(r.instructores).forEach(i => (porIns[i] = porIns[i] || []).push(r)));
  const linea = r => r.hora + ' ' + quienClase(r);
  const lista = (await env.DB.prepare('SELECT nombre, correo FROM instructores').all()).results;
  const p = Object.keys(porIns).map(i => { const l = porIns[i], c = (lista.find(x => x.nombre === i) || {}).correo;
    return c ? enviarPush(env, [c], 'Mañana tienes ' + l.length + ' clase' + (l.length === 1 ? '' : 's') + ' 🌊', l.map(linea).join('\n')) : null; }).filter(Boolean);
  p.push(enviarPush(env, a.admins, 'Mañana: ' + results.length + ' clase' + (results.length === 1 ? '' : 's') + ' particular' + (results.length === 1 ? '' : 'es') + ' 🌊',
    Object.keys(porIns).map(i => i + ': ' + porIns[i].map(r => r.hora).join(', ')).join('\n')));
  await Promise.all(p);
  return results.length;
}

// ---------- correos ----------
async function enviarCorreo(env, o) {
  if (!env.CLAVE_CORREO) return false;
  const r = await fetch(env.CORREO_URL || CORREO_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, redirect: 'follow',
    body: JSON.stringify({ clave: env.CLAVE_CORREO, to: o.to, subject: o.subject, body: o.body, htmlBody: o.html || '', bcc: o.bcc || '', name: 'Storm Surf Academy' }) });
  return r.ok;
}
const correoStorm = (env, asunto, texto) => enviarCorreo(env, { to: CORREO_STORM, subject: asunto, body: texto });
function cajaCorreo(titulo, filas, pie) {
  const F = 'font-family:Helvetica,Arial,sans-serif;';
  return ('<div style="background:#EFECE8;padding:28px 12px;' + F + 'color:#2C2C2B"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto">' +
    '<tr><td style="background:#fff;border-radius:18px;padding:28px 26px">' +
    '<h1 style="font-size:26px;line-height:1.15;margin:0 0 14px">' + titulo + '</h1>' + filas +
    '<p style="margin:22px 0 0;font-size:15px;line-height:1.55;color:#5c5b58">' + pie + '</p>' +
    '<p style="margin:18px 0 0;font-size:16px">Nos vemos en el agua 🌊<br><b>Equipo Storm</b></p></td></tr>' +
    '<tr><td style="text-align:center;padding:18px 8px 0;font-size:12px;color:#8a8986">Storm Surf Academy · Playa de Matanzas · <a href="https://wa.me/' + WHATSAPP + '" style="color:#2d6e94">WhatsApp +56 9 7774 4306</a></td></tr></table></div>')
    .replace(/[^\x00-\x7F]/gu, c => '&#' + c.codePointAt(0) + ';');
}
const botonFicha = r => '<span style="display:block;margin:0 0 18px;padding:16px;border-radius:14px;background:#FFF6DA;color:#3B2610"><b style="font-size:16px">Falta un paso: la ficha de cada participante</b><br>' +
  'Es obligatoria para entrar al mar (Sernatur). Toma 2 minutos por persona.<br><a href="' + linkFicha(r) + '" style="display:inline-block;margin-top:10px;background:#2C2C2B;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:999px">Llenar la ficha</a></span>';
const filaC = (k, v) => '<p style="margin:0 0 8px;font-size:16px;line-height:1.45"><span style="color:#8a8986">' + esc(k) + '</span><br><b>' + esc(v) + '</b></p>';
/** Correo de confirmación para el cliente: todo lo que necesita saber para llegar a su clase. */
function correoReservada(r, a, ins) {
  const F = 'font-family:Helvetica,Arial,sans-serif;', fin = deMin(aMin(r.hora) + durDe(a, r));
  const gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Clase de surf Storm') + '&dates=' + r.fecha.replace(/-/g, '') + 'T' + r.hora.replace(':', '') + '00/' + r.fecha.replace(/-/g, '') + 'T' + fin.replace(':', '') + '00&ctz=America/Santiago&location=' + encodeURIComponent(MAPA) + '&details=' + encodeURIComponent('Llega 10 minutos antes. Ficha: ' + linkFicha(r));
  const boton = (href, txt, fondo, color) => '<a href="' + href + '" style="display:block;text-align:center;text-decoration:none;background:' + fondo + ';color:' + color + ';font-weight:700;font-size:16px;padding:14px 18px;border-radius:999px;margin:10px 0 0">' + txt + '</a>';
  const seccion = (titulo, cuerpo) => '<tr><td style="padding:22px 26px 0"><p style="margin:0 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#8a8986;font-weight:700">' + titulo + '</p>' + cuerpo + '</td></tr>';
  const dato = (k, v) => '<td style="padding:6px 0;font-size:15px;color:#8a8986;width:42%">' + k + '</td><td style="padding:6px 0;font-size:15px;font-weight:700;text-align:right">' + v + '</td>';
  const ficha = r.ref ? '<tr><td style="padding:22px 26px 0"><div style="padding:18px;border-radius:16px;background:#FFF6DA;color:#3B2610"><b style="font-size:17px">Falta un paso: la ficha de cada participante</b><p style="margin:6px 0 0;font-size:15px;line-height:1.5">Es obligatoria para entrar al mar (Sernatur). Toma 2 minutos por persona y se firma con el dedo.</p>' + boton(linkFicha(r), 'Llenar la ficha', '#2C2C2B', '#ffffff') + '</div></td></tr>' : '';
  const html = '<div style="background:#EFECE8;padding:28px 12px;' + F + 'color:#2C2C2B"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden">' +
    '<tr><td style="padding:26px 26px 0;text-align:center"><img src="https://app.stormsurf.cl/img/storm-logo.png" alt="Storm" width="110" style="display:inline-block"></td></tr>' +
    '<tr><td style="padding:18px 26px 0;text-align:center"><p style="margin:0;font-size:40px">🏄</p><h1 style="font-size:27px;line-height:1.15;margin:6px 0 8px">¡Tu clase de surf está reservada!</h1><p style="margin:0;font-size:16px;line-height:1.5;color:#5c5b58">Hola ' + esc(r.nombre.split(' ')[0]) + ', ya tienes tu lugar en el mar. Este correo es tu comprobante.</p></td></tr>' +
    '<tr><td style="padding:22px 26px 0"><div style="background:#E3F1F1;border-radius:18px;padding:20px;text-align:center"><p style="margin:0;font-size:14px;color:#0f6e74;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Tu clase</p><p style="margin:6px 0 2px;font-size:22px;font-weight:700">' + esc(fechaLarga(r.fecha)) + '</p><p style="margin:0;font-size:20px">' + esc(r.hora) + ' a ' + esc(fin) + ' hrs</p></div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">' +
    '<tr>' + dato('Personas', r.personas + edades(r)) + '</tr>' +
    (ins.length ? '<tr>' + dato(ins.length === 1 ? 'Instructor' : 'Instructores', esc(ins.join(' y '))) + '</tr>' : '') +
    '<tr>' + dato('Dónde', esc(a.lugar)) + '</tr>' +
    '<tr>' + dato('Total pagado', clp(r.total)) + '</tr>' +
    '<tr>' + dato('Reserva', esc(r.ref)) + '</tr></table></td></tr>' +
    ficha +
    seccion('📍 Cómo llegar', '<p style="margin:0;font-size:15px;line-height:1.5">Nos encontramos en Storm, en ' + esc(a.lugar) + '. Llega 10 minutos antes para ponerte el traje con calma.</p>' + boton(MAPA, 'Ver ubicación en el mapa', '#2C2C2B', '#ffffff')) +
    seccion('🎒 Qué traer', '<p style="margin:0;font-size:15px;line-height:1.9">' + TRAER.map(t => '✅ ' + esc(t)).join('<br>') + '</p>') +
    seccion('💙 Nosotros ponemos', '<p style="margin:0;font-size:15px;line-height:1.9">🏄 Tabla de surf y leash<br>🌊 Traje de agua (wetsuit)<br>🤙 Instructor certificado</p>') +
    seccion('🌊 Si el mar no está apto', '<p style="margin:0;font-size:15px;line-height:1.5">El surf es un deporte en el mar. Si las condiciones no son seguras, te escribimos por WhatsApp para cambiar la hora sin costo.</p>') +
    '<tr><td style="padding:16px 26px 0">' + boton(gcal, 'Agregar a mi calendario', '#EFECE8', '#2C2C2B') + boton('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent('Hola Storm, reservé una clase (' + r.ref + ')'), '¿Dudas? Escríbenos por WhatsApp', '#25D366', '#ffffff') + '</td></tr>' +
    '<tr><td style="padding:24px 26px 28px;text-align:center"><p style="margin:0;font-size:17px">¡Nos vemos en el agua! 🌊<br><b>Equipo Storm</b></p></td></tr></table>' +
    '<p style="text-align:center;margin:16px 0 0;font-size:12px;color:#8a8986">Storm Surf Academy · Playa de Matanzas, Navidad · <a href="https://www.stormsurf.cl" style="color:#2d6e94">stormsurf.cl</a></p></div>';
  return html.replace(/[^\x00-\x7F]/gu, c => '&#' + c.codePointAt(0) + ';');
}
async function avisarReserva(env, r, a) {
  const ins = parseLista(r.instructores);
  const cuando = fechaLarga(r.fecha) + ', ' + r.hora + ' hrs';
  const html = correoReservada(r, a, ins);
  const p = [enviarCorreo(env, { to: r.correo, bcc: CORREO_STORM, subject: '🏄 ¡Tu clase de surf está reservada! · ' + cuando, html,
    body: '¡Clase reservada!\n\n' + cuando + '\n' + r.personas + ' persona(s) · ' + a.lugar + '\nTotal pagado: ' + clp(r.total) + '\n\nAntes de la clase, llena la ficha de cada participante: ' + linkFicha(r) + '\n\n📍 Nuestra ubicación: ' + MAPA + '\n\n🏄 ¿Qué debes traer?\n' + TRAER.map(t => '✅ ' + t).join('\n') + '\n\nNosotros te entregamos todo el equipamiento necesario 💙\nReferencia ' + r.ref })];
  const lista = await env.DB.prepare('SELECT nombre, correo FROM instructores').all();
  lista.results.filter(i => ins.includes(i.nombre) && i.correo).forEach(i => p.push(enviarCorreo(env, { to: i.correo, subject: 'Nueva clase particular · ' + cuando,
    body: 'Hola ' + i.nombre + ',\n\nTienes una clase particular:\n' + cuando + '\n' + r.personas + ' persona(s)' + edades(r) + '\nCliente: ' + r.nombre + ' · ' + r.telefono + (r.comentario ? '\nComentario: ' + r.comentario : '') + '\n\nLa ves en Agenda Storm: ' + PANEL + '\n\nEquipo Storm' })));
  await Promise.all(p);
}
async function recordatorios(env, a) {
  const t = ahoraChile();
  if (aMin(t.hora) < aMin('18:00') || aMin(t.hora) > aMin('21:30')) return 0;
  const man = sumarDias(t.fecha, 1);
  const { results } = await env.DB.prepare("SELECT * FROM reservas WHERE fecha = ? AND estado = 'pagada' AND recordatorio = 0 AND correo != ''").bind(man).all();
  for (const r of results) {
    const cuando = 'mañana ' + fechaLarga(r.fecha) + ' a las ' + r.hora;
    await enviarCorreo(env, { to: r.correo, subject: 'Mañana es tu clase de surf · ' + r.hora + ' hrs',
      html: cajaCorreo('¡Mañana surfeamos!', '<p style="margin:0 0 16px;font-size:16px">Hola ' + esc(r.nombre.split(' ')[0]) + ', te recordamos tu clase:</p>' + filaC('Cuándo', cuando) + filaC('Dónde', a.lugar) + '<p style="margin:4px 0 0;font-size:16px">📍 <a href="' + MAPA + '" style="color:#2d6e94;font-weight:700">Cómo llegar (mapa)</a></p>',
        ((await fichasDe(env.DB, r.ref)).length < r.personas ? botonFicha(r) : '') + 'Trae traje de baño, toalla y bloqueador. Llega 10 minutos antes. Si el mar no está apto, te escribimos por WhatsApp para cambiar la hora.'),
      body: 'Hola ' + r.nombre.split(' ')[0] + ', te recordamos tu clase de surf ' + cuando + ' en ' + a.lugar + '. Llega 10 minutos antes.\nCómo llegar: ' + MAPA });
    await env.DB.prepare('UPDATE reservas SET recordatorio = 1 WHERE ref = ?').bind(r.ref).run();
  }
  return results.length;
}

/** Cada 5 minutos: pagos pendientes, horarios no pagados y recordatorios. */
async function revisionAutomatica(env, ctx) {
  const db = env.DB, a = await ajustes(db);
  await limpiarRetenciones(db);
  const { results } = await db.prepare("SELECT * FROM reservas WHERE estado = 'pendiente' AND creada_ms > ?").bind(Date.now() - 2 * 86400000).all();
  let pagadas = 0;
  for (const r of results) {
    const e = await revisarPago(env, r, null);
    if (e === 'pagada') pagadas++;
    else if (e === 'pendiente') {
      const guarda = await db.prepare('SELECT COUNT(*) AS n FROM bloques WHERE ref = ?').bind(r.ref).first();
      if (!(guarda && guarda.n)) await db.prepare("UPDATE reservas SET estado = 'vencida' WHERE ref = ? AND estado = 'pendiente'").bind(r.ref).run();
    }
  }
  let anual = null; try { anual = await sincronizarAnual(env); } catch (x) { console.error(x); anual = { error: x.message }; }
  const rec = await recordatorios(env, a);
  let resumen = 0; try { resumen = await pushResumen(env, a); } catch (x) { console.error(x); }
  return { ok: true, revisadas: results.length, pagadas, recordatorios: rec, anual, resumen };
}

// ---------- Panel ----------
async function firmar(clave, email, ts) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(norm(email) + '|' + ts));
  return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function quien(env, d) {
  if (!env.CLAVE_WEB || !d.email || !d.ts || !d.firma) throw err('Tu sesión expiró. Vuelve a entrar.');
  const edad = Date.now() / 1000 - Number(d.ts);
  if (!(edad < SESION_DIAS * 86400 && edad > -600) || await firmar(env.CLAVE_WEB, d.email, d.ts) !== String(d.firma).toLowerCase()) throw err('Tu sesión expiró. Vuelve a entrar.');
  const email = norm(d.email), a = await ajustes(env.DB);
  if ((a.admins || []).map(norm).includes(email)) return { email, rol: 'admin', yo: '' };
  const ins = await instructores(env.DB), yo = ins.find(i => norm(i.correo) === email);
  if (yo) return { email, rol: 'instructor', yo: yo.nombre };
  throw err('Tu correo no está en la Escuela. Pídele a Isidora que lo agregue en Agenda Storm > Ajustes.');
}
const anotar = (db, q, que) => db.prepare('INSERT INTO registro (ms, quien, que) VALUES (?, ?, ?)').bind(Date.now(), q.email, que).run();
const filaPanel = (r, admin) => ({ ref: r.ref, estado: r.estado, fecha: r.fecha, hora: r.hora, personas: r.personas, menores: r.menores, ninos: r.ninos || 0, duracion: Number(r.duracion) || 0, instructores: parseLista(r.instructores),
  nombre: r.nombre, telefono: r.telefono, comentario: r.comentario, nota: r.nota, ...(admin ? { correo: r.correo, total: r.total, pagoInstructor: r.pago_instructor, pagos: pagosDe(r), medio: r.medio, creada: r.creada, linkPago: r.estado === 'pendiente' ? r.link_pago : '' } : {}) });

async function panel(env, q) {
  const db = env.DB, a = await ajustes(db), hoy = ahoraChile().fecha, admin = q.rol === 'admin';
  await limpiarRetenciones(db);
  const desde = sumarDias(hoy, -45), hasta = sumarDias(hoy, a.diasAdelante);
  const ins = await instructores(db);
  const [sem, exc, res, ocu, sync] = await Promise.all([
    db.prepare('SELECT * FROM semana').all(),
    db.prepare('SELECT * FROM excepciones WHERE fecha >= ?').bind(hoy).all(),
    db.prepare("SELECT * FROM reservas WHERE fecha BETWEEN ? AND ? AND estado IN ('pagada', 'pendiente', 'revisar') ORDER BY fecha, hora").bind(desde, hasta).all(),
    leerOcupaciones(db, hoy, hasta),
    db.prepare("SELECT valor FROM ajustes WHERE clave = 'anualSync'").first()
  ]);
  const fic = await db.prepare('SELECT ref, n, nombre FROM fichas WHERE ref IN (SELECT ref FROM reservas WHERE fecha BETWEEN ? AND ?)').bind(desde, hasta).all();
  const fichasPor = {}; fic.results.forEach(f => (fichasPor[f.ref] = fichasPor[f.ref] || []).push(f.nombre));
  const guardadas = new Set((await db.prepare('SELECT DISTINCT ref FROM bloques WHERE hasta > 0').all()).results.map(x => x.ref));
  let reservas = res.results.filter(r => r.estado !== 'pendiente' || guardadas.has(r.ref));
  if (!admin) reservas = reservas.filter(r => parseLista(r.instructores).includes(q.yo));
  const out = { ok: true, rol: q.rol, yo: q.yo, hoy, duracion: a.duracion, horarios: a.horarios,
    instructores: ins.map(i => ({ nombre: i.nombre, activo: !!i.activo, ...(admin ? { correo: i.correo, telefono: i.telefono, rut: i.rut, tarifas: (() => { try { return JSON.parse(i.tarifas || 'null'); } catch (_) { return null; } })() } : {}) })),
    semana: sem.results.map(s => ({ instructor: s.instructor, dia: s.dia, horas: parseLista(s.horas) })).filter(s => admin || s.instructor === q.yo),
    ocupaciones: ocu.filter(o => admin || o.instructor === '*' || o.instructor === q.yo).map(o => ({ id: o.id, origen: o.origen, instructor: o.instructor, fecha: o.fecha, dia: o.dia, desde: o.desde, hasta: o.hasta, motivo: o.motivo })),
    anualSync: sync ? JSON.parse(sync.valor) : null,
    excepciones: exc.results.filter(e => admin || e.instructor === q.yo).map(e => ({ instructor: e.instructor, fecha: e.fecha, hora: e.hora, libre: !!e.libre })),
    reservas: reservas.map(r => Object.assign(filaPanel(r, admin), { fichas: fichasPor[r.ref] || [], linkFicha: linkFicha(r) })), link: PAGINA };
  if (admin) {
    out.ajustes = { precios: a.precios, pagos: a.pagos, horarios: a.horarios, minHoras: a.minHoras, maxSeguidas: a.maxSeguidas, horaTarde: a.horaTarde, cierreNoche: a.cierreNoche, diasAdelante: a.diasAdelante, maxWeb: a.maxWeb, lugar: a.lugar, admins: a.admins };
    const mes = hoy.slice(0, 7);
    const m = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(pago_instructor),0) AS pago FROM reservas WHERE substr(fecha,1,7) = ? AND estado = 'pagada'").bind(mes).first();
    const porIns = await db.prepare("SELECT instructores, pago_instructor, pagos FROM reservas WHERE substr(fecha,1,7) = ? AND estado = 'pagada'").bind(mes).all();
    const pagoPor = {};
    porIns.results.forEach(r => { const p = pagosDe(r); Object.keys(p).forEach(i => { pagoPor[i] = (pagoPor[i] || 0) + p[i]; }); });
    out.mes = { mes, clases: m.n, total: m.total, pagoInstructores: m.pago, pagoPor };
    out.faltaConfigurar = ['MP_TOKEN', 'CLAVE_CORREO', 'TAREA_CLAVE', 'ONESIGNAL_KEY'].filter(k => !env[k]);
  } else {
    const mes = hoy.slice(0, 7);
    const porIns = await db.prepare("SELECT instructores, pago_instructor, pagos FROM reservas WHERE substr(fecha,1,7) = ? AND estado = 'pagada'").bind(mes).all();
    let clases = 0, pago = 0;
    porIns.results.forEach(r => { const p = pagosDe(r); if (q.yo in p) { clases++; pago += p[q.yo]; } });
    out.mes = { mes, clases, pagoYo: pago };
  }
  if (admin) { // clientes que ya reservaron, para no escribirlos de nuevo en la reserva a mano
    const cl = await env.DB.prepare("SELECT nombre, telefono, correo, MAX(creada_ms) AS ult, COUNT(*) AS n FROM reservas WHERE estado IN ('pagada', 'pendiente', 'revisar') GROUP BY lower(nombre) ORDER BY ult DESC LIMIT 1000").all();
    out.clientes = cl.results.map(c => ({ nombre: c.nombre, telefono: c.telefono || '', correo: c.correo || '', clases: c.n }));
  }
  return out;
}

/** Pago semanal (lunes a domingo): cuánto transferir a cada instructor y si ya se pagó. */
async function pagosSemana(env, q, d) {
  const db = env.DB, hoy = ahoraChile().fecha, admin = q.rol === 'admin';
  let lunes = esFecha(d.lunes) ? d.lunes : hoy;
  lunes = sumarDias(lunes, -((diaSemana(lunes) + 6) % 7));
  const domingo = sumarDias(lunes, 6);
  if (admin && d.marcar) {
    const inst = String(d.marcar.instructor || '');
    if (d.marcar.pagado) await db.prepare('INSERT OR REPLACE INTO pagos_semana (instructor, lunes, monto, pagado_el, por) VALUES (?, ?, ?, ?, ?)').bind(inst, lunes, Math.round(Number(d.marcar.monto) || 0), hoy, q.email).run();
    else await db.prepare('DELETE FROM pagos_semana WHERE instructor = ? AND lunes = ?').bind(inst, lunes).run();
    await anotar(db, q, 'pago semana ' + lunes + ' ' + inst + (d.marcar.pagado ? ' pagado' : ' desmarcado'));
  }
  const [res, pag] = await Promise.all([
    db.prepare("SELECT ref, fecha, hora, personas, menores, ninos, nombre, instructores, pago_instructor, pagos FROM reservas WHERE fecha BETWEEN ? AND ? AND estado = 'pagada' ORDER BY fecha, hora").bind(lunes, domingo).all(),
    db.prepare('SELECT * FROM pagos_semana WHERE lunes = ?').bind(lunes).all()
  ]);
  const por = {};
  res.results.forEach(r => { const p = pagosDe(r); Object.keys(p).forEach(i => {
    if (!admin && i !== q.yo) return;
    const x = por[i] = por[i] || { instructor: i, total: 0, clases: [] };
    x.total += p[i]; x.clases.push({ fecha: r.fecha, hora: r.hora, cliente: r.nombre, personas: r.personas, menores: r.menores, ninos: r.ninos || 0, monto: p[i] });
  }); });
  pag.results.forEach(x => { if (admin || x.instructor === q.yo) { const y = por[x.instructor] = por[x.instructor] || { instructor: x.instructor, total: 0, clases: [] }; y.pagado = { monto: x.monto, el: x.pagado_el }; } });
  const lista = Object.values(por).sort((a, b) => b.total - a.total);
  return { ok: true, lunes, domingo, hoy, instructores: lista, total: lista.reduce((t, x) => t + x.total, 0) };
}

/** Para Finanzas (programa de la planilla Anual): ventas del mes, por medio de pago, y lo que se paga a instructores. mes = 'AAAA-MM'. */
async function finanzasMes(env, d) {
  const mes = /^\d{4}-\d{2}$/.test(String(d.mes || '')) ? d.mes : ahoraChile().fecha.slice(0, 7);
  const { results } = await env.DB.prepare("SELECT total, medio, pago_instructor, instructores, pagos FROM reservas WHERE substr(fecha,1,7) = ? AND estado = 'pagada'").bind(mes).all();
  const porMedio = {}, porInstructor = {};
  results.forEach(r => { porMedio[r.medio] = (porMedio[r.medio] || 0) + (r.total || 0); const p = pagosDe(r); Object.keys(p).forEach(i => porInstructor[i] = (porInstructor[i] || 0) + p[i]); });
  return { ok: true, mes, clases: results.length, total: results.reduce((t, r) => t + (r.total || 0), 0), mercadoPago: porMedio['Mercado Pago'] || 0, porMedio,
    instructores: results.reduce((t, r) => t + (r.pago_instructor || 0), 0), porInstructor };
}

async function editar(env, q, d, ctx) {
  const db = env.DB, a = await ajustes(db);
  const r = await db.prepare('SELECT * FROM reservas WHERE ref = ?').bind(String(d.ref || '')).first();
  if (!r) throw err('No encontramos la reserva.');
  const fecha = d.fecha ? String(d.fecha) : r.fecha, hora = d.hora ? normHora(d.hora) : r.hora;
  if (!esFecha(fecha) || !hora) throw err('Revisa el día y la hora.');
  const ins = Array.isArray(d.instructores) && d.instructores.length ? d.instructores.map(String) : parseLista(r.instructores);
  const lista = (await instructores(db)).map(i => i.nombre);
  if (ins.some(i => !lista.includes(i))) throw err('Ese instructor no está en la Escuela.');
  const fijo = r.estado === 'pagada' || r.estado === 'revisar' ? 0 : Date.now() + a.retencionMin * 60000;
  const st = [db.prepare('DELETE FROM bloques WHERE ref = ?').bind(r.ref)];
  ins.forEach(i => bloquesDe(hora, durDe(a, r)).forEach(b => st.push(db.prepare('INSERT INTO bloques (instructor, fecha, hora, ref, hasta) VALUES (?, ?, ?, ?, ?)').bind(i, fecha, b, r.ref, fijo))));
  const estadoNuevo = r.estado === 'revisar' && /instructor/.test(r.nota) ? 'pagada' : r.estado;
  let viejo = null; try { viejo = JSON.parse(r.pagos || 'null'); } catch (_) {}
  const pagos = repartirPago(a, await tarifas(db), r.personas, r.menores, r.ninos || 0, ins, viejo && viejo._manual ? r.pago_instructor : null);
  st.push(db.prepare('UPDATE reservas SET fecha = ?, hora = ?, instructores = ?, estado = ?, pagos = ?, pago_instructor = ?, recordatorio = CASE WHEN fecha = ? THEN recordatorio ELSE 0 END WHERE ref = ?').bind(fecha, hora, JSON.stringify(ins), estadoNuevo, JSON.stringify(pagos), sumaPagos(pagos), fecha, r.ref));
  try { await db.batch(st); }
  catch (x) { if (/UNIQUE|constraint/i.test(String(x.message))) throw err('Ese instructor ya tiene otra clase a esa hora.'); throw x; }
  await anotar(db, q, 'editar ' + r.ref + ' → ' + fecha + ' ' + hora + ' ' + ins.join(', '));
  if (r.estado === 'pagada' || r.estado === 'revisar') {
    const antes = parseLista(r.instructores), nuevos = ins.filter(i => !antes.includes(i)), salen = antes.filter(i => !ins.includes(i));
    const cuando = diaCorto(fecha) + ' · ' + hora, movida = fecha !== r.fecha || hora !== r.hora;
    tarea(ctx, (async () => {
      if (nuevos.length) await enviarPush(env, await correosDe(db, nuevos), 'Te asignaron una clase 🏄', cuando + '\n' + quienClase(r));
      if (salen.length) await enviarPush(env, await correosDe(db, salen), 'Ya no tienes esta clase', diaCorto(r.fecha) + ' · ' + r.hora + '\n' + quienClase(r));
      const siguen = ins.filter(i => antes.includes(i));
      if (movida && siguen.length) await enviarPush(env, await correosDe(db, siguen), 'Clase cambiada de hora', 'Ahora: ' + cuando + '\n' + quienClase(r));
    })());
  }
  return panel(env, q);
}
async function cancelar(env, q, d, ctx) {
  const db = env.DB, ref = String(d.ref || '');
  const r = await db.prepare('SELECT * FROM reservas WHERE ref = ?').bind(ref).first();
  await db.batch([db.prepare('DELETE FROM bloques WHERE ref = ?').bind(ref), db.prepare("UPDATE reservas SET estado = 'cancelada', nota = TRIM(nota || ' ' || ?) WHERE ref = ?").bind(String(d.motivo || 'Cancelada en Agenda Storm'), ref)]);
  await anotar(db, q, 'cancelar ' + ref);
  if (r && (r.estado === 'pagada' || r.estado === 'revisar') && r.fecha >= ahoraChile().fecha) tarea(ctx, (async () => enviarPush(env, await correosDe(db, parseLista(r.instructores)), 'Clase cancelada', diaCorto(r.fecha) + ' · ' + r.hora + '\n' + quienClase(r)))());
  return panel(env, q);
}
async function disponible(env, q, d) {
  const db = env.DB, inst = q.rol === 'admin' ? String(d.instructor || '') : q.yo, fecha = String(d.fecha || ''), hora = d.hora ? normHora(d.hora) : '';
  if (!inst || !esFecha(fecha)) throw err('Faltan datos.');
  if (d.libre === null || d.libre === undefined) await db.prepare('DELETE FROM excepciones WHERE instructor = ? AND fecha = ? AND hora = ?').bind(inst, fecha, hora).run();
  else {
    const st = [];
    if (!hora) st.push(db.prepare("DELETE FROM excepciones WHERE instructor = ? AND fecha = ? AND hora != ''").bind(inst, fecha));
    st.push(db.prepare('INSERT OR REPLACE INTO excepciones (instructor, fecha, hora, libre) VALUES (?, ?, ?, ?)').bind(inst, fecha, hora, d.libre ? 1 : 0));
    await db.batch(st);
  }
  return panel(env, q);
}
async function semanaTipo(env, q, d) {
  const inst = q.rol === 'admin' ? String(d.instructor || '') : q.yo, dia = Math.floor(Number(d.dia));
  if (!inst || !(dia >= 0 && dia <= 6)) throw err('Faltan datos.');
  const horas = [...new Set((d.horas || []).map(normHora).filter(Boolean))].sort();
  await env.DB.prepare('INSERT OR REPLACE INTO semana (instructor, dia, horas) VALUES (?, ?, ?)').bind(inst, dia, JSON.stringify(horas)).run();
  return panel(env, q);
}
async function manual(env, q, d, ctx) {
  const db = env.DB, a = await ajustes(db);
  const fecha = String(d.fecha || ''), hora = normHora(d.hora), personas = Math.floor(Number(d.personas));
  if (!esFecha(fecha) || !hora) throw err('Elige el día y la hora.');
  if (!(personas >= 1)) throw err('¿Cuántas personas son?');
  const menores = Math.max(0, Math.min(personas, Math.floor(Number(d.menores) || 0)));
  const ninos = Math.max(0, Math.min(personas - menores, Math.floor(Number(d.ninos) || 0)));
  const nombre = nombrePropio(d.nombre); if (nombre.length < 2) throw err('Escribe el nombre del cliente.');
  const c = cotizar(a, personas, menores, ninos); // más de 5 adultos: sin precio de tabla (escribe el total), pago instructor = grupo
  const total = d.total === '' || d.total == null ? c.precio : Math.round(Number(String(d.total).replace(/\D/g, '')) || 0);
  const elegidos = Array.isArray(d.instructores) ? [...new Set(d.instructores.map(String).filter(Boolean))] : [];
  const nIns = Math.max(c.instructores, Math.floor(Number(d.nInstructores) || 0), elegidos.length);
  // Si van más instructores que los de la tabla (grupo grande), cada uno se paga como grupo
  const pagoManual = d.pagoInstructor === '' || d.pagoInstructor == null ? null : Math.round(Number(String(d.pagoInstructor).replace(/\D/g, '')) || 0);
  const conLink = d.medio === 'Link de pago';
  const medio = conLink ? 'Mercado Pago' : ['Transferencia', 'Efectivo', 'Por pagar', 'Mercado Pago'].includes(d.medio) ? d.medio : 'Transferencia';
  if (conLink && !(total > 0)) throw err('Escribe el total a cobrar.');
  if (conLink && !env.MP_TOKEN) throw err('Falta conectar Mercado Pago (MP_TOKEN).');
  const duracion = [60, 90, 120].includes(Number(d.duracion)) && Number(d.duracion) !== a.duracion ? Number(d.duracion) : 0;
  const ag = await estadoAgenda(db, a, fecha, fecha);
  // Los que eligió Isidora + (si faltan) los que elige la app entre los libres
  const ins = elegidos.concat(elegir(ag, a, fecha, hora, true, duracion || a.duracion).filter(i => !elegidos.includes(i))).slice(0, nIns);
  if (ins.length < nIns) throw err('Solo hay ' + ins.length + ' instructor' + (ins.length === 1 ? '' : 'es') + ' libre' + (ins.length === 1 ? '' : 's') + ' a esa hora. Elige otra hora o menos instructores.');
  if (!ins.length) throw err('No hay instructores libres a esa hora. Elige uno a mano.');
  const t = ahoraChile();
  const r = { ref: nuevaRef(), creada: t.fecha + ' ' + t.hora, creada_ms: Date.now(), estado: conLink ? 'pendiente' : 'pagada', fecha, hora, personas, menores, ninos, instructores: ins, nombre,
    telefono: String(d.telefono || '').trim(), correo: norm(d.correo), comentario: String(d.comentario || '').trim().slice(0, 500), total, pagoManual, medio, duracion, nota: 'Agregada a mano por ' + q.email };
  // Con link: el horario se guarda hasta que paguen (máximo las horas de "horasLink", y nunca después de que empiece la clase).
  const desfase = minLocal(t.fecha, t.hora) - Math.floor(Date.now() / 60000);
  const inicioMs = (minLocal(fecha, hora) - desfase) * 60000;
  const hasta = conLink ? Math.min(Date.now() + (a.horasLink || 24) * 3600000, inicioMs) : 0;
  if (conLink && hasta <= Date.now()) throw err('Esa clase ya empezó.');
  try { await guardarReserva(db, a, r, hasta); }
  catch (x) { if (/UNIQUE|constraint/i.test(String(x.message))) throw err('Ese instructor ya tiene otra clase a esa hora.'); throw x; }
  await anotar(db, q, 'manual ' + r.ref + (conLink ? ' con link' : ''));
  if (conLink) {
    const o = await crearOrden(env, r);
    if (!o) { await db.batch([db.prepare('DELETE FROM bloques WHERE ref = ?').bind(r.ref), db.prepare("UPDATE reservas SET estado = 'cancelada', nota = 'Mercado Pago no respondió' WHERE ref = ?").bind(r.ref)]); throw err('Mercado Pago no respondió. Intenta de nuevo.'); }
    const out = await panel(env, q);
    out.nuevoLink = { ref: r.ref, url: o.url, nombre: r.nombre, telefono: r.telefono, fecha, hora, personas, total, hasta: ahoraChile(hasta) };
    return out;
  }
  if (d.avisar && r.correo) tarea(ctx, avisarReserva(env, Object.assign({}, r, { instructores: JSON.stringify(ins) }), a));
  tarea(ctx, pushNueva(env, Object.assign({}, r, { instructores: JSON.stringify(ins) }), a, false));
  return panel(env, q);
}
async function guardarInstructor(env, q, d) {
  const db = env.DB, nombre = nombrePropio(d.nombre);
  if (!nombre) throw err('Escribe el nombre.');
  const a = await ajustes(db);
  if (d.borrar) {
    const fut = await db.prepare("SELECT COUNT(*) AS n FROM bloques WHERE instructor = ? AND fecha >= ?").bind(nombre, ahoraChile().fecha).first();
    if (fut && fut.n) throw err(nombre + ' tiene clases reservadas. Primero cámbialas a otro instructor, o déjalo inactivo.');
    await db.batch([db.prepare('DELETE FROM instructores WHERE nombre = ?').bind(nombre), db.prepare('DELETE FROM semana WHERE instructor = ?').bind(nombre), db.prepare('DELETE FROM excepciones WHERE instructor = ?').bind(nombre)]);
  } else {
    const existe = await db.prepare('SELECT nombre FROM instructores WHERE nombre = ?').bind(nombre).first();
    let tar = null;
    if (d.tarifas && typeof d.tarifas === 'object') { const t = {}; ['1', '2', '3', '4', '5', 'grupo'].forEach(k => { const v = Math.round(Number(String(d.tarifas[k] == null ? '' : d.tarifas[k]).replace(/\D/g, '')) || 0); if (v) t[k] = v; }); tar = Object.keys(t).length ? JSON.stringify(t) : null; }
    const st = [db.prepare('INSERT INTO instructores (nombre, correo, telefono, rut, activo, tarifas, orden) VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(orden),0)+1 FROM instructores)) ON CONFLICT(nombre) DO UPDATE SET correo = excluded.correo, telefono = excluded.telefono, rut = excluded.rut, activo = excluded.activo' + (d.tarifas ? ', tarifas = excluded.tarifas' : ''))
      .bind(nombre, norm(d.correo), String(d.telefono || '').trim(), String(d.rut || '').trim(), d.activo === false ? 0 : 1, tar)];
    if (!existe) for (let i = 0; i < 7; i++) st.push(db.prepare('INSERT OR IGNORE INTO semana (instructor, dia, horas) VALUES (?, ?, ?)').bind(nombre, i, JSON.stringify(horasBase(a, i))));
    await db.batch(st);
  }
  await anotar(db, q, 'instructor ' + nombre + (d.borrar ? ' borrado' : ''));
  return panel(env, q);
}
async function guardarAjustes(env, q, d) {
  const db = env.DB, a = await ajustes(db), st = [], n = v => Math.round(Number(String(v).replace(/\D/g, '')) || 0);
  if (d.precios) { const p = {}; for (let i = 1; i <= 5; i++) p[i] = n(d.precios[i]) || a.precios[i]; st.push(['precios', p]); }
  if (d.pagos) { const p = {}; for (let i = 1; i <= 5; i++) p[i] = n(d.pagos[i]) || 0; p.grupo = n(d.pagos.grupo) || 0; st.push(['pagos', p]); }
  if (d.horarios) { const h = [...new Set(d.horarios.map(normHora).filter(Boolean))].sort(); if (!h.length) throw err('Deja al menos un horario.'); st.push(['horarios', h]); }
  ['minHoras', 'diasAdelante', 'maxWeb', 'maxSeguidas'].forEach(k => { if (d[k] != null && d[k] !== '') st.push([k, Math.max(0, Number(d[k]) || 0)]); });
  ['horaTarde', 'cierreNoche'].forEach(k => { if (d[k]) { const h = normHora(d[k]); if (h) st.push([k, h]); } });
  if (d.lugar) st.push(['lugar', String(d.lugar).trim()]);
  if (d.admins) { const l = d.admins.map(norm).filter(x => /@/.test(x)); if (!l.includes(q.email)) l.push(q.email); st.push(['admins', l]); }
  if (st.length) await db.batch(st.map(([k, v]) => db.prepare('INSERT OR REPLACE INTO ajustes (clave, valor) VALUES (?, ?)').bind(k, JSON.stringify(v))));
  await anotar(db, q, 'ajustes ' + st.map(x => x[0]).join(','));
  return panel(env, q);
}

async function guardarFijo(env, q, d) {
  const db = env.DB;
  if (d.borrar) await db.prepare("DELETE FROM ocupaciones WHERE id = ? AND origen = 'fijo'").bind(Number(d.borrar)).run();
  else {
    const inst = String(d.instructor || ''), dia = Math.floor(Number(d.dia)), desde = normHora(d.desde), hasta = normHora(d.hasta);
    if (!inst || !(dia >= 0 && dia <= 6) || !desde || !hasta || aMin(hasta) <= aMin(desde)) throw err('Revisa el instructor, el día y las horas.');
    await db.prepare("INSERT INTO ocupaciones (origen, instructor, dia, desde, hasta, motivo) VALUES ('fijo', ?, ?, ?, ?, ?)").bind(inst, dia, desde, hasta, String(d.motivo || 'Ocupado').trim().slice(0, 60)).run();
  }
  await anotar(db, q, 'fijo ' + JSON.stringify(d));
  return panel(env, q);
}

// ---------- Ficha de inscripción y aceptación del riesgo (Sernatur) ----------
const fichasDe = async (db, ref) => (await db.prepare('SELECT n, nombre, datos, firma, creada FROM fichas WHERE ref = ? ORDER BY n').bind(ref).all()).results;
async function reservaConClave(env, d) {
  const r = await env.DB.prepare('SELECT * FROM reservas WHERE ref = ?').bind(String(d.r || d.ref || '')).first();
  if (!r || !r.clave || String(d.k || '') !== r.clave || r.estado === 'cancelada') throw err('Este link de la ficha no es válido. Escríbenos por WhatsApp.');
  return r;
}
async function actividad(env, r) {
  const a = await ajustes(env.DB), ins = parseLista(r.instructores);
  const lista = (await env.DB.prepare('SELECT nombre, rut FROM instructores').all()).results;
  return { fecha: r.fecha, fechaLarga: fechaLarga(r.fecha), inicio: r.hora, termino: deMin(aMin(r.hora) + durDe(a, r)), lugar: a.lugar,
    guia: ins.join(' y '), rutGuia: ins.map(n => (lista.find(i => i.nombre === n) || {}).rut || '').filter(Boolean).join(' / ') };
}
async function fichaVer(env, d) {
  const r = await reservaConClave(env, d);
  const hechas = await fichasDe(env.DB, r.ref);
  return { ok: true, ref: r.ref, personas: r.personas, menores: r.menores, cliente: r.nombre, telefono: r.telefono, correo: r.correo, actividad: await actividad(env, r),
    hechas: hechas.map(f => ({ n: f.n, nombre: f.nombre })) };
}
const PREGUNTAS = ['experiencia', 'seguro', 'alergias', 'medicamentos', 'regimen', 'operaciones', 'embarazada', 'otros'];
async function fichaGuardar(env, d, request) {
  const r = await reservaConClave(env, d);
  const n = Math.floor(Number(d.n));
  if (!(n >= 1 && n <= Math.max(r.personas, 30))) throw err('Participante no válido.');
  const f = d.datos || {}, t = v => String(v == null ? '' : v).trim().slice(0, 200);
  const datos = { nombre: nombrePropio(f.nombre), nacionalidad: t(f.nacionalidad), documento: t(f.documento), edad: Math.floor(Number(f.edad)) || 0, peso: t(f.peso),
    urgencia: (Array.isArray(f.urgencia) ? f.urgencia : []).slice(0, 2).map(u => ({ nombre: nombrePropio(u && u.nombre), telefono: t(u && u.telefono), correo: norm(u && u.correo) })).filter(u => u.nombre || u.telefono),
    declaracion: {}, firmante: nombrePropio(f.firmante), rutFirmante: t(f.rutFirmante), tutor: !!f.tutor, idioma: f.idioma === 'en' ? 'en' : 'es' };
  PREGUNTAS.forEach(k => { const x = (f.declaracion || {})[k] || {}; datos.declaracion[k] = { si: x.si === true, detalle: t(x.detalle) }; });
  if (datos.nombre.length < 2) throw err('Falta el nombre del participante.');
  if (!datos.documento) throw err('Falta el RUT o pasaporte.');
  if (!(datos.edad > 0 && datos.edad < 110)) throw err('Revisa la edad.');
  if (!datos.urgencia.length || !datos.urgencia[0].telefono) throw err('Falta un contacto en caso de urgencia.');
  if (PREGUNTAS.some(k => (f.declaracion || {})[k] == null || typeof (f.declaracion || {})[k].si !== 'boolean')) throw err('Responde sí o no en todas las preguntas.');
  if (datos.edad < 18 && !datos.tutor) throw err('Para menores de edad, la ficha la firma su madre, padre o tutor.');
  if (datos.firmante.length < 2 || !datos.rutFirmante) throw err('Falta el nombre y RUT de quien firma.');
  if (!d.acepta) throw err('Para seguir, acepta la declaración.');
  const firma = String(d.firma || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(firma) || firma.length < 800 || firma.length > 400000) throw err('Falta la firma.');
  const tt = ahoraChile();
  await env.DB.prepare('INSERT OR REPLACE INTO fichas (ref, n, nombre, datos, firma, creada, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(r.ref, n, datos.nombre, JSON.stringify(datos), firma, tt.fecha + ' ' + tt.hora, (request && request.headers.get('CF-Connecting-IP')) || '').run();
  return fichaVer(env, d);
}
async function fichasLeer(env, q, d) {
  const r = await env.DB.prepare('SELECT * FROM reservas WHERE ref = ?').bind(String(d.ref || '')).first();
  if (!r) throw err('No encontramos la reserva.');
  if (q.rol !== 'admin' && !parseLista(r.instructores).includes(q.yo)) throw err('Esta clase no es tuya.');
  const fs = await fichasDe(env.DB, r.ref);
  return { ok: true, ref: r.ref, personas: r.personas, cliente: r.nombre, actividad: await actividad(env, r), link: linkFicha(r),
    fichas: fs.map(f => Object.assign(JSON.parse(f.datos), { n: f.n, firma: f.firma, creada: f.creada })) };
}

// ---------- entrada ----------
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  // En la vista previa (*.storm-app.pages.dev) los links de pago, ficha y Agenda apuntan a la misma vista previa
  const base = /(^|\.)storm-app\.pages\.dev$/.test(url.hostname) ? url.origin : 'https://app.stormsurf.cl';
  PAGINA = base + '/reservar/'; PANEL = base + '/agenda/';
  try {
    if (!env.DB) throw err('Las reservas en línea no están activas en este momento. Escríbenos por WhatsApp.');
    // Aviso de Mercado Pago (webhook de órdenes), si se configura con esta URL + ?mp=1
    if (url.searchParams.get('mp')) {
      let id = url.searchParams.get('data.id') || url.searchParams.get('id');
      try { const b = await request.clone().json(); if (b && b.data && b.data.id) id = b.data.id; } catch (_) {}
      if (id) { const r = await env.DB.prepare('SELECT * FROM reservas WHERE orden_mp = ?').bind(String(id)).first(); if (r) await revisarPago(env, r, context); }
      return json({ ok: true });
    }
    if (url.searchParams.get('tarea')) {
      if (!env.TAREA_CLAVE || url.searchParams.get('tarea') !== env.TAREA_CLAVE) return json({ ok: false }, 403);
      return json(await revisionAutomatica(env, context));
    }
    if (request.method === 'GET') return json({ ok: true, servicio: 'Storm Escuela · reservas' });
    if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
    const d = await request.json().catch(() => ({}));
    const acc = d.accion;
    if (acc === 'disponibilidad') return json(await disponibilidad(env.DB, d));
    if (acc === 'reservar') return json(await reservar(env, d));
    if (acc === 'estado') return json(await estado(env, d, context));
    if (acc === 'ficha') return json(await fichaVer(env, d));
    if (acc === 'ficha-guardar') return json(await fichaGuardar(env, d, request));
    const q = await quien(env, d);
    if (acc === 'fichas') return json(await fichasLeer(env, q, d));
    if (acc === 'escuela') return json(await panel(env, q));
    if (acc === 'pagos-semana') return json(await pagosSemana(env, q, d));
    if (acc === 'disponible') return json(await disponible(env, q, d));
    if (acc === 'semana') return json(await semanaTipo(env, q, d));
    if (q.rol !== 'admin') throw err('Solo un administrador puede hacer esto.');
    if (acc === 'finanzas-mes') return json(await finanzasMes(env, d));
    if (acc === 'editar') return json(await editar(env, q, d, context));
    if (acc === 'cancelar') return json(await cancelar(env, q, d, context));
    if (acc === 'manual') return json(await manual(env, q, d, context));
    if (acc === 'instructor') return json(await guardarInstructor(env, q, d));
    if (acc === 'ajustes') return json(await guardarAjustes(env, q, d));
    if (acc === 'fijo') return json(await guardarFijo(env, q, d));
    if (acc === 'sincronizar') { await sincronizarAnual(env, true); return json(await panel(env, q)); }
    if (acc === 'revisar') return json(await revisionAutomatica(env, context));
    throw err('Acción desconocida');
  } catch (x) {
    console.error(x);
    return json({ ok: false, error: x.publico ? x.message : 'Algo falló. Intenta de nuevo en un momento.' });
  }
}

