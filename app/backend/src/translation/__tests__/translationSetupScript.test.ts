import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const setupScriptPath = path.resolve(
  __dirname,
  '../../../../../scripts/setup-libretranslate.ps1'
);
const setupScript = fs.readFileSync(setupScriptPath, 'utf8');

describe('setup-libretranslate.ps1', () => {
  it('descarga el redistribuible x64 solamente desde el enlace oficial de Microsoft', () => {
    expect(setupScript).toContain('https://aka.ms/vc14/vc_redist.x64.exe');
    expect(setupScript).toContain('Get-AuthenticodeSignature');
    expect(setupScript).toContain('Microsoft Corporation');
  });

  it('instala o repara Visual C++ Runtime antes de rechazar CTranslate2', () => {
    expect(setupScript).toContain('Test-VisualCppRuntime');
    expect(setupScript).toContain('Install-VisualCppRuntime -Repair');
    expect(setupScript).toContain('Test-CTranslate2Import');
  });

  it('valida las dependencias Python antes de instalar modelos', () => {
    expect(setupScript).toContain('chardet>=3.0.2,<6');
    expect(setupScript).toContain('-m pip check');
    expect(setupScript.indexOf('-m pip check')).toBeLessThan(
      setupScript.indexOf('Actualizando indice de modelos')
    );
  });
});

