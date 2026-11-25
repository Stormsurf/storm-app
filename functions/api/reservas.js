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
import { reintentarBoletas, boletasMes } from './pagar.js';

const TZ = 'America/Santiago';
const MP_API = 'https://api.mercadopago.com';
let PAGINA = 'https://app.stormsurf.cl/reservar/';
let PANEL = 'https://app.stormsurf.cl/agenda/';
const CORREO_URL = 'https://script.google.com/macros/s/AKfycbzmzD794KtxFxndjERPQ8kneEvRMyBmd7tmcgD7Rvdl6eJv2ZsHDsFBnAvluCQYDOZ7/exec';
const CORREO_STORM = 'isidoravergara@gmail.com';
const MAPA = 'https://maps.app.goo.gl/xcFSTmgfwwKACqfb7';
const TRAER = ['Traje de baño (para usar debajo del wetsuit)', 'Toalla', 'Bloqueador solar', 'Botella con agua', 'Ropa cómoda para después de la clase'];
const WHATSAPP = '56977744306';
// Reseñas (Isidora 16-11): reemplaza el correo de AgendaPro. Sin link de Google no se manda nada.
const GOOGLE_RESENA = 'https://g.page/r/CVXN28sfJWmyEAE/review';
const RESENA_DESDE = '2026-11-17'; // solo clases desde este día (no se le escribe a clientes antiguos)
const RESENA_HORAS = 2; // horas después de que termina la clase
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
  maxWeb: 4,             // más personas = por WhatsApp (Armada 24-11: 1 instructor cada 4 alumnos)
  maxSeguidas: 2,
  // Enero y febrero: la Academia de Verano usa lun, mar, jue y vie de 9:00 a 12:00; en ese rato queda 1 instructor para particulares
  // Esos días la primera clase parte 9:30 (no llegar junto con los niños de la Academia): 9:00 → 9:30 y 10:30 → 11:00
  verano: { meses: [1, 2], dias: [1, 2, 4, 5], desde: '09:00', hasta: '12:00', instructores: 1, cambios: { '09:00': '09:30', '10:30': '11:00' } },
  horasLink: 24,         // reservas anotadas a mano con link de pago: horas que se guarda el horario        // se juntan las clases en el mismo instructor hasta 2 seguidas
  lugar: 'Playa de Matanzas',
  pack: { clases: 5, descuento: 10, meses: 1 }, // pack (meses: se usa dentro de 1 mes desde que se paga, Isidora 21-11) de clases particulares (Isidora 16-11): 5 clases con 10% de descuento, sin vencimiento por ahora
  intermedio: { precio: 50000, instructores: ['Diego', 'Francisco'] }, // clase para alumnos intermedios: precio si es individual (desde 2, tabla normal), solo con estos instructores
  admins: ['isidoravergara@gmail.com', 'contacto@stormsurf.cl']
};
const INSTRUCTORES_BASE = ['Diego', 'Iñaki', 'Francisco', 'Emerson'];
const FIJOS_BASE = [['Francisco', 6, '09:00', '11:00', 'Taller municipal'], ['Francisco', 0, '12:00', '14:00', 'Taller municipal']];
// Instructores que dan el Surfskate de la Academia Anual (solo a ellos se les bloquea la agenda en ese horario)
const INST_SKATE = ['Emerson', 'Diego'];
// Instructores que solo dan clases particulares (no son de la Academia Anual): la clase de Surf de la Anual no les bloquea la agenda
const SOLO_PARTICULARES = ['Christopher'];
/** ¿Esta ocupación le toca a este instructor? */
const leToca = (o, inst) => o.instructor === inst || (o.instructor === '*' && !(o.origen === 'anual' && SOLO_PARTICULARES.includes(inst)));
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
/** Mismo día n meses después (si no existe, el último día de ese mes): 21-11 + 1 mes = 21-12. */
const sumarMeses = (f, n) => { const [y, m, d] = f.split('-').map(Number), u = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate(); const x = new Date(Date.UTC(y, m - 1 + n, Math.min(d, u))); return x.toISOString().slice(0, 10); };
const sumarDias = (f, n) => new Date(diaUTC(f) + n * 86400000).toISOString().slice(0, 10);
/** minutos "de reloj de Chile" desde 1970: sirven para comparar fechas y horas locales */
const minLocal = (f, h) => diaUTC(f) / 60000 + aMin(h);
const fechaLarga = f => { const d = new Date(diaUTC(f)); return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()]; };
// Clientes que reservaron en inglés: quedan marcados en la nota de la reserva (la ven Isidora y el instructor en Agenda Storm)
const NOTA_EN = 'Cliente en inglés';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateLong = f => { const d = new Date(diaUTC(f)); return DAYS[d.getUTCDay()] + ', ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate(); };
const enIngles = r => !!r && /en ingl[eé]s/i.test(r.nota || '');
const BRING = ['Swimsuit (to wear under the wetsuit)', 'Towel', 'Sunscreen', 'Water bottle', 'Comfortable clothes for after the lesson'];
/** Duración de una reserva: la propia (anotadas a mano, ej. 1 hora) o la general */
const durDe = (a, r) => Number(r && r.duracion) || a.duracion;
const bloquesDe = (hora, duracion) => { const ini = Math.floor(aMin(hora) / BLOQUE) * BLOQUE, n = Math.ceil(duracion / BLOQUE); return Array.from({ length: n }, (_, k) => deMin(ini + k * BLOQUE)); };

// ---------- lectura ----------
async function ajustes(db) {
  const { results } = await db.prepare('SELECT clave, valor FROM ajustes').all();
  const a = JSON.parse(JSON.stringify(AJUSTES_BASE));
  results.forEach(r => { try { a[r.clave] = JSON.parse(r.valor); } catch (_) {} });
  a.maxWeb = Math.min(Number(a.maxWeb) || MAX_GRUPO, MAX_GRUPO); // nunca más de 4 por la web (regla Armada), aunque Ajustes diga otra cosa
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
/** Anotada a mano en la agenda: nunca se borra sola aunque no paguen (queda como 'sin pagar' para cobrarla). */
const aMano = r => /^Agregada a mano/.test(String((r && r.nota) || ''));
/** Diferencias por cobrar (p. ej. sumaron una persona a una clase ya pagada): [{ monto, medio ('' = falta cobrar), fecha }] */
const saldosDe = r => { try { const v = JSON.parse((r && r.saldos) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
/** Las partes pagadas de una clase: el pago original y cada diferencia ya cobrada, cada una con su forma de pago. */
const partesPago = r => { const sl = saldosDe(r), base = (r.total || 0) - sl.reduce((t, x) => t + (x.monto || 0), 0);
  return [{ monto: base, medio: r.medio, k: '' }].concat(sl.map((x, i) => ({ monto: x.monto || 0, medio: x.medio, k: '#' + i })).filter(x => x.medio && x.medio !== 'favor')); };
const parseLista = s => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };

/** Grupos por instructor (cada grupo se cobra como una clase de su tamaño):
 *  - menores de 8: de a 2 por instructor; si sobra uno, va con los demás (o, si no hay más, con el último par: 3 niños = 1 instructor) (menores de 5: clase individual, aviso en la página);
 *  - (ninos: reservado por si se vuelve a separar por edades; hoy siempre 0)
 *  - desde 12 años cuenta como adulto; máximo 4 por instructor (Armada 24-11-2026).
 *  Ej.: 4 niños = 2+2; 3 niños = 3; 3 niños + 1 adulto = 2+2. */
const edades = r => { const t = []; if (r.menores) t.push(r.menores + ' menor' + (r.menores === 1 ? '' : 'es') + ' de 8'); if (r.ninos) t.push(r.ninos + ' de 7 a 11'); return (t.length ? ' (' + t.join(', ') + ')' : '') + (r.nivel === 'intermedio' ? ' · clase intermedia' : ''); };
const MAX_MENORES = 2, MAX_NINOS = 3, MAX_GRUPO = 4; // Armada (24-11-2026): máximo 4 alumnos por instructor
// Formas de pago de las clases anotadas a mano ('Mercado Pago' = reserva online)
const MEDIOS = ['POS', 'Transferencia', 'Efectivo', 'Factura', 'Por pagar', 'Mercado Pago', 'Flow', 'Webpay', 'Webpay crédito', 'Webpay débito'];
function cotizar(a, personas, menores, ninos, nivel) {
  personas = Math.floor(Number(personas)); menores = Math.floor(Number(menores) || 0); ninos = Math.floor(Number(ninos) || 0);
  const inter = nivel === 'intermedio'; if (inter) { menores = 0; ninos = 0; }
  if (!(personas >= 1)) throw err('Elige cuántas personas son.');
  if (menores < 0 || ninos < 0 || menores + ninos > personas) throw err('Revisa cuántos son niños.');
  const grupos = [];
  const pares = Math.floor(menores / MAX_MENORES);
  for (let k = 0; k < pares; k++) grupos.push({ personas: MAX_MENORES, ninos: true });
  let resto = personas - pares * MAX_MENORES; // incluye al niño que sobra
  if (pares && resto === 1) { grupos[grupos.length - 1].personas += 1; resto = 0; } // una sola persona suelta (niño o adulto) va con el último par
  if (resto > 0) {
    // cuántos instructores para el resto: hasta 4 por grupo y hasta 3 niños de 7-11 por grupo; repartidos parejo
    const n = personas > a.maxWeb && !ninos ? 1 : Math.max(Math.ceil(resto / MAX_GRUPO), Math.ceil(ninos / MAX_NINOS), 1);
    for (let g = 0; g < n; g++) grupos.push({ personas: Math.floor(resto / n) + (g < resto % n ? 1 : 0), ninos: false });
  }
  let precio = 0, pago = 0;
  grupos.forEach(g => {
    g.precio = inter && g.personas === 1 ? Number((a.intermedio || {}).precio) || 0 : Number(a.precios[g.personas]) || 0; // intermedio: $50.000 individual (Isidora 21-11); desde 2 personas, precio normal
    g.pago = Number(g.personas <= 5 ? a.pagos[g.personas] : a.pagos.grupo) || Number(a.pagos.grupo) || 0;
    precio += g.precio; pago += g.pago;
  });
  return { personas, menores, ninos, nivel: inter ? 'intermedio' : '', instructores: grupos.length, grupos, precio, pagoInstructor: pago };
}
/** Instructores que pueden dar ese tipo de clase (null = todos). */
function soloNivel(a, nivel) {
  return nivel === 'intermedio' ? ((a.intermedio || {}).instructores || []) : null;
}

/** Academia Anual (todos los instructores) y horas fijas de cada uno (talleres, etc.). */
async function leerOcupaciones(db, desde, hasta) {
  const { results } = await db.prepare("SELECT * FROM ocupaciones WHERE fecha = '' OR fecha BETWEEN ? AND ?").bind(desde, hasta).all();
  return results;
}
/** ¿La clase (hora + duración) se cruza con algo que el instructor ya tiene ese día? Devuelve el motivo. */
function cruce(ocu, inst, fecha, hora, duracion) {
  const ini = aMin(hora), fin = ini + duracion, dia = diaSemana(fecha);
  const o = ocu.find(o => leToca(o, inst) && (o.fecha ? o.fecha === fecha : o.dia === dia) && aMin(o.desde) < fin && aMin(o.hasta) > ini);
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
      // Se guardan también los días ya pasados del mes, para que la agenda de días anteriores siga mostrando la clase.
      // Surfskate bloquea solo a los instructores que la dan; Surf bloquea a todos.
      if (esFecha(c.fecha) && h.length >= 2) (/skate/i.test(c.clase || '') ? INST_SKATE : ['*']).forEach(i => filas.push([i, c.fecha, normHora(h[0]), normHora(h[1]), 'Academia Anual · ' + (c.clase || '')]));
    });
  }
  const st = [db.prepare("DELETE FROM ocupaciones WHERE origen = 'anual'")];
  filas.forEach(f => st.push(db.prepare("INSERT INTO ocupaciones (origen, instructor, fecha, desde, hasta, motivo) VALUES ('anual', ?, ?, ?, ?, ?)").bind(...f)));
  const info = { ms: Date.now(), cuando: hoy + ' ' + ahoraChile().hora, clases: new Set(filas.map(f => f[1] + f[2])).size };
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
  const c = cotizar(a, personas, Math.min(personas, Math.floor(Number(d.menores) || 0)), Math.floor(Number(d.ninos) || 0), d.nivel), solo = soloNivel(a, c.nivel);
  const hasta = sumarDias(hoy.fecha, a.diasAdelante);
  const ag = await estadoAgenda(db, a, hoy.fecha, hasta);
  const activos = ag.ins.filter(i => i.activo && (!solo || solo.includes(i.nombre)));
  const dias = {};
  for (let f = hoy.fecha; f <= hasta; f = sumarDias(f, 1)) {
    const horas = horasDia(a, f).filter(h => permitido(a, f, h, hoy) && topeVerano(a, ag, f, h, activos.filter(i => ag.libre(i.nombre, f, h)).map(i => i.nombre)).length >= c.instructores);
    if (horas.length) dias[f] = horas;
  }
  return { ok: true, pack: a.pack || AJUSTES_BASE.pack, precios: a.precios, intermedio: (a.intermedio || {}).precio || 0, maxWeb: a.maxWeb, duracion: a.duracion, lugar: a.lugar, whatsapp: WHATSAPP, cotizacion: c, dias, hoy: hoy.fecha, hasta };
}

// ---------- reservar y pagar ----------
const nuevaClave = () => [...crypto.getRandomValues(new Uint8Array(9))].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
const linkFicha = r => PAGINA + 'ficha/?r=' + encodeURIComponent(r.ref) + '&k=' + encodeURIComponent(r.clave || '') + (enIngles(r) ? '&l=en' : '');
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
 *  Si Isidora escribió el pago a mano, es el pago de CADA instructor. */
function repartirPago(a, tar, personas, menores, ninos, ins, pagoManual) {
  const out = {};
  if (pagoManual != null) { ins.forEach(n => out[n] = pagoManual); out._manual = 1; return out; } // escrito a mano: es lo que gana CADA instructor
  const c = cotizar(a, personas, menores, ninos);
  ins.forEach((n, k) => {
    const g = c.grupos[k], clave = g && g.personas <= 5 ? g.personas : 'grupo', t = tar[n] || {};
    out[n] = Number(t[clave]) || Number(a.pagos[clave]) || Number(t.grupo) || Number(a.pagos.grupo) || 0;
  });
  return out;
}
/** Pago por instructor escrito a mano antes (o null si se calculó con la tabla) */
const manualDe = p => { if (!p || !p._manual) return null; const v = Object.keys(p).filter(k => k !== '_manual').map(k => Number(p[k]) || 0); return v.length ? v[0] : null; };
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
  const st = [db.prepare(`INSERT INTO reservas (ref, creada, creada_ms, estado, fecha, hora, personas, menores, ninos, instructores, nombre, telefono, correo, comentario, total, pago_instructor, medio, orden_mp, nota, clave, pagos, duracion, nivel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(r.ref, r.creada, r.creada_ms, r.estado, r.fecha, r.hora, r.personas, r.menores, r.ninos || 0, JSON.stringify(r.instructores),
      r.nombre, r.telefono, r.correo, r.comentario, r.total, r.pago_instructor, r.medio, r.orden_mp || '', r.nota || '', r.clave || (r.clave = nuevaClave()), JSON.stringify(r.pagos), Number(r.duracion) || 0, r.nivel || '')];
  r.instructores.forEach(i => bloquesDe(r.hora, durDe(a, r)).forEach(b => st.push(db.prepare('INSERT INTO bloques (instructor, fecha, hora, ref, hasta) VALUES (?, ?, ?, ?, ?)').bind(i, r.fecha, b, r.ref, hastaMs))));
  if (r.pack) st.push(db.prepare('UPDATE reservas SET pack = ? WHERE ref = ?').bind(r.pack, r.ref));
  await db.batch(st);
}
const limpiarRetenciones = db => db.prepare('DELETE FROM bloques WHERE hasta > 0 AND hasta < ?').bind(Date.now()).run();

async function reservar(env, d, ctx) {
  const db = env.DB, a = await ajustes(db);
  const fecha = String(d.fecha || ''), hora = normHora(d.hora);
  if (!esFecha(fecha) || !hora || !horasDia(a, fecha).includes(hora)) throw err('Elige un día y un horario.');
  // Agendar con su pack (link personal): mismas personas del pack, sin pagar.
  const conPack = d.pack && d.pack !== 'comprar' ? await packDelLink(db, d.pack, d.k) : null;
  if (conPack) { if (conPack.quedan <= 0) throw err('Ya usaste todas las clases de tu pack.'); if (fecha > conPack.vence) throw err('Tu pack vence el ' + fechaLarga(conPack.vence) + '. Elige un día hasta esa fecha.'); d.personas = conPack.personas; d.menores = conPack.menores || 0; d.ninos = 0; d.nivel = conPack.nivel || ''; }
  const personas = Math.floor(Number(d.personas));
  if (!(personas >= 1 && personas <= a.maxWeb)) throw err('Para más de ' + a.maxWeb + ' personas escríbenos por WhatsApp.');
  const c = cotizar(a, personas, d.menores, d.ninos, d.nivel), solo = soloNivel(a, c.nivel);
  const nombre = nombrePropio(d.nombre), telefono = String(d.telefono || '').trim(), correo = norm(d.correo), comentario = String(d.comentario || '').trim().slice(0, 500);
  if (nombre.length < 2) throw err('Escribe tu nombre.');
  if (telefono.replace(/\D/g, '').length < 8) throw err('Revisa tu teléfono.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw err('Revisa tu correo.');
  if (!d.acepta) throw err('Para reservar, acepta las condiciones.');
  if (!permitido(a, fecha, hora)) throw err('Ese horario ya no se puede reservar. Elige otro.');
  if (!conPack && !env.MP_TOKEN) throw err('Las reservas en línea no están activas en este momento. Escríbenos por WhatsApp.');
  const comprar = d.pack === 'comprar';
  if (comprar && personas >= 4) throw err('El pack de clases es para 1 a 3 personas.'); // Isidora 21-11
  if (comprar && fecha > sumarMeses(ahoraChile().fecha, await packMeses(db))) throw err('El pack se usa dentro de 1 mes: elige un día hasta el ' + fechaLarga(sumarMeses(ahoraChile().fecha, await packMeses(db))) + '.');
  await limpiarRetenciones(db);
  const ref = nuevaRef(), t = ahoraChile();
  const base = { ref, creada: t.fecha + ' ' + t.hora, creada_ms: Date.now(), estado: conPack ? 'pagada' : 'pendiente', fecha, hora, personas, menores: c.menores, ninos: c.ninos, nombre, telefono, correo, comentario,
    total: conPack ? 0 : c.precio, pago_instructor: c.pagoInstructor, medio: conPack ? 'Pack' : 'Mercado Pago', nivel: c.nivel, ...(d.idioma === 'en' ? { nota: NOTA_EN } : {}) };
  if (conPack) base.pack = conPack.id;
  if (comprar) { // compra el pack: paga el pack completo y esta es su 1ª clase
    const k = a.pack || AJUSTES_BASE.pack;
    base.total = Math.round(c.precio * k.clases * (100 - k.descuento) / 100 / 100) * 100;
    base.pack = (await crearPack(db, a, null, { web: true, nombre, telefono, correo, personas, menores: c.menores, nivel: c.nivel, total: base.total })).id;
  }
  // Instructor al azar entre los libres; si dos personas reservan a la vez, el segundo intenta con otro.
  let elegido = null;
  for (let intento = 0; intento < 3 && !elegido; intento++) {
    const ag = await estadoAgenda(db, a, fecha, fecha);
    const libres = topeVerano(a, ag, fecha, hora, elegir(ag, a, fecha, hora).filter(n => !solo || solo.includes(n)));
    if (libres.length < c.instructores) break;
    const r = Object.assign({}, base, { instructores: libres.slice(0, c.instructores) });
    try { await guardarReserva(db, a, r, conPack ? 0 : Date.now() + a.retencionMin * 60000); elegido = r; }
    catch (x) { if (!/UNIQUE|constraint/i.test(String(x.message))) throw x; }
  }
  if (!elegido) throw err('Ese horario se acaba de ocupar. Elige otro.');
  if (conPack) {
    const fin = Object.assign({}, elegido, { instructores: JSON.stringify(elegido.instructores) });
    tarea(ctx, avisarReserva(env, fin, a)); tarea(ctx, pushNueva(env, fin, a, true));
    return { ok: true, ref, pack: true };
  }
  const o = await crearOrden(env, elegido);
  if (!o) {
    await db.batch([db.prepare('DELETE FROM bloques WHERE ref = ?').bind(ref), db.prepare("UPDATE reservas SET estado = 'cancelada', nota = ? WHERE ref = ?").bind('Mercado Pago no respondió', ref)]);
    throw err('No pudimos conectar con Mercado Pago. Intenta de nuevo en un momento.');
  }
  return { ok: true, url: o.url, ref, total: elegido.total };
}

/** Link de pago de Storm (/pagar/): ahí se elige tarjeta (sin salir a la app de Mercado Pago) o cuenta Mercado Pago. */
const linkStorm = u => { const m = /[?&]order_id=(ORD[A-Z0-9]+)/.exec(u || ''); return m ? PAGINA.replace(/reservar\/$/, '') + 'pagar/?o=' + m[1] : (u || ''); };

/** Crea el cobro en Mercado Pago y lo deja anotado en la reserva. Devuelve { id, url } o null si Mercado Pago no respondió. */
async function crearOrden(env, r) {
  const vuelta = PAGINA + '?ref=' + encodeURIComponent(r.ref) + '&pago=';
  const orden = {
    type: 'online', processing_mode: 'manual', total_amount: String(r.total), external_reference: r.ref,
    description: 'Clase de surf Storm', ...(r.correo ? { payer: { email: r.correo } } : {}),
    items: [{ title: r.pack ? (enIngles(r) ? 'Storm pack of ' + ((r.packClases) || 5) + ' surf lessons · ' : 'Pack de ' + ((r.packClases) || 5) + ' clases de surf Storm · ') + r.personas + (enIngles(r) ? (r.personas === 1 ? ' person' : ' people') : (r.personas === 1 ? ' persona' : ' personas')) : enIngles(r) ? 'Storm surf lesson · ' + r.personas + (r.personas === 1 ? ' person' : ' people') + ' · ' + dateLong(r.fecha) + ' ' + r.hora : 'Clase de surf Storm · ' + r.personas + (r.personas === 1 ? ' persona' : ' personas') + ' · ' + fechaLarga(r.fecha) + ' ' + r.hora, quantity: 1, unit_price: String(r.total) }],
    config: { online: { success_url: vuelta + 'ok', pending_url: vuelta + 'pendiente', failure_url: vuelta + 'error', auto_return: 'approved' } , payment_method: { max_installments: 1 } }
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
// Flow (tarjeta extranjera desde /pagar): el cobro se guarda en orden_mp como "flow:<token>". Estados: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada.
async function flowEstado(env, token) {
  if (!env.FLOW_API_KEY || !env.FLOW_SECRET) return null;
  const p = { apiKey: env.FLOW_API_KEY, token };
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.FLOW_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(Object.keys(p).sort().map(x => x + p[x]).join(''))))].map(b => b.toString(16).padStart(2, '0')).join('');
  try { const x = await fetch((env.FLOW_API || 'https://www.flow.cl/api') + '/payment/getStatus?' + new URLSearchParams(Object.assign({}, p, { s }))); return x.ok ? await x.json() : null; } catch (_) { return null; }
}

// Webpay Plus (Transbank) desde /pagar: orden_mp = "webpay:<token>". Se consulta el estado de la transacción (sirve hasta 7 días).
async function webpayEstado(env, token) {
  if (/\.storm-app\.pages\.dev\//.test(PAGINA) && !env.WEBPAY_CODIGO) env = Object.assign({}, env, { WEBPAY_PRUEBA: '1' }); // vista previa: modo prueba
  const c = env.WEBPAY_CODIGO && env.WEBPAY_LLAVE ? [env.WEBPAY_API || 'https://webpay3g.transbank.cl', env.WEBPAY_CODIGO, env.WEBPAY_LLAVE]
    : env.WEBPAY_PRUEBA ? ['https://webpay3gint.transbank.cl', '597055555532', '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C'] : null;
  if (!c) return null;
  try { const x = await fetch(c[0] + '/rswebpaytransaction/api/webpay/v1.2/transactions/' + encodeURIComponent(token), { headers: { 'Tbk-Api-Key-Id': c[1], 'Tbk-Api-Key-Secret': c[2] } }); return x.ok ? await x.json() : null; } catch (_) { return null; }
}

async function revisarPago(env, r, ctx) {
  const om = String((r && r.orden_mp) || '');
  if (r && (r.estado === 'pendiente' || r.estado === 'vencida') && om.startsWith('flow:')) {
    const o = await flowEstado(env, om.slice(5));
    return o && Number(o.status) === 2 && String(o.commerceOrder || '').indexOf(r.ref) === 0 ? confirmar(env, r, Number(o.amount), ctx) : r.estado;
  }
  if (r && (r.estado === 'pendiente' || r.estado === 'vencida') && om.startsWith('webpay:')) {
    const o = await webpayEstado(env, om.slice(7));
    if (!(o && o.status === 'AUTHORIZED' && Number(o.response_code) === 0)) return r.estado;
    // Débito o prepago vs crédito: Finanzas cobra distinta comisión
    r.medio = ['VD', 'VP'].includes(o.payment_type_code) ? 'Webpay débito' : 'Webpay crédito';
    await env.DB.prepare('UPDATE reservas SET medio = ? WHERE ref = ?').bind(r.medio, r.ref).run();
    return confirmar(env, r, Number(o.amount), ctx);
  }
  if (!r || r.estado !== 'pendiente' && r.estado !== 'vencida' || !r.orden_mp || !env.MP_TOKEN) return r && r.estado;
  let o = null;
  try {
    const x = await fetch((env.MP_API || MP_API) + '/v1/orders/' + encodeURIComponent(r.orden_mp), { headers: { Authorization: 'Bearer ' + env.MP_TOKEN } });
    if (x.ok) o = await x.json();
  } catch (_) {}
  if (!o) return r.estado;
  if (o.status === 'processed' && o.status_detail === 'accredited') return confirmar(env, r, Number(o.total_paid_amount || o.total_amount), ctx);
  if (['canceled', 'expired', 'failed', 'refunded'].includes(o.status)) {
    if (aMano(r)) return r.estado; // anotada a mano: se queda esperando pago (se cobra después)
    await env.DB.batch([env.DB.prepare('DELETE FROM bloques WHERE ref = ?').bind(r.ref), env.DB.prepare("UPDATE reservas SET estado = 'vencida' WHERE ref = ? AND estado = 'pendiente'").bind(r.ref)]);
    return 'vencida';
  }
  return r.estado;
}

async function confirmar(env, r, monto, ctx) {
  const db = env.DB, a = await ajustes(db);
  if (Math.round(monto) < r.total) { await db.prepare("UPDATE reservas SET estado = 'revisar', nota = TRIM(COALESCE(nota, '') || ' · ' || ?, ' ·') WHERE ref = ?").bind('Monto pagado distinto: ' + clp(monto), r.ref).run(); return 'revisar'; }
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
      await db.prepare("UPDATE reservas SET estado = 'revisar', nota = TRIM(COALESCE(nota, '') || ' · Pagó tarde y el instructor ya tenía otra clase: asígnale otro instructor', ' ·') WHERE ref = ?").bind(r.ref).run();
      tarea(ctx, correoStorm(env, 'Revisar reserva ' + r.ref, 'Llegó el pago de ' + r.nombre + ' (' + fechaLarga(r.fecha) + ' ' + r.hora + '), pero el instructor ya tenía otra clase. Asígnale otro instructor en Agenda Storm.'));
      return 'revisar';
    }
  }
  if (r.pack) await activarPack(db, r);
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
    ficha: est === 'pagada' || est === 'revisar' ? linkFicha(r) : '', ...(r.pack && (est === 'pagada' || est === 'revisar') ? await (async () => { try { const p = (await packsLista(env.DB)).find(x => x.id === r.pack); return p ? { pack: { link: p.link, quedan: p.quedan, clases: p.clases, vence: p.vence, venceLarga: fechaLarga(p.vence), venceEN: dateLong(p.vence) } } : {}; } catch (_) { return {}; } })() : {}) };
}

// ---------- notificaciones a la app (Panel Storm / Agenda Storm, OneSignal) ----------
// Llegan a quien tenga la app con notificaciones activadas y haya entrado con ese correo. Requiere ONESIGNAL_KEY (secreto en Cloudflare).
const ONESIGNAL_APP = 'be18352b-5820-4912-aa46-d851890394a3';
async function enviarPush(env, correos, titulo, texto, ref) {
  const a = [...new Set((correos || []).map(norm).filter(Boolean))];
  if (!env.ONESIGNAL_KEY || !a.length) return false;
  const r = await fetch('https://api.onesignal.com/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: (/^os_v2_/.test(env.ONESIGNAL_KEY) ? 'Key ' : 'Basic ') + env.ONESIGNAL_KEY }, // llaves nuevas (os_v2_) o antiguas
    body: JSON.stringify({ app_id: ONESIGNAL_APP, target_channel: 'push', include_aliases: { external_id: a }, headings: { en: titulo, es: titulo }, contents: { en: texto, es: texto }, url: PANEL + (ref ? '?clase=' + encodeURIComponent(ref) : '') }) }); // tocar el aviso abre esa clase
  const t = await r.text(); if (!r.ok) console.error('push', r.status, t);
  let j = {}; try { j = JSON.parse(t); } catch (_) {}
  // true = llegó a alguien; si no, el detalle de OneSignal (ej. ese correo no tiene la app con notificaciones)
  return r.ok && !j.errors ? true : (j.errors ? JSON.stringify(j.errors) : 'HTTP ' + r.status);
}
const correosDe = async (db, nombres) => (await db.prepare('SELECT nombre, correo FROM instructores').all()).results.filter(i => nombres.includes(i.nombre) && i.correo).map(i => i.correo);
const diaCorto = f => { const t = fechaLarga(f); return t.charAt(0).toUpperCase() + t.slice(1); };
const quienClase = r => r.nombre + ' · ' + r.personas + ' persona' + (r.personas === 1 ? '' : 's');
/** Clase nueva: a los instructores de la clase y (si reservó el cliente) a las administradoras */
async function pushNueva(env, r, a, aAdmins) {
  const ins = parseLista(r.instructores), dur = durDe(a, r);
  const cuando = diaCorto(r.fecha) + ' · ' + r.hora + ' a ' + deMin(aMin(r.hora) + dur);
  const p = [enviarPush(env, await correosDe(env.DB, ins), 'Nueva clase particular 🏄', cuando + '\n' + quienClase(r) + (ins.length > 1 ? ' · con ' + ins.join(' y ') : ''), r.ref)];
  if (aAdmins) p.push(enviarPush(env, a.admins, 'Nueva reserva 🏄 ' + clp(r.total), cuando + '\n' + quienClase(r) + ' · ' + ins.join(' y '), r.ref));
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
function cajaCorreo(titulo, filas, pie, despedida) {
  const F = 'font-family:Helvetica,Arial,sans-serif;';
  return ('<div style="background:#EFECE8;padding:28px 12px;' + F + 'color:#2C2C2B"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto">' +
    '<tr><td style="background:#fff;border-radius:18px;padding:28px 26px">' +
    '<h1 style="font-size:26px;line-height:1.15;margin:0 0 14px">' + titulo + '</h1>' + filas +
    '<p style="margin:22px 0 0;font-size:15px;line-height:1.55;color:#5c5b58">' + pie + '</p>' +
    '<p style="margin:18px 0 0;font-size:16px">' + (despedida || 'Nos vemos en el agua 🌊<br><b>Equipo Storm</b>') + '</p></td></tr>' +
    '<tr><td style="text-align:center;padding:18px 8px 0;font-size:12px;color:#8a8986">Storm Surf Academy · Playa de Matanzas · <a href="https://wa.me/' + WHATSAPP + '" style="color:#2d6e94">WhatsApp +56 9 7774 4306</a></td></tr></table></div>')
    .replace(/[^\x00-\x7F]/gu, c => '&#' + c.codePointAt(0) + ';');
}
const botonFicha = r => '<span style="display:block;margin:0 0 18px;padding:16px;border-radius:14px;background:#FFF6DA;color:#3B2610"><b style="font-size:16px">Falta un paso: la ficha de cada participante</b><br>' +
  'Es obligatoria para entrar al mar (Sernatur). Toma 2 minutos por persona.<br><a href="' + linkFicha(r) + '" style="display:inline-block;margin-top:10px;background:#2C2C2B;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:999px">Llenar la ficha</a></span>';
const botonFichaEN = r => '<span style="display:block;margin:0 0 18px;padding:16px;border-radius:14px;background:#FFF6DA;color:#3B2610"><b style="font-size:16px">One more step: a form for each participant</b><br>' +
  'It is required to go into the ocean (Sernatur). It takes 2 minutes per person.<br><a href="' + linkFicha(r) + '" style="display:inline-block;margin-top:10px;background:#2C2C2B;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:999px">Fill in the form</a></span>';
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
    '<tr>' + dato('Dónde', esc(a.lugar)) + '</tr>' +
    '<tr>' + (r.packInfo ? dato('Pack', 'Clase ' + r.packInfo.n + ' de ' + r.packInfo.clases) : dato('Total pagado', clp(r.total))) + '</tr>' +
    '<tr>' + dato('Reserva', esc(r.ref)) + '</tr></table></td></tr>' +
    ficha + (r.packInfo ? seccion('🏄 Tu pack de ' + r.packInfo.clases + ' clases', '<p style="margin:0;font-size:15px;line-height:1.5">' + (r.packInfo.quedan ? 'Te ' + (r.packInfo.quedan === 1 ? 'queda 1 clase' : 'quedan ' + r.packInfo.quedan + ' clases') + ', para usar hasta el <b>' + esc(fechaLarga(r.packInfo.vence)) + '</b>. Agenda las próximas cuando quieras con este link (guárdalo):' : 'Esta es la última clase de tu pack.') + '</p>' + (r.packInfo.quedan ? boton(r.packInfo.link, 'Agendar mi próxima clase', '#0f6e74', '#ffffff') : '')) : '') +
    seccion('📍 Cómo llegar', '<p style="margin:0;font-size:15px;line-height:1.5">Nos encontramos en Storm, en ' + esc(a.lugar) + '. Llega 10 minutos antes para ponerte el traje con calma.</p>' + boton(MAPA, 'Ver ubicación en el mapa', '#2C2C2B', '#ffffff')) +
    seccion('🎒 Qué traer', '<p style="margin:0;font-size:15px;line-height:1.9">' + TRAER.map(t => '✅ ' + esc(t)).join('<br>') + '</p>') +
    seccion('💙 Nosotros ponemos', '<p style="margin:0;font-size:15px;line-height:1.9">🏄 Tabla de surf y leash<br>🌊 Traje de agua (wetsuit)<br>🤙 Instructor certificado</p>') +
    seccion('🌊 Si el mar no está apto', '<p style="margin:0;font-size:15px;line-height:1.5">El surf es un deporte en el mar. Si las condiciones no son seguras, te escribimos por WhatsApp para cambiar la hora sin costo.</p>') +
    '<tr><td style="padding:16px 26px 0">' + boton(gcal, 'Agregar a mi calendario', '#EFECE8', '#2C2C2B') + boton('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent('Hola Storm, reservé una clase (' + r.ref + ')'), '¿Dudas? Escríbenos por WhatsApp', '#25D366', '#ffffff') + '</td></tr>' +
    '<tr><td style="padding:24px 26px 28px;text-align:center"><p style="margin:0;font-size:17px">¡Nos vemos en el agua! 🌊<br><b>Equipo Storm</b></p></td></tr></table>' +
    '<p style="text-align:center;margin:16px 0 0;font-size:12px;color:#8a8986">Storm Surf Academy · Playa de Matanzas, Navidad · <a href="https://www.stormsurf.cl" style="color:#2d6e94">stormsurf.cl</a></p></div>';
  return html.replace(/[^\x00-\x7F]/gu, c => '&#' + c.codePointAt(0) + ';');
}
const edadesEN = r => { const t = []; if (r.menores) t.push(r.menores + ' under 8'); if (r.ninos) t.push(r.ninos + ' aged 7 to 11'); return (t.length ? ' (' + t.join(', ') + ')' : '') + (r.nivel === 'intermedio' ? ' · intermediate lesson' : ''); };
function correoReservadaEN(r, a) {
  const F = 'font-family:Helvetica,Arial,sans-serif;', fin = deMin(aMin(r.hora) + durDe(a, r));
  const gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Storm surf lesson') + '&dates=' + r.fecha.replace(/-/g, '') + 'T' + r.hora.replace(':', '') + '00/' + r.fecha.replace(/-/g, '') + 'T' + fin.replace(':', '') + '00&ctz=America/Santiago&location=' + encodeURIComponent(MAPA) + '&details=' + encodeURIComponent('Arrive 10 minutes early. Form: ' + linkFicha(r));
  const boton = (href, txt, fondo, color) => '<a href="' + href + '" style="display:block;text-align:center;text-decoration:none;background:' + fondo + ';color:' + color + ';font-weight:700;font-size:16px;padding:14px 18px;border-radius:999px;margin:10px 0 0">' + txt + '</a>';
  const seccion = (titulo, cuerpo) => '<tr><td style="padding:22px 26px 0"><p style="margin:0 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#8a8986;font-weight:700">' + titulo + '</p>' + cuerpo + '</td></tr>';
  const dato = (k, v) => '<td style="padding:6px 0;font-size:15px;color:#8a8986;width:42%">' + k + '</td><td style="padding:6px 0;font-size:15px;font-weight:700;text-align:right">' + v + '</td>';
  const ficha = r.ref ? '<tr><td style="padding:22px 26px 0"><div style="padding:18px;border-radius:16px;background:#FFF6DA;color:#3B2610"><b style="font-size:17px">One more step: a form for each participant</b><p style="margin:6px 0 0;font-size:15px;line-height:1.5">It is required to go into the ocean (Sernatur, the Chilean tourism authority). It takes 2 minutes per person and you sign with your finger.</p>' + boton(linkFicha(r), 'Fill in the form', '#2C2C2B', '#ffffff') + '</div></td></tr>' : '';
  const html = '<div style="background:#EFECE8;padding:28px 12px;' + F + 'color:#2C2C2B"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden">' +
    '<tr><td style="padding:26px 26px 0;text-align:center"><img src="https://app.stormsurf.cl/img/storm-logo.png" alt="Storm" width="110" style="display:inline-block"></td></tr>' +
    '<tr><td style="padding:18px 26px 0;text-align:center"><p style="margin:0;font-size:40px">🏄</p><h1 style="font-size:27px;line-height:1.15;margin:6px 0 8px">Your surf lesson is booked!</h1><p style="margin:0;font-size:16px;line-height:1.5;color:#5c5b58">Hi ' + esc(r.nombre.split(' ')[0]) + ', your spot in the ocean is saved. This email is your receipt.</p></td></tr>' +
    '<tr><td style="padding:22px 26px 0"><div style="background:#E3F1F1;border-radius:18px;padding:20px;text-align:center"><p style="margin:0;font-size:14px;color:#0f6e74;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Your lesson</p><p style="margin:6px 0 2px;font-size:22px;font-weight:700">' + esc(dateLong(r.fecha)) + '</p><p style="margin:0;font-size:20px">' + esc(r.hora) + ' to ' + esc(fin) + '</p></div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">' +
    '<tr>' + dato('People', r.personas + edadesEN(r)) + '</tr>' +
    '<tr>' + dato('Where', esc(a.lugar)) + '</tr>' +
    '<tr>' + (r.packInfo ? dato('Pack', 'Lesson ' + r.packInfo.n + ' of ' + r.packInfo.clases) : dato('Total paid', clp(r.total) + ' CLP')) + '</tr>' +
    '<tr>' + dato('Booking', esc(r.ref)) + '</tr></table></td></tr>' +
    ficha + (r.packInfo ? seccion('🏄 Your pack of ' + r.packInfo.clases + ' lessons', '<p style="margin:0;font-size:15px;line-height:1.5">' + (r.packInfo.quedan ? 'You have ' + r.packInfo.quedan + ' lesson' + (r.packInfo.quedan === 1 ? '' : 's') + ' left, to use by <b>' + esc(dateLong(r.packInfo.vence)) + '</b>. Book the next ones whenever you want with this link (save it):' : 'This is the last lesson of your pack.') + '</p>' + (r.packInfo.quedan ? boton(r.packInfo.link + '&l=en', 'Book my next lesson', '#0f6e74', '#ffffff') : '')) : '') +
    seccion('📍 How to get there', '<p style="margin:0;font-size:15px;line-height:1.5">We meet at Storm, ' + esc(a.lugar) + '. Arrive 10 minutes early so you can put on your wetsuit calmly.</p>' + boton(MAPA, 'See location on the map', '#2C2C2B', '#ffffff')) +
    seccion('🎒 What to bring', '<p style="margin:0;font-size:15px;line-height:1.9">' + BRING.map(t => '✅ ' + esc(t)).join('<br>') + '</p>') +
    seccion('💙 We provide', '<p style="margin:0;font-size:15px;line-height:1.9">🏄 Surfboard and leash<br>🌊 Wetsuit<br>🤙 Certified instructor</p>') +
    seccion('🌊 If the ocean is not safe', '<p style="margin:0;font-size:15px;line-height:1.5">Surfing is an ocean sport. If conditions are not safe, we will message you on WhatsApp to change the time at no cost.</p>') +
    '<tr><td style="padding:16px 26px 0">' + boton(gcal, 'Add to my calendar', '#EFECE8', '#2C2C2B') + boton('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent('Hi Storm, I booked a lesson (' + r.ref + ')'), 'Questions? Message us on WhatsApp', '#25D366', '#ffffff') + '</td></tr>' +
    '<tr><td style="padding:24px 26px 28px;text-align:center"><p style="margin:0;font-size:17px">See you in the water! 🌊<br><b>The Storm team</b></p></td></tr></table>' +
    '<p style="text-align:center;margin:16px 0 0;font-size:12px;color:#8a8986">Storm Surf Academy · Playa de Matanzas, Navidad · <a href="https://www.stormsurf.cl" style="color:#2d6e94">stormsurf.cl</a></p></div>';
  return html.replace(/[^\x00-\x7F]/gu, c => '&#' + c.codePointAt(0) + ';');
}
async function avisarReserva(env, r, a) {
  const ins = parseLista(r.instructores);
  if (r.pack) try { const p = (await packsLista(env.DB)).find(x => x.id === r.pack); if (p) r = Object.assign({}, r, { packInfo: { vence: p.vence, clases: p.clases, quedan: p.quedan, n: Math.max(1, p.refs.indexOf(r.ref) + 1), link: p.link } }); } catch (x) { console.error(x); }
  const cuando = fechaLarga(r.fecha) + ', ' + r.hora + ' hrs';
  const html = enIngles(r) ? correoReservadaEN(r, a) : correoReservada(r, a, ins);
  const p = [enIngles(r) ? enviarCorreo(env, { to: r.correo, bcc: CORREO_STORM, subject: 'Your surf lesson is booked! · ' + dateLong(r.fecha) + ', ' + r.hora, html,
    body: 'Lesson booked!\n\n' + dateLong(r.fecha) + ', ' + r.hora + '\n' + r.personas + ' people · ' + a.lugar + (r.packInfo ? '\nPack: lesson ' + r.packInfo.n + ' of ' + r.packInfo.clases + (r.packInfo.quedan ? '. Book the next ones here: ' + r.packInfo.link + '&l=en' : '') : '\nTotal paid: ' + clp(r.total) + ' CLP') + '\n\nBefore the lesson, fill in the form for each participant: ' + linkFicha(r) + '\n\n📍 Location: ' + MAPA + '\n\n🏄 What to bring:\n' + BRING.map(t => '✅ ' + t).join('\n') + '\n\nWe provide all the equipment you need 💙\nBooking ' + r.ref }) : enviarCorreo(env, { to: r.correo, bcc: CORREO_STORM, subject: '¡Tu clase de surf está reservada! · ' + cuando, html,
    body: '¡Clase reservada!\n\n' + cuando + '\n' + r.personas + ' persona(s) · ' + a.lugar + (r.packInfo ? '\nPack: clase ' + r.packInfo.n + ' de ' + r.packInfo.clases + (r.packInfo.quedan ? '. Agenda las próximas aquí: ' + r.packInfo.link : '') : '\nTotal pagado: ' + clp(r.total)) + '\n\nAntes de la clase, llena la ficha de cada participante: ' + linkFicha(r) + '\n\n📍 Nuestra ubicación: ' + MAPA + '\n\n🏄 ¿Qué debes traer?\n' + TRAER.map(t => '✅ ' + t).join('\n') + '\n\nNosotros te entregamos todo el equipamiento necesario 💙\nReferencia ' + r.ref })];
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
    if (enIngles(r)) {
      await enviarCorreo(env, { to: r.correo, subject: 'Your surf lesson is tomorrow · ' + r.hora,
        html: cajaCorreo('Tomorrow we surf!', '<p style="margin:0 0 16px;font-size:16px">Hi ' + esc(r.nombre.split(' ')[0]) + ', a reminder of your lesson:</p>' + filaC('When', 'Tomorrow, ' + dateLong(r.fecha) + ' at ' + r.hora) + filaC('Where', a.lugar) + '<p style="margin:4px 0 0;font-size:16px">📍 <a href="' + MAPA + '" style="color:#2d6e94;font-weight:700">How to get there (map)</a></p>',
          ((await fichasDe(env.DB, r.ref)).length < r.personas ? botonFichaEN(r) : '') + 'Bring a swimsuit, towel and sunscreen. Arrive 10 minutes early. If the ocean is not safe, we will message you on WhatsApp to change the time.', 'See you in the water 🌊<br><b>The Storm team</b>'),
        body: 'Hi ' + r.nombre.split(' ')[0] + ', a reminder of your surf lesson tomorrow, ' + dateLong(r.fecha) + ' at ' + r.hora + ' at ' + a.lugar + '. Arrive 10 minutes early.\nHow to get there: ' + MAPA });
      await env.DB.prepare('UPDATE reservas SET recordatorio = 1 WHERE ref = ?').bind(r.ref).run();
      continue;
    }
    await enviarCorreo(env, { to: r.correo, subject: 'Mañana es tu clase de surf · ' + r.hora + ' hrs',
      html: cajaCorreo('¡Mañana surfeamos!', '<p style="margin:0 0 16px;font-size:16px">Hola ' + esc(r.nombre.split(' ')[0]) + ', te recordamos tu clase:</p>' + filaC('Cuándo', cuando) + filaC('Dónde', a.lugar) + '<p style="margin:4px 0 0;font-size:16px">📍 <a href="' + MAPA + '" style="color:#2d6e94;font-weight:700">Cómo llegar (mapa)</a></p>',
        (!r.fichas_papel && (await fichasDe(env.DB, r.ref)).length < r.personas ? botonFicha(r) : '') + 'Trae traje de baño, toalla y bloqueador. Llega 10 minutos antes. Si el mar no está apto, te escribimos por WhatsApp para cambiar la hora.'),
      body: 'Hola ' + r.nombre.split(' ')[0] + ', te recordamos tu clase de surf ' + cuando + ' en ' + a.lugar + '. Llega 10 minutos antes.\nCómo llegar: ' + MAPA });
    await env.DB.prepare('UPDATE reservas SET recordatorio = 1 WHERE ref = ?').bind(r.ref).run();
  }
  return results.length;
}

// ---------- reseñas ----------
// Un correo por cliente (por correo electrónico), 2 horas después de su primera clase pagada desde RESENA_DESDE.
async function resenaTabla(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS resenas (ref TEXT PRIMARY KEY, correo TEXT NOT NULL, nombre TEXT NOT NULL, fecha TEXT NOT NULL, enviada_ms INTEGER NOT NULL, estrellas INTEGER NOT NULL DEFAULT 0, comentario TEXT NOT NULL DEFAULT '', publicar INTEGER NOT NULL DEFAULT 0, respondida_ms INTEGER NOT NULL DEFAULT 0)").run();
}
const linkResena = (r, n) => PAGINA + 'resena/?r=' + encodeURIComponent(r.ref) + '&k=' + encodeURIComponent(r.clave || '') + (n ? '&e=' + n : '');
function correoResena(r) {
  const F = 'font-family:Helvetica,Arial,sans-serif;';
  const estrella = n => '<a href="' + linkResena(r, n) + '" style="text-decoration:none;color:#F2B300;font-size:42px;padding:0 3px" title="' + n + '">&#9733;</a>';
  const html = '<div style="background:#EFECE8;padding:28px 12px;' + F + 'color:#2C2C2B"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden">' +
    '<tr><td style="padding:26px 26px 0;text-align:center"><img src="https://app.stormsurf.cl/img/storm-logo.png" alt="Storm" width="110" style="display:inline-block"></td></tr>' +
    '<tr><td style="padding:18px 26px 0;text-align:center"><p style="margin:0;font-size:40px">🤙</p><h1 style="font-size:27px;line-height:1.15;margin:6px 0 10px">¡Gracias por surfear con Storm!</h1><p style="margin:0;font-size:16px;line-height:1.55;color:#5c5b58">Hola ' + esc(r.nombre.split(' ')[0]) + ', esperamos que lo hayas pasado increíble en el agua.</p></td></tr>' +
    '<tr><td style="padding:22px 26px 0"><div style="background:#E3F1F1;border-radius:18px;padding:22px;text-align:center"><p style="margin:0;font-size:18px;line-height:1.45"><b>¿Cómo estuvo tu clase?</b></p><p style="margin:4px 0 0;font-size:15px;color:#5c5b58">Toca las estrellas</p>' +
    '<p style="margin:6px 0 0">' + [1, 2, 3, 4, 5].map(estrella).join('') + '</p><p style="margin:2px 0 0;font-size:13px;color:#8a8986">1 = no me gustó · 5 = me encantó</p></div></td></tr>' +
    '<tr><td style="padding:18px 26px 0;text-align:center"><p style="margin:0;font-size:15px;line-height:1.5;color:#5c5b58">Tu opinión nos ayuda a mejorar y a que más personas conozcan Storm.</p></td></tr>' +
    '<tr><td style="padding:24px 26px 28px;text-align:center"><p style="margin:0;font-size:17px">¡Te esperamos de vuelta en el agua! 🌊<br><b>Equipo Storm</b></p></td></tr></table>' +
    '<p style="text-align:center;margin:16px 0 0;font-size:12px;color:#8a8986">Storm Surf Academy · Playa de Matanzas, Navidad · <a href="https://www.stormsurf.cl" style="color:#2d6e94">stormsurf.cl</a></p></div>';
  return html.replace(/[^\x00-\x7F]/gu, c => '&#' + c.codePointAt(0) + ';');
}
const googleResena = a => (a && a.linkResena) || GOOGLE_RESENA;
async function pedirResenas(env, a) {
  if (!googleResena(a) || !env.CLAVE_CORREO) return 0;
  const t = ahoraChile();
  if (aMin(t.hora) < aMin('09:00') || aMin(t.hora) > aMin('21:30')) return 0; // de noche espera a la mañana
  const db = env.DB; await resenaTabla(db);
  const inicio = env.RESENA_DESDE || RESENA_DESDE, desde = sumarDias(t.fecha, -3) > inicio ? sumarDias(t.fecha, -3) : inicio;
  const { results } = await db.prepare("SELECT * FROM reservas WHERE fecha BETWEEN ? AND ? AND estado = 'pagada' AND correo != '' AND ref NOT IN (SELECT ref FROM resenas) ORDER BY fecha, hora").bind(desde, t.fecha).all();
  const ahora = minLocal(t.fecha, t.hora);
  let n = 0;
  for (const r of results) {
    if (minLocal(r.fecha, r.hora) + durDe(a, r) + RESENA_HORAS * 60 > ahora) continue;
    const correo = norm(r.correo);
    const ya = await db.prepare('SELECT ref FROM resenas WHERE correo = ? LIMIT 1').bind(correo).first();
    if (ya) continue; // ya se le pidió una vez
    if (!r.clave) { r.clave = nuevaClave(); await db.prepare('UPDATE reservas SET clave = ? WHERE ref = ?').bind(r.clave, r.ref).run(); }
    // Se anota antes de mandar: nunca dos correos a la misma persona.
    const ins = await db.prepare('INSERT OR IGNORE INTO resenas (ref, correo, nombre, fecha, enviada_ms) VALUES (?, ?, ?, ?, ?)').bind(r.ref, correo, r.nombre, r.fecha, Date.now()).run();
    if (!ins.meta || !ins.meta.changes) continue;
    await enviarCorreo(env, { to: r.correo, subject: '¿Cómo estuvo tu clase de surf?', html: correoResena(r),
      body: 'Hola ' + r.nombre.split(' ')[0] + ', ¡gracias por surfear con Storm!\n\n¿Cómo estuvo tu clase? Cuéntanos aquí (1 minuto): ' + linkResena(r) + '\n\n¡Te esperamos de vuelta en el agua!\nEquipo Storm' });
    n++;
  }
  return n;
}
async function resenaDe(env, d) {
  const db = env.DB; await resenaTabla(db);
  if (d.ref === 'PRUEBA' && d.k === 'prueba') return { ref: 'PRUEBA', clave: 'prueba', nombre: 'Camila Prueba', prueba: true };
  const r = await db.prepare('SELECT ref, clave, nombre FROM reservas WHERE ref = ?').bind(String(d.ref || '')).first();
  if (!r || !r.clave || r.clave !== String(d.k || '')) throw err('Este link no es válido. Escríbenos por WhatsApp.');
  return r;
}
/** El cliente abre el link (con o sin estrellas) o envía su comentario. */
async function resenaGuardar(env, d, ctx) {
  const db = env.DB, r = await resenaDe(env, d), a = await ajustes(db);
  const e = Math.max(0, Math.min(5, Math.floor(Number(d.estrellas) || 0)));
  const comentario = String(d.comentario || '').trim().slice(0, 1500);
  if (r.prueba) return { ok: true, prueba: true, nombre: 'Camila', google: googleResena(a), whatsapp: WHATSAPP };
  const antes = await db.prepare('SELECT * FROM resenas WHERE ref = ?').bind(r.ref).first();
  if (!antes) await db.prepare('INSERT OR IGNORE INTO resenas (ref, correo, nombre, fecha, enviada_ms) SELECT ref, lower(correo), nombre, fecha, 0 FROM reservas WHERE ref = ?').bind(r.ref).run();
  if (e) await db.prepare('UPDATE resenas SET estrellas = ?, respondida_ms = ? WHERE ref = ?').bind(e, Date.now(), r.ref).run();
  if (d.enviar) {
    await db.prepare('UPDATE resenas SET comentario = ?, publicar = ? WHERE ref = ?').bind(comentario, d.publicar && e >= 4 ? 1 : 0, r.ref).run();
    const est = e || (antes && antes.estrellas) || 0;
    if (comentario) tarea(ctx, correoStorm(env, (est && est <= 3 ? 'Comentario para mejorar' : 'Nuevo comentario') + ' · ' + est + ' estrellas · ' + r.nombre,
      r.nombre + ' (' + r.ref + ') puso ' + est + ' de 5 estrellas y escribió:\n\n' + comentario + '\n\nLo ves en Agenda Storm > Ajustes > Reseñas: ' + PANEL));
  }
  return { ok: true, nombre: r.nombre.split(' ')[0], google: googleResena(a), whatsapp: WHATSAPP };
}

/** Cada 5 minutos: pagos pendientes, horarios no pagados y recordatorios. */
async function revisionAutomatica(env, ctx) {
  const db = env.DB, a = await ajustes(db);
  await limpiarRetenciones(db);
  const { results } = await db.prepare("SELECT * FROM reservas WHERE estado = 'pendiente' AND creada_ms > ?").bind(Date.now() - 2 * 86400000).all();
  let pagadas = 0;
  for (const r of results) {
    const e = await revisarPago(env, r, ctx); // con ctx: los avisos (push y correos) terminan de enviarse aunque la revisión acabe
    if (e === 'pagada') pagadas++;
    else if (e === 'pendiente' && !aMano(r)) {
      const guarda = await db.prepare('SELECT COUNT(*) AS n FROM bloques WHERE ref = ?').bind(r.ref).first();
      if (!(guarda && guarda.n)) await db.prepare("UPDATE reservas SET estado = 'vencida' WHERE ref = ? AND estado = 'pendiente'").bind(r.ref).run();
    }
  }
  // Links de pago esperando (por si el aviso del pago no llegó)
  try { await linkTabla(db); for (const L of (await db.prepare("SELECT * FROM links WHERE estado = 'pendiente' AND creada_ms > ?").bind(Date.now() - 7 * 86400000).all()).results) if (await revisarLink(env, L, ctx) === 'pagada') pagadas++; } catch (x) { console.error(x); }
  // Ventas de la máquina Tuu: el mes actual (y el anterior los primeros 3 días, por ventas que llegan tarde).
  if (env.TUU_KEY) try { const hoy = ahoraChile().fecha; await tuuSincronizar(env, hoy.slice(0, 7)); if (+hoy.slice(8) <= 3) await tuuSincronizar(env, sumarDias(hoy.slice(0, 8) + '01', -1).slice(0, 7)); } catch (x) { console.error(x); }
  let anual = null; try { anual = await sincronizarAnual(env); } catch (x) { console.error(x); anual = { error: x.message }; }
  const rec = await recordatorios(env, a);
  let resenas = 0; try { resenas = await pedirResenas(env, a); } catch (x) { console.error(x); }
  let resumen = 0; try { resumen = await pushResumen(env, a); } catch (x) { console.error(x); }
  return { ok: true, revisadas: results.length, pagadas, recordatorios: rec, resenas, anual, resumen };
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
  if ((a.recepcion || []).map(norm).includes(email)) return { email, rol: 'recepcion', yo: '' };
  const ins = await instructores(env.DB), yo = ins.find(i => norm(i.correo) === email);
  if (yo) return { email, rol: 'instructor', yo: yo.nombre };
  throw err('Tu correo no está en la Escuela. Pídele a Isidora que lo agregue en Agenda Storm > Ajustes.');
}
const anotar = (db, q, que) => db.prepare('INSERT INTO registro (ms, quien, que) VALUES (?, ?, ?)').bind(Date.now(), q.email, que).run();
const filaPanel = (r, admin) => ({ ref: r.ref, estado: r.estado, fecha: r.fecha, hora: r.hora, personas: r.personas, menores: r.menores, ninos: r.ninos || 0, duracion: Number(r.duracion) || 0, nivel: r.nivel || '', fichasPapel: !!r.fichas_papel, instructores: parseLista(r.instructores),
  nombre: r.nombre, telefono: r.telefono, comentario: r.comentario, nota: r.nota, ...(admin ? { pack: r.pack || '', correo: r.correo, total: r.total, pagoInstructor: r.pago_instructor, pagos: pagosDe(r), medio: r.medio, creada: r.creada, linkPago: r.estado === 'pendiente' ? linkStorm(r.link_pago) : '', saldos: saldosDe(r) } : {}) });

async function panel(env, q) {
  const db = env.DB, a = await ajustes(db), hoy = ahoraChile().fecha, admin = q.rol === 'admin', todo = admin || q.rol === 'recepcion';
  await limpiarRetenciones(db);
  const desde = sumarDias(hoy, -45), hasta = sumarDias(hoy, a.diasAdelante);
  const ins = await instructores(db);
  const [sem, exc, res, ocu, sync] = await Promise.all([
    db.prepare('SELECT * FROM semana').all(),
    db.prepare('SELECT * FROM excepciones WHERE fecha >= ?').bind(hoy).all(),
    db.prepare("SELECT * FROM reservas WHERE (fecha BETWEEN ? AND ? OR (fecha < ? AND medio = 'Por pagar' AND estado = 'pagada') OR (fecha < ? AND estado = 'pendiente' AND nota LIKE 'Agregada a mano%') OR (fecha < ? AND saldos LIKE '%\"medio\":\"\"%')) AND estado IN ('pagada', 'pendiente', 'revisar') ORDER BY fecha, hora").bind(desde, hasta, desde, desde, desde).all(), // + las antiguas que nunca se pagaron (para cobrarlas)
    leerOcupaciones(db, hoy, hasta),
    db.prepare("SELECT valor FROM ajustes WHERE clave = 'anualSync'").first()
  ]);
  const fic = await db.prepare('SELECT ref, n, nombre FROM fichas WHERE ref IN (SELECT ref FROM reservas WHERE fecha BETWEEN ? AND ?)').bind(desde, hasta).all();
  const fichasPor = {}; fic.results.forEach(f => (fichasPor[f.ref] = fichasPor[f.ref] || []).push(f.nombre));
  const guardadas = new Set((await db.prepare('SELECT DISTINCT ref FROM bloques WHERE hasta > 0').all()).results.map(x => x.ref));
  let reservas = res.results.filter(r => r.estado !== 'pendiente' || guardadas.has(r.ref) || aMano(r));
  if (!todo) reservas = reservas.filter(r => parseLista(r.instructores).includes(q.yo));
  const out = { ok: true, rol: q.rol, yo: q.yo, hoy, duracion: a.duracion, horarios: a.horarios,
    instructores: ins.map(i => ({ nombre: i.nombre, activo: !!i.activo, ...(admin ? { correo: i.correo, telefono: i.telefono, rut: i.rut, tarifas: (() => { try { return JSON.parse(i.tarifas || 'null'); } catch (_) { return null; } })() } : {}) })),
    semana: sem.results.map(s => ({ instructor: s.instructor, dia: s.dia, horas: parseLista(s.horas) })).filter(s => todo || s.instructor === q.yo),
    soloParticulares: SOLO_PARTICULARES,
    ocupaciones: ocu.filter(o => todo || leToca(o, q.yo)).map(o => ({ id: o.id, origen: o.origen, instructor: o.instructor, fecha: o.fecha, dia: o.dia, desde: o.desde, hasta: o.hasta, motivo: o.motivo })),
    anualSync: sync ? JSON.parse(sync.valor) : null,
    excepciones: exc.results.filter(e => todo || e.instructor === q.yo).map(e => ({ instructor: e.instructor, fecha: e.fecha, hora: e.hora, libre: !!e.libre })),
    reservas: reservas.map(r => Object.assign(filaPanel(r, todo), { fichas: fichasPor[r.ref] || [], linkFicha: linkFicha(r) })), link: PAGINA,
    vacaciones: (await vacacionesLista(db, hoy)).filter(v => todo || v.instructor === q.yo) };
  if (admin) {
    out.ajustes = { precios: a.precios, pagos: a.pagos, horarios: a.horarios, minHoras: a.minHoras, maxSeguidas: a.maxSeguidas, horaTarde: a.horaTarde, cierreNoche: a.cierreNoche, diasAdelante: a.diasAdelante, maxWeb: a.maxWeb, lugar: a.lugar, admins: a.admins, recepcion: a.recepcion || [], pack: a.pack };
    const mes = hoy.slice(0, 7);
    const m = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total, COALESCE(SUM(pago_instructor),0) AS pago FROM reservas WHERE substr(fecha,1,7) = ? AND estado = 'pagada'").bind(mes).first();
    m.total += await packsVendidos(db, mes); // los packs cuentan el mes en que se pagan (sus clases van en $0)
    const porIns = await db.prepare("SELECT instructores, pago_instructor, pagos FROM reservas WHERE substr(fecha,1,7) = ? AND estado = 'pagada'").bind(mes).all();
    const pagoPor = {};
    porIns.results.forEach(r => { const p = pagosDe(r); Object.keys(p).forEach(i => { pagoPor[i] = (pagoPor[i] || 0) + p[i]; }); });
    out.mes = { mes, clases: m.n, total: m.total, pagoInstructores: m.pago, pagoPor };
    await resenaTabla(db);
    out.resenas = (await db.prepare('SELECT ref, nombre, fecha, enviada_ms, estrellas, comentario, publicar FROM resenas ORDER BY COALESCE(NULLIF(respondida_ms, 0), enviada_ms) DESC LIMIT 200').all()).results;
    out.linkResena = googleResena(a);
    out.faltaConfigurar = ['MP_TOKEN', 'CLAVE_CORREO', 'TAREA_CLAVE', 'ONESIGNAL_KEY'].filter(k => !env[k]);
  } else {
    const mes = hoy.slice(0, 7);
    const porIns = await db.prepare("SELECT instructores, pago_instructor, pagos FROM reservas WHERE substr(fecha,1,7) = ? AND estado = 'pagada'").bind(mes).all();
    let clases = 0, pago = 0;
    porIns.results.forEach(r => { const p = pagosDe(r); if (q.yo in p) { clases++; pago += p[q.yo]; } });
    out.mes = { mes, clases, pagoYo: pago };
  }
  if (!admin && todo) out.ajustes = { precios: a.precios, maxWeb: a.maxWeb, horarios: a.horarios, pack: a.pack };
  if (todo) out.packs = await packsLista(db);
  if (todo) out.clientes = await clientesLista(env); // para no escribirlos de nuevo en la reserva a mano
  return out;
}
/** Clientes: los que ya reservaron (más recientes primero) y los guardados (AgendaPro y rentas), sin repetir. */
async function clientesLista(env) {
  const cl = await env.DB.prepare("SELECT nombre, telefono, correo, MAX(creada_ms) AS ult, COUNT(*) AS n FROM reservas WHERE estado IN ('pagada', 'pendiente', 'revisar') GROUP BY lower(nombre) ORDER BY ult DESC LIMIT 1000").all();
  const out = cl.results.map(c => ({ nombre: c.nombre, telefono: c.telefono || '', correo: c.correo || '', clases: c.n }));
  try {
    const sol = t => String(t || '').replace(/\D/g, '').slice(-8);
    const ya = new Set(); out.forEach(c => { ya.add('n' + c.nombre.toLowerCase()); if (sol(c.telefono)) ya.add('t' + sol(c.telefono)); if (c.correo) ya.add('m' + c.correo.toLowerCase()); });
    const gu = await env.DB.prepare('SELECT nombre, telefono, correo FROM clientes ORDER BY nombre LIMIT 3000').all();
    gu.results.forEach(c => { if (ya.has('n' + c.nombre.toLowerCase()) || (sol(c.telefono) && ya.has('t' + sol(c.telefono))) || (c.correo && ya.has('m' + c.correo.toLowerCase()))) return; out.push({ nombre: c.nombre, telefono: c.telefono, correo: c.correo, clases: 0 }); });
  } catch (x) { console.error('clientes', x); }
  return out;
}
/** Isidora (25-11): quien arrienda queda guardado como cliente (igual que al agendar una clase). Si ya existe, solo completa el teléfono. */
async function guardarCliente(db, nombre, telefono, origen, fecha) {
  try {
    await db.prepare("CREATE TABLE IF NOT EXISTS clientes (nombre TEXT NOT NULL, telefono TEXT NOT NULL DEFAULT '', correo TEXT NOT NULL DEFAULT '', origen TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL DEFAULT '')").run();
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS clientes_nombre ON clientes (lower(nombre))').run();
    await db.prepare('INSERT INTO clientes (nombre, telefono, origen, creado) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET telefono = excluded.telefono WHERE clientes.telefono = \'\' AND excluded.telefono != \'\'').bind(nombre, telefono, origen, fecha).run();
  } catch (x) { console.error('guardarCliente', x); }
}

/** Pago semanal (lunes a domingo): cuánto transferir a cada instructor y qué clases ya se le pagaron.
 *  Cada clase se marca pagada por separado (tabla pagos_clase). d.marcarClase = {instructor, ref, pagado} marca o desmarca una;
 *  d.marcar = {instructor, pagado} paga de una vez todas sus clases por pagar hasta hoy (las de días que vienen no), o desmarca todas las de la semana. */
async function pagosSemana(env, q, d) {
  const db = env.DB, hoy = ahoraChile().fecha, admin = q.rol === 'admin';
  let lunes = esFecha(d.lunes) ? d.lunes : hoy;
  lunes = sumarDias(lunes, -((diaSemana(lunes) + 6) % 7));
  const domingo = sumarDias(lunes, 6);
  await db.prepare("CREATE TABLE IF NOT EXISTS pagos_clase (instructor TEXT NOT NULL, ref TEXT NOT NULL, monto INTEGER NOT NULL DEFAULT 0, pagado_el TEXT NOT NULL, por TEXT NOT NULL DEFAULT '', PRIMARY KEY (instructor, ref))").run();
  const leerClases = () => db.prepare("SELECT ref, fecha, hora, personas, menores, ninos, nombre, instructores, pago_instructor, pagos FROM reservas WHERE fecha BETWEEN ? AND ? AND estado = 'pagada' ORDER BY fecha, hora").bind(lunes, domingo).all();
  let res = await leerClases();
  const clasesDe = inst => res.results.filter(r => inst in pagosDe(r)).map(r => ({ r, monto: pagosDe(r)[inst] }));
  // Pagos de antes (toda la semana marcada de una vez): pasan a pagos por clase, solo las clases hasta el día en que se pagó.
  // (No se borran: se marcan '·migrado' en "por", así la versión anterior de la app las sigue viendo.)
  const viejos = (await db.prepare("SELECT * FROM pagos_semana WHERE lunes = ? AND por NOT LIKE '%·migrado'").bind(lunes).all()).results;
  if (viejos.length) {
    const st = [];
    viejos.forEach(v => { clasesDe(v.instructor).filter(c => c.r.fecha <= v.pagado_el).forEach(c => st.push(db.prepare('INSERT OR IGNORE INTO pagos_clase (instructor, ref, monto, pagado_el, por) VALUES (?, ?, ?, ?, ?)').bind(v.instructor, c.r.ref, c.monto, v.pagado_el, v.por || ''))); st.push(db.prepare("UPDATE pagos_semana SET por = por || '·migrado' WHERE instructor = ? AND lunes = ?").bind(v.instructor, lunes)); });
    await db.batch(st);
  }
  if (admin && d.marcarClase) {
    const inst = String(d.marcarClase.instructor || ''), ref = String(d.marcarClase.ref || '');
    const c = clasesDe(inst).find(x => x.r.ref === ref);
    if (d.marcarClase.pagado) { if (c) await db.prepare('INSERT OR REPLACE INTO pagos_clase (instructor, ref, monto, pagado_el, por) VALUES (?, ?, ?, ?, ?)').bind(inst, ref, c.monto, hoy, q.email).run(); }
    else await db.prepare('DELETE FROM pagos_clase WHERE instructor = ? AND ref = ?').bind(inst, ref).run();
    await anotar(db, q, 'pago clase ' + ref + ' ' + inst + (d.marcarClase.pagado ? ' pagada' : ' desmarcada'));
  }
  if (admin && d.marcar) {
    const inst = String(d.marcar.instructor || ''), mias = clasesDe(inst), st = [];
    if (d.marcar.pagado) mias.filter(c => c.r.fecha <= hoy).forEach(c => st.push(db.prepare('INSERT OR IGNORE INTO pagos_clase (instructor, ref, monto, pagado_el, por) VALUES (?, ?, ?, ?, ?)').bind(inst, c.r.ref, c.monto, hoy, q.email)));
    else mias.forEach(c => st.push(db.prepare('DELETE FROM pagos_clase WHERE instructor = ? AND ref = ?').bind(inst, c.r.ref)));
    if (st.length) await db.batch(st);
    await anotar(db, q, 'pago semana ' + lunes + ' ' + inst + (d.marcar.pagado ? ' pagado hasta hoy' : ' desmarcado'));
  }
  const refs = res.results.map(r => r.ref);
  const pag = refs.length ? (await db.prepare(`SELECT * FROM pagos_clase WHERE ref IN (${refs.map(() => '?').join(',')})`).bind(...refs).all()).results : [];
  const pagada = {}; pag.forEach(x => { pagada[x.instructor + '|' + x.ref] = x; });
  const por = {};
  res.results.forEach(r => { const p = pagosDe(r); Object.keys(p).forEach(i => {
    if (!admin && i !== q.yo) return;
    const x = por[i] = por[i] || { instructor: i, total: 0, pagadoMonto: 0, clases: [] };
    const pg = pagada[i + '|' + r.ref];
    x.total += p[i]; if (pg) x.pagadoMonto += p[i];
    x.clases.push({ ref: r.ref, fecha: r.fecha, hora: r.hora, cliente: r.nombre, personas: r.personas, menores: r.menores, ninos: r.ninos || 0, monto: p[i], pagada: pg ? { el: pg.pagado_el } : null });
  }); });
  const lista = Object.values(por).map(x => Object.assign(x, {
    porPagar: x.total - x.pagadoMonto,
    porPagarHoy: x.clases.filter(c => !c.pagada && c.fecha <= hoy).reduce((t, c) => t + c.monto, 0),
    pagado: x.total && x.pagadoMonto >= x.total ? { monto: x.pagadoMonto, el: x.clases.reduce((m, c) => c.pagada && c.pagada.el > m ? c.pagada.el : m, '') } : null
  })).sort((a, b) => b.total - a.total);
  return { ok: true, lunes, domingo, hoy, instructores: lista, total: lista.reduce((t, x) => t + x.total, 0) };
}

// ---------- Packs de clases (Isidora 16-11) ----------
// Se paga una vez (5 clases con 10% de descuento) y cada clase anotada con el pack descuenta una. Cancelar una clase devuelve la clase al pack.
async function packTabla(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS packs (id TEXT PRIMARY KEY, creada TEXT NOT NULL, creada_ms INTEGER NOT NULL, nombre TEXT NOT NULL, telefono TEXT NOT NULL DEFAULT '', correo TEXT NOT NULL DEFAULT '', personas INTEGER NOT NULL DEFAULT 1, clases INTEGER NOT NULL DEFAULT 5, total INTEGER NOT NULL DEFAULT 0, medio TEXT NOT NULL DEFAULT 'Por pagar', fecha_pago TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'activo', nota TEXT NOT NULL DEFAULT '', clave TEXT NOT NULL DEFAULT '', menores INTEGER NOT NULL DEFAULT 0, nivel TEXT NOT NULL DEFAULT '')").run();
}
/** Vence: 1 mes (ajuste pack.meses) desde que se pagó (o desde que se anotó, si aún no paga). Las clases deben ser hasta ese día. */
const venceDe = (p, meses) => sumarMeses(p.fecha_pago || String(p.creada || '').slice(0, 10), meses || 1);
const packMeses = async db => { const v = await db.prepare("SELECT valor FROM ajustes WHERE clave = 'pack'").first(); try { return Math.max(1, Number(JSON.parse(v.valor).meses) || 1); } catch (_) { return 1; } };
/** Link personal del pack: con él, el cliente agenda sus próximas clases en /reservar sin pagar. */
const linkPack = p => PAGINA + '?pack=' + encodeURIComponent(p.id) + '&k=' + encodeURIComponent(p.clave || '');
async function packsLista(db) {
  await packTabla(db);
  let r;
  try { r = await db.prepare("SELECT p.*, (SELECT COUNT(*) FROM reservas x WHERE x.pack = p.id AND x.estado IN ('pagada', 'pendiente', 'revisar')) AS usadas FROM packs p WHERE p.estado = 'activo' ORDER BY p.creada_ms DESC").all(); }
  catch (_) { r = await db.prepare("SELECT p.*, 0 AS usadas FROM packs p WHERE p.estado = 'activo' ORDER BY p.creada_ms DESC").all(); } // antes de agregar la columna reservas.pack
  let orden = []; try { orden = (await db.prepare("SELECT ref, pack FROM reservas WHERE pack != '' AND estado IN ('pagada', 'pendiente', 'revisar') ORDER BY fecha, hora").all()).results; } catch (_) {}
  const sin = r.results.filter(p => !p.clave); // packs antiguos: se les crea su llave para el link
  if (sin.length) { sin.forEach(p => p.clave = nuevaClave()); try { await db.batch(sin.map(p => db.prepare('UPDATE packs SET clave = ? WHERE id = ?').bind(p.clave, p.id))); } catch (_) {} }
  const meses = await packMeses(db), hoy = ahoraChile().fecha;
  return r.results.map(p => ({ nivel: p.nivel || '', vence: venceDe(p, meses), vencido: hoy > venceDe(p, meses), link: linkPack(p), menores: p.menores || 0, refs: orden.filter(x => x.pack === p.id).map(x => x.ref), id: p.id, creada: p.creada, nombre: p.nombre, telefono: p.telefono, correo: p.correo, personas: p.personas, clases: p.clases, total: p.total, medio: p.medio, fechaPago: p.fecha_pago, usadas: p.usadas, quedan: p.clases - p.usadas, nota: p.nota }));
}
async function packsDelMes(db, mes) {
  await packTabla(db);
  return (await db.prepare("SELECT * FROM packs WHERE estado = 'activo' AND medio != 'Por pagar' AND substr(fecha_pago,1,7) = ? AND fecha_pago >= ?").bind(mes, TUU_DESDE).all()).results;
}
const packsVendidos = async (db, mes) => (await packsDelMes(db, mes)).reduce((t, k) => t + (k.total || 0), 0);
/** Precio de un pack: clases × precio de la tabla para esas personas, menos el descuento (redondeado a $100). */
const precioPack = (a, personas) => { const k = a.pack || AJUSTES_BASE.pack, p = Number(a.precios[Math.min(5, Math.max(1, personas))]) || 0; return Math.round(p * k.clases * (100 - k.descuento) / 100 / 100) * 100; };
async function crearPack(db, a, q, d) {
  await packTabla(db);
  const t = ahoraChile(), k = a.pack || AJUSTES_BASE.pack, medio = d.web ? 'Por pagar' : MEDIOS.includes(d.medio) && d.medio !== 'Mercado Pago' ? d.medio : 'Por pagar';
  const p = { id: 'PK-' + t.fecha.slice(2).replace(/-/g, '') + '-' + Math.floor(Math.random() * 90000 + 10000), nombre: d.nombre, telefono: d.telefono || '', correo: d.correo || '', personas: d.personas || 1, menores: d.menores || 0, clases: k.clases, total: d.total, medio, clave: nuevaClave() };
  // Comprado en la web: queda 'pendiente' hasta que llegue el pago (ahí pasa a 'activo').
  await db.prepare('INSERT INTO packs (id, creada, creada_ms, nombre, telefono, correo, personas, clases, total, medio, fecha_pago, nota, clave, menores, estado, nivel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(p.id, t.fecha + ' ' + t.hora, Date.now(), p.nombre, p.telefono, p.correo, p.personas, p.clases, p.total, medio, medio === 'Por pagar' ? '' : t.fecha, d.web ? 'Comprado en la web' : 'Vendido por ' + q.email, p.clave, p.menores, d.web ? 'pendiente' : 'activo', d.nivel === 'intermedio' ? 'intermedio' : '').run();
  if (q) await anotar(db, q, 'pack ' + p.id + ' ' + p.nombre + ' ' + p.total);
  return p;
}
/** Pack del cliente (link personal): para agendar con su pack en /reservar. */
async function packDelLink(db, id, k) {
  await packTabla(db);
  const p = (await packsLista(db)).find(x => x.id === String(id || ''));
  const row = p && await db.prepare('SELECT clave FROM packs WHERE id = ?').bind(p.id).first();
  if (!p || !row || !k || row.clave !== String(k)) throw err('Este link de pack no es válido. Escríbenos por WhatsApp.');
  return p;
}
async function packVer(env, d) {
  const db = env.DB, p = await packDelLink(db, d.pack, d.k), hoy = ahoraChile().fecha;
  const cl = p.refs.length ? (await db.prepare("SELECT fecha, hora FROM reservas WHERE pack = ? AND estado IN ('pagada', 'revisar') ORDER BY fecha, hora").bind(p.id).all()).results : [];
  return { ok: true, nivel: p.nivel, vence: p.vence, venceLarga: fechaLarga(p.vence), venceEN: dateLong(p.vence), vencido: p.vencido, nombre: p.nombre, telefono: p.telefono, correo: p.correo, personas: p.personas, menores: p.menores || 0, clases: p.clases, quedan: p.quedan, usadas: p.usadas,
    proximas: cl.filter(x => x.fecha >= hoy), pasadas: cl.filter(x => x.fecha < hoy).length };
}
/** Llegó el pago de un pack comprado en la web: el pack queda activo (con la forma de pago real) y la 1ª clase pasa a ser "Pack" en $0. */
async function activarPack(db, r) {
  const t = ahoraChile();
  await db.batch([db.prepare("UPDATE packs SET estado = 'activo', medio = ?, fecha_pago = ? WHERE id = ? AND estado = 'pendiente'").bind(r.medio || 'Mercado Pago', t.fecha, r.pack),
    db.prepare("UPDATE reservas SET total = 0, medio = 'Pack' WHERE ref = ?").bind(r.ref)]);
}

/** Vender un pack solo (sin clase), marcar que se pagó, o anularlo (sus clases quedan como estaban). */
async function packAccion(env, q, d) {
  const db = env.DB, a = await ajustes(db);
  await packTabla(db);
  if (d.vender) {
    const nombre = nombrePropio(d.nombre); if (nombre.length < 2) throw err('Elige el cliente.');
    const personas = Math.max(1, Math.min(3, Math.floor(Number(d.personas) || 1))); // pack: 1 a 3 personas
    const total = d.total === '' || d.total == null ? precioPack(a, personas) : Math.round(Number(String(d.total).replace(/\D/g, '')) || 0);
    if (!(total > 0)) throw err('Escribe el precio del pack.');
    await crearPack(db, a, q, { nombre, telefono: String(d.telefono || '').trim(), correo: norm(d.correo), personas, total, medio: d.medio });
  } else {
    const p = await db.prepare('SELECT * FROM packs WHERE id = ?').bind(String(d.id || '')).first();
    if (!p) throw err('No encontramos ese pack.');
    if (d.pagado) { const medio = MEDIOS.includes(d.pagado) && !['Mercado Pago', 'Por pagar'].includes(d.pagado) ? d.pagado : ''; if (!medio) throw err('¿Cómo pagó?');
      await db.prepare('UPDATE packs SET medio = ?, fecha_pago = ? WHERE id = ?').bind(medio, ahoraChile().fecha, p.id).run(); }
    if (d.anular) await db.prepare("UPDATE packs SET estado = 'anulado', nota = TRIM(nota || ' · anulado por ' || ?) WHERE id = ?").bind(q.email, p.id).run();
    await anotar(db, q, 'pack ' + p.id + (d.anular ? ' anulado' : ' pagado ' + d.pagado));
  }
  return panel(env, q);
}

// ---------- Rentas y Notas (Isidora 22-11): para la recepcionista y los administradores ----------
// Rentas: qué se arrendó (tablas / trajes), medio día o día completo, y si ya volvió. El cobro sigue pasando por Tuu
// (Finanzas ya suma las ventas "Renta …" de Tuu), así que aquí no se suma plata: es el control de lo que está afuera.
// Notas: avisos para el equipo (se marcan como listos) e información fija que hay que saber.
const RENTA_PAGOS = ['POS', 'Efectivo', 'Transferencia', 'Falta pagar', 'Link de pago'];
async function rnTablas(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS rentas (id TEXT PRIMARY KEY, creada_ms INTEGER NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL, nombre TEXT NOT NULL, telefono TEXT NOT NULL DEFAULT '', tablas INTEGER NOT NULL DEFAULT 0, trajes INTEGER NOT NULL DEFAULT 0, tiempo TEXT NOT NULL DEFAULT 'medio', pago TEXT NOT NULL DEFAULT '', nota TEXT NOT NULL DEFAULT '', por TEXT NOT NULL DEFAULT '', devuelta_ms INTEGER NOT NULL DEFAULT 0, devuelta_hora TEXT NOT NULL DEFAULT '', devuelta_por TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'activa')"),
    db.prepare("CREATE TABLE IF NOT EXISTS ventas (id TEXT PRIMARY KEY, creada_ms INTEGER NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL, detalle TEXT NOT NULL, area TEXT NOT NULL DEFAULT 'tienda', monto INTEGER NOT NULL DEFAULT 0, pago TEXT NOT NULL DEFAULT '', por TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'activa')"),
    db.prepare("CREATE TABLE IF NOT EXISTS productos (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, precio INTEGER NOT NULL DEFAULT 0, orden INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1)"),
    db.prepare("CREATE TABLE IF NOT EXISTS notas (id TEXT PRIMARY KEY, creada_ms INTEGER NOT NULL, por TEXT NOT NULL DEFAULT '', tipo TEXT NOT NULL DEFAULT 'aviso', texto TEXT NOT NULL, importante INTEGER NOT NULL DEFAULT 0, lista_ms INTEGER NOT NULL DEFAULT 0, lista_por TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'activa')")
  ]);
  // Isidora (23-11): la renta guarda cuánto pagó (Finanzas suma desde el Panel, no desde Tuu).
  try { await db.prepare('ALTER TABLE rentas ADD COLUMN monto INTEGER NOT NULL DEFAULT 0').run(); } catch (_) {}
  try { await db.prepare('ALTER TABLE rentas ADD COLUMN fibras INTEGER NOT NULL DEFAULT 0').run(); } catch (_) {} // Isidora (23-11): tabla soft (tablas) y tabla de fibra (fibras)
  try { await db.prepare('ALTER TABLE rentas ADD COLUMN dias INTEGER NOT NULL DEFAULT 1').run(); } catch (_) {} // Isidora (25-11): día completo por varios días (1 tabla × 3 días)
  const n = await db.prepare('SELECT COUNT(*) n FROM productos').first();
  if (!n.n) await db.batch(PRODUCTOS_BASE.map((x, i) => db.prepare('INSERT INTO productos (id, nombre, precio, orden) VALUES (?, ?, ?, ?)').bind('P' + (i + 1), x[0], x[1], i)));
}
// Productos de la tienda (los que se vendían en Tuu). Isidora los cambia en el Panel (Rentas y tienda > Editar productos).
const PRODUCTOS_BASE = [['Cera', 4000], ['Solarez Azul', 17000], ['Surfmud 125gr', 22000]];
// Precio de renta por tabla o traje (se puede cambiar al anotar).
// Isidora (23-11): tabla soft y traje $10.000 medio día / $20.000 día completo; tabla de fibra $20.000 medio día / $40.000 día completo.
const PRECIO_RENTA = { tablas: { medio: 10000, dia: 20000 }, fibras: { medio: 20000, dia: 40000 }, trajes: { medio: 10000, dia: 20000 } };
const VENTA_PAGOS = ['POS', 'Efectivo', 'Transferencia'];
// Isidora (23-11): desde este día cada renta y venta de tienda se anota en el Panel al cobrar. Tuu ya no se clasifica: solo control del día y comisión.
const PANEL_DESDE = '2026-11-24';
/** Nombre corto para mostrar quién anotó algo. */
async function quienNombre(env, email) {
  const e = norm(email), a = await ajustes(env.DB);
  const ins = (await instructores(env.DB)).find(i => norm(i.correo) === e);
  if (ins) return ins.nombre;
  if ((a.recepcion || []).map(norm).includes(e)) return 'Recepción';
  if (/isidora|contacto@stormsurf/.test(e)) return 'Isidora';
  const l = e.split('@')[0].replace(/[._\d-]+/g, ' ').trim();
  return l ? l[0].toUpperCase() + l.slice(1) : 'Storm';
}
const nuevoId = (p, t) => p + '-' + t.fecha.slice(2).replace(/-/g, '') + '-' + Math.floor(Math.random() * 900000 + 100000);
async function rentasLista(env) {
  const db = env.DB, desde = Date.now() - 35 * 86400000;
  const r = (await db.prepare("SELECT * FROM rentas WHERE estado = 'activa' AND (devuelta_ms = 0 OR devuelta_ms > ?) ORDER BY creada_ms DESC LIMIT 300").bind(desde).all()).results;
  return r.map(x => ({ id: x.id, fecha: x.fecha, hora: x.hora, nombre: x.nombre, telefono: x.telefono, tablas: x.tablas, fibras: x.fibras || 0, trajes: x.trajes, tiempo: x.tiempo, dias: x.tiempo === 'dia' ? x.dias || 1 : 1, pago: x.pago, monto: x.monto || 0, nota: x.nota, por: x.por,
    devuelta: !!x.devuelta_ms, devueltaHora: x.devuelta_hora, devueltaPor: x.devuelta_por }));
}
/** Anota una renta nueva (desde Nueva renta o desde el carro de Cobrar). Devuelve su id. */
async function crearRenta(env, q, d, yo) {
  const db = env.DB, t = ahoraChile();
  const nombre = nombrePropio(d.nombre); if (nombre.length < 2) throw err('Escribe el nombre de quien arrienda.');
  const n20 = v => Math.max(0, Math.min(20, Math.floor(Number(v) || 0))), tablas = n20(d.tablas), fibras = n20(d.fibras), trajes = n20(d.trajes);
  if (!tablas && !fibras && !trajes) throw err('Elige tabla soft, tabla de fibra o traje.');
  const tiempo = d.tiempo === 'dia' ? 'dia' : d.tiempo === 'medio' ? 'medio' : ''; if (!tiempo) throw err('Elige medio día o día completo.');
  const dias = tiempo === 'dia' ? Math.max(1, Math.min(14, Math.floor(Number(d.dias) || 1))) : 1;
  const pago = RENTA_PAGOS.includes(d.pago) ? d.pago : ''; if (!pago) throw err('Elige cómo pagó.');
  const hora = normHora(d.hora) || t.hora;
  const monto = d.monto != null && d.monto !== '' ? Math.max(0, Math.round(Number(String(d.monto).replace(/\D/g, '')) || 0)) : dias * (tablas * PRECIO_RENTA.tablas[tiempo] + fibras * PRECIO_RENTA.fibras[tiempo] + trajes * PRECIO_RENTA.trajes[tiempo]);
  if (pago === 'Link de pago' && !monto) throw err('Escribe cuánto se cobra.');
  const id = nuevoId('R', t);
  const telefono = String(d.telefono || '').trim().slice(0, 30);
  await db.prepare('INSERT INTO rentas (id, creada_ms, fecha, hora, nombre, telefono, tablas, fibras, trajes, tiempo, dias, pago, nota, por, monto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, Date.now(), t.fecha, hora, nombre, telefono, tablas, fibras, trajes, tiempo, dias, pago, String(d.nota || '').trim().slice(0, 300), yo, monto).run();
  await guardarCliente(db, nombre, telefono, 'renta', t.fecha);
  await anotar(db, q, 'renta ' + nombre + ' ' + tablas + 'S ' + fibras + 'F ' + trajes + 'J ' + tiempo + (dias > 1 ? ' ' + dias + 'd' : ''));
  return id;
}
/** Rentas armadas en el carro (todavía sin guardar): se revisan todas antes de guardar ninguna. */
const rentasCarro = d => (Array.isArray(d.nuevasRentas) ? d.nuevasRentas : []).slice(0, 10);
async function guardarRentasCarro(env, q, d, pago, yo) {
  const L = rentasCarro(d); if (!L.length) return [];
  for (const r of L) { if (nombrePropio(r.nombre).length < 2) throw err('Falta el nombre en la renta nueva.'); if (!(Number(r.tablas) || Number(r.fibras) || Number(r.trajes)) || !['medio', 'dia'].includes(r.tiempo)) throw err('Revisa la renta nueva: qué se lleva y cuánto tiempo.'); }
  const ids = []; for (const r of L) ids.push(await crearRenta(env, q, Object.assign({}, r, { pago }), yo));
  return ids;
}
async function rentasAccion(env, q, d) {
  if (!['admin', 'recepcion'].includes(q.rol)) throw err('Solo la recepción y los administradores ven las rentas.');
  const db = env.DB; await rnTablas(db);
  const t = ahoraChile(), op = d.op || 'ver', yo = op === 'ver' ? '' : await quienNombre(env, q.email);
  let nuevo = '';
  if (op === 'nueva') {
    if (d.pago === 'Link de pago') throw err('Las rentas se cobran con POS, efectivo o transferencia.');
    nuevo = await crearRenta(env, q, d, yo);
  } else if (op !== 'ver') {
    const x = await db.prepare('SELECT * FROM rentas WHERE id = ?').bind(String(d.id || '')).first();
    if (!x) throw err('No encontramos esa renta.');
    if (op === 'devuelta') await db.prepare('UPDATE rentas SET devuelta_ms = ?, devuelta_hora = ?, devuelta_por = ? WHERE id = ?').bind(Date.now(), t.fecha === x.fecha ? t.hora : t.fecha.slice(8) + '/' + t.fecha.slice(5, 7) + ' ' + t.hora, yo, x.id).run();
    else if (op === 'deshacer') await db.prepare("UPDATE rentas SET devuelta_ms = 0, devuelta_hora = '', devuelta_por = '' WHERE id = ?").bind(x.id).run();
    else if (op === 'pago') { const p = RENTA_PAGOS.includes(d.pago) && !['Falta pagar', 'Link de pago'].includes(d.pago) ? d.pago : ''; if (!p) throw err('¿Cómo pagó?'); await db.prepare('UPDATE rentas SET pago = ? WHERE id = ?').bind(p, x.id).run();
      // pagó de otra forma: el link que la tenía ya no se cobra
      await linkTabla(db); for (const L of (await db.prepare("SELECT * FROM links WHERE estado = 'pendiente'").all()).results) if (partesDe(L).some(y => y.id === x.id)) await db.prepare("UPDATE links SET estado = 'anulada' WHERE ref = ?").bind(L.ref).run(); }
    else if (op === 'borrar') await db.prepare("UPDATE rentas SET estado = 'borrada' WHERE id = ?").bind(x.id).run();
    else throw err('Acción desconocida');
    await anotar(db, q, 'renta ' + x.id + ' ' + op);
  }
  const o = Object.assign({ ok: true, hoy: t.fecha, rentas: await rentasLista(env), nuevo }, await tiendaLista(env, q));
  if (op === 'ver' || op === 'nueva') o.clientes = await clientesLista(env); // para buscar a quien arrienda
  return o;
}
async function tiendaLista(env, q) {
  const db = env.DB, desde = ahoraChile(Date.now() - 30 * 86400000).fecha;
  const ventas = (await db.prepare("SELECT * FROM ventas WHERE estado = 'activa' AND fecha >= ? ORDER BY creada_ms DESC LIMIT 500").bind(desde).all()).results
    .map(x => ({ id: x.id, fecha: x.fecha, hora: x.hora, detalle: x.detalle, area: x.area, monto: x.monto, pago: x.pago, por: x.por }));
  const productos = (await db.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY orden, nombre').all()).results.map(x => ({ id: x.id, nombre: x.nombre, precio: x.precio }));
  return { ventas, productos, precios: PRECIO_RENTA, admin: q.rol === 'admin', links: await linksLista(db) };
}
/** Venta de tienda o cobro por daño, anotada al cobrar. Productos: solo administradores los cambian. */
async function tiendaAccion(env, q, d) {
  if (!['admin', 'recepcion'].includes(q.rol)) throw err('Solo la recepción y los administradores anotan ventas.');
  const db = env.DB; await rnTablas(db);
  const t = ahoraChile(), op = d.op || 'ver', num = v => Math.max(0, Math.round(Number(String(v == null ? '' : v).replace(/\D/g, '')) || 0));
  if (op === 'venta') {
    const pago = VENTA_PAGOS.includes(d.pago) ? d.pago : ''; if (!pago) throw err('Elige cómo pagó.');
    const prods = (await db.prepare('SELECT * FROM productos').all()).results, lineas = [];
    (Array.isArray(d.items) ? d.items : []).forEach(i => { const p = prods.find(x => x.id === String(i.id)), n = Math.min(50, Math.floor(Number(i.cant) || 0)); if (p && n > 0) lineas.push({ detalle: (n > 1 ? n + ' × ' : '') + p.nombre, monto: p.precio * n, area: 'tienda' }); });
    const otro = num(d.otroMonto); if (otro) lineas.push({ detalle: String(d.otroDetalle || '').trim().slice(0, 80) || 'Otro producto', monto: otro, area: 'tienda' });
    const dano = num(d.danoMonto); if (dano) lineas.push({ detalle: 'Cobro por daño' + (String(d.danoDetalle || '').trim() ? ': ' + String(d.danoDetalle).trim().slice(0, 80) : ''), monto: dano, area: 'renta' });
    // Rentas y clases sin pagar sumadas al carro (el monto se lee aquí): cada una queda pagada en su área
    const ids = new Set([].concat(d.rentas || [], d.clases || []).map(String)), otras = ids.size ? (await linkOpciones(env)).filter(o => ids.has(o.id)) : [];
    const partes = lineas.map(l => Object.assign({ tipo: 'tienda' }, l)).concat(otras.map(o => ({ tipo: o.tipo, id: o.id, detalle: o.detalle, monto: o.monto })));
    if (!partes.length && !rentasCarro(d).length) throw err('Elige qué se cobra.');
    const yo = await quienNombre(env, q.email);
    const nuevas = await guardarRentasCarro(env, q, d, pago, yo); // las rentas armadas en el carro se guardan ya pagadas con esta forma de pago
    if (otras.length) { // si estaban en un link esperando pago, ese link se anula (ya se pagó aquí)
      await linkTabla(db);
      const viejos = (await db.prepare("SELECT * FROM links WHERE estado = 'pendiente'").all()).results.filter(L => partesDe(L).some(p => p.id && ids.has(p.id)));
      if (viejos.length) await db.batch(viejos.map(L => db.prepare("UPDATE links SET estado = 'anulada' WHERE ref = ? AND estado = 'pendiente'").bind(L.ref)));
    }
    if (partes.length) { await anotarPartes(env, partes, pago, yo, null, false); await anotar(db, q, 'venta ' + partes.map(l => l.detalle).join(', ')); }
    if (nuevas.length && !partes.length) await anotar(db, q, 'cobro rentas ' + nuevas.join(', '));
  } else if (op === 'borrar') {
    await db.prepare("UPDATE ventas SET estado = 'borrada' WHERE id = ?").bind(String(d.id || '')).run();
    await anotar(db, q, 'venta borrada ' + d.id);
  } else if (op === 'producto' || op === 'quitar') {
    if (q.rol !== 'admin') throw err('Solo un administrador cambia los productos.');
    if (op === 'quitar') await db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').bind(String(d.id || '')).run();
    else {
      const nombre = String(d.nombre || '').trim().slice(0, 60), precio = num(d.precio);
      if (nombre.length < 2) throw err('Escribe el nombre del producto.'); if (!precio) throw err('Escribe el precio.');
      if (d.id) await db.prepare('UPDATE productos SET nombre = ?, precio = ? WHERE id = ?').bind(nombre, precio, String(d.id)).run();
      else await db.prepare('INSERT INTO productos (id, nombre, precio, orden) VALUES (?, ?, ?, 0)').bind('P' + Date.now().toString(36), nombre, precio).run();
    }
    await anotar(db, q, 'producto ' + op + ' ' + (d.nombre || d.id));
  } else if (op !== 'ver') throw err('Acción desconocida');
  return Object.assign({ ok: true, hoy: t.fecha, rentas: await rentasLista(env) }, await tiendaLista(env, q));
}
async function notasLista(env) {
  const desde = Date.now() - 30 * 86400000;
  const r = (await env.DB.prepare("SELECT * FROM notas WHERE estado = 'activa' AND (lista_ms = 0 OR lista_ms > ?) ORDER BY importante DESC, creada_ms DESC LIMIT 300").bind(desde).all()).results;
  return r.map(x => ({ id: x.id, ms: x.creada_ms, fecha: ahoraChile(x.creada_ms).fecha, hora: ahoraChile(x.creada_ms).hora, por: x.por, tipo: x.tipo, texto: x.texto, importante: !!x.importante, lista: !!x.lista_ms, listaPor: x.lista_por, listaFecha: x.lista_ms ? ahoraChile(x.lista_ms).fecha : '' }));
}
async function notasAccion(env, q, d) {
  if (!['admin', 'recepcion'].includes(q.rol)) throw err('Solo la recepción y los administradores ven las notas.');
  const db = env.DB; await rnTablas(db);
  const t = ahoraChile(), op = d.op || 'ver', yo = op === 'ver' ? '' : await quienNombre(env, q.email);
  if (op === 'nueva') {
    const texto = String(d.texto || '').trim().slice(0, 2000); if (texto.length < 2) throw err('Escribe la nota.');
    await db.prepare('INSERT INTO notas (id, creada_ms, por, tipo, texto, importante) VALUES (?, ?, ?, ?, ?, ?)').bind(nuevoId('N', t), Date.now(), yo, d.tipo === 'info' ? 'info' : 'aviso', texto, d.importante ? 1 : 0).run();
    await anotar(db, q, 'nota nueva');
  } else if (op !== 'ver') {
    const x = await db.prepare('SELECT * FROM notas WHERE id = ?').bind(String(d.id || '')).first();
    if (!x) throw err('No encontramos esa nota.');
    if (op === 'lista') await db.prepare('UPDATE notas SET lista_ms = ?, lista_por = ? WHERE id = ?').bind(Date.now(), yo, x.id).run();
    else if (op === 'reabrir') await db.prepare("UPDATE notas SET lista_ms = 0, lista_por = '' WHERE id = ?").bind(x.id).run();
    else if (op === 'importante') await db.prepare('UPDATE notas SET importante = ? WHERE id = ?').bind(d.importante ? 1 : 0, x.id).run();
    else if (op === 'editar') { const texto = String(d.texto || '').trim().slice(0, 2000); if (texto.length < 2) throw err('Escribe la nota.'); await db.prepare('UPDATE notas SET texto = ? WHERE id = ?').bind(texto, x.id).run(); }
    else if (op === 'borrar') await db.prepare("UPDATE notas SET estado = 'borrada' WHERE id = ?").bind(x.id).run();
    else throw err('Acción desconocida');
    await anotar(db, q, 'nota ' + x.id + ' ' + op);
  }
  return { ok: true, hoy: t.fecha, notas: await notasLista(env) };
}

// ---------- Link de pago (Isidora 24-11): un solo carro con productos de la tienda, rentas y clases sin pagar ----------
// Se cobra con la pantalla Storm /pagar (solo Webpay). Desde 24-11 solo clases: tienda y rentas van por POS. Referencia LK-. Al pagarse, cada parte queda anotada en su área:
// la tienda como venta, la renta con su forma de pago y la clase pagada en la Agenda. Así Finanzas suma cada cosa donde va.
const LINK_COMISION = { 'Webpay crédito': 0.0229 * 1.19, 'Webpay débito': 0.0149 * 1.19, 'Webpay': 0.0229 * 1.19, 'Mercado Pago': 0.0229 * 1.19 };
async function linkTabla(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS links (ref TEXT PRIMARY KEY, creada_ms INTEGER NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL, por TEXT NOT NULL DEFAULT '', nombre TEXT NOT NULL DEFAULT '', telefono TEXT NOT NULL DEFAULT '', total INTEGER NOT NULL DEFAULT 0, partes TEXT NOT NULL DEFAULT '[]', estado TEXT NOT NULL DEFAULT 'pendiente', orden_mp TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', medio TEXT NOT NULL DEFAULT '', pagado_ms INTEGER NOT NULL DEFAULT 0)").run();
}
const partesDe = L => { try { const v = JSON.parse(L.partes || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
const origenApp = () => PAGINA.replace(/\/reservar\/$/, '');
/** Lo que falta cobrar de una clase: la clase entera (pendiente o 'Por pagar') o las diferencias sin cobrar. */
const debeClase = r => r.estado === 'pagada' && r.medio !== 'Por pagar' ? saldosDe(r).filter(x => !x.medio).reduce((t, x) => t + (x.monto || 0), 0) : (Number(r.total) || 0);
const rentaTiempo = x => x.tiempo !== 'dia' ? 'medio día' : (x.dias || 1) > 1 ? x.dias + ' días completos' : 'día completo';
/** Cómo ve el cliente una renta en la página de pago (Isidora 24-11: el carro del cliente tiene que ser explícito). */
const rentaCliente = x => 'Arriendo · ' + [x.tablas ? x.tablas + (x.tablas === 1 ? ' tabla soft' : ' tablas soft') : '', x.fibras ? x.fibras + (x.fibras === 1 ? ' tabla de fibra' : ' tablas de fibra') : '', x.trajes ? x.trajes + (x.trajes === 1 ? ' traje' : ' trajes') : ''].filter(Boolean).join(', ') + ' · ' + rentaTiempo(x);
/** Rentas y clases que se pueden sumar a un link (sin pagar). */
async function linkOpciones(env) {
  const db = env.DB, hoy = ahoraChile().fecha;
  const rentas = (await db.prepare("SELECT * FROM rentas WHERE estado = 'activa' AND pago IN ('Falta pagar', 'Link de pago') AND creada_ms > ? ORDER BY creada_ms DESC").bind(Date.now() - 14 * 86400000).all()).results
    .filter(x => x.monto > 0).map(x => ({ tipo: 'renta', id: x.id, detalle: 'Renta · ' + x.nombre, cliente: rentaCliente(x), sub: [x.tablas ? x.tablas + ' soft' : '', x.fibras ? x.fibras + ' fibra' : '', x.trajes ? x.trajes + (x.trajes === 1 ? ' traje' : ' trajes') : ''].filter(Boolean).join(' · ') + ' · ' + rentaTiempo(x), monto: x.monto, telefono: x.telefono || '', nombre: x.nombre }));
  const clases = (await db.prepare("SELECT * FROM reservas WHERE fecha BETWEEN ? AND ? AND (estado = 'pendiente' OR (estado = 'pagada' AND (medio = 'Por pagar' OR saldos LIKE '%\"medio\":\"\"%'))) ORDER BY fecha, hora").bind(sumarDias(hoy, -14), sumarDias(hoy, 14)).all()).results
    .filter(r => r.estado !== 'pendiente' || aMano(r)).map(r => ({ tipo: 'clase', id: r.ref, detalle: 'Clase · ' + r.nombre, cliente: 'Clase de surf · ' + DIAS[new Date(diaUTC(r.fecha)).getUTCDay()].replace(/^./, c => c.toUpperCase()) + ' ' + (+r.fecha.slice(8)) + '/' + (+r.fecha.slice(5, 7)) + ' · ' + r.hora + ' · ' + r.personas + (r.personas === 1 ? ' persona' : ' personas') + (debeClase(r) < (Number(r.total) || 0) ? ' (diferencia)' : ''), sub: (r.fecha === hoy ? 'Hoy' : r.fecha.slice(8) + '/' + r.fecha.slice(5, 7)) + ' ' + r.hora + ' · ' + r.personas + (r.personas === 1 ? ' persona' : ' personas'), monto: debeClase(r), telefono: r.telefono || '', nombre: r.nombre }))
    .filter(x => x.monto > 0);
  return rentas.concat(clases);
}
async function linksLista(db) {
  await linkTabla(db);
  return (await db.prepare("SELECT * FROM links WHERE estado = 'pendiente' OR (estado = 'pagada' AND pagado_ms > ?) ORDER BY creada_ms DESC LIMIT 50").bind(Date.now() - 2 * 86400000).all()).results
    .map(L => ({ ref: L.ref, fecha: L.fecha, hora: L.hora, nombre: L.nombre, telefono: L.telefono, total: L.total, estado: L.estado, medio: L.medio, link: L.link, por: L.por, partes: partesDe(L).map(p => p.detalle) }));
}
async function mpOrden(env, ref, total, titulo, items) {
  const o = origenApp();
  const orden = { type: 'online', processing_mode: 'manual', total_amount: String(total), external_reference: ref, description: titulo,
    items: [{ title: items.map(i => i.tipo === 'renta' ? 'Renta' : i.tipo === 'clase' ? 'Clase de surf' : i.detalle).join(' + ').slice(0, 120), quantity: 1, unit_price: String(total) }],
    config: { online: { success_url: o + '/pagar/?listo=link', pending_url: o + '/pagar/?listo=proceso', failure_url: o + '/pagar/?listo=error', auto_return: 'approved' }, payment_method: { max_installments: 1 } } };
  try {
    const x = await fetch((env.MP_API || MP_API) + '/v1/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.MP_TOKEN, 'X-Idempotency-Key': ref }, body: JSON.stringify(orden) });
    const res = await x.json().catch(() => ({}));
    return x.status < 300 && res.id ? res : null;
  } catch (_) { return null; }
}
async function linkAccion(env, q, d, ctx) {
  if (!['admin', 'recepcion'].includes(q.rol)) throw err('Solo la recepción y los administradores hacen links de pago.');
  const db = env.DB; await rnTablas(db); await linkTabla(db);
  const t = ahoraChile(), op = d.op || 'lista', num = v => Math.max(0, Math.round(Number(String(v == null ? '' : v).replace(/\D/g, '')) || 0));
  if (op === 'opciones') return { ok: true, opciones: await linkOpciones(env), links: await linksLista(db) };
  if (op === 'crear') {
    if (!env.MP_TOKEN) throw err('El pago en línea no está activo en este momento.');
    // Solo clases (Isidora 24-11): lo online entra por Webpay y se declara exento de IVA. Tienda y rentas llevan IVA: se cobran con POS.
    const ops0 = await linkOpciones(env), ids0 = new Set([].concat(d.rentas || [], d.clases || []).map(String));
    if ((Array.isArray(d.items) && d.items.some(i => Number(i.cant) > 0)) || num(d.otroMonto) || num(d.danoMonto) || rentasCarro(d).length || ops0.some(o => ids0.has(o.id) && o.tipo !== 'clase'))
      throw err('El link de pago es solo para clases. La tienda y las rentas se cobran con POS.');
    const partes = [];
    // Tienda: los mismos productos y precios que Venta tienda
    const prods = (await db.prepare('SELECT * FROM productos').all()).results, lineas = [];
    (Array.isArray(d.items) ? d.items : []).forEach(i => { const p = prods.find(x => x.id === String(i.id)), n = Math.min(50, Math.floor(Number(i.cant) || 0)); if (p && n > 0) lineas.push({ detalle: (n > 1 ? n + ' × ' : '') + p.nombre, monto: p.precio * n, area: 'tienda' }); });
    const otro = num(d.otroMonto); if (otro) lineas.push({ detalle: String(d.otroDetalle || '').trim().slice(0, 80) || 'Otro producto', monto: otro, area: 'tienda' });
    const dano = num(d.danoMonto); if (dano) lineas.push({ detalle: 'Cobro por daño' + (String(d.danoDetalle || '').trim() ? ': ' + String(d.danoDetalle).trim().slice(0, 80) : ''), monto: dano, area: 'renta' });
    lineas.forEach(l => partes.push(Object.assign({ tipo: 'tienda' }, l)));
    // Rentas armadas en el carro: se guardan ahora esperando el link (si el link falla, quedan como renta 'Esperando pago' y se cobran igual)
    const yo0 = await quienNombre(env, q.email), nuevas = await guardarRentasCarro(env, q, d, 'Link de pago', yo0);
    // Rentas y clases sin pagar elegidas (el monto se lee aquí, no se confía en lo que manda el celular)
    const ops = await linkOpciones(env), ids = new Set([].concat(d.rentas || [], d.clases || [], nuevas).map(String));
    ops.filter(o => ids.has(o.id)).forEach(o => partes.push({ tipo: o.tipo, id: o.id, detalle: o.detalle + (o.sub ? ' (' + o.sub + ')' : ''), cliente: o.cliente, monto: o.monto }));
    // Si el link no se puede crear, las rentas armadas en el carro se deshacen (así al reintentar no quedan repetidas)
    const deshacer = async m => { if (nuevas.length) await db.batch(nuevas.map(id => db.prepare("UPDATE rentas SET estado = 'borrada' WHERE id = ?").bind(id))); throw err(m); };
    if (!partes.length) await deshacer('Elige qué se cobra en el link.');
    const total = partes.reduce((s, p) => s + p.monto, 0);
    if (total < 50) await deshacer('El total es muy bajo para un link de pago.');
    const prim = ops.find(o => ids.has(o.id)) || {};
    const nombre = nombrePropio(d.nombre || prim.nombre || ''), telefono = String(d.telefono || prim.telefono || '').trim().slice(0, 30), yo = await quienNombre(env, q.email);
    const ref = 'LK-' + t.fecha.slice(2).replace(/-/g, '') + '-' + nuevaClave().slice(0, 8).toUpperCase();
    const o = await mpOrden(env, ref, total, 'Storm' + (nombre ? ' · ' + nombre : ''), partes);
    if (!o) await deshacer('No pudimos crear el link. Intenta de nuevo en un momento.');
    const link = origenApp() + '/pagar/?o=' + encodeURIComponent(o.id);
    // Una renta o clase va en un solo link pendiente: los anteriores que la tenían se anulan (así no se cobra dos veces)
    const viejos = (await db.prepare("SELECT * FROM links WHERE estado = 'pendiente'").all()).results.filter(L => partesDe(L).some(p => p.id && ids.has(p.id)));
    const st = viejos.map(L => db.prepare("UPDATE links SET estado = 'anulada' WHERE ref = ? AND estado = 'pendiente'").bind(L.ref));
    st.push(db.prepare('INSERT INTO links (ref, creada_ms, fecha, hora, por, nombre, telefono, total, partes, orden_mp, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(ref, Date.now(), t.fecha, t.hora, yo, nombre, telefono, total, JSON.stringify(partes), String(o.id), link));
    partes.filter(p => p.tipo === 'renta').forEach(p => st.push(db.prepare("UPDATE rentas SET pago = 'Link de pago' WHERE id = ? AND pago = 'Falta pagar'").bind(p.id)));
    await db.batch(st);
    await anotar(db, q, 'link ' + ref + ' ' + total);
    return { ok: true, nuevo: { ref, link, total, nombre, telefono, partes: partes.map(p => p.detalle) }, links: await linksLista(db) };
  }
  const L = await db.prepare('SELECT * FROM links WHERE ref = ?').bind(String(d.ref || '')).first();
  if (op !== 'lista' && !L) throw err('No encontramos ese link.');
  if (op === 'anular') {
    if (L.estado !== 'pendiente') throw err('Ese link ya no está esperando pago.');
    const st = [db.prepare("UPDATE links SET estado = 'anulada' WHERE ref = ? AND estado = 'pendiente'").bind(L.ref)];
    partesDe(L).filter(p => p.tipo === 'renta').forEach(p => st.push(db.prepare("UPDATE rentas SET pago = 'Falta pagar' WHERE id = ? AND pago = 'Link de pago'").bind(p.id)));
    await db.batch(st); await anotar(db, q, 'link anulado ' + L.ref);
  } else if (op === 'revisar') await revisarLink(env, L, ctx);
  return { ok: true, links: await linksLista(db) };
}
/** Revisa si el link se pagó (Webpay, Flow o Mercado Pago) y, si se pagó, anota cada parte. */
async function revisarLink(env, L, ctx) {
  if (!L || L.estado !== 'pendiente') return L && L.estado;
  const om = String(L.orden_mp || '');
  if (om.startsWith('webpay:')) {
    const o = await webpayEstado(env, om.slice(7));
    if (!(o && o.status === 'AUTHORIZED' && Number(o.response_code) === 0)) return L.estado;
    return confirmarLink(env, L, ['VD', 'VP'].includes(o.payment_type_code) ? 'Webpay débito' : 'Webpay crédito', Number(o.amount), ctx);
  }
  if (om.startsWith('flow:')) {
    const o = await flowEstado(env, om.slice(5));
    return o && Number(o.status) === 2 && String(o.commerceOrder || '').indexOf(L.ref) === 0 ? confirmarLink(env, L, 'Flow', Number(o.amount), ctx) : L.estado;
  }
  if (!om || !env.MP_TOKEN) return L.estado;
  let o = null;
  try { const x = await fetch((env.MP_API || MP_API) + '/v1/orders/' + encodeURIComponent(om), { headers: { Authorization: 'Bearer ' + env.MP_TOKEN } }); if (x.ok) o = await x.json(); } catch (_) {}
  if (o && o.external_reference === L.ref && o.status === 'processed' && o.status_detail === 'accredited') return confirmarLink(env, L, 'Mercado Pago', Number(o.total_paid_amount || o.total_amount), ctx);
  return L.estado;
}
/** Anota cada parte cobrada en su área: tienda como venta, renta con su forma de pago, clase pagada en la Agenda.
 *  Lo usan el link de pago (al pagarse) y el carro de la recepción (al cobrar con la máquina, efectivo o transferencia). */
async function anotarPartes(env, partes, medio, por, ctx, enLinea) {
  const db = env.DB, t = ahoraChile(), st = [], packs = [];
  for (const p of partes) {
    if (p.tipo === 'tienda') st.push(db.prepare('INSERT INTO ventas (id, creada_ms, fecha, hora, detalle, area, monto, pago, por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(nuevoId('V', t), Date.now(), t.fecha, t.hora, p.detalle, p.area || 'tienda', p.monto, medio, por));
    else if (p.tipo === 'renta') st.push(db.prepare("UPDATE rentas SET pago = ?, monto = ? WHERE id = ? AND pago IN ('Falta pagar', 'Link de pago')").bind(medio, p.monto, p.id));
    else if (p.tipo === 'clase') {
      const r = await db.prepare('SELECT * FROM reservas WHERE ref = ?').bind(p.id).first(); if (!r) continue;
      if (r.estado === 'pagada' && r.medio !== 'Por pagar') { const sl = saldosDe(r); sl.forEach(x => { if (!x.medio) { x.medio = medio; x.pagado = t.fecha; } }); st.push(db.prepare('UPDATE reservas SET saldos = ? WHERE ref = ?').bind(JSON.stringify(sl), r.ref)); }
      else if (r.estado === 'pagada') st.push(db.prepare("UPDATE reservas SET medio = ? WHERE ref = ? AND medio = 'Por pagar'").bind(medio, r.ref));
      else if (r.estado === 'pendiente' && enLinea) { await db.prepare('UPDATE reservas SET medio = ? WHERE ref = ?').bind(medio, r.ref).run(); await confirmar(env, Object.assign({}, r, { medio }), r.total, ctx); }
      else if (r.estado === 'pendiente') { // en la recepción: igual que marcar en el Panel cómo pagó (queda pagada y con el horario fijo)
        st.push(db.prepare("UPDATE reservas SET estado = 'pagada', medio = ?, link_pago = '' WHERE ref = ? AND estado = 'pendiente'").bind(medio, r.ref), db.prepare('UPDATE bloques SET hasta = 0 WHERE ref = ?').bind(r.ref));
        if (r.pack) packs.push(Object.assign({}, r, { medio }));
      }
    }
  }
  if (st.length) await db.batch(st);
  for (const r of packs) await activarPack(db, r);
}
async function confirmarLink(env, L, medio, monto, ctx) {
  const db = env.DB, t = ahoraChile();
  if (Math.round(monto) < L.total) { console.error('Link monto distinto', L.ref, monto, L.total); return L.estado; }
  const ch = await db.prepare("UPDATE links SET estado = 'pagada', medio = ?, pagado_ms = ? WHERE ref = ? AND estado = 'pendiente'").bind(medio, Date.now(), L.ref).run();
  if (!ch.meta || !ch.meta.changes) return 'pagada'; // ya estaba anotado
  const partes = partesDe(L);
  await anotarPartes(env, partes, medio, 'Link de pago', ctx, true);
  const a = await ajustes(db);
  tarea(ctx, enviarPush(env, a.admins, 'Pagaron un link 💳 ' + clp(L.total), (L.nombre ? L.nombre + ' · ' : '') + partes.map(p => p.detalle).join(', ').slice(0, 160)));
  return 'pagada';
}

/** Para Finanzas (programa de la planilla Anual): ventas del mes, por medio de pago, y lo que se paga a instructores. mes = 'AAAA-MM'. */
async function finanzasMes(env, d) {
  const mes = /^\d{4}-\d{2}$/.test(String(d.mes || '')) ? d.mes : ahoraChile().fecha.slice(0, 7);
  const { results } = await env.DB.prepare("SELECT total, medio, saldos, pago_instructor, instructores, pagos FROM reservas WHERE substr(fecha,1,7) = ? AND fecha >= ? AND estado = 'pagada'").bind(mes, TUU_DESDE).all();
  const porMedio = {}, porInstructor = {};
  // Cada parte con su forma de pago (el pago original y las diferencias ya cobradas); lo que falta cobrar todavía no cuenta.
  results.forEach(r => { const partes = partesPago(r); r.total = partes.reduce((t, x) => t + x.monto, 0); partes.forEach(x => { porMedio[x.medio] = (porMedio[x.medio] || 0) + x.monto; }); const p = pagosDe(r); Object.keys(p).forEach(i => porInstructor[i] = (porInstructor[i] || 0) + p[i]); });
  // Packs: el ingreso entra el mes en que se pagan, con su forma de pago (así la comisión sale bien); sus clases van en $0 con medio 'Pack'.
  const packs = await packsDelMes(env.DB, mes);
  packs.forEach(k => { porMedio[k.medio] = (porMedio[k.medio] || 0) + (k.total || 0); });
  const totalPacks = packs.reduce((t, k) => t + (k.total || 0), 0);
  let tuu = null; try { tuu = await tuuResumen(env, mes); if (tuu) { delete tuu.detalle; tuu.porRevisar = tuu.porRevisar.length; } } catch (x) { console.error(x); tuu = { ok: false, error: x.message }; }
  let panelV = null; try { panelV = await ventasPanel(env, mes); } catch (x) { console.error(x); }
  // Rentas, tienda y comisión de clases con tarjeta anotadas en el Panel (desde PANEL_DESDE) van dentro de los mismos totales que el programa
  // de la planilla ya suma (tuu.rentas, tuu.productos, tuu.comAgenda): así Finanzas funciona igual aunque no se haya pegado una versión nueva.
  if (panelV && tuu && tuu.ok !== false) { tuu.rentas += panelV.rentas; tuu.comRentas += panelV.comRentas; tuu.productos += panelV.tienda; tuu.comProductos += panelV.comTienda; tuu.comAgenda += panelV.comClasesPOS; tuu.comision += panelV.comRentas + panelV.comTienda + panelV.comClasesPOS; }
  return { ok: true, mes, panel: panelV, clases: results.length, total: results.reduce((t, r) => t + (r.total || 0), 0) + totalPacks, packs: packs.length, totalPacks, mercadoPago: porMedio['Mercado Pago'] || 0, porMedio,
    instructores: results.reduce((t, r) => t + (r.pago_instructor || 0), 0), porInstructor, tuu };
}

/** Isidora (23-11): desde PANEL_DESDE las rentas y la tienda se anotan en el Panel al cobrar. Aquí se suman para Finanzas,
 *  con la comisión real de Tuu de ese mes (lo que cobró ÷ lo vendido con tarjeta) sobre lo pagado con tarjeta (POS). */
async function tasaTuu(db, mes) {
  const r = await db.prepare("SELECT SUM(monto) m, SUM(comision) c FROM tuu_ventas WHERE substr(fecha,1,7) = ? AND categoria != 'anulada' AND tipo NOT LIKE '%CASH%' AND monto > 1000").bind(mes).first().catch(() => null);
  return r && r.m > 0 ? r.c / r.m : 0.0177; // sin datos: 1,49% + IVA
}
async function ventasPanel(env, mes) {
  const db = env.DB; await rnTablas(db);
  const tasa = await tasaTuu(db, mes), desde = PANEL_DESDE;
  const rentas = (await db.prepare("SELECT monto, pago FROM rentas WHERE estado = 'activa' AND substr(fecha,1,7) = ? AND fecha >= ? AND pago NOT IN ('Falta pagar', 'Link de pago')").bind(mes, desde).all()).results;
  const ventas = (await db.prepare("SELECT monto, pago, area FROM ventas WHERE estado = 'activa' AND substr(fecha,1,7) = ? AND fecha >= ?").bind(mes, desde).all()).results;
  const o = { desde, tasa, rentas: 0, comRentas: 0, tienda: 0, comTienda: 0, comClasesPOS: 0 };
  const com = x => x.pago === 'POS' ? tasa : (LINK_COMISION[x.pago] || 0); // tarjeta en la máquina: tasa real de Tuu; link de pago: Webpay o Mercado Pago
  rentas.concat(ventas.filter(v => v.area === 'renta')).forEach(x => { o.rentas += x.monto; o.comRentas += x.monto * com(x); });
  ventas.filter(v => v.area === 'tienda').forEach(x => { o.tienda += x.monto; o.comTienda += x.monto * com(x); });
  // Clases con tarjeta anotadas desde PANEL_DESDE: su comisión con la misma tasa (las anteriores ya la sacan del cruce con Tuu).
  const cl = (await db.prepare("SELECT * FROM reservas WHERE substr(fecha,1,7) = ? AND estado = 'pagada' AND substr(creada,1,10) >= ?").bind(mes, desde).all()).results;
  cl.forEach(r => partesPago(r).forEach(x => { if (x.medio === 'POS') o.comClasesPOS += x.monto * tasa; }));
  ['comRentas', 'comTienda', 'comClasesPOS'].forEach(k => o[k] = Math.round(o[k]));
  return o;
}
/** Lo cobrado según el Panel (desde PANEL_DESDE), por día de cobro y forma de pago: clases (día en que se anotaron), diferencias, packs, rentas y tienda. */
async function cobrosPanel(db, desde, hasta) {
  await rnTablas(db); await packTabla(db);
  const dias = {}, en = f => f && f >= desde && f <= hasta && f >= PANEL_DESDE;
  const sum = (f, medio, m) => { if (!en(f) || !m) return; const k = medio === 'POS' ? 'tarjeta' : medio === 'Efectivo' ? 'efectivo' : medio === 'Transferencia' ? 'transferencia' : ''; if (!k) return; const x = dias[f] = dias[f] || { tarjeta: 0, efectivo: 0, transferencia: 0 }; x[k] += m; };
  (await db.prepare("SELECT * FROM reservas WHERE estado = 'pagada' AND substr(creada,1,10) >= ?").bind(PANEL_DESDE).all()).results.forEach(r => {
    const sl = saldosDe(r); sum(String(r.creada || '').slice(0, 10), r.medio, (r.total || 0) - sl.reduce((t, x) => t + (x.monto || 0), 0));
    sl.forEach(x => sum(x.pagado, x.medio, x.monto || 0));
  });
  (await db.prepare("SELECT fecha_pago, total, medio FROM packs WHERE estado = 'activo'").all()).results.forEach(k => sum(k.fecha_pago, k.medio, k.total || 0));
  (await db.prepare("SELECT fecha, monto, pago FROM rentas WHERE estado = 'activa' AND fecha >= ?").bind(desde).all()).results.forEach(x => sum(x.fecha, x.pago, x.monto || 0));
  (await db.prepare("SELECT fecha, monto, pago FROM ventas WHERE estado = 'activa' AND fecha >= ?").bind(desde).all()).results.forEach(x => sum(x.fecha, x.pago, x.monto || 0));
  return dias;
}
/** Lo pasado con tarjeta en la máquina Tuu, por día. */
async function tuuTarjetaDias(db, desde, hasta) {
  await tuuTablas(db); const dias = {};
  (await db.prepare("SELECT fecha, monto, tipo, estado, categoria FROM tuu_ventas WHERE fecha >= ? AND fecha <= ?").bind(desde, hasta).all()).results
    .filter(v => v.categoria !== 'anulada' && !tuuEfectivo(v.tipo) && !/cancel|rechaz|reject|fail|anul|revers|refund|devol/i.test(v.estado)).forEach(v => dias[v.fecha] = (dias[v.fecha] || 0) + v.monto);
  return dias;
}
/** Control simple del mes (desde PANEL_DESDE): tarjeta en la máquina Tuu vs tarjeta anotada en el Panel, día por día, y los cierres de caja. */
async function tuuControl(env, mes) {
  const db = env.DB, hoy = ahoraChile().fecha, desde = mes + '-01', hasta = mes + '-31' < hoy ? mes + '-31' : hoy;
  const [p, t] = await Promise.all([cobrosPanel(db, desde, hasta), tuuTarjetaDias(db, desde, hasta)]);
  const cierres = await cierresDe(db, desde, hasta);
  const dias = [...new Set(Object.keys(p).concat(Object.keys(t)))].filter(f => f >= PANEL_DESDE).sort().reverse()
    .map(f => ({ fecha: f, tuu: t[f] || 0, panel: (p[f] || {}).tarjeta || 0, cierre: cierres[f] || null }));
  return { desde: PANEL_DESDE, dias, malos: dias.filter(x => x.tuu !== x.panel || (x.cierre && x.cierre.diferencia)) };
}
// ---------- Cierre del día (Isidora 23-11): la recepción cuenta la caja y confirma que todo está anotado ----------
async function cierreTabla(db) { await db.prepare("CREATE TABLE IF NOT EXISTS cierres (fecha TEXT PRIMARY KEY, ms INTEGER NOT NULL, por TEXT NOT NULL DEFAULT '', tarjeta INTEGER NOT NULL DEFAULT 0, tuu INTEGER NOT NULL DEFAULT 0, efectivo INTEGER NOT NULL DEFAULT 0, contado INTEGER NOT NULL DEFAULT 0, transferencia INTEGER NOT NULL DEFAULT 0, nota TEXT NOT NULL DEFAULT '')").run(); }
async function cierresDe(db, desde, hasta) {
  await cierreTabla(db); const o = {};
  (await db.prepare('SELECT * FROM cierres WHERE fecha >= ? AND fecha <= ?').bind(desde, hasta).all()).results.forEach(c => o[c.fecha] = { por: c.por, tarjeta: c.tarjeta, tuu: c.tuu, efectivo: c.efectivo, contado: c.contado, nota: c.nota, diferencia: (c.tuu - c.tarjeta) + (c.contado - c.efectivo) });
  return o;
}
async function cierreAccion(env, q, d) {
  if (!['admin', 'recepcion'].includes(q.rol)) throw err('Solo la recepción y los administradores cierran el día.');
  const db = env.DB, t = ahoraChile(), fecha = esFecha(String(d.fecha || '')) ? d.fecha : t.fecha;
  const p = (await cobrosPanel(db, fecha, fecha))[fecha] || { tarjeta: 0, efectivo: 0, transferencia: 0 };
  const tuu = (await tuuTarjetaDias(db, fecha, fecha))[fecha] || 0;
  await cierreTabla(db);
  if (d.op === 'cerrar') {
    const contado = Math.max(0, Math.round(Number(String(d.contado == null ? '' : d.contado).replace(/\D/g, '')) || 0));
    if (d.contado == null || String(d.contado).trim() === '') throw err('Escribe cuánta plata en efectivo hay en la caja (lo de hoy).');
    const yo = await quienNombre(env, q.email), nota = String(d.nota || '').trim().slice(0, 300);
    await db.prepare('INSERT OR REPLACE INTO cierres (fecha, ms, por, tarjeta, tuu, efectivo, contado, transferencia, nota) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(fecha, Date.now(), yo, p.tarjeta, tuu, p.efectivo, contado, p.transferencia, nota).run();
    const dt = tuu - p.tarjeta, de = contado - p.efectivo;
    if (dt || de) { // no calza: queda un aviso importante en Notas para Isidora
      const clp = n => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('es-CL');
      const txt = 'Cierre del ' + fecha.slice(8) + '/' + fecha.slice(5, 7) + ' no calza (' + yo + '):' + (dt ? '\n· Tarjeta: máquina ' + clp(tuu) + ', anotado ' + clp(p.tarjeta) + ' (' + (dt > 0 ? 'falta anotar ' + clp(dt) : 'anotado de más ' + clp(-dt)) + ')' : '') + (de ? '\n· Efectivo: en caja ' + clp(contado) + ', anotado ' + clp(p.efectivo) + ' (' + (de > 0 ? 'sobran ' + clp(de) : 'faltan ' + clp(-de)) + ')' : '') + (nota ? '\n· Nota: ' + nota : '');
      await rnTablas(db);
      await db.prepare("INSERT INTO notas (id, creada_ms, por, tipo, texto, importante) VALUES (?, ?, ?, 'aviso', ?, 1)").bind(nuevoId('N', t), Date.now(), yo, txt).run();
    }
    await anotar(db, q, 'cierre ' + fecha + (dt || de ? ' no calza' : ' ok'));
  }
  const c = (await cierresDe(db, fecha, fecha))[fecha] || null;
  return { ok: true, fecha, tarjeta: p.tarjeta, efectivo: p.efectivo, transferencia: p.transferencia, tuu, cierre: c };
}

/** Anota cómo pagaron una diferencia pendiente (POS, transferencia, efectivo, factura). */
async function cobrarSaldo(env, q, d) {
  const db = env.DB, r = await db.prepare('SELECT * FROM reservas WHERE ref = ?').bind(String(d.ref || '')).first();
  if (!r) throw err('No encontramos la reserva.');
  const sl = saldosDe(r), i = Number(d.i);
  if (!sl[i]) throw err('Esa diferencia ya no está.');
  if (!['POS', 'Transferencia', 'Efectivo', 'Factura'].includes(d.medio)) throw err('Elige cómo pagó.');
  sl[i].medio = d.medio; sl[i].pagado = ahoraChile().fecha;
  await db.prepare('UPDATE reservas SET saldos = ? WHERE ref = ?').bind(JSON.stringify(sl), r.ref).run();
  await anotar(db, q, 'saldo ' + r.ref + ' ' + d.medio);
  return panel(env, q);
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
  const pagos = repartirPago(a, await tarifas(db), r.personas, r.menores, r.ninos || 0, ins, manualDe(viejo));
  st.push(db.prepare('UPDATE reservas SET fecha = ?, hora = ?, instructores = ?, estado = ?, pagos = ?, pago_instructor = ?, recordatorio = CASE WHEN fecha = ? THEN recordatorio ELSE 0 END WHERE ref = ?').bind(fecha, hora, JSON.stringify(ins), estadoNuevo, JSON.stringify(pagos), sumaPagos(pagos), fecha, r.ref));
  try { await db.batch(st); }
  catch (x) { if (/UNIQUE|constraint/i.test(String(x.message))) throw err('Ese instructor ya tiene otra clase a esa hora.'); throw x; }
  await anotar(db, q, 'editar ' + r.ref + ' → ' + fecha + ' ' + hora + ' ' + ins.join(', '));
  if (r.estado === 'pagada' || r.estado === 'revisar') {
    const antes = parseLista(r.instructores), nuevos = ins.filter(i => !antes.includes(i)), salen = antes.filter(i => !ins.includes(i));
    const cuando = diaCorto(fecha) + ' · ' + hora, movida = fecha !== r.fecha || hora !== r.hora;
    tarea(ctx, (async () => {
      if (nuevos.length) await enviarPush(env, await correosDe(db, nuevos), 'Te asignaron una clase 🏄', cuando + '\n' + quienClase(r), r.ref);
      if (salen.length) await enviarPush(env, await correosDe(db, salen), 'Ya no tienes esta clase', diaCorto(r.fecha) + ' · ' + r.hora + '\n' + quienClase(r));
      const siguen = ins.filter(i => antes.includes(i));
      if (movida && siguen.length) await enviarPush(env, await correosDe(db, siguen), 'Clase cambiada de hora', 'Ahora: ' + cuando + '\n' + quienClase(r), r.ref);
    })());
  }
  return panel(env, q);
}
/** Editar los datos de una clase ya anotada: cliente, personas, total, medio, pago instructor y duración (día/hora/instructor van por "editar"). */
async function datos(env, q, d) {
  const db = env.DB, a = await ajustes(db);
  const r = await db.prepare('SELECT * FROM reservas WHERE ref = ?').bind(String(d.ref || '')).first();
  if (!r) throw err('No encontramos la reserva.');
  const nombre = d.nombre != null ? nombrePropio(d.nombre) : r.nombre; if (nombre.length < 2) throw err('Escribe el nombre del cliente.');
  const personas = d.personas != null ? Math.floor(Number(d.personas)) : r.personas; if (!(personas >= 1)) throw err('¿Cuántas personas son?');
  const menores = d.menores != null ? Math.max(0, Math.min(personas, Math.floor(Number(d.menores) || 0))) : Math.min(personas, r.menores || 0);
  const num = v => Math.round(Number(String(v).replace(/\D/g, '')) || 0);
  const total = r.pack ? 0 : d.total != null && d.total !== '' ? num(d.total) : r.total; // clase de un pack: se pagó con el pack
  const medio = r.pack ? 'Pack' : MEDIOS.includes(d.medio) ? d.medio : r.medio;
  const papel = d.fichasPapel != null ? (d.fichasPapel ? 1 : 0) : (r.fichas_papel || 0);
  const dur = d.duracion != null && [60, 90, 120].includes(Number(d.duracion)) ? (Number(d.duracion) === a.duracion ? 0 : Number(d.duracion)) : (Number(r.duracion) || 0);
  const ins = parseLista(r.instructores);
  let viejo = null; try { viejo = JSON.parse(r.pagos || 'null'); } catch (_) {}
  // pago: si lo escribió ahora, ese; si lo había escrito antes, se mantiene; si no, la tabla
  const pagoManual = d.pagoInstructor !== undefined ? (d.pagoInstructor === '' ? null : num(d.pagoInstructor)) : (manualDe(viejo));
  const pagos = repartirPago(a, await tarifas(db), personas, menores, r.ninos || 0, ins, pagoManual);
  // Esperando pago y anotan cómo pagó (POS, transferencia, efectivo, factura): queda pagada al tiro y con el horario fijo.
  // Clase ya pagada y sube el total (sumaron personas): la diferencia queda por cobrar aparte, sin tocar el pago original.
  // Se recalcula cada vez: lo ya pagado (pago original + diferencias cobradas) se compara con el total nuevo.
  // Si falta, queda UNA diferencia por cobrar; si sobra, queda "a favor del cliente" (nunca un cobro).
  let saldos = saldosDe(r);
  if (r.estado === 'pagada' && r.medio !== 'Por pagar' && (total !== r.total || saldos.length)) {
    const base = (r.total || 0) - saldos.reduce((t, x) => t + (x.monto || 0), 0);
    const cobradas = saldos.filter(x => x.medio && x.medio !== 'favor'), pagado = base + cobradas.reduce((t, x) => t + (x.monto || 0), 0);
    const antes = saldos.find(x => !x.medio);
    saldos = cobradas.slice();
    if (total > pagado) saldos.push({ monto: total - pagado, medio: '', fecha: antes ? antes.fecha : ahoraChile().fecha });
    else if (total < pagado) saldos.push({ monto: total - pagado, medio: 'favor', fecha: ahoraChile().fecha });
  }
  const pagaAhora = r.estado === 'pendiente' && MEDIOS.includes(d.medio) && !['Mercado Pago', 'Por pagar'].includes(d.medio) && (d.medio !== r.medio || !!d.pagada);
  const st = [];
  if (pagaAhora) st.push(db.prepare("UPDATE reservas SET estado = 'pagada', link_pago = '' WHERE ref = ?").bind(r.ref), db.prepare('UPDATE bloques SET hasta = 0 WHERE ref = ?').bind(r.ref));
  if (dur !== (Number(r.duracion) || 0)) {
    const fijo = pagaAhora || r.estado === 'pagada' || r.estado === 'revisar' || aMano(r) ? 0 : Date.now() + a.retencionMin * 60000;
    st.push(db.prepare('DELETE FROM bloques WHERE ref = ?').bind(r.ref));
    ins.forEach(i => bloquesDe(r.hora, dur || a.duracion).forEach(b => st.push(db.prepare('INSERT INTO bloques (instructor, fecha, hora, ref, hasta) VALUES (?, ?, ?, ?, ?)').bind(i, r.fecha, b, r.ref, fijo))));
  }
  st.push(db.prepare('UPDATE reservas SET nombre = ?, telefono = ?, correo = ?, comentario = ?, personas = ?, menores = ?, total = ?, medio = ?, duracion = ?, pagos = ?, pago_instructor = ?, fichas_papel = ?, saldos = ? WHERE ref = ?')
    .bind(nombre, d.telefono != null ? String(d.telefono).trim() : r.telefono, d.correo != null ? norm(d.correo) : r.correo, d.comentario != null ? String(d.comentario).trim().slice(0, 500) : r.comentario,
      personas, menores, total, medio, dur, JSON.stringify(pagos), sumaPagos(pagos), papel, JSON.stringify(saldos), r.ref));
  try { await db.batch(st); }
  catch (x) { if (/UNIQUE|constraint/i.test(String(x.message))) throw err('Con esa duración choca con otra clase del instructor.'); throw x; }
  await anotar(db, q, 'datos ' + r.ref);
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
  return d.ligero ? { ok: true } : panel(env, q);
}
/** Un día puntual de un golpe: horas = las que puede (Todo / Mañana / Tarde / No puedo); volver = vuelve a su semana tipo */
async function diaHoras(env, q, d) {
  const db = env.DB, inst = q.rol === 'admin' ? String(d.instructor || '') : q.yo, fecha = String(d.fecha || '');
  if (!inst || !esFecha(fecha)) throw err('Faltan datos.');
  const st = [db.prepare('DELETE FROM excepciones WHERE instructor = ? AND fecha = ?').bind(inst, fecha)];
  if (!d.volver) {
    st.push(db.prepare("INSERT INTO excepciones (instructor, fecha, hora, libre) VALUES (?, ?, '', 0)").bind(inst, fecha));
    [...new Set((d.horas || []).map(normHora).filter(Boolean))].forEach(h => st.push(db.prepare('INSERT INTO excepciones (instructor, fecha, hora, libre) VALUES (?, ?, ?, 1)').bind(inst, fecha, h)));
  }
  await db.batch(st);
  return d.ligero ? { ok: true } : panel(env, q);
}
async function semanaTipo(env, q, d) {
  const inst = q.rol === 'admin' ? String(d.instructor || '') : q.yo, dia = Math.floor(Number(d.dia));
  if (!inst || !(dia >= 0 && dia <= 6)) throw err('Faltan datos.');
  const horas = [...new Set((d.horas || []).map(normHora).filter(Boolean))].sort();
  await env.DB.prepare('INSERT OR REPLACE INTO semana (instructor, dia, horas) VALUES (?, ?, ?)').bind(inst, dia, JSON.stringify(horas)).run();
  return d.ligero ? { ok: true } : panel(env, q);
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
  // Pack (Isidora 16-11): 'nuevo' = vende un pack ahora y esta es su 1ª clase; o el id de un pack que ya tiene. La clase va en $0 con medio 'Pack'.
  let pack = null;
  if (d.pack === 'nuevo' && personas >= 4) throw err('El pack de clases es para 1 a 3 personas.');
  if (d.pack === 'nuevo') { pack = { nuevo: true }; const v = sumarMeses(ahoraChile().fecha, await packMeses(db)); if (fecha > v) throw err('El pack se usa dentro de 1 mes: la clase tiene que ser hasta el ' + fechaLarga(v) + '.'); }
  else if (d.pack) { await packTabla(db); pack = (await packsLista(db)).find(k => k.id === String(d.pack)); if (!pack) throw err('No encontramos ese pack.'); if (pack.quedan <= 0) throw err('Ese pack ya no tiene clases.'); if (fecha > pack.vence) throw err('Ese pack vence el ' + fechaLarga(pack.vence) + ': la clase tiene que ser hasta ese día.'); }
  const conLink = !pack && d.medio === 'Link de pago';
  const medio = conLink ? 'Mercado Pago' : MEDIOS.includes(d.medio) ? d.medio : 'Por pagar';
  if (pack && pack.nuevo && !(total > 0)) throw err('Escribe el precio del pack.');
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
  if (pack) {
    if (pack.nuevo) pack = await crearPack(db, a, q, { nombre, telefono: r.telefono, correo: r.correo, personas, total, medio });
    r.pack = pack.id; r.total = 0; r.medio = 'Pack';
  }
  // Anotada a mano (con o sin link): el horario queda tomado aunque no hayan pagado; si no vienen, se cancela a mano.
  const desfase = minLocal(t.fecha, t.hora) - Math.floor(Date.now() / 60000);
  const inicioMs = (minLocal(fecha, hora) - desfase) * 60000;
  if (conLink && inicioMs <= Date.now()) throw err('Esa clase ya empezó.');
  const hasta = 0;
  try { await guardarReserva(db, a, r, hasta); }
  catch (x) { if (/UNIQUE|constraint/i.test(String(x.message))) throw err('Ese instructor ya tiene otra clase a esa hora.'); throw x; }
  await anotar(db, q, 'manual ' + r.ref + (conLink ? ' con link' : ''));
  if (conLink) {
    const o = await crearOrden(env, r);
    if (!o) { await db.batch([db.prepare('DELETE FROM bloques WHERE ref = ?').bind(r.ref), db.prepare("UPDATE reservas SET estado = 'cancelada', nota = 'Mercado Pago no respondió' WHERE ref = ?").bind(r.ref)]); throw err('Mercado Pago no respondió. Intenta de nuevo.'); }
    const out = await panel(env, q);
    out.nuevoLink = { ref: r.ref, url: linkStorm(o.url), nombre: r.nombre, telefono: r.telefono, fecha, hora, personas, total };
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
  if (d.linkResena != null) { const l = String(d.linkResena).trim(); if (l && !/^https:\/\/\S+$/.test(l)) throw err('El link de Google debe empezar con https://'); st.push(['linkResena', l]); }
  if (d.pack) { const c = Math.max(2, Math.min(20, n(d.pack.clases) || 5)), ds = Math.max(0, Math.min(50, n(d.pack.descuento))); const ms = Math.max(1, Math.min(12, n(d.pack.meses) || 1)); st.push(['pack', { clases: c, descuento: ds, meses: ms }]); }
  if (d.recepcion) st.push(['recepcion', d.recepcion.map(norm).filter(x => /@/.test(x))]);
  if (st.length) await db.batch(st.map(([k, v]) => db.prepare('INSERT OR REPLACE INTO ajustes (clave, valor) VALUES (?, ?)').bind(k, JSON.stringify(v))));
  await anotar(db, q, 'ajustes ' + st.map(x => x[0]).join(','));
  return panel(env, q);
}

/** Vacaciones (o días que no va a estar): el instructor las anota él mismo (o Isidora por él).
 *  Se guardan como ocupaciones 'vacaciones' de todo el día, una por fecha, así la página para reservar ya no se las asigna. */
async function vacaciones(env, q, d, ctx) {
  const db = env.DB, inst = q.rol === 'admin' ? String(d.instructor || '') : q.yo;
  const de = String(d.desde || ''), ha = String(d.hasta || d.desde || ''), hoy = ahoraChile().fecha;
  if (!inst) throw err('Falta el instructor.');
  if (!esFecha(de) || !esFecha(ha)) throw err('Elige desde y hasta qué día.');
  if (ha < de) throw err('El día "hasta" tiene que ser después del "desde".');
  if (d.borrar) {
    await db.prepare("DELETE FROM ocupaciones WHERE origen = 'vacaciones' AND instructor = ? AND fecha BETWEEN ? AND ?").bind(inst, de, ha).run();
    await anotar(db, q, 'vacaciones quitadas ' + inst + ' ' + de + ' a ' + ha);
    return panel(env, q);
  }
  if (de < hoy) throw err('Elige desde hoy en adelante.');
  const dias = []; for (let f = de; f <= ha && dias.length < 120; f = sumarDias(f, 1)) dias.push(f);
  if (dias[dias.length - 1] !== ha) throw err('Anota máximo 120 días seguidos.');
  // si ya tiene clases esos días, primero hay que cambiarlas a otro instructor
  const { results } = await db.prepare("SELECT DISTINCT b.fecha, r.hora, r.nombre FROM bloques b JOIN reservas r ON r.ref = b.ref WHERE b.instructor = ? AND b.fecha BETWEEN ? AND ? AND (b.hasta = 0 OR b.hasta > ?) AND r.estado IN ('pagada', 'pendiente', 'revisar') ORDER BY b.fecha, r.hora").bind(inst, de, ha, Date.now()).all();
  if (results.length) throw err((q.rol === 'admin' ? inst + ' tiene' : 'Tienes') + ' clase esos días (' + results.slice(0, 3).map(r => r.fecha.slice(8) + '/' + r.fecha.slice(5, 7) + ' ' + r.hora + ' ' + String(r.nombre || '').split(' ')[0]).join(', ') + (results.length > 3 ? '…' : '') + '). ' + (q.rol === 'admin' ? 'Primero cámbiala a otro instructor.' : 'Avísale a Isidora para que la cambie a otro instructor.'));
  const st = [db.prepare("DELETE FROM ocupaciones WHERE origen = 'vacaciones' AND instructor = ? AND fecha BETWEEN ? AND ?").bind(inst, de, ha)];
  dias.forEach(f => st.push(db.prepare("INSERT INTO ocupaciones (origen, instructor, fecha, desde, hasta, motivo) VALUES ('vacaciones', ?, ?, '00:00', '23:59', 'Vacaciones')").bind(inst, f)));
  await db.batch(st);
  await anotar(db, q, 'vacaciones ' + inst + ' ' + de + ' a ' + ha);
  // aviso a los administradores cuando las anota el instructor
  if (q.rol !== 'admin' && env.ONESIGNAL_KEY) {
    const a = await ajustes(db), txt = inst + ' anotó vacaciones ' + (de === ha ? 'el ' + fechaLarga(de) : 'del ' + fechaLarga(de) + ' al ' + fechaLarga(ha)) + '.';
    const p = enviarPush(env, a.admins || [], 'Vacaciones de ' + inst, txt).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  }
  return panel(env, q);
}
/** Vacaciones guardadas de hoy en adelante, juntadas en rangos de días seguidos. */
async function vacacionesLista(db, hoy) {
  const { results } = await db.prepare("SELECT instructor, fecha FROM ocupaciones WHERE origen = 'vacaciones' AND fecha >= ? ORDER BY instructor, fecha").bind(hoy).all();
  const out = [];
  results.forEach(r => { const u = out[out.length - 1];
    if (u && u.instructor === r.instructor && sumarDias(u.hasta, 1) === r.fecha) u.hasta = r.fecha;
    else out.push({ instructor: r.instructor, desde: r.fecha, hasta: r.fecha }); });
  return out;
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
  // El número de participante lo elige la página al abrirse. Si se abre en dos celulares o pestañas, ambas eligen el mismo número
  // y la segunda borraba la ficha de la primera. Ahora solo se reemplaza si es la misma persona (corrige su ficha);
  // si ese número ya es de otra persona, la ficha se guarda en el primer número libre (o uno nuevo).
  let slot = n;
  const yaEstan = await fichasDe(env.DB, r.ref), mismo = s => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ocupada = yaEstan.find(x => x.n === slot);
  if (ocupada && mismo(ocupada.nombre) !== mismo(datos.nombre)) {
    const igual = yaEstan.find(x => mismo(x.nombre) === mismo(datos.nombre));
    if (igual) slot = igual.n;
    else { const usados = new Set(yaEstan.map(x => x.n)); slot = 1; while (usados.has(slot)) slot++; }
  }
  const tt = ahoraChile();
  await env.DB.prepare('INSERT OR REPLACE INTO fichas (ref, n, nombre, datos, firma, creada, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(r.ref, slot, datos.nombre, JSON.stringify(datos), firma, tt.fecha + ' ' + tt.hora, (request && request.headers.get('CF-Connecting-IP')) || '').run();
  return fichaVer(env, d);
}
async function fichasLeer(env, q, d) {
  const r = await env.DB.prepare('SELECT * FROM reservas WHERE ref = ?').bind(String(d.ref || '')).first();
  if (!r) throw err('No encontramos la reserva.');
  if (q.rol !== 'admin' && q.rol !== 'recepcion' && !parseLista(r.instructores).includes(q.yo)) throw err('Esta clase no es tuya.');
  const fs = await fichasDe(env.DB, r.ref);
  return { ok: true, ref: r.ref, personas: r.personas, cliente: r.nombre, actividad: await actividad(env, r), link: linkFicha(r),
    fichas: fs.map(f => Object.assign(JSON.parse(f.datos), { n: f.n, firma: f.firma, creada: f.creada })) };
}

// ---------- Tuu (máquina de pago de la recepción) ----------
// Lee las ventas de la máquina Tuu con su API de reportes (clave TUU_KEY en Cloudflare) y las guarda en D1 (tabla tuu_ventas).
// Cada venta se separa sola por el nombre del producto: Renta/Arriendo → rentas; Clase/Grupal → clases; lo demás → productos.
// Venta sin producto (solo el monto): si calza con una clase de la Agenda pagada con POS ese día y por ese monto, es esa clase
// (ya está contada en la Agenda, no se suma de nuevo; solo se descuenta su comisión). Si no calza, queda "Por revisar" en Finanzas.
const TUU_API = 'https://integrations.payment.haulmer.com/Report/get-report';
const TUU_CADA_MIN = 15;
const TUU_DESDE = '2026-11-16'; // Isidora (15-11): Finanzas cuenta Tuu y Panel Storm desde el lunes 16 de noviembre; lo anterior está en la planilla 2026.
const TUU_CATS = ['producto', 'renta', 'clase', 'academia', 'anulada']; // Isidora (21-11): 'anulada' = venta anulada en la máquina (Tuu la sigue mostrando como pagada): no cuenta en nada
const TUU_DIAS_ANTES = 14; // una venta Tuu calza con una clase POS hasta 14 días después del pago
async function tuuTablas(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS tuu_ventas (id TEXT PRIMARY KEY, fecha TEXT NOT NULL, hora TEXT NOT NULL, monto INTEGER NOT NULL, comision INTEGER NOT NULL DEFAULT 0, tipo TEXT NOT NULL DEFAULT '', items TEXT NOT NULL DEFAULT '[]', estado TEXT NOT NULL DEFAULT '', categoria TEXT NOT NULL DEFAULT '', quien TEXT NOT NULL DEFAULT '')"),
    db.prepare('CREATE INDEX IF NOT EXISTS tuu_fecha ON tuu_ventas(fecha)'),
    db.prepare("CREATE TABLE IF NOT EXISTS tuu_sync (mes TEXT PRIMARY KEY, ms INTEGER NOT NULL, error TEXT NOT NULL DEFAULT '')")
  ]);
}
// Isidora (23-11): en verano habrá miles de ventas → catálogo Tuu cerrado; el nombre del producto dice a qué área va.
// 'academia' = pago en persona de Verano, Anual o Adultos: ya está anotado en su planilla, así que no suma de nuevo (solo su comisión).
const tuuCatItem = n => /\b(verano|anual|adultos|academia|mensualidad|inscripci[oó]n)\b/i.test(n) ? 'academia' : /\b(renta|rentas|arriendo|arriendos|arrienda|alquiler|da[ñn]o|da[ñn]os|reposici[oó]n|rotura)\b/i.test(n) ? 'renta' : /\b(clase|clases|grupal|curso|lecci[oó]n)\b/i.test(n) ? 'clase' : 'producto';
// Venta por monto libre: Tuu manda un producto genérico "Nombre ítem 1" (con un carácter invisible). Se trata como sin nombre.
const tuuNombre = n => { const t = String(n || '').replace(/[\u0000-\u001f\u007f]/g, '').trim(); return /^(nombre\s+)?[ií]tem\s*\d*$/i.test(t) ? '' : t; };
// Id de la venta: algunas llegan con saleId "N/A"; ahí se arma uno con la máquina, la hora y el monto.
const tuuId = v => { const ok = x => x != null && String(x).trim() && !/^n\/?a$/i.test(String(x).trim()); return ok(v.saleId) ? String(v.saleId) : ok(v.sequenceNumber) ? 'seq-' + v.sequenceNumber : 'x-' + (v.posSerialNumber || '') + '-' + (v.paymentDataTime || '') + '-' + (v.amount || 0); };
const tuuEfectivo = t => /cash|efectivo/i.test(String(t || ''));
async function tuuPedir(env, desde, hasta) {
  const out = [];
  for (let page = 1; page <= 100; page++) {
    const r = await fetch(env.TUU_API || TUU_API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': env.TUU_KEY },
      body: JSON.stringify({ Filters: { StartDate: desde, EndDate: hasta }, page, pageSize: 20 }) });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt.replace(/,\s*([\]}])/g, '$1')); } catch (_) {}
    if (r.status === 404 || (j && String(j.code) === '404')) break; // sin ventas en esas fechas
    if (!r.ok || !j || !j.content) throw new Error('Tuu ' + r.status + ': ' + String((j && j.message) || txt).slice(0, 160));
    const c = j.content, lista = Array.isArray(c.reports) ? c.reports : [];
    out.push(...lista);
    if (!lista.length || page >= (Number(c.totalPages) || 1)) break;
  }
  return out;
}
/** Trae de Tuu las ventas del mes (AAAA-MM) si la copia tiene más de 15 minutos. */
async function tuuSincronizar(env, mes, forzar) {
  if (!env.TUU_KEY) return { ok: false, error: 'Falta la clave de Tuu' };
  const db = env.DB; await tuuTablas(db);
  const hoy = ahoraChile().fecha;
  if (mes > hoy.slice(0, 7) || mes < TUU_DESDE.slice(0, 7)) return { ok: true };
  const antes = await db.prepare('SELECT ms FROM tuu_sync WHERE mes = ?').bind(mes).first();
  // Meses ya cerrados (más de 3 días después) no se vuelven a pedir si ya se trajeron una vez después de cerrar.
  const fin = mes + '-' + String(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate()).padStart(2, '0');
  const cerrado = sumarDias(fin, 3) < hoy;
  if (antes && !forzar && (cerrado ? antes.ms > Date.parse(sumarDias(fin, 3) + 'T12:00:00Z') : Date.now() - antes.ms < TUU_CADA_MIN * 60000)) return { ok: true, ms: antes.ms };
  const hasta = fin < hoy ? fin : hoy;
  try {
    const tramos = [[mes + '-01', hasta < mes + '-15' ? hasta : mes + '-15']];
    if (hasta >= mes + '-16') tramos.push([mes + '-16', hasta]);
    const ventas = [];
    for (const [a, b] of tramos) ventas.push(...await tuuPedir(env, a, b));
    const st = ventas.filter(v => v && v.paymentDataTime).map(v => {
      const t = String(v.paymentDataTime || ''), x = v.extraData || {};
      const items = (Array.isArray(x.items) ? x.items : []).map(i => ({ nombre: tuuNombre(i.name), cantidad: Number(i.quantity) || 1, precio: Math.round(Number(i.price) || 0) }));
      const com = tuuEfectivo(v.typeTransaction) ? 0 : Math.round(Number(x.amountCommission) || 0);
      return db.prepare('INSERT INTO tuu_ventas (id, fecha, hora, monto, comision, tipo, items, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET fecha = excluded.fecha, hora = excluded.hora, monto = excluded.monto, comision = excluded.comision, tipo = excluded.tipo, items = excluded.items, estado = excluded.estado')
        .bind(tuuId(v), t.slice(0, 10), t.slice(11, 16), Math.round(Number(v.amount) || 0), com, String(v.typeTransaction || ''), JSON.stringify(items), String(v.status || ''));
    });
    for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
    await db.prepare("INSERT OR REPLACE INTO tuu_sync (mes, ms, error) VALUES (?, ?, '')").bind(mes, Date.now()).run();
    return { ok: true, ms: Date.now(), ventas: ventas.length };
  } catch (x) {
    console.error(x);
    await db.prepare('INSERT OR REPLACE INTO tuu_sync (mes, ms, error) VALUES (?, ?, ?)').bind(mes, antes ? antes.ms : 0, String(x.message).slice(0, 300)).run();
    return { ok: false, error: x.message };
  }
}
/** Suma del mes por categoría, con la lista de ventas por revisar. */
async function tuuResumen(env, mes, forzar, soloCalces) {
  if (!env.TUU_KEY) return { ok: false, error: 'Falta la clave de Tuu' };
  const sync = soloCalces ? { ok: true } : await tuuSincronizar(env, mes, forzar);
  const db = env.DB;
  const [{ results: ventas }, { results: agenda }, est] = await Promise.all([
    db.prepare("SELECT * FROM tuu_ventas WHERE substr(fecha,1,7) = ? AND fecha >= ? AND fecha < ? ORDER BY fecha, hora").bind(mes, TUU_DESDE, PANEL_DESDE).all(),
    db.prepare("SELECT ref, fecha, hora, total, nombre, medio, saldos, creada FROM reservas WHERE fecha >= ? AND fecha <= ? AND estado = 'pagada'").bind(mes + '-01', sumarDias(mes + '-' + String(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate()).padStart(2, '0'), TUU_DIAS_ANTES)).all().then(x => ({ results: x.results.flatMap(r => partesPago(r).filter(p => ['POS', 'Efectivo'].includes(p.medio)).map(p => ({ ref: r.ref + p.k, fecha: r.fecha, hora: r.hora, nombre: r.nombre + (p.k ? ' (diferencia)' : ''), total: p.monto, medio: p.medio, creada: p.k ? '' : String(r.creada || '') }))) }))
      .then(async x => { const k = (await packsDelMes(db, mes)).filter(p => p.medio === 'POS' || p.medio === 'Efectivo'); x.results = x.results.concat(k.map(p => ({ ref: p.id, fecha: p.fecha_pago, hora: '', total: p.total, nombre: 'Pack ' + p.nombre, medio: p.medio }))); return x; }),
    db.prepare('SELECT ms, error FROM tuu_sync WHERE mes = ?').bind(mes).first()
  ]);
  const r = { ok: true, mes, desde: TUU_DESDE, ventas: 0, total: 0, productos: 0, rentas: 0, clases: 0, sinNombre: 0, agenda: 0, academia: 0,
    comProductos: 0, comRentas: 0, comClases: 0, comSinNombre: 0, comAgenda: 0, comAcademia: 0, efectivo: 0, tarjeta: 0, porRevisar: [], detalle: [],
    actualizado: est ? est.ms : 0, error: sync.ok ? '' : (est && est.error) || sync.error || '' };
  // Tarjeta en Tuu calza con clase anotada POS; efectivo en Tuu calza con clase anotada Efectivo (o POS).
  // Isidora (20-11): el pago en Tuu siempre es antes de la clase o el mismo día. Calza con una clase del mismo monto
  // ese día o hasta TUU_DIAS_ANTES días después. Primero se juntan las del mismo día; después las demás, por la clase más cercana. Cada clase se usa una vez.
  const usadas = new Set(), calces = new Map();
  const vivas = ventas.filter(v => v.categoria !== 'anulada' && !/cancel|rechaz|reject|fail|anul|revers|refund|devol/i.test(v.estado));
  const buscaClase = v => {
    let items = []; try { items = JSON.parse(v.items || '[]'); } catch (_) {}
    const conNombre = items.filter(i => i.nombre && i.precio);
    return !conNombre.length || conNombre.every(i => tuuCatItem(i.nombre) === 'clase');
  };
  const sirve = (v, x) => { const ef = tuuEfectivo(v.tipo); return !usadas.has(x.ref) && x.total === v.monto && (x.medio === 'POS' || (ef && x.medio === 'Efectivo')); };
  const tope = v => sumarDias(v.fecha, TUU_DIAS_ANTES);
  const minutos = t => { const m = String(t || '').match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/); return m ? diaUTC(m[1]) / 60000 + +m[2] * 60 + +m[3] : NaN; };
  // Isidora (22-11): "que todo se cuadre solo". Orden del cruce (cada clase y cada venta se usan una vez):
  //  1) Venta Tuu hecha justo al anotar la clase en el Panel (desde 5 min antes hasta 3 h después), mismo monto: es esa clase.
  //  2) Misma fecha y mismo monto.
  //  3) Clase grupal: varias ventas sin producto del mismo día que suman justo el total de una clase (ej. 9 personas: 6 con tarjeta + 3 en efectivo).
  //  4) Mismo monto, clase hasta 14 días después (la más cercana).
  //  5) Clase grupal con pagos de varios días antes de la clase.
  const libre = v => !calces.has(v.id);
  vivas.filter(buscaClase).forEach(v => {
    const t = minutos(v.fecha + ' ' + v.hora);
    const a = agenda.filter(x => x.creada && sirve(v, x) && x.fecha >= v.fecha && x.fecha <= tope(v) && t - minutos(x.creada) >= -5 && t - minutos(x.creada) <= 180)
      .sort((p, q) => Math.abs(t - minutos(p.creada)) - Math.abs(t - minutos(q.creada)))[0];
    if (a) { usadas.add(a.ref); calces.set(v.id, a); }
  });
  vivas.filter(v => buscaClase(v) && libre(v)).forEach(v => { const a = agenda.find(x => x.fecha === v.fecha && sirve(v, x)); if (a) { usadas.add(a.ref); calces.set(v.id, a); } });
  const libres = vivas.filter(v => buscaClase(v) && !['producto', 'renta'].includes(v.categoria)); // no se toman las que marcaste Producto o Renta
  const grupo = (cands, meta) => { // busca ventas que sumen justo 'meta' (2 o más); corta si es demasiado largo
    let pasos = 0; const sel = [];
    const ir = (i, falta) => { if (falta === 0) return sel.length >= 2; if (falta < 0 || i >= cands.length || ++pasos > 20000) return false;
      sel.push(cands[i]); if (ir(i + 1, falta - cands[i].monto)) return true; sel.pop(); return ir(i + 1, falta); };
    return ir(0, meta) ? sel.slice() : null;
  };
  const grupos = mismoDia => agenda.filter(x => !usadas.has(x.ref)).sort((p, q) => (p.fecha + p.hora).localeCompare(q.fecha + q.hora)).forEach(a => {
    const okV = v => libre(v) && v.monto < a.total && (a.medio === 'POS' || tuuEfectivo(v.tipo));
    let g = null;
    if (mismoDia) { const cands = libres.filter(v => okV(v) && v.fecha === a.fecha).slice(0, 30); g = cands.length >= 2 && grupo(cands, a.total); }
    else {
      const dias = [...new Set(libres.filter(v => okV(v) && v.fecha < a.fecha && tope(v) >= a.fecha).map(v => v.fecha))].sort((p, q) => q.localeCompare(p));
      for (const dia of dias) { const cands = libres.filter(v => okV(v) && v.fecha === dia).slice(0, 30); g = cands.length >= 2 && grupo(cands, a.total); if (g) break; }
      if (!g) { const cands = libres.filter(v => okV(v) && v.fecha <= a.fecha && tope(v) >= a.fecha).sort((p, q) => (q.fecha + q.hora).localeCompare(p.fecha + p.hora)).slice(0, 25); g = cands.length >= 2 && grupo(cands, a.total); }
    }
    if (g) { usadas.add(a.ref); g.forEach(v => calces.set(v.id, Object.assign({}, a, { grupo: g.length }))); }
  });
  grupos(true);
  vivas.filter(v => buscaClase(v) && libre(v)).forEach(v => {
    const a = agenda.filter(x => x.fecha > v.fecha && x.fecha <= tope(v) && sirve(v, x)).sort((p, q) => (p.fecha + p.hora).localeCompare(q.fecha + q.hora))[0];
    if (a) { usadas.add(a.ref); calces.set(v.id, a); }
  });
  grupos(false);
  if (soloCalces) return usadas;
  // Isidora (22-11): "que todo se cuadre solo". Una venta sin producto que no es clase se ordena sola si su monto es el precio
  // de algo que ya se vendió con nombre en Tuu (ej. "Renta Softboard" $15.000) o de una venta que ya marcaste antes,
  // siempre que ese monto sea de una sola cosa (solo renta o solo producto). Si el monto calza con las dos, o con ninguna, queda por revisar.
  const precios = new Map(); // monto → Set(categoría)
  const anota = (m, cat) => { if (m > 0 && (cat === 'renta' || cat === 'producto')) (precios.get(m) || precios.set(m, new Set()).get(m)).add(cat); };
  (await db.prepare("SELECT monto, items, categoria FROM tuu_ventas WHERE fecha >= ?").bind(sumarDias(mes + '-01', -120)).all()).results.forEach(v => {
    if (v.categoria) return anota(v.monto, v.categoria);
    let it = []; try { it = JSON.parse(v.items || '[]'); } catch (_) {}
    it.filter(i => i.nombre && i.precio).forEach(i => anota(i.precio, tuuCatItem(i.nombre)));
  });
  const porPrecio = m => { const c = precios.get(m); return c && c.size === 1 ? [...c][0] : ''; };
  const calzaAgenda = v => calces.get(v.id);
  const nomClase = (v, a) => (a.fecha === v.fecha ? '' : a.fecha.slice(8, 10) + '-' + a.fecha.slice(5, 7) + ' ') + a.hora + ' · ' + a.nombre + (a.grupo ? ' (' + a.grupo + ' pagos)' : '');
  const suma = (cat, monto, com) => {
    const k = { producto: 'productos', renta: 'rentas', clase: 'clases', revisar: 'sinNombre', agenda: 'agenda', academia: 'academia' }[cat];
    const c = { producto: 'comProductos', renta: 'comRentas', clase: 'comClases', revisar: 'comSinNombre', agenda: 'comAgenda', academia: 'comAcademia' }[cat];
    r[k] += monto; r[c] += com;
  };
  vivas.forEach(v => {
    r.ventas++; r.total += v.monto; if (tuuEfectivo(v.tipo)) r.efectivo += v.monto; else r.tarjeta += v.monto;
    let items = []; try { items = JSON.parse(v.items || '[]'); } catch (_) {}
    const base = { id: v.id, fecha: v.fecha, hora: v.hora, monto: v.monto, comision: v.comision, pago: tuuEfectivo(v.tipo) ? 'Efectivo' : 'Tarjeta', productos: items.map(i => (i.cantidad > 1 ? i.cantidad + ' × ' : '') + i.nombre).join(', ') };
    // Isidora (14-11): las clases siempre quedan anotadas en otro lado (Agenda, planilla). Las que pasan por Tuu no suman de nuevo: solo su comisión.
    // Isidora (15-11): la clase a veces se anota en el Panel después de cobrar en Tuu. El cruce se rehace cada vez que se lee,
    // así que una venta sin producto pasa sola a "clase ya anotada" cuando aparece la clase POS de ese día y monto (aunque antes se haya marcado renta o producto).
    if (!items.some(i => i.nombre && i.precio)) { const a0 = calzaAgenda(v); if (a0) { suma('agenda', v.monto, v.comision); r.detalle.push(Object.assign(base, { categoria: 'agenda', clase: nomClase(v, a0) })); return; } }
    if (v.categoria === 'clase') { suma('agenda', v.monto, v.comision); r.detalle.push(Object.assign(base, { categoria: 'agenda', aMano: true })); return; }
    if (TUU_CATS.includes(v.categoria)) { suma(v.categoria, v.monto, v.comision); r.detalle.push(Object.assign(base, { categoria: v.categoria, aMano: true })); return; }
    const conNombre = items.filter(i => i.nombre && i.precio);
    const cats = [...new Set(conNombre.map(i => tuuCatItem(i.nombre)))];
    // Sin producto, o solo "clase": ¿es una clase de la Agenda pagada con POS?
    if (!conNombre.length || (cats.length === 1 && cats[0] === 'clase')) {
      const a = calzaAgenda(v);
      if (a) { suma('agenda', v.monto, v.comision); r.detalle.push(Object.assign(base, { categoria: 'agenda', clase: nomClase(v, a) })); return; }
    }
    // Isidora (15-11): una venta sin producto es clase SOLO si calza con una clase POS del Panel (arriba). Si no calza, es renta o producto: queda "Por revisar".
    if (!conNombre.length && porPrecio(v.monto)) { const cat = porPrecio(v.monto); suma(cat, v.monto, v.comision); r.detalle.push(Object.assign(base, { categoria: cat, solo: true })); r.ordenadasSolas = (r.ordenadasSolas || 0) + 1; return; }
    if (!conNombre.length) { suma('revisar', v.monto, v.comision); r.porRevisar.push(base); r.detalle.push(Object.assign(base, { categoria: 'revisar' })); return; }
    // Con nombre de clase ("Clase 2 Personas"): es una clase ya anotada. No se suma de nuevo; solo su comisión.
    // Isidora (23-11): si no calza con ninguna clase POS del Panel, no suma en ninguna parte: sale en el cuadre como "falta anotar la clase".
    if (cats.length === 1 && cats[0] === 'clase') { suma('agenda', v.monto, v.comision); r.detalle.push(Object.assign(base, { categoria: 'agenda', catalogo: true })); return; }
    // Una venta puede traer productos y rentas juntos: se reparte según el precio de cada uno.
    const bruto = conNombre.reduce((t, i) => t + i.precio * i.cantidad, 0) || 1;
    let restoM = v.monto, restoC = v.comision;
    cats.forEach((cat, n) => {
      const parte = conNombre.filter(i => tuuCatItem(i.nombre) === cat).reduce((t, i) => t + i.precio * i.cantidad, 0) / bruto;
      const m = n === cats.length - 1 ? restoM : Math.round(v.monto * parte), c = n === cats.length - 1 ? restoC : Math.round(v.comision * parte);
      restoM -= m; restoC -= c; suma(cat, m, c);
    });
    r.detalle.push(Object.assign(base, { categoria: cats.length === 1 ? cats[0] : 'mixta' }));
  });
  r.comision = r.comProductos + r.comRentas + r.comClases + r.comSinNombre + r.comAgenda + r.comAcademia;
  // Isidora (22-11): "¿cómo sé que nada está duplicado?". Cuadre entre las clases POS del Panel y las ventas Tuu.
  // Una clase POS del Panel suma en Escuela; su venta en Tuu NO suma (solo la comisión). Lo que puede fallar:
  //  - Por revisar: suman como "Sin nombre"; si eran clases ya anotadas, están contadas dos veces hasta que las marques.
  //  - Marcadas "Clase" sin clase POS en el Panel: no suman en ninguna parte (falta anotar la clase).
  //  - Clase POS del Panel sin venta en Tuu: suma, pero no se ve el pago en la máquina (¿se cobró?).
  const hoy = ahoraChile().fecha;
  // Clases de los primeros días del mes que se pagaron en Tuu el mes anterior: ya calzaron allá.
  const mesAntes = sumarDias(mes + '-01', -1).slice(0, 7);
  let antes = new Set(); if (mesAntes >= TUU_DESDE.slice(0, 7)) try { antes = await tuuResumen(env, mesAntes, false, true); } catch (_) {}
  // Clases antes del 16-11, o anotadas antes del 16-11 (se cobraron antes de que la app leyera Tuu): no se revisan.
  const posMes = agenda.filter(x => x.medio === 'POS' && x.fecha.slice(0, 7) === mes && x.fecha >= TUU_DESDE && x.fecha <= hoy && x.fecha < PANEL_DESDE && !(x.creada && x.creada.slice(0, 10) >= PANEL_DESDE) && !antes.has(x.ref) && !(x.creada && x.creada.slice(0, 10) < TUU_DESDE));
  const claseAMano = r.detalle.filter(x => x.categoria === 'agenda' && (x.aMano || x.catalogo));
  r.cuadre = {
    posPanel: posMes.reduce((t, x) => t + x.total, 0), posPanelN: posMes.length,
    calzadas: posMes.filter(x => usadas.has(x.ref)).reduce((t, x) => t + x.total, 0),
    sinTuu: posMes.filter(x => !usadas.has(x.ref)).map(x => ({ fecha: x.fecha, hora: x.hora, nombre: x.nombre, monto: x.total })),
    claseSinPanel: claseAMano.map(x => ({ id: x.id, fecha: x.fecha, hora: x.hora, monto: x.monto, pago: x.pago, producto: x.catalogo ? x.productos : '' })),
    porRevisar: r.porRevisar.reduce((t, x) => t + x.monto, 0),
    grupos: r.detalle.filter(x => / pagos\)$/.test(x.clase || '')).length, solas: r.ordenadasSolas || 0
  };
  return r;
}
async function tuuAsignar(env, q, d) {
  const cat = TUU_CATS.includes(d.categoria) ? d.categoria : '';
  await tuuTablas(env.DB);
  const v = await env.DB.prepare('SELECT id, fecha FROM tuu_ventas WHERE id = ?').bind(String(d.id || '')).first();
  if (!v) throw err('No encontramos esa venta.');
  await env.DB.prepare('UPDATE tuu_ventas SET categoria = ?, quien = ? WHERE id = ?').bind(cat, q.email, v.id).run();
  await anotar(env.DB, q, 'tuu ' + v.id + ' → ' + (cat || 'automático'));
  return tuuResumen(env, v.fecha.slice(0, 7));
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
      if (id) { const r = await env.DB.prepare('SELECT * FROM reservas WHERE orden_mp = ?').bind(String(id)).first(); if (r) await revisarPago(env, r, context);
        else { await linkTabla(env.DB); const L = await env.DB.prepare('SELECT * FROM links WHERE orden_mp = ?').bind(String(id)).first(); if (L) await revisarLink(env, L, context); } }
      return json({ ok: true });
    }
    // Pago con Flow o Webpay desde /pagar: se vuelve a revisar allá (no se confía en lo que llega)
    if (url.searchParams.get('externo')) {
      const b = await request.json().catch(() => ({}));
      if (/^LK-/.test(String(b.ref || ''))) { await linkTabla(env.DB); const L = await env.DB.prepare('SELECT * FROM links WHERE ref = ?').bind(String(b.ref)).first(); if (L && b.token && (L.orden_mp === 'flow:' + b.token || L.orden_mp === 'webpay:' + b.token)) await revisarLink(env, L, context); return json({ ok: true }); }
      const r = b.ref ? await env.DB.prepare('SELECT * FROM reservas WHERE ref = ?').bind(String(b.ref)).first() : null;
      if (r && b.token && (r.orden_mp === 'flow:' + b.token || r.orden_mp === 'webpay:' + b.token)) await revisarPago(env, r, context);
      return json({ ok: true });
    }
    if (url.searchParams.get('tarea')) {
      if (!env.TAREA_CLAVE || url.searchParams.get('tarea') !== env.TAREA_CLAVE) return json({ ok: false }, 403);
      const rv = await revisionAutomatica(env, context);
      rv.boletas = await reintentarBoletas(env).catch(() => 0);
      return json(rv);
    }
    if (request.method === 'GET') return json({ ok: true, servicio: 'Storm Escuela · reservas' });
    if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
    const d = await request.json().catch(() => ({}));
    const acc = d.accion;
    if (acc === 'disponibilidad') return json(await disponibilidad(env.DB, d));
    if (acc === 'reservar') return json(await reservar(env, d, context));
    if (acc === 'pack-ver') return json(await packVer(env, d));
    if (acc === 'estado') return json(await estado(env, d, context));
    if (acc === 'ficha') return json(await fichaVer(env, d));
    if (acc === 'ficha-guardar') return json(await fichaGuardar(env, d, request));
    if (acc === 'resena') return json(await resenaGuardar(env, d, context));
    const q = await quien(env, d);
    if (acc === 'fichas') return json(await fichasLeer(env, q, d));
    if (acc === 'escuela') return json(await panel(env, q));
    if (acc === 'pagos-semana') return json(await pagosSemana(env, q, d));
    if (acc === 'disponible') return json(await disponible(env, q, d));
    if (acc === 'semana') return json(await semanaTipo(env, q, d));
    if (acc === 'dia-horas') return json(await diaHoras(env, q, d));
    if (acc === 'vacaciones') return json(await vacaciones(env, q, d, context));
    if (acc === 'rentas') return json(await rentasAccion(env, q, d));
    if (acc === 'tienda') return json(await tiendaAccion(env, q, d));
    if (acc === 'link') return json(await linkAccion(env, q, d, context));
    if (acc === 'cierre') return json(await cierreAccion(env, q, d));
    if (acc === 'tuu-control') { if (q.rol !== 'admin') throw err('Solo administradores.'); return json(Object.assign({ ok: true }, await tuuControl(env, /^\d{4}-\d{2}$/.test(String(d.mes || '')) ? d.mes : ahoraChile().fecha.slice(0, 7)))); }
    if (acc === 'notas') return json(await notasAccion(env, q, d));
    if (q.rol !== 'admin' && !(q.rol === 'recepcion' && ['editar', 'cancelar', 'datos', 'manual', 'saldo', 'pack'].includes(acc))) throw err('Solo un administrador puede hacer esto.');
    if (acc === 'finanzas-mes') return json(await finanzasMes(env, d));
    if (acc === 'tuu-mes') { const m = /^\d{4}-\d{2}$/.test(String(d.mes || '')) ? d.mes : ahoraChile().fecha.slice(0, 7), r = await tuuResumen(env, m, !!d.forzar); try { r.control = await tuuControl(env, m); } catch (x) { console.error(x); } try { r.boletas = await boletasMes(env, m); } catch (x) { console.error(x); } return json(r); }
    if (acc === 'tuu-asignar') return json(await tuuAsignar(env, q, d));
    if (acc === 'resena-prueba') { const a = await ajustes(env.DB); if (!googleResena(a)) throw err('Primero pega el link de Google.'); await enviarCorreo(env, { to: q.email, subject: '¿Cómo estuvo tu clase de surf?', html: correoResena({ ref: 'PRUEBA', clave: 'prueba', nombre: 'Camila Prueba' }), body: 'Prueba' }); return json({ ok: true }); }
    if (acc === 'probar-push') { if (!env.ONESIGNAL_KEY) throw err('Falta ONESIGNAL_KEY en Cloudflare.'); const r = await enviarPush(env, [q.email], 'Prueba de Agenda Storm 🌊', 'Si ves esto, las notificaciones funcionan.'); return json({ ok: true, enviado: r === true, detalle: r === true ? '' : String(r) }); }
    if (acc === 'editar') return json(await editar(env, q, d, context));
    if (acc === 'cancelar') return json(await cancelar(env, q, d, context));
    if (acc === 'datos') return json(await datos(env, q, d));
    if (acc === 'saldo') return json(await cobrarSaldo(env, q, d));
    if (acc === 'manual') return json(await manual(env, q, d, context));
    if (acc === 'pack') return json(await packAccion(env, q, d));
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

