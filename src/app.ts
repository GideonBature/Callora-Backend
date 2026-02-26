import express from 'express';
import type { Pool } from 'pg';

import {
  InMemoryUsageEventsRepository,
  type GroupBy,
  type UsageEventsRepository,
} from './repositories/usageEventsRepository.js';
import { requireAuth, type AuthenticatedLocals } from './middleware/requireAuth.js';
import { buildDeveloperAnalytics } from './services/developerAnalytics.js';
import { errorHandler } from './middleware/errorHandler.js';
import { performHealthCheck, type HealthCheckConfig } from './services/healthCheck.js';

interface AppDependencies {
  usageEventsRepository: UsageEventsRepository;
  healthCheckConfig?: HealthCheckConfig;
}

const isValidGroupBy = (value: string): value is GroupBy =>
  value === 'day' || value === 'week' || value === 'month';

const parseDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

export const createApp = (dependencies?: Partial<AppDependencies>) => {
  const app = express();
  const usageEventsRepository =
    dependencies?.usageEventsRepository ?? new InMemoryUsageEventsRepository();

  app.use(express.json());

  app.get('/api/health', async (_req, res) => {
    // If no health check config provided, return simple health check
    if (!dependencies?.healthCheckConfig) {
      res.json({ status: 'ok', service: 'callora-backend' });
      return;
    }

    try {
      const healthStatus = await performHealthCheck(dependencies.healthCheckConfig);
      const statusCode = healthStatus.status === 'down' ? 503 : 200;
      res.status(statusCode).json(healthStatus);
    } catch (error) {
      // Never expose internal errors in health check
      res.status(503).json({
        status: 'down',
        timestamp: new Date().toISOString(),
        checks: {
          api: 'ok',
          database: 'down',
        },
      });
    }
  });

  app.get('/api/apis', (_req, res) => {
    res.json({ apis: [] });
  });

  app.get('/api/usage', (_req, res) => {
    res.json({ calls: 0, period: 'current' });
  });

  app.get('/api/developers/analytics', requireAuth, async (req, res: express.Response<unknown, AuthenticatedLocals>) => {
    const user = res.locals.authenticatedUser;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const groupBy = req.query.groupBy ?? 'day';
    if (typeof groupBy !== 'string' || !isValidGroupBy(groupBy)) {
      res.status(400).json({ error: 'groupBy must be one of: day, week, month' });
      return;
    }

    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (!from || !to) {
      res.status(400).json({ error: 'from and to are required ISO date values' });
      return;
    }
    if (from > to) {
      res.status(400).json({ error: 'from must be before or equal to to' });
      return;
    }

    const apiId = typeof req.query.apiId === 'string' ? req.query.apiId : undefined;
    if (apiId) {
      const ownsApi = await usageEventsRepository.developerOwnsApi(user.id, apiId);
      if (!ownsApi) {
        res.status(403).json({ error: 'Forbidden: API does not belong to authenticated developer' });
        return;
      }
    }

    const includeTop = req.query.includeTop === 'true';
    const events = await usageEventsRepository.findByDeveloper({
      developerId: user.id,
      from,
      to,
      apiId,
    });

    const analytics = buildDeveloperAnalytics(events, groupBy, includeTop);
    res.json(analytics);
  });

  app.use(errorHandler);
  return app;
};
