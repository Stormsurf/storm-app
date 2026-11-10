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
  .es-dia-wrap{overflow-x:auto;margin:0 -4px;padding:0 4px 6px}
  .es-dia{display:grid;gap:0 4px;min-width:min-content}
  .es-dh{text-align:center;padding:4px 2px 8px;font-size:1.25rem;line-height:1.2;text-transform:none;letter-spacing:0;color:var(--ink)}
  .es-dh *{text-transform:none;letter-spacing:0}
  .es-dh b{display:block;margin-top:4px;color:var(--ink);font-size:1.3rem}
  .es-dh small{display:block;color:#8a8986;font-size:1.1rem;font-weight:500}
  .es-av{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#9a9893;color:#fff;font-weight:700;font-size:1.2rem}
  .es-dcol{position:relative;background:#fff;border-radius:10px}
  .es-dhoras{background:transparent}
  .es-dhoras span{position:absolute;right:4px;transform:translateY(-50%);font-size:1.1rem;color:#8a8986;font-weight:500;letter-spacing:0;text-transform:none}
  .es-dhoras span:first-child{transform:none}
  .es-dc{position:absolute;left:0;right:0;border:0;border-top:1px solid #f0eee9;background:transparent;padding:0;cursor:pointer}
  .es-dc.no{background:#ECEAE6;cursor:default}
  .es-dc:not(.no):hover{background:#E3F1F1}
  .es-db{position:absolute;left:3px;right:3px;border:0;border-radius:8px;background:#0f6e74;color:#fff;text-align:left;padding:4px 6px;font:inherit;font-size:1.15rem;line-height:1.25;overflow:hidden;cursor:pointer;z-index:2}
  .es-db b{display:block;font-size:1.2rem;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .es-db small{display:block;opacity:.9}
  .es-db.pend{background:#E3F1F1;color:#0f6e74;border:1.5px dashed #0f6e74}
  .es-db.otra{background:#F3F1EC;color:#6b6a67;border:1.5px dashed #c9c5bd;cursor:default;z-index:1}
  .es-ahora{position:absolute;left:0;right:0;border-top:2px solid #e0484e;z-index:3}
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

  let linkNuevo = null, E = null, auth = null, pane = null, sub = 'dia', diaVer = '', manualPre = null, filtroIns = '', verPasadas = false, abierta = '', modo = '', sel = [], msg = '', calIns = '', calDesde = '', manualOn = false;
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
  const otraCosa = (inst, fecha, hora) => { const ini = aMin(hora), f = ini + E.duracion, d = dsem(fecha);
    const o = (E.ocupaciones || []).find(o => (o.instructor === '*' || o.instructor === inst) && (o.fecha ? o.fecha === fecha : o.dia === d) && aMin(o.desde) < f && aMin(o.hasta) > ini);
    return o ? o.motivo || 'Ocupado' : ''; };
  const reservaEn = (inst, fecha, hora) => E.reservas.find(r => r.fecha === fecha && r.instructores.includes(inst) && Math.abs(aMin(r.hora) - aMin(hora)) < E.duracion);

  // A mano se puede anotar a cualquier hora (cada 30 min, 7:00 a 19:30), no solo los bloques de la web
  const horasMano = () => { const l = new Set(E.horarios); for (let m = 7 * 60; m <= 19 * 60 + 30; m += 30) l.add(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')); return [...l].sort(); };
  const msgLink = L => 'Hola ' + L.nombre.split(' ')[0] + '! Te dejo el link para pagar tu clase de surf con Storm: ' + flarga(L.fecha).toLowerCase() + ' a las ' + L.hora + ', ' + L.personas + (L.personas === 1 ? ' persona' : ' personas') + ', ' + clp(L.total) + '. Al pagar te llega el comprobante y la ficha para llenar.\n' + L.url;
  // ---------- pintar ----------
  function pintar() {
    if (!pane || !E) return;
    const admin = E.rol === 'admin';
    let h = `<style>${css}</style>`;
    if (msg) h += `<div class='pn-ok'>${esc(msg)}</div>`;
    if (linkNuevo) { const L = linkNuevo;
      h += `<div class='pn-card' style='border:2px solid #0f6e74'><h3>Link de pago listo</h3><p class='pn-sub'>${esc(L.nombre)} · ${esc(flarga(L.fecha))} ${esc(L.hora)} · ${L.personas} persona${L.personas === 1 ? '' : 's'} · ${clp(L.total)}. El horario queda guardado hasta el ${esc(fcorta(L.hasta.fecha))} a las ${esc(L.hasta.hora)}.</p>
        <div class='es-acc'>${wa(L.telefono) ? `<a class='es-btn' style='text-decoration:none' target='_blank' rel='noopener' href='https://wa.me/${wa(L.telefono)}?text=${encodeURIComponent(msgLink(L))}'>Mandar por WhatsApp</a>` : ''}<button class='es-btn sec' data-lf='${esc(msgLink(L))}'>Copiar mensaje</button><button class='pn-link' data-lnx>Cerrar</button></div></div>`; }
    h += `<div class='es-sub'><button data-sub='dia'>Día</button><button data-sub='reservas'>Reservas</button><button data-sub='calendario'>${admin ? 'Calendario instructores' : 'Mi calendario'}</button><button data-sub='pagos'>${admin ? 'Pagos' : 'Mis pagos'}</button>${admin ? `<button data-sub='ajustes'>Ajustes</button>` : ''}</div>`;
    if (sub === 'dia') h += diaVista(admin);
    else if (sub === 'calendario') h += calendario(admin);
    else if (sub === 'pagos') h += pagosVista(admin);
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
    const est = r.estado === 'pendiente' ? `<span class='es-est'>${r.linkPago && r.nota && /mano/.test(r.nota) ? 'Esperando pago (link enviado)' : 'Pagando en este momento'}</span>` : r.estado === 'revisar' ? `<span class='es-est'>Revisar: ${esc(r.nota)}</span>` : '';
    let h = `<div class='es-r'><div class='es-r-top'><div class='es-h'>${esc(r.hora)}<small>a ${fin(r.hora)}</small></div>
      <div class='es-who'><b>${esc(r.nombre)}</b><small>${r.personas} persona${r.personas === 1 ? '' : 's'}${r.menores ? ' · ' + r.menores + ' menor' + (r.menores === 1 ? '' : 'es') + ' de 7' : ''}${r.ninos ? ' · ' + r.ninos + ' de 7 a 11' : ''}${admin ? ' · ' + clp(r.total) + ' ' + esc(r.medio) : ''}</small>
      ${r.instructores.map(i => `<span class='es-ins'>${esc(i)}</span>`).join('')}${est}
      <span class='es-est' style='${(r.fichas || []).length >= r.personas ? 'background:#e5f2ea;color:#2f7a4d' : ''}'>Fichas ${(r.fichas || []).length}/${r.personas}</span></div>
      ${wa(r.telefono) ? `<a class='pn-wa' target='_blank' rel='noopener' href='https://wa.me/${wa(r.telefono)}'>WhatsApp</a>` : ''}</div>
      ${r.comentario ? `<p class='es-com'>${esc(r.comentario)}</p>` : ''}
      ${admin && r.linkPago ? `<div class='es-acc'><button class='es-btn' data-lf='${esc(msgLink({ nombre: r.nombre, fecha: r.fecha, hora: r.hora, personas: r.personas, total: r.total, url: r.linkPago }))}'>Copiar link de pago</button>${wa(r.telefono) ? `<a class='es-btn sec' style='text-decoration:none' target='_blank' rel='noopener' href='https://wa.me/${wa(r.telefono)}?text=${encodeURIComponent(msgLink({ nombre: r.nombre, fecha: r.fecha, hora: r.hora, personas: r.personas, total: r.total, url: r.linkPago }))}'>Reenviar por WhatsApp</a>` : ''}</div>` : ''}
      <div class='es-acc'>${r.estado === 'pendiente' ? '' : (r.fichas || []).length ? `<a class='es-btn sec' style='text-decoration:none' href='/agenda/fichas.html?ref=${encodeURIComponent(r.ref)}' target='_blank'>Ver fichas</a>` : ''}${r.estado !== 'pendiente' && (r.fichas || []).length < r.personas && r.linkFicha ? `<button class='es-btn sec' data-lf='${esc(r.linkFicha)}'>Copiar link de la ficha</button>${wa(r.telefono) ? `<a class='es-btn sec' style='text-decoration:none' target='_blank' rel='noopener' href='https://wa.me/${wa(r.telefono)}?text=${encodeURIComponent('Hola ' + r.nombre.split(' ')[0] + ', antes de la clase de surf necesitamos la ficha de cada participante (2 minutos): ' + r.linkFicha)}'>Pedir ficha por WhatsApp</a>` : ''}` : ''}</div>`;
    if (admin && r.fecha >= E.hoy) {
      if (abierta !== r.ref) h += `<div class='es-acc'><button class='es-btn sec' data-abre='${r.ref}' data-modo='ins'>Cambiar instructor</button><button class='es-btn sec' data-abre='${r.ref}' data-modo='mover'>Mover</button><button class='es-btn peligro' data-abre='${r.ref}' data-modo='cancelar'>Cancelar</button></div>`;
      else if (modo === 'ins') {
        const n = r.instructores.length;
        h += `<div class='es-box'><p>Elige ${n === 1 ? 'el instructor' : n + ' instructores'} para esta clase:</p><div class='es-chips' style='margin-top:0'>${E.instructores.filter(i => i.activo).map(i => {
          const otra = reservaEn(i.nombre, r.fecha, r.hora); const ocup = (otra && otra.ref !== r.ref) || !!otraCosa(i.nombre, r.fecha, r.hora);
          return `<button class='es-chip${sel.includes(i.nombre) ? ' on' : ''}' data-sel='${esc(i.nombre)}'${ocup ? ' disabled style="opacity:.4"' : ''}>${esc(i.nombre)}${ocup ? '<small>' + esc(otraCosa(i.nombre, r.fecha, r.hora) || 'ocupado') + '</small>' : !dispo(i.nombre, r.fecha, r.hora) ? '<small>no marcó disponible</small>' : ''}</button>`; }).join('')}</div>
          <div class='es-acc'><button class='es-btn' data-go='ins'${sel.length === n ? '' : ' disabled'}>Guardar</button><button class='pn-link' data-cerrar>Cancelar</button></div><p class='es-err vivo'></p></div>`;
      } else if (modo === 'mover') {
        h += `<div class='es-box'><div class='es-f'><label>Día<input type='date' id='es-mf' value='${r.fecha}' min='${E.hoy}'></label><label>Hora<select id='es-mh'>${horasMano().map(x => `<option value='${x}'${x === r.hora ? ' selected' : ''}>${x}</option>`).join('')}</select></label></div>
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
    return `<div class='pn-card'><h3>Agregar reserva a mano</h3><p class='pn-sub'>Para clases que llegan por WhatsApp, empresas o familias grandes. Puedes elegir cualquier hora.</p>
      <div class='es-f' style='margin-top:10px'>
        <label>Día<input type='date' name='fecha' min='${E.hoy}' value='${E.hoy}'></label>
        <label>Hora<select name='hora'>${horasMano().map(x => `<option value='${x}'${x === E.horarios[0] ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>Personas<input type='number' name='personas' min='1' value='2' inputmode='numeric'></label>
        <label>Menores de 7<input type='number' name='menores' min='0' value='0' inputmode='numeric'></label>
        <label>Niños de 7 a 11<input type='number' name='ninos' min='0' value='0' inputmode='numeric'></label>
        <label class='w'>Nombre del cliente<input name='nombre' list='es-clientes' autocomplete='off' placeholder='Escribe y elige si ya reservó antes'></label><datalist id='es-clientes'>${(E.clientes || []).map(c => `<option value='${esc(c.nombre)}'>${esc([c.telefono, c.clases + (c.clases === 1 ? ' clase' : ' clases')].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
        <label>Teléfono<input name='telefono' type='tel'></label>
        <label>Correo (opcional)<input name='correo' type='email'></label>
        <label>Total cobrado<input name='total' inputmode='numeric' placeholder='según la tabla'></label>
        <label>Pago instructores<input name='pagoInstructor' inputmode='numeric' placeholder='según la tabla'></label>
        <label>Pago<select name='medio'><option value='Link de pago'>Mandar link de pago</option><option>Transferencia</option><option>Efectivo</option><option>Por pagar</option><option value='Mercado Pago'>Ya pagó por Mercado Pago</option></select></label>
        <label>N° de instructores<input type='number' name='nInstructores' min='1' value='1' inputmode='numeric'></label>
        <div style='grid-column:1/-1'><b style='font-size:1.3rem'>Instructores</b> <span style='font-size:1.2rem;opacity:.7'>(elige uno o varios; si no eliges, o faltan, la app elige al azar entre los libres)</span>
          <div class='es-chips' style='margin-top:6px'>${E.instructores.filter(i => i.activo).map(i => `<button type='button' class='es-chip' data-mi='${esc(i.nombre)}'>${esc(i.nombre)}</button>`).join('')}</div></div>
        <label class='w'>Comentario<textarea name='comentario' rows='2'></textarea></label>
        <label class='w' style='font-weight:500'><input type='checkbox' name='avisar' style='display:inline;width:auto;margin:0 6px 0 0'>Si ya pagó: mandarle el comprobante por correo</label>
      </div>
      <p style='margin:8px 0 0;font-size:1.2rem;opacity:.7'>Con "Mandar link de pago" el horario queda guardado 24 horas (o hasta la clase) y te damos el link para mandarlo por WhatsApp. Si no paga, se libera solo. Si dejas vacíos el total y el pago, se usa la tabla (${clp(a.precios && a.precios[2])} para 2 personas; grupos de más de 5: ${clp(a.pagos && a.pagos.grupo)} por instructor).</p>
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
      <div class='es-ley'><span><i style='background:#effaf3;border:1.5px solid #bfe0cc'></i>Disponible</span><span><i style='background:#fff;border:1.5px solid #ddd'></i>No disponible</span><span><i style='background:#0f6e74'></i>Clase reservada</span><span><i style='background:#F3F1EC;border:1.5px solid #e3e0da'></i>Academia Anual u otra cosa</span></div>
      <div class='es-wk'><button data-wk='-7'${calDesde <= E.hoy ? ' disabled style="opacity:.3"' : ''}>‹ Antes</button><b style='font-size:1.35rem'>${fcorta(calDesde)} – ${fcorta(sumar(calDesde, 6))}</b><button data-wk='7'>Después ›</button></div><div class='es-cal'>`;
    for (let k = 0; k < 7; k++) {
      const f = sumar(calDesde, k), diaEx = E.excepciones.find(e => e.instructor === inst && e.fecha === f && e.hora === '');
      const libres = E.horarios.filter(x => dispo(inst, f, x)).length;
      h += `<div class='es-cd'><div class='es-cdh'><span>${esc(fcorta(f))}</span>${libres ? `<button data-dia='${f}' data-libre='0'>No puedo este día</button>` : `<button data-dia='${f}' data-libre='${diaEx ? 'x' : '1'}'>${diaEx ? 'Volver a mi semana tipo' : 'Puedo todo el día'}</button>`}</div><div class='es-slots'>`;
      E.horarios.forEach(x => {
        const r = reservaEn(inst, f, x), ok = dispo(inst, f, x);
        if (r) h += r.hora === x ? `<span class='es-s res'>${x}<small>${esc(r.nombre.split(' ')[0])} · ${r.personas}p</small></span>` : `<span class='es-s res' style='opacity:.55'>${x}<small>sigue clase ${esc(r.hora)}</small></span>`;
        else if (otraCosa(inst, f, x)) h += `<span class='es-s pas' style='background:#F3F1EC;border-color:#e3e0da;color:#6b6a67'>${x}<small>${esc(otraCosa(inst, f, x).replace('Academia Anual · ', 'Anual '))}</small></span>`;
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

  // ---------- vista del día: una columna por instructor (como AgendaPro) ----------
  const D_INI = 7 * 60, D_FIN = 20 * 60, D_ROW = 26; // cada 30 min = 26 px
  function diaVista(admin) {
    if (!diaVer) diaVer = E.hoy;
    const f = diaVer, activos = E.instructores.filter(i => i.activo).map(i => i.nombre).filter(n => admin || n === E.yo);
    const top = m => (m - D_INI) / 30 * D_ROW, alto = min => min / 30 * D_ROW;
    let h = `<div class='es-wk' style='margin:6px 0 10px'><button data-dv='-1'>‹</button><b style='font-size:1.45rem'>${f === E.hoy ? 'Hoy · ' : f === sumar(E.hoy, 1) ? 'Mañana · ' : ''}${esc(flarga(f))}</b><button data-dv='1'>›</button></div>`;
    if (f !== E.hoy) h += `<p style='text-align:center;margin:-4px 0 10px'><button class='pn-link' data-dv='hoy'>Volver a hoy</button></p>`;
    h += `<div class='es-dia-wrap'><div class='es-dia' style='grid-template-columns:44px repeat(${activos.length}, minmax(80px, 1fr))'>`;
    // cabecera
    h += `<div></div>` + activos.map(n => {
      const nRes = E.reservas.filter(r => r.fecha === f && r.instructores.includes(n)).length;
      const libre = E.horarios.some(x => dispo(n, f, x) && !otraCosa(n, f, x) && !reservaEn(n, f, x));
      return `<div class='es-dh'><span class='es-av'>${esc(n.slice(0, 2).toUpperCase())}</span><b>${esc(n)}</b><small>${nRes ? nRes + ' clase' + (nRes === 1 ? '' : 's') : ''}${nRes && libre ? ' · ' : ''}${libre ? '<i style="color:#2f7a4d;font-style:normal">disponible</i>' : nRes ? '' : 'no disponible'}</small></div>`; }).join('');
    // columna de horas
    let horas = `<div class='es-dcol es-dhoras' style='height:${top(D_FIN)}px'>`;
    for (let m = D_INI; m < D_FIN; m += 60) horas += `<span style='top:${top(m)}px'>${deMin(m)}</span>`;
    h += horas + `</div>`;
    activos.forEach(n => {
      // tramos disponibles = bloques de la web que marcó como disponible
      const cubre = []; E.horarios.forEach(x => { if (dispo(n, f, x)) cubre.push([aMin(x), aMin(x) + E.duracion]); });
      let col = `<div class='es-dcol' style='height:${top(D_FIN)}px'>`;
      for (let m = D_INI; m < D_FIN; m += 30) {
        const ok = cubre.some(([a, b]) => m >= a && m < b);
        col += `<button class='es-dc${ok ? '' : ' no'}' style='top:${top(m)}px;height:${D_ROW}px' ${admin ? `data-dn='${esc(n)}' data-dh='${deMin(m)}'` : 'disabled'} aria-label='${esc(n)} ${deMin(m)}'></button>`;
      }
      (E.ocupaciones || []).filter(o => (o.instructor === '*' || o.instructor === n) && (o.fecha ? o.fecha === f : o.dia === dsem(f))).forEach(o => {
        const a = Math.max(D_INI, aMin(o.desde)), b = Math.min(D_FIN, aMin(o.hasta)); if (b <= a) return;
        col += `<div class='es-db otra' style='top:${top(a)}px;height:${alto(b - a) - 2}px'><b>${esc(o.motivo || 'Ocupado')}</b><small>${esc(o.desde)} - ${esc(o.hasta)}</small></div>`;
      });
      E.reservas.filter(r => r.fecha === f && r.instructores.includes(n)).forEach(r => {
        const a = aMin(r.hora);
        col += `<button class='es-db${r.estado === 'pendiente' ? ' pend' : ''}' data-dr='${esc(r.ref)}' style='top:${top(a)}px;height:${alto(E.duracion) - 2}px'><b>${esc(r.nombre)}</b><small>${r.personas} persona${r.personas === 1 ? '' : 's'}${r.menores ? ' · ' + r.menores + ' <7' : ''}</small><small>${esc(r.hora)} - ${esc(fin(r.hora))}${r.estado === 'pendiente' ? ' · esperando pago' : ''}</small></button>`;
      });
      if (f === E.hoy) { const ahora = new Date(), m = ahora.getHours() * 60 + ahora.getMinutes(); if (m > D_INI && m < D_FIN) col += `<div class='es-ahora' style='top:${top(m)}px'></div>`; }
      h += col + `</div>`;
    });
    h += `</div></div>`;
    h += `<div class='es-ley' style='margin-top:10px'><span><i style='background:#0f6e74'></i>Clase</span><span><i style='background:#fff;border:1.5px solid #ddd'></i>Disponible</span><span><i style='background:#ECEAE6'></i>No disponible</span><span><i style='background:#F3F1EC;border:1.5px dashed #c9c5bd'></i>Academia Anual u otra cosa</span></div>`;
    if (admin) h += `<p class='pn-note'>Toca un espacio libre para anotar una clase a mano con ese instructor y esa hora. Toca una clase para verla en Reservas.</p>`;
    return h;
  }

  // ---------- pago semanal (lunes a domingo; Isidora transfiere los domingos) ----------
  let PS = null, psLunes = '', psCargando = false, psAbierto = '';
  async function cargarPagos(extra) {
    psCargando = true; if (!extra) pintar();
    try { PS = await post(Object.assign({ accion: 'pagos-semana', lunes: psLunes }, extra || {})); psLunes = PS.lunes; }
    catch (x) { PS = { error: x.message }; }
    psCargando = false; pintar();
  }
  function pagosVista(admin) {
    if (!PS && !psCargando) { setTimeout(() => cargarPagos(), 0); return `<div class='pn-card'><p class='pn-empty'>Cargando…</p></div>`; }
    if (psCargando && !PS) return `<div class='pn-card'><p class='pn-empty'>Cargando…</p></div>`;
    if (PS.error) return `<div class='pn-card'><p class='es-err'>${esc(PS.error)}</p><button class='es-btn' data-psr>Intentar de nuevo</button></div>`;
    const esEsta = PS.hoy >= PS.lunes && PS.hoy <= PS.domingo;
    let h = `<div class='es-wk' style='margin:6px 0 10px'><button data-psw='-7'>‹ Antes</button><b style='font-size:1.35rem'>${esEsta ? 'Esta semana · ' : ''}${esc(fcorta(PS.lunes))} – ${esc(fcorta(PS.domingo))}</b><button data-psw='7'>Después ›</button></div>`;
    if (admin) {
      const pend = PS.instructores.filter(x => !x.pagado).reduce((t, x) => t + x.total, 0);
      h += `<div class='pn-stats'><div class='pn-stat pn-stat--main' style='background:#0f6e74'><small>Total a transferir el domingo</small><b>${clp(PS.total)}</b><em>${pend && pend !== PS.total ? 'falta pagar ' + clp(pend) : pend ? 'clases particulares de la semana' : PS.total ? 'todo pagado ✓' : 'sin clases esta semana'}</em></div></div>`;
    }
    if (!PS.instructores.length) return h + `<div class='pn-card'><p class='pn-empty'>No hay clases pagadas esta semana.</p></div>`;
    h += PS.instructores.map(x => `<div class='pn-card'><div style='display:flex;justify-content:space-between;align-items:center;gap:10px'>
        <div><b style='font-size:1.6rem'>${esc(x.instructor)}</b><br><small style='opacity:.7'>${x.clases.length} clase${x.clases.length === 1 ? '' : 's'}${x.pagado ? ' · ✓ pagado el ' + esc(fcorta(x.pagado.el)) : ''}</small></div>
        <b style='font-size:2rem${x.pagado ? ';color:#2f7a4d' : ''}'>${clp(x.total)}</b></div>
        ${psAbierto === x.instructor ? `<div style='margin-top:8px'>${x.clases.map(c => `<div style='display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px solid var(--line);font-size:1.3rem'><span>${esc(fcorta(c.fecha))} ${esc(c.hora)} · ${esc(c.cliente)} · ${c.personas}p${c.menores ? ' (' + c.menores + ' menor' + (c.menores === 1 ? '' : 'es') + ' de 7)' : ''}</span><b>${clp(c.monto)}</b></div>`).join('')}</div>` : ''}
        <div class='es-acc'><button class='es-btn sec' data-psa='${esc(x.instructor)}'>${psAbierto === x.instructor ? 'Ocultar clases' : 'Ver clases'}</button>${admin ? (x.pagado ? `<button class='pn-link' data-psp='${esc(x.instructor)}' data-pm='${x.total}' data-pv='0'>Desmarcar pagado</button>` : x.total ? `<button class='es-btn' data-psp='${esc(x.instructor)}' data-pm='${x.total}' data-pv='1'>Marcar pagado</button>` : '') : ''}</div></div>`).join('');
    return h + `<p class='pn-note'>Cuenta las clases pagadas de lunes a domingo. Cada instructor gana según su tarifa (en Ajustes) y el tamaño de su grupo.</p>`;
  }

  function ajustes() {
    const a = E.ajustes;
    let h = `<div class='pn-card'><h3>Precios y pago a instructores</h3><p class='pn-sub'>Lo que paga el cliente y lo que se le paga al instructor por clase.</p>
      <table class='es-tab'><tr><th>Personas</th><th>Precio</th><th>Pago instructor</th></tr>${[1, 2, 3, 4, 5].map(n => `<tr><td><b>${n}</b></td><td><input data-pr='${n}' value='${a.precios[n] || ''}' inputmode='numeric'></td><td><input data-pa='${n}' value='${a.pagos[n] || ''}' inputmode='numeric'></td></tr>`).join('')}
      <tr><td colspan='2'>Grupo grande o empresa (por instructor)</td><td><input data-pa='grupo' value='${a.pagos.grupo || ''}' inputmode='numeric'></td></tr></table>
      <p style='margin:8px 0 0;font-size:1.2rem;opacity:.7'>Menores de 7: 1 instructor por cada 2. Niños de 7 a 11: máximo 3 por instructor. Desde 12, adulto (hasta 5 por instructor): el pago se calcula por instructor según cuántos le tocan.</p>
      <div class='es-acc'><button class='es-btn' data-aj='precios'>Guardar precios</button></div><p class='es-err vivo'></p></div>`;
    h += `<div class='pn-card'><h3>Horarios y reglas</h3>
      <div class='es-f' style='margin-top:10px'><label class='w'>Horas de inicio de clase (separadas por coma)<input id='es-hor' value='${esc(a.horarios.join(', '))}'></label>
      <label>Anticipación mínima (horas)<input id='es-min' type='number' min='0' value='${a.minHoras}'></label>
      <label>Clases seguidas por instructor (máximo)<input id='es-seg' type='number' min='1' value='${a.maxSeguidas || 2}'></label>
      <label>Se puede reservar hasta (días adelante)<input id='es-dias' type='number' min='1' value='${a.diasAdelante}'></label>
      <label>Las clases antes de las…<input id='es-tarde' value='${esc(a.horaTarde)}'></label>
      <label>…se reservan hasta las (día anterior)<input id='es-noche' value='${esc(a.cierreNoche)}'></label>
      <label class='w'>Lugar (sale en el comprobante)<input id='es-lugar' value='${esc(a.lugar)}'></label></div>
      <p style='margin:8px 0 0;font-size:1.2rem;opacity:.7'>Los horarios van seguidos cada 1:30 para que el instructor haga sus clases una tras otra. La app le da la clase nueva al instructor que ya tiene una justo antes o después (hasta el máximo de seguidas). Así nadie reserva de noche para la mañana siguiente. Para la tarde se puede reservar el mismo día, con la anticipación mínima.</p>
      <div class='es-acc'><button class='es-btn' data-aj='reglas'>Guardar</button></div><p class='es-err vivo'></p></div>`;
    h += `<div class='pn-card'><h3>Instructores de la Escuela</h3><p class='pn-sub'>Con su correo pueden entrar a Agenda Storm y ver su calendario. Inactivo = no recibe clases nuevas (por ejemplo, fuera de temporada).</p>
      ${E.instructores.map(i => `<div class='es-insrow'><b>${esc(i.nombre)}</b><input data-ic='${esc(i.nombre)}' type='email' placeholder='correo' value='${esc(i.correo || '')}'>
        <label class='es-sw'><input type='checkbox' data-ia='${esc(i.nombre)}'${i.activo ? ' checked' : ''}>Activo</label>
        <span></span><input data-ir='${esc(i.nombre)}' placeholder='RUT (sale en la ficha)' value='${esc(i.rut || '')}'><span></span>
        <div style='grid-column:1/-1;font-size:1.2rem'><span style='opacity:.7'>Pago propio por clase (vacío = tabla general):</span>
          <div style='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 6px;margin-top:4px'>${['1', '2', '3', '4', '5', 'grupo'].map(k => `<label style='font-size:1.1rem;min-width:0;display:block'>${k === 'grupo' ? 'Grupo' : k + 'p'}<input data-it='${esc(i.nombre)}' data-k='${k}' inputmode='numeric' placeholder='${esc(String((E.ajustes.pagos || {})[k] || ''))}' value='${esc(String((i.tarifas || {})[k] || ''))}' style='padding:6px 8px;width:100%;min-width:0;box-sizing:border-box'></label>`).join('')}</div></div></div>`).join('')}
      <div class='es-insrow'><input id='es-nn' placeholder='Nombre nuevo'><input id='es-nc' type='email' placeholder='correo'><span></span></div>
      <div class='es-acc'><button class='es-btn' data-aj='instructores'>Guardar instructores</button></div><p class='es-err vivo'></p></div>`;
    const sy = E.anualSync;
    h += `<div class='pn-card'><h3>Horas que los instructores ya tienen ocupadas</h3>
      <p class='pn-sub'>A esas horas no se les asigna clase particular.</p>
      <div class='es-cd'><div class='es-cdh'><span>Academia Anual (todos)</span><button data-sync>Actualizar ahora</button></div>
        <p style='margin:4px 0 0;font-size:1.25rem;opacity:.7'>Se lee sola del calendario Storm cada hora (las clases canceladas no bloquean). ${sy && sy.cuando ? 'Última vez: ' + esc(sy.cuando) + ' · ' + sy.clases + ' clases.' : 'Todavía no se ha leído.'}</p></div>
      ${(E.ocupaciones || []).filter(o => o.origen === 'fijo').map(o => `<div class='es-cd'><div class='es-cdh'><span>${esc(o.instructor === '*' ? 'Todos' : o.instructor)} · ${DIAS[o.dia]} ${esc(o.desde)} a ${esc(o.hasta)}</span><button data-fdel='${o.id}'>Quitar</button></div><p style='margin:2px 0 0;font-size:1.25rem;opacity:.7'>${esc(o.motivo)} · cada semana</p></div>`).join('')}
      <div class='es-f' style='margin-top:10px'>
        <label>Instructor<select id='es-fi'>${E.instructores.map(i => `<option>${esc(i.nombre)}</option>`).join('')}<option value='*'>Todos</option></select></label>
        <label>Día<select id='es-fd'>${[1, 2, 3, 4, 5, 6, 0].map(d => `<option value='${d}'>${DIAS[d]}</option>`).join('')}</select></label>
        <label>Desde<input id='es-fdes' placeholder='09:00'></label><label>Hasta<input id='es-fhas' placeholder='11:00'></label>
        <label class='w'>Qué es<input id='es-fmot' placeholder='Taller municipal'></label></div>
      <div class='es-acc'><button class='es-btn' data-fadd>Agregar</button></div><p class='es-err vivo'></p></div>`;
    h += `<div class='pn-card'><h3>Administradores</h3><p class='pn-sub'>Ven todo, cambian instructores, precios y ajustes.</p>
      <div class='es-f' style='margin-top:10px'><label class='w'>Correos (separados por coma)<input id='es-adm' value='${esc((a.admins || []).join(', '))}'></label></div>
      <div class='es-acc'><button class='es-btn' data-aj='admins'>Guardar</button></div><p class='es-err vivo'></p></div>`;
    return h;
  }

  function bind(admin) {
    const $$ = s => pane.querySelectorAll(s), $ = s => pane.querySelector(s);
    $$('[data-fi]').forEach(b => b.onclick = () => { filtroIns = b.dataset.fi; pintar(); });
    $$('[data-pasadas]').forEach(b => b.onclick = () => { verPasadas = !verPasadas; pintar(); });
    $$('[data-lnx]').forEach(b => b.onclick = () => { linkNuevo = null; pintar(); });
    $$('[data-lf]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.lf); b.textContent = '¡Copiado!'; } catch (_) { prompt('Copia el link:', b.dataset.lf); } });
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
    $$('[data-mi]').forEach(b => b.onclick = () => { b.classList.toggle('on'); const card = b.closest('.pn-card'), n = card.querySelectorAll('[data-mi].on').length, ni = card.querySelector('[name=nInstructores]'); if (ni && n > +ni.value) ni.value = n; });
    const nomIn = $('[name=nombre][list=es-clientes]');
    if (nomIn) nomIn.onchange = () => { const c = (E.clientes || []).find(x => x.nombre.toLowerCase() === nomIn.value.trim().toLowerCase()); if (!c) return; const f = nomIn.closest('.pn-card'); const t = f.querySelector('[name=telefono]'), m = f.querySelector('[name=correo]'); if (t && !t.value) t.value = c.telefono; if (m && !m.value) m.value = c.correo; };
    $$('[data-dv]').forEach(b => b.onclick = () => { diaVer = b.dataset.dv === 'hoy' ? E.hoy : sumar(diaVer, +b.dataset.dv); pintar(); });
    $$('[data-dr]').forEach(b => b.onclick = () => { const r = E.reservas.find(x => x.ref === b.dataset.dr); sub = 'reservas'; verPasadas = r && r.fecha < E.hoy; filtroIns = ''; pintar(); const el = pane.querySelector(`[data-abre='${CSS.escape(b.dataset.dr)}']`); if (el) el.closest('.es-r').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $$('[data-dn]').forEach(b => b.onclick = () => { if (b.classList.contains('no') && !confirm(b.dataset.dn + ' no marcó disponible a esa hora. ¿Anotar igual?')) return; manualPre = { fecha: diaVer, hora: b.dataset.dh, ins: b.dataset.dn }; sub = 'reservas'; manualOn = true; pintar(); });
    if (manualPre) { const c = pane.querySelector('.pn-card:has([data-manual-go])'); if (c) { c.querySelector('[name=fecha]').value = manualPre.fecha; c.querySelector('[name=hora]').value = manualPre.hora; const ch = c.querySelector(`[data-mi="${CSS.escape(manualPre.ins)}"]`); if (ch) ch.classList.add('on'); c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } manualPre = null; }
    $$('[data-psw]').forEach(b => b.onclick = () => { psLunes = sumar(PS.lunes, +b.dataset.psw); psAbierto = ''; cargarPagos(); });
    $$('[data-psa]').forEach(b => b.onclick = () => { psAbierto = psAbierto === b.dataset.psa ? '' : b.dataset.psa; pintar(); });
    $$('[data-psr]').forEach(b => b.onclick = () => { PS = null; cargarPagos(); });
    $$('[data-psp]').forEach(b => b.onclick = () => { b.disabled = true; b.textContent = 'Guardando…'; cargarPagos({ marcar: { instructor: b.dataset.psp, monto: +b.dataset.pm, pagado: b.dataset.pv === '1' } }); });
    const mg = $('[data-manual-go]');
    if (mg) mg.onclick = () => {
      const c = mg.closest('.pn-card'), v = {}; c.querySelectorAll('[name]').forEach(i => v[i.name] = i.type === 'checkbox' ? i.checked : i.value.trim());
      const elegidos = [...c.querySelectorAll('[data-mi].on')].map(b => b.dataset.mi);
      const body = Object.assign({ accion: 'manual' }, v, { instructores: elegidos });
      accion(body, mg).then(ok => { if (ok) { manualOn = false; msg = E.nuevoLink ? '' : 'Reserva de ' + v.nombre + ' guardada.'; linkNuevo = E.nuevoLink || null; pintar(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
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
    $$('[data-sync]').forEach(b => b.onclick = () => accion({ accion: 'sincronizar' }, b).then(ok => { if (ok) { msg = 'Academia Anual actualizada.'; pintar(); } }));
    $$('[data-fdel]').forEach(b => b.onclick = () => accion({ accion: 'fijo', borrar: b.dataset.fdel }, b));
    $$('[data-fadd]').forEach(b => b.onclick = () => accion({ accion: 'fijo', instructor: $('#es-fi').value, dia: $('#es-fd').value, desde: $('#es-fdes').value, hasta: $('#es-fhas').value, motivo: $('#es-fmot').value }, b).then(ok => { if (ok) { msg = 'Guardado.'; pintar(); } }));
    $$('[data-aj]').forEach(b => b.onclick = async () => {
      const t = b.dataset.aj;
      if (t === 'precios') {
        const precios = {}, pagos = {}; $$('[data-pr]').forEach(i => precios[i.dataset.pr] = i.value); $$('[data-pa]').forEach(i => pagos[i.dataset.pa] = i.value);
        if (await accion({ accion: 'ajustes', precios, pagos }, b)) { msg = 'Precios guardados. La página para reservar ya muestra los nuevos.'; pintar(); }
      }
      if (t === 'reglas' && await accion({ accion: 'ajustes', horarios: $('#es-hor').value.split(/[,\s]+/).filter(Boolean), minHoras: $('#es-min').value, maxSeguidas: $('#es-seg').value, diasAdelante: $('#es-dias').value, horaTarde: $('#es-tarde').value, cierreNoche: $('#es-noche').value, lugar: $('#es-lugar').value }, b)) { msg = 'Horarios y reglas guardados.'; pintar(); }
      if (t === 'admins' && await accion({ accion: 'ajustes', admins: $('#es-adm').value.split(/[,\s]+/).filter(Boolean) }, b)) { msg = 'Administradores guardados.'; pintar(); }
      if (t === 'instructores') {
        b.disabled = true; b.textContent = 'Guardando…';
        try {
          for (const i of E.instructores) {
            const c = pane.querySelector(`[data-ic="${CSS.escape(i.nombre)}"]`).value.trim(), a = pane.querySelector(`[data-ia="${CSS.escape(i.nombre)}"]`).checked, rt = pane.querySelector(`[data-ir="${CSS.escape(i.nombre)}"]`).value.trim();
            const tar = {}; pane.querySelectorAll(`[data-it="${CSS.escape(i.nombre)}"]`).forEach(x => { const v = x.value.replace(/\D/g, ''); if (v) tar[x.dataset.k] = +v; });
            const cambiaTar = JSON.stringify(tar) !== JSON.stringify(Object.fromEntries(Object.entries(i.tarifas || {}).map(([k, v]) => [k, +v])));
            if (c !== (i.correo || '') || a !== i.activo || rt !== (i.rut || '') || cambiaTar) E = await post({ accion: 'instructor', nombre: i.nombre, correo: c, telefono: i.telefono || '', rut: rt, activo: a, tarifas: tar });
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
