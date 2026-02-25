import express from 'express';
import helmet from 'helmet';

const app = express();
const PORT = process.env.PORT ?? 3000;

const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

app.use(
  helmet({
    // Allow embedding in iframes (e.g. if the frontend wants to embed this API)
    frameguard: false,
    // Keep default X-Content-Type-Options: nosniff
    // HSTS: only enable when we know we're behind HTTPS and in production
    hsts: isProduction
      ? {
          maxAge: 15552000, // 180 days
          includeSubDomains: false,
          preload: false,
        }
      : false,
    // No CSP needed since this is a pure JSON API (no HTML responses)
    contentSecurityPolicy: false,
    // Keep other defaults (dnsPrefetchControl, hidePoweredBy, ieNoOpen, noSniff, xssFilter, etc.)
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'callora-backend' });
});

app.get('/api/apis', (_req, res) => {
  res.json({ apis: [] });
});

app.get('/api/usage', (_req, res) => {
  res.json({ calls: 0, period: 'current' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Callora backend listening on http://localhost:${PORT}`);
  });
}

export default app;