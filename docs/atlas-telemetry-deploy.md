# Atlas — harness telemetry ingest: changes & deploy runbook

Hand this to whoever owns **mbi-atlas**. It explains the two changes already made to the local
`mbi-atlas/` tree and how to deploy + verify them. **`mbi-atlas` is not a git repo**, so these edits live
only on Pravin's machine — they must be deployed from that working copy (or re-applied by hand).

> Status after this change: the endpoint **exists but is inert until `HARNESS_TELEMETRY_TOKEN` is set** in
> the server env (no token ⇒ the route returns `503`). Enabling identified employee telemetry also needs the
> monitoring policy + EU DPIA called out in `docs/usage-coaching-prd.md`.

## What changed and why

### 1. `server.js` — a new ingest route (≈ line 1642, right after `/api/health`)
```js
// Harness usage telemetry intake (Bearer-token auth; bypasses the Slack session gate)
const TELEMETRY_DIR = process.env.HARNESS_TELEMETRY_DIR || '/home/ubuntu/.openclaw/shared/harness-telemetry';
const safeSeg = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9@._-]/g, '_').slice(0, 120);
R.post('/api/harness/usage', express.json({ limit: '5mb' }), (req, res) => { … });
```
- **Why placed before the auth gate (line ~1643):** dev machines have no Atlas Slack session, so the route
  authenticates with a **shared Bearer token** instead. It is registered *above* the `R.use(... resolveUser ...)`
  gate so the session check doesn't reject it (same pattern as the unauthenticated `/api/health`).
- **Why `express.json` is scoped to just this route:** Atlas has no global body parser; scoping it here avoids
  changing how any existing route reads input.
- **Why `safeSeg` on the email:** the email becomes a folder name — sanitizing it prevents path traversal
  (`../../etc` → `.._.._etc`, stays inside `TELEMETRY_DIR`). Verified.
- **What it does:** appends the POSTed metadata-only records to
  `…/harness-telemetry/<git-email>/<YYYY-MM-DD>.jsonl` (creating dirs as needed). No DB writes, no PHI — the
  harness already strips everything but counts before sending.

### 2. `.env.example` — documents the new vars
```
HARNESS_TELEMETRY_TOKEN=          # set this to enable the route (empty ⇒ 503 / disabled)
# HARNESS_TELEMETRY_DIR=/home/ubuntu/.openclaw/shared/harness-telemetry   # override the default location
```

No new npm dependencies (`express.json` ships with express). No DB migration.

## Deploy

The deployer is `mbi-atlas/deploy/deploy.sh` (rsync code → install `deploy/server.env` as `.env` →
`npm install --omit=dev` → restart the `mbi-atlas` systemd service). So the **token goes in
`deploy/server.env`**, not a hand-edited `.env`:

1. **Pick a token** (long random string), e.g. `openssl rand -hex 24`.
2. **Add it to `mbi-atlas/deploy/server.env`:**
   ```
   HARNESS_TELEMETRY_TOKEN=<the-token>
   ```
3. **Deploy from the mbi-atlas working copy:**
   ```bash
   cd /path/to/mbi-atlas && bash deploy/deploy.sh
   ```
   (rsyncs the new `server.js`, ships `server.env` → `.env`, restarts the service.)
4. **No Apache change needed** — `/atlas/*` already reverse-proxies to `:7799`, so `/atlas/api/harness/usage`
   is routed automatically.

## Verify

```bash
# from anywhere (replace <token>):
curl -s -X POST https://mbi.mindbowser.com/atlas/api/harness/usage \
  -H "authorization: Bearer <token>" -H "content-type: application/json" \
  -d '{"userId":"you@mindbowser.com","day":"2026-06-21","harnessVersion":"0.1.62","records":[{"event":"edit"}]}'
# → {"ok":true,"written":1}

# wrong/no token → {"ok":false,"error":"unauthorized"} (401); token unset on server → 503

# on the server, confirm the file landed:
ssh mbi 'cat /home/ubuntu/.openclaw/shared/harness-telemetry/you@mindbowser.com/2026-06-21.jsonl'
```

## Then enable a dev's machine to upload

In each dev's Claude Code settings (`.claude/settings.json` → `env`; Pravin + CH team first):
```jsonc
{ "env": {
    "HARNESS_TELEMETRY_ENDPOINT": "https://mbi.mindbowser.com/atlas/api/harness/usage",
    "HARNESS_TELEMETRY_TOKEN": "<the-same-token>"
} }
```
The harness uploader (`bin/usage-upload.js`) then ships on SessionStart (detached, throttled ~6h),
backfilling un-sent days. Until both vars are set it's a complete no-op. Later, FleetDM can push these as
managed settings org-wide.
