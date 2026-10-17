/**
 * SplitStack Server Entry Point (Review 3, Step P10).
 * Connects to MongoDB, starts the Express HTTP server, and handles graceful shutdown.
 */

import { app } from './app.js';
import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';

let server;

/**
 * Boot the application: connect to database then listen for HTTP requests.
 */
async function startServer() {
  try {
    await connectDb();
  } catch (err) {
    console.error(`[SplitStack] Fatal database startup error: ${err.message}`);
    process.exit(1);
  }

  server = app.listen(config.port, config.host, () => {
    console.log(`[SplitStack] Server running in "${config.nodeEnv}" mode`);
    console.log(`[SplitStack] Listening on http://${config.host}:${config.port}`);
    console.log(`[SplitStack] Health check: http://${config.host}:${config.port}/api/health`);
  });
}

/**
 * Handle graceful process termination.
 * @param {string} signal
 */
async function gracefulShutdown(signal) {
  console.log(`\n[SplitStack] Received ${signal}. Closing server...`);

  if (server) {
    server.close(async () => {
      console.log('[SplitStack] HTTP server closed.');
      try {
        await disconnectDb();
        console.log('[SplitStack] Database connection closed cleanly.');
      } catch (err) {
        console.error('[SplitStack] Error during database disconnect:', err.message);
      }
      process.exit(0);
    });

    // Force exit after 5 seconds if connections hang
    setTimeout(() => {
      console.error('[SplitStack] Forcing shutdown after timeout.');
      process.exit(1);
    }, 5000).unref();
  } else {
    await disconnectDb().catch(() => {});
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();

export { server, startServer };
