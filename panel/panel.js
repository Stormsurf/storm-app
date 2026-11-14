(()=>{
  const API = "https://script.google.com/macros/s/AKfycbyFZiJBhEoWR3-mekjXfea3O0BbDItazLHQRUkCpWOUZOwJ4612kgiGsg4ocWpGBgO3/exec";
  // Academia de Verano: URL /exec del programa de la planilla de Verano (vacío = no se muestra la pestaña).
  const API_VERANO = "https://script.google.com/macros/s/AKfycbzSHDu8whWWNwq-EFwaWqwKOtyU5pnyPuixutUI8sd5twFaTjDibN11TA3bMH_UddTo/exec";
  const LOGO = "/img/academia-anual-logo.png";
  const KEY = 'storm-panel';
  let app = document.getElementById('pn-app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL');
  const guardar = s => { try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(_){} };
  const leer = () => { try{ return JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(_){ return null; } };
  const borrar = () => { try{ localStorage.removeItem(KEY); localStorage.removeItem(KEY+'-datos'); }catch(_){} };
  // Datos de la última visita: se muestran al tiro mientras llega lo nuevo de la planilla.
  const cacheLeer = k => { try{ const c = JSON.parse(localStorage.getItem(KEY+'-datos') || 'null'); return c && auth && c.email === auth.email ? c[k] || null : null; }catch(_){ return null; } };
  const cacheGuardar = (k, v) => { try{ const c = JSON.parse(localStorage.getItem(KEY+'-datos') || 'null'); const n = c && auth && c.email === auth.email ? c : {email: auth.email}; n[k] = v; localStorage.setItem(KEY+'-datos', JSON.stringify(n)); }catch(_){} };
  const guardarAnual = d => { cacheGuardar('anual', d); try{ localStorage.setItem(KEY+'-anual-ms', String(Date.now())); }catch(_){} };
  const escribiendo = el => { const a = document.activeElement; return !!(a && el && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
  const wa = t => { let n = String(t || '').replace(/\D/g, ''); if(n.length === 9 && n[0] === '9') n = '56' + n; if(n.length === 8) n = '569' + n; return n.length >= 10 ? n : ''; };
  const dm = f => { const m = String(f||'').match(/(\d{4})-(\d{2})-(\d{2})/) || String(f||'').match(/(\d{2})-(\d{2})-(\d{4})/); if(!m) return f; return m[1].length===4 ? 'pagó el ' + (+m[3]) + '/' + (+m[2]) : 'pagó el ' + (+m[1]) + '/' + (+m[2]); };
  const q0 = new URLSearchParams(location.search);
  let auth = (q0.get('e') && q0.get('ts') && q0.get('f')) ? {email:q0.get('e'), ts:q0.get('ts'), firma:q0.get('f')} : leer(), tab = 'clases';
  if(q0.get('e')){ guardar(auth); history.replaceState(null, '', location.pathname); }
  try{ tab = sessionStorage.getItem(KEY + '-tab') || 'clases'; }catch(_){}

  async function post(body){
    if(!API) throw new Error('El panel aún no está conectado.');
    const r = await fetch(API, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(body)});
    const d = await r.json();
    if(!d.ok) throw new Error(d.error || 'Error');
    return d;
  }

  function login(email, err, paso){
    app.innerHTML = `<div class='pn-login'>
      <img src='${esc(LOGO)}' alt='Storm' style='width:200px;height:auto;display:block;margin:0 auto 10px'>
      <h1 style='margin:0 0 14px;font-family:var(--font-heading-family);font-weight:500;font-size:2.6rem'>Panel Storm</h1>
      ${paso==='codigo'
        ? `<p>Te enviamos un código a <b>${esc(email)}</b>.</p>
           <input class='pn-in pn-in--code' id='pn-code' inputmode='numeric' autocomplete='one-time-code' maxlength='6' placeholder='······'>
           <button class='pn-go' id='pn-ok'>Entrar</button>
           <p class='pn-note'><button class='pn-link' id='pn-back'>Usar otro correo</button></p>`
        : `<p>Solo para el equipo Storm. Entra con tu correo y te mandamos un código.</p>
           <input class='pn-in' id='pn-email' type='email' autocomplete='email' placeholder='tu@correo.cl' value='${esc(email||'')}'>
           <button class='pn-go' id='pn-ok'>Recibir código</button>`}
      ${err ? `<div class='pn-msg'>${esc(err)}</div>` : ''}
    </div>`;
    const ok = document.getElementById('pn-ok');
    const input = document.getElementById(paso==='codigo' ? 'pn-code' : 'pn-email');
    input.focus();
    input.addEventListener('keydown', e => { if(e.key==='Enter') ok.click(); });
    if(paso==='codigo'){
      document.getElementById('pn-back').onclick = () => login(email);
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g,''); if(input.value.length===6) ok.click(); });
      ok.onclick = async () => {
        ok.disabled = true; ok.textContent = 'Entrando…';
        try{ const s = await post({accion:'entrar', email, codigo:input.value}); auth = {email:s.email, ts:s.ts, firma:s.firma}; guardar(auth); load(); }
        catch(x){ login(email, x.message, 'codigo'); }
      };
    } else {
      ok.onclick = async () => {
        const e = input.value.trim().toLowerCase();
        if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return login(e, 'Revisa el correo.');
        ok.disabled = true; ok.textContent = 'Enviando…';
        try{ await post({accion:'pedir-codigo', email:e}); login(e, '', 'codigo'); }
        catch(x){ login(e, x.message); }
      };
    }
  }

  function mensajeGrupo(c){
    const cuando = c.cuando === 'Hoy' ? 'hoy ' : c.cuando === 'Mañana' ? 'mañana ' : 'el ';
    const dia = (c.texto || '').replace(/^./, x => x.toLowerCase());
    const tipo = /skate/i.test(c.clase) ? 'surfskate' : 'surf';
    if(c.cancelada) return `¡Hola familias Storm! 🌊 Les avisamos que la clase de ${tipo} de ${cuando}${dia} se suspende${c.nota ? ' (' + c.nota + ')' : ''}. ¡Gracias por su comprensión!`;
    return `¡Hola familias Storm! 🌊 Les recordamos que ${cuando}${dia} hay clase de ${tipo} de ${String(c.horario).replace(/\s*hrs?\.?$/i,'')} hrs. ¡Nos vemos en el agua! 🏄`;
  }
  function msgBtns(c, i){
    const t = mensajeGrupo(c);
    return `<div class='pn-msgs'><a class='pn-wa' target='_blank' rel='noopener' href='https://wa.me/?text=${encodeURIComponent(t)}'>Mensaje para el grupo</a><button class='pn-link' data-copy='${i}'>Copiar</button></div>`;
  }

  function claseCard(c){
    if(c.cancelada) return `<div class='pn-card pn-cancel'><span class='pn-when'>${esc(c.cuando)}</span><h3>${esc(c.clase)} · ${esc(c.horario)}<span class='pn-count'>Cancelada</span></h3><p class='pn-sub'>${esc(c.texto)}${c.nota?' · '+esc(c.nota):''}</p></div>`;
    const grupos = {};
    c.alumnos.forEach(a => (grupos[a.grupo || 'Sin grupo'] = grupos[a.grupo || 'Sin grupo'] || []).push(a));
    const pct = c.cupos ? Math.min(100, Math.round(c.van / c.cupos * 100)) : 0;
    return `<div class='pn-card'><span class='pn-when'>${esc(c.cuando)}</span>
      <h3>${esc(c.clase)} · ${esc(c.horario)}<span class='pn-count'>${c.van} de ${c.cupos}</span></h3>
      <p class='pn-sub'>${esc(c.texto)}${c.nota?' · '+esc(c.nota):''}</p>
      <div class='pn-bar'><span style='width:${pct}%'></span></div>
      ${c.alumnos.length ? Object.keys(grupos).sort(primeroMio()).map(g => `<div class='pn-grp'>${grpHead(g, grupos[g].length, ACARGO)}<div class='pn-chips'>${grupos[g].map(a => `<span class='pn-chip${a.movido?' pn-chip--in':''}'>${a.movido?'↪ ':''}${esc(a.nombre)}</span>`).join('')}</div></div>`).join('')
        : `<p class='pn-empty'>Todavía no hay alumnos en esta clase.</p>`}
      ${c.salen.length ? `<p class='pn-sub' style='margin-top:10px'>Se cambiaron a otro día: ${c.salen.map(x => esc(typeof x === 'string' ? x : (x && x.nombre) || '')).join(', ')}</p>` : ''}
    </div>`;
  }

  let CL = [];
  // Orden de los grupos en todo el Panel.
  const ORDEN = ['Kids','Iniciante','Progress','Intermedio','Avanzado','Federados'];
  const rango = g => { const t = String(g||'').toLowerCase().replace('principiante','iniciante'); const i = ORDEN.findIndex(x => x.toLowerCase() === t); return i < 0 ? 99 : i; };
  const porOrden = (a, b) => rango(a) - rango(b);
  // Quién está a cargo de cada grupo (pestaña Equipo) y cuál es el grupo de quien entra: va primero.
  let ACARGO = {}, MIOS = [];
  const mio = (g, mios) => (mios || MIOS).includes(g);
  const primeroMio = mios => (a, b) => (mio(b, mios) - mio(a, mios)) || porOrden(a, b);
  const grpHead = (g, n, cargo, mios) => `<small>${esc(g)} · ${n}${mio(g, mios) ? `<span class='pn-tu'>Tu grupo</span>` : ''}</small>${cargo && cargo[g] ? `<span class='pn-cargo'>A cargo: ${esc(cargo[g])}</span>` : ''}`;

  // ---------- Lista: asistencia ----------
  let LISTA = [], LISTA_TODOS = [], EXTRAS_PEND = [], diaSel = 0, marcas = {}, agregando = false;
  function listaPane(){
    if(!LISTA.length) return `<div class='pn-card'><p class='pn-empty'>No hay clases de los últimos días para pasar lista.</p></div>`;
    if(diaSel >= LISTA.length) diaSel = 0;
    const c = LISTA[diaSel];
    if(!marcas[c.fecha]) marcas[c.fecha] = {}; const m = marcas[c.fecha];
    c.alumnos.forEach(a => { if(!(a.nombre in m)) m[a.nombre] = a.vino; });
    const van = c.alumnos.filter(a => m[a.nombre]).length;
    return `<div class='pn-days'>${LISTA.map((x,i) => `<button class='pn-day${i===diaSel?' on':''}' data-dia='${i}'><b>${esc(x.cuando)}</b>${esc(x.clase)}${x.tomada?' <i>✓</i>':''}</button>`).join('')}</div>
      <div class='pn-card'><span class='pn-when'>${esc(c.cuando === c.texto ? c.clase : c.cuando)}</span>
        <h3>${esc(c.texto)}<span class='pn-count'>${van} de ${c.alumnos.length}</span></h3>
        <p class='pn-sub'>${esc(c.clase)} · ${esc(c.horario)} · Toca a los que vinieron.</p>
        ${c.alumnos.length ? c.alumnos.map((a,i) => `<div class='pn-kid'>
          <button class='pn-tick ${m[a.nombre]===true?'si':m[a.nombre]===false?'no':''}' data-kid='${i}'><span>${m[a.nombre]===true?'✓':m[a.nombre]===false?'–':''}</span><div><b>${esc(a.nombre)}${a.extra?` <em class='pn-extra'>Extra</em>`:''}</b><small>${esc(a.grupo||'Sin grupo')}${a.extra ? (a.cobrado ? ' · ya cobrada' : ' · se suma a su próximo pago') : ''}</small></div></button></div>`).join('')
          : `<p class='pn-empty'>No había alumnos en esta clase.</p>`}
        ${agregando ? `<div class='pn-addx'><label for='pn-x-in'>¿Quién vino de extra?</label><input id='pn-x-in' list='pn-x-dl' placeholder='Nombre del alumno' autocomplete='off'><datalist id='pn-x-dl'>${LISTA_TODOS.filter(t => !c.alumnos.some(a => a.nombre === t.nombre)).map(t => `<option value='${esc(t.nombre)}'>${esc(t.grupo)}</option>`).join('')}</datalist>
          <div class='pn-addx__b'><button class='pn-go' id='pn-x-ok'>Agregar</button><button class='pn-link' id='pn-x-no'>Cancelar</button></div></div>`
          : `<button class='pn-addx__open' id='pn-x-open'>+ Agregar alumno que vino otro día</button>`}
        ${c.alumnos.length ? `<button class='pn-go pn-save' id='pn-save'>${c.tomada ? 'Actualizar asistencia' : 'Guardar asistencia'}</button>` : ''}
        <div id='pn-lista-msg'></div>
      </div>
      <p class='pn-note'>Las familias ven la asistencia en Mi clase. Si un alumno viene un día que no es el suyo, agrégalo como extra: esa clase se suma sola a su próximo pago.</p>`;
  }
  function extrasCard(){
    return `<h3>Clases extra por cobrar${EXTRAS_PEND.length ? `<span class='pn-count'>${EXTRAS_PEND.length}</span>` : ''}</h3>
      ${EXTRAS_PEND.length ? EXTRAS_PEND.map((e,i) => `<div class='pn-row pn-row--wrap'><div><b>${esc(e.alumno)}</b><small>${esc(e.clase)} · ${esc(e.texto)} · ${clp(e.monto)}</small></div><div class='pn-acts'><button class='pn-paid' data-xc='${i}'>Ya lo cobré</button></div></div>`).join('')
        + `<p class='pn-sub' style='margin-top:10px'>Se suman solas al próximo pago con Mercado Pago. Si la familia paga por transferencia, cóbralas junto con la mensualidad y aprieta "Ya lo cobré".</p>`
        : `<p class='pn-empty'>No hay clases extra pendientes. Se anotan al pasar lista.</p>`}`;
  }
  function bindExtras(){
    const box = document.getElementById('pn-xp'); if(!box) return;
    box.querySelectorAll('[data-xc]').forEach(b => b.onclick = async () => {
      const e = EXTRAS_PEND[+b.dataset.xc]; b.disabled = true; b.textContent = 'Un momento…';
      try{ const d = await post(Object.assign({}, auth, {accion:'extra-cobrado', fecha:e.fecha, alumno:e.alumno})); EXTRAS_PEND = d.extrasPend || []; box.innerHTML = extrasCard(); bindExtras(); }
      catch(x){ b.disabled = false; b.textContent = 'No se pudo, reintenta'; }
    });
  }
  function bindLista(){
    const pane = app.querySelector('[data-pane=lista]'); if(!pane) return;
    const redo = () => { pane.innerHTML = listaPane(); bindLista(); };
    pane.querySelectorAll('[data-dia]').forEach(b => b.onclick = () => { diaSel = +b.dataset.dia; redo(); });
    const c = LISTA[diaSel]; if(!c) return;
    const m = marcas[c.fecha];
    pane.querySelectorAll('[data-kid]').forEach(b => b.onclick = () => { const n = c.alumnos[+b.dataset.kid].nombre; m[n] = m[n] === true ? false : true; redo(); });
    const xo = document.getElementById('pn-x-open'); if(xo) xo.onclick = () => { agregando = true; redo(); const i = document.getElementById('pn-x-in'); if(i) i.focus(); };
    const xn = document.getElementById('pn-x-no'); if(xn) xn.onclick = () => { agregando = false; redo(); };
    const xk = document.getElementById('pn-x-ok'); if(xk) xk.onclick = () => {
      const v = document.getElementById('pn-x-in').value.trim().replace(/\s+/g, ' '); if(!v) return;
      const t = LISTA_TODOS.find(x => x.nombre.toLowerCase() === v.toLowerCase());
      const nombre = t ? t.nombre : v.replace(/(^|\s)\S/g, x => x.toUpperCase());
      if(!c.alumnos.some(a => a.nombre.toLowerCase() === nombre.toLowerCase())) c.alumnos.push({nombre, grupo: t ? t.grupo : '', vino: true, extra: true});
      m[nombre] = true; agregando = false; redo();
    };
    const sv = document.getElementById('pn-save');
    if(sv) sv.onclick = async () => {
      sv.disabled = true; sv.textContent = 'Guardando…';
      try{
        const d = await post(Object.assign({}, auth, {accion:'asistencia', fecha:c.fecha, lista:c.alumnos.map(a=>a.nombre), presentes:c.alumnos.filter(a=>m[a.nombre]).map(a=>a.nombre), extras:c.alumnos.filter(a=>a.extra).map(a=>a.nombre)}));
        LISTA = d.lista; if(d.extrasPend){ EXTRAS_PEND = d.extrasPend; const xp = document.getElementById('pn-xp'); if(xp){ xp.innerHTML = extrasCard(); bindExtras(); } } delete marcas[c.fecha]; redo();
        document.getElementById('pn-lista-msg').innerHTML = `<div class='pn-ok'>Asistencia guardada ✓</div>`;
      }catch(x){ sv.disabled = false; sv.textContent = 'No se pudo, reintenta'; }
    };
  }
  function copiar(){ app.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
    const t = mensajeGrupo(CL[+b.dataset.copy]);
    try{ await navigator.clipboard.writeText(t); b.textContent = 'Copiado ✓'; }
    catch(_){ const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); b.textContent = 'Copiado ✓'; }
    setTimeout(() => b.textContent = 'Copiar', 2000);
  }); }
  // ---------- Mensajes por grupo (v17) ----------
  let gSel = [], borrador = '', diasSel = 0;
  function mensajesPane(d){
    const gs = (d.grupos || []).slice().sort((a,b) => porOrden(a.grupo, b.grupo)), total = gs.reduce((t,g)=>t+g.alumnos,0);
    return `<div class='pn-card'><h3>Mensaje para un grupo</h3>
      <p class='pn-sub'>Las familias lo ven arriba en Mi clase y también les llega por correo.</p>
      <div class='pn-gsel'>${gs.map(g=>`<button class='pn-gbtn${gSel.includes(g.grupo)?' on':''}' data-g='${esc(g.grupo)}'>${esc(g.grupo)}<small>${g.alumnos}</small></button>`).join('')}<button class='pn-gbtn${gSel.includes('Todos')?' on':''}' data-g='Todos'>Todos<small>${total}</small></button></div>
      <textarea class='pn-ta' maxlength='600' placeholder='Ej: Hola familias del grupo Avanzado. Mañana nos juntamos 15:45 en la escuela.' data-msg-t>${esc(borrador)}</textarea>
      <div class='pn-grp'><small>¿Hasta cuándo se ve en Mi clase?</small><div class='pn-gsel' style='margin-top:0'>${[[0,'Solo hoy'],[1,'Hoy y mañana'],[7,'Una semana']].map(([n,t])=>`<button class='pn-gbtn${diasSel===n?' on':''}' data-dias='${n}'>${t}</button>`).join('')}</div></div>
      <label class='pn-chk'><input type='checkbox' data-msg-c checked> Mandar también por correo</label>
      <button class='pn-go pn-save' data-msg-go>Enviar mensaje</button><div data-msg-r></div></div>
      <div class='pn-card'><h3>Últimos mensajes</h3>${(d.mensajes||[]).length ? d.mensajes.map(m=>`<div class='pn-row pn-sent'><div><small>${esc(m.fecha)} · ${esc(m.de)} · Grupo ${esc(m.grupo)} · ${m.familias} familia${m.familias===1?'':'s'}${m.hasta?' · se ve '+(m.hasta==='solo ese día'?'solo ese día':'hasta el '+esc(m.hasta.toLowerCase())):''}</small><p>${esc(m.mensaje)}</p></div></div>`).join('') : `<p class='pn-empty'>Todavía no se han mandado mensajes.</p>`}</div>`;
  }
  function bindMensajes(d){
    const pane = app.querySelector('[data-pane=mensajes]'); if(!pane) return;
    const ta = pane.querySelector('[data-msg-t]'), go = pane.querySelector('[data-msg-go]'), res = pane.querySelector('[data-msg-r]');
    ta.oninput = () => { borrador = ta.value; };
    pane.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      const g = b.dataset.g;
      if(g === 'Todos') gSel = gSel.includes('Todos') ? [] : ['Todos'];
      else { gSel = gSel.filter(x => x !== 'Todos'); gSel = gSel.includes(g) ? gSel.filter(x => x !== g) : gSel.concat(g); }
      pane.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', gSel.includes(x.dataset.g)));
    });
    pane.querySelectorAll('[data-dias]').forEach(b => b.onclick = () => { diasSel = +b.dataset.dias; pane.querySelectorAll('[data-dias]').forEach(x => x.classList.toggle('on', +x.dataset.dias === diasSel)); });
    go.onclick = async () => {
      const t = ta.value.trim();
      if(!gSel.length){ res.innerHTML = `<div class='pn-msg'>Elige el grupo.</div>`; return; }
      if(t.length < 3){ res.innerHTML = `<div class='pn-msg'>Escribe el mensaje.</div>`; return; }
      if(!go.dataset.ok){ go.dataset.ok = 1; go.textContent = '¿Enviar a ' + gSel.join(', ') + '?'; return; }
      go.disabled = true; go.textContent = 'Enviando…';
      try{
        const r = await post(Object.assign({}, auth, {accion:'mensaje', grupos:gSel, dias:diasSel, mensaje:t, correo: pane.querySelector('[data-msg-c]').checked}));
        borrador = ''; gSel = []; diasSel = 0;
        d.mensajes = r.mensajes; d.grupos = r.grupos;
        pane.innerHTML = mensajesPane(d); bindMensajes(d);
        pane.querySelector('[data-msg-r]').innerHTML = `<div class='pn-ok'>Enviado a ${r.familias} familia${r.familias===1?'':'s'}${r.correos?' (también por correo)':''}.</div>`;
      }catch(x){ go.disabled = false; delete go.dataset.ok; go.textContent = 'Enviar mensaje'; res.innerHTML = `<div class='pn-msg'>${esc(x.message)}</div>`; }
    };
  }

  let ULT = null;
  function render(d){
    ULT = d;
    CL = []; ES_ADMIN = d.rol !== 'instructor';
    if(d.aCargo) ACARGO = d.aCargo;
    if(d.miGrupo) MIOS = d.miGrupo;
    LISTA = d.lista || []; LISTA_TODOS = d.listaTodos || []; EXTRAS_PEND = d.extrasPend || [];
    const tabs = d => `<div class='pn-tabs'><button class='pn-tab' data-tab='clases'>Clases</button><button class='pn-tab' data-tab='lista'>Lista</button><button class='pn-tab' data-tab='alumnos'>Alumnos</button><button class='pn-tab' data-tab='mensajes'>Mensajes</button>${d.rol === 'instructor' ? '' : `<button class='pn-tab' data-tab='pagos'>Pagos${d.actual.faltan.length?`<i>${d.actual.faltan.length}</i>`:''}</button><button class='pn-tab' data-tab='avisos'>Avisos${(d.sinGrupo.length + d.revisar.length)?`<i>${d.sinGrupo.length + d.revisar.length}</i>`:''}</button>`}</div>`;
    const tabsOn = () => {
      const show = t => { tab = t; try{ sessionStorage.setItem(KEY + '-tab', t); }catch(_){}
        app.querySelectorAll('.pn-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
        app.querySelectorAll('.pn-pane').forEach(p => p.hidden = p.dataset.pane !== t);
        if(t === 'alumnos'){ cargarNotas().then(pintarAlumnos); if(ES_ADMIN) cargarInformes().then(pintarAlumnos); }
         };
      app.querySelectorAll('.pn-tab').forEach(b => b.onclick = () => show(b.dataset.tab));
      app.querySelectorAll('.pn-uso-link').forEach(b => b.onclick = () => { show('avisos'); const c = document.getElementById('pn-uso'); if(c) c.scrollIntoView({behavior:'smooth', block:'start'}); });
      show(app.querySelector(`.pn-tab[data-tab='${tab}']`) ? tab : 'clases');
      ponerSelector();
      bindLista(); bindExtras(); copiar(); bindMensajes(d);
    };
    if(d.rol === 'instructor'){
      app.innerHTML = `<div class='pn-head'><div><h1>Clases Storm</h1><p>${esc(d.hoy)}</p></div><button class='pn-link' id='pn-out'>Salir</button></div>` + tabs(d) +
        `<div class='pn-pane' data-pane='clases'>` + (d.clases.length ? d.clases.map(claseCard).join('') : `<div class='pn-card'><p class='pn-empty'>No hay clases cargadas.</p></div>`) +
        `<p class='pn-note'>↪ = alumno que se cambió a esta clase.</p></div><div class='pn-pane' data-pane='lista'>${listaPane()}</div><div class='pn-pane' data-pane='alumnos'><div class='pn-skel'></div></div><div class='pn-pane' data-pane='mensajes'>${mensajesPane(d)}</div><div class='pn-verano' hidden><div class='pn-skel'></div></div>`;
      document.getElementById('pn-out').onclick = () => { borrar(); auth = null; login(); };
      tabsOn();
      return;
    }
    const A = d.actual, M = cap(A.mes.split(' ')[0]);
        const dif = d.pasado.recaudado ? A.recaudado - d.pasado.recaudado : null;
    let h = `<div class='pn-head'><div><h1>Panel Storm</h1><p>${esc(d.hoy)}</p></div><button class='pn-link' id='pn-out'>Salir</button></div>
      <div class='pn-stats'>
        <div class='pn-stat pn-stat--main'><small>Recaudado en ${esc(M)}</small><b>${clp(A.recaudado)}</b><em>${A.alumnos} alumno${A.alumnos===1?'':'s'}${dif!==null?' · '+(dif>=0?'+':'−')+clp(Math.abs(dif))+' vs '+esc(d.pasado.mes.split(' ')[0]):''}</em></div>
        <div class='pn-stat${A.faltan.length?' pn-stat--warn':''}'><small>Faltan por pagar</small><b>${A.faltan.reduce((t,f)=>t+f.alumnos.length,0)}</b><em>${A.porCobrar?'por cobrar '+clp(A.porCobrar):'alumnos'}</em></div>
        <div class='pn-stat'><small>Ya pagaron ${esc(cap(d.proximo.mes.split(' ')[0]))}</small><b>${d.proximo.alumnos}</b><em>${clp(d.proximo.recaudado)}</em></div>
      </div>
      ${tabs(d)}`;

    h += `<div class='pn-pane' data-pane='clases'>` + (d.uso && d.rol !== 'instructor' ? `<button class='pn-uso-link' data-ir='avisos'><span>📱 Mi clase: <b>${d.uso.semana} de ${d.uso.familias}</b> familias entraron esta semana</span><span>Ver ›</span></button>` : '') + (d.clases.length ? d.clases.map(claseCard).join('') : `<div class='pn-card'><p class='pn-empty'>No hay clases cargadas en el Calendario.</p></div>`) + `</div>`;

    h += `<div class='pn-pane' data-pane='lista'>${listaPane()}</div><div class='pn-pane' data-pane='alumnos'><div class='pn-skel'></div></div><div class='pn-pane' data-pane='mensajes'>${mensajesPane(d)}</div><div class='pn-verano' hidden><div class='pn-skel'></div></div>`;
    h += `<div class='pn-pane' data-pane='pagos'>
      <div class='pn-card' id='pn-xp'>${extrasCard()}</div>
      <div class='pn-card'><h3>Faltan por pagar ${esc(M)}</h3>
        ${A.faltan.length ? A.faltan.map((f,fi) => `<div class='pn-row pn-row--wrap'><div><b>${f.alumnos.map(esc).join(', ')}</b><small>${esc(f.apoderado||'')}${f.monto?' · '+clp(f.monto):''}${f.recordado?"<span class='pn-tag'>recordatorio enviado</span>":''}</small></div>
          <div class='pn-acts'>${wa(f.telefono) ? `<a class='pn-wa' target='_blank' rel='noopener' href='https://wa.me/${wa(f.telefono)}?text=${encodeURIComponent('Hola '+String(f.apoderado||'').split(' ')[0]+'! Te escribimos de Storm por la mensualidad de '+M+' de '+f.alumnos.join(' y ')+'.')}'>WhatsApp</a>` : (f.correo ? `<a class='pn-link' href='mailto:${esc(f.correo)}'>Correo</a>` : '')}
          ${f.monto ? `<button class='pn-paid' data-paid='${fi}'>Pagó ✓</button>` : ''}</div></div>`).join('')
          : `<p class='pn-empty'>Nadie tiene pagos pendientes este mes. 👌</p>`}
        ${A.faltan.some(f=>f.monto) ? `<p class='pn-sub' style='margin-top:10px'>Cuando te llegue una transferencia, aprieta "Pagó ✓" y queda anotado en la planilla.</p>` : ''}
      </div>
      <div class='pn-card'><h3>Pagaron ${esc(M)}<span class='pn-count'>${A.pagaron.length}</span></h3>
        ${A.pagaron.length ? A.pagaron.map(p => `<div class='pn-row'><div><b>${esc(p.alumno)}</b><small>Plan ${esc(p.plan)}${p.monto && p.fecha ? ' · '+esc(dm(p.fecha)) : ''}${p.grupo?' · '+esc(p.grupo):''}</small></div><span class='pn-amt'>${p.monto ? clp(p.monto) : 'Beca'}</span></div>`).join('')
          : `<p class='pn-empty'>Aún no hay pagos este mes.</p>`}
      </div>
      <p class='pn-note'>A los pagos con Mercado Pago se les descuenta una comisión de cerca de 3,4%; a las transferencias no. ${esc(cap(d.pasado.mes))}: ${clp(d.pasado.recaudado)} con ${d.pasado.alumnos} alumnos.</p>
    </div>`;

    h += `<div class='pn-finz' hidden><div class='pn-fsub'><button data-fsub='finanzas'>General</button><button data-fsub='anio'>Mi año</button><button data-fsub='gastos'>Sueldos Academia Anual</button></div><div class='pn-fpane' data-pane='finanzas'><div class='pn-skel'></div></div><div class='pn-fpane' data-pane='anio' hidden><div class='pn-skel'></div></div><div class='pn-fpane' data-pane='gastos' hidden><div class='pn-skel'></div></div></div>`;
    h += `<div class='pn-pane' data-pane='avisos'>
      ${d.uso ? (() => { const u = d.uso, de = n => `<span>de ${u.familias}</span>`;
        return `<div class='pn-card' id='pn-uso'><h3>Uso de la app</h3>
        <p class='pn-sub'>Familias de la Academia Anual de este mes con correo (${u.familias}). Se cuenta desde el ${esc(dm(u.desde).replace('pagó el ',''))}.</p>
        <div class='pn-uso'><div><small>Entraron esta semana</small><b>${u.semana} ${de()}</b></div><div><small>Entraron este mes</small><b>${u.mes} ${de()}</b></div>
          <div><small>Con la app instalada</small><b>${u.app} ${de()}</b></div><div><small>Con avisos activados</small><b>${u.avisos} ${de()}</b></div></div>
        <p class='pn-uso__h'>Recursos más vistos (últimos 30 días)</p>
        ${u.recursos.length ? u.recursos.map(r => `<div class='pn-row'><div><b>${esc(r.titulo)}</b></div><span class='pn-amt'>${r.familias} ${r.familias === 1 ? 'familia' : 'familias'}</span></div>`).join('') : `<p class='pn-empty'>Todavía nadie abre un recurso.</p>`}
        <p class='pn-uso__h'>No han entrado nunca${u.nunca.length ? ` (${u.nunca.length})` : ''}</p>
        ${u.nunca.length ? u.nunca.map(f => `<div class='pn-row pn-row--wrap'><div><b>${esc(f.apoderado || f.correo)}</b><small>${esc(f.alumnos.join(', '))}</small></div><div class='pn-acts'>${wa(f.telefono) ? `<a class='pn-wa' target='_blank' rel='noopener' href='https://wa.me/${wa(f.telefono)}?text=${encodeURIComponent('Hola '+String(f.apoderado||'').split(' ')[0]+'! Te comparto Mi clase de Storm, donde ves las clases de '+f.alumnos.join(' y ')+', los avisos y recursos para la familia: https://app.stormsurf.cl · Entras con el correo que usaste al pagar y te llega un código.')}'>WhatsApp</a>` : ''}</div></div>`).join('') : `<p class='pn-empty'>Todas las familias ya entraron. 👌</p>`}
        ${u.sinCorreo ? `<p class='pn-sub' style='margin-top:10px'>${u.sinCorreo} ${u.sinCorreo === 1 ? 'alumno no tiene' : 'alumnos no tienen'} correo en la planilla, así que no se pueden contar.</p>` : ''}
        ${u.otras ? `<p class='pn-sub' style='margin-top:6px'>Además, ${u.otras} ${u.otras === 1 ? 'familia' : 'familias'} de otras academias (Verano) entraron esta semana.</p>` : ''}
      </div>`; })() : ''}
      ${d.revisar.length ? `<div class='pn-card'><h3>Pagos para revisar<span class='pn-count'>${d.revisar.length}</span></h3><p class='pn-sub'>Revísalos en la pestaña Pagos de la planilla: ${d.revisar.map(esc).join(', ')}</p></div>` : ''}
      <div class='pn-card'><h3>Alumnos sin grupo${d.sinGrupo.length?`<span class='pn-count'>${d.sinGrupo.length}</span>`:''}</h3>
        ${d.sinGrupo.length ? `<div class='pn-chips' style='margin-top:10px'>${d.sinGrupo.map(n=>`<span class='pn-chip'>${esc(n)}</span>`).join('')}</div><p class='pn-sub' style='margin-top:10px'>Anótalos en la pestaña Alumnos de la planilla (columna amarilla).</p>` : `<p class='pn-empty'>Todos tienen grupo. 👌</p>`}
      </div>
      <div class='pn-card'><h3>Encuesta a las familias${d.encuesta?`<span class='pn-count'>${d.encuesta.respuestas}</span>`:''}</h3>
        ${d.encuesta ? `<p class='pn-sub'>${esc(cap(d.encuesta.mes))}: promedio <b>${String(d.encuesta.promedio).replace('.',',')}</b> de 5 <span class='pn-stars'>${'★'.repeat(Math.round(d.encuesta.promedio))}</span></p>
          ${d.encuesta.comentarios.map(c => `<div class='pn-row'><div><b>${esc(c.alumno)} <span class='pn-stars'>${'★'.repeat(c.nota)}</span></b><small>“${esc(c.comentario)}”</small></div></div>`).join('')}`
          : `<p class='pn-empty'>Las familias responden en Mi clase entre el 24 y el 7 de cada mes. Aquí verás el promedio y los comentarios.</p>`}
      </div>
      <div class='pn-card'><h3>Últimos cambios de clase</h3>
        ${d.cambios.length ? d.cambios.map(c => `<div class='pn-row'><div><b>${esc(c.alumno)}</b><small>${esc(c.desde)} → ${esc(c.hacia)}</small></div></div>`).join('') : `<p class='pn-empty'>Nadie ha movido clases todavía.</p>`}
      </div>
      ${d.planilla ? `<p class='pn-note'><a class='pn-link' href='${esc(d.planilla)}' target='_blank' rel='noopener'>Abrir la planilla completa</a></p>` : ''}
    </div>`;

    app.innerHTML = h;
    tabsOn();
    document.getElementById('pn-out').onclick = () => { borrar(); auth = null; login(); };
    app.querySelectorAll('[data-paid]').forEach(b => b.onclick = async () => {
      const f = A.faltan[+b.dataset.paid];
      if(!b.dataset.ok){ b.dataset.ok = 1; b.textContent = '¿Confirmas?'; return; }
      b.disabled = true; b.textContent = 'Anotando…';
      try{ render(await post(Object.assign({}, auth, {accion:'marcar-pagado', alumnos:f.alumnos}))); }
      catch(x){ b.disabled = false; delete b.dataset.ok; b.textContent = 'No se pudo, reintenta'; console.error(x); }
    });
  }


  // ---------- Gastos de la Academia Anual (solo administradores) ----------
  let GAS = null, gMes = '', gAbierto = '', gOtro = false;
  const mesCorto = m => cap(String(m).split(' ')[0]);
  async function cargarGastos(mes){
    const pane = app.querySelector("[data-pane='gastos']"); if(!pane) return;
    if(!GAS && !mes){ GAS = cacheLeer('gastos'); if(GAS){ gMes = GAS.mes; pintarGastos(); } }
    if(!GAS || (mes && mes !== GAS.mes)) pane.innerHTML = `<div class='pn-skel'></div><div class='pn-skel'></div>`;
    try{ const d = await post(Object.assign({}, auth, {accion:'gastos', mes: mes || gMes})); const igual = GAS && JSON.stringify(GAS) === JSON.stringify(d); GAS = d; gMes = GAS.mes; cacheGuardar('gastos', d); if(!igual && !escribiendo(pane)) pintarGastos(); }
    catch(x){ pane.innerHTML = `<div class='pn-card'><p class='pn-empty'>No se pudieron cargar los gastos. ${esc(x.message)}</p></div>`; }
  }
  async function gasto(body, btn){
    if(btn){ btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = 'Anotando…'; }
    try{ GAS = await post(Object.assign({}, auth, {accion:'gasto', mes: gMes}, body)); gAbierto = ''; gOtro = false; pintarGastos(); }
    catch(x){ if(btn){ btn.disabled = false; btn.textContent = btn.dataset.t; } alert(x.message); }
  }
  function pintarGastos(){
    const pane = app.querySelector("[data-pane='gastos']"); if(!pane || !GAS) return;
    const g = GAS, queda = g.recaudado - g.gastos;
    let h = `<div class='pn-gm'>${g.meses.map(m => `<button class='pn-gbtn${m===g.mes?' on':''}' data-gmes='${esc(m)}'>${esc(mesCorto(m))}</button>`).join('')}</div>
      <div class='pn-stats'>
        <div class='pn-stat'><small>Gastos de ${esc(mesCorto(g.mes))}</small><b>${clp(g.gastos)}</b><em>${g.clasesSurf} clases de surf · ${g.clasesSkate} de skate</em></div>
        <div class='pn-stat${g.gastos - g.pagado > 0 ? ' pn-stat--warn' : ''}'><small>Falta pagar</small><b>${clp(g.gastos - g.pagado)}</b><em>ya pagaste ${clp(g.pagado)}</em></div>
        <div class='pn-stat pn-stat--main'><small>Recaudado − gastos</small><b>${queda < 0 ? '−' : ''}${clp(Math.abs(queda))}</b><em>recaudado ${clp(g.recaudado)} (antes de comisión)</em></div>
      </div>`;
    h += g.personas.map((p, pi) => {
      const det = p.fijo ? `Pago mensual ${clp(p.fijo)}` : [p.surf ? `${p.nSurf} surf × ${clp(p.surf)}` : '', p.skate ? `${p.nSkate} skate × ${clp(p.skate)}` : ''].filter(Boolean).join(' + ');
      const valorClase = p.surf || p.skate;
      const abierto = gAbierto === p.nombre;
      return `<div class='pn-card pn-gp'>
        <h3><span>${esc(p.nombre)}</span>${p.total && p.saldo <= 0 ? `<span class='pn-gok'>Pagado ✓</span>` : `<span class='pn-gsal'>${clp(p.saldo)}<small>por pagar</small></span>`}</h3>
        <p class='pn-sub'>${det} = <b>${clp(p.total)}</b>${p.pagado ? ` · pagado ${clp(p.pagado)}` : ''}</p>
        ${p.fijo ? '' : `<div class='pn-gcl'>${p.clases.map(c => `<button class='pn-gc${c.falto?' no':''}' data-gp='${pi}' data-gcl='${c.fecha}' title='${c.falto?'No vino':'Vino'}'>${esc(c.texto)}<small>${c.clase}</small></button>`).join('')}</div>
          <p class='pn-hint'>Toca una clase si no vino (se descuenta). Tócala de nuevo para deshacer.</p>`}
        ${p.movs.length ? `<div class='pn-gmov'>${p.movs.map(m => `<div><span>${esc(m.tipo)} · ${esc(corta(m.fecha))}${m.detalle ? ' · ' + esc(m.detalle) : ''}</span><b>${clp(m.monto)}</b><button data-gdel='${m.fila}' aria-label='Borrar'>×</button></div>`).join('')}</div>` : ''}
        ${abierto ? `<div class='pn-gbox'>
            <p>¿Cuánto le pagaste a <b>${esc(p.nombre.split(' ')[0])}</b>?</p>
            <div class='pn-gpre'>${!p.fijo && valorClase ? [1,2,3].map(n => `<button data-gpre='${n*valorClase}'>${n} clase${n>1?'s':''}</button>`).join('') : ''}${p.saldo > 0 ? `<button data-gpre='${p.saldo}'>Todo (${clp(p.saldo)})</button>` : ''}</div>
            <input inputmode='numeric' placeholder='Monto, ej: 25000' id='pn-gmonto'>
            <input placeholder='Nota (opcional), ej: adelanto' id='pn-gnota'>
            <div class='pn-acts'><button class='pn-link' data-gcan>Cancelar</button><button class='pn-ntgo' data-gsave='${pi}'>Anotar pago</button></div>
          </div>` : `<button class='pn-nt' data-gopen='${pi}'>+ Anotar pago o adelanto</button>`}
      </div>`;
    }).join('');
    h += `<div class='pn-card'><h3>Otros gastos<span class='pn-count'>${clp(g.otrosTotal)}</span></h3>
      ${g.otros.length ? `<div class='pn-gmov'>${g.otros.map(o => `<div><span>${esc(o.detalle)} · ${esc(corta(o.fecha))}</span><b>${clp(o.monto)}</b><button data-gdel='${o.fila}' aria-label='Borrar'>×</button></div>`).join('')}</div>` : `<p class='pn-empty'>Nada anotado este mes.</p>`}
      ${gOtro ? `<div class='pn-gbox'><input placeholder='¿En qué fue? ej: parafina, bencina' id='pn-godet'><input inputmode='numeric' placeholder='Monto' id='pn-gomonto'>
        <div class='pn-acts'><button class='pn-link' data-gcan>Cancelar</button><button class='pn-ntgo' data-gosave>Anotar gasto</button></div></div>` : `<button class='pn-nt' data-gonew>+ Anotar otro gasto</button>`}
    </div>
    <p class='pn-note'>Los valores por clase y los pagos fijos están en la pestaña Sueldos de la planilla. Las clases canceladas en el Calendario no se pagan.</p>`;
    pane.innerHTML = h;
    pane.querySelectorAll('[data-gmes]').forEach(b => b.onclick = () => { gAbierto = ''; gOtro = false; cargarGastos(b.dataset.gmes); });
    pane.querySelectorAll('[data-gopen]').forEach(b => b.onclick = () => { gAbierto = g.personas[+b.dataset.gopen].nombre; gOtro = false; pintarGastos(); const i = pane.querySelector('#pn-gmonto'); i && i.focus(); });
    pane.querySelectorAll('[data-gcan]').forEach(b => b.onclick = () => { gAbierto = ''; gOtro = false; pintarGastos(); });
    pane.querySelectorAll('[data-gpre]').forEach(b => b.onclick = () => { pane.querySelector('#pn-gmonto').value = b.dataset.gpre; });
    pane.querySelectorAll('[data-gsave]').forEach(b => b.onclick = () => {
      const monto = +String(pane.querySelector('#pn-gmonto').value).replace(/\D/g, '');
      if(!monto) return pane.querySelector('#pn-gmonto').focus();
      gasto({tipo:'pago', persona: g.personas[+b.dataset.gsave].nombre, monto, detalle: pane.querySelector('#pn-gnota').value.trim()}, b);
    });
    pane.querySelectorAll('[data-gcl]').forEach(b => b.onclick = () => {
      const p = g.personas[+b.dataset.gp], c = p.clases.find(x => x.fecha === b.dataset.gcl);
      if(!b.dataset.ok){ b.dataset.ok = 1; b.classList.add('ask'); b.firstChild.textContent = c.falto ? '¿Sí vino?' : '¿No vino?'; return; }
      gasto(c.falto ? {tipo:'borrar', fila: c.falto} : {tipo:'falta', persona: p.nombre, clase: c.fecha}, b);
    });
    pane.querySelectorAll('[data-gdel]').forEach(b => b.onclick = () => {
      if(!b.dataset.ok){ b.dataset.ok = 1; b.textContent = '¿Borrar?'; b.classList.add('ask'); return; }
      gasto({tipo:'borrar', fila: +b.dataset.gdel}, b);
    });
    const ng = pane.querySelector('[data-gonew]'); if(ng) ng.onclick = () => { gOtro = true; gAbierto = ''; pintarGastos(); pane.querySelector('#pn-godet').focus(); };
    const og = pane.querySelector('[data-gosave]'); if(og) og.onclick = () => {
      const detalle = pane.querySelector('#pn-godet').value.trim(), monto = +String(pane.querySelector('#pn-gomonto').value).replace(/\D/g, '');
      if(!detalle) return pane.querySelector('#pn-godet').focus();
      if(!monto) return pane.querySelector('#pn-gomonto').focus();
      gasto({tipo:'otro', detalle, monto}, og);
    };
  }
  const corta = f => { const m = String(f||'').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? (+m[3]) + '/' + (+m[2]) : f; };

  // ---------- Finanzas Storm (solo administradores) ----------
  const AREAS = ['Verano','Anual','Adultos','Escuela','Rentas','Surfshop','Casa'];
  const AREA_TXT = {Verano:'Academia de Verano', Anual:'Academia Anual', Adultos:'Academia Adultos', Surfshop:'Surf Shop', Casa:'Casa Storm'};
  const anioVer = (() => { const d = new Date(); return d.getFullYear() + (d.getMonth() >= 2 ? 1 : 0); })();
  let fCorr = 'enero';
  let FIN = null, fMes = '', fTipo = 'gasto', fArea = [10,11,0,1].includes(new Date().getMonth()) ? 'Verano' : 'Anual';
  async function cargarFinanzas(mes){
    const pane = app.querySelector("[data-pane='finanzas']"); if(!pane) return;
    if(!FIN && !mes){ FIN = cacheLeer('finanzas'); if(FIN){ fMes = FIN.mes; pintarFinanzas(); } }
    if(!FIN || (mes && mes !== FIN.mes)) pane.innerHTML = `<div class='pn-skel'></div><div class='pn-skel'></div>`;
    try{ const d = await post(Object.assign({}, auth, {accion:'finanzas', mes: mes || fMes})); const igual = FIN && JSON.stringify(FIN) === JSON.stringify(d); FIN = d; fMes = FIN.mes; cacheGuardar('finanzas', d); if(!igual && !escribiendo(pane)) pintarFinanzas(); }
    catch(x){ pane.innerHTML = `<div class='pn-card'><p class='pn-empty'>No se pudieron cargar las finanzas. ${esc(x.message)}</p></div>`; }
  }
  function pintarFinanzas(){
    const pane = app.querySelector("[data-pane='finanzas']"); if(!pane || !FIN) return;
    const f = FIN, max = Math.max(1, ...f.areas.map(a => Math.max(a.ingresos, a.gastos)));
    let h = `<div class='pn-card pn-fadd'><h3>Anotar</h3>
      <div class='pn-fsw'><button data-ftipo='gasto' class='${fTipo==='gasto'?'on':''}'>Gasto</button><button data-ftipo='ingreso' class='${fTipo==='ingreso'?'on':''}'>Ingreso</button></div>
      <input inputmode='numeric' placeholder='Monto, ej: 3500' id='pn-fmonto'>
      <input placeholder='${fTipo==='gasto'?'¿En qué fue? ej: hielo, parafina, bencina':'¿De qué? ej: clase particular, arriendo tabla'}' id='pn-fdet'>
      <div class='pn-gm'>${AREAS.map(a => `<button class='pn-gbtn${a===fArea?' on':''}' data-farea='${a}'>${AREA_TXT[a]||a}</button>`).join('')}</div>
      ${fArea==='Verano' ? `<p class='pn-sub' style='margin:10px 0 4px'>¿A qué corresponde?</p><div class='pn-fsw'>${['enero','febrero','ambos'].map(c => `<button data-fcorr='${c}' class='${fCorr===c?'on':''}'>${c==='ambos'?'Enero y febrero':cap(c)+' '+anioVer}</button>`).join('')}</div>` : ''}
      ${fArea==='Casa' && fTipo==='gasto' ? `<div class='pn-gpre' style='margin-top:10px'>${['Mantención oficina','Crecimiento','Marketing'].map(x => `<button data-fqk='${x}'>${x}</button>`).join('')}</div>` : ''}
      ${fArea==='Verano' && fTipo==='gasto' ? `<div class='pn-gpre' style='margin-top:10px'>${['Comida','Premios','Sala de yoga','Materiales'].map(x => `<button data-fqk='${x}'>${x}</button>`).join('')}</div>` : ''}
      <div class='pn-acts'><span id='pn-fmsg'></span><button class='pn-ntgo' id='pn-fgo'>Anotar ${fTipo}</button></div>
    </div>
    <div class='pn-gm'>${f.meses.map(m => `<button class='pn-gbtn${m===f.mes?' on':''}' data-fmes='${esc(m)}'>${esc(mesCorto(m))}</button>`).join('')}</div>
    <div class='pn-stats'>
      <div class='pn-stat'><small>Ingresos ${esc(mesCorto(f.mes))}</small><b>${clp(f.ingresos)}</b></div>
      <div class='pn-stat'><small>Gastos ${esc(mesCorto(f.mes))}</small><b>${clp(f.gastos)}</b></div>
      <div class='pn-stat pn-stat--main${f.balance<0?' pn-fneg':''}'><small>Balance del mes</small><b>${f.balance<0?'−':''}${clp(Math.abs(f.balance))}</b><em>ingresos − gastos</em></div>
    </div>
    ${f.verano && (f.verano.meses[0].ingresos || f.verano.meses[1].ingresos || f.verano.meses[0].gastosAnotados || f.verano.meses[1].gastosAnotados) ? `<div class='pn-card'><h3>Academia de Verano ${f.verano.anio}<span class='pn-count'>deja ${f.verano.deja<0?'−':''}${clp(Math.abs(f.verano.deja))}</span></h3>
      ${f.verano.meses.map(v => `<div class='pn-farea'><div class='pn-fah'><b>${esc(cap(v.mes))}</b><span class='${v.deja<0?'neg':''}'>${v.deja<0?'−':''}${clp(Math.abs(v.deja))}</span></div>
        <small>${v.ninos} niños · inscripciones ${clp(v.ingresos)} · gastos anotados ${clp(v.gastosAnotados)} · comisión ${clp(v.comision)} · sueldos ustedes ${clp(v.sueldos)}${v.ninos?' · deja '+clp(v.porNino)+' por niño':''}</small></div>`).join('')}
      <p class='pn-sub' style='margin-top:8px'>Cuenta todos los gastos del Verano, aunque los pagues antes (ej. la sala de yoga en diciembre).</p></div>` : ''}
    <div class='pn-card'><h3>Por área</h3>
      ${f.areas.map(a => `<div class='pn-farea'><div class='pn-fah'><b>${esc(AREA_TXT[a.area]||a.area)}</b><span class='${a.ingresos-a.gastos<0?'neg':''}'>${a.ingresos-a.gastos<0?'−':''}${clp(Math.abs(a.ingresos-a.gastos))}</span></div>
        <div class='pn-fbar'><i class='in' style='width:${a.ingresos/max*100}%'></i></div><div class='pn-fbar'><i class='out' style='width:${a.gastos/max*100}%'></i></div>
        <small>entró ${clp(a.ingresos)} · salió ${clp(a.gastos)}${({Verano:' (inscripciones solas, menos comisión, sueldos de ustedes en ene/feb y lo que anotes)', Anual:' (mensualidades, instructores y comisión, solos)', Escuela:' (clases de tu planilla menos comisión e instructores, solos)', Rentas:' (arriendos de tu planilla y del Verano, solos)', Surfshop:' (tienda de tu planilla, sola)', Casa:' (gastos fijos solos, más mantención, crecimiento y marketing)'})[a.area]||''}</small></div>`).join('')}
    </div>
    ${f.ventas ? `<div class='pn-card'><h3>Escuela y tienda (de tu planilla 2026)</h3><div class='pn-gmov'>
      <div><span>Clases</span><b class='pn-fin'>+${clp(f.ventas.clases)}</b></div>
      <div><span>Comisión AgendaPro/TUU (${String(Math.round(f.ventas.pct*1000)/10).replace('.',',')}%)</span><b>−${clp(f.ventas.comision)}</b></div>
      <div><span>Instructores</span><b>−${clp(f.ventas.instructores)}</b></div>
      <div><span><b>Quedó de clases</b></span><b>${f.ventas.escuela<0?'−':''}${clp(Math.abs(f.ventas.escuela))}</b></div>
      <div><span>Tienda</span><b class='pn-fin'>+${clp(f.ventas.tiendaSola)}</b></div>
      <div><span>Renta</span><b class='pn-fin'>+${clp(f.ventas.renta)}</b></div>
      </div><p class='pn-sub' style='margin-top:8px'>Se lee sola de la pestaña Ventas Diarias 2026. Clases va en Escuela; tienda y renta en Surfshop. <a class='pn-link' href='${esc(f.ventas.planilla)}' target='_blank' rel='noopener'>Abrir planilla</a></p></div>` : ''}
    <div class='pn-card'><h3>Anotado en ${esc(mesCorto(f.mes))}<span class='pn-count'>${f.movs.length}</span></h3>
      ${f.movs.length ? `<div class='pn-gmov'>${f.movs.map(m => `<div><span>${esc(m.detalle)} · ${esc(AREA_TXT[m.area]||m.area)}${m.corr && m.corr!==m.mes ? ' · '+esc(cap(m.corr)) : ''} · ${esc(corta(m.fecha))}</span><b class='${/^ingreso/i.test(m.tipo)?'pn-fin':''}'>${/^ingreso/i.test(m.tipo)?'+':'−'}${clp(m.monto)}</b><button data-fdel='${m.fila}' aria-label='Borrar'>×</button></div>`).join('')}</div>` : `<p class='pn-empty'>Aún no anotas nada este mes.</p>`}
    </div>
    <div class='pn-card pn-ffij'><h3>Gastos fijos del mes<span class='pn-count'>${f.fijos.filter(x=>x.pagado).length} de ${f.fijos.length} pagados</span></h3>
      ${f.fijos.map(x => `<button class='pn-fij${x.pagado?' on':''}' data-fij='${esc(x.detalle)}'><i>${x.pagado?'✓':''}</i><span><b>${esc(x.detalle)}</b><small>${x.pagado?'Pagado el '+esc(corta(x.pagado)):'Por pagar'}</small></span><em>${clp(x.monto)}</em></button>`).join('')}
      <p class='pn-sub' style='margin-top:8px'>Tócalo cuando lo pagues. Quedan por pagar ${clp(f.fijos.filter(x=>!x.pagado).reduce((t,x)=>t+x.monto,0))}. Los montos se cambian en la pestaña Fijos de la planilla.</p></div>
    ${f.planilla ? `<p class='pn-note'><a class='pn-link' href='${esc(f.planilla)}' target='_blank' rel='noopener'>Abrir la planilla Finanzas Storm</a></p>` : ''}`;
    pane.innerHTML = h;
    pane.querySelectorAll('[data-ftipo]').forEach(b => b.onclick = () => { fTipo = b.dataset.ftipo; pintarFinanzas(); });
    pane.querySelectorAll('[data-farea]').forEach(b => b.onclick = () => { const m = pane.querySelector('#pn-fmonto').value, d = pane.querySelector('#pn-fdet').value; fArea = b.dataset.farea; pintarFinanzas(); pane.querySelector('#pn-fmonto').value = m; pane.querySelector('#pn-fdet').value = d; });
    pane.querySelectorAll('[data-fcorr]').forEach(b => b.onclick = () => { const m = pane.querySelector('#pn-fmonto').value, d = pane.querySelector('#pn-fdet').value; fCorr = b.dataset.fcorr; pintarFinanzas(); pane.querySelector('#pn-fmonto').value = m; pane.querySelector('#pn-fdet').value = d; });
    pane.querySelectorAll('[data-fqk]').forEach(b => b.onclick = () => { const i = pane.querySelector('#pn-fdet'); i.value = b.dataset.fqk + (i.value && !i.value.startsWith(b.dataset.fqk) ? ': ' + i.value : ''); i.focus(); });
    pane.querySelectorAll('[data-fmes]').forEach(b => b.onclick = () => cargarFinanzas(b.dataset.fmes));
    pane.querySelector('#pn-fgo').onclick = async e => {
      const b = e.currentTarget, monto = +String(pane.querySelector('#pn-fmonto').value).replace(/\D/g, ''), detalle = pane.querySelector('#pn-fdet').value.trim();
      if(!monto) return pane.querySelector('#pn-fmonto').focus();
      if(!detalle) return pane.querySelector('#pn-fdet').focus();
      b.disabled = true; b.textContent = 'Anotando…';
      try{ FIN = await post(Object.assign({}, auth, {accion:'movimiento', mes: fMes, tipo: fTipo, area: fArea, detalle, monto, corresponde: fArea==='Verano' ? (fCorr==='ambos' ? 'verano '+anioVer : fCorr+' '+anioVer) : ''})); pintarFinanzas();
        const m = pane.querySelector('#pn-fmsg'); if(m) m.textContent = 'Anotado ✓'; }
      catch(x){ b.disabled = false; b.textContent = 'Anotar ' + fTipo; alert(x.message); }
    };
    pane.querySelectorAll('[data-fij]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.classList.toggle('on');
      try{ FIN = await post(Object.assign({}, auth, {accion:'movimiento', mes: fMes, fijo: b.dataset.fij})); pintarFinanzas(); }catch(x){ b.disabled = false; b.classList.toggle('on'); alert(x.message); }
    });
    pane.querySelectorAll('[data-fdel]').forEach(b => b.onclick = async () => {
      if(!b.dataset.ok){ b.dataset.ok = 1; b.textContent = '¿Borrar?'; b.classList.add('ask'); return; }
      b.disabled = true;
      try{ FIN = await post(Object.assign({}, auth, {accion:'movimiento', mes: fMes, borrar: true, fila: +b.dataset.fdel})); pintarFinanzas(); }catch(x){ alert(x.message); }
    });
  }
  // ---------- Mi año: saldo real de partida + balance de cada mes ----------
  let ANIO = null;
  async function cargarAnio(extra){
    const pane = app.querySelector("[data-pane='anio']"); if(!pane) return;
    if(!ANIO && !extra){ ANIO = cacheLeer('anio'); if(ANIO) pintarAnio(); }
    if(!ANIO) pane.innerHTML = `<div class='pn-skel'></div><div class='pn-skel'></div>`;
    try{ const d = await post(Object.assign({}, auth, {accion:'anio'}, extra || {})); const igual = ANIO && JSON.stringify(ANIO) === JSON.stringify(d); ANIO = d; cacheGuardar('anio', d); if(!igual && (extra || !escribiendo(pane))) pintarAnio(); }
    catch(x){ pane.innerHTML = `<div class='pn-card'><p class='pn-empty'>No se pudo cargar. ${esc(x.message)}</p></div>`; }
  }
  function pintarAnio(){
    const pane = app.querySelector("[data-pane='anio']"); if(!pane || !ANIO) return;
    const a = ANIO, neg = n => (n<0?'−':'') + clp(Math.abs(n));
    const partida = `<div class='pn-card pn-fadd'><h3>¿Cuánto hay en la cuenta de Storm?</h3>
      <p class='pn-sub'>Se anota una sola vez (el 1 de enero). Desde ahí se suma solo lo que entra y sale cada mes.</p>
      <input inputmode='numeric' placeholder='Banco, ej: 2195000' id='pn-abanco'>
      <div class='pn-acts'><span></span><button class='pn-ntgo' id='pn-ago'>Guardar saldo</button></div></div>`;
    const grandes = `<div class='pn-card pn-fadd'><h3>Gastos grandes que vienen<span class='pn-count'>${clp(a.porPagar||0)}</span></h3>
      <p class='pn-sub'>Trajes, certificaciones, operación renta… Anótalos antes, así sabes cuánto tienes libre. Tócalo cuando lo pagues y se anota solo como gasto.</p>
      ${(a.grandes||[]).length ? (a.grandes||[]).map(g => `<button class='pn-fij${g.pagado?' on':''}' data-gr='${g.fila}'><i>${g.pagado?'✓':''}</i><span><b>${esc(g.detalle)}</b><small>${esc(cap(g.mes))}${g.pagado?' · pagado':''}</small></span><em>${clp(g.monto)}</em></button>`).join('') : ''}
      <input placeholder='¿Qué es? ej: trajes nuevos' id='pn-grdet'>
      <input inputmode='numeric' placeholder='Monto, ej: 900000' id='pn-grmonto'>
      <input placeholder='¿Para qué mes? ej: diciembre 2026' id='pn-grmes'>
      <div class='pn-acts'><span></span><button class='pn-ntgo' id='pn-grgo'>Anotar gasto grande</button></div></div>`;
    if(!a.inicio){ pane.innerHTML = partida + grandes; bindAnio(pane); return; }
    const val = m => m.aporte ? m.conFondo : m.balance;
    const max = Math.max(1, ...a.meses.map(m => Math.abs(val(m))));
    pane.innerHTML = `<div class='pn-stats'>
      <div class='pn-stat pn-stat--main${a.saldo<0?' pn-fneg':''}'><small>Debería haber hoy</small><b>${neg(a.saldo)}</b><em>partiste con ${clp(a.inicio.total)} el ${esc(corta(a.inicio.fecha))}</em></div>
      <div class='pn-stat${a.libre<0?' pn-fneg':''}'><small>Libre para usar</small><b>${neg(a.libre)}</b><em>después de los gastos grandes</em></div>
      <div class='pn-stat'><small>Te alcanza para</small><b>${String(a.colchon).replace('.',',')} meses</b><em>de gastos fijos (${clp(a.fijosMes)})</em></div>
    </div>
    ${a.ganancia ? `<div class='pn-card'><h3>Ganancia real ${esc(a.ganancia.anio)}<span class='pn-count'>${a.ganancia.meses} ${a.ganancia.meses===1?'mes':'meses'}</span></h3>
      <div class='pn-fah' style='font-size:1.6em;margin:4px 0 2px'><b class='${a.ganancia.total<0?'neg':''}'>${neg(a.ganancia.total)}</b></div>
      <p class='pn-sub'>Todo lo que entró (${clp(a.ganancia.ingresos)}) menos todo lo que salió (${clp(a.ganancia.gastos)}): comisiones, instructores, fijos y retiro de socios.</p>
      <div class='pn-gmov' style='margin-top:8px'>${a.ganancia.areas.map(x => `<div><span>${esc(x.area)}</span><b class='${x.balance<0?'':'pn-fin'}'>${x.balance<0?'−':'+'}${clp(Math.abs(x.balance))}</b></div>`).join('')}</div></div>` : ''}
    ${a.fondo && a.fondo.aporte ? `<div class='pn-card'><h3>Fondo de Verano</h3>
      <p class='pn-sub'>${a.fondo.desdeFebrero ? 'Lo que quedó al cerrar el verano' : 'Lo que hay hoy'} (${clp(a.fondo.base)}) se reparte en ${a.fondo.meses} ${a.fondo.meses===1?'mes':'meses'} hasta diciembre: cada mes recibe <b>${clp(a.fondo.aporte)}</b>. Si el mes queda en verde, vas bien aunque sea invierno. Si queda en rojo, ese mes gastaste más de lo que te tocaba.</p></div>` : ''}
    ${a.utilidades ? (() => { const u = a.utilidades; return `<div class='pn-card'><h3>Utilidades del verano</h3>
      <p class='pn-sub'>La ganancia de ustedes por el trabajo del verano, aparte del sueldo. Se calcula al cerrar febrero, dejando cubierto el resto del año.</p>
      <div class='pn-gmov' style='margin-top:6px'>
        <div><span>Gastos fijos al mes</span><b>${clp(a.fijosMes)}</b></div>
        <div><span>Lo que dejan la Anual y la escuela al mes (aprox.)</span><b class='pn-fin'>+${clp(u.esperado)}</b></div>
        <div><span>Falta cubrir al mes, de marzo a diciembre</span><b>${clp(u.faltaPorMes)}</b></div>
        <div><span>Storm necesita guardar (10 meses + gastos grandes)</span><b>${clp(u.necesita)}</b></div>
        ${u.listo ? `<div><span>Había al cerrar febrero</span><b>${clp(u.saldoFeb)}</b></div>
        <div><span><b>Pueden retirar como utilidades</b></span><b class='${u.disponible>0?'pn-fin':''}'>${u.disponible>0?clp(u.disponible):'$0'}</b></div>` : ''}
      </div>
      <p class='pn-sub' style='margin-top:8px'>${u.listo ? (u.disponible>0 ? 'Si lo retiran, anótenlo en General como gasto "Utilidades socios".' : 'Este año no conviene retirar: lo que hay se necesita para llegar al próximo verano.') : 'El 1 de marzo, con lo que haya en la cuenta, aquí aparece cuánto pueden retirar.'}</p></div>`; })() : ''}
    <div class='pn-card'><h3>Mes a mes</h3>
      ${a.meses.map(m => `<div class='pn-farea'><div class='pn-fah'><b>${esc(cap(m.mes))}</b><span class='${val(m)<0?'neg':''}'>${neg(val(m))}</span></div>
        <div class='pn-fbar'><i class='${val(m)<0?'out':'in'}' style='width:${Math.abs(val(m))/max*100}%'></i></div>
        <small>entró ${clp(m.ingresos)}${m.aporte?' + fondo de verano '+clp(m.aporte):''} · salió ${clp(m.gastos)} · ${m.cuenta ? 'en la cuenta ' + neg(m.saldo) : 'ya está dentro del saldo de partida'}</small></div>`).join('')}
      <p class='pn-sub' style='margin-top:8px'>Enero y febrero no reciben fondo: son los meses que lo llenan.</p></div>
    ${(() => { const u = a.meses[a.meses.length-1]; if(!u) return ''; const falta = Math.max(0, u.ahorroSugerido - u.ahorrado);
      return `<div class='pn-card pn-fadd'><h3>Cuenta de ahorro<span class='pn-count'>${clp(a.ahorroTotal||0)}</span></h3>
      <p class='pn-sub'>A fin de mes pasa a la cuenta de ahorro el ${Math.round((a.ahorroPct||0.1)*100)}% de lo que entró. Es la reserva para trajes, certificaciones y operación renta.</p>
      <div class='pn-gmov'><div><span>${esc(cap(u.mes))}: entró ${clp(u.ingresos)}</span><b>${clp(u.ahorroSugerido)}</b></div>${u.ahorrado?`<div><span>Ya pasaste</span><b class='pn-fin'>${clp(u.ahorrado)}</b></div>`:''}</div>
      ${falta ? `<input inputmode='numeric' id='pn-ahmonto' value='${falta}'><div class='pn-acts'><span></span><button class='pn-ntgo' id='pn-ahgo' data-mes='${esc(u.mes)}'>Ya lo pasé a ahorro</button></div>` : `<p class='pn-ok'>✓ Listo este mes.</p>`}</div>`; })()}
    ${grandes}
    <div class='pn-card pn-fadd'><h3>Comparar con el banco</h3>
      <p class='pn-sub'>Una vez al mes mira el banco y escríbelo aquí. No cambia nada, solo te muestra si falta anotar algo.</p>
      <input inputmode='numeric' placeholder='Lo que dice el banco hoy' id='pn-acmp'><p class='pn-sub' id='pn-acmpr'></p></div>`;
    bindAnio(pane);
  }
  function bindAnio(pane){
    const go = pane.querySelector('#pn-ago');
    if(go) go.onclick = async e => {
      const banco = String(pane.querySelector('#pn-abanco').value).replace(/\D/g, '');
      if(!banco) return pane.querySelector('#pn-abanco').focus();
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Guardando…';
      await cargarAnio({banco: +banco});
    };
    const gg = pane.querySelector('#pn-grgo');
    if(gg) gg.onclick = async e => {
      const detalle = pane.querySelector('#pn-grdet').value.trim(), monto = +String(pane.querySelector('#pn-grmonto').value).replace(/\D/g, ''), mes = pane.querySelector('#pn-grmes').value.trim();
      if(!detalle) return pane.querySelector('#pn-grdet').focus();
      if(!monto) return pane.querySelector('#pn-grmonto').focus();
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Anotando…';
      await cargarAnio({grande:'nuevo', detalle, monto, mes});
    };
    pane.querySelectorAll('[data-gr]').forEach(b => b.onclick = async () => { b.disabled = true; await cargarAnio({grande:'pagar', fila: +b.dataset.gr}); });
    const ahg = pane.querySelector('#pn-ahgo');
    if(ahg) ahg.onclick = async e => { const monto = +String(pane.querySelector('#pn-ahmonto').value).replace(/\D/g, ''); if(!monto) return; e.currentTarget.disabled = true; e.currentTarget.textContent = 'Anotando…'; await cargarAnio({ahorro: 1, monto, mes: e.currentTarget.dataset.mes}); };
    const cmp = pane.querySelector('#pn-acmp');
    if(cmp) cmp.oninput = () => {
      const v = +String(cmp.value).replace(/\D/g, ''), r = pane.querySelector('#pn-acmpr');
      if(!v){ r.textContent = ''; return; }
      const dif = v - ANIO.saldo;
      r.innerHTML = Math.abs(dif) < 1000 ? '✓ Cuadra.' : dif < 0 ? `En el banco hay <b>${clp(-dif)}</b> menos. Falta anotar algún gasto.` : `En el banco hay <b>${clp(dif)}</b> más. Falta anotar algún ingreso.`;
    };
  }
  // Desde Verano: botón para anotar un gasto hormiga (abre Finanzas con el área Verano).
  function irAFinanzasVerano(){
    fArea = 'Verano'; fTipo = 'gasto'; fSub = 'finanzas'; acad = 'finanzas'; try{ sessionStorage.setItem(KEY + '-acad', 'finanzas'); }catch(_){}
    mostrarAcad(); window.scrollTo(0, 0);
  }
  // ---------- Notas internas por alumno (solo el equipo; las familias no las ven) ----------
  let NOTAS = null, ntAbierta = '', aGrupo = '', aCambio = '', aNuevo = '', aMsg = '', ES_ADMIN = false;
  // Cajita para elegir el nivel nuevo (Anual y Verano).
  function nivelBox(nombre, actual, niveles, nuevo, p){
    return `<div class='pn-nvbox'><p>¿A qué nivel pasa <b>${esc(nombre.split(' ')[0])}</b>?${actual ? ' Hoy está en ' + esc(actual) + '.' : ''}</p>
      <div class='pn-nvops'>${niveles.map(x => `<button data-${p}nv='${x}' class='${x===actual?'act':''}${x===nuevo?' on':''}'${x===actual?' disabled':''}>${x}</button>`).join('')}</div>
      <label><input type='checkbox' id='pn-${p}nvav' checked> Avisar a la familia en la app</label>
      <button class='pn-nvgo' id='pn-${p}nvgo'${nuevo?'':' disabled'}>Guardar</button><button class='pn-link' id='pn-${p}nvx'>Cancelar</button></div>`;
  }
  const nk = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  const notasDe = nombre => NOTAS ? NOTAS.notas.filter(n => nk(n.alumno) === nk(nombre)) : [];
  async function cargarNotas(forzar){
    if(NOTAS && !forzar) return NOTAS;
    try{ const r = await post(Object.assign({}, auth, {accion:'notas'})); NOTAS = r; }
    catch(x){ NOTAS = NOTAS || {alumnos:[], notas:[], error: x.message}; }
    return NOTAS;
  }
  const fechaCorta = f => { const m = String(f).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? (+m[3]) + '/' + (+m[2]) + '/' + m[1].slice(2) : f; };
  // Botón "Notas" + cajita con las notas y para escribir una nueva.
  function notaBtn(nombre){
    const n = notasDe(nombre).length;
    return ntAbierta === nombre ? '' : `<button class='pn-nt' data-nt='${esc(nombre)}'>📝 Notas${n ? `<i>${n}</i>` : ''}</button>`;
  }
  function notaBox(nombre, academia){
    if(ntAbierta !== nombre) return '';
    const ns = notasDe(nombre);
    return `<div class='pn-ntbox' data-ntbox data-acad='${academia}'><p class='pn-sub'>Notas internas de <b>${esc(nombre.split(' ')[0])}</b>. Solo las ve el equipo Storm, nunca la familia.</p>
      ${ns.map(n => `<div class='pn-n'><small>${esc(fechaCorta(n.fecha))} · ${esc(n.de || 'Storm')} · ${esc(n.academia)}</small>${esc(n.nota)}</div>`).join('') || ''}
      <textarea placeholder='Cómo va, qué está trabajando, algo a tener en cuenta…'></textarea>
      <button class='pn-ntgo'>Guardar nota</button><button class='pn-link' data-ntx style='margin-left:10px'>Cerrar</button></div>`;
  }
  function bindNotas(root, repintar){
    root.querySelectorAll('[data-nt]').forEach(b => b.onclick = async () => { ntAbierta = b.dataset.nt; await cargarNotas(); repintar(); const t = root.querySelector('[data-ntbox] textarea'); if(t) t.focus(); });
    root.querySelectorAll('[data-ntx]').forEach(b => b.onclick = () => { ntAbierta = ''; repintar(); });
    root.querySelectorAll('[data-ntbox]').forEach(box => {
      const go = box.querySelector('.pn-ntgo'), ta = box.querySelector('textarea');
      go.onclick = async () => {
        if(ta.value.trim().length < 2) return ta.focus();
        go.disabled = true; go.textContent = 'Guardando…';
        try{ NOTAS = await post(Object.assign({}, auth, {accion:'nota', alumno: ntAbierta, academia: box.dataset.acad, nota: ta.value.trim()})); repintar(); }
        catch(x){ go.disabled = false; go.textContent = 'Guardar nota'; ta.insertAdjacentHTML('afterend', `<p class='pn-msg'>${esc(x.message)}</p>`); }
      };
    });
  }
  // ---------- Informes de fin de mes (borradores que deja Claude en la pestaña Informes) ----------
  let INF = null;
  async function cargarInformes(){ try{ INF = (await post(Object.assign({}, auth, {accion:'informes'}))).informes || []; }catch(_){ INF = INF || []; } return INF; }
  function informesHTML(){
    if(!ES_ADMIN || !INF) return '';
    const bor = INF.filter(x => x.estado === 'Borrador'), env = INF.filter(x => x.estado === 'Enviado');
    if(!bor.length && !env.length) return '';
    return `<div class='pn-card'><h3>Informes de fin de mes${bor.length ? `<span class='pn-count'>${bor.length} por revisar</span>` : ''}</h3>
      ${bor.length ? `<p class='pn-sub'>Revisa cada informe, corrige lo que quieras y envíalo. A la familia le llega un aviso y lo ve en Mi clase.</p>` : `<p class='pn-sub'>No hay informes por revisar. 👌</p>`}
      ${bor.map(x => `<div class='pn-ntbox' style='margin-top:10px'><p class='pn-sub'><b>${esc(x.alumno)}</b> · ${esc(cap(x.mes))} · ${esc(x.academia)}</p>
        <textarea data-inf='${x.fila}' style='min-height:150px'>${esc(x.texto)}</textarea>
        <button class='pn-ntgo' data-infgo='${x.fila}'>Enviar a la familia</button></div>`).join('')}
      ${env.length ? `<details style='margin-top:10px'><summary class='pn-sub' style='cursor:pointer'>Enviados (${env.length})</summary>${env.map(x => `<div class='pn-row'><div><b>${esc(x.alumno)}</b><small>${esc(cap(x.mes))} · ${esc(x.academia)} · enviado ${esc(fechaCorta(x.enviado))}</small></div></div>`).join('')}</details>` : ''}
    </div>`;
  }
  function bindInformes(pane){
    pane.querySelectorAll('[data-infgo]').forEach(b => b.onclick = async () => {
      const ta = pane.querySelector(`[data-inf='${b.dataset.infgo}']`);
      b.disabled = true; b.textContent = 'Enviando…';
      try{ const r = await post(Object.assign({}, auth, {accion:'informe', fila: +b.dataset.infgo, texto: ta.value.trim()})); INF = r.informes || []; pintarAlumnos(); }
      catch(x){ b.disabled = false; b.textContent = 'Enviar a la familia'; b.insertAdjacentHTML('afterend', `<p class='pn-msg'>${esc(x.message)}</p>`); }
    });
  }
  function pintarAlumnos(){
    const pane = app.querySelector("[data-pane='alumnos']"); if(!pane || !NOTAS) return;
    const nn = t => String(t || '').trim().toLowerCase();
    const delMes = ULT && ULT.actual ? new Set([...(ULT.actual.pagaron || []).filter(p => !/^\s*skate\s*$/i.test(p.plan || '')).map(p => nn(p.alumno)), ...(ULT.actual.faltan || []).flatMap(f => f.alumnos.map(nn))]) : null;
    const soloSkate = ULT && ULT.actual ? new Set((ULT.actual.pagaron || []).filter(p => /^\s*skate\s*$/i.test(p.plan || '')).map(p => nn(p.alumno))) : new Set();
    const al = (NOTAS.alumnos || []).filter(a => !soloSkate.has(nn(a.nombre)) && (!delMes || !delMes.size || delMes.has(nn(a.nombre)))).sort((a,b) => primeroMio()(a.grupo, b.grupo) || a.nombre.localeCompare(b.nombre));
    const grupos = [...new Set(al.map(a => a.grupo || 'Sin grupo'))];
    const lista = aGrupo ? al.filter(a => (a.grupo || 'Sin grupo') === aGrupo) : al;
    pane.innerHTML = (aMsg ? `<div class='pn-ok'>${esc(aMsg)}</div>` : '') + informesHTML() + (NOTAS.error ? `<div class='pn-msg'>${esc(NOTAS.error)}${/desconocida/i.test(NOTAS.error) ? ' (falta pegar el programa nuevo de la planilla Anual)' : ''}</div>` : '') +
      `<div class='pn-gsel'><button class='pn-gbtn${aGrupo?'':' on'}' data-ag=''>Todos<small>${al.length}</small></button>${grupos.map(g => `<button class='pn-gbtn${aGrupo===g?' on':''}' data-ag='${esc(g)}'>${esc(g)}<small>${al.filter(a => (a.grupo||'Sin grupo') === g).length}</small></button>`).join('')}</div>
      <div class='pn-card'><h3>Alumnos${aGrupo ? ' · ' + esc(aGrupo) : ''}${aGrupo && mio(aGrupo) ? `<span class='pn-tu'>Tu grupo</span>` : ''}<span class='pn-count'>${lista.length}</span></h3>${aGrupo && ACARGO[aGrupo] ? `<p class='pn-sub' style='margin-bottom:4px'>A cargo: ${esc(ACARGO[aGrupo])}</p>` : ''}
      <p class='pn-sub'>Anota cómo va cada alumno. Las notas son solo para el equipo.</p>
      ${lista.map(a => `<div class='pn-al' data-alumno='${esc(a.nombre)}'><div><b class='pn-alb'>${esc(a.nombre)}</b><small style='display:block;opacity:.65;font-size:1.2rem'>${esc(a.grupo || 'Sin grupo')}</small></div><div>${notaBtn(a.nombre)}${ES_ADMIN && aCambio !== a.nombre ? `<button class='pn-nv' data-acn='${esc(a.nombre)}'>Cambiar nivel</button>` : ''}</div>${aCambio === a.nombre ? nivelBox(a.nombre, a.grupo, ORDEN.slice(0,5), aNuevo, 'a') : ''}${notaBox(a.nombre, 'Anual')}</div>`).join('') || `<p class='pn-empty'>No hay alumnos este mes.</p>`}</div>`;
    pane.querySelectorAll('[data-ag]').forEach(b => b.onclick = () => { aGrupo = b.dataset.ag; pintarAlumnos(); });
    bindInformes(pane);
    pane.querySelectorAll('[data-acn]').forEach(b => b.onclick = () => { aCambio = b.dataset.acn; aNuevo = ''; aMsg = ''; pintarAlumnos(); });
    pane.querySelectorAll('[data-anv]').forEach(b => b.onclick = () => { aNuevo = b.dataset.anv; const av = pane.querySelector('#pn-anvav').checked; pintarAlumnos(); pane.querySelector('#pn-anvav').checked = av; });
    const ax = pane.querySelector('#pn-anvx'); if(ax) ax.onclick = () => { aCambio = ''; aNuevo = ''; pintarAlumnos(); };
    const ago = pane.querySelector('#pn-anvgo');
    if(ago) ago.onclick = async () => {
      ago.disabled = true; ago.textContent = 'Guardando…';
      try{
        const r = await post(Object.assign({}, auth, {accion:'grupo', alumno: aCambio, grupo: aNuevo, avisar: pane.querySelector('#pn-anvav').checked}));
        NOTAS = r; const c = r.cambio || {};
        aMsg = `Listo: ${c.alumno || aCambio} ahora está en ${c.grupo || aNuevo}.` + (c.avisado ? ' Le avisamos a la familia en la app.' : '');
        aCambio = ''; aNuevo = ''; pintarAlumnos();
      }catch(x){ ago.disabled = false; ago.textContent = 'Guardar'; ago.insertAdjacentHTML('afterend', `<p class='pn-msg'>${esc(x.message)}</p>`); }
    };
    bindNotas(pane, pintarAlumnos);
  }

  // ---------- Academia de Verano ----------
  let VER = null, vSem = '', vNiv = '', vCambio = '', vNuevo = '', vMsg = '';
  // Selector Academia Anual / Academia de Verano (en enero y febrero parte en Verano).
  let acad = (() => { try{ return sessionStorage.getItem(KEY + '-acad'); }catch(_){ return null; } })() || ([0,1].includes(new Date().getMonth()) ? 'verano' : 'anual');
  function ponerSelector(){
    if(!API_VERANO) return;
    const head = app.querySelector('.pn-head'); if(!head || app.querySelector('.pn-sw')) return;
    head.insertAdjacentHTML('afterend', `<div class='pn-sw' role='tablist'><button data-acad='anual'>Anual</button><button data-acad='verano'>Verano</button><button data-acad='adultos'>Adultos</button>${ES_ADMIN ? `<button data-acad='finanzas'>Finanzas</button>` : ''}</div>`);
    if(!app.querySelector('.pn-adultos')) app.insertAdjacentHTML('beforeend', `<div class='pn-adultos' hidden></div>`);
    app.querySelectorAll('[data-acad]').forEach(b => b.onclick = () => { acad = b.dataset.acad; try{ sessionStorage.setItem(KEY + '-acad', acad); }catch(_){} mostrarAcad(); });
    mostrarAcad();
  }
  let fSub = (() => { try{ return sessionStorage.getItem(KEY + '-fsub'); }catch(_){ return null; } })() || 'finanzas';
  function mostrarAcad(){
    if(acad === 'finanzas' && !app.querySelector('.pn-finz')) acad = 'anual';
    const ver = acad === 'verano', fin = acad === 'finanzas', adu = acad === 'adultos';
    app.querySelectorAll('[data-acad]').forEach(b => b.classList.toggle('on', b.dataset.acad === acad));
    [...app.children].forEach(el => { if(!el.matches('.pn-head,.pn-sw,.pn-verano,.pn-finz,.pn-adultos')) el.style.display = (ver || fin || adu) ? 'none' : ''; });
    const pa = app.querySelector('.pn-adultos'); if(pa) pa.hidden = !adu;
    const pv = app.querySelector('.pn-verano'); pv.hidden = !ver;
    const pf = app.querySelector('.pn-finz'); if(pf) pf.hidden = !fin;
    const h1 = app.querySelector('.pn-head h1'); if(h1){ h1.dataset.t = h1.dataset.t || h1.textContent; h1.textContent = ver ? 'Verano 2027' : fin ? 'Finanzas Storm' : adu ? 'Academia de Adultos' : h1.dataset.t; }
    if(ver) loadVerano();
    if(adu) loadAdultos();
    if(fin) mostrarFsub();
  }
  function mostrarFsub(){
    const pf = app.querySelector('.pn-finz'); if(!pf) return;
    try{ sessionStorage.setItem(KEY + '-fsub', fSub); }catch(_){}
    pf.querySelectorAll('[data-fsub]').forEach(b => { b.classList.toggle('on', b.dataset.fsub === fSub); b.onclick = () => { fSub = b.dataset.fsub; mostrarFsub(); }; });
    pf.querySelectorAll('.pn-fpane').forEach(p => p.hidden = p.dataset.pane !== fSub);
    if(fSub === 'gastos') cargarGastos(); else if(fSub === 'anio') cargarAnio(); else cargarFinanzas();
  }
  const NIV = ['Kids','Iniciante','Progress','Intermedio','Avanzado','Federados'];
  async function loadVerano(){
    const pane = app.querySelector('.pn-verano'); if(!pane) return;
    if(VER) return pintarVerano(pane);
    const viejo = cacheLeer('verano');
    if(viejo){ VER = viejo; pintarVerano(pane); }
    try{
      const r = await (await fetch(API_VERANO, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(Object.assign({}, auth, {accion:'panel'}))})).json();
      if(!r.ok) throw new Error(r.error || 'No se pudo cargar Verano.');
      cacheGuardar('verano', r);
      const igual = viejo && JSON.stringify(viejo) === JSON.stringify(r);
      VER = r; if(!igual && !escribiendo(pane)) pintarVerano(pane);
      cargarNotas().then(() => { if(!escribiendo(pane)) pintarVerano(pane); });
    }catch(x){ if(!viejo) pane.innerHTML = `<div class='pn-msg'>${esc(x.message)}</div>`; }
  }
  // Cuánto va el niño en el mes de la semana elegida: mes completo o cuántas semanas.
  const MES_SEM = {ene:['s1','s2','s3','s4'], feb:['s5','s6','s7','s8']};
  function duracion(a){
    if(!vSem || vSem === 'todas') return '';
    const mes = MES_SEM.ene.includes(vSem) ? MES_SEM.ene : MES_SEM.feb;
    const n = mes.filter(x => a.semanas.includes(x)).length;
    const num = id => Number(id.slice(1)), act = num(vSem), sig = 's' + (act + 1);
    const delMes = a.semanas.filter(x => mes.includes(x)).sort((x, y) => num(x) - num(y));
    const despues = delMes.filter(x => num(x) > act);
    const sigue = delMes.includes(sig) ? `<span class='pn-sig pn-sig--si'>Sigue la semana ${act + 1}</span>`
      : despues.length ? `<span class='pn-sig'>Vuelve la semana ${num(despues[0])}</span>` : `<span class='pn-sig pn-sig--no'>Última semana del mes</span>`;
    const sems = `<span class='pn-sems'>${delMes.map(x => x === vSem ? `<b>S${num(x)}</b>` : `S${num(x)}`).join(' ')}</span>`;
    return (n === 4 ? `<span class='pn-dur pn-dur--mes'>Mes completo</span> ` : `<span class='pn-dur'>${n} semana${n===1?'':'s'}</span> `) + sigue + ' ' + sems + '<br>';
  }
  function pintarVerano(pane){
    const v = VER, admin = v.rol !== 'instructor';
    if(!vSem){ const hoy = new Date(), conNinos = v.semanas.filter(s => s.n); vSem = conNinos.length ? conNinos[0].id : 'todas'; if(!admin && (v.miGrupo || []).length) vNiv = v.miGrupo[0]; }
    const vMios = v.miGrupo || [], vOrden = NIV.slice().sort(primeroMio(vMios));
    const enSem = vSem === 'todas' ? v.alumnos : v.alumnos.filter(a => a.semanas.includes(vSem));
    const lista = vNiv ? enSem.filter(a => a.nivel === vNiv) : enSem;
    const sem = v.semanas.find(s => s.id === vSem);
    const fed = v.niveles.find(n => n.nivel === 'Federados');
    let h = (vMsg ? `<div class='pn-ok'>${esc(vMsg)}</div>` : '') + `<div class='pn-stats'>
      <div class='pn-stat pn-stat--sun'><small>Niños inscritos</small><b>${v.total}</b><em>${v.tablas} con tabla · ${v.trajes} con traje</em></div>
      ${admin ? `<div class='pn-stat'><small>Recaudado</small><b>${clp(v.recaudado)}</b><em>antes de comisión</em></div>` : ''}
      <div class='pn-stat'><small>Federados</small><b>${fed ? fed.n : 0}</b><em>solo enero</em></div>
    </div>
    <div class='pn-days'><button class='pn-day${vSem==='todas'?' on':''}' data-vs='todas'><b>Todas</b><i>${v.total} niños</i></button>${v.semanas.map(s =>
      `<button class='pn-day${vSem===s.id?' on':''}' data-vs='${s.id}'><b>${esc(s.nombre)}</b><small>${esc(s.fechas)}</small><i>${s.n}${s.cupo ? ' de '+s.cupo : ''} niño${s.n===1?'':'s'}</i></button>`).join('')}</div>
    <div class='pn-gsel'><button class='pn-gbtn${vNiv?'':' on'}' data-vn=''>Todos<small>${enSem.length}</small></button>${vOrden.map(n => { const c = enSem.filter(a => a.nivel === n).length;
      return c ? `<button class='pn-gbtn${vNiv===n?' on':''}' data-vn='${esc(n)}'>${mio(n, vMios)?'★ ':''}${esc(n)}<small>${c}</small></button>` : ''; }).join('')}</div>
    <div class='pn-card'><h3>${vNiv ? esc(vNiv)+' · ' : ''}${sem ? esc(sem.nombre)+' · '+esc(sem.fechas) : 'Todo el verano'}<span class='pn-count'>${lista.length}</span></h3>
      ${lista.length ? vOrden.map(n => { const g = lista.filter(a => a.nivel === n); if(!g.length) return '';
        return `<div class='pn-grp'>${grpHead(n, g.length, v.aCargo, vMios)}${g.map(a => `<div class='pn-vk'><div><b>${esc(a.nombre)}</b>
          <small>${duracion(a)}${esc(a.edad)}${a.tabla?" <span class='pn-tag'>tabla</span>":''}${a.traje?" <span class='pn-tag'>traje</span>":''}${vSem==='todas'?' · '+[['Enero',MES_SEM.ene],['Febrero',MES_SEM.feb]].map(([m,ids]) => { const w = ids.filter(x => a.semanas.includes(x)); return w.length ? m+': '+(w.length===4?'mes completo':w.map(x=>x.replace('s','S')).join(' ')) : ''; }).filter(Boolean).join(' · '):''}${admin?' · '+esc(a.apoderado):''}</small>
          ${a.salud ? `<span class='pn-salud'>⚠︎ ${esc(a.salud)}</span>` : ''}
          ${a.emergencia ? `<small>Emergencia: ${esc(a.emergencia)} ${esc(a.emergenciaTel)}</small>` : ''}
          ${notaBtn(a.nombre)}${admin && a.nivel !== 'Federados' && vCambio !== a.nombre ? `<button class='pn-nv' data-cn='${esc(a.nombre)}'>Cambiar nivel</button>` : ''}</div>
          ${admin && wa(a.telefono) ? `<a class='pn-wa' target='_blank' rel='noopener' href='https://wa.me/${wa(a.telefono)}'>WhatsApp</a>` : ''}
          ${vCambio === a.nombre ? `<div class='pn-nvbox'><p>¿A qué nivel pasa <b>${esc(a.nombre.split(' ')[0])}</b>? Hoy está en ${esc(a.nivel)}.</p>
            <div class='pn-nvops'>${NIV.filter(x => x !== 'Federados').map(x => `<button data-nv='${x}' class='${x===a.nivel?'act':''}${x===vNuevo?' on':''}'${x===a.nivel?' disabled':''}>${x}</button>`).join('')}</div>
            <label><input type='checkbox' id='pn-nvav' checked> Avisar a la familia en la app</label>
            <button class='pn-nvgo' id='pn-nvgo'${vNuevo?'':' disabled'}>Guardar</button><button class='pn-link' id='pn-nvx'>Cancelar</button></div>` : ''}${notaBox(a.nombre, 'Verano')}</div>`).join('')}</div>`; }).join('')
        : `<p class='pn-empty'>${vNiv ? 'No hay niños de '+esc(vNiv)+' esta semana.' : 'Todavía no hay niños inscritos esta semana.'}</p>`}
    </div>`;
    if(admin){
      h += `<button class='pn-vfin' data-vfin>+ Anotar gasto de Verano</button>`;
      if(v.revisar && v.revisar.length) h += `<div class='pn-card'><h3>Pagos para revisar<span class='pn-count'>${v.revisar.length}</span></h3><p class='pn-sub'>Revísalos en la pestaña Pagos de la planilla de Verano: ${v.revisar.map(esc).join(', ')}</p></div>`;
      h += `<div class='pn-card'><h3>Últimos pagos web</h3>${v.ultimos.length ? v.ultimos.map(p => `<div class='pn-row'><div><b>${esc(p.alumnos.join(', '))}</b><small>${esc(p.apoderado)} · ${esc(p.fecha)}${p.codigo?" <span class='pn-tag'>"+esc(p.codigo)+'</span>':''}</small></div><span class='pn-amt'>${p.total ? clp(p.total) : 'Beca'}</span></div>`).join('') : `<p class='pn-empty'>Aún no hay pagos con Mercado Pago. Las inscripciones de antes (Shopify) ya están en la lista.</p>`}</div>`;
      if(v.planilla) h += `<p class='pn-note'><a class='pn-link' href='${esc(v.planilla)}' target='_blank' rel='noopener'>Abrir la planilla de Verano</a></p>`;
    }
    pane.innerHTML = h;
    const vf = pane.querySelector('[data-vfin]'); if(vf) vf.onclick = irAFinanzasVerano;
    pane.querySelectorAll('[data-vs]').forEach(b => b.onclick = () => { vSem = b.dataset.vs; pintarVerano(pane); });
    pane.querySelectorAll('[data-vn]').forEach(b => b.onclick = () => { vNiv = b.dataset.vn; pintarVerano(pane); });
    bindNotas(pane, () => pintarVerano(pane));
    pane.querySelectorAll('[data-cn]').forEach(b => b.onclick = () => { vCambio = b.dataset.cn; vNuevo = ''; vMsg = ''; pintarVerano(pane); });
    pane.querySelectorAll('[data-nv]').forEach(b => b.onclick = () => { vNuevo = b.dataset.nv; const av = pane.querySelector('#pn-nvav').checked; pintarVerano(pane); pane.querySelector('#pn-nvav').checked = av; });
    const nx = pane.querySelector('#pn-nvx'); if(nx) nx.onclick = () => { vCambio = ''; vNuevo = ''; pintarVerano(pane); };
    const go = pane.querySelector('#pn-nvgo');
    if(go) go.onclick = async () => {
      go.disabled = true; go.textContent = 'Guardando…';
      try{
        const r = await (await fetch(API_VERANO, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
          body: JSON.stringify(Object.assign({}, auth, {accion:'nivel', alumno: vCambio, nivel: vNuevo, avisar: pane.querySelector('#pn-nvav').checked}))})).json();
        if(!r.ok) throw new Error(r.error || 'No se pudo cambiar el nivel.');
        VER = Object.assign({ miGrupo: VER.miGrupo }, r); const c = r.cambio || {};
        vMsg = `Listo: ${c.alumno || vCambio} ahora está en ${c.nivel || vNuevo}.` + (c.avisado ? ' Le avisamos a la familia en la app.' : '');
        vCambio = ''; vNuevo = ''; pintarVerano(pane); window.scrollTo({top:0, behavior:'smooth'});
      }catch(x){ go.disabled = false; go.textContent = 'Guardar'; const e = pane.querySelector('.pn-nverr') || go.parentNode.appendChild(Object.assign(document.createElement('p'), {className:'pn-nverr'})); e.style.cssText = 'color:#a12c1c;margin:8px 0 0'; e.textContent = x.message; }
    };
  }

