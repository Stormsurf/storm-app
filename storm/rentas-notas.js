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
    tarjeta: sv("<rect x='3' y='5.5' width='18' height='13' rx='2.5'/><path d='M3 10h18M7 15h3'/>"),
    billete: sv("<rect x='2.5' y='6' width='19' height='12' rx='2'/><circle cx='12' cy='12' r='2.6'/><path d='M6 9.5v5M18 9.5v5'/>"),
    banco: sv("<path d='M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18'/>"),
    carro: sv("<path d='M3 4h2l2.4 11h10.2L20 7.5H6.3'/><circle cx='9.5' cy='19' r='1.4'/><circle cx='17' cy='19' r='1.4'/>"),
    reloj: sv("<circle cx='12' cy='12' r='8.5'/><path d='M12 7.5V12l3 2'/>"),
    link: sv("<path d='M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'/><path d='M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'/>"),
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
  .rn-ic i.fib{background:#fdf0d8;color:#b5662b}
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
  .rn-dias{margin-top:8px}.rn-vu{margin:8px 4px 0;font-size:1.3rem;color:#0f6e74;font-weight:600}.rn-dias span{padding-left:6px}
  .rn-cli{display:flex;flex-direction:column;gap:6px;margin-top:6px}.rn-cli:empty{display:none}
  .rn-cli button{display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;border:1.5px solid var(--line);border-radius:12px;background:#fff;padding:10px 12px;font:inherit;font-size:1.45rem;color:var(--ink);cursor:pointer}
  .rn-cli button small{color:#8a8986;font-size:1.25rem}
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
  .rn-f>div.rn-cart{display:flex;flex-direction:column;padding:0;height:92vh;overflow:hidden}
  .rn-ch2{position:relative;padding:18px 16px 10px;border-bottom:1px solid var(--line)}.rn-ch2 h2{margin:0 44px 10px 0;font-size:2.2rem}.rn-ch2 .rn-in{margin:0}
  .rn-back{position:absolute;left:10px;top:12px;width:38px;height:38px;border-radius:50%;border:0;background:#f3f1ec;font-size:2.2rem;line-height:1;cursor:pointer;color:var(--ink)}
  .rn-back~h2{margin-left:44px}.rn-res{margin:0;font-size:1.3rem;color:#6d6c68}.rn-back~.rn-res{margin-left:44px}
  .rn-cb{flex:1;overflow:auto;padding:6px 16px 16px;-webkit-overflow-scrolling:touch}
  .rn-cf{flex:none;display:flex;align-items:center;gap:12px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:#fff}.rn-cf:empty{display:none}
  .rn-cf .rn-go{width:auto;flex:1;max-width:220px;margin-left:auto}.rn-cf .rn-go[disabled]{opacity:.35}
  .rn-tt{display:flex;flex-direction:column}.rn-tt small{font-size:1.2rem;color:#8a8986}.rn-tt b{font-size:2.4rem;line-height:1.1}
  .rn-cl{border:1px solid var(--line);border-radius:16px;overflow:hidden}
  .rn-ci2{display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid var(--line)}.rn-ci2:first-child{border-top:0}
  .rn-ci2 span{flex:1;min-width:0;font-weight:600;font-size:1.4rem}.rn-ci2 small{display:block;font-weight:400;color:#6d6c68;font-size:1.15rem}
  .rn-ci2 button{flex:none;width:32px;height:32px;border-radius:50%;border:1px solid var(--line);background:#fff;font:inherit;font-size:1.6rem;line-height:1;color:#0f6e74;cursor:pointer;display:grid;place-items:center;padding:0}
  .rn-ci2 b{min-width:16px;text-align:center;font-size:1.45rem}.rn-ci2 em{font-style:normal;font-weight:700;font-size:1.4rem;min-width:74px;text-align:right}
  .rn-sp{display:grid;gap:6px}
  .rn-sp button{display:flex;align-items:center;gap:10px;width:100%;border:1.5px dashed rgba(15,110,116,.4);background:#f6fbfb;border-radius:14px;padding:10px 12px;font:inherit;text-align:left;color:var(--ink);cursor:pointer}
  .rn-sp span{flex:1;min-width:0;font-weight:600;font-size:1.35rem}.rn-sp small{display:block;font-weight:400;color:#6d6c68;font-size:1.15rem}.rn-sp b{font-size:1.35rem}
  .rn-sp button.nueva{border-style:solid;background:#fff}
  .rn-sp i{flex:none;width:28px;height:28px;border-radius:50%;background:#0f6e74;color:#fff;font-style:normal;display:grid;place-items:center;font-size:1.7rem}
  .rn-pg2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .rn-pg2 button{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:64px;border:1px solid var(--line);background:#fff;border-radius:14px;padding:10px 12px;font:inherit;text-align:left;color:var(--ink);cursor:pointer}
  .rn-pg2 button span{font-weight:600;font-size:1.35rem;line-height:1.25;padding-right:22px}.rn-pg2 button small{font-size:1.2rem;color:#6d6c68}
  .rn-pg2 button.on{border-color:#0f6e74;background:#E3F1F1}
  .rn-pg2 i{position:absolute;top:8px;right:8px;min-width:22px;height:22px;border-radius:999px;background:#0f6e74;color:#fff;font-style:normal;font-weight:700;font-size:1.2rem;display:grid;place-items:center;padding:0 5px}
  .rn-otro{margin-top:10px}
  .rn-pm{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .rn-pm button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:96px;border:1.5px solid var(--line);background:#fff;border-radius:18px;font:inherit;font-weight:700;font-size:1.45rem;color:var(--ink);cursor:pointer}
  .rn-pm button svg{width:28px;height:28px;color:#0f6e74}.rn-pm button:active{background:#E3F1F1;border-color:#0f6e74}
  .rn-pm.chico button{flex-direction:row;justify-content:flex-start;height:56px;padding:0 14px;gap:10px;text-align:left}.rn-pm.chico button svg{width:22px;height:22px;flex:none}
  .rn-pm.chico button.ancho{grid-column:1/-1}.rn-pm button small{display:block;font-weight:500;font-size:1.15rem;color:#8a8986}
  .rn-pm button.on{background:#0f6e74;border-color:#0f6e74;color:#fff}.rn-pm button.on svg,.rn-pm button.on small{color:#fff}
  .rn-ch2.solo h2{margin-bottom:0}
  .rn-ok2 .rn-cb{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.rn-ok2 h2{margin:12px 0 4px;font-size:2.2rem}.rn-ok2 p{margin:0;font-size:1.5rem;color:#55544f}.rn-ok2 p.rn-res{display:block;margin-top:8px;max-width:340px;font-size:1.4rem}
  .rn-ok2 .rn-big{width:72px;height:72px;border-radius:50%;background:#2f9a6a;color:#fff;display:grid;place-items:center;font-size:3.4rem;font-weight:700;margin:0}
  .rn-ok2 .rn-cf .rn-go{max-width:none}
  .rn-go.ter{background:none;color:#0f6e74;border:1.5px dashed rgba(15,110,116,.45);margin-top:8px;padding:11px;font-size:1.4rem}
  .rn-ops{display:grid;gap:8px}
  .rn-op{display:flex;align-items:center;gap:10px;width:100%;border:1.5px solid var(--line);background:#fff;border-radius:16px;padding:12px 14px;font:inherit;text-align:left;color:var(--ink);cursor:pointer}
  .rn-op i{flex:none;width:24px;height:24px;border-radius:7px;border:1.5px solid var(--line);display:grid;place-items:center;font-style:normal;font-size:1.4rem;color:#fff}
  .rn-op.on{border-color:#0f6e74;background:#E3F1F1}.rn-op.on i{background:#0f6e74;border-color:#0f6e74}
  .rn-op span{flex:1;min-width:0;font-weight:600;font-size:1.4rem}.rn-op small{display:block;font-weight:400;color:#6d6c68;font-size:1.2rem}.rn-op b{font-size:1.4rem}
  .rn-lp{display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:1.3rem;color:#55544f}
  .rn-li{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px 14px;margin-top:8px}.rn-li.ok{opacity:.75}
  .rn-lt{display:flex;gap:10px;align-items:flex-start}.rn-lt span{flex:1;min-width:0;font-size:1.4rem}.rn-lt small{display:block;color:#6d6c68;font-size:1.2rem}.rn-lt em{font-style:normal;font-weight:700;font-size:1.45rem}
  .rn-li .rn-acc{align-items:center;flex-wrap:wrap;gap:6px;margin-top:8px}.rn-li .rn-wa{width:36px;height:36px}
  .rn-lok{margin:6px 0 0;color:#2f7a4d;font-weight:600;font-size:1.3rem}
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
  let auth = null, R = null, N = null, cargando = null, alCambiar = () => {}, elR = null, elN = null, tabN = 'aviso', verListas = false, verDev = false, nueva = null, CL = [];

  async function post(body) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, auth, body)) });
    let d; try { d = await r.json(); } catch (_) { throw new Error('No se pudo conectar. Intenta de nuevo.'); }
    if (!d.ok) throw new Error(d.error || 'Error');
    return d;
  }
  const KEY = 'storm-rn-datos';
  const guardarCache = () => { try { localStorage.setItem(KEY, JSON.stringify({ email: auth.email, R, N })); } catch (_) {} };
  const leerCache = () => { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && c.email === auth.email) { R = c.R; N = c.N; CL = (R && R.clientes) || []; } } catch (_) {} };
  // Clientes (Isidora 25-11): la lista viene con las rentas; se guarda aparte porque los cobros no la repiten.
  const ponerR = d => { if (d && d.clientes) CL = d.clientes; else if (d) d.clientes = CL; R = d; };

  function montar(r, n, a, cb) {
    elR = r; elN = n; auth = a; alCambiar = cb || alCambiar;
    if (!document.getElementById('rn-css')) { const s = document.createElement('style'); s.id = 'rn-css'; s.textContent = CSS; document.head.appendChild(s); }
    leerCache(); pintar();
  }
  function cargar() {
    if (!auth) return Promise.resolve();
    if (cargando) return cargando;
    cargando = Promise.all([post({ accion: 'rentas' }), post({ accion: 'notas' })])
      .then(([a, b]) => { ponerR(a); N = b; guardarCache(); pintar(); alCambiar(); })
      .catch(() => {}).finally(() => { cargando = null; });
    return cargando;
  }
  async function hacer(acc, body, btn) {
    if (btn) { btn.disabled = true; btn.dataset.t = btn.innerHTML; btn.textContent = 'Guardando…'; }
    try { const d = await post(Object.assign({ accion: acc }, body)); if (acc === 'rentas' || acc === 'tienda') ponerR(d); else N = d; guardarCache(); pintar(); alCambiar(); return true; }
    catch (x) { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.t; } alert(x.message); return false; }
  }
  const pintar = () => { pintarRentas(); pintarNotas(); };
  const clp = n => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n || 0)).toLocaleString('es-CL');
  const pagoT = p => p === 'Link de pago' ? 'Esperando link' : p;
  const debe = x => x.pago === 'Falta pagar' || x.pago === 'Link de pago';
  const PAGOS = [['POS', 'POS'], ['Efectivo', 'Efectivo'], ['Transferencia', 'Transferencia']];

  // ---------- Rentas ----------
  const hoy = () => (R && R.hoy) || (N && N.hoy) || new Date().toISOString().slice(0, 10);
  const fechaC = f => { const [y, m, d] = f.split('-'); return DIAS[new Date(+y, m - 1, +d).getDay()] + ' ' + (+d) + '/' + (+m); };
  const queEs = x => [x.tablas ? x.tablas + (x.tablas === 1 ? ' tabla soft' : ' tablas soft') : '', x.fibras ? x.fibras + (x.fibras === 1 ? ' tabla de fibra' : ' tablas de fibra') : '', x.trajes ? x.trajes + (x.trajes === 1 ? ' traje' : ' trajes') : ''].filter(Boolean).join(' y ');
  // Isidora (25-11): día completo puede ser por varios días (1 tabla × 3 días). La cantidad es de equipos; los días van aparte.
  const diasDe = x => x.tiempo === 'dia' ? Math.max(1, x.dias || 1) : 1;
  const tiempoT = (t, d) => t !== 'dia' ? 'Medio día' : (d || 1) > 1 ? d + ' días completos' : 'Día completo';
  const sumarD = (f, n) => { const [y, m, d] = f.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };
  const vuelve = x => sumarD(x.fecha, diasDe(x) - 1); // último día de la renta
  const hace = (f, h) => { if (f !== hoy()) return ''; const [a, b] = h.split(':').map(Number), d = new Date(), m = d.getHours() * 60 + d.getMinutes() - (a * 60 + b); return m < 60 ? ' (hace ' + Math.max(0, m) + ' min)' : ' (hace ' + Math.floor(m / 60) + ' h' + (m % 60 >= 30 ? ' y media' : '') + ')'; };
  const afuera = () => R ? R.rentas.filter(x => !x.devuelta) : [];
  const tarde = x => !x.devuelta && vuelve(x) < hoy();
  function tarjeta(x) {
    const t = tarde(x), wl = wa(x.telefono);
    const msg = encodeURIComponent('Hola ' + x.nombre.split(' ')[0] + ', te escribimos de Storm por ' + ((x.tablas || x.fibras) && x.trajes || (x.tablas && x.fibras) ? 'el equipo' : (x.tablas || x.fibras) ? ((x.tablas || x.fibras) > 1 ? 'las tablas' : 'la tabla') : (x.trajes > 1 ? 'los trajes' : 'el traje')) + ' que arrendaste. ¿A qué hora lo traes? 🌊');
    return `<div class='rn-c${t ? ' tarde' : ''}${x.devuelta ? ' vuelta' : ''}'>
      <div class='rn-top'><div class='rn-ic'>${x.tablas ? `<i>${ICO.tabla}${x.tablas > 1 ? `<b>${x.tablas}</b>` : ''}</i>` : ''}${x.fibras ? `<i class='fib'>${ICO.tabla}${x.fibras > 1 ? `<b>${x.fibras}</b>` : ''}</i>` : ''}${x.trajes ? `<i>${ICO.traje}${x.trajes > 1 ? `<b>${x.trajes}</b>` : ''}</i>` : ''}</div>
        <div class='rn-tx'><b>${esc(x.nombre)}</b><small>${esc(queEs(x))} · ${tiempoT(x.tiempo, diasDe(x))}</small>
          <small>${x.devuelta ? 'Salió ' + esc(x.hora) + ' · volvió ' + esc(x.devueltaHora) : (x.fecha === hoy() ? 'Salió hoy ' + esc(x.hora) + (diasDe(x) > 1 ? '' : hace(x.fecha, x.hora)) : 'Salió ' + fechaC(x.fecha) + ' ' + esc(x.hora)) + (diasDe(x) > 1 ? ' · vuelve ' + (vuelve(x) === hoy() ? 'hoy' : fechaC(vuelve(x))) : '')}${x.por ? ' · anotó ' + esc(x.por) : ''}</small>
          ${x.nota ? `<small class='rn-nt'>${esc(x.nota)}</small>` : ''}</div>
        ${t ? `<span class='rn-tag tarde'>No ha vuelto</span>` : debe(x) ? `<span class='rn-tag debe'>${x.pago === 'Link de pago' ? 'Esperando pago' : 'Falta pagar'}</span>` : `<span class='rn-tag'>${esc(pagoT(x.pago))}${x.monto ? ' ' + clp(x.monto) : ''}</span>`}</div>
      ${x.devuelta ? `<div class='rn-acc'><button class='rn-lk' data-op='deshacer' data-id='${esc(x.id)}'>No ha vuelto (deshacer)</button></div>`
        : `<div class='rn-acc'><button class='rn-vol' data-op='devuelta' data-id='${esc(x.id)}'>${ICO.ok}Volvió</button>${debe(x) ? `<button class='rn-pg' data-pagar='${esc(x.id)}'>Pagó</button>` : ''}${wl ? `<a class='rn-wa' href='https://wa.me/${wl}?text=${msg}' target='_blank' rel='noopener' aria-label='WhatsApp'>${ICO.wa}</a>` : ''}</div>
          <div class='rn-acc' style='margin-top:4px'><button class='rn-lk rojo' data-op='borrar' data-id='${esc(x.id)}'>Borrar (me equivoqué)</button></div>`}
    </div>`;
  }
  // Links de pago esperando (y los pagados de hoy)
  function linksH() {
    const L = (R && R.links) || []; if (!L.length) return '';
    return `<p class='rn-h'>Links de pago</p>` + L.map(l => `<div class='rn-li${l.estado === 'pagada' ? ' ok' : ''}'>
      <div class='rn-lt'><span><b>${esc(l.nombre || l.partes[0] || 'Link de pago')}</b><small>${esc(l.partes.join(' · '))}</small></span><em>${clp(l.total)}</em></div>
      ${l.estado === 'pagada' ? `<p class='rn-lok'>✓ Pagado · ${esc(l.medio)}</p>`
        : `<div class='rn-acc'><span class='rn-tag debe'>Esperando pago</span><a class='rn-wa' href='https://wa.me/${wa(l.telefono)}?text=${encodeURIComponent(msgLink(l))}' target='_blank' rel='noopener' aria-label='Mandar por WhatsApp'>${ICO.wa}</a><button class='rn-lk' data-lk='copiar' data-r='${esc(l.ref)}'>Copiar</button><button class='rn-lk' data-lk='revisar' data-r='${esc(l.ref)}'>¿Ya pagó?</button><button class='rn-lk rojo' data-lk='anular' data-r='${esc(l.ref)}'>Anular</button></div>`}
    </div>`).join('');
  }
  async function accionLink(op, ref, b) {
    const l = ((R && R.links) || []).find(x => x.ref === ref); if (!l) return;
    if (op === 'copiar') return copiar(l.link, b);
    if (op === 'anular' && !confirm('¿Anular este link? Ya no se podrá pagar.')) return;
    const t = b.textContent; b.disabled = true; b.textContent = op === 'revisar' ? 'Revisando…' : 'Anulando…';
    try { const d = await post({ accion: 'link', op, ref }); R.links = d.links; const y = d.links.find(x => x.ref === ref); if (op === 'revisar' && y && y.estado !== 'pagada') alert('Todavía no aparece pagado.'); await cargar(); }
    catch (x) { alert(x.message); } finally { b.disabled = false; b.textContent = t; }
  }
  function pintarRentas() {
    if (!elR) return;
    if (!R) { elR.innerHTML = `<div class='rn'><div class='pn-skel'></div><div class='pn-skel'></div></div>`; return; }
    const af = afuera().sort((a, b) => (tarde(b) - tarde(a)) || ((a.fecha + a.hora) < (b.fecha + b.hora) ? -1 : 1));
    const dev = R.rentas.filter(x => x.devuelta).sort((a, b) => (a.fecha + a.hora) < (b.fecha + b.hora) ? 1 : -1);
    const devHoy = dev.filter(x => x.fecha === hoy());
    const mes = R.rentas.filter(x => x.fecha.slice(0, 7) === hoy().slice(0, 7));
    const sum = (l, k, t) => l.filter(x => !t || x.tiempo === t).reduce((s, x) => s + (x[k] || 0) * diasDe(x), 0); // día completo cuenta cada día
    const nT = af.reduce((s, x) => s + x.tablas + (x.fibras || 0), 0), nJ = af.reduce((s, x) => s + x.trajes, 0);
    const vHoy = (R.ventas || []).filter(v => v.fecha === hoy());
    let h = `<div class='rn'><div class='rn-2'><button class='rn-go' data-rnnueva>${sv("<path d='M12 5v14M5 12h14'/>")}Nueva renta</button><button class='rn-go sec' data-tienda>${ICO.carro}Cobrar</button></div>
      ${linksH()}
      <p class='rn-h'>Afuera ahora ${af.length ? `<em>${[nT ? nT + (nT === 1 ? ' tabla' : ' tablas') : '', nJ ? nJ + (nJ === 1 ? ' traje' : ' trajes') : ''].filter(Boolean).join(' · ')}</em>` : ''}</p>
      ${af.length ? af.map(tarjeta).join('') : `<div class='rn-vacio'>No hay tablas ni trajes afuera. 🌊</div>`}`;
    const otras = verDev ? dev : devHoy;
    h += `<p class='rn-h gris'>${verDev ? 'Volvieron (últimos 30 días)' : 'Volvieron hoy'}</p>` + (otras.length ? otras.map(tarjeta).join('') : `<div class='rn-vacio'>Todavía nada.</div>`)
      + (dev.length > devHoy.length || verDev ? `<button class='rn-lk' data-verdev>${verDev ? 'Ver solo las de hoy' : 'Ver días anteriores'}</button>` : '');
    h += `<p class='rn-h gris'>Este mes</p><div class='rn-res'>
      <div><b>${sum(mes, 'tablas', 'medio') + sum(mes, 'fibras', 'medio')}</b><span>tablas medio día</span></div><div><b>${sum(mes, 'tablas', 'dia') + sum(mes, 'fibras', 'dia')}</b><span>tablas día completo</span></div>
      <div><b>${sum(mes, 'trajes', 'medio')}</b><span>trajes medio día</span></div><div><b>${sum(mes, 'trajes', 'dia')}</b><span>trajes día completo</span></div></div>
      <p class='rn-h'>Vendido hoy en tienda y daños ${vHoy.length ? `<em>${clp(vHoy.reduce((a, v) => a + v.monto, 0))}</em>` : ''}</p>
      ${vHoy.length ? vHoy.map(v => `<div class='rn-v'><span>${esc(v.detalle)}<small>${esc(v.hora)} · ${esc(pagoT(v.pago))}${v.por ? ' · ' + esc(v.por) : ''}</small></span><b>${clp(v.monto)}</b></div>`).join('') + `<button class='rn-lk rojo' data-vborrar>Borrar una venta (me equivoqué)</button>` : `<div class='rn-vacio'>Todavía nada.</div>`}
      <p class='rn-h'>Cierre del día</p>
      <button class='rn-go' data-cierre style='margin-top:4px'>${ICO.ok}Cerrar el día</button>
      <p style='font-size:1.2rem;color:#8a8986;margin:8px 2px 0'>Cobra en la máquina Tuu y anótalo aquí al tiro. Al final del día toca Cerrar el día.</p></div>`;
    elR.innerHTML = h;
    elR.querySelector('[data-rnnueva]').onclick = () => abrirNueva();
    elR.querySelector('[data-tienda]').onclick = () => abrirTienda();
    elR.querySelectorAll('[data-lk]').forEach(b => b.onclick = () => accionLink(b.dataset.lk, b.dataset.r, b));
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
    w.innerHTML = `<div><button class='rn-x' aria-label='Cerrar'>✕</button><h2>¿Cómo pagó?</h2><div class='rn-pm chico' style='margin-top:14px'>${[['POS', ICO.tarjeta], ['Efectivo', ICO.billete], ['Transferencia', ICO.banco]].map(([p, ic]) => `<button data-p='${p}'>${ic}<span>${p}</span></button>`).join('')}</div></div>`;
    document.body.appendChild(w);
    w.onclick = async e => { if (e.target === w || e.target.closest('.rn-x')) return w.remove(); const b = e.target.closest('[data-p]'); if (b && await hacer('rentas', { op: 'pago', id, pago: b.dataset.p }, b)) w.remove(); };
  }
  // Formulario de renta (lo usan Nueva renta y el carro de Cobrar)
  const rPR = () => (R && R.precios) || { tablas: { medio: 10000, dia: 20000 }, fibras: { medio: 20000, dia: 40000 }, trajes: { medio: 10000, dia: 20000 } };
  const rHay = n => n.tablas + n.fibras + n.trajes > 0;
  const rMonto = n => n.montoAMano ? Number(n.monto) || 0 : (n.tiempo && rHay(n) ? diasDe(n) * ['tablas', 'fibras', 'trajes'].reduce((t, k) => t + n[k] * (rPR()[k][n.tiempo] || 0), 0) : 0);
  const rQue = n => [n.tablas ? n.tablas + ' soft' : '', n.fibras ? n.fibras + ' fibra' : '', n.trajes ? n.trajes + (n.trajes === 1 ? ' traje' : ' trajes') : ''].filter(Boolean).join(' · ') + (diasDe(n) > 1 ? ' · ' + n.dias + ' días' : '');
  const rVacia = () => ({ tablas: 0, fibras: 0, trajes: 0, tiempo: '', dias: 1, pago: '', nombre: '', telefono: '', nota: '', monto: '', montoAMano: false, editar: false });
  const rArriba = n => `<p class='rn-q' style='margin-top:4px'>¿Qué se lleva?</p>
        <div class='rn-st'>${[['tablas', 'Tabla soft', ICO.tabla], ['fibras', 'Tabla de fibra', ICO.tabla], ['trajes', 'Traje', ICO.traje]].map(([k, t, ic]) => `<div class='${n[k] ? 'on' : ''}'><i>${ic}</i><span>${t}</span><button data-m='${k}' aria-label='Menos'>−</button><b>${n[k]}</b><button data-p='${k}' aria-label='Más'>+</button></div>`).join('')}</div>
        <p class='rn-q'>¿Cuánto tiempo?</p>
        <div class='rn-ch dos'>${[['medio', 'Medio día'], ['dia', 'Día completo']].map(([k, t]) => `<button class='${n.tiempo === k ? 'on' : ''}' data-t='${k}'>${t}</button>`).join('')}</div>
        ${n.tiempo === 'dia' ? `<div class='rn-st rn-dias'><div class='on'><span>¿Cuántos días?</span><button data-dm aria-label='Menos'>−</button><b>${n.dias}</b><button data-dp aria-label='Más'>+</button></div></div><p class='rn-vu'>Sale hoy ${fechaC(hoy())} · vuelve ${n.dias > 1 ? fechaC(sumarD(hoy(), n.dias - 1)) : 'hoy'}</p>` : ''}`;
  const rQuien = n => `<p class='rn-q'>¿Quién arrienda?</p>
        <input id='rn-nom' class='rn-in' placeholder='Nombre (busca si ya es cliente)' autocomplete='off' value='${esc(n.nombre)}'>
        <div class='rn-cli' id='rn-cli'></div>
        <input id='rn-tel' class='rn-in' placeholder='WhatsApp (para avisarle si no vuelve)' inputmode='tel' autocomplete='off' value='${esc(n.telefono)}'>
        <input id='rn-nota' class='rn-in' placeholder='Nota (ej: tabla azul 8’0, traje talla M, dejó carnet)' autocomplete='off' value='${esc(n.nota)}'>
        ${n.editar ? `<p class='rn-q'>Monto</p><input id='rn-monto' class='rn-in' inputmode='numeric' placeholder='Monto' value='${rMonto(n) || ''}'>` : `<button class='rn-lk' data-reditar style='display:block;margin:14px auto 0'>Cambiar el monto (descuento)</button>`}`;
  const rLeer = (w, n) => { const q = id => w.querySelector(id); if (q('#rn-nom')) { n.nombre = q('#rn-nom').value; n.telefono = q('#rn-tel').value; n.nota = q('#rn-nota').value; } if (q('#rn-monto')) { n.monto = q('#rn-monto').value.replace(/\D/g, ''); n.montoAMano = true; } };
  // Buscar cliente al escribir el nombre (como al agendar una clase): por nombre o teléfono. Al tocarlo se completa el WhatsApp.
  const solo = t => String(t || '').replace(/\D/g, '');
  function rClientes(w) {
    const nom = w.querySelector('#rn-nom'), box = w.querySelector('#rn-cli'); if (!nom || !box) return;
    const ver = () => {
      const q = nom.value.trim().toLowerCase(), qd = solo(q);
      const l = q.length < 2 ? [] : CL.filter(c => c.nombre.toLowerCase() !== q && (c.nombre.toLowerCase().includes(q) || (qd.length >= 4 && solo(c.telefono).includes(qd)))).slice(0, 5);
      box.innerHTML = l.map(c => `<button type='button' data-cli='${esc(c.nombre)}'><b>${esc(c.nombre)}</b>${c.telefono ? `<small>${esc(c.telefono)}</small>` : ''}</button>`).join('');
      if (l.length) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    nom.oninput = ver; nom.onfocus = ver;
    box.onclick = e => { const b = e.target.closest('[data-cli]'); if (!b) return; e.stopPropagation(); const c = CL.find(x => x.nombre === b.dataset.cli); if (!c) return;
      nom.value = c.nombre; const t = w.querySelector('#rn-tel'); if (t && !t.value.trim()) t.value = c.telefono || ''; box.innerHTML = ''; };
  }
  /** Toques del formulario de renta (cantidades, tiempo, días, cambiar monto). true si lo atendió. */
  function rToque(w, n, b, repintar) {
    if (b.dataset.dm !== undefined || b.dataset.dp !== undefined) { rLeer(w, n); n.dias = Math.max(1, Math.min(14, (n.dias || 1) + (b.dataset.dm !== undefined ? -1 : 1))); if (!n.editar) n.montoAMano = false; repintar(); return true; }
    if (b.dataset.m || b.dataset.p) { rLeer(w, n); const k = b.dataset.m || b.dataset.p; n[k] = Math.max(0, Math.min(20, n[k] + (b.dataset.m ? -1 : 1))); if (!n.editar) n.montoAMano = false; repintar(); return true; }
    if (b.dataset.t) { rLeer(w, n); n.tiempo = b.dataset.t; if (!n.editar) n.montoAMano = false; repintar(); return true; }
    if (b.dataset.reditar !== undefined) { rLeer(w, n); n.monto = String(rMonto(n) || ''); n.montoAMano = true; n.editar = true; repintar(); const mm = w.querySelector('#rn-monto'); if (mm) { mm.focus(); mm.select(); } return true; }
    return false;
  }
  // Nueva renta (Isidora 24-11): misma forma que Cobrar. El monto sale solo según lo elegido, los botones de pago son parejos
  // y Guardar está siempre abajo. Si se cierra con algo elegido, pregunta antes de descartar; al guardar, confirma.
  function abrirNueva() {
    nueva = rVacia();
    const hay = () => rHay(nueva), monto = () => rMonto(nueva), que = () => rQue(nueva);
    const w = document.createElement('div'); w.className = 'rn-f'; document.body.appendChild(w);
    let listo = false;
    const cerrar = () => { rLeer(w, nueva); if (!listo && (hay() || nueva.nombre.trim()) && !confirm('¿Descartar esta renta? No se ha guardado.')) return; w.remove(); };
    const MED = [['POS', 'POS', ICO.tarjeta], ['Efectivo', 'Efectivo', ICO.billete], ['Transferencia', 'Transferencia', ICO.banco], ['Falta pagar', 'Falta pagar', ICO.reloj, 'Paga al volver']];
    w.innerHTML = `<div class='rn-cart'><div class='rn-ch2 solo'><h2>Nueva renta</h2><button class='rn-x' aria-label='Cerrar'>✕</button></div><div class='rn-cb'></div><div class='rn-cf'></div></div>`;
    const cb = w.querySelector('.rn-cb'), cf = w.querySelector('.rn-cf');
    function cuerpo() {
      const y = cb.scrollTop;
      cb.innerHTML = `${rArriba(nueva)}
        <p class='rn-q'>¿Cómo paga?</p>
        <div class='rn-pm chico'>${MED.map(([k, t, ic, sub]) => `<button class='${nueva.pago === k ? 'on' : ''}${sub ? ' ancho' : ''}' data-pg='${k}'>${ic}<span>${t}${sub ? `<small>${sub}</small>` : ''}</span></button>`).join('')}</div>
        ${rQuien(nueva)}
        <p class='rn-err'></p>`;
      cb.scrollTop = y; rClientes(cb);
      const mm = cb.querySelector('#rn-monto'); if (mm) mm.oninput = () => { nueva.monto = mm.value.replace(/\D/g, ''); nueva.montoAMano = true; pie(); };
      pie();
    }
    function pie() {
      const ok = hay() && nueva.tiempo && nueva.pago, m = monto();
      const sub = !hay() ? 'Toca + en lo que se lleva' : !nueva.tiempo ? 'Elige medio día o día completo' : !nueva.pago ? 'Elige cómo paga' : nueva.pago === 'Falta pagar' ? 'Paga al volver · ' + que() : que();
      cf.innerHTML = `<div class='rn-tt'><small>${esc(sub)}</small><b>${clp(m)}</b></div><button class='rn-go' data-guardar ${ok ? '' : 'disabled'}>Guardar</button>`;
    }
    function hecho() {
      listo = true;
      const tag = nueva.pago === 'Falta pagar' ? 'Falta pagar · se cobra al volver' : nueva.pago;
      w.innerHTML = `<div class='rn-cart rn-ok2'><div class='rn-cb'><div class='rn-big'>✓</div><h2>Renta guardada</h2><p>${clp(monto())} · ${esc(tag)}</p><p class='rn-res' style='text-align:center'>${esc(nueva.nombre.trim())} · ${esc(queEs(nueva))} · ${tiempoT(nueva.tiempo, diasDe(nueva))}${diasDe(nueva) > 1 ? ' · vuelve ' + fechaC(sumarD(hoy(), nueva.dias - 1)) : ''}</p></div><div class='rn-cf'><button class='rn-go' data-fin>Listo</button></div></div>`;
      setTimeout(() => { if (w.isConnected) w.remove(); }, 2500);
    }
    cuerpo();
    w.onclick = async e => {
      if (e.target === w || e.target.closest('.rn-x')) return cerrar();
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.fin !== undefined) return w.remove();
      if (rToque(w, nueva, b, cuerpo)) return;
      if (b.dataset.pg) { rLeer(w, nueva); nueva.pago = b.dataset.pg; return cuerpo(); }
      if (b.dataset.guardar !== undefined) {
        rLeer(w, nueva); const er = w.querySelector('.rn-err');
        if (!monto() && nueva.pago !== 'Falta pagar') { er.textContent = 'Escribe el monto.'; return er.scrollIntoView({ block: 'center' }); }
        if (nueva.nombre.trim().length < 2) { er.textContent = 'Escribe el nombre de quien arrienda.'; const n = w.querySelector('#rn-nom'); n.scrollIntoView({ block: 'center' }); return n.focus(); }
        er.textContent = ''; b.disabled = true; b.textContent = 'Guardando…';
        try {
          ponerR(await post(Object.assign({ accion: 'rentas', op: 'nueva' }, nueva, { monto: String(monto()) }))); guardarCache(); pintar(); alCambiar();
          hecho();
        } catch (x) { b.disabled = false; pie(); er.textContent = x.message; er.scrollIntoView({ block: 'center' }); }
      }
    };
  }

  // ---------- Tienda (Isidora 23-11): se anota qué se vendió al cobrar ----------
  function hoja(html) { const w = document.createElement('div'); w.className = 'rn-f'; w.innerHTML = `<div><button class='rn-x' aria-label='Cerrar'>✕</button>${html}</div>`; document.body.appendChild(w); return w; }
  // Cobrar (Isidora 24-11): un solo carro con productos de la tienda, rentas y clases sin pagar.
  // Paso 1: armar el carro (buscador, productos con un toque, total siempre visible abajo). Paso 2: cómo paga (POS, efectivo,
  // transferencia o link de pago). Al guardar se confirma; si se cierra con cosas en el carro, pregunta antes de descartar.
  function abrirTienda(opt) {
    opt = opt || {};
    const v = { cant: {}, sel: new Set(opt.sel || []), ops: null, nr: [], rn: null, paso: 'carro', otro: false, dano: false, q: '', od: '', om: '', ln: '', lt: '' };
    const w = document.createElement('div'); w.className = 'rn-f'; document.body.appendChild(w);
    const num = t => Number(String(t || '').replace(/\D/g, '')) || 0;
    const sinT = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const prods = () => R.productos || [];
    const enCarro = () => prods().filter(x => v.cant[x.id]);
    const opsSel = () => (v.ops || []).filter(o => v.sel.has(o.id));
    const total = () => enCarro().reduce((t, x) => t + x.precio * v.cant[x.id], 0) + (v.otro ? num(v.om) : 0) + opsSel().reduce((t, o) => t + o.monto, 0) + v.nr.reduce((t, n) => t + rMonto(n), 0);
    const lleno = () => total() > 0;
    const cerrar = () => { if (v.paso === 'renta') rLeer(w, v.rn); if (v.paso !== 'listo' && (lleno() || (v.paso === 'renta' && rHay(v.rn))) && !confirm('¿Descartar este cobro? No se ha guardado.')) return; w.remove(); };
    post({ accion: 'link', op: 'opciones' }).then(d => { v.ops = d.opciones || []; const o = opsSel()[0]; if (o) { v.ln = v.ln || o.nombre; v.lt = v.lt || o.telefono; } if (v.paso === 'carro') cuerpo(); pie(); }).catch(() => { v.ops = []; if (v.paso === 'carro') cuerpo(); });
    // --- paso 1: el carro ---
    const fila = (k, nombre, sub, monto, n) => `<div class='rn-ci2'><span>${esc(nombre)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${n != null ? `<button data-m='${k}' aria-label='Uno menos'>−</button><b>${n}</b><button data-p='${k}' aria-label='Uno más'>+</button>` : `<button data-qs='${k}' aria-label='Quitar'>✕</button>`}<em>${clp(monto)}</em></div>`;
    function cuerpo() {
      const b = w.querySelector('.rn-cb'); if (!b) return;
      const q = sinT(v.q).trim(), lista = prods().filter(x => !q || sinT(x.nombre).includes(q));
      const libres = (v.ops || []).filter(o => !v.sel.has(o.id) && (!q || sinT(o.detalle + ' ' + o.sub).includes(q)));
      const items = enCarro().map(x => fila(x.id, x.nombre, '', x.precio * v.cant[x.id], v.cant[x.id])).join('') + opsSel().map(o => fila(o.id, o.detalle, o.sub, o.monto)).join('') + v.nr.map((n, i) => fila('nr' + i, 'Renta · ' + n.nombre.trim(), rQue(n).replace(/ · \d+ días$/, '') + ' · ' + tiempoT(n.tiempo, diasDe(n)).toLowerCase(), rMonto(n))).join('')
        + (v.otro && num(v.om) ? fila('otro', v.od || (v.dano ? 'Cobro por daño' : 'Otro'), v.dano ? 'Cobro por daño' : '', num(v.om)) : '');
      b.innerHTML = `${items ? `<p class='rn-q' style='margin-top:4px'>En el cobro</p><div class='rn-cl'>${items}</div>` : ''}
        <p class='rn-q'>Rentas y clases</p><div class='rn-sp'><button data-rnueva class='nueva'><span>Renta nueva<small>Ármala aquí y se guarda al cobrar</small></span><i>+</i></button></div>
        ${libres.length ? `<p class='rn-q' style='margin-top:10px'>Sin pagar</p><div class='rn-sp'>${libres.map(o => `<button data-op='${esc(o.id)}'><span>${esc(o.detalle)}<small>${esc(o.sub)}</small></span><b>${clp(o.monto)}</b><i>+</i></button>`).join('')}</div>` : !v.ops ? `<div class='pn-skel' style='height:52px;margin-top:10px'></div>` : ''}
        <p class='rn-q'>Tienda</p>
        <div class='rn-pg2'>${lista.map(x => `<button data-p='${esc(x.id)}' class='${v.cant[x.id] ? 'on' : ''}'><span>${esc(x.nombre)}</span><small>${clp(x.precio)}</small>${v.cant[x.id] ? `<i>${v.cant[x.id]}</i>` : ''}</button>`).join('')}
          ${!q || 'otro'.includes(q) ? `<button data-otro class='${v.otro ? 'on' : ''}'><span>Otro monto</span><small>Escribe el monto</small></button>` : ''}</div>
        ${!lista.length && !libres.length ? `<div class='rn-vacio'>No hay nada con “${esc(v.q)}”. Usa Otro monto.</div>` : ''}
        ${v.otro ? `<div class='rn-otro'><input id='rn-od' class='rn-in' placeholder='${v.dano ? '¿Qué se rompió?' : '¿Qué es? (ej: parafina)'}' value='${esc(v.od)}'><input id='rn-om' class='rn-in' inputmode='numeric' placeholder='Monto' value='${esc(v.om)}'>
          <button class='rn-lk' data-dano>${v.dano ? '☑' : '☐'} Es un cobro por daño de algo arrendado</button></div>` : ''}
        ${R.admin ? `<button class='rn-lk' data-editar style='display:block;margin:14px auto 0'>Editar productos y precios</button>` : ''}`;
      const od = b.querySelector('#rn-od'), om = b.querySelector('#rn-om');
      if (od) od.oninput = () => { v.od = od.value; };
      if (om) { om.oninput = () => { v.om = om.value.replace(/\D/g, ''); pie(); }; om.onblur = () => cuerpo(); }
    }
    function pie() {
      const f = w.querySelector('.rn-cf'); if (!f) return;
      const n = enCarro().reduce((t, x) => t + v.cant[x.id], 0) + opsSel().length + v.nr.length + (v.otro && num(v.om) ? 1 : 0);
      f.innerHTML = v.paso === 'carro' ? `<div class='rn-tt'><small>${n ? n + (n === 1 ? ' cosa' : ' cosas') : 'Toca lo que se cobra'}</small><b>${clp(total())}</b></div><button class='rn-go' data-cobrar ${lleno() ? '' : 'disabled'}>Cobrar</button>` : '';
    }
    function carro() {
      v.paso = 'carro';
      w.innerHTML = `<div class='rn-cart'><div class='rn-ch2'><h2>Cobrar</h2><button class='rn-x' aria-label='Cerrar'>✕</button>
        <input id='rn-bq' class='rn-in' type='search' placeholder='Buscar producto, renta o clase' autocomplete='off' value='${esc(v.q)}'></div>
        <div class='rn-cb'></div><div class='rn-cf'></div></div>`;
      const bq = w.querySelector('#rn-bq'); bq.oninput = () => { v.q = bq.value; cuerpo(); };
      cuerpo(); pie();
    }
    // --- renta nueva dentro del carro ---
    function rentaPaso() {
      v.paso = 'renta'; const n = v.rn;
      w.innerHTML = `<div class='rn-cart'><div class='rn-ch2 solo'><button class='rn-back' data-volver aria-label='Volver'>‹</button><h2>Renta nueva</h2><button class='rn-x' aria-label='Cerrar'>✕</button></div><div class='rn-cb'></div><div class='rn-cf'></div></div>`;
      const cb = w.querySelector('.rn-cb'), cf = w.querySelector('.rn-cf');
      const pieR = () => { const ok = rHay(n) && n.tiempo; cf.innerHTML = `<div class='rn-tt'><small>${esc(!rHay(n) ? 'Toca + en lo que se lleva' : !n.tiempo ? 'Elige medio día o día completo' : rQue(n))}</small><b>${clp(rMonto(n))}</b></div><button class='rn-go' data-ragregar ${ok ? '' : 'disabled'}>${n.i != null ? 'Listo' : 'Agregar al cobro'}</button>`; };
      v.rpinta = () => { const y = cb.scrollTop; cb.innerHTML = rArriba(n) + rQuien(n) + `<p class='rn-err'></p>`; cb.scrollTop = y; rClientes(cb); const mm = cb.querySelector('#rn-monto'); if (mm) mm.oninput = () => { n.monto = mm.value.replace(/\D/g, ''); n.montoAMano = true; pieR(); }; pieR(); };
      v.rpinta();
    }
    // --- paso 2: cómo paga ---
    const resumen = () => enCarro().map(x => (v.cant[x.id] > 1 ? v.cant[x.id] + ' × ' : '') + x.nombre).concat(opsSel().map(o => o.detalle), v.nr.map(n => 'Renta · ' + n.nombre.trim()), v.otro && num(v.om) ? [v.od || 'Otro'] : []).join(' · ');
    // Link de pago solo para clases (Isidora 24-11): lo online entra por Webpay y se declara exento; rentas y tienda llevan IVA y van por POS.
    const soloClases = () => !enCarro().length && !(v.otro && num(v.om)) && !v.nr.length && opsSel().length > 0 && opsSel().every(o => o.tipo === 'clase');
    function pago(err) {
      v.paso = 'pago';
      w.innerHTML = `<div class='rn-cart'><div class='rn-ch2'><button class='rn-back' data-volver aria-label='Volver'>‹</button><h2>${clp(total())}</h2><button class='rn-x' aria-label='Cerrar'>✕</button><p class='rn-res'>${esc(resumen())}</p></div>
        <div class='rn-cb'><p class='rn-q' style='margin-top:6px'>¿Cómo paga?</p>
        <div class='rn-pm'>${[['POS', 'POS', ICO.tarjeta], ['Efectivo', 'Efectivo', ICO.billete], ['Transferencia', 'Transferencia', ICO.banco]].concat(soloClases() ? [['LINK', 'Link de pago', ICO.link]] : []).map(([k, t, ic]) => `<button data-pg='${k}'>${ic}<span>${t}</span></button>`).join('')}</div>
        <p class='rn-err'>${esc(err || '')}</p></div><div class='rn-cf'></div></div>`;
    }
    function datosLink(err) {
      v.paso = 'link';
      w.innerHTML = `<div class='rn-cart'><div class='rn-ch2'><button class='rn-back' data-volver aria-label='Volver'>‹</button><h2>Link de pago</h2><button class='rn-x' aria-label='Cerrar'>✕</button><p class='rn-res'>${clp(total())} · ${esc(resumen())}</p></div>
        <div class='rn-cb'><p class='rn-q' style='margin-top:6px'>¿A quién se lo mandas?</p><input id='rn-ln' class='rn-in' placeholder='Nombre (opcional)' autocomplete='off' value='${esc(v.ln)}'><input id='rn-lt' class='rn-in' inputmode='tel' placeholder='WhatsApp (opcional)' autocomplete='off' value='${esc(v.lt)}'>
        <p style='font-size:1.25rem;color:#8a8986;margin:10px 2px 0'>Le llega un link para pagar en línea con Webpay. Cuando pague, cada cosa queda anotada sola.</p><p class='rn-err'>${esc(err || '')}</p></div>
        <div class='rn-cf'><button class='rn-go' data-crear>Crear link</button></div></div>`;
    }
    function listo(medio) {
      v.paso = 'listo';
      w.innerHTML = `<div class='rn-cart rn-ok2'><div class='rn-cb'><div class='rn-big'>✓</div><h2>Cobro guardado</h2><p>${clp(v.totalOk)} · ${esc(medio)}</p><p class='rn-res' style='text-align:center'>${esc(v.resOk)}</p></div><div class='rn-cf'><button class='rn-go' data-fin>Listo</button></div></div>`;
      setTimeout(() => { if (w.isConnected && v.paso === 'listo') w.remove(); }, 2500);
    }
    const base = () => ({ items: Object.keys(v.cant).filter(k => v.cant[k]).map(id => ({ id, cant: v.cant[id] })), otroDetalle: v.otro && !v.dano ? v.od : '', otroMonto: v.otro && !v.dano ? v.om : '', danoDetalle: v.otro && v.dano ? v.od : '', danoMonto: v.otro && v.dano ? v.om : '', rentas: [...v.sel], clases: [...v.sel], nuevasRentas: v.nr.map(n => ({ tablas: n.tablas, fibras: n.fibras, trajes: n.trajes, tiempo: n.tiempo, dias: n.dias, nombre: n.nombre, telefono: n.telefono, nota: n.nota, monto: String(rMonto(n)) })) });
    w.onclick = async e => {
      if (e.target === w || e.target.closest('.rn-x')) return cerrar();
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.fin !== undefined) return w.remove();
      if (v.paso === 'renta' && rToque(w, v.rn, b, v.rpinta)) return;
      if (b.dataset.volver !== undefined) { if (v.paso === 'renta') { rLeer(w, v.rn); if (v.rn.i == null && (rHay(v.rn) || v.rn.nombre.trim()) && !confirm('¿Descartar esta renta?')) return; } return carro(); }
      if (b.dataset.rnueva !== undefined) { v.rn = rVacia(); return rentaPaso(); }
      if (b.dataset.ragregar !== undefined) {
        const n = v.rn; rLeer(w, n); const er = w.querySelector('.rn-err');
        if (n.nombre.trim().length < 2) { er.textContent = 'Escribe el nombre de quien arrienda.'; const x = w.querySelector('#rn-nom'); x.scrollIntoView({ block: 'center' }); return x.focus(); }
        if (!rMonto(n)) { er.textContent = 'Escribe el monto.'; return er.scrollIntoView({ block: 'center' }); }
        if (n.i != null) v.nr[n.i] = n; else v.nr.push(n);
        delete n.i; if (!v.ln) { v.ln = n.nombre; v.lt = n.telefono; } return carro();
      }
      if (b.dataset.p || b.dataset.m) { const k = b.dataset.p || b.dataset.m; v.cant[k] = Math.max(0, (v.cant[k] || 0) + (b.dataset.m ? -1 : 1)); cuerpo(); return pie(); }
      if (b.dataset.op) { v.sel.add(b.dataset.op); const o = (v.ops || []).find(x => x.id === b.dataset.op); if (o) { v.ln = v.ln || o.nombre; v.lt = v.lt || o.telefono; } v.q = ''; const bq = w.querySelector('#rn-bq'); if (bq) bq.value = ''; cuerpo(); return pie(); }
      if (b.dataset.qs) { if (b.dataset.qs === 'otro') { v.otro = false; v.om = ''; v.od = ''; } else if (/^nr\d+$/.test(b.dataset.qs)) v.nr.splice(+b.dataset.qs.slice(2), 1); else v.sel.delete(b.dataset.qs); cuerpo(); return pie(); }
      if (b.dataset.otro !== undefined) { v.otro = !v.otro; cuerpo(); pie(); const om = w.querySelector('#rn-od'); if (om) om.focus(); return; }
      if (b.dataset.dano !== undefined) { v.dano = !v.dano; return cuerpo(); }
      if (b.dataset.editar !== undefined) { if (lleno() && !confirm('¿Descartar este cobro? No se ha guardado.')) return; w.remove(); return editarProductos(); }
      if (b.dataset.cobrar !== undefined) return pago();
      if (b.dataset.pg === 'LINK') return datosLink();
      if (b.dataset.pg || b.dataset.crear !== undefined) {
        const link = b.dataset.crear !== undefined; if (link) { v.ln = w.querySelector('#rn-ln').value; v.lt = w.querySelector('#rn-lt').value; }
        w.querySelectorAll('button').forEach(x => x.disabled = true); const t0 = b.innerHTML; b.innerHTML = link ? 'Creando link…' : 'Guardando…';
        v.totalOk = total(); v.resOk = resumen();
        try {
          if (link) { const d = await post(Object.assign({ accion: 'link', op: 'crear', nombre: v.ln, telefono: v.lt }, base())); v.paso = 'listo'; w.remove(); linkListo(d.nuevo); cargar(); }
          else { R = await post(Object.assign({ accion: 'tienda', op: 'venta', pago: b.dataset.pg }, base())); guardarCache(); pintar(); alCambiar(); listo(pagoT(b.dataset.pg)); }
        } catch (x) { link ? datosLink(x.message) : pago(x.message); }
      }
    };
    carro();
  }
  const msgLink = n => 'Hola' + (n.nombre ? ' ' + n.nombre.split(' ')[0] : '') + ', aquí puedes pagar en Storm (' + clp(n.total) + '): ' + n.link;
  function linkListo(n) {
    const tel = wa(n.telefono);
    const w = hoja(`<h2>Link listo</h2><div class='rn-tot' style='margin-top:4px'><span>Total</span><b>${clp(n.total)}</b></div>
      <div class='rn-lp'>${n.partes.map(x => `<span>${esc(x)}</span>`).join('')}</div>
      <a class='rn-go' href='https://wa.me/${tel}?text=${encodeURIComponent(msgLink(n))}' target='_blank' rel='noopener' style='margin-top:16px;text-decoration:none'>${ICO.wa}Mandar por WhatsApp</a>
      <button class='rn-go sec' data-copiar style='margin-top:8px'>Copiar link</button>
      <p style='font-size:1.2rem;color:#8a8986;margin:10px 2px 0;text-align:center'>Cuando paguen, queda anotado solo en la Tienda y en la Agenda.</p>`);
    w.onclick = e => { if (e.target === w || e.target.closest('.rn-x')) return w.remove(); const b = e.target.closest('[data-copiar]'); if (b) copiar(n.link, b); };
  }
  function copiar(t, b) { const ok = () => { b.textContent = '✓ Copiado'; setTimeout(() => b.textContent = 'Copiar link', 1800); }; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(ok).catch(() => { prompt('Copia el link:', t); }); }
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
        <p class='rn-q'>POS</p>
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
    nueva: abrirNueva,
    tienda: () => (R ? Promise.resolve() : cargar()).then(() => { if (R) abrirTienda(); })
  };
})();
