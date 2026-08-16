const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const dist = path.join(projectRoot, 'dist');
if (path.basename(dist) !== 'dist' || path.dirname(dist) !== projectRoot) {
  throw new Error(`Ruta de salida inesperada: ${dist}`);
}

const removableFile = /^(MapleVault-Setup-.*\.(exe|blockmap)|latest\.yml|builder-debug\.yml|builder-effective-config\.yaml)$/i;
if (!fs.existsSync(dist)) process.exit(0);

for (const entry of fs.readdirSync(dist, { withFileTypes: true })) {
  const fullPath = path.join(dist, entry.name);
  if (entry.isFile() && removableFile.test(entry.name)) fs.rmSync(fullPath, { force: true });
  if (entry.isDirectory() && entry.name === 'win-unpacked') fs.rmSync(fullPath, { recursive: true, force: true });
}

console.log('[MapleVault] Salida de instalador anterior limpiada; se conservaron los insumos de empaquetado.');
