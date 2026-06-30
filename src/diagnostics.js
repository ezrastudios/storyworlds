(() => {
  const show = (title, detail) => {
    let box = document.querySelector('#diagnostics');
    if (!box) {
      box = document.createElement('aside');
      box.id = 'diagnostics';
      box.style.cssText = `
        position: fixed;
        left: 16px;
        right: 16px;
        top: 330px;
        z-index: 9999;
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(55, 38, 38, 0.9);
        color: #fff8ef;
        font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
        box-shadow: 0 18px 40px rgba(0,0,0,.25);
        white-space: pre-wrap;
      `;
      document.body.appendChild(box);
    }
    box.textContent = `${title}\n${detail || ''}`;
  };

  window.storyWorldsDiagnostics = { show };

  window.addEventListener('error', event => {
    show('Error de JavaScript', event.message || String(event.error || event));
  });

  window.addEventListener('unhandledrejection', event => {
    show('Error cargando módulo', event.reason?.message || String(event.reason || event));
  });

  setTimeout(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      show('El motor 3D no cargó', 'Safari no logró cargar Three.js. Voy a usar este mensaje para identificar el fallo exacto.');
    }
  }, 3000);
})();
