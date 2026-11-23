/* Storm · Rentas y Notas (22-11-2026)
   Rentas: qué tablas y trajes están afuera, medio día o día completo, y marcar cuando vuelven.
   Notas: avisos para el equipo (se marcan como listos) e información fija que hay que saber.
   Lo usan la recepción y los administradores. Habla con /api/reservas (Cloudflare). */
(() => {
  const API = '/api/reservas';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wa = t => { let n = String(t || '').replace(/\D/g, ''); if (n.length === 9 && n[0] === '9') n = '56' + n; if (n.length === 8) n = '569' + n; return n.length >= 10 ? n : ''; };
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const sv = d => `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>${d}</svg>`;
  const ICO = {
    tabla: sv("<path d='M12 2.5c3.5 3 4.5 9 3 14.5-.6 2.2-1.6 3.8-3 4.5-1.4-.7-2.4-2.3-3-4.5-1.5-5.5-.5-11.5 3-14.5Z'/><path d='M12 7v10'/>"),
    traje: sv("<path d='M9 3h6l1 3 3 2-1 5-2-1v9H8v-9l-2 1-1-5 3-2 1-3Z'/><path d='M12 6v6'/>"),
    ok: sv("<path d='m5 12.5 4.5 4.5L19 7.5'/>"),
    wa: `<svg viewBox='0 0 24 24' fill='currentColor'><path d='M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.6 14.1c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.7-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2.1 1.1 1 2.1 1.3 2.4 1.4.3.2.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.4Z'/></svg>`,
    alerta: sv("<path d='M12 3 2.5 20h19L12 3Z'/><path d='M12 10v4.5M12 17.5v.01'/>"),
    nota: sv("<path d='M5 4h14v12l-4 4H5z'/><path d='M15 20v-4h4M8.5 9h7M8.5 12.5h5'/>")
  };
  const CSS = `
  .rn{--line:rgba(44,44,43,.12);--ink:#2C2C2B;color:var(--ink);max-width:760px}
  .rn-go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:0;border-radius:999px;background:#0f6e74;color:#fff;font:inherit;font-weight:700;font-size:1.6rem;padding:15px;cursor:pointer}
  .rn-go svg{width:22px;height:22px;stroke-width:2.4}.rn-go[disabled]{opacity:.6}
  .rn-h{font-size:1.25rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0f6e74;margin:22px 0 8px;display:flex;align-items:center;gap:8px}
  .rn-h em{font-style:normal;background:#0f6e74;color:#fff;border-radius:999px;padding:1px 9px;letter-spacing:0}
  .rn-h.gris{color:#8a8986}
  .rn-c{background:#fff;border:1px solid var(--line);border-left:5px solid #0f6e74;border-radius:16px;padding:14px;margin-top:8px}
  .rn-c.tarde{border-left-color:#c0503a}.rn-c.vuelta{border-left-color:#c9c6c0;opacity:.75}
  .rn-top{display:flex;align-items:flex-start;gap:12px}
  .rn-ic{flex:none;display:flex;gap:4px}.rn-ic i{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:#E3F1F1;color:#0f6e74;font-style:normal;position:relative}
  .rn-ic i svg{width:24px;height:24px}.rn-ic i b{position:absolute;right:-5px;top:-5px;background:#2C2C2B;color:#fff;border-radius:999px;font-size:1.05rem;min-width:19px;height:19px;display:grid;place-items:center;padding:0 4px}
  .rn-c.vuelta .rn-ic i{background:#eeece8;color:#8a8986}
  .rn-tx{flex:1;min-width:0}.rn-tx b{display:block;font-size:1.6rem;font-weight:600}.rn-tx small{display:block;font-size:1.3rem;color:#6d6c68;margin-top:2px}
  .rn-tx .rn-nt{color:#2C2C2B;font-style:italic}
  .rn-tag{flex:none;border-radius:999px;padding:4px 10px;font-size:1.1rem;font-weight:700;background:#E3F1F1;color:#0f6e74;white-space:nowrap}
  .rn-tag.debe{background:#fbeee2;color:#b5662b}.rn-tag.tarde{background:#fbe3dd;color:#a6402c}
  .rn-acc{display:flex;gap:8px;margin-top:12px;align-items:center}
  .rn-vol{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;background:#2f9a6a;color:#fff;font:inherit;font-weight:700;font-size:1.5rem;padding:12px;cursor:pointer}
  .rn-vol svg{width:20px;height:20px;stroke-width:2.6}
  .rn-wa{flex:none;width:46px;height:46px;border-radius:50%;background:#25D366;color:#fff;display:grid;place-items:center}.rn-wa svg{width:22px;height:22px}
  .rn-lk{border:0;background:none;font:inherit;font-size:1.3rem;color:#0f6e74;text-decoration:underline;cursor:pointer;padding:6px 4px}
  .rn-lk.rojo{color:#a6402c}
  .rn-pg{border:1.5px solid #e0a03a;background:#fff;color:#b5662b;border-radius:999px;font:inherit;font-weight:700;font-size:1.35rem;padding:10px 14px;cursor:pointer}
  .rn-vacio{background:#fff;border:1px dashed var(--line);border-radius:14px;padding:18px;text-align:center;color:#8a8986;font-size:1.4rem;margin-top:8px}
  .rn-res{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .rn-res div{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px}
  .rn-res b{display:block;font-size:2.2rem;line-height:1.1}.rn-res span{font-size:1.25rem;color:#6d6c68}
  @media (min-width:640px){.rn-res{grid-template-columns:repeat(4,minmax(0,1fr))}}
  /* formulario */
  .rn-f{--line:rgba(44,44,43,.12);--ink:#2C2C2B;color:var(--ink);position:fixed;inset:0;z-index:40;background:rgba(30,30,28,.45);display:flex;align-items:flex-end}
  .rn-f>div{position:relative;background:#fff;padding:20px 16px calc(18px + env(safe-area-inset-bottom));max-height:92vh;overflow:auto;width:100%;border-radius:20px 20px 0 0;box-sizing:border-box}
  .rn-f h2{margin:0 0 6px;font-size:2rem;font-weight:600}
  .rn-q{margin:16px 0 8px;font-size:1.25rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8a8986}
  .rn-st{display:grid;grid-template-columns:1fr;gap:8px}
  .rn-st>div{border:1.5px solid var(--line);border-radius:16px;padding:10px;display:flex;align-items:center;gap:8px}
  .rn-st>div.on{border-color:#0f6e74;background:#E3F1F1}
  .rn-st i{color:#0f6e74;display:flex}.rn-st i svg{width:26px;height:26px}
  .rn-st span{flex:1;font-weight:600;font-size:1.45rem}
  .rn-st button{width:44px;height:44px;border-radius:50%;border:1.5px solid var(--line);background:#fff;font:inherit;font-size:2rem;line-height:1;color:#0f6e74;cursor:pointer;display:grid;place-items:center;padding:0}
  .rn-st b{min-width:20px;text-align:center;font-size:1.8rem}
  .rn-ch{display:flex;flex-wrap:wrap;gap:8px}
  .rn-ch button{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:11px 16px;font:inherit;font-size:1.45rem;font-weight:600;color:var(--ink);cursor:pointer}
  .rn-ch button.on{background:#0f6e74;border-color:#0f6e74;color:#fff}
  .rn-ch.dos button{flex:1}
  .rn-in{width:100%;box-sizing:border-box;border:1px solid #d9d6d0;border-radius:12px;padding:12px;font:inherit;font-size:1.5rem;margin-top:8px;background:#fff;color:var(--ink)}
  .rn-in:focus{outline:none;border-color:#0f6e74}
  textarea.rn-in{min-height:96px;resize:vertical}
  .rn-err{margin:8px 0 0;color:#a6402c;font-size:1.35rem;text-align:center;min-height:1em}
  .rn-x{position:absolute;right:12px;top:12px;width:38px;height:38px;border-radius:50%;border:0;background:#f3f1ec;font-size:1.5rem;cursor:pointer}
  @media (min-width:1000px){.rn-f{align-items:center;justify-content:center}.rn-f>div{max-width:520px;border-radius:22px}}
  /* notas */
  .rn-tabs{display:flex;gap:4px;padding:4px;background:#fff;border:1px solid var(--line);border-radius:999px;margin:0 0 14px}
  .rn-tabs button{flex:1;border:0;background:none;border-radius:999px;padding:10px 14px;font:inherit;font-size:1.45rem;font-weight:600;color:var(--ink);cursor:pointer}
  .rn-tabs button.on{background:#0f6e74;color:#fff}
  .rn-tabs em{font-style:normal;background:#c0503a;color:#fff;border-radius:999px;padding:0 7px;margin-left:6px;font-size:1.15rem}
  .rn-new{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px}
  .rn-new textarea{margin-top:0;border:0;padding:6px;min-height:70px}
  .rn-new .rn-row{display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap}
  .rn-imp{display:inline-flex;align-items:center;gap:6px;border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:9px 14px;font:inherit;font-size:1.35rem;font-weight:600;color:var(--ink);cursor:pointer}
  .rn-imp svg{width:18px;height:18px}.rn-imp.on{background:#fbe3dd;border-color:#c0503a;color:#a6402c}
  .rn-new .rn-go{width:auto;flex:1;padding:12px 18px;font-size:1.5rem}
  .rn-n{background:#fff;border:1px solid var(--line);border-left:5px solid #0f6e74;border-radius:16px;padding:14px;margin-top:8px}
  .rn-n.imp{border-left-color:#c0503a;background:#fffaf8}.rn-n.lista{opacity:.6;border-left-color:#c9c6c0}
  .rn-n.info{border-left-color:#61A1C8}
  .rn-n p{margin:0;font-size:1.55rem;line-height:1.45;white-space:pre-wrap;word-break:break-word}
  .rn-n.lista p{text-decoration:line-through}
  .rn-n small{display:block;margin-top:8px;font-size:1.2rem;color:#8a8986}
  .rn-n .rn-it{display:inline-flex;align-items:center;gap:5px;color:#a6402c;font-weight:700;font-size:1.15rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}.rn-n .rn-it svg{width:16px;height:16px}
  .rn-n .rn-acc{margin-top:10px;flex-wrap:wrap}
  .rn-n .rn-vol{flex:none;padding:10px 18px;font-size:1.4rem}
  .rn-ed{width:100%}
  /* tienda y cierre (23-11) */
  .rn-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .rn-go.sec{background:#fff;color:#0f6e74;border:2px solid #0f6e74}
  .rn-pr{display:grid;grid-template-columns:1fr;gap:8px}
  .rn-pr>div{border:1.5px solid var(--line);border-radius:16px;padding:10px 10px 10px 14px;display:flex;align-items:center;gap:8px}
  .rn-pr>div.on{border-color:#0f6e74;background:#E3F1F1}
  .rn-pr span{flex:1;font-weight:600;font-size:1.45rem}.rn-pr span small{display:block;font-weight:400;color:#6d6c68;font-size:1.25rem}
  .rn-pr button{width:44px;height:44px;border-radius:50%;border:1.5px solid var(--line);background:#fff;font:inherit;font-size:2rem;line-height:1;color:#0f6e74;cursor:pointer;display:grid;place-items:center;padding:0}
  .rn-pr b{min-width:20px;text-align:center;font-size:1.8rem}
  .rn-tot{display:flex;justify-content:space-between;align-items:baseline;margin-top:16px;font-size:1.5rem}.rn-tot b{font-size:2.4rem}
  .rn-v{display:flex;justify-content:space-between;gap:10px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:11px 14px;margin-top:6px;font-size:1.4rem}
  .rn-v span{min-width:0}.rn-v small{display:block;color:#8a8986;font-size:1.2rem}.rn-v b{white-space:nowrap}
  .rn-ci{background:#fff;border:1px solid var(--line);border-radius:16px;padding:6px 14px;margin-top:8px}
  .rn-ci>div{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:1.45rem}.rn-ci>div:last-child{border-bottom:0}
  .rn-ok{color:#2f9a6a;font-weight:700}.rn-mal{color:#a6402c;font-weight:700}
  .rn-big{font-size:2rem;text-align:center;font-weight:700;margin-top:10px}
  `;
  let auth = null, R = null, N = null, cargando = null, alCambiar = () => {}, elR = null, elN = null, tabN = 'aviso', verListas = false, verDev = false, nueva = null;

  async function post(body) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, auth, body)) });
    let d; try { d = await r.json(); } catch (_) { throw new Error('No se pudo conectar. Intenta de nuevo.'); }
    if (!d.ok) throw new Error(d.error || 'Error');
    return d;
  }
  const KEY = 'storm-rn-datos';
  const guardarCache = () => { try { localStorage.setItem(KEY, JSON.stringify({ email: auth.email, R, N })); } catch (_) {} };
  const leerCache = () => { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && c.email === auth.email) { R = c.R; N = c.N; } } catch (_) {} };

  function montar(r, n, a, cb) {
    elR = r; elN = n; auth = a; alCambiar = cb || alCambiar;
    if (!document.getElementById('rn-css')) { const s = document.createElement('style'); s.id = 'rn-css'; s.textContent = CSS; document.head.appendChild(s); }
    leerCache(); pintar();
  }
  function cargar() {
    if (!auth) return Promise.resolve();
    if (cargando) return cargando;
    cargando = Promise.all([post({ accion: 'rentas' }), post({ accion: 'notas' })])
      .then(([a, b]) => { R = a; N = b; guardarCache(); pintar(); alCambiar(); })
      .catch(() => {}).finally(() => { cargando = null; });
    return cargando;
  }
  async function hacer(acc, body, btn) {
    if (btn) { btn.disabled = true; btn.dataset.t = btn.innerHTML; btn.textContent = 'Guardando…'; }
    try { const d = await post(Object.assign({ accion: acc }, body)); if (acc === 'rentas' || acc === 'tienda') R = d; else N = d; guardarCache(); pintar(); alCambiar(); return true; }
    catch (x) { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.t; } alert(x.message); return false; }
  }
  const pintar = () => { pintarRentas(); pintarNotas(); };
  const clp = n => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n || 0)).toLocaleString('es-CL');
  const pagoT = p => p === 'POS' ? 'Tarjeta' : p;
  const PAGOS = [['POS', 'Tarjeta'], ['Efectivo', 'Efectivo'], ['Transferencia', 'Transferencia']];

  // ---------- Rentas ----------
  const hoy = () => (R && R.hoy) || (N && N.hoy) || new Date().toISOString().slice(0, 10);
  const fechaC = f => { const [y, m, d] = f.split('-'); return DIAS[new Date(+y, m - 1, +d).getDay()] + ' ' + (+d) + '/' + (+m); };
  const queEs = x => [x.tablas ? x.tablas + (x.tablas === 1 ? ' tabla' : ' tablas') : '', x.trajes ? x.trajes + (x.trajes === 1 ? ' traje' : ' trajes') : ''].filter(Boolean).join(' y ');
  const tiempoT = t => t === 'dia' ? 'Día completo' : 'Medio día';
  const hace = (f, h) => { if (f !== hoy()) return ''; const [a, b] = h.split(':').map(Number), d = new Date(), m = d.getHours() * 60 + d.getMinutes() - (a * 60 + b); return m < 60 ? ' (hace ' + Math.max(0, m) + ' min)' : ' (hace ' + Math.floor(m / 60) + ' h' + (m % 60 >= 30 ? ' y media' : '') + ')'; };
  const afuera = () => R ? R.rentas.filter(x => !x.devuelta) : [];
  const tarde = x => !x.devuelta && x.fecha < hoy();
  function tarjeta(x) {
    const t = tarde(x), wl = wa(x.telefono);
    const msg = encodeURIComponent('Hola ' + x.nombre.split(' ')[0] + ', te escribimos de Storm por ' + (x.tablas && x.trajes ? 'el equipo' : x.tablas ? (x.tablas > 1 ? 'las tablas' : 'la tabla') : (x.trajes > 1 ? 'los trajes' : 'el traje')) + ' que arrendaste. ¿A qué hora lo traes? 🌊');
    return `<div class='rn-c${t ? ' tarde' : ''}${x.devuelta ? ' vuelta' : ''}'>
      <div class='rn-top'><div class='rn-ic'>${x.tablas ? `<i>${ICO.tabla}${x.tablas > 1 ? `<b>${x.tablas}</b>` : ''}</i>` : ''}${x.trajes ? `<i>${ICO.traje}${x.trajes > 1 ? `<b>${x.trajes}</b>` : ''}</i>` : ''}</div>
        <div class='rn-tx'><b>${esc(x.nombre)}</b><small>${esc(queEs(x))} · ${tiempoT(x.tiempo)}</small>
          <small>${x.devuelta ? 'Salió ' + esc(x.hora) + ' · volvió ' + esc(x.devueltaHora) : (x.fecha === hoy() ? 'Salió hoy ' + esc(x.hora) + hace(x.fecha, x.hora) : 'Salió ' + fechaC(x.fecha) + ' ' + esc(x.hora))}${x.por ? ' · anotó ' + esc(x.por) : ''}</small>
          ${x.nota ? `<small class='rn-nt'>${esc(x.nota)}</small>` : ''}</div>
        ${t ? `<span class='rn-tag tarde'>No ha vuelto</span>` : x.pago === 'Falta pagar' ? `<span class='rn-tag debe'>Falta pagar</span>` : `<span class='rn-tag'>${esc(pagoT(x.pago))}${x.monto ? ' ' + clp(x.monto) : ''}</span>`}</div>
      ${x.devuelta ? `<div class='rn-acc'><button class='rn-lk' data-op='deshacer' data-id='${esc(x.id)}'>No ha vuelto (deshacer)</button></div>`
        : `<div class='rn-acc'><button class='rn-vol' data-op='devuelta' data-id='${esc(x.id)}'>${ICO.ok}Volvió</button>${x.pago === 'Falta pagar' ? `<button class='rn-pg' data-pagar='${esc(x.id)}'>Pagó</button>` : ''}${wl ? `<a class='rn-wa' href='https://wa.me/${wl}?text=${msg}' target='_blank' rel='noopener' aria-label='WhatsApp'>${ICO.wa}</a>` : ''}</div>
          <div class='rn-acc' style='margin-top:4px'><button class='rn-lk rojo' data-op='borrar' data-id='${esc(x.id)}'>Borrar (me equivoqué)</button></div>`}
    </div>`;
  }
  function pintarRentas() {
    if (!elR) return;
    if (!R) { elR.innerHTML = `<div class='rn'><div class='pn-skel'></div><div class='pn-skel'></div></div>`; return; }
    const af = afuera().sort((a, b) => (tarde(b) - tarde(a)) || ((a.fecha + a.hora) < (b.fecha + b.hora) ? -1 : 1));
    const dev = R.rentas.filter(x => x.devuelta).sort((a, b) => (a.fecha + a.hora) < (b.fecha + b.hora) ? 1 : -1);
    const devHoy = dev.filter(x => x.fecha === hoy());
    const mes = R.rentas.filter(x => x.fecha.slice(0, 7) === hoy().slice(0, 7));
    const sum = (l, k, t) => l.filter(x => !t || x.tiempo === t).reduce((s, x) => s + (x[k] || 0), 0);
    const nT = af.reduce((s, x) => s + x.tablas, 0), nJ = af.reduce((s, x) => s + x.trajes, 0);
    const vHoy = (R.ventas || []).filter(v => v.fecha === hoy());
    let h = `<div class='rn'><div class='rn-2'><button class='rn-go' data-rnnueva>${sv("<path d='M12 5v14M5 12h14'/>")}Nueva renta</button><button class='rn-go sec' data-tienda>${sv("<path d='M12 5v14M5 12h14'/>")}Venta tienda</button></div>
      <p class='rn-h'>Afuera ahora ${af.length ? `<em>${[nT ? nT + (nT === 1 ? ' tabla' : ' tablas') : '', nJ ? nJ + (nJ === 1 ? ' traje' : ' trajes') : ''].filter(Boolean).join(' · ')}</em>` : ''}</p>
      ${af.length ? af.map(tarjeta).join('') : `<div class='rn-vacio'>No hay tablas ni trajes afuera. 🌊</div>`}`;
    const otras = verDev ? dev : devHoy;
    h += `<p class='rn-h gris'>${verDev ? 'Volvieron (últimos 30 días)' : 'Volvieron hoy'}</p>` + (otras.length ? otras.map(tarjeta).join('') : `<div class='rn-vacio'>Todavía nada.</div>`)
      + (dev.length > devHoy.length || verDev ? `<button class='rn-lk' data-verdev>${verDev ? 'Ver solo las de hoy' : 'Ver días anteriores'}</button>` : '');
    h += `<p class='rn-h gris'>Este mes</p><div class='rn-res'>
      <div><b>${sum(mes, 'tablas', 'medio')}</b><span>tablas medio día</span></div><div><b>${sum(mes, 'tablas', 'dia')}</b><span>tablas día completo</span></div>
      <div><b>${sum(mes, 'trajes', 'medio')}</b><span>trajes medio día</span></div><div><b>${sum(mes, 'trajes', 'dia')}</b><span>trajes día completo</span></div></div>
      <p class='rn-h'>Vendido hoy en tienda y daños ${vHoy.length ? `<em>${clp(vHoy.reduce((a, v) => a + v.monto, 0))}</em>` : ''}</p>
      ${vHoy.length ? vHoy.map(v => `<div class='rn-v'><span>${esc(v.detalle)}<small>${esc(v.hora)} · ${esc(pagoT(v.pago))}${v.por ? ' · ' + esc(v.por) : ''}</small></span><b>${clp(v.monto)}</b></div>`).join('') + `<button class='rn-lk rojo' data-vborrar>Borrar una venta (me equivoqué)</button>` : `<div class='rn-vacio'>Todavía nada.</div>`}
      <p class='rn-h'>Cierre del día</p>
      <button class='rn-go' data-cierre style='margin-top:4px'>${ICO.ok}Cerrar el día</button>
      <p style='font-size:1.2rem;color:#8a8986;margin:8px 2px 0'>Cobra en la máquina Tuu y anótalo aquí al tiro. Al final del día toca Cerrar el día.</p></div>`;
    elR.innerHTML = h;
    elR.querySelector('[data-rnnueva]').onclick = () => abrirNueva();
    elR.querySelector('[data-tienda]').onclick = () => abrirTienda();
    elR.querySelector('[data-cierre]').onclick = () => abrirCierre();
    const vb = elR.querySelector('[data-vborrar]'); if (vb) vb.onclick = () => borrarVenta();
    const vd = elR.querySelector('[data-verdev]'); if (vd) vd.onclick = () => { verDev = !verDev; pintarRentas(); };
    elR.querySelectorAll('[data-op]').forEach(b => b.onclick = () => {
      if (b.dataset.op === 'borrar' && !confirm('¿Borrar esta renta? Úsalo solo si la anotaste por error.')) return;
      hacer('rentas', { op: b.dataset.op, id: b.dataset.id }, b);
    });
    elR.querySelectorAll('[data-pagar]').forEach(b => b.onclick = () => elegirPago(b.dataset.pagar));
  }
  function elegirPago(id) {
    const w = document.createElement('div'); w.className = 'rn-f';
    w.innerHTML = `<div><button class='rn-x' aria-label='Cerrar'>✕</button><h2>¿Cómo pagó?</h2><div class='rn-ch dos' style='margin-top:14px'>${PAGOS.map(([p, t]) => `<button data-p='${p}'>${t}</button>`).join('')}</div></div>`;
    document.body.appendChild(w);
    w.onclick = async e => { if (e.target === w || e.target.closest('.rn-x')) return w.remove(); const b = e.target.closest('[data-p]'); if (b && await hacer('rentas', { op: 'pago', id, pago: b.dataset.p }, b)) w.remove(); };
  }
  function abrirNueva() {
    nueva = { tablas: 0, trajes: 0, tiempo: '', pago: '', nombre: '', telefono: '', nota: '', monto: '', montoAMano: false };
    const precio = () => (nueva.tablas + nueva.trajes) * (nueva.tiempo === 'dia' ? 20000 : 10000);
    const w = document.createElement('div'); w.className = 'rn-f'; document.body.appendChild(w);
    const leer = () => { const mm = w.querySelector('#rn-monto'); if (mm && mm.value.replace(/\D/g, '') !== String(nueva.mostrado)) { nueva.monto = mm.value.replace(/\D/g, ''); nueva.montoAMano = true; } nueva.nombre = w.querySelector('#rn-nom').value; nueva.telefono = w.querySelector('#rn-tel').value; nueva.nota = w.querySelector('#rn-nota').value; };
    const p = () => {
      w.innerHTML = `<div><button class='rn-x' aria-label='Cerrar'>✕</button><h2>Nueva renta</h2>
        <p class='rn-q'>¿Qué se lleva?</p>
        <div class='rn-st'>${[['tablas', 'Tabla', ICO.tabla], ['trajes', 'Traje', ICO.traje]].map(([k, t, ic]) => `<div class='${nueva[k] ? 'on' : ''}'><i>${ic}</i><span>${t}</span><button data-m='${k}' aria-label='Menos'>−</button><b>${nueva[k]}</b><button data-p='${k}' aria-label='Más'>+</button></div>`).join('')}</div>
        <p class='rn-q'>¿Cuánto tiempo?</p>
        <div class='rn-ch dos'>${[['medio', 'Medio día'], ['dia', 'Día completo']].map(([k, t]) => `<button class='${nueva.tiempo === k ? 'on' : ''}' data-t='${k}'>${t}</button>`).join('')}</div>
        <p class='rn-q'>¿Cómo pagó?</p>
        <div class='rn-ch'>${PAGOS.concat([['Falta pagar', 'Falta pagar']]).map(([k, t]) => `<button class='${nueva.pago === k ? 'on' : ''}' data-pg='${k}'>${t}</button>`).join('')}</div>
        <p class='rn-q'>¿Cuánto pagó?</p>
        <input id='rn-monto' class='rn-in' inputmode='numeric' placeholder='Monto' value='${nueva.mostrado = nueva.montoAMano ? nueva.monto : (nueva.tiempo && (nueva.tablas + nueva.trajes) ? precio() : '')}'>
        <p class='rn-q'>¿Quién arrienda?</p>
        <input id='rn-nom' class='rn-in' placeholder='Nombre' autocomplete='off' value='${esc(nueva.nombre)}'>
        <input id='rn-tel' class='rn-in' placeholder='Teléfono (para avisarle si no vuelve)' inputmode='tel' autocomplete='off' value='${esc(nueva.telefono)}'>
        <input id='rn-nota' class='rn-in' placeholder='Nota (ej: tabla azul 8’0, traje talla M, dejó carnet)' autocomplete='off' value='${esc(nueva.nota)}'>
        <button class='rn-go' data-guardar style='margin-top:18px'>Guardar renta</button><p class='rn-err'></p></div>`;
    };
    p();
    w.onclick = async e => {
      if (e.target === w || e.target.closest('.rn-x')) return w.remove();
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.m || b.dataset.p) { leer(); const k = b.dataset.m || b.dataset.p; nueva[k] = Math.max(0, Math.min(20, nueva[k] + (b.dataset.m ? -1 : 1))); return p(); }
      if (b.dataset.t) { leer(); nueva.tiempo = b.dataset.t; return p(); }
      if (b.dataset.pg) { leer(); nueva.pago = b.dataset.pg; return p(); }
      if (b.dataset.guardar !== undefined) {
        leer(); const er = w.querySelector('.rn-err');
        if (!nueva.tablas && !nueva.trajes) return er.textContent = 'Toca + en tabla o traje.';
        if (!nueva.tiempo) return er.textContent = 'Elige medio día o día completo.';
        if (!nueva.pago) return er.textContent = 'Elige cómo pagó.';
        const mt = w.querySelector('#rn-monto').value.replace(/\D/g, ''); if (!mt && nueva.pago !== 'Falta pagar') return er.textContent = 'Escribe cuánto pagó.';
        nueva.monto = mt;
        if (nueva.nombre.trim().length < 2) { er.textContent = 'Escribe el nombre.'; return w.querySelector('#rn-nom').focus(); }
        b.disabled = true; b.textContent = 'Guardando…';
        try { R = await post(Object.assign({ accion: 'rentas', op: 'nueva' }, nueva)); guardarCache(); w.remove(); pintar(); alCambiar(); }
        catch (x) { b.disabled = false; b.textContent = 'Guardar renta'; er.textContent = x.message; }
      }
    };
  }

  // ---------- Tienda (Isidora 23-11): se anota qué se vendió al cobrar ----------
  function hoja(html) { const w = document.createElement('div'); w.className = 'rn-f'; w.innerHTML = `<div><button class='rn-x' aria-label='Cerrar'>✕</button>${html}</div>`; document.body.appendChild(w); return w; }
  function abrirTienda() {
    const v = { cant: {}, pago: '', otro: false, dano: false };
    const w = document.createElement('div'); w.className = 'rn-f'; document.body.appendChild(w);
    const val = id => { const e = w.querySelector(id); return e ? e.value : ''; };
    const guarda = () => { ['#rn-od', '#rn-om', '#rn-dd', '#rn-dm'].forEach(k => { const e = w.querySelector(k); if (e) v[k] = e.value; }); };
    const num = t => Number(String(t || '').replace(/\D/g, '')) || 0;
    const total = () => (R.productos || []).reduce((t, p) => t + p.precio * (v.cant[p.id] || 0), 0) + (v.otro ? num(v['#rn-om']) : 0) + (v.dano ? num(v['#rn-dm']) : 0);
    const p = () => {
      w.innerHTML = `<div><button class='rn-x' aria-label='Cerrar'>✕</button><h2>Venta tienda</h2>
        <p class='rn-q'>¿Qué se vendió?</p>
        <div class='rn-pr'>${(R.productos || []).map(x => `<div class='${v.cant[x.id] ? 'on' : ''}'><span>${esc(x.nombre)}<small>${clp(x.precio)}</small></span><button data-m='${esc(x.id)}' aria-label='Menos'>−</button><b>${v.cant[x.id] || 0}</b><button data-p='${esc(x.id)}' aria-label='Más'>+</button></div>`).join('')}</div>
        <div class='rn-ch' style='margin-top:10px'><button class='${v.otro ? 'on' : ''}' data-otro>Otro producto</button><button class='${v.dano ? 'on' : ''}' data-dano>Cobro por daño</button></div>
        ${v.otro ? `<input id='rn-od' class='rn-in' placeholder='¿Qué producto?' value='${esc(v['#rn-od'] || '')}'><input id='rn-om' class='rn-in' inputmode='numeric' placeholder='Precio' value='${esc(v['#rn-om'] || '')}'>` : ''}
        ${v.dano ? `<input id='rn-dd' class='rn-in' placeholder='¿Qué se rompió? (ej: tabla 8’0 quebrada)' value='${esc(v['#rn-dd'] || '')}'><input id='rn-dm' class='rn-in' inputmode='numeric' placeholder='Monto cobrado' value='${esc(v['#rn-dm'] || '')}'>` : ''}
        <div class='rn-tot'><span>Total</span><b>${clp(total())}</b></div>
        <p class='rn-q'>¿Cómo pagó?</p>
        <div class='rn-ch dos'>${PAGOS.map(([k, t]) => `<button class='${v.pago === k ? 'on' : ''}' data-pg='${k}'>${t}</button>`).join('')}</div>
        <button class='rn-go' data-guardar style='margin-top:18px'>Guardar venta</button><p class='rn-err'></p>
        ${R.admin ? `<button class='rn-lk' data-editar style='display:block;margin:8px auto 0'>Editar productos y precios</button>` : ''}</div>`;
      w.querySelectorAll('#rn-om, #rn-dm').forEach(e => e.oninput = () => { guarda(); w.querySelector('.rn-tot b').textContent = clp(total()); });
    };
    p();
    w.onclick = async e => {
      if (e.target === w || e.target.closest('.rn-x')) return w.remove();
      const b = e.target.closest('button'); if (!b) return; guarda();
      if (b.dataset.m || b.dataset.p) { const k = b.dataset.m || b.dataset.p; v.cant[k] = Math.max(0, (v.cant[k] || 0) + (b.dataset.m ? -1 : 1)); return p(); }
      if (b.dataset.otro !== undefined) { v.otro = !v.otro; return p(); }
      if (b.dataset.dano !== undefined) { v.dano = !v.dano; return p(); }
      if (b.dataset.pg) { v.pago = b.dataset.pg; return p(); }
      if (b.dataset.editar !== undefined) { w.remove(); return editarProductos(); }
      if (b.dataset.guardar !== undefined) {
        const er = w.querySelector('.rn-err');
        if (!total()) return er.textContent = 'Toca + en lo que se vendió.';
        if (!v.pago) return er.textContent = 'Elige cómo pagó.';
        b.disabled = true; b.textContent = 'Guardando…';
        try { R = await post({ accion: 'tienda', op: 'venta', pago: v.pago, items: Object.keys(v.cant).map(id => ({ id, cant: v.cant[id] })), otroDetalle: v.otro ? v['#rn-od'] : '', otroMonto: v.otro ? v['#rn-om'] : '', danoDetalle: v.dano ? v['#rn-dd'] : '', danoMonto: v.dano ? v['#rn-dm'] : '' }); guardarCache(); w.remove(); pintar(); alCambiar(); }
        catch (x) { b.disabled = false; b.textContent = 'Guardar venta'; er.textContent = x.message; }
      }
    };
  }
  function editarProductos() {
    const w = hoja('');
    const p = () => {
      w.firstChild.innerHTML = `<button class='rn-x' aria-label='Cerrar'>✕</button><h2>Productos de la tienda</h2><p style='font-size:1.3rem;color:#6d6c68;margin:0 0 6px'>Lo que aparece al anotar una venta.</p>
        ${(R.productos || []).map(x => `<div class='rn-v' data-pid='${esc(x.id)}'><span style='flex:1'><input class='rn-in' data-n value='${esc(x.nombre)}' style='margin:0 0 6px'><input class='rn-in' data-pr inputmode='numeric' value='${x.precio}' style='margin:0'></span><span style='display:flex;flex-direction:column;gap:4px'><button class='rn-pg' data-gd>Guardar</button><button class='rn-lk rojo' data-q>Quitar</button></span></div>`).join('')}
        <p class='rn-q'>Agregar producto</p><input class='rn-in' id='rn-nn' placeholder='Nombre (ej: Leash 7’)'><input class='rn-in' id='rn-np' inputmode='numeric' placeholder='Precio'>
        <button class='rn-go' data-add style='margin-top:12px'>Agregar</button><p class='rn-err'></p>`;
    };
    p();
    w.onclick = async e => {
      if (e.target === w || e.target.closest('.rn-x')) return w.remove();
      const b = e.target.closest('button'); if (!b) return; const er = w.querySelector('.rn-err'), fila = b.closest('[data-pid]');
      try {
        if (b.dataset.add !== undefined) R = await post({ accion: 'tienda', op: 'producto', nombre: w.querySelector('#rn-nn').value, precio: w.querySelector('#rn-np').value });
        else if (fila && b.dataset.gd !== undefined) R = await post({ accion: 'tienda', op: 'producto', id: fila.dataset.pid, nombre: fila.querySelector('[data-n]').value, precio: fila.querySelector('[data-pr]').value });
        else if (fila && b.dataset.q !== undefined) { if (!confirm('¿Quitar este producto de la lista?')) return; R = await post({ accion: 'tienda', op: 'quitar', id: fila.dataset.pid }); }
        else return;
        guardarCache(); p(); pintar();
      } catch (x) { er.textContent = x.message; }
    };
  }
  function borrarVenta() {
    const vHoy = (R.ventas || []).filter(v => v.fecha === hoy());
    const w = hoja(`<h2>¿Cuál borro?</h2>${vHoy.map(v => `<button class='rn-v' data-id='${esc(v.id)}' style='width:100%;font:inherit;cursor:pointer;text-align:left'><span>${esc(v.detalle)}<small>${esc(v.hora)} · ${esc(pagoT(v.pago))}</small></span><b>${clp(v.monto)}</b></button>`).join('')}`);
    w.onclick = async e => { if (e.target === w || e.target.closest('.rn-x')) return w.remove(); const b = e.target.closest('[data-id]'); if (b && confirm('¿Borrar esta venta?') && await hacer('tienda', { op: 'borrar', id: b.dataset.id }, b)) w.remove(); };
  }
  // ---------- Cierre del día: se cuenta la caja y se compara con lo anotado ----------
  async function abrirCierre() {
    const w = hoja(`<h2>Cierre del día</h2><div class='pn-skel'></div>`);
    w.onclick = e => { if (e.target === w || e.target.closest('.rn-x')) w.remove(); };
    let c; try { c = await post({ accion: 'cierre' }); } catch (x) { w.firstChild.innerHTML += `<p class='rn-err'>${esc(x.message)}</p>`; return; }
    const caja = w.firstChild;
    const pinta = () => {
      const tOk = c.tuu === c.tarjeta, ci = c.cierre;
      caja.innerHTML = `<button class='rn-x' aria-label='Cerrar'>✕</button><h2>Cierre del día</h2>
        <p class='rn-q'>Tarjeta</p>
        <div class='rn-ci'><div><span>Anotado en el Panel</span><b>${clp(c.tarjeta)}</b></div><div><span>Máquina Tuu</span><b>${clp(c.tuu)}</b></div>
          <div><span>${tOk ? 'Calza' : c.tuu > c.tarjeta ? 'Falta anotar en el Panel' : 'Anotado de más (¿se cobró?)'}</span><b class='${tOk ? 'rn-ok' : 'rn-mal'}'>${tOk ? '✓' : clp(Math.abs(c.tuu - c.tarjeta))}</b></div></div>
        <p style='font-size:1.2rem;color:#8a8986;margin:6px 2px 0'>La máquina se lee cada 15 minutos: si recién cobraste, espera un poco.</p>
        <p class='rn-q'>Efectivo</p>
        <div class='rn-ci'><div><span>Anotado en el Panel hoy</span><b>${clp(c.efectivo)}</b></div></div>
        <input id='rn-cont' class='rn-in' inputmode='numeric' placeholder='¿Cuánto efectivo de hoy hay en la caja?' value='${ci ? ci.contado : ''}'>
        ${c.transferencia ? `<p class='rn-q'>Transferencias</p><div class='rn-ci'><div><span>Anotadas hoy (revisa que llegaron)</span><b>${clp(c.transferencia)}</b></div></div>` : ''}
        <input id='rn-cnota' class='rn-in' placeholder='Nota (si algo no calza, explica qué pasó)' value='${ci ? esc(ci.nota) : ''}'>
        ${ci ? `<p class='rn-big ${ci.diferencia ? 'rn-mal' : 'rn-ok'}'>${ci.diferencia ? 'Cerrado, no calza: Isidora tiene el aviso' : '✓ Día cerrado, todo calza'}</p><p style='text-align:center;font-size:1.2rem;color:#8a8986;margin:4px 0 0'>Cerró ${esc(ci.por)}</p>` : ''}
        <button class='rn-go' data-cerrar style='margin-top:14px'>${ci ? 'Cerrar de nuevo' : 'Cerrar el día'}</button><p class='rn-err'></p>`;
    };
    pinta();
    w.onclick = async e => {
      if (e.target === w || e.target.closest('.rn-x')) return w.remove();
      const b = e.target.closest('[data-cerrar]'); if (!b) return;
      b.disabled = true; b.textContent = 'Guardando…';
      try { c = await post({ accion: 'cierre', op: 'cerrar', contado: w.querySelector('#rn-cont').value, nota: w.querySelector('#rn-cnota').value }); pinta(); cargar(); }
      catch (x) { b.disabled = false; b.textContent = 'Cerrar el día'; w.querySelector('.rn-err').textContent = x.message; }
    };
  }

  // ---------- Notas ----------
  const cuando = x => (x.fecha === hoy() ? 'hoy' : fechaC(x.fecha)) + ' ' + x.hora;
  const avisosAbiertos = () => N ? N.notas.filter(x => x.tipo === 'aviso' && !x.lista) : [];
  function notaHTML(x) {
    const info = x.tipo === 'info';
    return `<div class='rn-n${x.importante && !x.lista ? ' imp' : ''}${x.lista ? ' lista' : ''}${info ? ' info' : ''}' data-n='${esc(x.id)}'>
      ${x.importante && !x.lista ? `<span class='rn-it'>${ICO.alerta}Importante</span>` : ''}
      <p>${esc(x.texto)}</p><small>${esc(x.por || 'Storm')} · ${cuando(x)}${x.lista ? ' · lista' + (x.listaPor ? ' (' + esc(x.listaPor) + ')' : '') : ''}</small>
      <div class='rn-acc'>${info ? `<button class='rn-lk' data-ed='${esc(x.id)}'>Editar</button>` : x.lista ? `<button class='rn-lk' data-no='reabrir' data-id='${esc(x.id)}'>Volver a abrir</button>` : `<button class='rn-vol' data-no='lista' data-id='${esc(x.id)}'>${ICO.ok}Listo</button>`}
        ${x.lista ? '' : `<button class='rn-lk' data-no='importante' data-imp='${x.importante ? '' : '1'}' data-id='${esc(x.id)}'>${x.importante ? 'Quitar importante' : 'Marcar importante'}</button>`}
        <button class='rn-lk rojo' data-no='borrar' data-id='${esc(x.id)}'>Borrar</button></div></div>`;
  }
  let impNueva = false;
  function pintarNotas() {
    if (!elN) return;
    if (!N) { elN.innerHTML = `<div class='rn'><div class='pn-skel'></div><div class='pn-skel'></div></div>`; return; }
    const ab = avisosAbiertos(), ls = N.notas.filter(x => x.tipo === 'aviso' && x.lista), inf = N.notas.filter(x => x.tipo === 'info');
    const prev = elN.querySelector('#rn-txt'), borrador = prev ? prev.value : '';
    let h = `<div class='rn'><div class='rn-tabs'><button class='${tabN === 'aviso' ? 'on' : ''}' data-tab='aviso'>Avisos${ab.length ? `<em>${ab.length}</em>` : ''}</button><button class='${tabN === 'info' ? 'on' : ''}' data-tab='info'>Para saber</button></div>
      <div class='rn-new'><textarea id='rn-txt' class='rn-in' placeholder='${tabN === 'aviso' ? 'Escribe un aviso para el equipo… (ej: mañana llega el proveedor de cera a las 11)' : 'Información que todos deben saber… (ej: clave del wifi, dónde están las llaves, precios de renta)'}'>${esc(borrador)}</textarea>
        <div class='rn-row'>${tabN === 'aviso' ? `<button class='rn-imp${impNueva ? ' on' : ''}' data-impn>${ICO.alerta}Importante</button>` : ''}<button class='rn-go' data-anotar>Anotar</button></div></div>`;
    if (tabN === 'aviso') {
      h += `<p class='rn-h'>Por hacer o saber</p>` + (ab.length ? ab.map(notaHTML).join('') : `<div class='rn-vacio'>No hay avisos pendientes. 👌</div>`);
      if (ls.length) h += `<button class='rn-lk' data-verls style='margin-top:12px'>${verListas ? 'Esconder los listos' : 'Ver los listos (' + ls.length + ')'}</button>` + (verListas ? ls.map(notaHTML).join('') : '');
    } else h += `<p class='rn-h'>Para saber</p>` + (inf.length ? inf.map(notaHTML).join('') : `<div class='rn-vacio'>Aquí va lo que hay que saber siempre: horarios, claves, cómo se hace cada cosa.</div>`);
    elN.innerHTML = h + `</div>`;
    elN.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tabN = b.dataset.tab; pintarNotas(); });
    const im = elN.querySelector('[data-impn]'); if (im) im.onclick = () => { impNueva = !impNueva; im.classList.toggle('on', impNueva); };
    const vl = elN.querySelector('[data-verls]'); if (vl) vl.onclick = () => { verListas = !verListas; pintarNotas(); };
    elN.querySelector('[data-anotar]').onclick = async e => {
      const t = elN.querySelector('#rn-txt'); if (t.value.trim().length < 2) return t.focus();
      const ok = await hacer('notas', { op: 'nueva', tipo: tabN, texto: t.value, importante: tabN === 'aviso' && impNueva }, e.currentTarget);
      if (ok) { impNueva = false; const t2 = elN.querySelector('#rn-txt'); if (t2) t2.value = ''; }
    };
    elN.querySelectorAll('[data-no]').forEach(b => b.onclick = () => {
      if (b.dataset.no === 'borrar' && !confirm('¿Borrar esta nota?')) return;
      hacer('notas', { op: b.dataset.no, id: b.dataset.id, importante: !!b.dataset.imp }, b);
    });
    elN.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => {
      const x = N.notas.find(n => n.id === b.dataset.ed), c = b.closest('.rn-n');
      c.innerHTML = `<textarea class='rn-in rn-ed'>${esc(x.texto)}</textarea><div class='rn-acc'><button class='rn-vol' data-gd>Guardar</button><button class='rn-lk' data-cn>Cancelar</button></div>`;
      c.querySelector('[data-cn]').onclick = () => pintarNotas();
      c.querySelector('[data-gd]').onclick = e => hacer('notas', { op: 'editar', id: x.id, texto: c.querySelector('textarea').value }, e.currentTarget);
    });
  }

  window.StormRN = {
    montar, cargar,
    listo: () => !!(R && N),
    afuera: () => afuera().length,
    tarde: () => afuera().filter(tarde).length,
    avisos: () => avisosAbiertos().length,
    importantes: () => avisosAbiertos().filter(x => x.importante),
    nueva: abrirNueva
  };
})();