// ---------- Academia de Adultos (pasar lista, quiénes van, cambiar clase; cuentas solo admin) ----------
  let ADU = null, adSel = '', adForm = false, adTipo = 'hora', adPagoDe = '';
  const adDia = f => { const d = new Date(f + 'T12:00'); return { d: ['dom','lun','mar','mié','jue','vie','sáb'][d.getDay()], n: d.getDate() }; };
  async function loadAdultos(){
    const pane = app.querySelector('.pn-adultos'); if(!pane) return;
    if(!ADU){ ADU = cacheLeer('adultos'); if(ADU) pintarAdultos(); else pane.innerHTML = `<div class='pn-skel'></div><div class='pn-skel'></div>`; }
    else pintarAdultos();
    try{ const d = await post(Object.assign({}, auth, {accion:'adultos-panel'})); ADU = d; cacheGuardar('adultos', d); if(!escribiendo(pane)) pintarAdultos(); }
    catch(x){ if(!ADU) pane.innerHTML = `<div class='pn-msg'>${esc(x.message)}</div>`; }
  }
  async function adEnviar(body, btn){
    if(btn){ btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = '…'; }
    try{ const d = await post(Object.assign({}, auth, body)); ADU = d; cacheGuardar('adultos', d); pintarAdultos(); return true; }
    catch(x){ alert(x.message); if(btn){ btn.disabled = false; btn.textContent = btn.dataset.t; } return false; }
  }
  function pintarAdultos(){
    const pane = app.querySelector('.pn-adultos'); if(!pane || !ADU) return;
    const d = ADU, hoy = d.hoy, cls = d.clases || [];
    if(!cls.some(c => c.fecha === adSel)) adSel = (cls.find(c => c.fecha === hoy) || cls.filter(c => c.fecha <= hoy).slice(-1)[0] || cls[0] || {}).fecha || '';
    const c = cls.find(x => x.fecha === adSel), AL = d.alumnos || [];
    const estado = a => a.debe ? `<span class='pn-tag' style='background:#F6E3DF;color:#B5543C'>Debe ${clp(a.debe)}</span>` : !a.pagadas ? `<span class='pn-tag' style='background:#F1EFEC;color:#77756f'>Sin pago</span>` : !a.quedan ? `<span class='pn-tag' style='background:#F1EFEC;color:#77756f'>Usó todas</span>` : `<span class='pn-tag' style='background:#E7F4EE;color:#24684d'>Le ${a.quedan === 1 ? 'queda 1' : 'quedan ' + a.quedan}</span>`;
    let h = `<p class='pn-note' style='text-align:left;margin-top:14px'>Toca a cada persona que vino. Si alguien no está en la lista, agrégalo abajo. Aquí también cambias o cancelas una clase.</p>`;
    h += `<div style='display:flex;gap:8px;overflow-x:auto;padding:4px 0 8px'>` + cls.slice().reverse().map(x => { const k = adDia(x.fecha);
      return `<button data-adcl='${x.fecha}' style='flex:none;border:1.5px solid ${x.fecha === adSel ? '#2C2C2B' : x.fecha === hoy ? '#4F7F86' : 'rgba(44,44,43,.12)'};background:${x.fecha === adSel ? '#2C2C2B' : '#fff'};color:${x.fecha === adSel ? '#fff' : '#2C2C2B'};border-radius:14px;padding:8px 12px;font:inherit;cursor:pointer;line-height:1.15;text-align:center;${x.cancelada ? 'text-decoration:line-through;opacity:.55' : ''}'><small style='display:block;font-size:1.1rem;text-transform:uppercase;opacity:.7'>${k.d}</small><b style='font-size:1.8rem'>${k.n}</b></button>`; }).join('') + `</div>`;
    if(!c){ pane.innerHTML = h + `<div class='pn-card'><p class='pn-empty'>No hay clases cargadas.</p></div>`; return; }
    const vino = {}; (c.vino || []).forEach(v => vino[v.clave] = v.marco);
    const voy = new Set(c.voy || []);
    const fut = c.fecha > hoy;
    h += `<div class='pn-card'><div style='display:flex;justify-content:space-between;align-items:center;gap:10px'><b style='font-size:1.6rem'>${esc(c.texto)}${c.fecha === hoy ? ' · hoy' : ''}</b><span class='pn-tag'>${fut ? voy.size + (voy.size === 1 ? ' va' : ' van') : Object.keys(vino).length + (Object.keys(vino).length === 1 ? ' vino' : ' vinieron')}</span></div>
      <p style='margin:4px 0 0;font-size:1.35rem;opacity:.7'>${esc(c.horario)}${c.cambio ? ' · ' + esc(c.cambio) : ''}</p>`;
    if(!c.cancelada || fut){
      if(!adForm) h += `<p style='margin:10px 0 0'><button class='pn-link' data-adabrir>Cambiar o cancelar esta clase</button></p>`;
      else {
        const b = (t, l) => `<button data-adtipo='${t}' style='flex:1;border:1.5px solid ${adTipo === t ? '#4F7F86' : 'rgba(44,44,43,.12)'};background:#fff;border-radius:12px;padding:10px;font:inherit;font-weight:600;cursor:pointer'>${l}</button>`;
        h += `<div style='margin-top:12px;padding:14px;background:#E3EDEE;border-radius:14px'><div style='display:flex;gap:8px'>${b('hora','Otra hora')}${b('dia','Otro día')}${b('cancelar','Cancelar')}</div>
          ${adTipo !== 'cancelar' ? `<label style='display:block;margin-top:12px;font-size:1.3rem'>Hora de inicio<input id='ad-h' type='time' value='${esc(String(c.hora).padStart(5,'0'))}' class='pn-in' style='display:block;width:100%;margin-top:4px'></label>` : ''}
          ${adTipo === 'dia' ? `<label style='display:block;margin-top:12px;font-size:1.3rem'>Nuevo día<input id='ad-d' type='date' value='${c.fecha}' min='${hoy}' class='pn-in' style='display:block;width:100%;margin-top:4px'></label>` : ''}
          <label style='display:block;margin-top:12px;font-size:1.3rem'>Motivo<input id='ad-m' type='text' value='por el pronóstico' class='pn-in' style='display:block;width:100%;margin-top:4px'></label>
          <label style='display:flex;gap:8px;align-items:center;margin-top:12px;font-size:1.3rem'><input id='ad-a' type='checkbox' checked> Avisar a los alumnos al celular</label>
          <div style='display:flex;gap:8px;margin-top:14px'><button class='pn-nvgo' data-adguardar style='border:0;border-radius:999px;background:#4F7F86;color:#fff;font:inherit;font-weight:600;padding:10px 18px;cursor:pointer'>Guardar cambio</button><button class='pn-link' data-adcerrar>No cambiar</button></div></div>`;
      }
    }
    if(c.cancelada) h += `<p class='pn-note'>Esta clase está cancelada.</p></div>`;
    else if(fut){
      const van = AL.filter(a => voy.has(a.clave));
      h += `<p style='margin:14px 0 4px;font-weight:600'>${van.length ? van.length + (van.length === 1 ? ' dijo que va' : ' dijeron que van') : 'Nadie ha marcado "Voy" todavía'}</p>` + van.map(a => `<div class='pn-row' style='display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)'><b>${esc(a.nombre)}</b>${estado(a)}</div>`).join('') + `<p class='pn-note'>La lista se pasa el mismo día de la clase.</p></div>`;
    } else {
      h += `<div style='margin-top:10px;border-top:1px solid var(--line)'>` + AL.map(a => { const m = vino[a.clave];
        const sub = m && /^alumno/i.test(m) ? 'Lo marcó desde su celular' : a.agregado && !m ? 'Agregado en el Panel' : !m && voy.has(a.clave) ? 'Dijo que venía' : '';
        return `<div data-adal='${esc(a.clave)}' data-on='${m ? 1 : 0}' style='display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);cursor:pointer'><span style='flex:none;width:32px;height:32px;border-radius:9px;border:2px solid ${m ? '#3E9B76' : 'rgba(44,44,43,.22)'};background:${m ? '#3E9B76' : '#fff'};color:#fff;display:grid;place-items:center;font-weight:700'>${m ? '✓' : ''}</span><div style='flex:1;min-width:0'><b style='font-size:1.5rem'>${esc(a.nombre)}</b>${sub ? `<small style='display:block;font-size:1.2rem;opacity:.62'>${sub}</small>` : ''}</div>${estado(a)}</div>`; }).join('') +
        `</div><div style='display:flex;gap:8px;margin-top:12px'><input id='ad-nuevo' class='pn-in' placeholder='Nombre de alguien que vino' style='flex:1;min-width:0'><button data-adagregar style='border:0;border-radius:999px;background:#4F7F86;color:#fff;font:inherit;font-weight:600;padding:10px 16px;cursor:pointer'>Agregar</button></div></div>
        <p class='pn-note'>"Debe" aparece cuando alguien fue a más clases de las que pagó.</p>`;
    }
    if(d.cuentas){
      const k = d.cuentas;
      h += `<h2 style='margin:26px 0 0;font-weight:500;font-size:2rem'>Cuentas de ${esc(k.mes.split(' ')[0])}</h2>
        <div class='pn-card' style='background:#2C2C2B;color:#fff'><small style='opacity:.7'>Le toca al instructor este mes (50%)</small><div style='font-size:3rem;font-weight:600'>${clp(k.instructor)}</div></div>
        <div class='pn-card'>${[['Entró', clp(k.ingresos)], ['Comisión Mercado Pago', '− ' + clp(k.comision)], ['Neto', clp(k.ingresos - k.comision)], ['50% instructor', clp(k.instructor)], ['50% Storm', clp(k.storm)], ['Clases hechas', k.clasesHechas], ['Asistencias', k.asistencias]].map(r => `<div style='display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:1.45rem'><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}</div>
        <div class='pn-card'>` + (k.alumnos || []).map(a => `<div style='padding:10px 0;border-bottom:1px solid var(--line)'><div style='display:flex;justify-content:space-between;align-items:center;gap:8px'><div><b style='font-size:1.5rem'>${esc(a.nombre)}</b><small style='display:block;font-size:1.2rem;opacity:.62'>Fue a ${a.fue} este mes · pagó ${a.pagado ? clp(a.pagado) : 'nada aún'}</small></div><div style='display:flex;gap:6px;align-items:center'>${a.debe ? `<span class='pn-tag' style='background:#F6E3DF;color:#B5543C'>Debe ${clp(a.debe)}</span>` : ''}<button class='pn-link' data-adpagode='${esc(a.clave)}'>Anotar pago</button></div></div>
          ${adPagoDe === a.clave ? `<div style='margin-top:8px;padding:12px;background:#F6F4F1;border-radius:12px'><select id='ad-pl' class='pn-in'>${a.debeClases ? `<option value='Deuda'>Lo que debe (${a.debeClases} ${a.debeClases === 1 ? 'clase' : 'clases'}, ${clp(a.debe)})</option>` : ''}<option value='4 clases'>4 clases · ${clp(d.planes['4 clases'].monto)}</option><option value='8 clases'>8 clases · ${clp(d.planes['8 clases'].monto)}</option><option value='Suelta'>Clase suelta · ${clp(d.clase)}</option></select>
            <select id='ad-me' class='pn-in' style='margin-left:6px'><option>Transferencia</option><option>Efectivo</option></select> <button data-adpagar='${esc(a.clave)}' data-n='${a.debeClases}' style='border:0;border-radius:999px;background:#2C2C2B;color:#fff;font:inherit;font-weight:600;padding:8px 14px;cursor:pointer;margin-top:8px'>Guardar pago</button></div>` : ''}</div>`).join('') + `</div>
        <p class='pn-note'>Lo de Mercado Pago se anota solo. "Anotar pago" es para transferencias o efectivo.</p>`;
    }
    pane.innerHTML = h;
    pane.querySelectorAll('[data-adcl]').forEach(b => b.onclick = () => { adSel = b.dataset.adcl; adForm = false; pintarAdultos(); });
    const ab = pane.querySelector('[data-adabrir]'); if(ab) ab.onclick = () => { adForm = true; adTipo = 'hora'; pintarAdultos(); };
    const ac = pane.querySelector('[data-adcerrar]'); if(ac) ac.onclick = () => { adForm = false; pintarAdultos(); };
    pane.querySelectorAll('[data-adtipo]').forEach(b => b.onclick = () => { adTipo = b.dataset.adtipo; pintarAdultos(); });
    const ag = pane.querySelector('[data-adguardar]'); if(ag) ag.onclick = async () => {
      const body = {accion:'adultos-cambio', fecha:c.fecha, tipo:adTipo, motivo:pane.querySelector('#ad-m').value.trim(), avisar:pane.querySelector('#ad-a').checked};
      if(adTipo !== 'cancelar') body.hora = pane.querySelector('#ad-h').value;
      if(adTipo === 'dia') body.nueva = pane.querySelector('#ad-d').value;
      if(adTipo === 'cancelar' && !confirm('¿Cancelar la clase del ' + c.texto.toLowerCase() + '?')) return;
      if(await adEnviar(body, ag)){ adForm = false; if(body.nueva) adSel = body.nueva; pintarAdultos(); }
    };
    pane.querySelectorAll('[data-adal]').forEach(r => r.onclick = () => { r.style.opacity = .5; adEnviar({accion:'adultos-lista', fecha:c.fecha, alumno:r.dataset.adal, vino: r.dataset.on !== '1'}); });
    const an = pane.querySelector('[data-adagregar]'); if(an) an.onclick = () => { const n = pane.querySelector('#ad-nuevo').value.trim(); if(n) adEnviar({accion:'adultos-agregar', fecha:c.fecha, nombre:n}, an); };
    pane.querySelectorAll('[data-adpagode]').forEach(b => b.onclick = () => { adPagoDe = adPagoDe === b.dataset.adpagode ? '' : b.dataset.adpagode; pintarAdultos(); });
    pane.querySelectorAll('[data-adpagar]').forEach(b => b.onclick = async () => {
      let plan = pane.querySelector('#ad-pl').value, clases = 1; if(plan === 'Deuda'){ plan = 'Suelta'; clases = +b.dataset.n || 1; }
      if(await adEnviar({accion:'adultos-pago-manual', alumno:b.dataset.adpagar, plan, clases, medio:pane.querySelector('#ad-me').value}, b)){ adPagoDe = ''; pintarAdultos(); }
    });
  }
  async function load(){
    if(!auth) return login();
    let viejo = cacheLeer('anual');
    let tocado = false;
    const tocar = () => { tocado = true; };
    // Si lo guardado ya no se puede mostrar (datos viejos o de otro programa), se borra y se espera lo nuevo.
    if(viejo){ try{ render(viejo); } catch(e){ console.warn('Panel: datos guardados no sirven', e); viejo = null; try{ localStorage.removeItem(KEY+'-datos'); }catch(_){} } }
    if(viejo){ app.addEventListener('click', tocar, {once:true}); app.addEventListener('input', tocar, {once:true}); }
    else app.innerHTML = `<div class='pn-skel'></div><div class='pn-skel'></div><div class='pn-skel'></div>`;
    // Copia rápida en Cloudflare (la planilla la actualiza cada minuto): se muestra mientras Google responde.
    let listo = false;
    fetch('/api/espejo', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(Object.assign({accion:'panel'}, auth))})
      .then(r => r.json()).then(e => {
        if(listo || tocado || !e || !e.ok || !e.datos) return;
        let ms = 0; try{ ms = +localStorage.getItem(KEY+'-anual-ms') || 0; }catch(_){}
        if(viejo && e.ms <= ms) return;
        if(viejo && JSON.stringify(viejo) === JSON.stringify(e.datos)) return;
        try{ const habia = !!viejo; render(e.datos); viejo = e.datos; if(!habia){ app.addEventListener('click', tocar, {once:true}); app.addEventListener('input', tocar, {once:true}); } }catch(x){ console.warn('Panel: copia rápida no sirve', x); }
      }).catch(() => {});
    try{
      const d = await post(Object.assign({}, auth, {accion:'panel'}));
      listo = true;
      if(!d.actual && d.rol !== 'instructor') throw new Error('El programa de la planilla Anual no respondió como Panel. Revisa que esté pegado el programa de la Academia Anual.');
      if(viejo && JSON.stringify(viejo) === JSON.stringify(d)) return;
      if(!viejo || !tocado){ render(d); guardarAnual(d); return; }
      guardarAnual(d);
      // Ya estás usando el Panel: no te cambiamos la pantalla, te dejamos el botón para actualizar.
      if(!app.querySelector('.pn-nuevo')) app.insertAdjacentHTML('afterbegin', `<button class='pn-nuevo' style='display:block;width:100%;margin:0 0 10px;padding:10px;border:0;border-radius:12px;background:#0f6e74;color:#fff;font:inherit;cursor:pointer'>Hay datos nuevos · Toca para actualizar</button>`);
      app.querySelector('.pn-nuevo').onclick = () => render(d);
    }
    catch(x){
      if(/sesión|expir|acceso/i.test(x.message)){ const e = auth.email; borrar(); auth = null; return login(e, /acceso/.test(x.message) ? x.message : 'Por seguridad, vuelve a entrar.'); }
      if(!viejo) app.innerHTML = `<div class='pn-msg'>${esc(x.message)}</div>`;
    }
  }
  // Al volver a la app (por ejemplo tocando una notificación) se revisa si hay datos nuevos.
  let ultimaVuelta = Date.now();
  document.addEventListener('visibilitychange', async () => {
    if(document.visibilityState !== 'visible' || !auth || !app || Date.now() - ultimaVuelta < 30000) return;
    ultimaVuelta = Date.now();
    try{
      const d = await post(Object.assign({}, auth, {accion:'panel'}));
      if(!d.actual && d.rol !== 'instructor') return;
      const viejo = cacheLeer('anual'); if(viejo && JSON.stringify(viejo) === JSON.stringify(d)) return;
      guardarAnual(d);
      if(!escribiendo(app) && acad === 'anual') return render(d);
      if(!app.querySelector('.pn-nuevo')) app.insertAdjacentHTML('afterbegin', `<button class='pn-nuevo' style='display:block;width:100%;margin:0 0 10px;padding:10px;border:0;border-radius:12px;background:#0f6e74;color:#fff;font:inherit;cursor:pointer'>Hay datos nuevos · Toca para actualizar</button>`);
      app.querySelector('.pn-nuevo').onclick = () => render(d);
    }catch(_){}
  });
  // Dentro de la plataforma Storm (/storm/) el menú de afuera decide qué se ve.
  if(window.STORM_SHELL){
    window.StormPanel = {
      montar(el, a){ app = el; auth = a; load(); },
      ir(x){ acad = x; try{ sessionStorage.setItem(KEY + '-acad', x); }catch(_){} if(app && app.querySelector('.pn-sw')) mostrarAcad(); },
      tab(t){ tab = t; const b = app && app.querySelector(`.pn-tab[data-tab='${t}']`); if(b) b.click(); },
      alumnos: () => NOTAS,
      async alumno(nombre, que){
        tab = 'alumnos'; const b = app && app.querySelector(".pn-tab[data-tab='alumnos']"); if(b) b.click();
        await cargarNotas(); aGrupo = ''; aMsg = '';
        if(que === 'nivel'){ aCambio = nombre; aNuevo = ''; } else { ntAbierta = nombre; }
        pintarAlumnos();
        const row = [...app.querySelectorAll('[data-alumno]')].find(x => x.dataset.alumno === nombre); if(row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
      fsub(x){ fSub = x; if(app && app.querySelector('.pn-finz')) mostrarFsub(); },
      async anotar(b){ FIN = await post(Object.assign({}, auth, {accion:'movimiento', mes: fMes}, b)); fMes = FIN.mes; if(app && app.querySelector("[data-pane='finanzas']")) pintarFinanzas(); return FIN; },
      fin: () => FIN,
      datos: () => cacheLeer('anual'),
      verano: () => VER || cacheLeer('verano')
    };
  } else load();
})();
