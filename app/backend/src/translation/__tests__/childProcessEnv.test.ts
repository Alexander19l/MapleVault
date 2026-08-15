import { describe, expect, it } from 'vitest';
import { createSanitizedChildProcessEnv } from '../childProcessEnv';

describe('entorno de procesos auxiliares', () => {
  it('conserva variables operativas y elimina credenciales', () => {
    const source = {
      PATH: 'C:\\Windows\\System32',
      TEMP: 'C:\\Temp',
      MAPLEVAULT_CREDENTIAL_KEY: 'credential-secret',
      MAPLEVAULT_API_TOKEN: 'api-secret',
      LIBRETRANSLATE_API_KEY: 'translation-secret',
      GITHUB_TOKEN: 'github-secret',
      AWS_ACCESS_KEY_ID: 'aws-secret',
      SESSIONNAME: 'Console'
    };

    const result = createSanitizedChildProcessEnv({ PYTHONUTF8: '1' }, source);

    expect(result).toMatchObject({
      PATH: 'C:\\Windows\\System32',
      TEMP: 'C:\\Temp',
      PYTHONUTF8: '1',
      SESSIONNAME: 'Console'
    });
    expect(result).not.toHaveProperty('MAPLEVAULT_CREDENTIAL_KEY');
    expect(result).not.toHaveProperty('MAPLEVAULT_API_TOKEN');
    expect(result).not.toHaveProperty('LIBRETRANSLATE_API_KEY');
    expect(result).not.toHaveProperty('GITHUB_TOKEN');
    expect(result).not.toHaveProperty('AWS_ACCESS_KEY_ID');
    expect(source.MAPLEVAULT_API_TOKEN).toBe('api-secret');
  });
});
