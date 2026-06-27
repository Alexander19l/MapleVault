export function shouldSeedDemoData(
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  return environment.MAPLEVAULT_SEED_DEMO_DATA?.trim().toLowerCase() === 'true';
}
