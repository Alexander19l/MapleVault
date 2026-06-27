import fs from 'fs';
import path from 'path';

export function resolveDesktopAssetPath(fileName: string): string {
  const candidates = [
    path.join(__dirname, 'assets', fileName),
    path.join(__dirname, '../../app/desktop/assets', fileName),
    path.join(process.resourcesPath || '', 'app/desktop/assets', fileName),
    path.join(process.cwd(), 'app/desktop/assets', fileName)
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

export function resolveWindowIconPath(): string {
  return process.platform === 'win32'
    ? resolveDesktopAssetPath('icon.ico')
    : resolveDesktopAssetPath('icon.png');
}
