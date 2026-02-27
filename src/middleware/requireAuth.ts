import { Request, Response, NextFunction } from 'express';

/**
 * Mock token → developerId map.
 * Replace with real JWT / session validation in production.
 */
const MOCK_TOKENS: Record<string, string> = {
  'dev-token-1': 'dev_001',
  'dev-token-2': 'dev_002',
};

// Extend Express Request to carry the authenticated developer id
declare module 'express-serve-static-core' {
  interface Request {
    developerId?: string;
  }
}

/**
 * Middleware that requires a valid Bearer token.
 * On success it sets `req.developerId`; on failure it returns 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: missing or invalid token' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "
  const developerId = MOCK_TOKENS[token];

  if (!developerId) {
    res.status(401).json({ error: 'Unauthorized: invalid token' });
    return;
  }

  req.developerId = developerId;
  next();
}
import type { NextFunction, Request, Response } from 'express';

import type { AuthenticatedUser } from '../types/auth.js';
import { UnauthorizedError } from '../errors/index.js';

export interface AuthenticatedLocals {
  authenticatedUser?: AuthenticatedUser;
}

export const requireAuth = (
  req: Request,
  res: Response<unknown, AuthenticatedLocals>,
  next: NextFunction
): void => {
  let userId: string | undefined;

  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    userId = authHeader.slice('Bearer '.length).trim();
  } else {
    userId = req.header('x-user-id');
  }

  if (!userId) {
    next(new UnauthorizedError());
    return;
  }

  res.locals.authenticatedUser = { id: userId };
  next();
};
