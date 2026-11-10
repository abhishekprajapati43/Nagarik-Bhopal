# Security Report — Secret Leak Remediation

**Project:** Nagarik Bhopal — Civic Connect  
**Report date:** 2026-11-11  
**Detection source:** GitGuardian — *Generic High Entropy Secret*  
**Repository:** `abhishekprajapati43/Nagarik-Bhopal`

---

## 1. Executive summary

A high-entropy JWT signing secret was committed to the repository in the tracked
`.env` file. The same file also contained a real PostgreSQL password. The file
was committed in `81ed471` and changed to production-like values in `296ce91`
(the current `main` at the time of the alert).

The secret has been removed from the working tree and from all reachable Git
history, the JWT signing secret has been rotated locally, and build artifacts
that should never have been committed have been removed from version control.
The leaked database password still requires rotation on the PostgreSQL server.

**Risk before remediation:** Critical (JWT signing key + database password).  
**Risk after remediation:** Low locally; remote history must still be purged with
a forced push, and the database password must be rotated.

---

## 2. Detected secrets

| ID | Secret | Location | Line | Value (masked) | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | JWT HMAC signing secret | `.env` | 9 | `09337a71…ad66ad` (96 hex chars) | **Critical** | Removed, rotated |
| S2 | PostgreSQL password | `.env` | 7 | `Abh…123` | **High** | Removed, rotation required |
| S3 | Weak demo JWT secret | `.env` (older commits) | 9 | `mySuper…Key123` | Medium | Removed with history |
| S4 | Placeholder DB password | `.env` (older commits) | 7 | `your_password` | Informational | Removed with history |

S1 is the value detected by GitGuardian as a *Generic High Entropy Secret*.
No AWS, GCP, Azure, Firebase, OpenAI, Gemini, Stripe, Twilio, SendGrid, GitHub,
Slack, SSH or other private-key material was found.

### Why S1 matters

`JWT_SECRET` signs and verifies every API session token (HS256). Anyone with
the leaked value could mint valid administrator or resident tokens, so the old
value must be treated as compromised even after it is removed from Git.

---

## 3. Git history occurrences

Each row is a commit that contained the secret. Original hashes are the hashes
GitGuardian saw; rewritten hashes are the clean history produced by this
remediation. All `.env` entries have been purged from the rewritten history.

| Original commit | Rewritten commit | Subject | File / line | Secret present |
| --- | --- | --- | --- | --- |
| `81ed471` | `f2081f8` | Add Features | `.env:7`, `.env:9` | S4 + S3 (weak/placeholder) |
| `24956d1` | `0db9fa5` | Add features | `.env:7`, `.env:9` | S4 + S3 |
| `d5b0558` | `2b9ef69` | Add featurs | `.env:7`, `.env:9` | S4 + S3 |
| `87594f2` | `694eaa5` | Add featurs | `.env:7`, `.env:9` | S4 + S3 |
| `296ce91` | `81da4b6` | backend setting update | `.env:7`, `.env:9` | **S2 + S1 (real secrets)** |
| `405633d` | `a3f03f7` | security: untrack env secrets… | — | Clean remediation commit |

The file `node_modules .env` (a two-line junk file containing only
`node_modules` and `.env`) was also committed in `81ed471`; it was deleted from
the working tree and removed from `HEAD`. It contains no secret, but it remains
in the pre-remediation history.

---

## 4. Other security findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| F1 | `.env` was tracked despite being listed in `.gitignore` | Critical | Fixed |
| F2 | Real JWT secret and DB password in Git history | Critical | Purged / rotated |
| F3 | `node_modules/` (3,323 files) and `dist/` (3 files) committed | Medium | Removed from tracking |
| F4 | Junk file `node_modules .env` committed | Low | Removed |
| F5 | Demo admin password (`Admin@123`) and demo resident password (`Citizen@123`) hardcoded in `shared/constants.js` / `shared/seed.js` | Low (demo-only, documented) | Documented; change before production |
| F6 | Public offline-mode JWT fallback `nagarik-bhopal-demo-secret-change-me` in `shared/constants.js` | Low (public demo, not a production secret) | Documented; production requires a real `JWT_SECRET` |
| F7 | `EXPOSE_RESET_TOKEN` defaults to `true` outside production and returns reset tokens in API responses | Medium if `NODE_ENV` is misconfigured in production | Run production with `NODE_ENV=production` and `EXPOSE_RESET_TOKEN=false` |
| F8 | Helmet CSP is disabled (`contentSecurityPolicy: false`) | Low/Medium | Recommended hardening (left unchanged to avoid breaking Leaflet/React) |
| F9 | API accepts JWTs in `X-Auth-Token` and JSON body for legacy RPC compatibility | Low | Recommended to migrate to `Authorization: Bearer` only |
| F10 | In-memory rate limiter is per-process | Low | Acceptable for single instance; use a shared store when scaling |
| F11 | `/api/health` exposes version, uptime and DB status | Low (informational) | Intentional readiness endpoint |

