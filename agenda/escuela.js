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
  const fin = (h, dur) => deMin(aMin(h) + (dur || (E ? E.duracion : 90)));
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
  .es-dbh{display:block;font-style:normal;font-size:1.1rem;font-weight:700;opacity:.85;white-space:nowrap;padding-right:18px}
  @media (max-width:600px){.es-dbf{display:none}}
  .es-f input[type=date]{-webkit-appearance:none;appearance:none;min-width:0;width:100%;box-sizing:border-box;min-height:44px;text-align:left}
  .es-f input[type=date]::-webkit-date-and-time-value{text-align:left}
  .es-f label{min-width:0}
  .es-dbp{float:right;font-style:normal;width:18px;height:18px;border-radius:50%;background:#2f9a6a;color:#fff;font-size:1.1rem;font-weight:800;display:grid;place-items:center;margin-left:4px}
  .es-dbp.no{background:#e0a03a}
  .es-db.pend{background:#E3F1F1;color:#0f6e74;border:1.5px dashed #0f6e74}
  .es-db.otra{background:#F3F1EC;color:#6b6a67;border:1.5px dashed #c9c5bd;cursor:default;z-index:1}
  .es-ahora{position:absolute;left:0;right:0;border-top:2px solid #e0484e;z-index:3}
  /* cascarón: barra abajo en el celular, menú a la izquierda en el computador */
  .ap-top,.pn-head{display:none}
  .es-nav{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;justify-content:space-around;background:#fff;border-top:1px solid var(--line);padding:6px 4px calc(6px + env(safe-area-inset-bottom));box-shadow:0 -4px 18px rgba(0,0,0,.04)}
  .es-brand,.es-nav .es-nueva,.es-yo{display:none}
  .es-ni{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;border:0;background:none;font:inherit;font-size:1.1rem;font-weight:600;color:#8a8986;padding:6px 2px;cursor:pointer;border-radius:12px;min-width:0}
  .es-ni span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .es-ni svg{width:23px;height:23px}
  .es-ni.on{color:#0f6e74}
  .es-main{padding-bottom:96px}
  .es-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 14px}
  .es-top h2{margin:0;font-size:2.3rem;font-weight:600;line-height:1.15}
  .es-topb{display:flex;align-items:center;gap:12px;flex:none}
  .es-nueva{border:0;background:#0f6e74;color:#fff;border-radius:999px;padding:10px 16px;font:inherit;font-size:1.35rem;font-weight:700;cursor:pointer;white-space:nowrap}
  .es-salir-m{border:0;background:none;color:#8a8986;font:inherit;font-size:1.25rem;text-decoration:underline;cursor:pointer;padding:0}
  .es-modal{position:fixed;inset:0;z-index:50;background:rgba(30,30,28,.45);display:flex;align-items:flex-end;justify-content:center}
  .es-sheet{background:#EFECE8;width:100%;max-width:720px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;padding:6px 10px 16px}
  .es-sheet .pn-card{margin-top:6px}
  .es-mh{display:flex;align-items:center;justify-content:space-between;gap:10px}.es-mh h3{margin:0}
  .es-x{border:0;background:#F3F1EC;border-radius:999px;width:36px;height:36px;font-size:1.6rem;color:#555;cursor:pointer;flex:none}
  @media (min-width:1000px){
    main .pn{max-width:1440px}
    .es-app{display:grid;grid-template-columns:230px minmax(0,1fr);gap:28px;align-items:start;margin-top:8px}
    .es-nav{position:sticky;top:16px;flex-direction:column;justify-content:flex-start;align-items:stretch;gap:2px;border:1px solid var(--line);border-radius:18px;padding:18px 12px;box-shadow:none}
    .es-brand{display:flex;align-items:center;gap:10px;padding:2px 8px 16px;font-weight:600;font-size:1.6rem;color:#8a8986}
    .es-brand img{width:84px;height:auto}
    .es-nav .es-nueva{display:block;margin:0 0 12px;width:100%}
    .es-ni{flex:none;flex-direction:row;gap:12px;font-size:1.45rem;padding:11px 12px;color:var(--ink)}
    .es-ni:hover{background:#F3F1EC}
    .es-ni.on{background:#E3F1F1;color:#0f6e74}
    .es-yo{display:block;margin-top:18px;padding:14px 8px 0;border-top:1px solid var(--line);font-size:1.15rem;color:#8a8986;word-break:break-all}
    .es-yo button{display:block;margin-top:6px;border:0;background:none;padding:0;font:inherit;color:#0f6e74;text-decoration:underline;cursor:pointer}
    .es-main{padding-bottom:24px}
    .es-top{margin-top:0}
    .es-topb{display:none}
    .es-modal{align-items:center}
    .es-sheet{border-radius:20px}
  }
  /* computador: más ancho y en columnas */
  @media (min-width:1000px){
    .pn .pn-stats{grid-template-columns:2fr 1fr 1fr}
    .pn .pn-stat--main{grid-column:auto}
    .es-dl{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;align-items:start}
    .es-2c{display:grid;grid-template-columns:1.3fr 1fr;gap:0 12px;align-items:start}
    .es-cols{columns:2;column-gap:12px}
    .es-cols>.pn-card{break-inside:avoid;display:inline-block;width:100%}
  }
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
  .es-pre{display:flex;gap:4px;flex:none}
  .es-cdh .es-pre button{text-decoration:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 10px;font-weight:600;color:var(--ink)}
  .es-cdh .es-pre button.on{background:#0f6e74;border-color:#0f6e74;color:#fff}
  .es-cdh button{border:0;background:none;font:inherit;font-size:1.2rem;color:#0f6e74;text-decoration:underline;cursor:pointer;padding:0}
  .es-slots{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
  .es-s{border:1.5px solid #bfe0cc;background:#effaf3;color:#2f7a4d;border-radius:10px;padding:6px 9px;font:inherit;font-size:1.25rem;font-weight:600;cursor:pointer;line-height:1.15;text-align:left}
  .es-s small{display:block;font-size:1rem;font-weight:500;opacity:.8;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .es-s.no{border-color:var(--line);background:#fff;color:#a5a39f;text-decoration:line-through}
  .es-s.res{border-color:#0f6e74;background:#0f6e74;color:#fff;cursor:default;text-decoration:none}
  .es-s.pas{opacity:.45;cursor:default}
  .es-ley{display:flex;flex-wrap:wrap;gap:10px;font-size:1.15rem;opacity:.75;margin-top:8px}
  .es-ley i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
  .es-wk{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px}
  .es-wk b{text-align:center}
  .es-wk button{flex:none;white-space:nowrap;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:1.3rem;cursor:pointer;color:var(--ink)}
  .es-tab{width:100%;border-collapse:collapse;font-size:1.35rem;margin-top:6px}
  .es-tab th{font-size:1.15rem;text-align:left;opacity:.6;font-weight:600;padding:4px}
  .es-tab td{padding:4px}
  .es-tab input{width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 8px;font:inherit;font-size:1.35rem}
  .es-insrow{display:grid;grid-template-columns:1fr 1.4fr auto;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)}
  .es-insrow input{border:1px solid var(--line);border-radius:8px;padding:7px 8px;font:inherit;font-size:1.3rem;min-width:0}
  .es-insrow b{font-size:1.4rem}
  .es-sw{display:inline-flex;align-items:center;gap:8px;font-size:1.25rem;cursor:pointer;color:#8a8986}
  .es-sw input{position:absolute;opacity:0;width:0;height:0}
  .es-tg{width:38px;height:22px;border-radius:999px;background:#d6d3ce;position:relative;transition:.15s;flex:none}
  .es-tg:after{content:'';position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s}
  .es-sw input:checked+.es-tg{background:#0f6e74}.es-sw input:checked+.es-tg:after{left:19px}
  .es-ajt{margin-bottom:12px}
  .es-pago{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px;padding:10px;border-radius:12px;background:#fbeee2}
  .es-pago span{font-size:1.3rem;font-weight:700;color:#b5662b;margin-right:4px}
  .es-pago button{border:1.5px solid #e0a03a;background:#fff;color:#7a4a1a;border-radius:999px;padding:7px 12px;font:inherit;font-size:1.3rem;font-weight:600;cursor:pointer}
  .es-papel{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:1.3rem;color:#55544f;cursor:pointer}.es-papel input{width:20px;height:20px;accent-color:#0f6e74}
  .es-modal .es-sheet{position:relative}
  .es-x{position:sticky;top:0}
  .es-tabs2{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 14px}.es-tabs2 .es-nueva{margin-left:auto}
  .es-tabs2 .es-chip.on{background:#0f6e74;border-color:#0f6e74;color:#fff}
  @media (max-width:999px){.es-tabs2{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-right:-16px;padding-right:16px}.es-tabs2 .es-chip{flex:none}.es-tabs2 .es-nueva{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:25;padding:14px 20px;font-size:1.5rem;box-shadow:0 8px 24px rgba(15,110,116,.35)}}
  .es-op{padding:12px 0;border-bottom:1px solid var(--line)}.es-op:last-child{border-bottom:0}.es-op b{font-size:1.4rem}.es-op p{margin:3px 0 8px;font-size:1.25rem;color:#6b6a67}
  .es-op select{border:1px solid var(--line);border-radius:10px;padding:9px 10px;font:inherit;font-size:1.35rem;background:#fff;max-width:100%}
  .es-op .es-f{margin-top:10px}
  .es-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:10px;background:#1f2b2b;color:#fff;border-radius:14px;padding:12px 16px;font-size:1.4rem;max-width:min(92vw,520px);box-shadow:0 10px 30px rgba(0,0,0,.18);animation:esT 5s forwards}
  .es-toast.mal{background:#8a2f22}
  .es-ti{flex:none;width:24px;height:24px;border-radius:50%;background:#2f9a6a;display:grid;place-items:center;font-weight:800;font-size:1.3rem}.es-toast.mal .es-ti{background:#fff;color:#8a2f22}
  @keyframes esT{0%{opacity:0;transform:translate(-50%,12px)}6%{opacity:1;transform:translate(-50%,0)}85%{opacity:1}100%{opacity:0;visibility:hidden}}
  .es-r{border-left:5px solid #2f9a6a}.es-r--pend{border-left-color:#e0a03a}.es-r--mal{border-left-color:#c0503a}.es-r--gris{border-left-color:#c9c6c0}
  .es-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;align-items:center}
  .es-tags .es-ins{margin:0}
  .es-st{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 10px 3px 4px;font-size:1.15rem;font-weight:700;background:#e5f2ea;color:#2f7a4d}
  .es-st i{width:18px;height:18px;border-radius:50%;background:#2f9a6a;color:#fff;display:grid;place-items:center;font-style:normal;font-size:1.05rem}.es-st i svg{width:12px;height:12px}
  .es-st.pend i{background:#e0a03a}.es-st.mal i{background:#c0503a}.es-st.gris i{background:#a9a6a0}
  .es-st.pend{background:#fbeee2;color:#b5662b}.es-st.mal{background:#f8e3df;color:#a6402c}.es-st.gris{background:#eeece8;color:#8a8986}
  .es-ct{display:flex;gap:8px;flex:none}
  .es-ctb{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#E3F1F1;color:#0f6e74;text-decoration:none}
  .es-ctb.wa{background:#25D366;color:#fff}.es-ctb svg{width:22px;height:22px}
  .es-res{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin:0 0 12px}
  .es-rt{display:grid;grid-template-columns:auto 1fr;column-gap:10px;align-items:center;text-align:left;background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px;font:inherit;color:var(--ink);cursor:pointer}
  .es-rt i{grid-row:span 3;width:40px;height:40px;border-radius:12px;background:#E3F1F1;color:#0f6e74;display:grid;place-items:center}.es-rt i svg{width:22px;height:22px}
  .es-rt.pend i{background:#fbeee2;color:#b5662b}
  .es-rt b{font-size:2.2rem;line-height:1}.es-rt span{font-size:1.2rem;color:#55544f}.es-rt small{font-size:1.1rem;color:#8a8986}
  @media (max-width:999px){.es-rt{grid-template-columns:1fr;padding:10px 12px}.es-rt i{grid-row:auto;width:34px;height:34px;margin-bottom:6px}.es-rt b{font-size:2rem}.es-rt small{display:none}}
  .es-ajw{max-width:760px}
  .es-intro{margin:0 0 12px;font-size:1.35rem;color:#6b6a67}
  .es-nota{margin:8px 0 0;font-size:1.2rem;color:#8a8986}
  .es-ich{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}.es-ich b{font-size:1.6rem}
  .es-det{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}
  .es-det summary{cursor:pointer;font-size:1.3rem;font-weight:600;color:#0f6e74}
  .es-tar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 8px;margin-top:8px}
  .es-tar label{font-size:1.15rem;color:#6b6a67;display:block;min-width:0}
  .es-tar input{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:7px 8px;font:inherit;font-size:1.3rem;margin-top:2px}
  .es-como ul{margin:6px 0 0;padding-left:18px;font-size:1.3rem;line-height:1.5;color:#55544f}
  .es-ajw .es-cdh{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .es-aviso{background:#fbeee2;color:#7a4317;border-radius:14px;padding:12px 14px;font-size:1.35rem;line-height:1.45;margin-top:12px}
  `;

  let linkNuevo = null, E = null, auth = null, pane = null, sub = 'dia', diaVer = '', manualPre = null, filtroIns = '', verPasadas = false, abierta = '', modo = '', sel = [], msg = '', calIns = '', calDesde = '', manualOn = false, ajTab = 'instructores';
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
  const sv = d => `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>${d}</svg>`;
  const ICO = {
    dia: sv("<rect x='3.5' y='5' width='17' height='15' rx='3'/><path d='M3.5 10h17M8 3v4M16 3v4'/>"),
    reservas: sv("<path d='M9 6h11M9 12h11M9 18h11'/><circle cx='4.5' cy='6' r='1'/><circle cx='4.5' cy='12' r='1'/><circle cx='4.5' cy='18' r='1'/>"),
    calendario: sv("<circle cx='12' cy='12' r='8.5'/><path d='M12 7.5V12l3 2'/>"),
    pagos: sv("<rect x='3' y='6' width='18' height='13' rx='3'/><path d='M3 10h18M7 15h3'/>"),
    ajustes: sv("<circle cx='12' cy='12' r='3'/><path d='M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8'/>")
  };
  const ICO_S = {
    reloj: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round'><circle cx='12' cy='12' r='8.5'/><path d='M12 7.5V12l3 2'/></svg>`,
    ficha: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><rect x='5' y='3.5' width='14' height='17' rx='2.5'/><path d='M9 9h6M9 13h6M9 17h3'/></svg>`,
    wa: `<svg viewBox='0 0 24 24' fill='currentColor'><path d='M12 2.2a9.7 9.7 0 0 0-8.4 14.6L2.2 21.8l5.1-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1l-.4-.2Z'/></svg>`,
    tel: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M5 3.5h3.2l1.6 4-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2 4 1.6V17a3 3 0 0 1-3 3A14.5 14.5 0 0 1 2 6.5a3 3 0 0 1 3-3Z'/></svg>`,
    pago: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><rect x='3' y='6' width='18' height='13' rx='3'/><path d='M3 10h18'/></svg>`,
    cal: `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><rect x='3.5' y='5' width='17' height='15' rx='3'/><path d='M3.5 10h17M8 3v4M16 3v4'/></svg>`
  };
  // ---------- pintar ----------
  function pintar() {
    if (!pane || !E) return;
    const admin = E.rol === 'admin';
    let h = `<style>${css}</style>`, cuerpo = '';
    const toast = msg; msg = '';
    if (linkNuevo) { const L = linkNuevo;
      cuerpo += `<div class='pn-card' style='border:2px solid #0f6e74'><h3>Link de pago listo</h3><p class='pn-sub'>${esc(L.nombre)} · ${esc(flarga(L.fecha))} ${esc(L.hora)} · ${L.personas} persona${L.personas === 1 ? '' : 's'} · ${clp(L.total)}. El horario queda guardado hasta el ${esc(fcorta(L.hasta.fecha))} a las ${esc(L.hasta.hora)}.</p>
        <div class='es-acc'>${wa(L.telefono) ? `<a class='es-btn' style='text-decoration:none' target='_blank' rel='noopener' href='https://wa.me/${wa(L.telefono)}?text=${encodeURIComponent(msgLink(L))}'>Mandar por WhatsApp</a>` : ''}<button class='es-btn sec' data-lf='${esc(msgLink(L))}'>Copiar mensaje</button><button class='pn-link' data-lnx>Cerrar</button></div></div>`; }
    const IT = admin ? [['dia', 'Agenda'], ['reservas', 'Clases'], ['calendario', 'Disponibilidad'], ['pagos', 'Pagos'], ['ajustes', 'Ajustes']] : [['dia', 'Agenda'], ['reservas', 'Mis clases'], ['calendario', 'Disponibilidad'], ['pagos', 'Mis pagos']];
    const TIT = { dia: 'Agenda del día', reservas: admin ? 'Clases' : 'Mis clases', calendario: admin ? 'Disponibilidad de instructores' : 'Mi disponibilidad', pagos: admin ? 'Pagos a instructores' : 'Mis pagos', ajustes: 'Ajustes' };
    if (window.STORM_SHELL) h += `<div class='es-emb'><div class='es-tabs2'>${IT.map(([k, t]) => `<button class='es-chip' data-sub='${k}'>${t}</button>`).join('')}${admin ? `<button class='es-nueva' data-nueva>+ Nueva clase</button>` : ''}</div>` + cuerpo;
    else h += `<div class='es-app'><nav class='es-nav'><div class='es-brand'><img src='/img/storm-logo.png' alt='Storm'><span>Agenda</span></div>${admin ? `<button class='es-nueva' data-nueva>+ Nueva clase</button>` : ''}${IT.map(([k, t]) => `<button class='es-ni' data-sub='${k}'>${ICO[k]}<span>${t}</span></button>`).join('')}<div class='es-yo'>${esc(auth.email)}<button data-salir>Salir</button></div></nav>
      <div class='es-main'><div class='es-top'><h2>${TIT[sub] || ''}</h2><div class='es-topb'>${admin ? `<button class='es-nueva' data-nueva>+ Nueva</button>` : ''}<button class='es-salir-m' data-salir>Salir</button></div></div>` + cuerpo;
    cuerpo = '';
    if (sub === 'dia') h += diaVista(admin);
    else if (sub === 'calendario') h += calendario(admin);
    else if (sub === 'pagos') h += pagosVista(admin);
    else if (sub === 'ajustes' && admin) h += ajustes();
    else h += reservas(admin);
    h += window.STORM_SHELL ? `</div>` : `</div></div>`;
    if (toast) h += `<div class='es-toast${/^No /.test(toast) ? ' mal' : ''}' role='status'><span class='es-ti'>${/^No /.test(toast) ? '!' : '✓'}</span>${esc(toast)}</div>`;
    if (manualOn && admin) h += `<div class='es-modal' data-fondo><div class='es-sheet'>${manualForm()}</div></div>`;
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
    }
    // agrupadas por día (en el computador, cada día en dos columnas)
    const porDia = []; lista.forEach(r => { const u = porDia[porDia.length - 1]; if (u && u.f === r.fecha) u.l.push(r); else porDia.push({ f: r.fecha, l: [r] }); });
    h += lista.length ? porDia.map(g => `<p class='es-dia'>${g.f === E.hoy ? 'Hoy · ' : g.f === sumar(E.hoy, 1) ? 'Mañana · ' : ''}${esc(flarga(g.f))}</p><div class='es-dl'>${g.l.map(r => tarjeta(r, admin)).join('')}</div>`).join('')
      : `<div class='pn-card'><p class='pn-empty'>${verPasadas ? 'No hay clases anteriores.' : 'Todavía no hay clases reservadas.'}</p></div>`;
    h += `<p class='pn-note'><button class='pn-link' data-pasadas>${verPasadas ? 'Ver próximas clases' : 'Ver clases anteriores'}</button></p>`;
    return h;
  }

  const MEDIOS = [['POS', 'POS'], ['Transferencia', 'Transferencia'], ['Efectivo', 'Efectivo'], ['Factura', 'Factura'], ['Mercado Pago', 'Reserva online'], ['Por pagar', 'Aún no paga']];
  const medioTxt = m => m === 'Mercado Pago' ? 'Reserva online' : m;
  // tabla de precios (igual que el servidor): niños de a 2 por instructor, el resto hasta 5
  function cotiza(p, m) {
    const a = E.ajustes || {}, g = [];
    p = Math.max(1, Math.floor(+p || 1)); m = Math.max(0, Math.min(p, Math.floor(+m || 0)));
    const pares = Math.floor(m / 2); for (let k = 0; k < pares; k++) g.push(2);
    let resto = p - pares * 2; if (pares && resto === 1) { g[g.length - 1]++; resto = 0; }
    if (resto > 0) { const n = p > (a.maxWeb || 5) ? 1 : Math.max(Math.ceil(resto / 5), 1); for (let k = 0; k < n; k++) g.push(Math.floor(resto / n) + (k < resto % n ? 1 : 0)); }
    const precios = g.map(x => Number((a.precios || {})[x]) || 0);
    return { ins: g.length, precio: precios.every(Boolean) ? precios.reduce((t, x) => t + x, 0) : 0 };
  }
  function estadoDe(r) {
    if (r.estado === 'cancelada') return { c: 'gris', i: '×', t: 'Cancelada' };
    if (r.estado === 'pendiente') return { c: 'pend', i: '$', t: r.linkPago && r.nota && /mano/.test(r.nota) ? 'Esperando pago' : 'Pagando ahora' };
    if (r.estado === 'revisar') return { c: 'mal', i: '!', t: 'Revisar: ' + (r.nota || '') };
    if (r.medio === 'Por pagar') return { c: 'pend', i: '$', t: 'No ha pagado' };
    if (r.medio) return { c: 'ok', i: '$', t: 'Pagada · ' + medioTxt(r.medio) };
    return { c: 'ok', i: '✓', t: 'Confirmada' };
  }
  const contacto = r => wa(r.telefono) ? `<div class='es-ct'><a class='es-ctb wa' target='_blank' rel='noopener' href='https://wa.me/${wa(r.telefono)}' title='WhatsApp' aria-label='WhatsApp'>${ICO_S.wa}</a><a class='es-ctb' href='tel:+${wa(r.telefono)}' title='Llamar' aria-label='Llamar'>${ICO_S.tel}</a></div>` : '';
  function tarjeta(r, admin) {
    const E0 = estadoDe(r), est = `<span class='es-st ${E0.c}'><i>${E0.i}</i>${esc(E0.t)}</span>`;
    let h = `<div class='es-r es-r--${E0.c}'><div class='es-r-top'><div class='es-h'>${esc(r.hora)}<small>a ${fin(r.hora, r.duracion)}</small></div>
      <div class='es-who'><b>${esc(r.nombre)}</b><small>${r.personas} persona${r.personas === 1 ? '' : 's'}${r.menores ? ' · ' + r.menores + ' menor' + (r.menores === 1 ? '' : 'es') + ' de 8' : ''}${r.ninos ? ' · ' + r.ninos + ' de 7 a 11' : ''}${admin ? ' · ' + clp(r.total) + ' ' + esc(r.medio) : ''}</small>
      <div class='es-tags'>${est}<span class='es-st ${r.fichasPapel || (r.fichas || []).length >= r.personas ? 'ok' : 'pend'}'><i>${ICO_S.ficha}</i>${r.fichasPapel ? 'Fichas en papel ✓' : 'Fichas ' + (r.fichas || []).length + '/' + r.personas}</span>${r.instructores.map(i => `<span class='es-ins'>${esc(i)}</span>`).join('')}</div></div>
      ${contacto(r)}</div>
      ${r.comentario ? `<p class='es-com'>${esc(r.comentario)}</p>` : ''}
      ${admin && r.linkPago ? `<div class='es-acc'><button class='es-btn' data-lf='${esc(msgLink({ nombre: r.nombre, fecha: r.fecha, hora: r.hora, personas: r.personas, total: r.total, url: r.linkPago }))}'>Copiar link de pago</button>${wa(r.telefono) ? `<a class='es-btn sec' style='text-decoration:none' target='_blank' rel='noopener' href='https://wa.me/${wa(r.telefono)}?text=${encodeURIComponent(msgLink({ nombre: r.nombre, fecha: r.fecha, hora: r.hora, personas: r.personas, total: r.total, url: r.linkPago }))}'>Reenviar por WhatsApp</a>` : ''}</div>` : ''}
      <div class='es-acc'>${r.estado === 'pendiente' ? '' : (r.fichas || []).length ? `<a class='es-btn sec' style='text-decoration:none' href='/agenda/fichas.html?ref=${encodeURIComponent(r.ref)}' target='_blank'>Ver fichas</a>` : ''}${r.estado !== 'pendiente' && !r.fichasPapel && (r.fichas || []).length < r.personas && r.linkFicha ? `<button class='es-btn sec' data-lf='${esc(r.linkFicha)}'>Copiar link de la ficha</button>${wa(r.telefono) ? `<a class='es-btn sec' style='text-decoration:none' target='_blank' rel='noopener' href='https://wa.me/${wa(r.telefono)}?text=${encodeURIComponent('Hola ' + r.nombre.split(' ')[0] + ', antes de la clase de surf necesitamos la ficha de cada participante (2 minutos): ' + r.linkFicha)}'>Pedir ficha por WhatsApp</a>` : ''}` : ''}</div>`;
    if (admin && r.estado !== 'cancelada' && r.medio === 'Por pagar') h += `<div class='es-pago'><span>¿Ya pagó?</span>${MEDIOS.filter(m => !['Por pagar', 'Mercado Pago'].includes(m[0])).map(([v, t]) => `<button data-pago='${esc(r.ref)}' data-m='${v}'>${t}</button>`).join('')}</div>`;
    if (admin && r.estado !== 'cancelada' && r.estado !== 'pendiente' && (r.fichas || []).length < r.personas) h += `<label class='es-papel'><input type='checkbox' data-papel='${esc(r.ref)}'${r.fichasPapel ? ' checked' : ''}>Las fichas se hicieron en papel</label>`;
    // clases pasadas: solo se pueden cancelar (por ejemplo, pruebas o errores), así no cuentan en las ventas ni en los pagos
    if (admin && (r.fecha >= E.hoy || r.estado !== 'cancelada')) {
      if (abierta !== r.ref) h += `<div class='es-acc'><button class='es-btn sec' data-abre='${r.ref}' data-modo='datos'>Editar</button>${r.fecha >= E.hoy ? `<button class='es-btn sec' data-abre='${r.ref}' data-modo='ins'>Cambiar instructor</button><button class='es-btn sec' data-abre='${r.ref}' data-modo='mover'>Mover</button>` : ''}<button class='es-btn peligro' data-abre='${r.ref}' data-modo='cancelar'>Cancelar</button></div>`;
      else if (modo === 'ins') {
        const n = r.instructores.length;
        h += `<div class='es-box'><p>Elige ${n === 1 ? 'el instructor' : 'los ' + n + ' instructores'} para esta clase. Puedes sumar o quitar instructores si el caso lo necesita.</p><div class='es-chips' style='margin-top:0'>${E.instructores.filter(i => i.activo).map(i => {
          const otra = reservaEn(i.nombre, r.fecha, r.hora); const ocup = (otra && otra.ref !== r.ref) || !!otraCosa(i.nombre, r.fecha, r.hora);
          return `<button class='es-chip${sel.includes(i.nombre) ? ' on' : ''}' data-sel='${esc(i.nombre)}'${ocup ? ' disabled style="opacity:.4"' : ''}>${esc(i.nombre)}${ocup ? '<small>' + esc(otraCosa(i.nombre, r.fecha, r.hora) || 'ocupado') + '</small>' : !dispo(i.nombre, r.fecha, r.hora) ? '<small>no marcó disponible</small>' : ''}</button>`; }).join('')}</div>
          <div class='es-acc'><button class='es-btn' data-go='ins'${sel.length ? '' : ' disabled'}>Guardar${sel.length && sel.length !== n ? ' (' + sel.length + ' instructor' + (sel.length === 1 ? '' : 'es') + ')' : ''}</button><button class='pn-link' data-cerrar>Cancelar</button></div><p class='es-err vivo'></p></div>`;
      } else if (modo === 'mover') {
        h += `<div class='es-box'><div class='es-f'><label>Día<input type='date' id='es-mf' value='${r.fecha}' min='${E.hoy}'></label><label>Hora<select id='es-mh'>${horasMano().map(x => `<option value='${x}'${x === r.hora ? ' selected' : ''}>${x}</option>`).join('')}</select></label></div>
          <p style='margin:8px 0 0;font-size:1.2rem;opacity:.7'>Se mantiene el mismo instructor. Avísale al cliente por WhatsApp.</p>
          <div class='es-acc'><button class='es-btn' data-go='mover'>Guardar</button><button class='pn-link' data-cerrar>Cancelar</button></div><p class='es-err vivo'></p></div>`;
      } else if (modo === 'datos') {
        const dur = r.duracion || E.duracion;
        h += `<div class='es-box es-datos'><div class='es-f'>
          <label class='w'>Nombre del cliente<input name='nombre' value='${esc(r.nombre)}'></label>
          <label>Teléfono<input name='telefono' type='tel' value='${esc(r.telefono || '')}'></label>
          <label>Correo<input name='correo' type='email' value='${esc(r.correo || '')}'></label>
          <label>Personas<input name='personas' type='number' min='1' value='${r.personas}' inputmode='numeric'></label>
          <label>Menores de 8<input name='menores' type='number' min='0' value='${r.menores || 0}' inputmode='numeric'></label>
          <label>Duración<select name='duracion'>${[[60, '1 hora'], [90, '1 hora y media'], [120, '2 horas']].map(([v, t]) => `<option value='${v}'${v === dur ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>¿Cómo pagó?<select name='medio'>${MEDIOS.map(([v, t]) => `<option value='${v}'${v === r.medio ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>Total cobrado<input name='total' inputmode='numeric' value='${r.total || 0}'></label>
          <label class='w'>Comentario<input name='comentario' value='${esc(r.comentario || '')}'></label></div>
          <details class='es-det'><summary>Opciones avanzadas</summary><div class='es-f'>${(() => { const v = Object.values(r.pagos || {}), uno = v.length && v.every(x => x === v[0]) ? v[0] : ''; return `<label>Pago por instructor<input name='pagoInstructor' inputmode='numeric' value='${uno}' data-orig='${uno}' placeholder='según la tabla'></label>`; })()}</div></details>
          <p style='margin:8px 0 0;font-size:1.2rem;opacity:.7'>Si cambias las personas y no tocas el pago, se calcula solo con la tabla. Para cambiar día, hora o instructor usa Mover o Cambiar instructor.</p>
          <div class='es-acc'><button class='es-btn' data-go='datos'>Guardar</button><button class='pn-link' data-cerrar>Cancelar</button></div><p class='es-err vivo'></p></div>`;
      } else if (modo === 'cancelar') {
        h += `<div class='es-box'><p>¿Cancelar la clase de <b>${esc(r.nombre)}</b>? El horario queda libre.${r.medio === 'Mercado Pago' ? ' Si hay que devolver el dinero, hazlo desde Mercado Pago.' : ''}</p>
          <div class='es-acc'><button class='es-btn peligro' data-go='cancelar'>Sí, cancelar</button><button class='pn-link' data-cerrar>No</button></div><p class='es-err vivo'></p></div>`;
      }
    }
    return h + '</div>';
  }

  function manualForm() {
    const a = E.ajustes || {};
    return `<div class='pn-card'><div class='es-mh'><h3>Nueva clase</h3><button class='es-x' data-manual aria-label='Cerrar'>✕</button></div><p class='pn-sub'>Para clases que llegan por WhatsApp, empresas o familias grandes. Puedes elegir cualquier hora.</p>
      <div class='es-f' style='margin-top:10px'>
        <label>Día<input type='date' name='fecha' min='${E.hoy}' value='${E.hoy}'></label>
        <label>Hora<select name='hora'>${horasMano().map(x => `<option value='${x}'${x === E.horarios[0] ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>Duración<select name='duracion'><option value='60'>1 hora</option><option value='90' selected>1 hora y media</option><option value='120'>2 horas</option></select></label>
        <label>Personas<input type='number' name='personas' min='1' value='2' inputmode='numeric'></label>
        <label>Menores de 8<input type='number' name='menores' min='0' value='0' inputmode='numeric'></label>
        <label class='w'>Nombre del cliente<input name='nombre' list='es-clientes' autocomplete='off' placeholder='Escribe y elige si ya reservó antes'></label><datalist id='es-clientes'>${(E.clientes || []).map(c => `<option value='${esc(c.nombre)}'>${esc([c.telefono, c.clases + (c.clases === 1 ? ' clase' : ' clases')].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
        <label>Teléfono<input name='telefono' type='tel'></label>
        <label>Correo (opcional)<input name='correo' type='email'></label>
        <label>Total a cobrar<input name='total' inputmode='numeric' value='${(cotiza(2, 0).precio || '')}' data-auto='1'></label>
        <label>N° de instructores<input type='number' name='nInstructores' min='1' value='${cotiza(2, 0).ins}' inputmode='numeric' data-auto='1'></label>
        <label class='w'>¿Cómo paga?<select name='medio'>${MEDIOS.filter(m => m[0] !== 'Mercado Pago').map(([v, t]) => `<option value='${v}'${v === 'Por pagar' ? ' selected' : ''}>${v === 'Por pagar' ? 'Aún no paga' : 'Ya pagó con ' + t}</option>`).join('')}<option value='Link de pago'>Aún no paga: mandarle link de pago</option></select></label>
        <div style='grid-column:1/-1'><b style='font-size:1.3rem'>Instructores</b> <span style='font-size:1.2rem;opacity:.7'>(elige uno o varios; si no eliges, o faltan, la app elige al azar entre los libres)</span>
          <div class='es-chips' style='margin-top:6px'>${E.instructores.filter(i => i.activo).map(i => `<button type='button' class='es-chip' data-mi='${esc(i.nombre)}'>${esc(i.nombre)}</button>`).join('')}</div></div>
        <label class='w'>Comentario<textarea name='comentario' rows='2'></textarea></label>
        <label class='w' style='font-weight:500'><input type='checkbox' name='avisar' style='display:inline;width:auto;margin:0 6px 0 0'>Si ya pagó: mandarle el comprobante por correo</label>
      </div>
      <p style='margin:8px 0 0;font-size:1.2rem;opacity:.7'>El total y los instructores salen solos de la tabla; puedes cambiarlos. Con "mandarle link de pago" el horario queda guardado 24 horas (o hasta la clase) y te damos el link para WhatsApp. El pago a cada instructor sale de la tabla (se cambia después en Editar › Opciones avanzadas).</p>
      <div class='es-acc'><button class='es-btn' data-manual-go>Guardar clase</button></div><p class='es-err vivo'></p></div>`;
  }

  // Atajos por día: Todo / Mañana (antes de las 13:00) / Tarde / No
  const basesDia = d => E.horarios.filter(x => d === 0 || x >= '09:00');
  const PRESETS = { todo: d => basesDia(d), manana: d => basesDia(d).filter(x => x < '13:00'), tarde: d => basesDia(d).filter(x => x >= '13:00'), no: () => [] };
  const igual = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  function preBtns(key, actuales, attr, dia) {
    return `<div class='es-pre'>${[['todo', 'Todo'], ['manana', 'Mañana'], ['tarde', 'Tarde'], ['no', 'No']].map(([k, t]) => `<button ${attr}='${key}' data-p='${k}' class='${igual(actuales, PRESETS[k](dia)) ? 'on' : ''}'>${t}</button>`).join('')}</div>`;
  }
  // Guardado al instante: se cambia en pantalla y se manda en orden por detrás
  let cola = Promise.resolve();
  function enviar(body) {
    cola = cola.then(() => post(Object.assign({ ligero: 1 }, body))).catch(x => { msg = 'No se guardó: ' + x.message; accion({ accion: 'escuela' }); });
  }

  function calendario(admin) {
    const activos = E.instructores.filter(i => i.activo).map(i => i.nombre);
    const inst = admin ? (activos.includes(calIns) ? calIns : (calIns = activos[0] || '')) : E.yo;
    if (!calDesde || calDesde < E.hoy) calDesde = E.hoy;
    let h = '';
    if (admin) h += `<div class='es-chips'>${activos.map(n => `<button class='es-chip${inst === n ? ' on' : ''}' data-ci='${esc(n)}'>${esc(n)}</button>`).join('')}</div>`;
    if (!inst) return h + `<div class='pn-card'><p class='pn-empty'>Agrega instructores en Ajustes.</p></div>`;
    h += `<div class='es-2c'><div class='pn-card'><h3>${admin ? 'Calendario de ' + esc(inst) : 'Mi calendario'}</h3><p class='pn-sub'>Elige rápido Todo, Mañana, Tarde o No, o toca una hora para cambiarla sola. Se guarda al instante. Las clases reservadas salen en azul.</p>
      <div class='es-ley'><span><i style='background:#effaf3;border:1.5px solid #bfe0cc'></i>Disponible</span><span><i style='background:#fff;border:1.5px solid #ddd'></i>No disponible</span><span><i style='background:#0f6e74'></i>Clase reservada</span><span><i style='background:#F3F1EC;border:1.5px solid #e3e0da'></i>Academia Anual u otra cosa</span></div>
      <div class='es-wk'><button data-wk='-7'${calDesde <= E.hoy ? ' disabled style="opacity:.3"' : ''}>‹ Antes</button><b style='font-size:1.35rem'>${fcorta(calDesde)} – ${fcorta(sumar(calDesde, 6))}</b><button data-wk='7'>Después ›</button></div><div class='es-cal'>`;
    for (let k = 0; k < 7; k++) {
      const f = sumar(calDesde, k), diaEx = E.excepciones.find(e => e.instructor === inst && e.fecha === f && e.hora === '');
      const libres = E.horarios.filter(x => dispo(inst, f, x)).length;
      const tieneEx = E.excepciones.some(e => e.instructor === inst && e.fecha === f);
      h += `<div class='es-cd'><div class='es-cdh'><span>${esc(fcorta(f))}${tieneEx ? ` <button data-pf='${f}' data-p='semana'>volver a semana tipo</button>` : ''}</span>${preBtns(f, E.horarios.filter(x => dispo(inst, f, x)), 'data-pf', dsem(f))}</div><div class='es-slots'>`;
      E.horarios.filter(x => dsem(f) === 0 || x >= '09:00' || dispo(inst, f, x) || reservaEn(inst, f, x)).forEach(x => {
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
      h += `<div class='es-cd'><div class='es-cdh'><span>${DIAS[d]}</span>${preBtns(d, horas, 'data-pd', d)}</div><div class='es-slots'>${E.horarios.filter(x => d === 0 || x >= '09:00' || horas.includes(x)).map(x => `<button class='es-s${horas.includes(x) ? '' : ' no'}' data-sd='${d}' data-sh='${x}'>${x}</button>`).join('')}</div></div>`;
    });
    return h + `</div></div>`;
  }

  // ---------- vista del día: una columna por instructor (como AgendaPro) ----------
  const D_INI = 7 * 60, D_FIN = 20 * 60, D_ROW = window.innerWidth >= 1000 ? 34 : 26; // cada 30 min (más alto en el computador)
  function diaVista(admin) {
    if (!diaVer) diaVer = E.hoy;
    const f = diaVer, activos = E.instructores.filter(i => i.activo).map(i => i.nombre).filter(n => admin || n === E.yo);
    const top = m => (m - D_INI) / 30 * D_ROW, alto = min => min / 30 * D_ROW;
    const mias = E.reservas.filter(r => r.estado !== 'cancelada' && (admin || r.instructores.includes(E.yo)));
    const hoyN = mias.filter(r => r.fecha === E.hoy), prox = hoyN.filter(r => r.hora >= new Date().toTimeString().slice(0, 5))[0];
    const espera = mias.filter(r => r.fecha >= E.hoy && estadoDe(r).c === 'pend'), sinFicha = mias.filter(r => r.fecha >= E.hoy && r.fecha <= sumar(E.hoy, 7) && r.estado !== 'pendiente' && (r.fichas || []).length < r.personas);
    let h = `<div class='es-res'>
      <button class='es-rt' data-dv='hoy'><i>${ICO_S.cal}</i><b>${hoyN.length}</b><span>${hoyN.length === 1 ? 'clase hoy' : 'clases hoy'}</span>${prox ? `<small>Próxima ${esc(prox.hora)} · ${esc(prox.nombre.split(' ')[0])}</small>` : ''}</button>
      ${admin ? `<button class='es-rt${espera.length ? ' pend' : ''}' data-irv='reservas'><i>${ICO_S.pago}</i><b>${espera.length}</b><span>esperando pago</span></button>` : ''}
      <button class='es-rt${sinFicha.length ? ' pend' : ''}' data-irv='reservas'><i>${ICO_S.ficha}</i><b>${sinFicha.length}</b><span>${sinFicha.length === 1 ? 'clase sin fichas' : 'clases sin fichas'}</span><small>próximos 7 días</small></button></div>`;
    h += `<div class='es-wk' style='margin:6px 0 10px'><button data-dv='-1'>‹</button><b style='font-size:1.45rem'>${f === E.hoy ? 'Hoy · ' : f === sumar(E.hoy, 1) ? 'Mañana · ' : ''}${esc(flarga(f))}</b><button data-dv='1'>›</button></div>`;
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
        col += `<button class='es-db${r.estado === 'pendiente' ? ' pend' : ''}' data-dr='${esc(r.ref)}' style='top:${top(a)}px;height:${alto(r.duracion || E.duracion) - 2}px'>${r.medio ? `<i class='es-dbp${estadoDe(r).c === 'ok' ? '' : ' no'}'>$</i>` : ''}<em class='es-dbh'>${esc(r.hora)}<span class='es-dbf'>–${esc(fin(r.hora, r.duracion))}</span></em><b>${esc(r.nombre)}</b><small>${r.personas} pers.${r.menores ? ' · ' + r.menores + ' niños' : ''}${r.estado === 'pendiente' ? ' · esperando pago' : ''}</small></button>`;
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
    return h + `<p class='pn-note'>${admin ? 'Cuenta las clases pagadas de lunes a domingo. Cada instructor gana según su tarifa (en Ajustes) y el tamaño de su grupo.' : 'Tus clases de lunes a domingo y lo que te toca por cada una. Storm te transfiere el domingo.'}</p>`;
  }

  function ajustes() {
    const a = E.ajustes;
    const TABS = [['instructores', 'Instructores'], ['precios', 'Precios'], ['reglas', 'Reglas para reservar'], ['bloqueos', 'Horas bloqueadas'], ['admins', 'Administradores']];
    let h = `<div class='es-chips es-ajt'>${TABS.map(([k, t]) => `<button class='es-chip${ajTab === k ? ' on' : ''}' data-ajt='${k}'>${t}</button>`).join('')}</div><div class='es-ajw'>`;
    const nota = t => `<p class='es-nota'>${t}</p>`;
    if (ajTab === 'instructores') {
      h += `<p class='es-intro'>Quiénes dan clases particulares. Con su correo entran a Agenda Storm y ven sus clases. Si apagas a alguien, no recibe clases nuevas.</p>`;
      h += E.instructores.map(i => `<div class='pn-card es-ic'><div class='es-ich'><b>${esc(i.nombre)}</b><label class='es-sw'><input type='checkbox' data-ia='${esc(i.nombre)}'${i.activo ? ' checked' : ''}><span class='es-tg'></span>${i.activo ? 'Activo' : 'Inactivo'}</label></div>
        <div class='es-f'><label>Correo<input data-ic='${esc(i.nombre)}' type='email' placeholder='correo@gmail.com' value='${esc(i.correo || '')}'></label><label>RUT (sale en la ficha)<input data-ir='${esc(i.nombre)}' value='${esc(i.rut || '')}'></label></div>
        <details class='es-det'${Object.keys(i.tarifas || {}).length ? ' open' : ''}><summary>Pago distinto a la tabla general</summary><p class='es-nota'>Llena solo si a ${esc(i.nombre)} le pagas otro monto. Vacío = lo de la pestaña Precios.</p>
          <div class='es-tar'>${['1', '2', '3', '4', '5', 'grupo'].map(k => `<label>${k === 'grupo' ? 'Grupo grande' : k + (k === '1' ? ' persona' : ' personas')}<input data-it='${esc(i.nombre)}' data-k='${k}' inputmode='numeric' placeholder='${esc(String((a.pagos || {})[k] || ''))}' value='${esc(String((i.tarifas || {})[k] || ''))}'></label>`).join('')}</div></details></div>`).join('');
      h += `<div class='pn-card'><h3>Agregar instructor</h3><div class='es-f'><label>Nombre<input id='es-nn' placeholder='Nombre'></label><label>Correo<input id='es-nc' type='email' placeholder='correo@gmail.com'></label></div></div>
        <div class='es-acc'><button class='es-btn' data-aj='instructores'>Guardar cambios</button></div><p class='es-err vivo'></p>`;
    }
    if (ajTab === 'precios') {
      h += `<div class='pn-card'><h3>Precio por clase</h3><p class='pn-sub'>Lo que paga el cliente (lo ve en la página para reservar) y lo que recibe cada instructor por esa clase.</p>
        <table class='es-tab'><tr><th>Personas</th><th>Cliente paga</th><th>Instructor recibe</th></tr>${[1, 2, 3, 4, 5].map(n => `<tr><td><b>${n}</b></td><td><input data-pr='${n}' value='${a.precios[n] || ''}' inputmode='numeric'></td><td><input data-pa='${n}' value='${a.pagos[n] || ''}' inputmode='numeric'></td></tr>`).join('')}
        <tr><td colspan='2'>Grupo grande o empresa</td><td><input data-pa='grupo' value='${a.pagos.grupo || ''}' inputmode='numeric'></td></tr></table>
        ${nota('Con niños menores de 8 la app arma los grupos sola: 2 niños por instructor, y si sobra uno se suma al último par.')}
        <div class='es-acc'><button class='es-btn' data-aj='precios'>Guardar precios</button></div><p class='es-err vivo'></p></div>`;
    }
    if (ajTab === 'reglas') {
      h += `<div class='pn-card'><h3>Cuándo se puede reservar</h3>
        <div class='es-f'><label>Se cierran las reservas a las… (del día anterior)<input id='es-noche' value='${esc(a.cierreNoche)}'></label>
        <label>Se puede reservar con hasta… días de anticipación<input id='es-dias' type='number' min='1' value='${a.diasAdelante}'></label>
        <label class='w'>Horas en que parten las clases (separadas por coma)<input id='es-hor' value='${esc(a.horarios.join(', '))}'></label>
        <label class='w'>Lugar (sale en el comprobante)<input id='es-lugar' value='${esc(a.lugar)}'></label></div>
        <details class='es-det'><summary>Opciones avanzadas</summary>
          <div class='es-op'><b>Clases seguidas</b><p>¿Cuántas clases puede hacer un instructor una tras otra sin descanso?</p>
            <select id='es-seg'>${[1, 2, 3, 4].map(n => `<option value='${n}'${+(a.maxSeguidas || 2) === n ? ' selected' : ''}>${n === 1 ? '1 clase (siempre con descanso)' : n + ' clases seguidas'}</option>`).join('')}</select></div>
          <div class='es-op'><b>Reservar el mismo día</b><p>Hoy todas las clases se reservan hasta las ${esc(a.cierreNoche)} del día anterior. En verano puedes dejar que las de la tarde se reserven el mismo día.</p>
            <label class='es-sw' style='color:var(--ink)'><input type='checkbox' id='es-mismo'${a.horaTarde && a.horaTarde < '23:00' ? ' checked' : ''}><span class='es-tg'></span>Permitir reservar el mismo día</label>
            <div class='es-f es-mismo'${a.horaTarde && a.horaTarde < '23:00' ? '' : " style='display:none'"}>
              <label>Las clases desde las…<select id='es-tarde'>${['12:00', '13:00', '13:30', '15:00', '16:30'].map(x => `<option${a.horaTarde === x || (a.horaTarde >= '23:00' && x === '13:00') ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
              <label>…se pueden reservar hasta<select id='es-min'>${[1, 2, 3, 4, 6].map(n => `<option value='${n}'${+a.minHoras === n ? ' selected' : ''}>${n} hora${n === 1 ? '' : 's'} antes</option>`).join('')}</select></label></div></div>
        </details>
        <div class='es-acc'><button class='es-btn' data-aj='reglas'>Guardar</button></div><p class='es-err vivo'></p></div>
        <div class='pn-card es-como'><h3>Así funciona hoy</h3><ul>
          <li>Todas las clases se reservan hasta las ${esc(a.cierreNoche)} del día anterior.</li>
          <li>Las 8:30 solo aparecen el domingo.</li>
          <li>La app junta las clases de un instructor una tras otra, hasta ${a.maxSeguidas || 2} seguidas.</li>
          <li>En enero y febrero (lunes, martes, jueves y viernes de 9:00 a 12:00) la web deja 1 solo instructor por la Academia de Verano, y las clases de la mañana parten 9:30 y 11:00. A mano puedes anotar más.</li></ul></div>`;
    }
    if (ajTab === 'bloqueos') {
      const sy = E.anualSync;
      h += `<p class='es-intro'>En estas horas la app no le da clases particulares a ese instructor.</p>
        <div class='pn-card'><div class='es-cdh'><h3 style='margin:0'>Academia Anual</h3><button class='es-btn sec' data-sync>Actualizar ahora</button></div>
        ${nota('Se lee sola del calendario Storm cada hora. Las clases canceladas no bloquean. ' + (sy && sy.cuando ? 'Última vez: ' + esc(sy.cuando) + ' · ' + sy.clases + ' clases.' : 'Todavía no se ha leído.'))}</div>
        <div class='pn-card'><h3>Otros compromisos fijos</h3>
        ${(E.ocupaciones || []).filter(o => o.origen === 'fijo').map(o => `<div class='es-cd'><div class='es-cdh'><span>${esc(o.instructor === '*' ? 'Todos' : o.instructor)} · ${DIAS[o.dia]} ${esc(o.desde)} a ${esc(o.hasta)}</span><button data-fdel='${o.id}'>Quitar</button></div><p style='margin:2px 0 0;font-size:1.25rem;opacity:.7'>${esc(o.motivo)} · cada semana</p></div>`).join('') || nota('No hay ninguno.')}
        <p class='pn-sub' style='margin-top:14px'>Agregar uno (se repite cada semana):</p>
        <div class='es-f'>
          <label>Instructor<select id='es-fi'>${E.instructores.map(i => `<option>${esc(i.nombre)}</option>`).join('')}<option value='*'>Todos</option></select></label>
          <label>Día<select id='es-fd'>${[1, 2, 3, 4, 5, 6, 0].map(d => `<option value='${d}'>${DIAS[d]}</option>`).join('')}</select></label>
          <label>Desde<input id='es-fdes' placeholder='09:00'></label><label>Hasta<input id='es-fhas' placeholder='11:00'></label>
          <label class='w'>Qué es<input id='es-fmot' placeholder='Taller municipal'></label></div>
        <div class='es-acc'><button class='es-btn' data-fadd>Agregar</button></div><p class='es-err vivo'></p></div>`;
    }
    if (ajTab === 'admins') {
      h += `<div class='pn-card'><h3>Administradores</h3><p class='pn-sub'>Ven todo: valores, pagos y estos ajustes. Los instructores no.</p>
        <div class='es-f'><label class='w'>Correos (separados por coma)<input id='es-adm' value='${esc((a.admins || []).join(', '))}'></label></div>
        <div class='es-acc'><button class='es-btn' data-aj='admins'>Guardar</button></div><p class='es-err vivo'></p></div>
        <div class='pn-card'><h3>Notificaciones</h3><p class='pn-sub'>Llegan al celular cuando alguien reserva y el día antes a las 19:00. Prueba que te lleguen a ti:</p>
        <div class='es-acc'><button class='es-btn sec' data-pp>Mandarme una notificación de prueba</button></div><p class='pn-sub' data-ppr></p></div>`;
    }
    return h + `</div>`;
  }

  function bind(admin) {
    const $$ = s => pane.querySelectorAll(s), $ = s => pane.querySelector(s);
    $$('[data-fi]').forEach(b => b.onclick = () => { filtroIns = b.dataset.fi; pintar(); });
    $$('[data-pasadas]').forEach(b => b.onclick = () => { verPasadas = !verPasadas; pintar(); });
    $$('[data-lnx]').forEach(b => b.onclick = () => { linkNuevo = null; pintar(); });
    $$('[data-lf]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.lf); b.textContent = '¡Copiado!'; } catch (_) { prompt('Copia el link:', b.dataset.lf); } });
    $$('[data-copiar]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(E.link); b.textContent = '¡Copiado!'; } catch (_) { prompt('Copia el link:', E.link); } });
    $$('[data-manual]').forEach(b => b.onclick = () => { manualOn = !manualOn; pintar(); });
    $$('[data-nueva]').forEach(b => b.onclick = () => { manualOn = true; msg = ''; pintar(); });
    const fondo = $('[data-fondo]'); if (fondo) fondo.onclick = e => { if (e.target === fondo) { manualOn = false; pintar(); } };
    $$('[data-salir]').forEach(b => b.onclick = () => { const o = document.getElementById('pn-out'); if (o) o.click(); });
    $$('[data-abre]').forEach(b => b.onclick = () => { abierta = b.dataset.abre; modo = b.dataset.modo; msg = ''; sel = (E.reservas.find(r => r.ref === abierta) || {}).instructores.slice(); pintar(); });
    $$('[data-cerrar]').forEach(b => b.onclick = () => { abierta = ''; modo = ''; pintar(); });
    $$('[data-sel]').forEach(b => b.onclick = () => {
      const v = b.dataset.sel; // se pueden sumar o quitar instructores (casos especiales)
      if (sel.includes(v)) sel = sel.filter(x => x !== v); else sel.push(v);
      pintar();
    });
    const go = $('[data-go]');
    if (go) go.onclick = () => {
      const r = E.reservas.find(x => x.ref === abierta);
      if (go.dataset.go === 'ins') accion({ accion: 'editar', ref: abierta, instructores: sel }, go).then(ok => { if (ok) { msg = 'Listo: ' + r.nombre + ' ahora tiene clase con ' + sel.join(' y ') + '.'; pintar(); } });
      if (go.dataset.go === 'mover') { const f = $('#es-mf').value, hh = $('#es-mh').value; accion({ accion: 'editar', ref: abierta, fecha: f, hora: hh }, go).then(ok => { if (ok) { msg = 'Listo: clase de ' + r.nombre + ' movida al ' + flarga(f) + ' a las ' + hh + '. Avísale por WhatsApp.'; pintar(); } }); }
      if (go.dataset.go === 'datos') {
        const b = go.closest('.es-datos'), v = { accion: 'datos', ref: abierta };
        b.querySelectorAll('[name]').forEach(i => { if (i.name === 'pagoInstructor') { if (i.value.trim() !== i.dataset.orig) v.pagoInstructor = i.value.trim(); } else v[i.name] = i.value.trim(); });
        accion(v, go).then(ok => { if (ok) { msg = 'Listo: clase de ' + v.nombre + ' actualizada.'; pintar(); } });
      }
      if (go.dataset.go === 'cancelar') accion({ accion: 'cancelar', ref: abierta }, go).then(ok => { if (ok) { msg = 'Clase de ' + r.nombre + ' cancelada.'; pintar(); } });
    };
    $$('[data-pago]').forEach(b => b.onclick = () => { const r = E.reservas.find(x => x.ref === b.dataset.pago); accion({ accion: 'datos', ref: b.dataset.pago, medio: b.dataset.m }, b).then(ok => { if (ok) { msg = (r ? r.nombre + ': ' : '') + 'pagada con ' + b.textContent + '.'; pintar(); } }); });
    $$('[data-papel]').forEach(c => c.onchange = () => accion({ accion: 'datos', ref: c.dataset.papel, fichasPapel: c.checked ? 1 : 0 }, c).then(ok => { if (ok) { msg = c.checked ? 'Fichas en papel anotadas.' : 'Listo.'; pintar(); } }));
    $$('[data-mi]').forEach(b => b.onclick = () => { b.classList.toggle('on'); const card = b.closest('.pn-card'), n = card.querySelectorAll('[data-mi].on').length, ni = card.querySelector('[name=nInstructores]'); if (ni && n > +ni.value) ni.value = n; });
    const nomIn = $('[name=nombre][list=es-clientes]');
    if (nomIn) nomIn.onchange = () => { const c = (E.clientes || []).find(x => x.nombre.toLowerCase() === nomIn.value.trim().toLowerCase()); if (!c) return; const f = nomIn.closest('.pn-card'); const t = f.querySelector('[name=telefono]'), m = f.querySelector('[name=correo]'); if (t && !t.value) t.value = c.telefono; if (m && !m.value) m.value = c.correo; };
    $$('[data-dv]').forEach(b => b.onclick = () => { diaVer = b.dataset.dv === 'hoy' ? E.hoy : sumar(diaVer, +b.dataset.dv); pintar(); });
    $$('[data-dr]').forEach(b => b.onclick = () => { const r = E.reservas.find(x => x.ref === b.dataset.dr); sub = 'reservas'; verPasadas = r && r.fecha < E.hoy; filtroIns = ''; pintar(); const el = pane.querySelector(`[data-abre='${CSS.escape(b.dataset.dr)}']`); if (el) el.closest('.es-r').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $$('[data-dn]').forEach(b => b.onclick = () => { if (b.classList.contains('no') && !confirm(b.dataset.dn + ' no marcó disponible a esa hora. ¿Anotar igual?')) return; manualPre = { fecha: diaVer, hora: b.dataset.dh, ins: b.dataset.dn }; manualOn = true; pintar(); });
    if (manualPre) { const c = pane.querySelector('.pn-card:has([data-manual-go])'); if (c) { c.querySelector('[name=fecha]').value = manualPre.fecha; c.querySelector('[name=hora]').value = manualPre.hora; const ch = c.querySelector(`[data-mi="${CSS.escape(manualPre.ins)}"]`); if (ch) ch.classList.add('on'); } manualPre = null; }
    $$('[data-psw]').forEach(b => b.onclick = () => { psLunes = sumar(PS.lunes, +b.dataset.psw); psAbierto = ''; cargarPagos(); });
    $$('[data-psa]').forEach(b => b.onclick = () => { psAbierto = psAbierto === b.dataset.psa ? '' : b.dataset.psa; pintar(); });
    $$('[data-psr]').forEach(b => b.onclick = () => { PS = null; cargarPagos(); });
    $$('[data-psp]').forEach(b => b.onclick = () => { b.disabled = true; b.textContent = 'Guardando…'; cargarPagos({ marcar: { instructor: b.dataset.psp, monto: +b.dataset.pm, pagado: b.dataset.pv === '1' } }); });
    const mc = pane.querySelector('.pn-card:has([data-manual-go])');
    if (mc) {
      const re = () => { const c = cotiza(mc.querySelector('[name=personas]').value, mc.querySelector('[name=menores]').value), t = mc.querySelector('[name=total]'), n = mc.querySelector('[name=nInstructores]');
        if (t.dataset.auto) t.value = c.precio || ''; t.placeholder = c.precio ? '' : 'escribe el total (grupo grande)';
        if (n.dataset.auto) n.value = Math.max(c.ins, mc.querySelectorAll('[data-mi].on').length); };
      mc.querySelectorAll('[name=personas],[name=menores]').forEach(i => i.addEventListener('input', re));
      mc.querySelectorAll('[name=total],[name=nInstructores]').forEach(i => i.addEventListener('input', () => { delete i.dataset.auto; }));
    }
    const mg = $('[data-manual-go]');
    if (mg) mg.onclick = () => {
      const c = mg.closest('.pn-card'), v = {}; c.querySelectorAll('[name]').forEach(i => v[i.name] = i.type === 'checkbox' ? i.checked : i.value.trim());
      const elegidos = [...c.querySelectorAll('[data-mi].on')].map(b => b.dataset.mi);
      const body = Object.assign({ accion: 'manual' }, v, { instructores: elegidos });
      accion(body, mg).then(ok => { if (ok) { manualOn = false; msg = E.nuevoLink ? '' : 'Reserva de ' + v.nombre + ' guardada.'; linkNuevo = E.nuevoLink || null; sub = 'reservas'; pintar(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
    };
    // calendario
    $$('[data-ci]').forEach(b => b.onclick = () => { calIns = b.dataset.ci; pintar(); });
    $$('[data-wk]').forEach(b => b.onclick = () => { calDesde = sumar(calDesde, +b.dataset.wk); if (calDesde < E.hoy) calDesde = E.hoy; pintar(); });
    const inst = admin ? calIns : E.yo;
    $$('[data-sf]').forEach(b => b.onclick = () => {
      const f = b.dataset.sf, hh = b.dataset.sh, ahora = b.dataset.ok === '1', quiero = !ahora;
      const sinHora = Object.assign({}, E, { excepciones: E.excepciones.filter(e => !(e.instructor === inst && e.fecha === f && e.hora === hh)) });
      const base = (() => { const old = E; E = sinHora; const v = dispo(inst, f, hh); E = old; return v; })();
      const libre = base === quiero ? null : quiero;
      E.excepciones = sinHora.excepciones.concat(libre === null ? [] : [{ instructor: inst, fecha: f, hora: hh, libre }]);
      pintar(); enviar({ accion: 'disponible', instructor: inst, fecha: f, hora: hh, libre });
    });
    $$('[data-pf]').forEach(b => b.onclick = () => {
      const f = b.dataset.pf, p = b.dataset.p, volver = p === 'semana', horas = volver ? [] : PRESETS[p](dsem(f));
      E.excepciones = E.excepciones.filter(e => !(e.instructor === inst && e.fecha === f));
      if (!volver) E.excepciones.push({ instructor: inst, fecha: f, hora: '', libre: false }, ...horas.map(x => ({ instructor: inst, fecha: f, hora: x, libre: true })));
      pintar(); enviar({ accion: 'dia-horas', instructor: inst, fecha: f, horas, volver });
    });
    $$('[data-pd]').forEach(b => b.onclick = () => {
      const d = +b.dataset.pd, horas = PRESETS[b.dataset.p](d);
      const s = E.semana.find(s => s.instructor === inst && s.dia === d); if (s) s.horas = horas; else E.semana.push({ instructor: inst, dia: d, horas });
      pintar(); enviar({ accion: 'semana', instructor: inst, dia: d, horas });
    });
    $$('[data-dia]').forEach(b => b.onclick = () => { const l = b.dataset.libre; accion({ accion: 'disponible', instructor: inst, fecha: b.dataset.dia, hora: '', libre: l === 'x' ? null : l === '1' }, b); });
    $$('[data-sd]').forEach(b => b.onclick = () => {
      const d = +b.dataset.sd, s = E.semana.find(s => s.instructor === inst && s.dia === d), horas = s ? s.horas.slice() : [], x = b.dataset.sh;
      const nuevas = horas.includes(x) ? horas.filter(y => y !== x) : horas.concat(x);
      if (s) s.horas = nuevas; else E.semana.push({ instructor: inst, dia: d, horas: nuevas });
      pintar(); enviar({ accion: 'semana', instructor: inst, dia: d, horas: nuevas });
    });
    $$('[data-semtodo]').forEach(b => b.onclick = () => accion({ accion: 'semana', instructor: inst, dia: +b.dataset.semtodo, horas: b.dataset.v === '1' ? E.horarios.filter(x => +b.dataset.semtodo === 0 || x >= '09:00') : [] }, b));
    // ajustes
    $$('[data-ia]').forEach(c => c.onchange = () => { c.parentElement.lastChild.textContent = c.checked ? 'Activo' : 'Inactivo'; });
    $$('[data-irv]').forEach(b => b.onclick = () => { sub = b.dataset.irv; verPasadas = false; filtroIns = ''; pintar(); window.scrollTo({ top: 0 }); });
    const mi = $('#es-mismo'); if (mi) mi.onchange = () => { $('.es-mismo').style.display = mi.checked ? '' : 'none'; };
    $$('[data-ajt]').forEach(b => b.onclick = () => { ajTab = b.dataset.ajt; msg = ''; pintar(); });
    $$('[data-sync]').forEach(b => b.onclick = () => accion({ accion: 'sincronizar' }, b).then(ok => { if (ok) { msg = 'Academia Anual actualizada.'; pintar(); } }));
    $$('[data-fdel]').forEach(b => b.onclick = () => accion({ accion: 'fijo', borrar: b.dataset.fdel }, b));
    $$('[data-fadd]').forEach(b => b.onclick = () => accion({ accion: 'fijo', instructor: $('#es-fi').value, dia: $('#es-fd').value, desde: $('#es-fdes').value, hasta: $('#es-fhas').value, motivo: $('#es-fmot').value }, b).then(ok => { if (ok) { msg = 'Guardado.'; pintar(); } }));
    const pp = $('[data-pp]');
    if (pp) pp.onclick = async () => { const o = $('[data-ppr]'); pp.disabled = true; o.textContent = 'Enviando…';
      try { const r = await post({ accion: 'probar-push' }); o.textContent = r.enviado ? '¡Enviada! Debería llegarte en unos segundos donde tengas Panel Storm o Agenda Storm con notificaciones.' : 'No llegó: este correo (' + auth.email + ') no tiene la app con notificaciones activadas. Abre Panel Storm en el celular, entra con ese correo y acepta las notificaciones. (' + r.detalle + ')'; }
      catch (x) { o.textContent = x.message; } pp.disabled = false; };
    $$('[data-aj]').forEach(b => b.onclick = async () => {
      const t = b.dataset.aj;
      if (t === 'precios') {
        const precios = {}, pagos = {}; $$('[data-pr]').forEach(i => precios[i.dataset.pr] = i.value); $$('[data-pa]').forEach(i => pagos[i.dataset.pa] = i.value);
        if (await accion({ accion: 'ajustes', precios, pagos }, b)) { msg = 'Precios guardados. La página para reservar ya muestra los nuevos.'; pintar(); }
      }
      if (t === 'reglas' && await accion({ accion: 'ajustes', horarios: $('#es-hor').value.split(/[,\s]+/).filter(Boolean), minHoras: $('#es-min').value, maxSeguidas: $('#es-seg').value, diasAdelante: $('#es-dias').value, horaTarde: $('#es-mismo').checked ? $('#es-tarde').value : '23:59', cierreNoche: $('#es-noche').value, lugar: $('#es-lugar').value }, b)) { msg = 'Horarios y reglas guardados.'; pintar(); }
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
  window.StormEscuela = { cargar, datos: () => E, ir: x => { sub = x; msg = ''; if (pane) pintar(); }, nueva: () => { manualOn = true; msg = ''; if (pane) pintar(); } };
})();
