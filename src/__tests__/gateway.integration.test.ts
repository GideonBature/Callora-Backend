import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { createGatewayRouter } from '../routes/gatewayRoutes.js';
import { MockSorobanBilling } from '../services/billingService.js';
import { InMemoryRateLimiter } from '../services/rateLimiter.js';
import { InMemoryUsageStore } from '../services/usageStore.js';
import { ApiKey } from '../types/gateway.js';

// ── Test fixtures ───────────────────────────────────────────────────────────

const TEST_API_KEY = 'integration-test-key';
const TEST_DEVELOPER_ID = 'dev_integration';
const TEST_API_ID = 'api_test';

const apiKeys = new Map<string, ApiKey>([
  [TEST_API_KEY, { key: TEST_API_KEY, developerId: TEST_DEVELOPER_ID, apiId: TEST_API_ID }],
]);

// ── Mock upstream server ────────────────────────────────────────────────────

let upstreamServer: Server;
let upstreamUrl: string;
let upstreamHandler: (req: express.Request, res: express.Response) => void;

function setUpstreamHandler(handler: (req: express.Request, res: express.Response) => void) {
  upstreamHandler = handler;
}

// ── Gateway app under test ──────────────────────────────────────────────────

let gatewayServer: Server;
let gatewayUrl: string;
let billing: MockSorobanBilling;
let rateLimiter: InMemoryRateLimiter;
let usageStore: InMemoryUsageStore;

before(async () => {
  // Start mock upstream
  await new Promise<void>((resolve) => {
    const upstream = express();
    upstream.use(express.json());
    upstream.all('*', (req, res) => {
      upstreamHandler(req, res);
    });
    upstreamServer = upstream.listen(0, () => {
      const addr = upstreamServer.address();
      if (addr && typeof addr === 'object') {
        upstreamUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });

  // Set default upstream handler
  setUpstreamHandler((_req, res) => {
    res.status(200).json({ message: 'upstream OK', data: [1, 2, 3] });
  });

  // Start gateway
  await new Promise<void>((resolve) => {
    billing = new MockSorobanBilling({ [TEST_DEVELOPER_ID]: 1000 });
    rateLimiter = new InMemoryRateLimiter(100, 60_000);
    usageStore = new InMemoryUsageStore();

    const app = express();
    app.use(express.json());

    const gatewayRouter = createGatewayRouter({
      billing,
      rateLimiter,
      usageStore,
      upstreamUrl,
      apiKeys,
    });
    app.use('/api/gateway', gatewayRouter);

    gatewayServer = app.listen(0, () => {
      const addr = gatewayServer.address();
      if (addr && typeof addr === 'object') {
        gatewayUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => gatewayServer.close(() => resolve()));
  await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
});

beforeEach(() => {
  // Reset state between tests
  usageStore.clear();
  billing.setBalance(TEST_DEVELOPER_ID, 1000);
  rateLimiter.reset();
  // Reset upstream to default
  setUpstreamHandler((_req, res) => {
    res.status(200).json({ message: 'upstream OK', data: [1, 2, 3] });
  });
});

// ── Integration tests ───────────────────────────────────────────────────────

describe('Gateway Proxy Integration', () => {

  it('proxies a valid request to upstream, returns response, records usage, and deducts billing', async () => {
    const res = await fetch(`${gatewayUrl}/api/gateway/${TEST_API_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
      },
      body: JSON.stringify({ input: 'hello' }),
    });

    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.message, 'upstream OK');
    assert.deepEqual(body.data, [1, 2, 3]);

    // Verify usage event was recorded
    const events = usageStore.getEvents(TEST_API_KEY);
    assert.equal(events.length, 1);
    assert.equal(events[0].apiId, TEST_API_ID);
    assert.equal(events[0].statusCode, 200);

    // Verify billing was deducted (1000 - 1 = 999)
    assert.equal(billing.getBalance(TEST_DEVELOPER_ID), 999);
  });

  it('returns 402 Payment Required when balance is insufficient', async () => {
    // Drain balance to 0
    billing.setBalance(TEST_DEVELOPER_ID, 0);

    const res = await fetch(`${gatewayUrl}/api/gateway/${TEST_API_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 402);

    const body = await res.json();
    assert.match(body.error, /insufficient balance/i);
    assert.equal(body.balance, 0);

    // No usage event should be recorded
    const events = usageStore.getEvents(TEST_API_KEY);
    assert.equal(events.length, 0);
  });

  it('returns 429 Too Many Requests when rate limited', async () => {
    // Exhaust rate limiter
    rateLimiter.exhaust(TEST_API_KEY);

    const res = await fetch(`${gatewayUrl}/api/gateway/${TEST_API_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 429);

    const body = await res.json();
    assert.match(body.error, /too many requests/i);

    // Retry-After header should be present
    const retryAfter = res.headers.get('retry-after');
    assert.ok(retryAfter, 'Expected Retry-After header');

    // No usage event should be recorded
    const events = usageStore.getEvents(TEST_API_KEY);
    assert.equal(events.length, 0);
  });

  it('returns 401 when API key is missing or invalid', async () => {
    // Missing key
    const res1 = await fetch(`${gatewayUrl}/api/gateway/${TEST_API_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res1.status, 401);

    // Invalid key
    const res2 = await fetch(`${gatewayUrl}/api/gateway/${TEST_API_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'totally-wrong-key',
      },
      body: JSON.stringify({}),
    });
    assert.equal(res2.status, 401);

    // No usage events
    assert.equal(usageStore.getEvents().length, 0);
  });

  it('records usage event even when upstream returns 500', async () => {
    // Override upstream to return 500
    setUpstreamHandler((_req, res) => {
      res.status(500).json({ error: 'Internal Server Error' });
    });

    const res = await fetch(`${gatewayUrl}/api/gateway/${TEST_API_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY,
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 500);

    // Usage event should still be recorded with status 500
    const events = usageStore.getEvents(TEST_API_KEY);
    assert.equal(events.length, 1);
    assert.equal(events[0].statusCode, 500);

    // Billing was still deducted (call succeeded from gateway perspective)
    assert.equal(billing.getBalance(TEST_DEVELOPER_ID), 999);
  });
});
