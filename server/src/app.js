/**
 * SplitStack Express Application Factory & Configuration (Review 3, Step P9).
 * Establishes the Express application shell, JSON body parsing, health check,
 * static asset serving, and centralized error handling.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { isDbConnected } from './db.js';
import { apiRouter } from './routes/index.js';

export function createApp(customConfig = {}, customRoutes = null) {
  const appConfig = { ...config, ...customConfig };
  const app = express();

  // Baseline security hygiene: disable Express identification header
  app.disable('x-powered-by');

  // JSON body parser with strict size ceiling (100kb protects against memory exhaustion)
  app.use(express.json({ limit: '100kb' }));

  // Parse cookies for authentication token extraction
  app.use(cookieParser(appConfig.cookieSecret));

  // Safe diagnostics logging (development mode only, never logs bodies or auth tokens)
  if (appConfig.isDevelopment && !appConfig.isTest) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
      });
      next();
    });
  }

  // Health-check endpoint (Step P9 foundation contract)
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: appConfig.nodeEnv,
      service: 'SplitStack API',
      version: '3.0.0',
      database: isDbConnected() ? 'connected' : 'disconnected',
    });
  });

  // Mount SplitStack REST API sub-routers under /api
  app.use('/api', apiRouter);

  // Serve static client frontend files
  app.use(express.static(appConfig.clientDir));

  // Mount optional custom routes or router before the 404 handler
  if (typeof customRoutes === 'function') {
    customRoutes(app);
  } else if (customRoutes) {
    app.use(customRoutes);
  }

  // Catch-all 404 handler for undefined routes
  app.use((req, res) => {
    res.status(404).json({
      error: 'NotFoundError',
      message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist.`,
      path: req.originalUrl,
    });
  });

  // Centralized Error Handling Middleware (4 arguments required by Express)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // Handle malformed JSON body from express.json()
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({
        error: 'BadRequestError',
        message: 'Malformed JSON payload in request body.',
      });
    }

    // Handle Mongoose validation errors
    if (err.name === 'ValidationError') {
      const fields = {};
      if (err.errors) {
        for (const [key, val] of Object.entries(err.errors)) {
          fields[key] = val.message;
        }
      }
      return res.status(400).json({
        error: 'ValidationError',
        message: err.message || 'Validation failed.',
        fields,
      });
    }

    // Handle Mongoose cast errors (malformed ObjectIds)
    if (err.name === 'CastError') {
      return res.status(400).json({
        error: 'BadRequestError',
        message: `Invalid identifier format for parameter "${err.path}".`,
      });
    }

    // Handle MongoDB duplicate key errors (code 11000)
    if (err.code === 11000) {
      const keys = err.keyPattern ? Object.keys(err.keyPattern).join(', ') : 'field';
      return res.status(409).json({
        error: 'ConflictError',
        message: `A record with this ${keys} already exists.`,
      });
    }

    const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

    const isInternalError = statusCode === 500;

    // Do not leak internal stack traces or database errors in production
    const message = appConfig.isProduction && isInternalError
      ? 'An unexpected internal server error occurred.'
      : (err.message || 'Server error');

    const response = {
      error: err.name || (isInternalError ? 'InternalServerError' : 'HttpError'),
      message,
    };

    if (!appConfig.isProduction && err.stack) {
      response.stack = err.stack;
    }

    if (err.fields) {
      response.fields = err.fields;
    }

    res.status(statusCode).json(response);
  });

  return app;
}

// Default application instance
export const app = createApp();

export default app;
