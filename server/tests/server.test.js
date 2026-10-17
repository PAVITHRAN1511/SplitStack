/**
 * SplitStack Server Foundation Tests (Review 3, Step P9).
 * Tests HTTP endpoints, health checks, JSON parsing, 404 responses, and centralized error handling.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';

describe('SplitStack Express Server Foundation (Step P9)', () => {
  let server;
  let baseUrl;

  before(async () => {
    // Create dedicated app instance in test mode on an ephemeral port
    const testApp = createApp(
      { nodeEnv: 'test', isTest: true, isDevelopment: false },
      (app) => {
        // Add a test echo route to verify JSON body parsing
        app.post('/api/test-echo', (req, res) => {
          res.status(200).json({ received: req.body });
        });

        // Add a test route that throws an intentional error to verify centralized error handling
        app.get('/api/test-error', (req, res, next) => {
          const err = new Error('Test simulated failure');
          err.status = 503;
          err.name = 'ServiceUnavailableError';
          next(err);
        });
      }
    );

    await new Promise((resolve) => {
      server = http.createServer(testApp);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('1. Health Check Endpoint', () => {
    it('GET /api/health returns 200 OK with expected status and metadata', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type')?.includes('application/json'), true);

      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.equal(typeof data.uptime, 'number');
      assert.equal(data.service, 'SplitStack API');
      assert.equal(data.version, '3.0.0');
      assert.equal(typeof data.timestamp, 'string');
      assert.ok(!Number.isNaN(Date.parse(data.timestamp)), 'timestamp should be valid ISO date string');
    });

    it('does not leak X-Powered-By header', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.headers.get('x-powered-by'), null);
    });
  });

  describe('2. Routing & 404 Not Found Handling', () => {
    it('returns structured 404 JSON for undefined API route', async () => {
      const res = await fetch(`${baseUrl}/api/nonexistent-route-endpoint`);
      assert.equal(res.status, 404);

      const data = await res.json();
      assert.equal(data.error, 'NotFoundError');
      assert.ok(data.message.includes('/api/nonexistent-route-endpoint'));
      assert.equal(data.path, '/api/nonexistent-route-endpoint');
    });
  });

  describe('3. Request Body Parsing & Limits', () => {
    it('correctly parses JSON payload in request body', async () => {
      const payload = { amountPaise: 45000, description: 'Groceries' };
      const res = await fetch(`${baseUrl}/api/test-echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.deepEqual(data.received, payload);
    });

    it('returns 400 Bad Request when JSON body is malformed', async () => {
      const res = await fetch(`${baseUrl}/api/test-echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ "invalidJson": broken ',
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'BadRequestError');
      assert.ok(data.message.includes('Malformed JSON'));
    });
  });

  describe('4. Centralized Error Handling', () => {
    it('properly formats custom errors with status code and error name', async () => {
      const res = await fetch(`${baseUrl}/api/test-error`);
      assert.equal(res.status, 503);

      const data = await res.json();
      assert.equal(data.error, 'ServiceUnavailableError');
      assert.equal(data.message, 'Test simulated failure');
    });
  });

  describe('5. Static Frontend Integration', () => {
    it('serves client index.html over HTTP', async () => {
      const res = await fetch(`${baseUrl}/index.html`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('SplitStack'));
    });
  });
});
