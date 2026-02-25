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
