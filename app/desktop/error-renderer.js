window.mapleLauncher?.onErrorDetails((message) => {
  const detailsElement = document.getElementById('details-text');
  if (detailsElement) detailsElement.textContent = message;
});

document.getElementById('open-logs')?.addEventListener('click', () => {
  window.mapleLauncher?.sendErrorAction('open-logs');
});

document.getElementById('exit')?.addEventListener('click', () => {
  window.mapleLauncher?.sendErrorAction('exit');
});

document.getElementById('retry')?.addEventListener('click', () => {
  window.mapleLauncher?.sendErrorAction('retry');
});
