// App Storm (app.stormsurf.cl): aviso para instalar en el celular y notificaciones con OneSignal.
(() => {
  const C = window.STORM_APP || {};
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const movil = ios || /Android/i.test(ua);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} }
  };
  const auth = () => { try { const a = JSON.parse(ls.get(C.clave) || 'null'); return a && a.email ? a : null; } catch (_) { return null; } };
  const callado = k => { const t = +ls.get(k) || 0; return Date.now() < t; };
  const callar = (k, dias) => ls.set(k, String(Date.now() + dias * 864e5));
  const ICON = C.raiz + 'icons/storm-app-180.png', NAME = C.nombre || 'Storm';
  const svg = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>'
  };

  // ---------- Banner (uno a la vez) ----------
  let banner = null;
  function quitar() { if (banner) { banner.remove(); banner = null; } }
  function mostrar(html, onGo, onX) {
    quitar();
    const d = document.createElement('div'); d.className = 'st-app'; d.innerHTML = html;
    d.querySelector('.st-go').onclick = onGo;
    d.querySelector('.st-x').onclick = () => { quitar(); onX && onX(); };
    document.body.appendChild(d); banner = d;
  }
  const step = (n, ic, t, sub) => `<div class="st-step"><span class="st-n">${n}</span><span class="st-ic">${ic}</span><span>${t}${sub ? '<small>' + sub + '</small>' : ''}</span></div>`;
  function guia() {
    const s = document.createElement('div'); s.className = 'st-sheet';
    s.innerHTML = `<div class="st-card"><h3>Agrega ${NAME} a tu celular</h3><p class="st-sub">Son 3 toques y queda como app, con avisos de Storm.</p>`
      + (ios
        ? step(1, svg.share, 'Toca <b>Compartir</b>', 'Está en la barra de Safari. Si no lo ves, toca primero los ···')
        + step(2, svg.plus, 'Elige <b>Agregar a inicio</b>', 'Baja un poco en la lista si no aparece')
        + step(3, svg.check, 'Toca <b>Agregar</b>', 'Después ábrela desde el ícono de Storm')
        : step(1, svg.dots, 'Toca los <b>⋮</b> de Chrome', 'Arriba a la derecha')
        + step(2, svg.plus, 'Elige <b>Agregar a pantalla principal</b>', 'o "Instalar app"')
        + step(3, svg.check, 'Toca <b>Agregar</b>', '¡Listo!'))
      + '<button class="st-ok">Entendido</button></div>';
    s.onclick = e => { if (e.target === s || e.target.classList.contains('st-ok')) s.remove(); };
    document.body.appendChild(s);
  }
  let instalar = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalar = e; decidir(); });

  // ---------- Notificaciones (OneSignal) ----------
  let OS = null, permiso = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const pushPosible = () => !!C.appId && 'serviceWorker' in navigator && 'PushManager' in window && (!ios || standalone);
  if (C.appId) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async OneSignal => {
      try {
        await OneSignal.init({ appId: C.appId, safari_web_id: C.safariId, serviceWorkerPath: 'OneSignalSDKWorker.js', serviceWorkerParam: { scope: '/' }, notifyButton: { enable: false }, autoResubscribe: true,
          welcomeNotification: { title: 'Storm 🌊', message: '¡Ya eres parte de la familia Storm! Aquí te avisaremos de las clases y novedades.' } });
        OS = OneSignal;
        OneSignal.Notifications.addEventListener('permissionChange', () => { permiso = Notification.permission; sincronizar(); decidir(); });
        sincronizar(); decidir();
      } catch (x) { console.warn('OneSignal', x); }
    });
  }
  let ultimo = null;
  async function sincronizar() {
    if (!OS) return;
    const a = auth(), email = a ? String(a.email).toLowerCase() : '';
    if (email === ultimo) return;
    ultimo = email;
    try {
      if (email) { await OS.login(email); OS.User.addTag('tipo', C.clave === 'storm-panel' ? 'equipo' : 'familia'); }
      else if (OS.User && OS.User.externalId) await OS.logout();
    } catch (x) { console.warn('OneSignal login', x); }
  }
  async function activar() {
    quitar();
    if (!OS) return;
    try { await OS.Notifications.requestPermission(); } catch (_) {}
    permiso = Notification.permission;
    if (permiso === 'granted') {
      ls.set('storm-push-ok', '1');
      mostrar(`<span class="st-bell">${svg.check}</span><p><b>¡Listo!</b>Te avisaremos aquí cuando Storm mande un mensaje.</p><button class="st-go">OK</button><button class="st-x" aria-label="Cerrar">×</button>`, quitar);
      banner.dataset.fijo = '1'; setTimeout(quitar, 5000);
    }
  }

  // ---------- Qué mostrar ----------
  function decidir() {
    if (banner && banner.dataset.fijo) return;
    const a = auth();
    // 1) iPhone sin instalar: las notificaciones solo funcionan con la app en la pantalla de inicio.
    if (movil && !standalone && !callado('storm-app-aviso2')) {
      const texto = ios ? `<b>Ten ${NAME} en tu celular</b>Instálala para recibir los avisos de Storm.` : `<b>Ten ${NAME} en tu celular</b>Como una app, a un toque.`;
      return mostrar(`<img src="${ICON}" alt=""><p>${texto}</p><button class="st-go">Agregar</button><button class="st-x" aria-label="Cerrar">×</button>`,
        async () => { if (instalar) { instalar.prompt(); const r = await instalar.userChoice; instalar = null; if (r.outcome === 'accepted') quitar(); } else guia(); },
        () => callar('storm-app-aviso2', 5));
    }
    // 2) Con sesión iniciada: pedir permiso de notificaciones.
    if (a && OS && pushPosible() && permiso === 'default' && !callado('storm-push-aviso')) {
      return mostrar(`<span class="st-bell">${svg.bell}</span><p><b>Activa los avisos de Storm</b>Te llegan al celular los mensajes de tu grupo.</p><button class="st-go">Activar</button><button class="st-x" aria-label="Cerrar">×</button>`,
        activar, () => callar('storm-push-aviso', 3));
    }
    quitar();
  }

  // La sección guarda la sesión en localStorage al entrar o salir: revisamos cada pocos segundos.
  setInterval(() => { const e = (auth() || {}).email || ''; if (e !== (decidir.e || '')) { decidir.e = e; sincronizar(); decidir(); } }, 2500);
  addEventListener('load', () => setTimeout(() => { decidir.e = (auth() || {}).email || ''; decidir(); }, 1200));
})();