No debug/test backdoor endpoints, exposed configuration dumps, or additional
hardcoded API keys were found.

---

## 5. Fixes applied

1. **Untracked the real `.env`**
   - `git rm --cached .env`
   - The local `.env` remains on disk for development and is now ignored.
2. **Rotated the JWT secret**
   - A new 96-character random secret was generated and written to the local
     `.env` only.
   - All previously issued tokens become invalid, which is the intended effect.
3. **Hardened `.gitignore`**
   - Ignores `.env` and `.env.*` while keeping `!.env.example`.
   - Ignores `*.pem`, `*.key`, `*.p12`, `*.pfx`, `secrets/` and local build
     verification output.
4. **Removed accidentally committed artifacts**
   - `git rm -r --cached node_modules dist`
   - Deleted the junk file `node_modules .env`.
5. **Kept `.env.example` safe**
   - It contains placeholders only (`DB_PASSWORD=change-me`,
     `JWT_SECRET=replace-with-a-long-random-secret-at-least-32-chars`).
   - Added a command to generate a strong JWT secret.
6. **Purged `.env` from Git history**
   - `git filter-branch --index-filter "git rm --cached --ignore-unmatch .env" -- --all`
   - Removed `refs/original`, expired reflogs and ran `git gc --prune=now`.
   - A backup bundle was written outside the repository before the rewrite:
     `%TEMP%\opencode\nagarik-secret-remediation\pre-history-purge.bundle`.

---

## 6. Verification performed

| Check | Result |
| --- | --- |
| Old JWT secret and DB password searched across all reachable commits | **PASS** — 0 matches |
| `.env` present in any commit tree | **PASS** — absent |
| `.env` ignored/untracked locally | **PASS** — `git status --ignored` reports `!! .env` |
| `node --check` on all tracked backend/shared JS files | **PASS** — 78 files |
| Backend module import (`import('./backend/app.js')`) | **PASS** |
| Live API smoke test: `/api/health`, admin login, `/api/auth/me` | **PASS** — DB connected; token signed/verified with rotated secret |
| Frontend production build (`vite build`) | **PASS** — 135 modules transformed |
| `.env.example` placeholder-only check | **PASS** |
| Source scan for API keys, tokens, private keys, cloud credentials | **PASS** — none found |
| UI routes and component code | **Unchanged** |

The build was written to a temporary directory and removed, so the checked-in
frontend bundle in `assets/` was not modified.

---

## 7. Required manual actions

1. **Rotate the PostgreSQL password (critical).**
   - The leaked password must be considered compromised.
   - Example: `ALTER USER postgres WITH PASSWORD '<new-strong-password>';`
   - Update the local `.env` and every deployment/CI secret store. The new
     password is not committed.
2. **Force-push the cleaned history.**
   - The local history is clean, but GitHub still has the original commits until
     the rewritten history is pushed:
     `git push --force-with-lease origin main`
   - Coordinate with collaborators first; they must re-clone or reset to the new
     history.
3. **Resolve the GitGuardian / GitHub secret-scanning alert.**
   - Mark it resolved only after rotating S1/S2 and force-pushing the clean
     history. Enable push protection to prevent recurrence.
4. **Delete the temporary backup bundle once the push is confirmed.**
   - `%TEMP%\opencode\nagarik-secret-remediation\pre-history-purge.bundle`
   - `%TEMP%\opencode\nagarik-secret-remediation\env.before-remediation`
   - Both contain the old secret by design.
5. **Harden the demo/production boundary.**
   - Change the documented demo passwords before any real deployment.
   - Run production with `NODE_ENV=production`, `EXPOSE_RESET_TOKEN=false`, an
     explicit `CORS_ORIGIN`, and a unique 32+ character `JWT_SECRET`.
6. **Optional hardening.**
   - Re-enable a suitable Helmet CSP for the asset/Leaflet origins.
   - Prefer `Authorization: Bearer` only and remove body-token support when the
     legacy RPC client is retired.

---

## 8. Is the project safe to push to GitHub again?

**Locally, yes.** The working tree contains no real secrets, `.env` is ignored,
and the reachable Git history no longer contains the leaked JWT secret or
database password.

**Not until the remote is force-pushed.** The original commits still exist on
`origin/main` on GitHub. Push the rewritten history with
`git push --force-with-lease origin main` after coordinating with collaborators.

Regardless of history cleanup, **rotate the database password and keep the
rotated JWT secret private**, because the old values were already exposed
publicly and must be treated as compromised.
