# SplitStack Production Deployment & Operations Guide

**Platform Version:** 3.0.0  
**Target Architecture:** Node.js (Express), MongoDB 7.0+, Vanilla Web Client  
**Status:** Review 3, Phase P15 Final Operations Specification  

---

## 1. Architecture Overview

SplitStack is designed to operate under two primary deployment architectures:

### Pattern A: Unified Single-Origin Container (Recommended)
The Node.js Express server acts as both the REST API gateway (`/api/*`) and the static file server for the client web application (`client/*`).
- **Advantages**: Eliminates Cross-Origin Resource Sharing (CORS) complexity; cookies are automatically transmitted under `SameSite=Lax` without cross-domain browser restrictions; single container/process lifecycle.
- **Hosting Targets**: Docker/Compose, Render (Web Service), Railway, AWS ECS/Fargate, DigitalOcean App Platform, Fly.io, or standard Linux VPS with Nginx reverse proxy.

### Pattern B: Decoupled Static Frontend + API Backend
The static frontend is hosted on a global CDN (e.g. GitHub Pages at `https://<user>.github.io/SplitStack/` or Cloudflare Pages), while the Express REST API runs as a separate cloud web service.
- **Requirements**:
  - The frontend must configure `window.__SPLITSTACK_API_BASE_URL__ = 'https://api.splitstack.app/api'`.
  - The Express backend must enable CORS with credentials support and explicitly allowlist the frontend origin domain.
  - Cookies require `SameSite=None` and `Secure=true` for cross-site transmission, or authentication must rely exclusively on `Authorization: Bearer <token>` in-memory headers.

---

## 2. Supported Runtimes & Prerequisites

| Component | Minimum Version | Recommended Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v20.0.0` (LTS) | `v20.18.0` / `v22.11.0` LTS | Backend Express server & CLI tools |
| **npm** | `v10.0.0` | `v10.8.0`+ | Reproducible dependency installation (`npm ci`) |
| **MongoDB** | `v7.0.0` | `v7.0.x` Community / MongoDB Atlas | Primary database & GridFS binary storage |
| **Python** | `3.12.0` | `3.12.x` | Preserved legacy Flask app & prompt log PDF generator |
| **Docker** | `24.0.0`+ | `26.0.0`+ | Containerized local staging and production deployments |

---

## 3. Environment Configuration & Secret Management

All runtime configurations are driven by environment variables loaded from `.env` in production or container environments.

### Environment Variable Reference

| Variable | Required in Prod? | Default (Non-Prod) | Purpose & Validation Rules |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **Yes** | `development` | Mode: `production`, `development`, or `test`. Production disables stack trace leakage and enables secure cookies. |
| `PORT` | No | `3000` | Port for Express HTTP listener (must be integer 1–65535). |
| `HOST` | No | `localhost` (`0.0.0.0` in Docker) | Network bind interface. |
| `MONGODB_URI` | **Yes** | `""` | MongoDB connection URI (`mongodb://` or `mongodb+srv://`). Must include database name. |
| `MONGODB_TEST_URI`| No (Dev/CI only) | `""` | Dedicated test MongoDB URI. Database name must contain `test` (e.g. `splitstack-test`). |
| `JWT_SECRET` | **Yes** | Throws error if missing in prod | Secret key used to sign JWT tokens. Must be a cryptographically random string (min 32 chars). |
| `JWT_EXPIRES_IN` | No | `7d` | Token lifetime (e.g. `7d`, `24h`). |
| `COOKIE_SECRET` | **Yes** | `splitstack-cookie-secret-dev` | Signing key for session cookies. |
| `MAX_RECEIPT_SIZE_BYTES` | No | `5242880` (5 MB) | Maximum receipt image upload size limit in bytes. |
| `OCR_ENABLED` | No | `true` | Set to `false` to disable server-side Tesseract OCR processing. |
| `OCR_LANGUAGE` | No | `eng` | Tesseract language training pack. |

### Generating Secure Secrets
Never commit real secrets to version control. Generate high-entropy secrets using OpenSSL:

```bash
# Generate JWT Secret
openssl rand -hex 32

# Generate Cookie Secret
openssl rand -hex 32
```

---

## 4. Local Development & Staging Workflows

### Native Node.js Execution
```bash
# 1. Install dependencies from lockfiles
npm ci
npm --prefix server ci

# 2. Configure environment
cp server/.env.example server/.env
# Edit server/.env with your local MongoDB URI

# 3. Start local backend server (http://localhost:3000)
npm run server

# 4. (Optional) Run client static server independently (http://localhost:5500)
npm run client
```

### Containerized Staging (Docker Compose)
```bash
# Build and launch SplitStack app and MongoDB 7.0 container
docker compose up --build -d

# Verify container status
docker compose ps

# Inspect application logs
docker compose logs -f app

# Stop containers and preserve data
docker compose down
```

---

## 5. Automated Test Execution

SplitStack provides separated, explicit test commands:

