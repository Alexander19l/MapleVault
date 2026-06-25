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
