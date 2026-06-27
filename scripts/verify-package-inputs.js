const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'package.json',
  'dist/desktop/main.js',
  'dist/desktop/preload.js',
  'dist/desktop/launcherPreload.js',
  'dist/desktop/splash.html',
  'dist/desktop/error.html',
  'dist/desktop/assets/icon.ico',
  'dist/desktop/assets/icon.png',
  'app/frontend/dist/index.html',
  'app/backend/dist/server.js',
  'app/backend/node_modules/sqlite3/package.json'
];

const missing = requiredFiles.filter(relativePath => {
  return !fs.existsSync(path.join(root, relativePath));
});

if (missing.length > 0) {
  console.error('[MapleVault] No se puede crear el instalador. Faltan archivos requeridos:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const iconPath = path.join(root, 'app/desktop/assets/icon.ico');
const iconHeader = fs.readFileSync(iconPath).subarray(0, 4);
const isValidIco = iconHeader.length === 4
  && iconHeader[0] === 0
  && iconHeader[1] === 0
  && iconHeader[2] === 1
  && iconHeader[3] === 0;

if (!isValidIco) {
  console.error('[MapleVault] app/desktop/assets/icon.ico no tiene una cabecera ICO valida.');
  process.exit(1);
}

console.log('[MapleVault] Entradas del instalador verificadas correctamente.');
