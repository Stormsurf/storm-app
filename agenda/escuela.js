/* Agenda Storm · Escuela (clases particulares): reservas, calendario de cada instructor y ajustes.
   Habla con /api/reservas (Cloudflare). Usa la misma sesión del Panel. */
(() => {
  const API = '/api/reservas';
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const DC = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL');
  const utc = f => { const [y, m, d] = f.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const sumar = (f, n) => new Date(utc(f) + n * 86400000).toISOString().slice(0, 10);
  const dsem = f => new Date(utc(f)).getUTCDay();
  const fcorta = f => { const x = new Date(utc(f)); return DC[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MESES[x.getUTCMonth()].slice(0, 3); };
  const flarga = f => { const x = new Date(utc(f)); return DIAS[x.getUTCDay()] + ' ' + x.getUTCDate() + ' de ' + MESES[x.getUTCMonth()]; };
  const aMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const deMin = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const fin = h => deMin(aMin(h) + (E ? E.duracion : 90));
  const wa = t => { let n = String(t || '').replace(/\D/g, ''); if (n.length === 9 && n[0] === '9') n = '56' + n; if (n.length === 8) n = '569' + n; return n.length >= 10 ? n : ''; };

  const css = `
  .es-sub{display:flex;gap:6px;margin-top:14px;overflow-x:auto;scrollbar-width:none}
  .es-sub button{flex:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:9px 14px;font:inherit;font-size:1.35rem;font-weight:600;cursor:pointer;color:var(--ink)}
  .es-sub button.on{background:#0f6e74;border-color:#0f6e74;color:#fff}
  .es-link{display:flex;align-items:center;gap:10px;justify-content:space-between}
  .es-link code{font-size:1.35rem;background:#F3F1EC;border-radius:8px;padding:6px 9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .es-btn{border:0;border-radius:999px;background:var(--ink);color:#fff;font:inherit;font-weight:600;font-size:1.3rem;padding:8px 14px;cursor:pointer;white-space:nowrap}
  .es-btn.sec{background:#fff;color:var(--ink);border:1.5px solid var(--line)}
  .es-btn.peligro{background:#fff;color:#a12c1c;border:1.5px solid #e9c3bb}
  .es-btn[disabled]{opacity:.5}
  .es-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
  .es-chip{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:7px 12px;font:inherit;font-size:1.3rem;cursor:pointer;color:var(--ink)}
  .es-chip.on{background:#0f6e74;border-color:#0f6e74;color:#fff}
  .es-chip small{opacity:.65;margin-left:4px}
  .es-dia{margin:18px 0 6px;font-size:1.3rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#0f6e74}
  .es-r{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;margin-top:8px}
  .es-r-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
  .es-h{font-size:1.9rem;font-weight:700;line-height:1}
  .es-h small{display:block;font-size:1.15rem;font-weight:500;opacity:.6;margin-top:3px}
  .es-who{flex:1}
  .es-who b{display:block;font-size:1.5rem;font-weight:600}
  .es-who small{display:block;font-size:1.25rem;opacity:.7;line-height:1.4}
  .es-ins{display:inline-block;background:#E3F1F1;color:#0f6e74;border-radius:999px;padding:3px 10px;font-size:1.2rem;font-weight:700;margin:6px 4px 0 0}
  .es-est{display:inline-block;border-radius:999px;padding:3px 10px;font-size:1.15rem;font-weight:700;margin:6px 4px 0 0;background:#fbeee2;color:#b5662b}
  .es-com{margin:8px 0 0;font-size:1.3rem;background:#F3F1EC;border-radius:10px;padding:8px 10px;line-height:1.4}
  .es-acc{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .es-box{background:#F3F1EC;border-radius:14px;padding:12px;margin-top:10px}
  .es-box p{margin:0 0 8px;font-size:1.35rem}
  .es-f{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .es-f label{display:block;font-size:1.2rem;font-weight:600}
  .es-f label.w{grid-column:1/-1}
  .es-f input,.es-f select,.es-f textarea{display:block;width:100%;margin-top:4px;border:1px solid var(--line);border-radius:10px;padding:9px 10px;font:inherit;font-size:1.4rem;background:#fff;color:var(--ink)}
  .es-err{color:#a12c1c;font-size:1.3rem;margin:8px 0 0}
  .es-cal{margin-top:6px}
  .es-cd{padding:10px 0;border-bottom:1px solid var(--line)}
  .es-cd:last-child{border-bottom:0}
  .es-cdh{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:1.4rem;font-weight:600}
  .es-cdh button{border:0;background:none;font:inherit;font-size:1.2rem;color:#0f6e74;text-decoration:underline;cursor:pointer;padding:0}
  .es-slots{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
  .es-s{border:1.5px solid #bfe0cc;background:#effaf3;color:#2f7a4d;border-radius:10px;padding:6px 9px;font:inherit;font-size:1.25rem;font-weight:600;cursor:pointer;line-height:1.15;text-align:left}
  .es-s small{display:block;font-size:1rem;font-weight:500;opacity:.8;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .es-s.no{border-color:var(--line);background:#fff;color:#a5a39f;text-decoration:line-through}
  .es-s.res{border-color:#0f6e74;background:#0f6e74;color:#fff;cursor:default;text-decoration:none}
  .es-s.pas{opacity:.45;cursor:default}
  .es-ley{display:flex;flex-wrap:wrap;gap:10px;font-size:1.15rem;opacity:.75;margin-top:8px}
  .es-ley i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
  .es-wk{display:flex;justify-content:space-between;align-items:center;margin-top:12px}
  .es-wk button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:1.3rem;cursor:pointer;color:var(--ink)}
  .es-tab{width:100%;border-collapse:collapse;font-size:1.35rem;margin-top:6px}
  .es-tab th{font-size:1.15rem;text-align:left;opacity:.6;font-weight:600;padding:4px}
  .es-tab td{padding:4px}
  .es-tab input{width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 8px;font:inherit;font-size:1.35rem}
  .es-insrow{display:grid;grid-template-columns:1fr 1.4fr auto;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)}
  .es-insrow input{border:1px solid var(--line);border-radius:8px;padding:7px 8px;font:inherit;font-size:1.3rem;min-width:0}
  .es-insrow b{font-size:1.4rem}
  .es-sw{display:inline-flex;align-items:center;gap:6px;font-size:1.2rem;cursor:pointer}
  .es-aviso{background:#fbeee2;color:#7a4317;border-radius:14px;padding:12px 14px;font-size:1.35rem;line-height:1.45;margin-top:12px}
  `;

  let E = null, auth = null, pane = null, sub = 'reservas', filtroIns = '', verPasadas = false, abierta = '', modo = '', sel = [], msg = '', calIns = '', calDesde = '', manualOn = false;
  const KEY = 'storm-agenda-datos';

  async function post(body) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, auth, body)) });
    let d; try { d = await r.json(); } catch (_) { throw new Error('No se pudo conectar. Intenta de nuevo.'); }
    if (!d.ok) throw new Error(d.error || 'Error');
    return d;
  }
  const guardarCache = d => { try { localStorage.setItem(KEY, JSON.stringify({ email: auth.email, d })); } catch (_) {} };
  const leerCache = () => { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && c.email === auth.email ? c.d : null; } catch (_) { return null; } };
  async function accion(body, btn) {
    if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = 'Guardando…'; }
    try { E = await post(body); guardarCache(E); abierta = ''; modo = ''; pintar(); return true; }
    catch (x) { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t; } const e = pane.querySelector('.es-err.vivo') || (btn && btn.parentNode.appendChild(Object.assign(document.createElement('p'), { className: 'es-err vivo' }))); if (e) e.textContent = x.message; else alert(x.message); return false; }
  }

  // ---------- disponibilidad (igual que en el servidor) ----------
  function dispo(inst, fecha, hora) {
    const ex = E.excepciones;
    const h = ex.find(e => e.instructor === inst && e.fecha === fecha && e.hora === hora); if (h) return h.libre;
    const d = ex.find(e => e.instructor === inst && e.fecha === fecha && e.hora === ''); if (d) return d.libre;
    const s = E.semana.find(s => s.instructor === inst && s.dia === dsem(fecha));
    return !!(s && s.horas.includes(hora));
  }
  const reservaEn = (inst, fecha, hora) => E.reservas.find(r => r.fecha === fecha && r.instructores.includes(inst) && Math.abs(aMin(r.hora) - aMin(hora)) < E.duracion);

  // ---------- pintar ----------
  function pintar() {
    if (!pane || !E) return;
    const admin = E.rol === 'admin';
    let h = `<style>${css}</style>`;
    if (msg) h += `<div class='pn-ok'>${esc(msg)}</div>`;
    h += `<div class='es-sub'><button data-sub='reservas'>Reservas</button><button data-sub='calendario'>${admin ? 'Calendario instructores' : 'Mi calendario'}</button>${admin ? `<button data-sub='ajustes'>Ajustes</button>` : ''}</div>`;
    if (sub === 'calendario') h += calendario(admin);
    else if (sub === 'ajustes' && admin) h += ajustes();
    else h += reservas(admin);
    pane.innerHTML = h;
    pane.querySelectorAll('[data-sub]').forEach(b => { b.classList.toggle('on', b.dataset.sub === sub); b.onclick = () => { sub = b.dataset.sub; msg = ''; pintar(); }; });
    bind(admin);
  }

  function reservas(admin) {
    const m = E.mes || {};
    let h = '';
    if (admin && (E.faltaConfigurar || []).length) h += `<div class='es-aviso'><b>Falta terminar de conectar:</b> ${E.faltaConfigurar.map(esc).join(', ')}. Mientras falte MP_TOKEN, la página para reservar no cobra.</div>`;
    const mesTxt = MESES[Number((m.mes || E.hoy).slice(5, 7)) - 1];
    h += admin
      ? `<div class='pn-stats'><div class='pn-stat pn-stat--main' style='background:#0f6e74'><small>Clases particulares en ${mesTxt}</small><b>${m.clases || 0}</b><em>${clp(m.total)} vendido</em></div>
         <div class='pn-stat'><small>Para instructores</small><b>${clp(m.pagoInstructores)}</b><em>${Object.entries(m.pagoPor || {}).map(([k, v]) => esc(k) + ' ' + clp(v)).join(' · ') || 'este mes'}</em></div>
         <div class='pn-stat'><small>Queda para Storm</small><b>${clp((m.total || 0) - (m.pagoInstructores || 0))}</b><em>antes de comisión</em></div></div>
         <div class='pn-card es-link'><div style='min-width:0'><b style='font-size:1.4rem'>Link para reservar</b><br><code>${esc(E.link.replace('https://', ''))}</code></div><button class='es-btn' data-copiar>Copiar</button></div>`
      : `<div class='pn-stats'><div class='pn-stat pn-stat--main' style='background:#0f6e74'><small>Tus clases particulares en ${mesTxt}</small><b>${m.clases || 0}</b><em>${clp(m.pagoYo)} a pagarte</em></div></div>`;
    const lista = E.reservas.filter(r => verPasadas ? r.fecha < E.hoy : r.fecha >= E.hoy).filter(r => !filtroIns || r.instructores.includes(filtroIns));
    if (verPasadas) lista.reverse();
    if (admin) {
      const fut = E.reservas.filter(r => r.fecha >= E.hoy);
      h += `<div class='es-chips'><button class='es-chip${filtroIns ? '' : ' on'}' data-fi=''>Todos<small>${fut.length}</small></button>${E.instructores.filter(i => i.activo).map(i => `<button class='es-chip${filtroIns === i.nombre ? ' on' : ''}' data-fi='${esc(i.nombre)}'>${esc(i.nombre)}<small>${fut.filter(r => r.instructores.includes(i.nombre)).length}</small></button>`).join('')}</div>`;
      h += `<button class='pn-vfin' style='border-color:#0f6e74;background:#E3F1F1;color:#0f6e74' data-manual>+ Agregar reserva a mano (WhatsApp, empresa, grupo grande)</button>`;
      if (manualOn) h += manualForm();
    }
    let dia = '';
    h += lista.length ? lista.map(r => { const t = r.fecha !== dia ? `<p class='es-dia'>${r.fecha === E.hoy ? 'Hoy · ' : r.fecha === sumar(E.hoy, 1) ? 'Mañana · ' : ''}${esc(flarga(r.fecha))}</p>` : ''; dia = r.fecha; return t + tarjeta(r, admin); }).join('')
      : `<div class='pn-card'><p class='pn-empty'>${verPasadas ? 'No hay clases anteriores.' : 'Todavía no hay clases reservadas.'}</p></div>`;
    h += `<p class='pn-note'><button class='pn-link' data-pasadas>${verPasadas ? 'Ver próximas clases' : 'Ver clases anteriores'}</button></p>`;
    return h;
  }

  function tarjeta(r, admin) {
    const est = r.estado === 'pendiente' ? `<span class='es-est'>Pagando en este momento</span>` : r.estado === 'revisar' ? `<span class='es-est'>Revisar: ${esc(r.nota)}</span>` : '';
    let h = `<div class='es-r'><div class='es-r-top'><div class='es-h'>${esc(r.hora)}<small>a ${fin(r.hora)}</small></div>
      <div class='es-who'><b>${esc(r.nombre)}</b><small>${r.personas} persona${r.personas === 1 ? '' : 's'}${r.menores ? ' · ' + r.menores + ' menor' + (r.menores === 1 ? '' : 'es') + ' de 7' : ''}${admin ? ' · ' + clp(r.total) + ' ' + esc(r.medio) : ''}</small>
      ${r.instructores.map(i => `<span class='es-ins'>${esc(i)}</span>`).join('')}${est}</div>
      ${wa(r.telefono) ? `<a class='pn-wa' target='_blank' rel='noopener' href='https://wa.me/${wa(r.telefono)}'>WhatsApp</a>` : ''}</div>
      ${r.comentario ? `<p class='es-com'>${esc(r.comentario)}</p>` : ''}`;
    if (admin && r.fecha >= E.hoy) {
      if (abierta !== r.ref) h += `<div class='es-acc'><button class='es-btn sec' data-abre='${r.ref}' data-modo='ins'>Cambiar instructor</button><button class='es-btn sec' data-abre='${r.ref}' data-modo='mover'>Mover</button><button class='es-btn peligro' data-abre='${r.ref}' data-modo='cancelar'>Cancelar</button></div>`;
      else if (modo === 'ins') {
        const n = r.instructores.length;
        h += `<div class='es-box'><p>Elige ${n === 1 ? 'el instructor' : n + ' instructores'} para esta clase:</p><div class='es-chips' style='margin-top:0'>${E.instructores.filter(i => i.activo).map(i => {
          const otra = reservaEn(i.nombre, r.fecha, r.hora); const ocup = otra && otra.ref !== r.ref;
          return `<button class='es-chip${sel.includes(i.nombre) ? ' on' : ''}' data-sel='${esc(i.nombre)}'${ocup ? ' disabled style="opacity:.4"' : ''}>${esc(i.nombre)}${ocup ? '<small>ocupado</small>' : !dispo(i.nombre, r.fecha, r.hora) ? '<small>no marcó disponible</small>' : ''}</button>`; }).join('')}</div>
          <div class='es-acc'><button class='es-btn' data-go='ins'${sel.length === n ? '' : ' disabled'}>Guardar</button><button class='pn-link' data-cerrar>Cancelar</button></div><p class='es-err vivo'></p></div>`;
      } else if (modo === 'mover') {
        h += `<div class='es-box'><div class='es-f'><label>Día<input type='date' id='es-mf' value='${r.fecha}' min='${E.hoy}'></label><label>Hora<select id='es-mh'>${E.horarios.map(x => `<option${x === r.hora ? ' selected' : ''}>${x}</option>`).join('')}</select></label></div>
          <p style='margin:8px 0 0;font-size:1.2rem;opacity:.7'>Se mantiene el mismo instructor. Avísale al cliente por WhatsApp.</p>
          <div class='es-acc'><button class='es-btn' data-go='mover'>Guardar</button><button class='pn-link' data-cerrar>Cancelar</button></div><p class='es-err vivo'></p></div>`;
      } else if (modo === 'cancelar') {
        h += `<div class='es-box'><p>¿Cancelar la clase de <b>${esc(r.nombre)}</b>? El horario queda libre.${r.medio === 'Mercado Pago' ? ' Si hay que devolver el dinero, hazlo desde Mercado Pago.' : ''}</p>
          <div class='es-acc'><button class='es-btn peligro' data-go='cancelar'>Sí, cancelar</button><button class='pn-link' data-cerrar>No</button></div><p class='es-err vivo'></p></div>`;
      }
    }
    return h + '</div>';
  }

  function manualForm() {
    const a = E.ajustes || {};
    return `<div class='pn-card'><h3>Agregar reserva a mano</h3><p class='pn-sub'>Para clases que llegan por WhatsApp, empresas o familias grandes. No pasa por Mercado Pago.</p>
      <div class='es-f' style='margin-top:10px'>
        <label>Día<input type='date' name='fecha' min='${E.hoy}' value='${E.hoy}'></label>
        <label>Hora<select name='hora'>${E.horarios.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label>Personas<input type='number' name='personas' min='1' value='2' inputmode='numeric'></label>
        <label>Menores de 7<input type='number' name='menores' min='0' value='0' inputmode='numeric'></label>
        <label class='w'>Nombre del cliente<input name='nombre'></label>
        <label>Teléfono<input name='telefono' type='tel'></label>
        <label>Correo (opcional)<input name='correo' type='email'></label>
        <label>Total cobrado<input name='total' inputmode='numeric' placeholder='según la tabla'></label>
        <label>Pago instructores<input name='pagoInstructor' inputmode='numeric' placeholder='según la tabla'></label>
        <label>Cómo pagó<select name='medio'><option>Transferencia</option><option>Efectivo</option><option>Por pagar</option><option>Mercado Pago</option></select></label>
        <label>Instructor<select name='instructor'><option value=''>Al azar (los libres)</option>${E.instructores.filter(i => i.activo).map(i => `<option>${esc(i.nombre)}</option>`).join('')}</select></label>
        <label>N° de instructores<input type='number' name='nInstructores' min='1' value='1' inputmode='numeric'></label>
        <label class='w'>Comentario<textarea name='comentario' rows='2'></textarea></label>
        <label class='w' style='font-weight:500'><input type='checkbox' name='avisar' style='display:inline;width:auto;margin:0 6px 0 0'>Mandarle el comprobante por correo</label>
      </div>
      <p style='margin:8px 0 0;font-size:1.2rem;opacity:.7'>Si dejas vacíos el total y el pago, se usa la tabla (${clp(a.precios && a.precios[2])} para 2 personas; grupos de más de 5: ${clp(a.pagos && a.pagos.grupo)} por instructor).</p>
      <div class='es-acc'><button class='es-btn' data-manual-go>Guardar reserva</button><button class='pn-link' data-manual>Cerrar</button></div><p class='es-err vivo'></p></div>`;
  }

  function calendario(admin) {
    const activos = E.instructores.filter(i => i.activo).map(i => i.nombre);
    const inst = admin ? (activos.includes(calIns) ? calIns : (calIns = activos[0] || '')) : E.yo;
    if (!calDesde || calDesde < E.hoy) calDesde = E.hoy;
    let h = '';
    if (admin) h += `<div class='es-chips'>${activos.map(n => `<button class='es-chip${inst === n ? ' on' : ''}' data-ci='${esc(n)}'>${esc(n)}</button>`).join('')}</div>`;
    if (!inst) return h + `<div class='pn-card'><p class='pn-empty'>Agrega instructores en Ajustes.</p></div>`;
    h += `<div class='pn-card'><h3>${admin ? 'Calendario de ' + esc(inst) : 'Mi calendario'}</h3><p class='pn-sub'>Toca una hora para marcar si ${admin ? esc(inst) + ' puede' : 'puedes'} o no. Las clases reservadas salen en azul.</p>
      <div class='es-ley'><span><i style='background:#effaf3;border:1.5px solid #bfe0cc'></i>Disponible</span><span><i style='background:#fff;border:1.5px solid #ddd'></i>No disponible</span><span><i style='background:#0f6e74'></i>Clase reservada</span></div>
      <div class='es-wk'><button data-wk='-7'${calDesde <= E.hoy ? ' disabled style="opacity:.3"' : ''}>‹ Antes</button><b style='font-size:1.35rem'>${fcorta(calDesde)} – ${fcorta(sumar(calDesde, 6))}</b><button data-wk='7'>Después ›</button></div><div class='es-cal'>`;
    for (let k = 0; k < 7; k++) {
      const f = sumar(calDesde, k), diaEx = E.excepciones.find(e => e.instructor === inst && e.fecha === f && e.hora === '');
      const libres = E.horarios.filter(x => dispo(inst, f, x)).length;
      h += `<div class='es-cd'><div class='es-cdh'><span>${esc(fcorta(f))}</span>${libres ? `<button data-dia='${f}' data-libre='0'>No puedo este día</button>` : `<button data-dia='${f}' data-libre='${diaEx ? 'x' : '1'}'>${diaEx ? 'Volver a mi semana tipo' : 'Puedo todo el día'}</button>`}</div><div class='es-slots'>`;
      E.horarios.forEach(x => {
        const r = reservaEn(inst, f, x), ok = dispo(inst, f, x);
        if (r) h += r.hora === x ? `<span class='es-s res'>${x}<small>${esc(r.nombre.split(' ')[0])} · ${r.personas}p</small></span>` : `<span class='es-s res' style='opacity:.55'>${x}<small>sigue clase ${esc(r.hora)}</small></span>`;
        else h += `<button class='es-s${ok ? '' : ' no'}' data-sf='${f}' data-sh='${x}' data-ok='${ok ? 1 : 0}'>${x}</button>`;
      });
      h += `</div></div>`;
    }
    h += `</div></div>`;
    // Semana tipo
    h += `<div class='pn-card'><h3>Semana tipo${admin ? ' de ' + esc(inst) : ''}</h3><p class='pn-sub'>Las horas que ${admin ? 'puede' : 'puedes'} trabajar cada semana. Lo de arriba cambia solo un día puntual.</p>`;
    [1, 2, 3, 4, 5, 6, 0].forEach(d => {
      const s = E.semana.find(s => s.instructor === inst && s.dia === d), horas = s ? s.horas : [];
      h += `<div class='es-cd'><div class='es-cdh'><span>${DIAS[d]}</span><button data-semtodo='${d}' data-v='${horas.length ? 0 : 1}'>${horas.length ? 'Nada' : 'Todo'}</button></div><div class='es-slots'>${E.horarios.map(x => `<button class='es-s${horas.includes(x) ? '' : ' no'}' data-sd='${d}' data-sh='${x}'>${x}</button>`).join('')}</div></div>`;
    });
    return h + `</div>`;
  }

  function ajustes() {
    const a = E.ajustes;
    let h = `<div class='pn-card'><h3>Precios y pago a instructores</h3><p class='pn-sub'>Lo que paga el cliente y lo que se le paga al instructor por clase.</p>
      <table class='es-tab'><tr><th>Personas</th><th>Precio</th><th>Pago instructor</th></tr>${[1, 2, 3, 4, 5].map(n => `<tr><td><b>${n}</b></td><td><input data-pr='${n}' value='${a.precios[n] || ''}' inputmode='numeric'></td><td><input data-pa='${n}' value='${a.pagos[n] || ''}' inputmode='numeric'></td></tr>`).join('')}
      <tr><td colspan='2'>Grupo grande o empresa (por instructor)</td><td><input data-pa='grupo' value='${a.pagos.grupo || ''}' inputmode='numeric'></td></tr></table>
      <p style='margin:8px 0 0;font-size:1.2rem;opacity:.7'>Con menores de 7 años va 1 instructor por cada 2 niños: el pago se calcula por instructor según cuántos le tocan.</p>
      <div class='es-acc'><button class='es-btn' data-aj='precios'>Guardar precios</button></div><p class='es-err vivo'></p></div>`;
    h += `<div class='pn-card'><h3>Horarios y reglas</h3>
      <div class='es-f' style='margin-top:10px'><label class='w'>Horas de inicio de clase (separadas por coma)<input id='es-hor' value='${esc(a.horarios.join(', '))}'></label>
      <label>Anticipación mínima (horas)<input id='es-min' type='number' min='0' value='${a.minHoras}'></label>
      <label>Se puede reservar hasta (días adelante)<input id='es-dias' type='number' min='1' value='${a.diasAdelante}'></label>
      <label>Las clases antes de las…<input id='es-tarde' value='${esc(a.horaTarde)}'></label>
      <label>…se reservan hasta las (día anterior)<input id='es-noche' value='${esc(a.cierreNoche)}'></label>
      <label class='w'>Lugar (sale en el comprobante)<input id='es-lugar' value='${esc(a.lugar)}'></label></div>
      <p style='margin:8px 0 0;font-size:1.2rem;opacity:.7'>Así nadie reserva de noche para la mañana siguiente. Para la tarde se puede reservar el mismo día, con la anticipación mínima.</p>
      <div class='es-acc'><button class='es-btn' data-aj='reglas'>Guardar</button></div><p class='es-err vivo'></p></div>`;
    h += `<div class='pn-card'><h3>Instructores de la Escuela</h3><p class='pn-sub'>Con su correo pueden entrar a Agenda Storm y ver su calendario. Inactivo = no recibe clases nuevas (por ejemplo, fuera de temporada).</p>
      ${E.instructores.map(i => `<div class='es-insrow'><b>${esc(i.nombre)}</b><input data-ic='${esc(i.nombre)}' type='email' placeholder='correo' value='${esc(i.correo || '')}'>
        <label class='es-sw'><input type='checkbox' data-ia='${esc(i.nombre)}'${i.activo ? ' checked' : ''}>Activo</label></div>`).join('')}
      <div class='es-insrow'><input id='es-nn' placeholder='Nombre nuevo'><input id='es-nc' type='email' placeholder='correo'><span></span></div>
      <div class='es-acc'><button class='es-btn' data-aj='instructores'>Guardar instructores</button></div><p class='es-err vivo'></p></div>`;
    h += `<div class='pn-card'><h3>Administradores</h3><p class='pn-sub'>Ven todo, cambian instructores, precios y ajustes.</p>
      <div class='es-f' style='margin-top:10px'><label class='w'>Correos (separados por coma)<input id='es-adm' value='${esc((a.admins || []).join(', '))}'></label></div>
      <div class='es-acc'><button class='es-btn' data-aj='admins'>Guardar</button></div><p class='es-err vivo'></p></div>`;
    return h;
  }

  function bind(admin) {
    const $$ = s => pane.querySelectorAll(s), $ = s => pane.querySelector(s);
    $$('[data-fi]').forEach(b => b.onclick = () => { filtroIns = b.dataset.fi; pintar(); });
    $$('[data-pasadas]').forEach(b => b.onclick = () => { verPasadas = !verPasadas; pintar(); });
    $$('[data-copiar]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(E.link); b.textContent = '¡Copiado!'; } catch (_) { prompt('Copia el link:', E.link); } });
    $$('[data-manual]').forEach(b => b.onclick = () => { manualOn = !manualOn; pintar(); });
    $$('[data-abre]').forEach(b => b.onclick = () => { abierta = b.dataset.abre; modo = b.dataset.modo; msg = ''; sel = (E.reservas.find(r => r.ref === abierta) || {}).instructores.slice(); pintar(); });
    $$('[data-cerrar]').forEach(b => b.onclick = () => { abierta = ''; modo = ''; pintar(); });
    $$('[data-sel]').forEach(b => b.onclick = () => {
      const n = (E.reservas.find(r => r.ref === abierta) || {}).instructores.length, v = b.dataset.sel;
      if (sel.includes(v)) sel = sel.filter(x => x !== v); else { sel.push(v); if (sel.length > n) sel.shift(); }
      pintar();
    });
    const go = $('[data-go]');
    if (go) go.onclick = () => {
      const r = E.reservas.find(x => x.ref === abierta);
      if (go.dataset.go === 'ins') accion({ accion: 'editar', ref: abierta, instructores: sel }, go).then(ok => { if (ok) { msg = 'Listo: ' + r.nombre + ' ahora tiene clase con ' + sel.join(' y ') + '.'; pintar(); } });
      if (go.dataset.go === 'mover') { const f = $('#es-mf').value, hh = $('#es-mh').value; accion({ accion: 'editar', ref: abierta, fecha: f, hora: hh }, go).then(ok => { if (ok) { msg = 'Listo: clase de ' + r.nombre + ' movida al ' + flarga(f) + ' a las ' + hh + '. Avísale por WhatsApp.'; pintar(); } }); }
      if (go.dataset.go === 'cancelar') accion({ accion: 'cancelar', ref: abierta }, go).then(ok => { if (ok) { msg = 'Clase de ' + r.nombre + ' cancelada.'; pintar(); } });
    };
    const mg = $('[data-manual-go]');
    if (mg) mg.onclick = () => {
      const c = mg.closest('.pn-card'), v = {}; c.querySelectorAll('[name]').forEach(i => v[i.name] = i.type === 'checkbox' ? i.checked : i.value.trim());
      const body = Object.assign({ accion: 'manual' }, v, { instructores: v.instructor ? [v.instructor] : [] });
      accion(body, mg).then(ok => { if (ok) { manualOn = false; msg = 'Reserva de ' + v.nombre + ' guardada.'; pintar(); } });
    };
    // calendario
    $$('[data-ci]').forEach(b => b.onclick = () => { calIns = b.dataset.ci; pintar(); });
    $$('[data-wk]').forEach(b => b.onclick = () => { calDesde = sumar(calDesde, +b.dataset.wk); if (calDesde < E.hoy) calDesde = E.hoy; pintar(); });
    const inst = admin ? calIns : E.yo;
    $$('[data-sf]').forEach(b => b.onclick = () => {
      const f = b.dataset.sf, hh = b.dataset.sh, ahora = b.dataset.ok === '1', quiero = !ahora;
      const sinHora = Object.assign({}, E, { excepciones: E.excepciones.filter(e => !(e.instructor === inst && e.fecha === f && e.hora === hh)) });
      const base = (() => { const old = E; E = sinHora; const v = dispo(inst, f, hh); E = old; return v; })();
      b.classList.toggle('no', !quiero); b.dataset.ok = quiero ? 1 : 0;
      accion({ accion: 'disponible', instructor: inst, fecha: f, hora: hh, libre: base === quiero ? null : quiero });
    });
    $$('[data-dia]').forEach(b => b.onclick = () => { const l = b.dataset.libre; accion({ accion: 'disponible', instructor: inst, fecha: b.dataset.dia, hora: '', libre: l === 'x' ? null : l === '1' }, b); });
    $$('[data-sd]').forEach(b => b.onclick = () => {
      const d = +b.dataset.sd, s = E.semana.find(s => s.instructor === inst && s.dia === d), horas = s ? s.horas.slice() : [], x = b.dataset.sh;
      const nuevas = horas.includes(x) ? horas.filter(y => y !== x) : horas.concat(x);
      b.classList.toggle('no');
      accion({ accion: 'semana', instructor: inst, dia: d, horas: nuevas });
    });
    $$('[data-semtodo]').forEach(b => b.onclick = () => accion({ accion: 'semana', instructor: inst, dia: +b.dataset.semtodo, horas: b.dataset.v === '1' ? E.horarios : [] }, b));
    // ajustes
    $$('[data-aj]').forEach(b => b.onclick = async () => {
      const t = b.dataset.aj;
      if (t === 'precios') {
        const precios = {}, pagos = {}; $$('[data-pr]').forEach(i => precios[i.dataset.pr] = i.value); $$('[data-pa]').forEach(i => pagos[i.dataset.pa] = i.value);
        if (await accion({ accion: 'ajustes', precios, pagos }, b)) { msg = 'Precios guardados. La página para reservar ya muestra los nuevos.'; pintar(); }
      }
      if (t === 'reglas' && await accion({ accion: 'ajustes', horarios: $('#es-hor').value.split(/[,\s]+/).filter(Boolean), minHoras: $('#es-min').value, diasAdelante: $('#es-dias').value, horaTarde: $('#es-tarde').value, cierreNoche: $('#es-noche').value, lugar: $('#es-lugar').value }, b)) { msg = 'Horarios y reglas guardados.'; pintar(); }
      if (t === 'admins' && await accion({ accion: 'ajustes', admins: $('#es-adm').value.split(/[,\s]+/).filter(Boolean) }, b)) { msg = 'Administradores guardados.'; pintar(); }
      if (t === 'instructores') {
        b.disabled = true; b.textContent = 'Guardando…';
        try {
          for (const i of E.instructores) {
            const c = pane.querySelector(`[data-ic="${CSS.escape(i.nombre)}"]`).value.trim(), a = pane.querySelector(`[data-ia="${CSS.escape(i.nombre)}"]`).checked;
            if (c !== (i.correo || '') || a !== i.activo) E = await post({ accion: 'instructor', nombre: i.nombre, correo: c, telefono: i.telefono || '', activo: a });
          }
          const nn = $('#es-nn').value.trim(); if (nn) E = await post({ accion: 'instructor', nombre: nn, correo: $('#es-nc').value.trim(), activo: true });
          guardarCache(E); msg = 'Instructores guardados.'; pintar();
        } catch (x) { b.disabled = false; b.textContent = 'Guardar instructores'; b.parentNode.nextElementSibling.textContent = x.message; }
      }
    });
  }

  let salir = null;
  async function cargar(p, a, alSalir) {
    pane = p; auth = a; salir = alSalir || null;
    if (!E) E = leerCache();
    if (E) pintar(); else pane.innerHTML = `<div class='pn-skel'></div><div class='pn-skel'></div>`;
    try {
      const d = await post({ accion: 'escuela' });
      const cambio = !E || JSON.stringify(E) !== JSON.stringify(d);
      E = d; guardarCache(d);
      const a = document.activeElement;
      if (cambio && !(a && pane.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) pintar();
    } catch (x) {
      if (salir && /sesión|expir/i.test(x.message)) return salir(x.message);
      if (!E) pane.innerHTML = `<div class='pn-msg'>${esc(x.message)}</div>`;
    }
  }
  window.StormEscuela = { cargar };
})();
