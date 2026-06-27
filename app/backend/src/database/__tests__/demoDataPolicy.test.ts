import { describe, expect, it } from 'vitest';
import { shouldSeedDemoData } from '../demoDataPolicy';

describe('política de datos de demostración', () => {
  it('mantiene vacía una base nueva por defecto', () => {
    expect(shouldSeedDemoData({})).toBe(false);
  });

  it('solo habilita las series de muestra mediante opt-in explícito', () => {
    expect(shouldSeedDemoData({ MAPLEVAULT_SEED_DEMO_DATA: 'true' })).toBe(true);
    expect(shouldSeedDemoData({ MAPLEVAULT_SEED_DEMO_DATA: 'TRUE' })).toBe(true);
    expect(shouldSeedDemoData({ MAPLEVAULT_SEED_DEMO_DATA: 'false' })).toBe(false);
    expect(shouldSeedDemoData({ MAPLEVAULT_SEED_DEMO_DATA: '1' })).toBe(false);
  });
});
