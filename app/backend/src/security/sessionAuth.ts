import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const SESSION_TOKEN_HEADER = 'x-maplevault-token';

function tokensMatch(expectedToken: string, suppliedToken: string): boolean {
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

export function createSessionAuthMiddleware(configuredToken = process.env.MAPLEVAULT_API_TOKEN || '') {
  const expectedToken = configuredToken.trim();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expectedToken || req.method === 'OPTIONS' || req.path === '/health') {
      next();
      return;
    }

    const suppliedToken = String(req.header(SESSION_TOKEN_HEADER) || '');
    if (tokensMatch(expectedToken, suppliedToken)) {
      next();
      return;
    }

    res.status(401).json({ error: 'Sesión local no autorizada.' });
  };
}
