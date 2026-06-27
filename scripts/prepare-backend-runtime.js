const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const backendRoot = path.join(root, 'app', 'backend');
const backendModules = path.join(backendRoot, 'node_modules');
const distRoot = path.join(root, 'dist');
const runtimeRoot = path.join(distRoot, 'backend-runtime');

if (runtimeRoot !== path.join(distRoot, 'backend-runtime')) {
  throw new Error(`Ruta de staging inesperada: ${runtimeRoot}`);
}

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath || !fs.existsSync(npmExecPath)) {
  throw new Error('No se pudo localizar npm. Ejecuta este script mediante npm run prepare:package-runtime.');
}

if (!fs.existsSync(path.join(backendRoot, 'dist', 'server.js'))) {
  throw new Error('Falta app/backend/dist/server.js. Ejecuta npm run build antes del staging.');
}

const output = execFileSync(
  process.execPath,
  [npmExecPath, 'ls', '--omit=dev', '--all', '--parseable'],
  {
    cwd: backendRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  }
);

const productionPackages = output
  .split(/\r?\n/)
  .map(value => value.trim())
  .filter(Boolean)
  .filter(packagePath => packagePath !== backendRoot);

fs.rmSync(runtimeRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(runtimeRoot, 'node_modules'), { recursive: true });
fs.cpSync(path.join(backendRoot, 'dist'), path.join(runtimeRoot, 'dist'), { recursive: true });
fs.copyFileSync(path.join(backendRoot, 'package.json'), path.join(runtimeRoot, 'package.json'));
fs.mkdirSync(path.join(runtimeRoot, 'scripts'), { recursive: true });
fs.copyFileSync(
  path.join(root, 'scripts', 'setup-libretranslate.ps1'),
  path.join(runtimeRoot, 'scripts', 'setup-libretranslate.ps1')
);

for (const packagePath of productionPackages) {
  const resolvedPackagePath = path.resolve(packagePath);
  if (!resolvedPackagePath.startsWith(`${backendModules}${path.sep}`)) {
    throw new Error(`Dependencia fuera de app/backend/node_modules: ${resolvedPackagePath}`);
  }

  const relativePath = path.relative(backendRoot, resolvedPackagePath);
  const destination = path.join(runtimeRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(resolvedPackagePath, destination, { recursive: true });
}

const runtimeSize = fs.readdirSync(runtimeRoot, { recursive: true })
  .reduce((total, relativePath) => {
    const absolutePath = path.join(runtimeRoot, String(relativePath));
    const stats = fs.statSync(absolutePath);
    return stats.isFile() ? total + stats.size : total;
  }, 0);

console.log(
  `[MapleVault] Runtime backend preparado: ${productionPackages.length} paquetes, ${(runtimeSize / 1024 / 1024).toFixed(1)} MB.`
);
