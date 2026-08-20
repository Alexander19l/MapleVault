(() => {
  const params = new URLSearchParams(window.location.search);
  const rawUrl = params.get('url') || '';
  const title = String(params.get('title') || 'MapleVault Player').slice(0, 120);
  const iframe = document.getElementById('player');
  const loader = document.getElementById('loader');
  const error = document.getElementById('error');

  document.title = title;

  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('URL no permitida');
    }

    // Si el servidor rechaza la peticion, el evento load puede no llegar nunca. Sin este
    // respaldo el iframe se quedaba invisible para siempre y el usuario solo veia una
    // pantalla negra, sin forma de saber que habia pasado.
    const revealTimer = window.setTimeout(() => {
      loader.style.display = 'none';
      iframe.style.visibility = 'visible';
      error.textContent = 'Este servidor esta tardando demasiado o rechazo la conexion. Prueba con otro servidor de la lista.';
      error.style.display = 'block';
    }, 15000);

    iframe.addEventListener('load', () => {
      window.clearTimeout(revealTimer);
      loader.style.display = 'none';
      error.style.display = 'none';
      iframe.style.visibility = 'visible';
    }, { once: true });

    iframe.addEventListener('error', () => {
      window.clearTimeout(revealTimer);
      loader.style.display = 'none';
      error.textContent = 'No se pudo cargar este servidor. Prueba con otro de la lista.';
      error.style.display = 'block';
    }, { once: true });

    iframe.src = parsed.toString();
  } catch {
    loader.style.display = 'none';
    iframe.style.display = 'none';
    error.style.display = 'block';
  }
})();
