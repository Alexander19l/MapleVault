import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    include: [
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'src/**/__tests__/**/*.{test,spec}.ts'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '../dist/**',
      '../../dist/**'
    ],
    setupFiles: ['./tests/setup/seed.ts'],
  },
});
