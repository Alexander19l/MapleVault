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

    iframe.addEventListener('load', () => {
      loader.style.display = 'none';
      iframe.style.visibility = 'visible';
    }, { once: true });
    iframe.src = parsed.toString();
  } catch {
    loader.style.display = 'none';
    iframe.style.display = 'none';
    error.style.display = 'block';
  }
})();