```bash
# 1. Client Unit Tests (201 tests across 59 suites)
npm run test:client

# 2. Server Unit Tests (123 tests across 43 suites)
npm run test:server:unit

# 3. HTML Validation (25 client HTML pages)
npm run lint:html

# 4. Legacy Python Regression & Security Tests (31 tests)
python -m pytest tests/test_security.py tests/test_auth_flow.py tests/test_regression.py tests/test_master.py

# 5. Real MongoDB Integration Test Suite (Requires running test database)
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/splitstack-test npm run test:integration
```

> **Important**: When `MONGODB_TEST_URI` is not provided, `npm run test:integration` cleanly reports a documented `# SKIP` rather than falling back to in-memory mocks.

---

## 6. Safe Database Seeding

SplitStack includes a deterministic development/test database seeder (`server/scripts/seed.js`).

### Safety Safeguards
- Strictly refuses execution if `NODE_ENV === 'production'`.
- Inspects connection URI database name and blocks any database containing `prod`, `production`, or `live`.
- Refuses internal system databases (`admin`, `config`, `local`).
- In `--test` mode, requires `test` in the database name.
- Automatically hashes all synthetic passwords using `bcrypt` (12 rounds).
- Never runs automatically on server boot.

### Seeding Commands
```bash
# Seed local development database (splitstack-dev)
npm run seed

# Seed dedicated test database (splitstack-test)
npm run seed:test

# Dry-run inspection without database writes
node server/scripts/seed.js --dev --dry-run
```

---

## 7. Production Security Hardening

### 1. Reverse Proxy & TLS Termination
SplitStack must be placed behind a reverse proxy (such as Nginx, Caddy, Cloudflare, or AWS ALB) to terminate TLS/HTTPS:
```nginx
# Example Nginx reverse proxy configuration
server {
    listen 443 ssl http2;
    server_name splitstack.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/splitstack/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/splitstack/privkey.pem;

    client_max_body_size 6M; # Accommodates 5MB receipt uploads + multipart overhead

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Cookie Security Flags
In `server/src/middleware/auth.js`, the authentication cookie is automatically configured:
- `httpOnly: true`: Prevents client-side JavaScript from accessing the session token.
- `secure: true`: Enforced automatically when `NODE_ENV === 'production'`.
- `sameSite: 'lax'`: Mitigates Cross-Site Request Forgery (CSRF).

### 3. Rate Limiting in Production Clusters
The authentication rate limiter (`server/src/middleware/rateLimit.js`) currently uses an in-memory sliding window. For multi-instance horizontal scaling (e.g. Kubernetes or multi-dyno deployments), an external store (such as Redis) should be integrated to share rate-limit counters across processes.

### 4. Non-Root Container Execution
The provided `Dockerfile` explicitly switches to non-root execution (`USER node`) and drops unnecessary Linux privileges.

---

## 8. Database Backup, Restore & Rollback

### Automated MongoDB Backups (`mongodump`)
```bash
# Create compressed archive of production database
mongodump --uri="mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/splitstack-prod" \
  --archive="/var/backups/splitstack_$(date +%Y%m%d_%H%M%S).gz" \
  --gzip
```

### Database Restoration (`mongorestore`)
```bash
# Restore from compressed archive (WARNING: drops existing collections)
mongorestore --uri="mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/splitstack-prod" \
  --archive="/var/backups/splitstack_20261017_120000.gz" \
  --gzip \
  --drop
```

### Rollback Procedure
1. **Application Rollback**: Revert deployment container or git commit to the previous known good release.
2. **Database Rollback**: If a schema or data corruption occurred, restore the pre-deployment database dump using `mongorestore --drop`.
3. **Cache & Session Invalidation**: Update `JWT_SECRET` in environment variables if credentials or tokens were compromised.

---

## 9. Health Checks & Monitoring

The standard health check endpoint is accessible without authentication:
```http
GET /api/health
```

**Expected 200 OK Response**:
```json
{
  "status": "ok",
  "uptime": 124.5,
  "timestamp": "2026-10-17T17:45:00.000Z",
  "environment": "production",
  "service": "SplitStack API",
  "version": "3.0.0",
  "database": "connected"
}
```
If the database connection is severed, `"database": "disconnected"` is returned, allowing container orchestrators (Kubernetes / Docker) or uptime monitors to trigger automatic restart or alerting.

---

## 10. Pre-Flight Deployment Checklist

- [ ] `NODE_ENV` is set to `production`.
- [ ] `JWT_SECRET` is set to a secure, random string (min 32 characters) generated via `openssl rand -hex 32`.
- [ ] `COOKIE_SECRET` is set to a secure string.
- [ ] `MONGODB_URI` points to a secured, authenticated MongoDB Atlas or replica set instance with IP access allowlisting.
- [ ] TLS/HTTPS is active and certificates are valid.
- [ ] Reverse proxy enforces `client_max_body_size` >= 6M.
- [ ] Database seeder script is NOT executed against the production database.
- [ ] Health endpoint returns `"status": "ok"` and `"database": "connected"`.
- [ ] A verified database backup exists prior to deployment.
