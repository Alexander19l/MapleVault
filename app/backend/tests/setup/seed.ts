import { afterAll, beforeAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TEST_DB_DIR = path.join(os.tmpdir(), 'maplevault-tests');
const TEST_DB_PATH = path.join(TEST_DB_DIR, `maplevault_${process.pid}_${Date.now()}.db`);

fs.mkdirSync(TEST_DB_DIR, { recursive: true });
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.MAPLEVAULT_SEED_DEMO_DATA = 'false';

beforeAll(async () => {
  const { initDb } = await vi.importActual<typeof import('../../src/database/db')>('../../src/database/db');
  await initDb();
});

afterAll(async () => {
  const { closeDb } = await vi.importActual<typeof import('../../src/database/db')>('../../src/database/db');
  await closeDb();

  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
  }
});
