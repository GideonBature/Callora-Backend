import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { logger } from './logger.js';

const app = createApp();
const PORT = process.env.PORT ?? 3000;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(PORT, () => {
    logger.info(`Callora backend listening on http://localhost:${PORT}`);
  });
}

export default app;
