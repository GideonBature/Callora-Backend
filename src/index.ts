import express from 'express';
import webhookRouter from './webhooks/webhook.routes';
import { calloraEvents } from './events/event.emitter';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'callora-backend' });
});

app.get('/api/apis', (_req, res) => {
  res.json({ apis: [] });
});

app.get('/api/usage', (_req, res) => {
  res.json({ calls: 0, period: 'current' });
});

// Webhook registration and management routes
app.use('/api/webhooks', webhookRouter);

if (process.env.NODE_ENV !== 'production') {
  app.post('/api/test/trigger-event', (req, res) => {
    const { developerId, event, data } = req.body;

    if (!developerId || !event) {
      return res.status(400).json({ error: 'developerId and event are required.' });
    }

    calloraEvents.emit(event, developerId, data ?? {});
    return res.json({ triggered: event, developerId });
  });
}

app.listen(PORT, () => {
  console.log(`Callora backend listening on http://localhost:${PORT}`);
});