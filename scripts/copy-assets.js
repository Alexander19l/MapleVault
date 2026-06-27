const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../app/desktop');
const destDir = path.join(__dirname, '../dist/desktop');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const files = ['splash.html', 'error.html', 'splash-renderer.js', 'error-renderer.js'];
files.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to dist/desktop/`);
  } else {
    console.error(`Source file not found: ${srcPath}`);
  }
});

const assetsSrcDir = path.join(srcDir, 'assets');
const assetsDestDir = path.join(destDir, 'assets');
if (fs.existsSync(assetsSrcDir)) {
  fs.rmSync(assetsDestDir, { recursive: true, force: true });
  fs.cpSync(assetsSrcDir, assetsDestDir, { recursive: true });
  console.log('Copied assets to dist/desktop/assets/');
} else {
  console.error(`Assets directory not found: ${assetsSrcDir}`);
}
