# SplitStack Backend Server

Node.js and Express backend foundation for SplitStack (**Review 3, Step P9**).

## Overview

The server provides the REST API foundation for SplitStack, establishing:
- ES Module architecture (`"type": "module"`).
- Environment-based configuration via `dotenv` and `server/src/config.js`.
- Express application factory (`createApp`) with JSON body parsing (100kb limit).
- System health-check endpoint (`GET /api/health`).
- Static client hosting for frontend delivery.
- Centralized 404 handler and structured error handling.
- Graceful shutdown handling on `SIGINT` and `SIGTERM`.

## Directory Structure

```
server/
├── .env.example       # Example environment configuration template
├── package.json       # Server package manifest and scripts
├── package-lock.json  # Dependency lockfile
├── README.md          # Server documentation
├── src/
│   ├── app.js         # Express application factory & middleware setup
│   ├── config.js      # Centralized environment configuration
│   └── index.js       # HTTP server entry point & shutdown handler
└── tests/
    └── server.test.js # Automated unit & integration tests
```

## Prerequisites

- **Node.js**: v20.0.0 or higher (v24 LTS recommended).
- **npm**: v10.0.0 or higher.

## Installation

Install server dependencies from within the `server/` directory:

```bash
cd server
npm install
```

## Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Configure environment variables as needed:

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | `string` | `development` | Runtime mode: `development`, `production`, or `test` |
| `PORT` | `number` | `3000` | Port for the HTTP server |
| `HOST` | `string` | `localhost` | Bind host for the HTTP server |
| `MONGODB_URI` | `string` | _(empty)_ | MongoDB Atlas connection string (Phase P10) |
| `SESSION_SECRET`| `string` | _(empty)_ | Secret for session cookies, min 32 chars (Phase P11) |

> **Security Note:** Never commit `.env` to version control. The file is listed in `.gitignore`.

## Running the Server

### Development Mode (with automatic restart on file change)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

Once running, the server listens at `http://localhost:3000`.

## Health Check Endpoint

- **Endpoint:** `GET /api/health`
- **Response Format:** `application/json`
- **Status:** `200 OK`

### Example Response:

```json
{
  "status": "ok",
  "uptime": 12.345,
  "timestamp": "2026-10-17T11:35:00.000Z",
  "environment": "development",
  "service": "SplitStack API",
  "version": "3.0.0"
}
```

## Error Handling & 404 Responses

All API errors return consistent JSON responses:

### 404 Not Found:

```json
{
  "error": "NotFoundError",
  "message": "The requested endpoint GET /api/unknown does not exist.",
  "path": "/api/unknown"
}
```

### 400 Bad Request (e.g. malformed JSON):

```json
{
  "error": "BadRequestError",
  "message": "Malformed JSON payload in request body."
}
```

### 500 Internal Server Error:

In production (`NODE_ENV=production`), error messages are sanitized and internal stack traces are suppressed.

## Running Tests

Run the server test suite using Node's native test runner:

```bash
npm test
```

Or from the repository root:

```bash
npm run test:server
```

## Roadmap & Next Phases

- **P9 (Current):** Express server foundation, health check, 404/error handling, and test suite.
- **P10 (Next):** Mongoose data models & MongoDB Atlas connection.
- **P11:** Authentication routes (`/api/auth`) & REST resource controllers.
- **P12:** Receipt upload and OCR processing pipeline.
- **P13:** Client data layer migration from `localStorage` to `/api` `fetch()`.
- **P14:** End-to-end integration tests & CI automation.
- **P15:** Final documentation, deployment manifests & cleanup.
