/**
 * SplitStack Server Entry Point (Review 3, Step P9).
 * Starts the Express HTTP server and handles graceful process termination.
 */

import { app } from './app.js';
import { config } from './config.js';

const server = app.listen(config.port, config.host, () => {
  console.log(`[SplitStack] Server running in "${config.nodeEnv}" mode`);
  console.log(`[SplitStack] Listening on http://${config.host}:${config.port}`);
  console.log(`[SplitStack] Health check: http://${config.host}:${config.port}/api/health`);
});

/**
 * Handle graceful termination.
 * @param {string} signal
 */
function gracefulShutdown(signal) {
  console.log(`\n[SplitStack] Received ${signal}. Closing HTTP server...`);
  server.close(() => {
    console.log('[SplitStack] HTTP server closed cleanly. Exiting process.');
    process.exit(0);
  });

  // Force exit after 5 seconds if connections hang
  setTimeout(() => {
    console.error('[SplitStack] Forcing shutdown after timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default server;
