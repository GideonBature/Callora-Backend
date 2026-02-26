import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { createApp } from './app.js';
import { buildHealthCheckConfig, closeDbPool } from './config/health.js';

// Load environment variables
dotenv.config();

const healthCheckConfig = buildHealthCheckConfig();
const app = createApp({ healthCheckConfig });
const PORT = process.env.PORT ?? 3000;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(PORT, () => {
    console.log(`Callora backend listening on http://localhost:${PORT}`);
    if (healthCheckConfig) {
      console.log('✅ Health check endpoint enabled at /api/health');
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing connections...');
    await closeDbPool();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, closing connections...');
    await closeDbPool();
    process.exit(0);
  });
}

export default app;
