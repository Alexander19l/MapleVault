export async function showConfirm(message: string): Promise<boolean> {
  const eApi = (window as any).electronAPI;
  if (eApi && eApi.confirm) {
    return await eApi.confirm(message);
  }
  // Fallback para navegador
  return window.confirm(message);
}
