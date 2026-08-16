const SENSITIVE_ENV_NAME = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|CREDENTIALS?|PRIVATE_KEY|ACCESS_KEY|AUTHORIZATION|COOKIE|SESSION_(?:ID|TOKEN|KEY))(?:$|_)/i;

export function createSanitizedChildProcessEnv(
  overrides: NodeJS.ProcessEnv = {},
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};

  for (const [name, value] of Object.entries({ ...source, ...overrides })) {
    if (value !== undefined && !SENSITIVE_ENV_NAME.test(name)) {
      sanitized[name] = value;
    }
  }

  return sanitized;
}
