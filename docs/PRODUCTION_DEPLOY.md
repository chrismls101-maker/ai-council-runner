# IIVO Production Deploy — Hardening & Operations Guide

## Railway

The server runs on [Railway](https://railway.app) as a Dockerized Node 22 service.

**`railway.toml`** configures:
- Multi-stage Dockerfile build (node:22-alpine, omits devDeps in final image)
- `.dockerignore` excludes `glass-app/` (Electron tree) from the build context; only `glass-app/glass-update-manifest.json` is copied into the image
- Healthcheck at `GET /api/health` — Railway restarts the container if this fails
- `on_failure` restart policy with up to 3 retries

**Required environment variables on Railway:**
```
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
PERPLEXITY_API_KEY=...
GLASS_API_SECRET=<generated — see below>
ALLOWED_ORIGIN=https://iivo.ai
NODE_ENV=production
```

---

## GLASS_API_SECRET — Rotation Procedure

`GLASS_API_SECRET` is the shared Bearer token between the IIVO Glass Electron app and
this server. Every Glass API call (`/api/glass/ask`, `/api/glass/translate`,
`/api/transcribe-audio`) includes `Authorization: Bearer <secret>`. Without it set,
those endpoints are **open to anyone** with the server URL.

### Generate a secret
```bash
openssl rand -hex 32
```

### First-time setup
1. Generate a secret with the command above.
2. Set `GLASS_API_SECRET=<value>` in Railway environment variables.
3. Set `IIVO_GLASS_API_SECRET=<value>` in `desktop-glass/.env` before packaging.
4. Build, notarize, and publish the Glass DMG.
5. Redeploy Railway — server now enforces auth.

### Rotating the secret (zero-downtime)
1. Generate a new secret.
2. Set `GLASS_API_SECRET=<new>` in Railway (do **not** deploy yet).
3. Build a new Glass DMG with `IIVO_GLASS_API_SECRET=<new>` in `desktop-glass/.env`.
4. Publish the new DMG to GitHub Releases **before** redeploying the server.
5. Announce to beta users: "Update Glass before [date] — server key is rotating."
6. After the grace window, redeploy Railway to activate the new secret.
7. Old Glass clients get `401 Unauthorized` — they must update.

> **Important:** Never commit `GLASS_API_SECRET` to git. Store it only in Railway
> environment variables and `desktop-glass/.env` (gitignored).

---

## Rate Limits (open beta defaults)

| Limiter | Routes | Window | Max |
|---------|--------|--------|-----|
| `councilLimiter` | `POST /api/run-council` | 15 min | 5 |
| `glassLimiter` | `/api/glass/ask`, `/api/glass/translate` | 15 min | 40 |
| `apiLimiter` | All `/api/*` (except health + landing-gate) | 15 min | 120 |
| `destructiveLimiter` | Bulk-delete + credit-mutation routes | 15 min | 10 |

All limiters return standard RFC 6585 `RateLimit-*` headers.

Destructive routes (listed below) additionally require `GLASS_API_SECRET` auth:
- `DELETE /api/history/all`
- `DELETE /api/memory/all`
- `DELETE /api/audit`
- `POST /api/usage/reset-local`
- `POST /api/usage/add-local-credits`

---

## Security Headers

Every response includes:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (restrictive defaults for API-only server)
- `Strict-Transport-Security` (HSTS, 2 years, includeSubDomains, preload)
- `Permissions-Policy` (camera, mic, geolocation all denied)

---

## Docker health check

```
GET /api/health → 200 { ok: true, ... }
```

Railway polls this every 30 s. A failing health check restarts the container.
The endpoint reports API key presence and model availability — check the response
body when debugging a degraded server.

---

## Checklist before going to open beta

- [ ] `GLASS_API_SECRET` set in Railway
- [ ] `ALLOWED_ORIGIN=https://iivo.ai` set in Railway
- [ ] `NODE_ENV=production` set in Railway
- [ ] All three API keys confirmed present via `GET /api/health`
- [ ] Glass DMG builds with matching `IIVO_GLASS_API_SECRET`
- [ ] Railway healthcheck showing green
- [ ] Rate limit headers visible in browser Network tab on `POST /api/run-council`
- [ ] CORS blocks requests from `http://localhost:5173` (test in prod browser tab)
