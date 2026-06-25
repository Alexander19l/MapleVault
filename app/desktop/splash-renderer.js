window.mapleLauncher?.onStatus((message) => {
  const statusElement = document.getElementById('status-text');
  if (statusElement) statusElement.textContent = message;
});
