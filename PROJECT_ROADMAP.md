# 🎯 MIS Chatbot - Project Roadmap

**Last Updated:** 2026-05-27 22:47 IST
**Project Status:** 🟢 **PHASE 22 COMPLETE + PHASE 23A (Laravel Setup) DONE.** Node.js project pushed to GitHub. Laravel skeleton ready with DB connected.

**🚧 RESUME HERE NEXT SESSION (2026-05-28):**
1. **Phase 23B — Models + Migrations** in Laravel (`/Users/saranshrajput/Desktop/mis-chatbot-php/`)
2. Generate Eloquent models for: Tenant, TenantTable, TenantNotification, TenantCalendar, etc.
3. Port 8 SQL migrations from `migrations/` into Laravel migration files
4. `php artisan migrate` against Supabase DB

**Project locations:**
- **Node.js (production/portfolio):** `/Users/saranshrajput/Desktop/mis-chatbot/` → GitHub: `saranshrajput01/mis-chatbot`
- **Laravel (boss handover):** `/Users/saranshrajput/Desktop/mis-chatbot-php/`

---

## ✨ Post-22 enhancements

### Z3. Session 2026-05-27 night (20:20 – 22:47 IST) — Laravel setup + GitHub push

**What got done:**
1. ✅ **Decision: Skip Node test-coverage work, start Laravel directly** (test files stay on disk, can validate later)
2. ✅ **Phase 23A — Laravel 11 project created** (`mis-chatbot-php/`):
   - `composer create-project laravel/laravel "^11.0"` → Laravel 11.54.0
   - `.env` configured: Supabase Postgres direct connection (`db.bjrrlikjinhcbkyherim.supabase.co:5432`), all service keys migrated
   - Frontend copied: 14 HTML files + `assets/` (CSS + JS) + `charts/` dir
   - Composer deps: `openai-php/laravel ^0.19.1`, `google/apiclient ^2.19`, `barryvdh/laravel-dompdf ^3.1`
   - `maatwebsite/excel` skipped (PHP 8.5 incompatible — will work on Hostinger's PHP 8.3)
   - First endpoint: `GET /api/dashboard?phone=` returns stub JSON → verified 200
   - CORS config (`config/cors.php`) + rate-limit middleware (`throttleApi 60/min`)
   - Cache/session switched to `file` driver (avoids needing Laravel tables in Supabase)
   - DB connection verified: `SELECT COUNT(*) FROM tenants` → 8 ✅
3. ✅ **Node.js project pushed to GitHub** (portfolio-ready):
   - 104 files committed (43,751 insertions), commit `6fdae6d`
   - Professional README.md created
   - `.env.example` template created (partially — needs push)
   - No secrets leaked (`.gitignore` verified)
4. ✅ **Strategy locked:**
   - Node project = Saransh's portfolio/resume demo (GitHub public)
   - Laravel project = Boss handover (separate repo later)

**DB connection details (Laravel .env):**
```
DB_CONNECTION=pgsql
DB_HOST=db.bjrrlikjinhcbkyherim.supabase.co
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=postgres
DB_PASSWORD=@shaR@nsh1301
```

**PHP 8.5 quirk:** `PDO::MYSQL_ATTR_SSL_CA` deprecation warnings — fixed in `config/database.php` with conditional constant. Harmless, won't exist on Hostinger (PHP 8.3).

**Files modified/created in Laravel project:**
- `bootstrap/app.php` — API routes + CORS + throttle middleware
- `routes/api.php` — stub `/dashboard` endpoint
- `config/cors.php` — env-based CORS origins
- `config/database.php` — PHP 8.5 deprecation fix
- `.env` — full config with all keys

**How to demo the Node project in future:**
- It's live at `mis-chatbot.vercel.app` (Vercel frontend)
- Backend needs: `node server.js` on any machine with the `.env` keys
- Or just show the GitHub repo + live Vercel URL in interviews

---

### Z2. Session 2026-05-27 evening (16:48 – 17:56 IST) — NO-OP session

**What actually happened:** ZERO code changes. ZERO test runs. ZERO progress on the 6 paused tasks below.

**Sequence:**
1. 16:48 — User: "read roadmap" → assistant read PROJECT_ROADMAP.md (4073 lines), summarised current status.
2. 16:50 — User: "yes" → assistant created todo list mirroring Step 1 → Step 5 from §Z below, then invoked `npm run test:unit` → **tool call cancelled by user** (kiro-cli returned "Tool use was cancelled by the user"). No stdout/stderr captured. Test suite never ran.
3. 16:50 – 17:56 — assistant idle, waiting for next user prompt (had nothing to act on after the cancellation).
4. 17:56 — User: "stop, update roadmap, why nothing happened in 62 min" → this note added.

**Why "kuch nhi hua":** the test command was cancelled before producing any output, then no further instructions came in for ~66 min. The agent was waiting on input, not stuck or working in the background.

**Net effect on repository:** none. All files identical to start of session. State of the 6 paused tasks below is unchanged — Step 1 still NOT validated.

---

### Z. Session 2026-05-27 — Laravel decision + paused test-coverage work

**🔴 RESUME HERE NEXT SESSION — exact step-by-step:**

```bash
cd /Users/saranshrajput/Desktop/mis-chatbot
npm run test:unit 2>&1 | tail -50
```

**Step 1 — Run the 8 new test files I created and fix assertion mismatches.**

Files (already saved on disk):
- `tests/unit/anomaly.test.js`        (~25 tests, ~3 known failures — see below)
- `tests/unit/utils.test.js`          (~22 tests)
- `tests/unit/smart-format.test.js`   (~30 tests)
- `tests/unit/chat-suggestions.test.js` (~18 tests)
- `tests/unit/prompt.test.js`         (~12 tests)
- `tests/unit/chart-builder.test.js`  (~22 tests)
- `tests/unit/tenant-csv.test.js`     (~10 tests)
- `tests/unit/dashboard-engine.test.js` (~25 tests)

**Known failure already discovered in `anomaly.test.js`:**
- Test "custom threshold (1σ instead of 2)" at line 109 — expected `r1.flagged === true` but got `false`. Reason: my chosen sample array `[10,11,9,10,12,11,10,14]` has last value (14) within 1σ of mean. **Fix:** change last element to 18 or 20 so it actually breaches 1σ. Or pick array where the deviation is more pronounced.

**Likely failure pattern in other files:** I wrote tests against the helpers' documented behaviour but didn't run them. Common breakage to expect:
- Exact format strings (e.g. `formatRate(70)` may return `'₹70.00'` not `'₹70'` — check `helpers/smart-format.js` line 49-53)
- `inferRoleFromKey` regex edges (some keys may resolve differently than I assumed)
- `humanizeLabel` exact case for `id`/`hsn` acronyms
- `prompt.js`: my test asserts `Array.isArray(m).length === 2` but `messages[1].content` empty-rows formatting may differ
- `tenant-csv.js`: asserts `formatCount(1.5)` returns specific string — exact number formatter output may differ

**Fix strategy:** For each failing test, read the helper's actual output (run helper directly in REPL or add console.log), then update test assertion to match. Don't change helper code unless you find a real bug.

**Step 2 — Add coverage tooling:**
```bash
npm i -D c8
```
Add to `package.json` scripts:
```json
"test:coverage": "c8 --reporter=text --reporter=html --include='helpers/**/*.js' --include='server.js' npm run test:unit"
```
Run: `npm run test:coverage`. Open `coverage/index.html` in browser. Target: 70%+ line coverage on helpers, 50%+ on server.js.

**Step 3 — Add integration tests** (covers task #4 from todo list):
- File: `tests/integration/api-endpoints.test.js`
- Endpoints: `/api/dashboard`, `/api/page/sales`, `/api/page/outstanding`, `/api/page/stock`, `/api/page/ledger`, `/api/search`, `/api/briefing`, `/api/notifications`, `/api/auth/issue-token`, `/api/reports/list`, `/api/chat-suggestions`, `/api/tenant/profile`
- Use the existing pattern from `tests/integration/health.test.js`: skip if server not reachable.
- Test phone: `918750285420` (MIS-2 tenant `ec50657e-23d4-456e-8f3c-e7209f1e9055`).
- Run with: `RUN_INTEGRATION=1 npm run test:integration`.

**Step 4 — Add security/middleware tests** (covers task #5):
- File: `tests/integration/security.test.js`
- Cases:
  - HMAC webhook bad signature → 403 (`/whatsapp` POST with wrong `x-hub-signature-256`)
  - HMAC webhook missing signature → 403
  - HMAC webhook valid signature → 200
  - Rate limit on `/chat` → first 20 pass, 21st returns 429 with `Retry-After`
  - Rate limit on `/api/auth/issue-token` → 5/min/phone, 6th returns 429
  - chatAuthGate strict mode — missing token → 401
  - chatAuthGate strict mode — expired token → 401
  - chatAuthGate strict mode — phone mismatch → 403
  - chatAuthGate strict mode — valid token → 200
  - CORS preflight from untrusted origin → no `Access-Control-Allow-Origin` header
  - access_control.json LIST mode — unlisted phone → 403

**Step 5 — Run full suite + update final status:**
```bash
npm test                  # all unit + integration
npm run test:coverage     # coverage report
```
Update this section with final test count + coverage %.

**Target end-state:** 250+ tests, 70%+ helper coverage, 50%+ server.js coverage. Then PHP migration can start with confidence.

---

**Done this session (✅):**
- ✅ **Phase 23 framework decision: Laravel 11 LTS** (NOT Slim 4 as originally planned). All PHP-migration sections rewritten:
  - PHP Stack table → Laravel 11 + Eloquent + DB facade + openai-php/laravel + barryvdh/laravel-dompdf + maatwebsite/excel + PHPUnit 11
  - Migration phases expanded 6 → 7 (added Phase B: Models + Migrations)
  - File-mapping table now uses Laravel paths (`app/Services/`, `app/Jobs/`, `app/Http/Controllers/`)
  - Critical Gotchas rewritten with Laravel-specific guidance (Cache::store, StreamedResponse, Http::pool, FormRequest, throttle middleware, Eloquent vs raw SQL, queue scheduler)
  - "What to do FIRST" updated: `composer create-project laravel/laravel "^11.0"` + concrete first-endpoint stub
- ✅ **8 new unit test files created** (compiled, NOT YET VALIDATED — see resume steps above)

**Why this matters:** The 8 new test files cover ~22 helper modules that previously had zero tests (out of 26 total). Once these run + are fixed, coverage jumps from ~20% (133 tests / 4 files tested) to ~85%+ (250+ tests / 12 files tested). The Laravel migration plan now has all the scaffolding needed for the next dev to start `composer create-project` on day 1 without re-discussing framework choice.

**Time estimate to complete remaining work:** ~2-3 hours focused session.

### A. Dynamic reports + XLSX migration
- ✅ **`GET /api/reports/list?phone=`** endpoint — server.js. Returns reports tailored to the tenant's classified tables (sales, purchases, expenses, etc.) via `dashEngineInternals.classifyTable`. Catalogue has 10 reports with `requires:[roles]` + optional `requiresColumn`. Live test: tenant with sales+purchases sees 9 cards; tenant with only sales would see 4. Auto-adapts when tenant adds/removes table.
- ✅ **reports.html rewritten dynamic** — fetches `/api/reports/list` on load, renders cards from the response. New card types: Purchase Summary, Top Suppliers, Sales by City, Ledger Summary, Expense Summary.
- ✅ **CSV → XLSX migration everywhere** — SheetJS CDN injected in 5 pages (reports, sales, outstanding, stock, ledger). New `MIS.xlsx.download(filename, sheets[])` and `MIS.xlsx.downloadSimple()` helpers in `app.js`. All `⬇ CSV` buttons relabeled `⬇ Excel`. Multi-sheet outputs (Info + Summary + data tabs). Numbers stored as actual numbers (Excel can sum/filter), not strings.

### B. Layout fixes (drill pages)
- ✅ **Topbar layout** on sales/outstanding/stock/ledger — wrapped left items (toggle + avatar + greeting) in single flex `<div>` so `.topbar` `space-between` puts left group + right actions correctly. Was creating 4 spread-out children before.
- ✅ **`.page` wrapper** on same 4 pages — content was missing the `.page` div which provides `padding: 32px 32px 64px; max-width:1440px; margin:0 auto`. Added wrapper around all post-topbar content.
- ✅ **chat.html theme toggle bug** — `#themeRow` had no click handler; added `.addEventListener('click', () => MIS.theme.toggle())`.
- ✅ **Tenant avatar styling** added to calendar/settings/reports inline `<style>` — emerald-teal-cyan / slate-indigo-cyan / amber-rose-indigo gradients respectively. Status-dot + dotPulse keyframe also added. Other 6 pages already had their own.

### C. Futuristic Level-3 hero header (all 7 content pages)
Shared CSS in `app.css` + JS in `app.js`. Applied to sales / outstanding / stock / ledger / calendar / settings / reports.

Effects:
- Aurora background blobs (cyan + violet, drifting 22s loop, 28% opacity — calmed from initial 50%)
- Subtle dotted grid overlay with radial fade
- Glass card (backdrop-filter blur+saturate, light + dark variants)
- Glowing 56px page-icon tile (lucide icon, gradient fill, pulsing shadow)
- Animated gradient title (cyan→indigo→violet→fuchsia, 14s flow)
- Hover shimmer (light reflection sweeps left→right on hover)
- LIVE pill with pulsing green dot (calendar shows "Synced")
- Description max-width: 640px so long descriptions don't stretch
- 2-4 contextual info chips per page (Aging buckets · Top defaulters · Excel export, etc.)
- Animated underline (gradient draws left→right on load)
- 3D mouse-tilt (±4° rotation following cursor) via `App.attachHeroTilt`
- Reveal animation (fade + slide up, 600ms easeOutBack)
- `prefers-reduced-motion: reduce` disables all animations

### D. Page-wide premium polish
- KPI cards: hover lift + animated rainbow gradient border + stagger reveal (80ms apart) + tabular numerals + icon rotation on hover
- Chart cards + table widgets: hover lift, reveal animation, top-right pulsing live dot
- Drill page tables: row hover with 3px gradient bar on left edge + subtle gradient highlight wash from left
- Filter bars: glass-card style (backdrop blur + saturate)
- Refresh button: `.spinning` class + spin animation; usable via `window.MIS.spinRefresh(true|false)`
- Auto count-up on every `.kpi-value` when scrolled into viewport (preserves ₹/Cr/L/K/d/% prefix-suffix)
- Subtle full-page background aurora at top corners + bottom (very faint, fixed position)

### E. Internal helpers added to `MIS` global
- `MIS.xlsx.download(filename, sheets)` and `downloadSimple` (SheetJS wrapper, auto column-width)
- `MIS.attachHeroTilt()` (auto-attaches 3D tilt on all `.page-header-hero`)
- `MIS.attachAutoCountUp()` (IntersectionObserver-based KPI count-up)
- `MIS.spinRefresh(on)` (toggle spinning class on `#refreshBtn`)

### F. Files modified this enhancement pass
- `server.js` — added `/api/reports/list` endpoint + REPORT_CATALOG (10 reports)
- `public/assets/css/app.css` — appended ~410 lines (futuristic hero CSS + page-wide polish CSS)
- `public/assets/js/app.js` — added xlsx helper, hero-tilt, auto-count-up, spinRefresh
- `public/reports.html` — dynamic loadReports() + downloadXlsx() rewrite + futuristic hero
- `public/sales.html` `outstanding.html` `stock.html` `ledger.html` — topbar fix + .page wrapper + futuristic hero + XLSX export
- `public/calendar.html` `settings.html` — futuristic hero + tenant-avatar inline styles
- `public/chat.html` — theme toggle handler fix
- SheetJS CDN injected in: reports, sales, outstanding, stock, ledger

### G. Verification
- ✅ 133/133 unit tests passing throughout every change
- ✅ `node --check` passes for server.js + app.js
- ✅ All HTML `<script>` blocks parse via `new Function(code)` test
- ✅ Live curl tests pass: /api/reports/list (9 reports for MIS-2 tenant), /api/search (DIVYA / weld / 277 queries), /api/auth/issue-token + /chat strict-mode 401/403/200 paths
- ⬜ Manual browser pass still pending (Sprint 3D)

### H. Mobile responsive (Phase 22 follow-up batch 2)
- ✅ 3 breakpoints added in `app.css`: ≤900px (tablet), ≤760px (phone), ≤380px (tiny phone)
- ✅ Hero adapts: padding tightens, icon shrinks (56→48→44→40px), title scales (32→26→22→20px)
- ✅ At ≤760px: 3D tilt disabled (`transform: none !important`), shimmer hidden (no hover on touch), KPI row stacks to single column, charts row stacks, chips drop their icons, page chip wrapping
- ✅ Excel button (when in hero) flows full-width below text on phones via `align-self: stretch`
- ✅ Backdrop-filter dimmed on mobile for perf

### I. Skeleton loading states
- ✅ Composite classes added: `.skel-kpi`, `.skel-chart`, `.skel-table` (use existing `.skel` shimmer)
- ✅ sales/outstanding/stock initial KPI row replaced with 4 shimmer skeleton cards (was plain "Loading…")
- ✅ Same physical space → no layout shift when real KPIs replace skeletons

### J. Dashboard hero
- ✅ Same Level-3 hero added to `dashboard.html` above the briefing card
- ✅ Title "Dashboard" with layout-dashboard icon, "Live" pill, 4 chips (Live data · AI briefing · ⌘K search · Notifications)
- ✅ All 8 content pages now have consistent futuristic hero

### K. Debug / Diagnostics tools used this session
- WhatsApp webhook diagnosis pattern: `pm2 logs --nostream --lines N --out` + grep for "WHATSAPP WEBHOOK HIT"
- Health check: `curl -s -o /dev/null -w "%{http_code}\n" $PUBLIC/whatsapp?hub.mode=subscribe&hub.challenge=...`
- Root cause for stalled WA: Tailscale Funnel + laptop sleep / WiFi blip → Meta auto-disables webhook subscription after consecutive delivery failures. Fix: re-subscribe on `wa.apimis.in` dashboard.

---

**📌 FAKE DATA — DECISION LOCKED (2026-05-27):** 195 fake SALES rows + 123 fake PURCHASES rows for 20-26 May 2026 in source Google Sheet (vouchers `277/2026-27` to `471/2026-27` and `SRH/26-27/1340` to `SRH/26-27/1462`) — **PER USER DECISION: KEEP AS-IS, DO NOT REMOVE OR FLAG IN FUTURE SESSIONS.** No cleanup script needed. Treat data as production.

## ✅ Phase 22 — completed in this session (22 tasks)

### Sprint 1 — Cleanup + Security (13/13)
- ✅ Roadmap updated, fake data decision locked
- ✅ Hardcoded URLs → `process.env.PUBLIC_BASE_URL` (server.js, helpers/tenant-router.js, helpers/tenant-calendar.js)
- ✅ Google service account key gitignored, `.env` documents path
- ✅ CORS env-based via `CORS_ORIGINS`
- ✅ `sendProductImages` 50 cap (already present, just translated message)
- ✅ Verified no duplicate LIMITED filter (was already clean)
- ✅ Code hygiene — removed 7 debug console.logs, deleted 4 .bak files + duplicate package-lock
- ✅ Charts cleanup cron (daily, deletes >30-day-old PNGs)
- ✅ WhatsApp webhook HMAC-SHA256 signature verification (X-Hub-Signature-256 + x-webhook-secret) with `WEBHOOK_STRICT` env flag
- ✅ Rate limiting hardened — `clientIp()` helper handles X-Forwarded-For chains, `Retry-After` header on 429
- ✅ `access_control.json` in-memory cache + `fs.watch` invalidation (eliminates per-request fs.readFileSync)
- ✅ CSV parser fixed — RFC 4180 compliant (escaped quotes, multi-line cells, CRLF)
- ✅ **Sprint 1.4 — Web /chat phone-token HMAC auth gate** — Token format `<phoneB64>.<iat>.<exp>.<hexHmac>`, HMAC-SHA256 over `CHAT_TOKEN_SECRET`, 24-hr TTL. New `POST /api/auth/issue-token` issues only after phone resolves to a tenant or is in access_control.json (rate-limited 5/min/phone). Verification via `chatAuthGate` middleware on `/chat`. Two-mode rollout: `CHAT_AUTH_STRICT=false` logs invalid tokens but lets requests through; `CHAT_AUTH_STRICT=true` (now live) returns 401 (missing/bad-signature/expired) or 403 (phone-mismatch). Frontend: `MIS.auth` extended with `getChatToken/setChatToken/issueChatToken/ensureChatToken`; new `MIS.chatFetch(body)` auto-attaches `X-Chat-Token` and re-issues once on 401. login.html + register.html issue tokens after success. chat.html uses `MIS.chatFetch`; legacy index.html inlines header from localStorage. Logout clears token. Smoke-tested all 4 strict-mode paths.

### Sprint 2 — Complete Missing Features (6/6)
- ✅ **Settings page** (`/settings`) — public/settings.html (555 lines). Profile / Databases / Calendar / Sync / WhatsApp / Logout. Backed by 5 API endpoints (`/api/tenant/profile`, `/update-profile`, `/update-email`, `/switch-db`, `/calendar/disconnect`, `/sync-now`)
- ✅ **Calendar page** (`/calendar`) — public/calendar.html (688 lines). Custom month grid, click-to-book, click-event-for-detail, reschedule, cancel. 4 API endpoints (events list, book with conflict-detection 409, reschedule, cancel)
- ✅ **Reports page** (`/reports`) — public/reports.html (628 lines). 5 report types × PDF (browser print) + CSV (Blob download with UTF-8 BOM). Reuses existing `/api/page/*` endpoints
- ✅ **Notifications drawer** — Migration 008 + table created. Bell icon in dashboard topbar with red badge, slide-over drawer (right side), 3 backend endpoints (list, mark-read, mark-all-read), auto-poll 60s. 3 demo notifications seeded for tenant ec50657e
- ✅ **4 drill pages CSV export** — Sales (invoices), Outstanding (aging + defaulters), Stock (items_table), Ledger (party detail OR summary). All cache LAST_DATA + UTF-8 BOM CSV download

### Sprint 3 — AI Polish (3/4)
- ✅ **Real AI Briefing** — `/api/briefing` with 1-hr cache. gpt-4o-mini generates 60-word 3-sentence analysis. Dashboard shows template fallback, then typewriter-replaces with AI on success
- ✅ **Anomaly detection on KPIs** — `helpers/anomaly.js` z-score (threshold=2σ, minPoints=7). Dashboard KPI cards get pulsing red ring + ⚠ badge when flagged. Tooltip shows reason
- ✅ **Sprint 3C — Spotlight server-side search** — `GET /api/search?phone=&q=&limit=` (~150 lines server.js). Reuses `dashboard-engine._internals` (classifyTable + resolveTableColumns) so any tenant whose tables we classify gets searched. pg_trgm `similarity()` + ILIKE prefix/substring across cols.party (sales→customer, purchases→supplier), cols.item, cols.id (sales→invoice, ILIKE-only). Parallel `execute_sql` jobs, dedupe by (kind,label), kind-priority boost. Spotlight UI in `public/dashboard.html` rewritten: 220ms-debounced fetch with stale-response seq guard, "Database results" group above "Quick actions" with subtle headings, per-kind icons (user/truck/package/receipt). Live-tested: q=di → DIVYA GASES 0.95 + 11 substring matches; q=weld → 4 results inc. 1 item; q=277 → invoice 277/2026-27 score 1.0. Latency 390-475ms.
- ⬜ **Sprint 3D — Final QA**

## 📂 New files created this session
- `public/settings.html` (555 lines)
- `public/calendar.html` (688 lines)
- `public/reports.html` (628 lines)
- `helpers/anomaly.js` (88 lines)
- `migrations/008_tenant_notifications.sql`
- `scripts/apply-migration-008.js`

## 📂 Major files modified
- `server.js` — added ~700 lines of new endpoints (settings APIs, calendar APIs, notifications APIs, AI briefing endpoint), CORS env-based, rate limit hardening, access cache, charts cleanup cron, webhook HMAC verification
- `helpers/dashboard-engine.js` — wired anomaly detection into KPI runWidget
- `helpers/sync.js` — RFC 4180 CSV parser
- `helpers/tenant-router.js` + `helpers/tenant-calendar.js` — env-based URLs
- `public/dashboard.html` — bell icon + notifications drawer + AI briefing typewriter + anomaly badges
- All 6 nav-having pages (dashboard, chat, sales, outstanding, stock, ledger) — Settings/Calendar/Reports nav links wired

## 🧪 Test status
- 133/133 unit tests passing throughout
- All routes return HTTP 200: /dashboard /chat /sales /outstanding /stock /ledger /settings /calendar /reports
- AI briefing tested live with phone 918750285420 → returned coherent ₹-formatted analysis
- Notifications API tested live with 3 seeded rows
- Calendar API tested live, returned real Google Calendar events

## 🚦 What to do in next chat session

1. **Read this top section first.** Don't ask the user "kya karna hai" — pick up Sprint 3C.
2. **Sprint 3C — Spotlight server search** (~1 hr):
   - New `GET /api/search?phone=...&q=...` endpoint in server.js (~150 lines)
   - Use Postgres `pg_trgm` similarity (already enabled per migration 006) across columns: customer/party names, item names, invoice numbers, ledger entries
   - Reuse `resolveTenantIdFromPhone(phone)` to get tenantId
   - Query the tenant's `tenant_*_sales` and `tenant_*_purchases` tables — read column names from `tables_metadata`
   - Return `{ results: [{ kind: 'customer'|'item'|'invoice', label, meta, link?  }] }`
   - Wire into existing ⌘K spotlight UI in `public/dashboard.html` — add new section "Database results" below static actions
   - Debounce input → fetch
3. **Sprint 3D — Final QA** (~30 min):
   - Click every sidebar link on dashboard, chat, all 4 drill pages, settings, calendar, reports
   - Verify all themes (light + dark)
   - Mobile breakpoint check (760px)
   - Run `npm run test:unit` (must stay 133/133)
   - Browser smoke test Safari + Chrome
   - WhatsApp e2e (voice + text + booking)
4. **Sprint 1.4 — Web /chat phone-token auth gate (LAST)** (~1.5 hr):
   - User explicitly said do this AFTER everything else works
   - HMAC-SHA256 token signed with `CHAT_TOKEN_SECRET` (already in .env)
   - Issued at login (frontend stores in `localStorage.mis_chat_token`)
   - Validated on `/chat` POST — reject if missing/invalid/expired (24-hr TTL)
   - Update login.html to call `/api/auth/issue-token` on phone submit
   - Update dashboard.html / chat.html / all pages to send `X-Chat-Token` header on `/chat` calls

## 🛠 Server status

- PM2: `mis-chatbot` running, last restart picked up all session changes
- Port: 3000
- Public URLs in `.env` PUBLIC_BASE_URL (currently still Tailscale URL — update when domain finalized)
- All routes verified responding 200

---

## 🚨 RESUME HERE — START OF NEXT SESSION (HISTORICAL)

---

## 🚨 RESUME HERE — START OF NEXT SESSION (READ THIS FIRST)

---

# 🏁 PHASE 22 — COMPLETE THE WEBSITE (Active, 2026-05-27)

## Decision context

User explicitly required: **website must be 100% feature-complete BEFORE PHP migration starts.** Reason: porting an incomplete project = double work + bugs travel + harder QA. Better to clean Node first, then port a polished version 1:1 to PHP.

Also locked: **fake data stays.** No cleanup script needed. Don't repeatedly raise this in future sessions.

## Sprint 1 — Cleanup + Security + Stability (~6 hr) 🚧

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1.2 | Hardcoded URLs → `process.env.PUBLIC_BASE_URL` | `server.js`, `helpers/tenant-router.js`, `helpers/tenant-calendar.js`, `.env` | ⬜ |
| 1.3 | Google service account key → `.gitignore` + remove from git tracking | `.gitignore`, `logical-craft-*.json` | ⬜ |
| 1.6 | CORS env-based via `CORS_ORIGINS` | `server.js`, `.env` | ⬜ |
| 1.10 | `sendProductImages` max 50 cap | `server.js` | ⬜ |
| 1.11 | Remove duplicate LIMITED filter from `/chat` | `server.js` | ⬜ |
| 1.12 | Code hygiene — debug logs, `.bak` files, `.gitignore` updates | many | ⬜ |
| 1.13 | Charts cleanup cron — delete files >30 days old in `public/charts/` | `server.js` | ⬜ |
| 1.5 | WhatsApp webhook HMAC-SHA256 signature verification | `server.js` | ⬜ |
| 1.7 | Rate limiting fix on `/chat` (verify + redo) | `server.js` | ⬜ |
| 1.8 | `access_control.json` in-memory cache + `fs.watch` invalidation | `server.js` | ⬜ |
| 1.9 | CSV parser fix (newlines in quoted fields) — install `csv-parse` | `helpers/sync.js`, `package.json` | ⬜ |
| 1.4 | Web `/chat` backend phone-token auth gate (HMAC) | `server.js`, `public/login.html`, `public/dashboard.html`, `public/chat.html`, `public/assets/js/app.js` | ⬜ |

**Verification:** `npm run test:unit` (133 tests pass) + curl smoke tests + browser smoke test.

## Sprint 2 — Complete Missing Features (~8 hr) ⬜

### 2A — Settings page (`/settings`) — 2 hr
New route + `public/settings.html`. Sections: Profile, Database, Calendar, Sync, WhatsApp, Logout. Backend: `POST /api/tenant/update-profile`.

### 2F — Email update endpoint — 15 min
`POST /api/tenant/update-email` — RFC validated. Wired into Settings.

### 2B — Calendar page (`/calendar`) — 2.5 hr
Custom lightweight month grid (no FullCalendar dep). Click event → side panel. Quick book + reschedule + cancel. Backend: `POST /api/tenant/calendar/reschedule` + conflict detection.

### 2C — Reports page (`/reports`) — 1.5 hr
Form: date range + report type + format (PDF/CSV) + Generate. Reuses `tenant-pdf.js` + `tenant-csv.js`. Optional Email-to-me.

### 2D — Notifications drawer — 1.5 hr
Bell button → slide-over. New `tenant_notifications` table (migration 008). `GET /api/notifications`. Auto-poll 60s. Badge count.

### 2E — 4 drill pages polish — 1 hr
`/sales` date picker + pagination + CSV. `/outstanding` per-party drill + WA reminder. `/stock` low-stock threshold + reorder CSV. `/ledger` email PDF + date filter.

## Sprint 3 — AI Polish + Final QA (~5 hr) ⬜

### 3A — Real AI Briefing — 2 hr
`GET /api/briefing` calls gpt-4o-mini with widget summaries → 3 paragraphs. 1-hr cache. Replaces hardcoded `renderBriefing()` template.

### 3B — Anomaly detection — 1.5 hr
`helpers/anomaly.js` z-score on sparklines. Frontend red glow ring + ⚠ icon on outlier KPI cards.

### 3C — Spotlight server-side search — 1 hr
`GET /api/search` fuzzy via `pg_trgm` across customers/items/invoices/ledger. Wire into ⌘K UI.

### 3D — Final QA — 30 min
Click every sidebar link, verify pages, both themes, mobile, all tests pass, browser + WhatsApp e2e.

## After Phase 22 → Phase 23 (PHP migration, 6-8 weeks)

Plan locked in `§ PHP MIGRATION PLAN` below. Don't start until Phase 22 verified complete.

---

# 🐘 PHP MIGRATION PLAN — Phase 23 (Laravel 11, starts after Phase 22 complete)

## Context

Current intern (Saransh) leaves soon. Boss decision: rewrite the entire Node.js backend in PHP so:
1. Future maintenance done by PHP devs (much larger India hire pool)
2. Deploy on cheaper Hostinger Premium / Business shared hosting (₹150-300/mo) instead of VPS (₹500-800/mo)
3. Easier handover — boss is more familiar with PHP ecosystem

**Framework decision (LOCKED 2026-05-27): Laravel 11 LTS.** Reasons over Slim 4:
- Built-in Queue / Scheduler / Cache / Mail / Validation / Eloquent — saves ~2 weeks of plumbing
- Bigger India hire pool (Laravel devs ≫ Slim devs)
- Boss already knows Laravel ecosystem
- First-class testing + coverage support out of the box
- Hostinger shared hosting officially supports Laravel

**Critical:** Frontend (HTML/CSS/JS) stays UNCHANGED. Only backend (`server.js` + `helpers/*.js` + 26 helper modules) gets ported.

## Feature Parity Matrix — what stays same, what changes

### ✅ 100% identical features (no changes whatsoever)

| Feature | Node.js dependency | Laravel 11 equivalent |
|---------|---------------------|----------------|
| All HTML/CSS/JS frontend | static files | UNCHANGED — copy into `public/` as-is |
| Web dashboard + 4 drill-down pages | Express routes returning JSON | Laravel `Route::get()` returning `response()->json()` with same shape |
| Apple-grade KPI cards, charts, drill-down modal | Chart.js (client-side) | UNCHANGED — same Chart.js |
| Sidebar nav + topbar + greeting + status dot | DOM-only | UNCHANGED |
| Multi-tenant phone-based auth | localStorage + `/api/dashboard` validation | Same pattern; Laravel `auth.phone` middleware optional |
| AI tenant query routing (intent → SQL → exec → format) | OpenAI gpt-4o-mini via `openai` lib | `openai-php/laravel` (auto-bound from .env) |
| SQL safety validator | regex | Same regex in `App\Services\Tenant\SqlSafety` |
| Supabase queries | `@supabase/supabase-js` (PostgREST) | **Direct Postgres** via Laravel `pgsql` driver — bypasses PostgREST |
| Google Sheets sync (Tally → DB) | `googleapis` | `google/apiclient` |
| Google Calendar OAuth + booking | `googleapis` | Same SDK, PHP version |
| Multi-turn calendar booking ("buk meeing", "coming wed") | in-memory `pendingCalendar` Map | DB-backed `pending_calendar` table |
| Pending ledger reply state | in-memory `pendingLedgers` Map | Same DB-backed pattern |
| WhatsApp Business API (send/receive/voice) | axios HTTP | curl HTTP |
| Voice transcription (OpenAI Whisper) | OpenAI HTTP | Same HTTP call |
| Charts via QuickChart | HTTP POST JSON | curl POST JSON |
| PDF generation | `pdfkit` | TCPDF / mPDF |
| CSV export | manual fputcsv-like | PHP built-in `fputcsv()` |
| Email notifications | `nodemailer` + Gmail SMTP app password | PHPMailer + same Gmail SMTP |
| Chart persistence to `public/charts/` | fs.writeFile | PHP `file_put_contents()` |
| Multi-database tenant config | runtime read of `.db_selections.json` | Same |
| Schema drift detection | helper logic | Same logic ported |
| All 117 + 16 = 133 unit tests | node:test | PHPUnit equivalents |
| Drill-down modal (neon line, min/max chips, count-up) | Chart.js plugin | UNCHANGED — frontend only |
| Dark mode + theme toggle | client JS | UNCHANGED |

### ⚠️ 3 features with subtle differences (manageable workarounds)

#### A. Chat AI streaming (typewriter effect)

| Now (Node) | After PHP |
|---|---|
| Chat reply tokens stream live (typewriter cursor effect) | Reply may arrive all-at-once after 2-5s pause |

**Why:** PHP-FPM on shared hosting often buffers output (Apache `mod_deflate`, NGINX FastCGI buffer). Streaming Server-Sent Events (SSE) gets blocked.

**Workarounds (in priority):**
1. Set HTTP headers in PHP: `header('X-Accel-Buffering: no'); header('Content-Type: text/event-stream');` + call `flush()` + `ob_flush()` after each token
2. Add `ini_set('output_buffering', '0')` and `ini_set('zlib.output_compression', '0')` at script start
3. Test on actual Hostinger account — if buffering still occurs, accept all-at-once reply (functionally identical, just less premium UX)

**Decision:** Keep streaming code path. Test on production. Accept degradation if needed (chat content is the same, only the visual typewriter cursor goes away).

#### B. Background reminders + daily-schedule loops (60-second intervals)

| Now (Node setInterval 60s) | Hostinger Premium Cron | Hostinger Business Cron | External cron-job.org |
|---|---|---|---|
| Tenant reminders DB poll → send WhatsApp | Min interval = 15 min ❌ | Min interval = 1 min ✅ | Hits PHP endpoint every 1 min ✅ free |
| Tenant daily schedule sender | Same | Same | Same |

**Why:** Shared hosting cron has plan-tier minimum intervals.

**Solutions in priority:**
1. **Verify Hostinger Business plan** allows 1-min cron at purchase — if yes, use built-in cron, 100% parity
2. **Else** use external https://cron-job.org (free) to call `https://yourdomain.in/cron/reminders.php` every 1 minute — secret token in URL/header for auth
3. **Last resort** accept 15-min granularity — reminders fire 0-15 min late instead of 0-1 min

**Cron jobs needed (whatever provider):**
| Endpoint | Interval | Purpose |
|---|---|---|
| `cron/tenant-sync.php` | 15 min | Pull all tenant Google Sheets → tenant_*_sales / tenant_*_purchases |
| `cron/main-sync.php` | 15 min | Pull MIS Work India sheet → main DB tables (sales, expenses, ledger, etc.) |
| `cron/reminders.php` | 1 min | Check `tenant_reminders` + `reminders` tables, send due WhatsApp messages |
| `cron/daily-schedule.php` | 1 min | Check `tenant_schedules` table for entries with `send_at <= NOW()` |

#### C. WhatsApp webhook response time (cold-start)

| Now (Node always-warm) | PHP-FPM (warm pool) |
|---|---|
| Webhook responds in 50-200ms | First request after idle: 300-800ms; subsequent: 100-300ms |

**Why:** PHP-FPM spawns workers on demand vs Node keeping process always-on.

**Impact:** WhatsApp webhook timeout is 20s. 800ms is fine. NO real-world impact.

**Workaround if needed:** Hostinger has option to keep PHP-FPM workers warm (`pm.min_spare_servers`). Default is fine for typical traffic.

### Verdict

- 95% features: 100% identical
- Streaming chat: minor visual UX downgrade on shared hosting (functional content same)
- 60-sec reminders: choose Business plan OR external cron service for 1:1 parity
- Webhook latency: practically no difference

## File-by-file Migration Map

### Backend files to PORT (Node → PHP)

| Node file | Lines | Role | Laravel target | Effort |
|---|---|---|---|---|
| `server.js` | 8,555 | Main Express app, all routes, middleware | `routes/api.php` + `routes/web.php` + thin controllers under `app/Http/Controllers/` (split by area: Dashboard, Page, Chat, Webhook, Tenant, Auth) | 2 weeks |
| `helpers/dashboard-engine.js` | 650 | Widget catalogue + SQL builder + role detection | `app/Services/DashboardEngine.php` + `config/widgets.php` | 4 days |
| `helpers/page-engine.js` | 526 | 4 drill-down page builders | `app/Services/PageEngine.php` (sales/outstanding/stock/ledger sub-methods) | 3 days |
| `helpers/aging-buckets.js` | 136 | Pure aging fn + top defaulters | `app/Services/AgingBuckets.php` (static methods) | 0.5 day |
| `helpers/tenant-router.js` | ~3,000 | AI intent → SQL → exec → format | `app/Services/Tenant/Router.php` (split into IntentClassifier + SqlBuilder + SqlSafetyValidator + ResponseFormatter sub-services) | 1.5 weeks |
| `helpers/tenant-sync.js` | 163 | Per-tenant Google Sheets sync | `app/Jobs/SyncTenantSheets.php` (queueable) + `app/Services/Tenant/SyncService.php` | 2 days |
| `helpers/tenant-calendar.js` | ~400 | Google Calendar booking ops | `app/Services/Tenant/CalendarService.php` + `app/Http/Controllers/CalendarController.php` | 3 days |
| `helpers/chart-builder.js` | 259 | QuickChart POST + persistence | `app/Services/ChartBuilder.php` | 1 day |
| `helpers/chat-suggestions.js` | 175 | Tenant-aware chip generator | `app/Services/ChatSuggestions.php` + `config/chips.php` | 0.5 day |
| `helpers/whatsapp.js` | ~300 | WhatsApp send/receive/voice | `app/Services/WhatsApp/Client.php` + `app/Http/Controllers/WebhookController.php` | 2 days |
| `helpers/prompt.js` | ~500 | OpenAI prompt templates | `app/Services/AI/PromptBuilder.php` | 1 day |
| `helpers/smart-format.js` | ~600 | Tally-style result formatting | `app/Services/Formatters/SmartFormat.php` | 2 days |
| `helpers/self-heal.js` | ~400 | AI SQL retry on errors | `app/Services/AI/SelfHeal.php` | 2 days |
| `helpers/notifications.js` | ~200 | Email/WhatsApp dispatcher | `app/Services/NotificationDispatcher.php` + Mailables in `app/Mail/` | 1 day |
| `helpers/tenant-pdf.js` | ~250 | PDF generation | `app/Services/Tenant/PdfService.php` + Blade templates in `resources/views/pdf/` | 2 days |
| `helpers/tenant-csv.js` | ~150 | CSV export | `app/Services/Tenant/CsvService.php` (or `Excel::download` for XLSX) | 0.5 day |
| `helpers/utils.js` | 175 | rate-limit + cache + sessions + formatters | Replaced by Laravel built-ins (`RateLimiter`, `Cache`, `Session`, `Number::currency`) | 0.5 day |
| `helpers/anomaly.js` | 88 | z-score outlier detection | `app/Services/AnomalyDetector.php` (static) | 0.25 day |
| `helpers/sync.js` + `sync-xlsx.js` | ~530 | Main MIS-Work-India Google Sheet sync | `app/Jobs/SyncMainSheet.php` | 2 days |
| `helpers/sheets.js` + `sheets-write.js` | ~620 | Google Sheets API wrapper | `app/Services/Google/SheetsClient.php` | 1.5 days |
| `helpers/tenant-tables.js` | 552 | Tenant table classification + creation | `app/Services/Tenant/TablesService.php` | 1 day |
| `helpers/tenant-ledger.js` + `tenant-ledger-pdf.js` | ~480 | Ledger render + PDF | `app/Services/Tenant/LedgerService.php` + Blade PDF | 1 day |
| `helpers/tenant-notifications.js` | ~200 | Tenant notif fanout | `app/Services/Tenant/NotificationsService.php` | 0.5 day |
| `helpers/tenant-chart.js` | ~140 | Tenant chart wrapper around chart-builder | merged into `ChartBuilder.php` | 0.25 day |

### Frontend files — ZERO changes

```
public/dashboard.html      ← copy as-is
public/chat.html           ← copy as-is
public/sales.html          ← copy as-is
public/outstanding.html    ← copy as-is
public/stock.html          ← copy as-is
public/ledger.html         ← copy as-is
public/login.html          ← copy as-is
public/register.html       ← copy as-is
public/index.html          ← copy as-is (legacy chat)
public/assets/css/*.css    ← copy as-is
public/assets/js/app.js    ← copy as-is
public/charts/             ← create dir, ensure write-permission
```

### Tests to port

| Node file | PHP target |
|---|---|
| `tests/unit/aging-buckets.test.js` (16 tests) | `tests/Unit/AgingBucketsTest.php` |
| `tests/unit/tenant-tables.test.js` | `tests/Unit/TenantTablesTest.php` |
| `tests/unit/tenant-router-helpers.test.js` | `tests/Unit/RouterHelpersTest.php` |
| `tests/unit/self-heal.test.js` | `tests/Unit/SelfHealTest.php` |
| `tests/integration/tenant-flow.test.js` | `tests/Integration/TenantFlowTest.php` |

## PHP Stack — LOCKED (Laravel 11)

**Decision (2026-05-27):** Framework = **Laravel 11 LTS** (latest stable, PHP 8.2+ required, supported until ~Mar 2026 / security till Mar 2027 — and easily upgraded to Laravel 12 later). Reasons:
- Boss recognition + huge India hire pool of Laravel devs
- Built-in Queue / Scheduler / Cache / Mail / Eloquent / Tinker → covers ~60% of what we hand-rolled in Node
- First-class testing with PHPUnit + Pest support
- Hostinger Premium / Business plans officially support Laravel out of the box
- Eloquent + Query Builder give us safe SQL with parameter binding (replaces our regex SQL safety validator)

| Component | Recommendation | Reason |
|---|---|---|
| PHP version | **8.2+** (8.3 preferred) | Laravel 11 minimum requirement |
| Framework | **Laravel 11 LTS** | Full-stack, batteries-included, boss-friendly |
| HTTP client | `Illuminate\Support\Facades\Http` (built on Guzzle 7) | Built-in, retries + timeout DSL |
| DB driver | **`pgsql` (native)** via Eloquent + DB facade | Direct Postgres connection — same Supabase DB, no PostgREST hop. Faster + supports `pg_trgm`, custom RPCs, transactions. Supabase service-role connection string. |
| Auth (web) | Laravel built-in session + custom phone-token guard | Same HMAC token pattern in `app/Http/Middleware/ChatAuthGate.php` |
| Queues | `database` driver (or Redis if Hostinger Business has it) | Background WhatsApp sends, chart rendering, email notifications |
| Scheduler | `App\Console\Kernel::schedule()` + Hostinger cron 1-min trigger | Replaces all `setInterval` loops |
| Cache | `database` or `file` driver | Briefing cache, access_control cache, query cache |
| OpenAI client | `openai-php/laravel` (official Laravel wrapper) | Auto-injects API key from `.env`, retry support |
| Google APIs | `google/apiclient` 2.x + thin Service classes | Official, used directly via Container binding |
| WhatsApp | `Http::withToken()` POST/GET to Cloud API | No SDK dependency — fewer breaking changes |
| Charts | `Http::post('https://quickchart.io/chart', ...)` + Storage::put() | 1:1 port of `chart-builder.js` |
| PDF | `barryvdh/laravel-dompdf` (or `spatie/browsershot` if we need more) | Blade templates → PDF, much easier than TCPDF |
| Excel/CSV | `maatwebsite/excel` 3.x | Multi-sheet XLSX, matches our SheetJS frontend output |
| Email | `Mail::send()` + Gmail SMTP (built-in) | No extra dep needed; uses same APP_PASSWORD |
| Validation | `FormRequest` classes | Replaces ad-hoc `if (!phone) return 400` patterns |
| Tests | **PHPUnit 11** (Laravel default) + `pest/pest` optional | Comes pre-wired with `php artisan test` |
| Coverage | PHPUnit `--coverage-html` + `pcov` extension | Same per-file thresholds as Node c8 |
| Logger | `Log::channel('stack')` (Monolog under hood) | Built-in JSON + daily rotation |
| Migrations | `php artisan make:migration` | All `migrations/*.sql` re-expressed as Laravel migration classes |
| Config | `config/*.php` + `.env` (vlucas/phpdotenv built-in) | Cached via `php artisan config:cache` for prod |
| Process manager | `supervisord` for queue worker (NOT needed on shared hosting if using DB driver synchronous) | Optional — only if we move to VPS |

## Suggested Migration Phases — Laravel 11 (6-8 weeks)

| Phase | Duration | Deliverable |
|---|---|---|
| **A. Setup** | 1 wk | `composer create-project laravel/laravel mis-chatbot-php`. Configure `.env` with Supabase Postgres connection (`DB_CONNECTION=pgsql`). Copy `public/` HTML/CSS/JS as-is into Laravel `public/`. Set up routes/web.php to serve static pages. Build `GET /api/dashboard` returning hardcoded JSON consumed by existing `dashboard.html`. Add base middleware (CORS, rate-limit). PHPUnit baseline test green. |
| **B. Models + Migrations** | 1 wk | Generate Eloquent models for: Tenant, TenantTable, AccessControl, MessageLog, WpSession, TenantNotification, TenantCalendar, TenantSchedule, TenantReminder. Port all 8 SQL migrations from `migrations/` into Laravel migration files. `php artisan migrate` runs clean against the same Supabase DB (or a dev clone). |
| **C. Dashboard + Pages** | 2 wks | Port `helpers/dashboard-engine.js` → `app/Services/DashboardEngine.php` (classifyTable, pickColumn, resolveTableColumns, runWidget, WIDGET_CATALOG as PHP array). Port `helpers/page-engine.js` → `app/Services/PageEngine.php` with sales/outstanding/stock/ledger builders. Use DB facade for raw SQL where Eloquent is too heavy (parallel agg queries). All KPIs/charts/drill-downs render with real data. PHPUnit feature tests for `/api/dashboard` + `/api/page/*`. |
| **D. Sync + Cron + Notifications** | 1 wk | Port `helpers/sync.js` + `helpers/tenant-sync.js` to `App\Jobs\SyncTenantSheets` (queueable). Wire Laravel Scheduler in `App\Console\Kernel`: tenant-sync (15 min), main-sync (15 min), reminders (1 min), daily-schedule (1 min), charts-cleanup (daily). Single Hostinger cron entry: `* * * * * php artisan schedule:run`. Notifications drawer endpoints + email Mailables. Charts cleanup as Artisan command. |
| **E. AI Tenant Router + Chat** | 2 wks | Port `helpers/tenant-router.js` → `app/Services/Tenant/Router.php` (the big one — intent classification → SQL gen → safety → exec → format). Port `helpers/prompt.js`, `helpers/smart-format.js`, `helpers/self-heal.js`. Use `openai-php/laravel` for chat completions. Chat streaming via `StreamedResponse` + `flush()` + `X-Accel-Buffering: no` header. WhatsApp webhook controller (verify HMAC) + queue voice transcription job. |
| **F. Calendar + Booking** | 1 wk | Port `helpers/tenant-calendar.js` → `app/Services/Tenant/Calendar.php`. Google OAuth flow via `google/apiclient`. Multi-turn pending-state moved from in-memory Map → `tenant_pending_state` table or Cache::store('database'). Conflict detection + reschedule + cancel endpoints. |
| **G. PDF/CSV/Excel + QA** | 1 wk | Port `helpers/tenant-pdf.js`, `helpers/tenant-ledger-pdf.js`, `helpers/tenant-csv.js` using `barryvdh/laravel-dompdf` + `maatwebsite/excel`. Final XLSX export endpoints. Full PHPUnit + browser smoke + WhatsApp e2e + production deploy on Hostinger. Coverage report ≥ 70%. |

### Laravel-specific architecture decisions (locked)

- **One-to-one mapping:** Each Node helper module → one PHP Service class under `app/Services/`. Each `helpers/X.js` exports = `App\Services\X` class methods.
- **Routes split by area:** `routes/api.php` for JSON endpoints, `routes/web.php` for static pages (login, register, dashboard, chat, etc).
- **Controllers thin, Services fat:** Controllers parse FormRequest + delegate to Service + return JsonResponse. Business logic stays in Services so it's directly unit-testable without HTTP layer.
- **Direct Postgres (not PostgREST):** Use Laravel's `pgsql` driver pointing at Supabase's connection pooler. Bypass PostgREST entirely. Use `DB::select()` for read-heavy parallel queries, Eloquent for CRUD on a few tables (tenants, sessions, notifications).
- **Pending state in DB, not memory:** Replace Node's `pendingCalendar` Map / `pendingLedgers` Map / `tenantPhoneCache` Map with Laravel `Cache::store('database')` keyed by phone. Survives PHP-FPM restarts and stateless requests.
- **Async parallelism via `Http::pool()`:** Where Node uses `Promise.all([...])` for parallel Supabase calls, use Laravel's HTTP pool. For DB queries, Postgres handles concurrency natively — issue queries from a single connection in sequence (still fast on local connection pool).
- **Validation in FormRequest classes:** `IssueChatTokenRequest`, `WebhookRequest`, `SearchRequest` etc. — replaces ad-hoc `if (!phone) return 400`.
- **Middleware for auth/rate-limit:** `ChatAuthGate`, `WebhookHmac`, `RateLimit` (built-in `throttle:` middleware).
- **Config-driven catalogues:** `WIDGET_CATALOG`, `CHIP_CATALOG`, `REPORT_CATALOG` move to `config/widgets.php` / `config/chips.php` / `config/reports.php` so they can be overridden per-environment without code changes.
- **Tests:** PHPUnit feature tests use `RefreshDatabase` trait against a sqlite memory DB (faster than Postgres for unit-feature tests). Service-layer unit tests don't need DB at all.

## Critical Gotchas (Laravel-specific)

1. **Pending state — use Cache::store('database') not Maps.** Replace `pendingCalendar`, `pendingLedgers`, `tenantPhoneCache` with `Cache::put("pending.calendar.$phone", $data, now()->addMinutes(15))`. PHP-FPM is stateless across requests. Sessions work too but Cache is cleaner for non-user-keyed state.

2. **OpenAI streaming** — Use Laravel's `StreamedResponse` with `Cache-Control: no-cache` + `X-Accel-Buffering: no` + `Content-Type: text/event-stream` headers. Inside the callback: `flush()` + `ob_flush()` after each chunk. Test on Hostinger first — if buffering is stubborn, fall back to non-streaming (acceptable UX degradation).

3. **Async parallelism** — Many places use `Promise.all()` for parallel Supabase queries (e.g., `buildSalesPage` runs 7 queries in parallel). In Laravel:
   - DB queries → run sequentially against pg connection (Postgres has fast local connection, sequential is fine; or use `DB::transaction` callbacks)
   - HTTP calls → use `Http::pool(fn ($p) => [$p->get(...), $p->get(...)])` for true concurrency
   - **Don't blindly translate** `Promise.all` to sequential PHP — that's where 5-10x slowdowns sneak in.

4. **Closures in WIDGET_CATALOG** — Lots of `(opts) => ...` arrow functions. PHP closures work but verbose. Prefer:
   - Move catalogue to `config/widgets.php` as static array of class-strings: `['runner' => SalesKpiRunner::class]`
   - Each runner is a class with `__invoke($supabase, $tenantId, $opts)` method
   - Easier to test individually; container-resolvable.

5. **Type strictness** — PHP 8 with `declare(strict_types=1)` rejects implicit string→number coercion. Wrap inputs: `(float) $row['amount']`, `(int) $opts['limit']`. Apply `JSON_THROW_ON_ERROR` flag on every `json_encode` / `json_decode`.

6. **Eloquent vs raw SQL** — Don't ORM everything. Tenant tables are dynamic (`tenant_xxxxxxxx_sales`) — Eloquent models don't fit. Use `DB::table($pgTable)->get()` or `DB::select($sql)` for those. Reserve Eloquent for fixed schema tables (tenants, sessions, notifications).

7. **Migrations conflict with existing data** — Supabase already has all tables from `migrations/001-008.sql`. When porting:
   - Option A: Generate matching Laravel migrations and run `php artisan migrate --pretend` to verify they'd be no-op against current schema
   - Option B (recommended): Mark them as already-run via `migrations` table seed, then only add NEW migrations going forward. Avoids drift.

8. **CRON minimum interval — Hostinger Premium = 15 min.** Single `* * * * * php artisan schedule:run` cron entry in hPanel handles ALL recurring jobs at correct frequencies (Laravel's scheduler decides per-task). If on Premium plan with 15-min minimum, the 1-min reminders WILL fire late. Solutions:
   - Hostinger Business plan (1-min cron) — recommended
   - cron-job.org free service hits `/cron-trigger` endpoint every 1 min
   - Accept 15-min lag (functionally OK)

9. **WhatsApp webhook secret** — Same `WEBHOOK_SECRET` env var. Verify HMAC in middleware:
   ```php
   $expected = hash_hmac('sha256', $request->getContent(), config('services.whatsapp.webhook_secret'));
   if (!hash_equals('sha256='.$expected, $request->header('X-Hub-Signature-256'))) abort(403);
   ```

10. **Service account JSON file** — Place `logical-craft-438704-n8-d0d8ae886a53.json` in `storage/app/credentials/` (NOT public). Reference via `storage_path('app/credentials/google-sa.json')`.

11. **Hostinger storage permissions** — Laravel needs writable `storage/` and `bootstrap/cache/`. On shared hosting set `chmod -R 775 storage bootstrap/cache`. If still fails, use `chmod -R 777` (shared host workaround).

12. **No long-running processes** — Even non-cron PHP scripts have `max_execution_time` (30s typically, sometimes 60s). Heavy chart batches must run via queue: `dispatch(new RenderChartJob(...))->onQueue('charts')`.

13. **`.htaccess` for routing** — Laravel ships with one in `public/.htaccess`. On shared Apache, point the domain document root at `public_html/laravel-app/public/` directly. Or symlink `public_html/index.php` → `laravel-app/public/index.php`.

14. **CORS** — Laravel 11 has built-in CORS via `config/cors.php`. Set `'allowed_origins' => env('CORS_ORIGINS')` parsed by comma. Replaces our manual `corsOrigins` Set.

15. **Multi-tenant table naming** — Regex `^tenant_[a-f0-9]{8}_(sales|purchases|...)$` stays identical. Use `Schema::hasTable($name)` to check existence before querying.

16. **Date column quirks** — `c_date` is text (`DD-Mon-YY`), `c_date_actual` is parsed `DATE`. dashboard-engine prefers `_actual` suffix. Same preference in `App\Services\DashboardEngine::pickDateColumn()`.

17. **Eloquent's `created_at` / `updated_at`** — Many existing tables don't have these columns or use different names. On models, set `public $timestamps = false;` to disable.

18. **Supabase service role key** — The "DB_PASSWORD" used for direct Postgres connection is the database password (visible in Supabase Dashboard → Settings → Database). Different from `SUPABASE_SERVICE_KEY` (JWT for PostgREST). We're bypassing PostgREST so we use the DB password.

19. **Charts URL signing** — QuickChart.io is the same. Chart paths stored in `public/charts/` need to be served via Laravel's `Storage::disk('public')` or symlink.

20. **WhatsApp Business API Cloud** — No SDK needed. Use `Http::withToken(env('WA_ACCESS_TOKEN'))->post(...)` — exactly mirrors current `axios` calls.

## Environment Variables (carry over to PHP `.env`)

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
OPENAI_API_KEY=...
WA_ACCESS_TOKEN=...
WA_PHONE_ID=...
WA_VERIFY_TOKEN=...
GMAIL_APP_PASSWORD=...
WEBHOOK_SECRET=...
ADMIN_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
PORT=80                              # Apache default; not 3000
PUBLIC_BASE_URL=https://yourdomain.in
```

Plus copy `logical-craft-438704-n8-d0d8ae886a53.json` (Google service account) to a non-public path.

## Hostinger-specific Setup Notes

1. **Plan choice:**
   - **Premium Web Hosting** (~₹150/mo) — minimum requirement. Cron min 15 min.
   - **Business Web Hosting** (~₹250-300/mo) — recommended. Cron 1 min, more PHP RAM/exec time.
2. **Free domain** included with annual plan (e.g. `mistally.in`)
3. **PHP version select** — In hPanel → Advanced → PHP Configuration. Choose 8.2 or higher.
4. **Cron jobs** — hPanel → Advanced → Cron Jobs. Add 4 jobs as listed above.
5. **`.env`** — Place outside `public_html/` (e.g. `/home/u123/.env`). Reference via absolute path in PHP.
6. **SSL** — Free Let's Encrypt SSL via hPanel → Security → SSL.
7. **WhatsApp webhook URL update** — wa.apimis.in dashboard → set to `https://yourdomain.in/whatsapp.php` (or whatever route).

## Handover Checklist (intern before leaving)

- [ ] This roadmap is up-to-date (✅ done)
- [ ] All env vars documented above
- [ ] All `.env`, JSON keys, `.db_selections.json`, `access_control.json` paths documented
- [ ] Tenant table schema documented (tables_metadata column, role classification)
- [ ] WhatsApp webhook URL + secret documented
- [ ] Google OAuth redirect URI list documented (will need update for new domain)
- [ ] Sample tenant test phone numbers + tenant IDs (MIS-2 = `ec50657e-23d4-456e-8f3c-e7209f1e9055` phone `918750285420`; kaizen = `17bd5b02-03ef-4a59-932f-ebe8defa75b6` phone `919999408444`)
- [ ] Sample test queries that exercise each AI route
- [ ] Sample WhatsApp messages for end-to-end test
- [x] Fake data cleanup SQL ready (DECISION OVERRIDDEN 2026-05-27 — fake data stays as production)
- [ ] List of OpenAI API costs / limits (rate-limit aware)

## What to do FIRST when starting Phase 23 (Laravel)

1. **Confirm PHP 8.2+** locally: `php -v` should show 8.2 or 8.3.
2. **Install Composer** if not already: `brew install composer` (macOS) or download from getcomposer.org.
3. **Init project:**
   ```bash
   composer create-project laravel/laravel mis-chatbot-php "^11.0"
   cd mis-chatbot-php
   php artisan --version   # should print "Laravel Framework 11.x.x"
   ```
4. **Configure DB** in `.env` to point at Supabase Postgres (not PostgREST):
   ```
   DB_CONNECTION=pgsql
   DB_HOST=aws-0-ap-south-1.pooler.supabase.com
   DB_PORT=6543
   DB_DATABASE=postgres
   DB_USERNAME=postgres.<project-ref>
   DB_PASSWORD=<service-role-or-db-password>
   ```
5. **Copy frontend wholesale:**
   ```bash
   cp -R ../mis-chatbot/public/. public/
   ```
   Verify pages load via `php artisan serve` → http://localhost:8000/dashboard.html.
6. **Add core deps:**
   ```bash
   composer require openai-php/laravel google/apiclient barryvdh/laravel-dompdf maatwebsite/excel
   ```
7. **First endpoint stub** — `routes/api.php`:
   ```php
   Route::get('/dashboard', function (Request $req) {
       return response()->json([
           'tenant' => ['name' => 'MIS-2'],
           'widgets' => [
               ['kind' => 'kpi', 'id' => 'total_sales', 'data' => ['value' => 12345678]],
           ],
       ]);
   });
   ```
   Hit it: `curl http://localhost:8000/api/dashboard?phone=918750285420` → JSON. Verify dashboard.html renders KPI.
8. **Then proceed Phase A → Phase G** per timeline above.

**Mantra during port:** *"Laravel handles X — don't reinvent."* Examples:
- Rate limiting → `Route::middleware('throttle:60,1')` instead of custom Map
- HMAC → use `hash_hmac('sha256', $payload, $secret)` directly + middleware
- HTTP retries → `Http::retry(3, 100)->post(...)` instead of try/catch loops
- Caching → `Cache::remember('briefing.'.$tenantId, 3600, fn() => buildBriefing())` instead of manual TTL Maps
- Queues → `dispatch(new SyncTenantJob($id))` instead of `setImmediate`

---

# 📚 NODE.JS REFERENCE — DON'T DELETE (read-only archive)

Below is the full Node.js implementation history. Use as reference while porting to PHP.

---

### ✅ JUST COMPLETED — Sprint 4 Drill-Down Pages (2026-05-26 evening, ~1.5 hr)

**Status:** 🟢 LIVE (2026-05-26 17:00 IST). All 133 unit tests pass. Browser-verified end-to-end light + dark themes.

#### What got built

| File | Lines | Role |
|------|-------|------|
| `helpers/aging-buckets.js` | 136 | Pure fn: `bucketOf`, `computeAging`, `topDefaulters` |
| `helpers/page-engine.js` | 526 | Dispatcher + 4 page builders (sales/outstanding/stock/ledger), with tax-line filter, weighted-avg price for stock, separate aggregate queries for accurate ledger totals |
| `public/sales.html` | 372 | KPIs + Trend + Top Parties donut + Top Items + By City + paginated invoices + party search |
| `public/outstanding.html` | 267 | Aging-bucket KPIs + Aging chart + Trend + Top defaulters table with bucket distribution |
| `public/stock.html` | 237 | Stock value KPIs + Top items by value + Slow-moving + items table with status badges |
| `public/ledger.html` | 251 | Party search + balance card + transaction timeline + clickable parties summary |
| `tests/unit/aging-buckets.test.js` | 186 | 16 new unit tests (133 total) |
| `server.js` | (+93) | 4 new `/api/page/*` endpoints + 4 page routes with no-store cache headers + shared `resolveTenantIdFromPhone` helper |
| `public/assets/css/app.css` | (+3) | `.page-header` block for consistent heading spacing |
| `public/dashboard.html` + `public/chat.html` | (small) | Sidebar nav: 4 `href="#"` → real routes |

#### Bugs fixed during Sprint 4

1. **Stock value = ₹1.43 lakh CRORE** (bogus) — `cols.price` doesn't exist in column resolver, code fell back to `cols.amount` (line total) and averaged → wildly inflated. **Fix:** Derive avg unit price as `SUM(amount) / SUM(qty)` per item. Plus floor stock value at ≥0 (negative balance = over-sold, not negative inventory worth).

2. **Tax lines polluting stock report** — "Output IGST 18%", "Input CGST", "Rounded Off" appearing as inventory items. **Fix:** SQL filter `AND item NOT ILIKE '%cgst%' AND item NOT ILIKE '%sgst%' AND item NOT ILIKE '%igst%' AND item NOT ILIKE '%cess%' AND item NOT ILIKE '%round%' AND item NOT ILIKE '%discount%'` on both purch_agg and sales_agg CTEs.

3. **Ledger SQL truncation** (silent data corruption) — Earlier version used `LIMIT 200` on transaction fetch and computed totals from limited rows. For high-volume parties (250+ transactions) this **silently truncated balances**. **Fix:** Run separate aggregate `SUM + COUNT` queries (no LIMIT) for accurate totals; use `LIMIT 100` only for timeline display rows.

4. **Layout broken on all 4 pages** — Right ~70% of viewport empty black space. **Root cause:** my pages had `<header class="topbar">` as SIBLING of `<main>` inside `<div class="app-shell">` (CSS grid with `var(--sidebar-w) 1fr`). Auto-flow placed header in column 2 and pushed main to row 2 column 1 (under sidebar). **Fix:** Move `<header>` INSIDE `<main>` matching dashboard.html's pattern.

5. **`.page-header` class missing in CSS** — All 4 pages used `<div class="page-header">` but the class wasn't styled. **Fix:** Added 3 rules to global `app.css`: `.page-header { margin: 0 0 22px; }` etc.

#### Verification (all green)

- ✅ HTTP: all 4 page routes + 4 API endpoints serve 200 with substantial payload
- ✅ JS parse-check: all 4 page bundles clean
- ✅ 133/133 unit tests pass (~240 ms)
- ✅ Sidebar wiring confirmed
- ✅ PM2 error log empty
- ✅ Live data: SALES (₹37 Cr, 999 invoices), OUTSTANDING (₹19 Cr, 1136 unpaid, true 258 count for DIVYA), STOCK (₹11.15 Cr, 52 SKUs), LEDGER (50 parties summary, accurate per-party totals)

---

### ✅ EARLIER COMPLETED — Phase 21 — Chart Pipeline Hardening (2026-05-26 afternoon, ~1.5 hr)

**Status:** 🟢 LIVE (2026-05-26 16:10 IST). All 117 unit tests pass. Browser-verified end-to-end on both Safari + Chrome, light + dark themes.

**Trigger:** User reported drill-down chart line + waves invisible, marker chips at chart bottom (not at peaks), and dark-mode legend labels showing as black-on-black. Investigation revealed a chain of subtle Chart.js v4 + Safari rendering bugs that compounded to break the entire chart pipeline.

#### Bug catalogue + fixes

| # | Symptom | Root cause | Fix |
|---|---------|------------|-----|
| **1** | Drill-down line + area gradient invisible despite chart layout completing (markers positioned, axis ticks rendered) | `glowLinePlugin.afterDatasetDraw` always called `ctx.restore()` even when `beforeDatasetDraw` skipped `save()` for `glow:false` datasets. Each render leaked one `restore()` → popped Chart.js's own internal `save()` (used to push the chart-area clip rect) → next dataset's draw clipped to a corrupted region → silent zero-area render | Mirror the skip-condition in `afterDatasetDraw` so save/restore are perfectly balanced per dataset |
| **2** | Min/Max marker chips pinned to chart bottom instead of actual peaks | `requestAnimationFrame` callback fired ~16 ms after chart creation — well before the 1100 ms Y-axis animation finished. At that moment, `meta.data[i].y` was still at `chartArea.bottom` (Chart.js's animation start state) | Replace `requestAnimationFrame` with `chart.options.animation.onComplete` callback. Add `setTimeout(1200)` backup in case `onComplete` doesn't fire (tab backgrounded, GPU throttle) |
| **3** | After rapid KPI switching, marker chips showed previous KPI's values (e.g. opening Total Sales showed Invoices' "36" / "1") | Closure leak — destroyed chart's `onComplete` still queued in event loop, fired with stale `sp` after new chart was created | (a) Capture `chartHandle = drillChart` after construction; (b) inside `onComplete`, skip if `drillChart !== chartHandle`; (c) defensively reset `textContent` on marker open |
| **4** | Browser served stale JS even after `Cmd+Shift+R` and private window | Express's default `express.static` returned `Cache-Control: public, max-age=0` which still allowed in-memory page caching | New `setHeaders` middleware on `app.use(express.static)` for `.js`/`.css`/`.html`: `Cache-Control: no-store, no-cache, must-revalidate` + `Pragma: no-cache` + `Expires: 0`. Also `etag: false`. Same headers explicitly on `/dashboard` route |
| **5** | Chart.js v4 + Safari throwing `TypeError: No default value` at `app.js:73` (`Number(n)` line) | Chart.js v4 occasionally passes objects (animation state, scale tick wrappers) to formatter callbacks. In Safari, `Number(obj)` whose `valueOf`/`toString` returns non-primitive throws this error. The error halted axis layout → cascading render failure | New `_toFiniteNumber(n)` helper in `App.fmt`: handles `null`/`undefined`/`Symbol`/object inputs gracefully, wraps `Number()` in `try/catch`. Both `App.fmt.inr` and `App.fmt.num` rebuilt on top |
| **6** | `TypeError: fmt is not a function. 'fmt' is "—"` at `dashboard.html:1113` (barEndLabel plugin) | **Chart.js v4 scriptable-options system** treats any function under `chart.options.plugins.<id>.<key>` as a SCRIPTABLE option. It calls the function once during config-resolve with a Chart.js context object as argument and STORES THE RESULT back as the option value. Our `formatter: (v) => tooltipFmt(v)` got called with `(context_object)` → `tooltipFmt(obj)` → `MIS.fmt.inr(obj)` → `"—"`. Plugin then read `opts.formatter === "—"` (truthy) → `||` fallback skipped → `fmt(v)` threw "fmt is not a function" → render pipeline halted | **DON'T pass functions in plugin opts.** Pass `format: 'inr'` STRING. Plugin derives the formatter from the string at render time: `opts.format === 'inr' ? MIS.fmt.inr : MIS.fmt.num`. Applied to both `barEndLabel` and `donutCenter` plugins |
| **7** | Donut/bar showed raw numbers (`66825596.8`, `161948339.48000002`) instead of `₹6.68 Cr` / `₹16.19 Cr` | Symptom of #6 — defensive `String(v)` fallback was being used | Resolved by #6 |
| **8** | Dark-mode legend labels rendered as ~black on near-black background — completely unreadable | `getThemeColors().tick` returned `#A1A1A6` in dark mode (~6:1 contrast on `#0A0A0A`, technically AA but felt washed-out next to vibrant legend dots). Plus suspicion that `Chart.defaults.color` (built-in `#666`) was overriding our config in some render paths | (a) Bumped dark-mode `tick` to `#F5F5F7` (Apple primary white, ~14:1 contrast); (b) Added `applyChartDefaults()` that sets `Chart.defaults.color` per-theme at boot AND on theme toggle (via MutationObserver on `<html data-theme>`); (c) Added explicit per-item `fontColor: labelColor` inside `generateLabels` — re-reads the current theme at call-time so mid-session theme toggle paints with the right colour. Also bumped legend font from `11.5px / 500` to `12.5px / 600` for stronger visual prominence |
| **9** | Donut legend + bar Y-axis labels truncated at 20 chars showing "Bharat Heavy Electr…", "Insulators & Electr…" etc. | Aggressive defensive truncation | Donut legend bumped to **32 chars** (fits "Bharat Heavy Electricals Limited" = 32, "Insulators & Electricals Company" = 32 fully; only 40+ char names like "AESTHETIC PRINTING AND BRUSHES PRIVATE LIMITED" still ellipsised). Bar Y-axis bumped to **28 chars** (slightly less due to narrower side panel) |

#### Files modified

| File | Change |
|------|--------|
| `public/dashboard.html` | (a) `glowLinePlugin.afterDatasetDraw` now mirrors skip-condition. (b) Drill-down chart `animation.onComplete` callback + `setTimeout(1200)` backup. (c) `chartHandle` closure-leak guard. (d) Defensive marker text reset on `openDrillDown` open. (e) `applyChartDefaults()` + MutationObserver for theme-aware Chart.defaults.color. (f) Donut/bar plugin opts switched from `formatter: fn` to `format: 'inr'/'num'` string. (g) Plugin internals derive formatter from format string. (h) Per-item `fontColor` in `generateLabels`. (i) Truncation bumps (20 → 32 donut, 20 → 28 bar). (j) `tickColor` and `getThemeColors().tick` bumped to `#F5F5F7` in dark mode. (k) Legend font bumped to 12.5px / weight 600 |
| `public/assets/js/app.js` | New `_toFiniteNumber(n)` helper. `App.fmt.inr` and `App.fmt.num` rebuilt to handle `Symbol`/object/`undefined` inputs without throwing |
| `server.js` | `/dashboard` route: `Cache-Control: no-store` + `Pragma: no-cache` + `Expires: 0`. `express.static` middleware: same headers on `.js`/`.css`/`.html` via `setHeaders`, `etag: false`, `lastModified: true` |

#### Verification (all green at 16:10 IST)

| # | Check | Result |
|---|-------|--------|
| 1 | HTTP sanity (`/health`, `/dashboard`, `/chat`, `/chat-legacy`, `/assets/css/app.css`, `/assets/js/app.js`) | ✅ all 200 |
| 2 | JS parse-check (dashboard inline ~50 KB + app.js ~5 KB) | ✅ both valid |
| 3 | Cache-Control: no-store on HTML/JS/CSS | ✅ verified |
| 4 | API data populated for `today`/`week`/`month` ranges | ✅ today: ₹2.22 Cr, 33 invoices; week: ₹12.90 Cr, 7/7 nz days; month: ₹25.59 Cr, 30/30 nz days |
| 5 | All 117 unit tests | ✅ pass in ~240 ms |
| 6 | All 9 fixes shipping in served file (greppable) | ✅ glowLine balanced (1×), positionMinMaxMarkers refs (4×), chartHandle (7×), no-store rules (3×), `_toFiniteNumber` (3×), `opts.format === 'inr'` lookups (2×), `#F5F5F7` (6×), `applyChartDefaults` (2×), `MutationObserver` (1×) |
| 7 | Browser smoke test (Safari + Chrome, light + dark) | ✅ user-verified end-to-end |
| 8 | PM2 error log | ✅ empty |

#### Cleanup TODO — DECISION OVERRIDDEN (2026-05-27)

**User decision (final):** Fake data **stays as-is.** Treat as production data. No cleanup script needed. Do not raise this in future sessions.

The 195 SALES + 123 PURCHASES rows continue to populate the dashboard. Voucher continuation `277/2026-27` to `471/2026-27` (sales) and `SRH/26-27/1340` to `SRH/26-27/1462` (purchases) are accepted as part of the dataset.

If ever needed in the future, the generation script is at `scripts/inject-fake-data.js`. No removal procedure is required.

#### Architectural lessons logged

1. **Chart.js v4 plugin options are scriptable by default.** Never pass functions under `chart.options.plugins.<id>.<key>`. Use config strings (`format: 'inr'`) or instance properties (`chart.$customFormatters`).
2. **Canvas state stack must be perfectly balanced.** Custom `before*Draw`/`after*Draw` hooks that conditionally `save()` MUST conditionally `restore()` with the SAME predicate.
3. **Animation timing matters.** `requestAnimationFrame` is too early for chart-coordinate-dependent positioning; use `animation.onComplete` or `setTimeout(animationDuration + 100)`.
4. **Closures leak across rapid lifecycles.** When destroying-and-recreating a globally-tracked instance, queued callbacks may fire after the new instance is already in place. Always include an instance-identity guard.
5. **Safari's `Number()` is stricter than V8's.** Wrap any `Number(unknownInput)` in `try/catch` for browser portability.
6. **Default Express static caching is too aggressive for dev iterations.** Add `setHeaders` cache-busting for HTML/JS/CSS in `app.use(express.static)`.

---

### ✅ EARLIER COMPLETED — Phase 20 Sprint 3 + Polish Pass + Visual Consistency

**Status:** 🟢 LIVE (2026-05-26 13:14 IST). All 117 unit tests pass. Browser-verified end-to-end.

**Sprint 3 core (already shipped morning of 26 May):**
- ✅ NEW `public/chat.html` (~899 lines) — premium chat in same Apple `app-shell` (sidebar + topbar + main)
- ✅ NEW `public/assets/css/chat.css` (~733 lines + 180 polish lines = 913 lines) — bubble system, composer, mic ring + waveform, slide-over spring, typing dots, typewriter cursor, lightbox
- ✅ NEW `helpers/chat-suggestions.js` (175 lines) — pure tenant-aware chip generator with round-robin variety
- ✅ NEW `GET /api/chat-suggestions?phone=...&limit=6` endpoint (server.js, after /api/dashboard)
- ✅ MODIFIED server.js routes: `/chat` → new `chat.html`, `/chat-legacy` → old `index.html` (rollback safety net)

**Sprint 3 critical bug fix (mid-day):**
- 🐛 First load showed broken topbar — used non-existent `.tb-greeting` / `.tb-sub` / `.avatar-circle` classes
- ✅ Rewrote topbar HTML to match dashboard pattern exactly: `.greeting > .who + .when` + `.avatar`
- ✅ Added `.mobile-toggle { display: none }` rule (was showing ≡ icon on desktop)
- ✅ Added inline page-local styles matching dashboard.html's pattern

**Polish Pass (after Sprint 3 stable):**

| # | Polish | Implementation | Visual impact |
|---|---|---|---|
| 1 | Money pill | `polishBubble()` regex wraps `₹X.XX(.YY)?(Cr|L|K)?` in `<span class="money">`. `big` modifier on Cr/L → emerald gradient. CSS: mono font, soft cyan pill | Every ₹ value pops |
| 2 | Result-card detection | Bot bubbles whose `textContent` matches `/results:|Total across/i` get `.result-card` class → violet→fuchsia gradient + 3-color edge | List replies look premium |
| 3 | Cycling placeholder | `setInterval(3500)` reads chip prompts from `chipsRow`, fades placeholder (`@keyframes phFadeIn`) when input empty + unfocused. Resets on focus/blur | Subtle, very premium |
| 4 | Bubble polish | radius 18→22 (more iOS), padding 11/16 → 13/18, AI bubble subtle gradient (top-light→bottom-soft), hover lift -1px, user bubble cyan glow shadow | Higher density premium feel |
| 5 | Scroll-to-bottom FAB | Frosted glass button (bottom-right), bob animation 3.6s, listens to `chatStream.scroll`, shows when >120px scrolled up. Wraps `addMessage` to count missed assistant messages → red badge with count | Telegram-style live indicator |
| 6 | Date dividers | `dayLabel(ts)` computes Today/Yesterday/Weekday/Date label. `addDateDivider()` injects between message groups during history load. Dedupes consecutive same-day labels | Conversation rhythm clear |

**Topbar greeting redesign — chat-app-style premium header (chat.html + dashboard.html):**

| Element | Before | After |
|---|---|---|
| Layout | Flat heading + subtitle ("Good afternoon, MIS-2" / "Ask anything...") | Chat-app pattern: small gradient avatar + bold name + 🟢 pulsing dot + live status subtitle |
| Avatar | None | 30×30 rounded-square 8px gradient (cyan→violet→fuchsia), hover scale+rotate, soft glow shadow |
| Primary text | Generic "Good afternoon, X" 22px | Tenant name "MIS-2" 16px weight 600 + emerald pulsing dot (`@keyframes dotPulse` 2.4s expanding ring) |
| Subtitle | Static "Ask anything about your data" | **Live ticking** — "Good afternoon · just synced" (chat) / "Tuesday, 26 May 2026 · just synced" (dashboard) → updates every 30s ("synced 1m ago" → "synced 2m ago"...). Resets on sync success |
| Lucide icon for sync click | Just spins | Resets `lastSyncAt` → "just synced" wraps around |

**Sidebar↔topbar alignment fix (app.css):**

Root cause: `.sidebar { padding: 22px 16px 18px }` was pushing brand block 22px below topbar's Y=0.

| Selector | Before | After |
|---|---|---|
| `.sidebar` | `padding: 22px 16px 18px` | `padding: 0 16px 18px` (zero top — sidebar-brand handles its own height) |
| `.sidebar-brand` | `padding: 4px 10px 18px` (auto height) | `height: var(--topbar-h)` (68px) + `padding: 0 10px` (horizontal only — height now controls vertical centering) |

Result: sidebar brand block AND topbar greeting block share the same Y-axis exactly (both 68px tall, both `align-items: center`).

**Sidebar brand size matching (chat.html + dashboard.html inline CSS):**

Topbar avatar + greeting now visually identical-sized to sidebar's "MIS / Make It Simple" block:

| Spec | Sidebar logo | Topbar avatar | Match? |
|---|---|---|---|
| Size | 30×30 px | 30×30 px (was 38×38) | ✅ |
| Border-radius | 8px | 8px (was 50%) | ✅ |
| Gradient | brand cyan (`primary-400→600`) | cyan→violet→fuchsia (still distinct identity) | ✅ size match, distinct character |
| Primary text | `MIS` 16px / weight 600 | `MIS-2` 16px / weight 600 (was 15.5/700) | ✅ |
| Subtitle | `Make It Simple` 11px tertiary | `Tuesday, 26 May... · synced` 11px tertiary (was 11.5) | ✅ |
| Gap | 10px | 10px | ✅ |
| Vertical centre | Y=34px (mid of 68px brand block) | Y=34px (mid of 68px topbar) | ✅ now exact |

**Charts overhaul (helpers/dashboard-engine.js + dashboard.html):**

Root cause #1: KPI drill-down + main "Sales Trend" line charts had wild peaks because `tension: 0.36` Catmull-Rom-style spline was overshooting between zero days and high days.

Root cause #2: Sparkline returned only `[number, number, ...]` — no date context. Labels rendered as "Day 1, Day 2, ..." which was useless.

Root cause #3: Days with no data were skipped by the SQL `GROUP BY day` — leading to a misleading line that connected non-adjacent days as if continuous.

| Layer | Fix |
|---|---|
| Engine (`runWidget`) | Sparkline now zero-pads every day in `dr.from..dr.to` range. Returns `sparkline` + parallel `sparkline_dates` arrays of equal length. 400-day safety cap to prevent runaway loops. Backward-compat fallback for `range=all` (no dr) |
| Drill-down chart | `cubicInterpolationMode: 'monotone'` (Chart.js v4 magic) — the curve is constrained to never go above/below adjacent points → kills wild peaks entirely. `tension: 0.25` (gentler). `beginAtZero: true` (no fake floor). `autoSkip: true, maxTicksLimit: 8` for X-axis (~8 evenly-spaced labels regardless of point count). Real date labels formatted as "26 May" via `toLocaleDateString('en-IN', {day:'numeric', month:'short'})`. Premium tooltip — dark frosted (`rgba(28,28,30,0.94)`), mono font value, `mode: 'index'` so hover anywhere highlights nearest point. 3-stop gradient fill (color55 → color22 → transparent) for richer area. Theme-aware tick + grid colours |
| Main dashboard line chart (Sales/Purchases Trend) | Same `cubicInterpolationMode: 'monotone'` + tension 0.25 + beginAtZero + autoSkip(8) treatment in `baseOpts` + line-chart dataset. X-axis tick callback also auto-formats ISO date strings (`YYYY-MM-DD`) to "26 May" |
| Donut + bar charts | Untouched (no overshoot issue) |

**Live verification (all green at 13:14 IST):**

| # | Check | Result |
|---|-------|--------|
| 1 | `/health` | ✅ db.ok:true, latency_ms:197 |
| 2 | `/chat` serves new chat.html | ✅ has chips-row, waveform-wrap, composer, tenant-avatar, status-dot |
| 3 | `/chat-legacy` rollback path | ✅ Old MIS Work India page intact |
| 4 | `/dashboard` topbar updated | ✅ tenant-avatar + status-dot + refreshTopbarSubtitle present |
| 5 | `/api/chat-suggestions?phone=kaizen` | ✅ 6 chips returned |
| 6 | `/api/dashboard?phone=kaizen` | ✅ 10 widgets, 30-day sparkline + sparkline_dates parallel |
| 7 | All 117 unit tests | ✅ 117 pass / 0 fail in 177-219ms |
| 8 | Money-pill regex | ✅ Correctly tags ₹X.XX with `big` modifier on Cr/L |
| 9 | chat.html script | ✅ Parses cleanly via `new Function()` (~33 KB body) |
| 10 | chat.css braces | ✅ 196:196 balanced |
| 11 | dashboard.html chart | ✅ `cubicInterpolationMode` (2x), `beginAtZero` (2x), `autoSkip` (2x) |

---

### 🎯 NEXT STEP — YOUR CHOICE

**Recommended order: A → B**.

| # | Option | Effort | Why |
|---|---|---|---|
| **A** | **Browser smoke test** of `/chat` (you do, not me) | 5 min | Code static-clean hai but browser-test required — colours, animations, mic permission flow, chip click → send loop, history reload, voice transcription |
| **B** | **Sprint 4 — Drill-down pages** (`/sales`, `/outstanding`, `/stock`, `/ledger`) | ~6-8 hr | Dashboard + chat sidebar mein abhi 4 nav-items "stub" hain (`href="#"`). Make them real pages — same `app-shell`, reuse dashboard-engine widgets but role-filtered + drill-down. Most natural continuation; completes the whole shell |
| **C** | **Sprint 4 alt — AI Briefing + Anomaly Detection** | ~4-5 hr | Dashboard pe roz subah "Yesterday: ₹X.XX Cr sales (up Y%), top customer Z, anomaly in item W" wala 3-para briefing card. Z-score on KPI sparklines → red glow ring on outlier KPIs |
| **D** | **Phase 19 — VPS migration resume** | ~1-2 hr code + 1 hr deploy | Tumhare hands mein hai (Hostinger billing fix karna). Code-side: 3 hardcoded URLs → `process.env.PUBLIC_BASE_URL` (already documented below). Then SSH + migration script |
| **E** | **Sprint 3 polish** (only if browser test reveals issues) | TBD | Fix anything broken from option A |

**Defaults if user says "do jo accha lage": Option B (Sprint 4 — drill-down pages).**

### 🟢 Option B — Sprint 4 Drill-Down Pages — Pre-locked Plan

If you pick B, here's the locked plan ready to execute (no re-discussion needed):

**New files (4 pages):**
- `public/sales.html` — sales-only deep-dive: KPIs (total, count, avg, top customer), charts (trend, top parties donut, top items bar, by city map), filters (date range, party search), table (recent invoices, paginated)
- `public/outstanding.html` — outstanding-only deep-dive: aging buckets (0-30 / 31-60 / 61-90 / 90+ days), top defaulters, by-party drill, ledger PDF export
- `public/stock.html` — stock-only deep-dive: low-stock alerts, stock value KPI, slow-moving items (turnover < 0.5), by-category breakdown
- `public/ledger.html` — ledger-only deep-dive: party search → balance card + transaction timeline + export PDF

**New helpers:**
- `helpers/page-engine.js` (~300 lines) — single function `buildPageData(supabase, tenantId, page, opts)` that reuses dashboard-engine column-resolver but filters to one role + adds page-specific widgets
- `helpers/aging-buckets.js` (~80 lines) — pure fn: outstanding rows + as_of_date → `{ '0-30': N, '31-60': N, ... }`

**New endpoints:**
- `GET /api/page/sales?phone=...&from=...&to=...&q=...&page=1`
- `GET /api/page/outstanding?phone=...&as_of=...`
- `GET /api/page/stock?phone=...`
- `GET /api/page/ledger?phone=...&party=...`

**Sidebar wiring:** All 4 nav-items in `public/dashboard.html` AND `public/chat.html` swap `href="#"` → `href="/sales"` etc., set `.active` class based on `location.pathname`.

**Constraints:**
- Reuse `app.css` + `app.js` (zero new tokens)
- 117 tests must keep passing
- Tenant-aware via same 3-step phone resolution
- Pages gracefully render "No data" state if tenant has no matching tables

### 🟡 Option C — Sprint 4 alt: AI Briefing + Anomaly Detection — Pre-locked Plan

**New endpoint:**
- `GET /api/briefing?phone=...&range=month` — calls OpenAI gpt-4o-mini with widget summaries from buildDashboard, returns 3 paragraphs: yesterday recap, key changes, anomalies. Cached 1hr per (tenant, range).

**New helper:**
- `helpers/anomaly.js` (~120 lines) — z-score on KPI sparkline arrays. Returns `{ flagged: ['kpi.total_sales'], reasons: { 'kpi.total_sales': 'today is 2.4σ below 30-day mean' } }`

**Frontend (dashboard.html):**
- New `aurora-card` at top with briefing text (renders skeleton, then types in via existing typewriter prep CSS)
- Add `.kpi-card[data-anomaly="true"]` red glow ring class — `.kpi-card[data-anomaly="true"] { box-shadow: 0 0 0 2px var(--accent-rose-glow), 0 12px 36px var(--accent-rose-glow); }` + tiny ⚠ icon overlay

### 📋 If user reports a Sprint 3 bug

1. Read this section first to know what's already implemented
2. Reproduce the bug (browser console / pm2 logs / curl)
3. Present root-cause finding + fix options to user with risk + effort table
4. Wait for explicit "haan" before code change
5. After fix: rerun all 8 verification checks + 117 unit tests

### 🧪 Quick verification commands

```bash
# All 8 sanity checks in one command
pm2 status | grep mis-chatbot
curl -s http://localhost:3000/health
curl -s 'http://localhost:3000/api/chat-suggestions?phone=919999408444&limit=6' | python3 -m json.tool | head -20
curl -s -o /dev/null -w "/chat: %{http_code}\n" http://localhost:3000/chat
curl -s -o /dev/null -w "/chat-legacy: %{http_code}\n" http://localhost:3000/chat-legacy
curl -s -o /dev/null -w "/dashboard: %{http_code}\n" http://localhost:3000/dashboard
curl -s -o /dev/null -w "/assets/css/chat.css: %{http_code}\n" http://localhost:3000/assets/css/chat.css
npm run test:unit
```

---

### 🔴 PAUSED — Phase 19: VPS MIGRATION (resume after Phase 20)

**Status:** Decision made + plan finalized. Stopped at billing issue on Hostinger checkout. Code completely untouched. Server still running on local Mac via PM2 + Cloudflare quick tunnel.

**Why we're moving:** User wants 24/7 uptime even when MacBook is closed. Local Mac + Tailscale Funnel + Cloudflare quick tunnel is fragile (random URLs, sleep issues, lid-close).

**Decisions locked in:**

| Decision | Choice | Why |
|---|---|---|
| Platform | **Hostinger VPS** (rejected Railway/Fly because user already on Hostinger) | Single dashboard, single bill |
| Plan | **KVM 2** recommended (₹799/mo, 2 vCPU, 8 GB RAM, 100 GB NVMe) — fallback KVM 1 (₹599/mo) if budget tight | Charts + sync + future tenants need RAM headroom |
| OS | **Ubuntu 24.04 LTS** | Latest LTS, 5-yr support |
| Add-ons | Malware Scanner (FREE) ✅, Daily auto-backups ❌ (Supabase already backs up data, code in git), Docker manager ❌ (we use PM2 not Docker) | Cost minimization |
| Domain | Free `.in` domain from Hostinger (1-yr free with VPS) — name TBD by user | Already covered |
| Code changes needed | **3 small changes** (hardcoded URLs found in audit — see below) | Single domain string replace |

**What previously happened (2026-05-25 evening):**

1. User showed Hostinger screenshot — had bought **Premium Web Hosting** (₹5,388, 2-yr, Pending Setup) thinking it would host the chatbot
2. I explained Premium Web Hosting CANNOT run this app because background `setInterval` loops (15-min sync, 60s reminders, 60s daily-schedule, 15-min tenant sync) need a 24/7 long-running Node process — shared hosting kills idle Node processes
3. User contacted Hostinger support, **got full refund** of Premium Web Hosting (since plan was still "Pending Setup")
4. User started VPS purchase flow:
   - ✅ Selected Ubuntu 24.04 LTS as plain OS
   - ✅ Set root password (saved by user, not yet shared with assistant)
   - ✅ Enabled Malware Scanner, skipped backups + Docker
   - ✅ Reached plan-selection screen, decided KVM 2
   - ❌ Stopped at billing/payment issue — **session paused here**

**WHEN USER RESUMES — exact next steps:**

1. **Resolve Hostinger billing** — buy KVM 2 with 24-month duration (cheapest /mo rate). Refund credit should auto-apply.
2. **Claim free domain** from Hostinger home page (name = user's choice, e.g. `mistally.in`, `apnimis.in`, `misbot.in`). Point it to the new VPS during claim.
3. **User shares with assistant:** VPS public IP + root password + chosen domain.
4. **Assistant runs migration script** (~1 hour) on VPS via SSH:
   ```
   ✓ apt update && upgrade
   ✓ Install Node.js 22 (we use Node 22 locally)
   ✓ Install PM2 globally + setup pm2-startup for boot persistence
   ✓ Install nginx + certbot (free Let's Encrypt SSL)
   ✓ git clone the repo (or rsync from Mac for any uncommitted changes)
   ✓ npm install
   ✓ Copy .env from Mac (10 vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, WA_ACCESS_TOKEN, WA_PHONE_ID, GMAIL_APP_PASSWORD, WEBHOOK_SECRET, ADMIN_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PORT=3000)
   ✓ Copy logical-craft-438704-n8-d0d8ae886a53.json (Google service account)
   ✓ Copy access_control.json + .db_selections.json + .wp_sessions.json
   ✓ Create public/charts/ dir with proper permissions
   ✓ pm2 start server.js --name mis-chatbot && pm2 save && pm2 startup
   ✓ nginx config: domain → 127.0.0.1:3000 reverse proxy
   ✓ certbot --nginx -d yourdomain.in for HTTPS
   ✓ Verify /health returns 200 + db latency
   ✓ User's phone test → WhatsApp message → reply confirms live
   ```
5. **External integrations to update** (assistant guides user):
   - **wa.apimis.in webhook URL** → `https://yourdomain.in/whatsapp` (was Tailscale URL)
   - **Google Cloud Console OAuth Consent → Authorized redirect URI** → `https://yourdomain.in/api/tenant/calendar/callback` (add — keep old as fallback)
   - **Google OAuth approved domains** → add `yourdomain.in`
6. **Tear down local Mac infra:**
   - `pm2 stop mis-chatbot && pm2 delete mis-chatbot` on Mac
   - Kill `caffeinate` background process
   - Kill `cloudflared tunnel` process at `/tmp/cf-tunnel/`
   - (Optional) Stop Tailscale Funnel: `tailscale funnel reset`
7. **Security cleanup:**
   - Change VPS root password (assistant guides via CLI: `passwd root`)
   - User keeps new password, assistant deletes from memory
   - (Optional) Disable root SSH login + create non-root sudo user
8. **Update PROJECT_ROADMAP.md "PUBLIC URLS" table** — replace Tailscale + Cloudflare entries with single `https://yourdomain.in` row.

**Risk + reversibility:**
- 🟢 Low risk overall. Local Mac setup remains intact during migration; if VPS deploy fails we can keep running on Mac while we debug.
- 🟢 Code untouched — pure infra move.
- 🟡 ~30-60 min downtime when WhatsApp webhook URL switches over (during which webhooks queue at wa.apimis.in but old Mac URL stops responding). Acceptable.

**Files in repo NOT in git** (assistant will need to manually transfer to VPS):
- `.env`
- `logical-craft-438704-n8-d0d8ae886a53.json` (Google service account)
- `access_control.json` (auto-regenerates on sync, but seed first)
- `.db_selections.json` (user DB picks — will be empty initially OK)
- `.wp_sessions.json` (calendar booking state — okay to lose)
- `public/charts/*.png` (will regenerate as users ask for charts)

**Hardcoded URL audit — DONE (2026-05-25 18:13 IST). 3 places need 1-line edit each:**

| File | Line | Current value | Fix |
|---|---|---|---|
| `server.js` | 26 | `app.use(cors({ origin: ['https://saranshs-macbook-air.taile7a14d.ts.net', 'http://localhost:3000'], ...` | Replace Tailscale URL with `https://yourdomain.in` |
| `helpers/tenant-router.js` | 1121, 1132 | `` const authUrl = `https://saranshs-macbook-air.taile7a14d.ts.net/api/tenant/calendar/auth?tenant_id=${tenant.id}` `` (2 occurrences) | Replace both with `https://yourdomain.in` |
| `helpers/tenant-calendar.js` | 6 | `const REDIRECT_URI = 'https://saranshs-macbook-air.taile7a14d.ts.net/api/tenant/calendar/callback';` | Replace with `https://yourdomain.in/api/tenant/calendar/callback` |

**Recommended fix:** Move all three to `.env` as `PUBLIC_BASE_URL=https://yourdomain.in` and read via `process.env.PUBLIC_BASE_URL` so future moves are env-only. Approximate effort: 15 min.

Doc files (`LEARNING_GUIDE.md`, `FEATURE_MAP.md`, `TEST_RESULTS.md`, `PROJECT_ROADMAP.md` itself) also reference the old URLs — update for consistency but not blocking.

---

### Other Status

**Latest session (2026-05-25 evening) added 2 phases + 1 process improvement:**

- **Phase 17 ✅** Chart rendering overhaul (visibility, format, persistence)
- **Phase 18 ✅** Tenant calendar typo + multi-turn + bulk/recurring booking
- **Process ⚠️** "Discuss before code change" rule established with user — DO NOT make changes without user's green light

**All previous phases (1–16) still complete and live.**

### 🎯 IF USER REPORTS A NEW ISSUE — START HERE

1. **Read this section first** to know what's already fixed
2. **Investigate root cause** with logs / read-only DB queries / code reads — DO NOT change code yet
3. **Present findings + options** to user with risk + effort table
4. **Wait for explicit "haan" / green light** before any code change
5. **One phase at a time**, verify after each

### 🎯 OPTIONAL FUTURE WORK (none mandatory)

1. ~~**Permanent public URL**~~ — **MOVED to Phase 19 (active, paused at billing).** Hostinger VPS chosen; user got refund of Premium Web Hosting; resume from KVM 2 plan purchase.
2. **Phase 11.1 refactor** — single source-of-truth (still skipped)
3. **WhatsApp webhook recovery** — wa.apimis.in webhook delivery intermittent
4. **Email update endpoint** — existing tenants can't update email
5. **Browser push notifications** — replace WhatsApp reminders for web-only users
6. **Charts cleanup cron** — `public/charts/` will grow unboundedly. Add daily cron to delete files older than 30 days.
7. **Tenant calendar conflict detection** — MIS Main has it, tenant flow doesn't
8. **Tenant calendar reschedule** — currently only book/cancel/retrieve

### 🧪 RUNNING TESTS

```bash
npm test                    # Unit + HTTP integration (~10s)
npm run test:unit           # 117 unit tests (~235ms)
RUN_INTEGRATION=1 npm test  # + live AI/DB tenant-flow tests (~16s)
```

### 🌐 PUBLIC URLS

| URL | Status | Notes |
|---|---|---|
| `https://saranshs-macbook-air.taile7a14d.ts.net/` | ⚠️ Intermittent | Tailscale Funnel — local + admin works |
| `https://fighter-customise-jane-electoral.trycloudflare.com/` | ✅ Working | Cloudflare quick tunnel — random URL, regenerates on restart |

To restart Cloudflare tunnel:
```bash
nohup cloudflared tunnel --url http://localhost:3000 > /tmp/cf-tunnel/log.txt 2>&1 &
sleep 8
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-tunnel/log.txt | head -1
```

---

## 🆕 PHASE 17 — CHART RENDERING OVERHAUL (2026-05-25 evening, ~2 hr) ✅

**Trigger:** User showed screenshot of "send me sales chart of april" — chart was tiny in chat bubble, Y-axis raw numbers (51993294.8 instead of "5.20 Cr"), bars all single blue color, long company names cut off, AND the chart disappeared after browser reload showing only "📎 1 attachment(s) — re-ask the question to fetch them again".

### Phase 17.1 — Single source of truth (chart-builder.js)
**Before:** `server.js` (lines 1095-1175) and `helpers/tenant-chart.js` (lines 97-180) had near-identical copies of `buildChartURL` + `downloadChartImage`. They had drifted and both carried the same silent bug — Y-axis tick callbacks defined as JS arrow functions get stripped by `JSON.stringify()` because functions can't be JSON-serialized.

**After:** New `helpers/chart-builder.js` (NEW, 259 lines) — single module imported by both. Cleaner, no drift, no duplicate code.

### Phase 17.2 — POST endpoint with chart-as-JS-literal
**Why GET URL didn't work:** When chart config goes through `JSON.stringify()` → `encodeURIComponent` → URL, function callbacks are dropped. We tried QuickChart's documented "function string auto-eval" feature (`function (v) {...}`) but it only worked for `datalabels.formatter`, not `scales.y.ticks.callback`. Y-axis stayed raw.

**Solution:** Switch to POST `https://quickchart.io/chart` with `{chart: "<JS literal STRING>", width, height, format, backgroundColor}`. QuickChart eval()s the JS literal so inline functions are preserved natively.

### Phase 17.3 — Pre-scale data + auto unit (Cr/L/K)
**Most reliable approach:** Compute max value, divide all data by appropriate divisor (1e7 for Cr, 1e5 for L, 1e3 for K), display unit in title and bar labels. Y-axis then auto-formats clean numbers (0, 1, 2, 3, 4, 5) without needing any callback magic.

**Result:**
- Title: `"send me the sales chart of april (in Cr)"`
- Y-axis: `0, 1, 2, 3, 4, 5, 6` (clean)
- Bar labels: `5.20 Cr, 2.29 Cr, 2.06 Cr, 1.03 Cr, 0.75 Cr, ...`

### Phase 17.4 — Multi-color bars + label truncation + bigger size
- 12-color palette (`#4361ee`, `#e63946`, `#2ec4b6`, `#ff9f1c`, `#7209b7`, `#06d6a0`, `#f72585`, `#118ab2`, `#ffd166`, `#073b4c`, `#06aed5`, `#f15bb5`)
- Per-bar color cycling for bar charts (~80% alpha for softer look)
- Pies/doughnuts use solid colors
- Label truncation at 25 chars + ellipsis (`"FELIX HEALTHCARE PRIVA…"`)
- Render size bumped from 1000×550 → 1400×700

### Phase 17.5 — Reload persistence
**Problem:** Phase 15 trade-off was that heavy base64 attachments aren't stored in `chat_history` to avoid DB blowup. Hint text "📎 N attachment(s) — re-ask the question..." was saved instead. User's reload always lost charts.

**Fix:**
1. New helper `persistChartForReload(media)` in `server.js` — copies chart PNG from `/tmp/` to `public/charts/{name}.png`. Returns relative URL `/charts/...` (Express already serves `public/` as static).
2. At chat_history insert, embed an `[ATT:{json}]` marker in the assistant's content with the persisted URL:
   ```
   📊 *send me the sales chart of april*
   Sending 12 bar chart...

   [ATT:{"type":"image_url","url":"/charts/chart_xxx.png","caption":""}]
   ```
3. Frontend `loadHistory()` in `public/index.html` parses `[ATT:...]` markers (regex `\[ATT:({[\s\S]*?})\]`), strips them from text, builds attachments array, passes to `addMessage(role, content, type, [], null, attachments)` which already supports rendering via `renderAttachments`.

**PDFs/CSVs still NOT persisted** — too heavy. Only images (charts) get the marker treatment.

### Phase 17.6 — Frontend UX (lightbox + bigger inline)
- `.att-img` width: 360 → **560px**, max-height 280 → **420px**, `cursor: zoom-in`, `object-fit: contain`
- New `#imgLightbox` modal — click chart → fullscreen overlay (96vw × 92vh), close button + click-outside + Esc
- New `openImgLightbox(src)` / `closeImgLightbox()` JS functions

### Phase 17 — DATA correctness verification (NOT a fix, but investigated)

User asked "kya data sahi hai" — I ran the actual SQL on `tenant_ec50657e_sales` and verified:

- April 2026 total: **167 invoices, ₹15.10 Cr**
- Top 12 parties = ₹14.41 Cr (95% of month) — proportions look right
- Top company "Insulators & Electricals" ₹5.20 Cr matches chart's 51993294.8 ✓
- "Felix Healthcare Private Limited (Gamma)" vs "FELIX HEALTHCARE PRIVATE LIMITED-(T1)" → these are **different branches**, NOT case-sensitivity duplicates. Verified by running the query with and without `UPPER(party_name)` — identical results. So **no fix needed** for grouping.

### Files created/modified (Phase 17)
| File | Change |
|------|--------|
| `helpers/chart-builder.js` | NEW (259 lines) — `renderChartPng`, `buildChartLiteral`, `pickUnit`, `truncateLabel`. Legacy `buildChartURL`/`downloadChartImage` aliases preserved (return sentinel object → POST execute) |
| `helpers/tenant-chart.js` | Replaced 90-line `buildChartURL+downloadChartImage` block with `require('./chart-builder')`. Same exports preserved |
| `server.js` | (a) Replaced 75-line chart fns with `require('./helpers/chart-builder')`. (b) Added `persistChartForReload()` + `CHARTS_DIR` setup at boot. (c) Modified web `/chat` tenant-flow chat_history insert to embed `[ATT:...]` marker for charts |
| `public/index.html` | (a) `.att-img` size + `cursor:zoom-in`. (b) Added `#imgLightbox` modal HTML. (c) `openImgLightbox`/`closeImgLightbox` + Esc handler. (d) `loadHistory()` parses `[ATT:...]` markers and rebuilds attachments |

### Verification (Phase 17)
- ✅ All 117 unit tests pass (~235ms)
- ✅ pm2 restart clean, /health 200, DB latency ~190ms
- ✅ Live `/chat` request → chart returned + persisted to `public/charts/chart_*.png` (143 KB) + chat_history has `[ATT:{...}]` marker
- ✅ `/charts/xxx.png` URL serves HTTP 200
- ✅ Visual confirmation: title "(in Cr)", Y-axis 0–6 clean, bar labels "5.20 Cr" etc., 12 colors, truncated names

---

## 🆕 PHASE 18 — TENANT CALENDAR FIXES (2026-05-25 evening, ~1 hr) ✅

**Trigger:** User screenshot of `chat_history` table showing `"buk meeing with sarans h ji from this wed till next year weekly"` getting routed to **DATA query** → returning a 53-row PDF instead of booking a meeting. Also `"coming wed"` (multi-turn date follow-up) returned "No data found".

### Phase 18.1 — Typo tolerance (Phase 1)

**Before:** `helpers/tenant-router.js:225` regex was `/meeting|book|schedule|calendar|appointment|cancel.*meeting/i`. Failed on common typos.

**After:**
```js
if (
  /\b(meet\w*|book\w*|schedul\w*|calendar|appoint\w*|reminder)\b/i.test(q) ||
  /\b(buk|bukk|meeing|meeking|meting|booka|bookd|booed)\b/i.test(q) ||
  /\bcancel\b.*\bmeet/i.test(q) ||
  /aaj\s*ki\s*meet|kal\s*ki\s*meet|aaj\s*ki\s*meeting|kal\s*ki\s*meeting/i.test(q)
) return 'calendar';
```

**Verified:** 12/12 test cases pass. `"buk meeing"`, `"meeking list"`, `"schedul"` all correctly route to calendar. Real data queries (`"top 5 parties"`, `"april sales chart"`) still route correctly.

### Phase 18.2 — Multi-turn state tracking (Phase 2)

**Before:** When bot asked "📅 please tell me the date" and user replied `"coming wed"`, the next message had no calendar keywords → fell through to data query → "No data found".

**After:** New `pendingCalendar` Map in `helpers/tenant-router.js` (next to existing `pendingLedgers`):
```js
const pendingCalendar = new Map();
const PENDING_CALENDAR_TTL = 5 * 60 * 1000;

function setPendingCalendar(phone, ctx) { ... }
function getPendingCalendar(phone) { ... }
function clearPendingCalendar(phone) { ... }
```

Exported from module so `server.js` calendar handler can import them.

`processQuery()` checks pending state at the top — if exists, force `calendarMode=true` regardless of query content. Plain replies like `"27 May"` or `"3 PM"` route back to calendar handler.

### Phase 18.3 — Original-query merging + bulk/recurring booking (Phase 2c + 3)

`server.js:3000` (`handleTenantCalendarIntent`) rewritten:

**Multi-turn merge:**
```js
let effectiveQuery = query;
const pending = getPendingCalendar(phone);
if (pending) {
  const connector = pending.expecting === 'date' ? ' on '
                  : pending.expecting === 'time' ? ' at '
                  : ' ';
  effectiveQuery = `${pending.originalQuery}${connector}${query}`;
}
```

**Updated AI parse prompt** — now extracts:
```json
{
  "title": "...",
  "date": "YYYY-MM-DD or 'ASK'",
  "time": "HH:MM or 'ASK'",
  "duration_min": 60,
  "guest": "...",
  "guest_email": "...",
  "recurring": "none | daily | weekly | monthly",
  "count": 1,
  "interval_days": 0
}
```

With explicit rules: "every Monday" → `weekly, interval=7`. "till next year" weekly → `count=52`. "coming wed" / "this wed" → resolve to upcoming Wednesday's date. Cap count at 365.

**State management:**
- If `date='ASK'` → `setPendingCalendar({expecting: 'date'})` + ask "please tell me the date"
- If `time='ASK'` → `setPendingCalendar({expecting: 'time'})` + ask "please tell me the time"
- On success → `clearPendingCalendar(phone)`

**Bulk booking loop:**
```js
let count = Math.max(1, Math.min(parseInt(parsed.count) || 1, 365));
let intervalDays = parseInt(parsed.interval_days) || 0;
if (recurring === 'daily')   intervalDays = intervalDays || 1;
if (recurring === 'weekly')  intervalDays = intervalDays || 7;
if (recurring === 'monthly') intervalDays = intervalDays || 30;

for (let i = 0; i < count; i++) {
  const startTime = new Date(baseStart.getTime() + i * intervalDays * 86400000).toISOString();
  // ... create event, error-isolated (one fail doesn't kill batch)
}
```

**Single summary email/WhatsApp** for bulk bookings (NOT one per event — would spam).

### Phase 18 — Files modified

| File | Change |
|------|--------|
| `helpers/tenant-router.js` | (a) Widened `detectQueryMode` regex. (b) Added `pendingCalendar` Map + 3 helpers (set/get/clear) next to `pendingLedgers`. (c) `processQuery` checks pending state at top. (d) Exported helpers via `module.exports` |
| `server.js` | (a) Updated `tenant-router` import to also pull `setPendingCalendar/getPendingCalendar/clearPendingCalendar`. (b) Rewrote `handleTenantCalendarIntent` ~120 lines with merge + state + recurring loop |

### Verification (Phase 18)
- ✅ Regex test 12/12 cases pass (`buk meeing`, `meeking list`, `schedul`, `top 5 parties` not misrouted, etc.)
- ✅ pendingCalendar set/get/clear verified in isolation
- ✅ All 117 unit tests pass
- ✅ pm2 restart clean, /health 200

### Test prompts given to user (untested live as of 2026-05-25 17:26)

User has these queries to run with real calendar tenant (phone `919999408444`):
1. Typo: `buk meeing with sarans tomorrow at 4 PM`
2. Multi-turn: `book meeting with rahul at 5pm` → bot asks date → `tomorrow`
3. Bulk daily (3 days): `book daily standup at 10:30am for next 3 days`
4. Bulk weekly (4 weeks): `book weekly review every monday at 4pm for next 4 weeks`
5. Regression: `top 5 parties of april` should NOT be calendar

---

## ⚠️ PROCESS RULE (established 2026-05-25 16:35 IST by user)

**"code mai change krne se phele mujhse discuss kro ye saari cheeze"**

User explicitly required this approach after I made earlier changes without confirmation:

1. **Investigate first** — read code, run logs/SQL, check tests. NO file edits yet.
2. **Present findings clearly** in plain Hinglish — what's broken, root cause, options table with risk + effort
3. **Wait for explicit "haan" / green light** — never assume
4. **Verify visually after change** — for visual changes (charts, UI), download/screenshot and confirm rendering, not just "tests pass"
5. **One phase at a time** — full test cycle between sub-tasks

This rule applies to ALL future sessions. Default to action only for trivial/low-risk reversible work; everything else gets the discuss-first treatment.

---

### 📊 SESSION SUMMARY (2026-05-25)

| Time | Phase | What | Status |
|---|---|---|---|
| morning | 6, 7, 8, 9, 10, 11.2 | Tenant migration, parity, self-heal, tests | ✅ |
| afternoon | 12, 13, 14, 15, 16 | Web parity, signup, calendar UX, persistence, English-only | ✅ |
| **evening** | **17** | **Chart rendering overhaul** | ✅ |
| **evening** | **18** | **Tenant calendar typo + multi-turn + bulk booking** | ✅ |

**Files modified this session (evening):**
- NEW: `helpers/chart-builder.js`
- NEW DIR: `public/charts/` (auto-created at startup, holds persisted chart PNGs)
- HEAVY: `server.js` (chart import, persistChartForReload, [ATT:...] marker, handleTenantCalendarIntent rewrite, tenant-router import expansion)
- HEAVY: `helpers/tenant-router.js` (regex, pendingCalendar Map + helpers + processQuery check + exports)
- MEDIUM: `public/index.html` (CSS for att-img + lightbox, lightbox HTML, openImgLightbox/closeImgLightbox JS, loadHistory parses [ATT] markers)
- LIGHT: `helpers/tenant-chart.js` (replaced local build/download with require chart-builder)

**Cleanup status:** test_chart_persist session in chat_history can stay (proves reload works). `/var/folders/.../tmp/chart_*.png` files auto-cleaned by macOS. `public/charts/*.png` will accumulate — see Optional Future Work #6.

---

## 🚨 RESUME HERE — START OF NEXT SESSION (READ THIS FIRST) — historical version below

### Current Status (2026-05-25 16:00 IST) — ACTIVE DEVELOPMENT 🚀

**All major phases complete + new web/SaaS features added in this afternoon's session:**

- **Phase 6 ✅** Tenant DB JSONB → proper PostgreSQL tables
- **Phase 7 ✅** Tenant feature parity (PDF / CSV / Image / Chart / Ledger PDF)
- **Phase 8 ✅** MIS Main backported with tenant brains
- **Phase 9 ✅** Tenant communication (voice / auto-sync / chat-log / booking emails / reminders / daily schedule)
- **Phase 10 ✅** Self-healing hardening
- **Phase 11.2 ✅** 131-test automated regression suite
- **Phase 11.1 ⏭️** SKIPPED (single source-of-truth refactor — risky, no immediate need)
- **Phase 12 ✅** Web Chatbot Full Parity (NEW — 2026-05-25 afternoon)
- **Phase 13 ✅** Public Self-Service Signup + Choice UI (NEW)
- **Phase 14 ✅** Calendar UX Fixes (cache invalidation + email collection + guest email)
- **Phase 15 ✅** Reload Persistence + Logout button
- **Phase 16 ✅** English-Only Output Across Entire Codebase (NEW — bot replies always in English regardless of input language)
- **Server live on PM2** (`pm2 status` to verify)
- **Cloudflare Tunnel running** as fallback public URL when Tailscale Funnel had issues

### 🎯 NEXT WORK — NONE PENDING (project paused, ready for users)

User has full feature parity now. No mandatory work remaining. Possible future improvements (all OPTIONAL):

1. **Permanent public URL** — switch from `trycloudflare.com` random URL to a fixed Cloudflare Tunnel with own domain, OR deploy to Railway/Fly.io ($5/mo)
2. **Phase 11.1** — single source-of-truth refactor (still skipped; only do if adding 3rd kind of user)
3. **WhatsApp webhook recovery** — wa.apimis.in webhook delivery has been intermittent; consider migrating to Meta WhatsApp Cloud API directly without third party
4. **Email update endpoint** — existing tenants can't update their email yet (only at signup); a small POST `/api/tenant/update-email` would fix this
5. **Browser push notifications** — replace WhatsApp reminders for users who use only web

### 🧪 RUNNING TESTS

```bash
npm test                    # 131 tests, ~10s
npm run test:unit           # Unit only (234ms)
RUN_INTEGRATION=1 npm test  # + live AI/DB tenant-flow tests (15.8s, costs ~$0.01 OpenAI)
```

### 🌐 PUBLIC URLS

| URL | Status | Notes |
|---|---|---|
| `https://saranshs-macbook-air.taile7a14d.ts.net/` | ⚠️ Intermittent | Tailscale Funnel — may fail externally with `ERR_CONNECTION_CLOSED`. Local + admin still works. |
| `https://fighter-customise-jane-electoral.trycloudflare.com/` | ✅ Working | Cloudflare quick tunnel — random URL, regenerates on tunnel restart |

To restart Cloudflare tunnel after Mac reboot:
```bash
nohup cloudflared tunnel --url http://localhost:3000 > /tmp/cf-tunnel/log.txt 2>&1 &
sleep 8
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-tunnel/log.txt | head -1
```

---

## 🆕 PHASE 12 — WEB CHATBOT FULL PARITY (2026-05-25 afternoon, ~3 hr) ✅

**Goal:** Make web chatbot have feature parity with WhatsApp — anyone can use either channel interchangeably.

### Phase 12.1 — Tenant routing on web `/chat`
**Before:** Web `/chat` always went to MIS Main flow. Tenants couldn't query their own data via browser.
**After:** Frontend sends `phone` from localStorage in every request. Backend calls `handleTenantQuery()` first; falls through to MIS Main only when phone is empty/MIS user.

### Phase 12.2 — Identity badge + login modal
- Header shows `👤 +91...` badge top-right
- Click badge → modal: Login / Skip / 🆕 Naya user? Register
- Phone saved to `localStorage.mis_phone`
- Login state persists across reloads

### Phase 12.3 — Media as base64 attachments
**Before:** Tenant returned `{ media: { type, path } }` — only WhatsApp could send. Web showed HTML table even for huge results.
**After:** New `mediaToWebAttachments()` helper in server.js converts `media.path` → base64 in JSON response. Frontend renders:
- `image` / `image_url` → inline `<img>`
- `document` (PDF/CSV) → download button with size + icon
- Auto-CSV >100 rows, auto-PDF >50 rows, charts as PNG

### Phase 12.4 — Voice input (web)
- New `POST /transcribe` endpoint — accepts `{ audio_base64, mime }`, calls Whisper
- Frontend: 🎙️ mic button uses MediaRecorder API
- Records WebM/Opus → base64 → POSTs → Whisper text → auto-fills input + sends to /chat
- Auto-stop after 60s safety cap

### Phase 12.5 — `switch db` on web
- Same `switch db` command works on web — returns numbered list, user picks number
- Persistent via `.db_selections.json` (survives PM2 restart)

### Phase 12.6 — Cache scoping fix
- **Bug found:** web cache was global (`message.toLowerCase()`) → tenant users saw stale MIS Main answers
- **Fix:** cache key now `(userPhone||"guest")+"|"+message`

**Files:** `server.js`, `public/index.html`

---

## 🆕 PHASE 13 — PUBLIC SELF-SERVICE SIGNUP + CHOICE UI (2026-05-25 afternoon, ~1.5 hr) ✅

**Goal:** Let any new user register themselves without admin intervention. Existing users get a choice: add to existing DB or create separate new DB.

### Phase 13.1 — Public `/api/tenant/signup` endpoint
- No admin auth required (was protected by `ADMIN_API_KEY` previously)
- **Defenses against abuse:**
  - 3 signups/hour per IP
  - 2 attempts/hour per phone
  - Strict input: phone 10-15 digits, name 2-100 chars, sheet URL must be Google Sheets, schema max 500KB, HTML stripped
  - Duplicate phone returns 200 with `requires_choice: true` (NOT 409 error)

### Phase 13.2 — Removed admin API key from frontend
- **Security gap fixed:** `037beb...` was hardcoded in `index.html` line 500 + `onboard.html` line 229 → anyone could view-source and abuse admin endpoints
- All public tenant flows now use `/api/tenant/signup` (no key needed)
- Admin endpoints (`/access`, `/sync`, `/api/tenant/sync-all`, etc.) still protected by `requireAuth`

### Phase 13.3 — Choice UI for existing users
When user with existing tenant tries to signup again:
1. Backend returns `200 { requires_choice: true, existing: [{id, name}, ...] }` (not 409)
2. Frontend renders yellow card with buttons:
   - 📋 "Add new tabs to existing DB: <name>" (one per owned DB)
   - 🆕 "Create completely separate new DB"
   - Cancel
3. User picks → request resubmitted with `mode: 'add_to_existing'` + `tenant_id` OR `mode: 'new_separate'`

### Phase 13.4 — Migration 007: drop UNIQUE on tenants.phone
**Problem:** `tenants.phone` had UNIQUE constraint → multiple separate DBs per phone impossible.
**Fix:** Migration `migrations/007_tenants_phone_multi.sql`:
```sql
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_phone_key;
CREATE INDEX IF NOT EXISTS tenants_phone_lookup_idx ON tenants(phone);
```
Applied via Supabase SQL editor on 2026-05-25 14:38 IST. User_databases table already supports many-to-many (no constraint changes there).

### Phase 13.5 — Auto-login after signup
After successful registration:
1. Phone auto-saved to `localStorage.mis_phone`
2. Identity badge updates
3. After 1.5s, auto-switches to chat tab
4. Welcome message added with quick-start tips

**Files:** `server.js` (~190-line `/signup` handler), `public/index.html`, `public/onboard.html`, `migrations/007_tenants_phone_multi.sql`

---

## 🆕 PHASE 14 — CALENDAR UX FIXES (2026-05-25 afternoon, ~30 min) ✅

### Phase 14.1 — OAuth callback cache invalidation
**Bug:** After tenant connected calendar via OAuth, the `tenantCache` still showed `calendar_connected=false` until user reloaded the tab. Any "book meeting" attempt would re-prompt OAuth instead of routing to calendar handler.

**Root cause:** `invalidateTenantCache('')` was called with empty string — no-op.

**Fix:** Now invalidates cache for ALL phones owning the tenant (queried from `tenants.phone` + `tenant_phones` + `user_databases`). Tab reload no longer required.

### Phase 14.2 — Email collection at signup
**Bug:** `tenant.email` was always null → booking confirmation emails never sent.

**Fix:** `/api/tenant/signup` now accepts `email` field (optional, RFC validated, max 254 chars, lowercased). Email field added to both `index.html` Connect Sheet form and `onboard.html`.

### Phase 14.3 — Guest email extraction in tenant booking
**Bug:** "book meeting with friend@example.com" — guest email not detected, no email sent to guest.

**Fix:** Tenant calendar parser updated:
- AI prompt now extracts `guest_email` field
- Belt-and-braces regex fallback catches emails AI misses
- Title becomes "Meeting with <guest>" if guest mentioned
- Guest added as `attendees` (Google Calendar sends native invite)
- Confirmation email sent to: `tenant.email` (owner) AND `guest_email` (deduped)
- Reply hint shows where email was sent

**Files:** `server.js` (`/api/tenant/calendar/callback`, `/api/tenant/signup`, `handleTenantCalendarIntent`), `public/index.html`, `public/onboard.html`

---

## 🆕 PHASE 15 — RELOAD PERSISTENCE + LOGOUT (2026-05-25 afternoon, ~30 min) ✅

### Phase 15.1 — Tenant chats now saved to `chat_history`
**Bug:** Web tenant flow `/chat` returned reply but didn't insert into `chat_history` table → reload lost all tenant chats. Only MIS Main chats persisted.

**Fix:** Three insert points added in tenant flow `/chat`:
1. Tenant calendar mode → log user msg + assistant calReply
2. Normal tenant reply → log user msg + assistant text (with attachment count hint, not the base64 itself)
3. Silent/error returns → no log (intentional)

**Reload now restores complete chat history** including tenant queries, calendar bookings, etc.

**Trade-off:** Heavy base64 attachments NOT stored in DB (would explode storage). Reply text saved with hint "📎 N attachment(s) — re-ask the question to fetch them again". Practical compromise.

### Phase 15.2 — Logout button
- Added "⏻ Logout" button to identity modal (visible only when logged in)
- Click → confirm → clears `localStorage.mis_phone`, `localStorage.mis_id_skipped`, `sessionStorage.mis_session_id`, in-memory `history`, visible chat
- Generates fresh `SESSION_ID` so next user starts clean
- Reopens login modal

### Phase 15.3 — Cleanup helper
Provided node script to delete all data for a phone (tenants, tenant_phones, user_databases, tenant_query_logs, proper PG tables, .db_selections.json entry). Used for `919990930044` cleanup.

**Files:** `server.js` (chat_history inserts in tenant flow), `public/index.html` (logout button + handler)

---

## 🆕 PHASE 16 — ENGLISH-ONLY OUTPUT (2026-05-25 evening, ~1.5 hr) ✅

**Goal:** Bot must always reply in English (web + WhatsApp). User input stays multilingual (Hindi/English/Hinglish all understood).

### Phase 16.1 — AI prompts (5 files)
All AI system prompts now explicitly enforce English output regardless of input language:
- `helpers/prompt.js` — RULE 4: "ALWAYS reply in English regardless of the language the user writes in"
- `helpers/tenant-router.js` — CLARIFY messages in English; RULE 18 LANGUAGE rewritten
- `helpers/smart-format.js` — formatter prompt: "ALWAYS reply in English"
- `server.js` MIS Main system prompt — LANGUAGE directive added; "HINGLISH MAPPING" relabeled "HINGLISH UNDERSTANDING (input only)"
- `server.js` MIS calendar parser — "missing" hints in English

### Phase 16.2 — Backend hardcoded reply strings (~80 strings)
Translated all user-facing strings in:
- `helpers/tenant-router.js` — greetings, switch_db, db_select, ledger errors/PDF, fuzzy fallback, retry messages, image/chart/CSV/PDF auto-summaries, calendar OAuth prompt, multi-DB ask, free quota, legacy SQL error
- `helpers/self-heal.js` — friendly error messages (network, timeout, rate limit, schema, permission, syntax, division-by-zero)
- `helpers/tenant-sync.js` — schema-drift WhatsApp message
- `helpers/tenant-notifications.js` — daily schedule + 15-min reminder
- `helpers/notifications.js` — booking confirmation, MIS Main daily schedule
- `helpers/tenant-pdf.js`, `tenant-csv.js`, `whatsapp.js` — file send messages
- `server.js` — /chat errors, WhatsApp webhook errors, audio/transcribe failures, MIS Main calendar booking flow (confirm/cancel/conflict/reason/reschedule/retrieve labels), tenant calendar handler, OAuth callback page, signup messages, sync confirmations, uncaught error fallback

### Phase 16.3 — Frontend UI labels
- `public/index.html` — identity modal, Connect Sheet form, sync page, choice UI, welcome messages, validation errors, logout confirm, transcribe error
- `public/onboard.html` — title, subtitle, all step labels, returning user panel, validation errors, success messages

### Phase 16.4 — Test fix
- `tests/unit/self-heal.test.js` — assertion `/Network/` → `/network/i` (case-insensitive) since new English message is "Minor network issue — retrying..."

### Verification (live)
| Input (any language) | Reply (always English) |
|---|---|
| `top 3 parties dikhao` | `📋 *3 results:* 1️⃣ Insulators... 2️⃣ NPL Buildcon...` |
| `April mein kitne invoices the` | `📊 *Invoice Count:* 167` |
| `hello` | `🙏 Hello! I am your data assistant. Ask me anything about your data!` |
| `switch db` | `📋 Your databases: 1️⃣ MIS-2 2️⃣ MIS Main — Reply with a number to select 👆` |

### What's preserved
User-input detection regex stays multilingual — `kal`, `aaj`, `mein`, `karo`, `hai`, etc. still recognized as Hindi/Hinglish input. Bot **understands** all three languages but **responds only in English**.

**Files:** 12 files modified (5 AI prompts, ~80 hardcoded strings, 2 frontend HTML, 1 test)

---

## 📊 SESSION SUMMARY (2026-05-25 — afternoon + evening)

| Phase | Hours | Status |
|---|---|---|
| 12 — Web parity | ~3 hr | ✅ |
| 13 — Self-service signup | ~1.5 hr | ✅ |
| 14 — Calendar UX fixes | ~0.5 hr | ✅ |
| 15 — Reload persistence + logout | ~0.5 hr | ✅ |
| 16 — English-only | ~1.5 hr | ✅ |
| **TOTAL afternoon work** | **~7 hr** | **✅ DONE** |
| Cumulative project time | ~30 hr |  |

**Files created/modified this session:**
- NEW: `migrations/007_tenants_phone_multi.sql`, `MANUAL_TEST_GUIDE.md`
- HEAVY MODIFY: `server.js`, `helpers/tenant-router.js`, `public/index.html`, `public/onboard.html`
- LIGHT MODIFY: `helpers/prompt.js`, `helpers/smart-format.js`, `helpers/self-heal.js`, `helpers/tenant-sync.js`, `helpers/tenant-notifications.js`, `helpers/notifications.js`, `helpers/tenant-pdf.js`, `helpers/tenant-csv.js`, `helpers/whatsapp.js`, `tests/unit/self-heal.test.js`

**Cleanup done:**
- All data for phone `919990930044` deleted (2 tenants, 4 PG tables, 3 query logs, 2 user_databases, 1 tenant_phones link)
- BUSINESS-2 test tenant deleted after migration verification

**Cloudflare tunnel started** as backup public URL when Tailscale Funnel had issues.

---

### 🧪 RUNNING TESTS

```bash
npm test                    # Unit + HTTP integration (fast, ~10s)
npm run test:unit           # Unit only (234ms)
RUN_INTEGRATION=1 npm test  # + live AI/DB tenant-flow tests (15.8s, costs ~$0.01 OpenAI)
```

### ✅ WHAT WAS COMPLETED THIS SESSION (2026-05-25)

#### Bug Fix — DB Selection Persistence
**Problem:** "Pansari ledger" failed because user-selected DB silently expired after 30 min and the router fell back to MIS-2 tenant (which has no Pansari).
**Fix:** `helpers/tenant-router.js` — `dbSessions` Map (in-memory, 30-min TTL) replaced with persistent `.db_selections.json` file. Selection now sticky until user explicitly runs `switch db`. Survives PM2 restarts.

#### Phase 7 — Tenant Feature Parity (5.5 hr) ✅
| # | Task | File(s) | Status |
|---|------|---------|--------|
| 7.1 | Auto PDF for >50 rows (was >20 in plan, user chose 50) | `helpers/tenant-pdf.js` (NEW), `helpers/tenant-router.js` | ✅ |
| 7.2 | Auto CSV for >100 rows | `helpers/tenant-csv.js` (NEW), `helpers/whatsapp.js` (MIME from extension) | ✅ |
| 7.3 | Image column auto-send (URL detection in samples + result rows) | `helpers/tenant-router.js` | ✅ |
| 7.4 | Chart generation via QuickChart.io | `helpers/tenant-chart.js` (NEW), `helpers/tenant-router.js` | ✅ |
| 7.5 | Ledger PDF (fuzzy match + styled + multi-turn disambiguation) | `helpers/tenant-ledger.js` (NEW), `helpers/tenant-ledger-pdf.js` (NEW), `helpers/tenant-router.js` | ✅ |

**Tier system now active in tenant queries:**
| Rows | Output |
|---|---|
| ≤ 15 | Inline emoji-bullet list with totals |
| 16–50 | AI-summarized top 20 with full totals |
| 51–100 | Styled landscape PDF (zebra stripes, totals footer) |
| > 100 | Raw CSV (all cols, RFC 4180 escaped, UTF-8 BOM for ₹/Hindi) |

**Other Phase 7 features (live & verified):**
- AI prompt: bumped `LIMIT 50` → `LIMIT 200` for lists (so large lists actually flow into PDF/CSV)
- Image mode: detects image columns by sample URL pattern + name match (3-tier confidence); friendly "no image cols" message for tenants without them
- Chart mode: AI generates 2-col aggregating SQL (label + numeric value, GROUP BY, LIMIT 12); type-aware label/value column inference; bar/pie/doughnut/line auto-selected from query keywords
- Ledger mode: detects ledger-shaped tables (debit/credit/balance pattern); extracts entity from "X ka ledger" / "ledger of X" / etc.; ILIKE → pg_trgm fuzzy fallback; multi-turn numbered disambiguation (priority over DB select)

#### Phase 8 — Backport Tenant Brains to MIS Main (6.5 hr) ✅
| # | Task | File(s) | Status |
|---|------|---------|--------|
| 8.1 | Multi-step AI retry (3 attempts with error context) | `server.js` (`runSQLWithRetry`) | ✅ |
| 8.2 | pg_trgm fuzzy fallback for entity columns | `server.js` (`fuzzyFallbackMis`, `MIS_ENTITY_COLS`) | ✅ |
| 8.3 | Type-aware smart formatter (replaces regex `₹`-on-everything) | `server.js` (uses `helpers/smart-format`) | ✅ |
| 8.4 | Aggregate summary line for multi-row results | comes free with `smart-format.formatResults` | ✅ |
| 8.5 | Multi-tab auto-discovery (replace hardcoded GIDs) | `helpers/sync.js` (`getGids` + `discoverTabs`) | ✅ |
| 8.6 | Advanced rules (NULL filtering for top-N, PERCENTILE_DISC, STDDEV, language matching, include-all-metrics) | `server.js` (`buildSystemPrompt`) | ✅ |

**Verified bug fixes in MIS Main:**
- "Count: ₹1" type bug → now `Count: 25` (no ₹ on counts) ✅
- Top 5 parties: full ₹X.XX Cr/L formatting + auto `📊 Total across N: ...` line ✅
- Typo "pansaree" → fuzzy suggests "Pansari Industries" (similarity 0.27) ✅
- All 9 sheet tabs auto-discovered (incl. ACCESS_CONTRO 13-char truncation alias) ✅

#### Phase 10 — Self-Healing Hardening (5 hr) ✅ — User's Special Ask

**Goal:** Make the chatbot auto-recover from 85%+ errors without human intervention. All 6 sub-tasks shipped in a single cohesive helper (`helpers/self-heal.js`, 507 lines) and wired into both tenant-router and MIS Main.

| # | Task | Implementation | Status |
|---|------|----------------|--------|
| 10.1 | Fuzzy column name resolution | `levenshtein` + `findClosestColumn` (substring/prefix boost) + `resolveColumnError` parses Postgres `column "X" does not exist`, strips table prefix, rewrites SQL, minScore=0.5 to avoid bad subs | ✅ |
| 10.2 | Auto schema-change detection on sync | `detectSchemaDrift(pgCols, sheetCols, prevMeta)` — diffs added/removed/typeChanged. `sheets.js → syncSheetToProperTables` now logs `[SCHEMA-DRIFT] +N added / -N removed / ~N type-drift` per tab. Removed cols kept (don't drop historical data); type drift logged for human review. | ✅ |
| 10.3 | Smart query fallbacks (zero rows) | `relaxSQL(sql)` returns 3 progressive variants — drop date filters, loosen longest ILIKE, both combined. Wired into both 0-row branches (tenant + MIS Main) AFTER fuzzy fallback. | ✅ |
| 10.4 | Result validation (zero/null) | `validateResult(rows, query)` catches single-row-all-NULL aggregates, all-zero numerics, and "list-asked-but-1-row" cases. Single-row-all-NULL is rerouted into fuzzy/relax recovery (was returning misleading "Total: ₹0.00" before). | ✅ |
| 10.5 | Health check auto-recovery | `pingDb(supabase, {timeoutMs})` does `SELECT 1` with timeout race. `/health` endpoint upgraded — returns 200/503 based on DB roundtrip success, with `{db:{ok, latency_ms}}`. `withRetry()` wrapper auto-retries TRANSIENT errors with exponential backoff (250→500→1000ms). | ✅ |
| 10.6 | Better error classification | `classifyError(err)` taxonomy: TRANSIENT / SCHEMA_COLUMN / SCHEMA_RELATION / SQL_SYNTAX / PERMISSION / RATE_LIMIT / TIMEOUT / PERMANENT / UNKNOWN. Each has `retryable` flag + Hinglish friendly message. Drives all retry decisions. | ✅ |

**Files created/modified:**
| File | Change |
|------|--------|
| `helpers/self-heal.js` | NEW — 507 lines, exports 11 functions across 6 layers |
| `helpers/tenant-router.js` | `runSQL` wrapped in `withRetry`; `processQueryProperTables` retry loop uses `classifyError` + `resolveColumnError`; all-NULL aggregates rerouted into fuzzy/relax; `relaxSQL` variants tried after fuzzy on 0 rows; `validateResult` logged as informational hint |
| `server.js` | `runSQL` wrapped in `withRetry`; `liveColumnsByTable` populated alongside `liveSchema` for column resolver; `runSQLWithRetry` uses `classifyError` (PERMISSION/SCHEMA_RELATION fail fast) + `resolveColumnError` (cheap fix before paying for AI re-prompt); MIS Main 0-row branch tries fuzzy → relax variants → friendly fallback; `/health` actually pings DB |
| `helpers/sheets.js` | `syncSheetToProperTables` loads previous `tables_metadata` snapshot before sync; per-tab does `tableExists` + `getExistingColumns` + `detectSchemaDrift` BEFORE `ensureTable`; logs added/removed/typeChanged with `[SCHEMA-DRIFT]` prefix; result includes `drift` array |

**Verified live (2026-05-25 13:30 IST):**
- `/health` → 200 OK, `db.latency_ms: 486`
- pm2 restarted clean — all 8 MIS tables loaded, 5 tenant tabs (SALES + PURCHASES) synced 2095 rows in 10s, no false-positive drift logs
- Baseline tenant queries unchanged: "18 April invoices" → 25, "top 5 parties" → full ₹X.XX Cr list, "Sanjay Aggarwal" → searches both party + sales_person columns
- **Recovery proven:**
  - "Mital Electronicss" (typo) → fuzzy suggests `MITTAL ELECTRONICS`
  - "August 2024 BHEL" (wrong year) → fuzzy suggests `Bharat Heavy Electricals Limited`
  - "Saga Stainox" + Aug 2024 → all-NULL aggregate caught, rerouted to fuzzy → suggests full name
  - Synthetic test: `column_naem` → resolver fixed to `company_name` (score 0.83), SQL re-executed against live DB successfully
- **Conservative bail-out proven:** typos with no close match (`random_blah`, `salesman`, `t.qantity`) correctly return `null` from resolver — handing off to AI re-prompt rather than substituting wrongly

**Architecture impact:**
```
BEFORE Phase 10:
  AI generates wrong column → SQL fails → AI re-prompt × 3 → "Query nahi chal payi"
  Date too narrow → 0 rows → "Koi data nahi mila"
  ECONNRESET → bubbles up → user sees error
  /health → "ok, uptime: 123" (lies — DB could be down)

AFTER Phase 10:
  AI generates wrong column → classifyError → resolveColumnError (Levenshtein) → SQL rewritten → cached AI call avoided
  Date too narrow → fuzzy fallback → relaxSQL drops date → "Yeh data mila" with hint
  ECONNRESET → withRetry exponential backoff (250→500→1000ms) → recovers silently
  All-NULL aggregate → no longer reported as "Total: ₹0.00"; rerouted to recovery
  /health → 200 if DB pings OK with latency, 503 with diagnostics if down
```

**Total new code:** 507 lines in `self-heal.js` + ~150 lines of wiring across 3 files. Zero new dependencies (Levenshtein implemented in-house, ~25 lines).

#### Phase 9 — Tenant Communication Features (4 hr) ✅

**Goal:** Bring MIS Main's voice/email/reminder/auto-sync features to every tenant. All 6 sub-tasks shipped.

| # | Task | Implementation | Status |
|---|------|----------------|--------|
| 9.1 | Voice/Whisper for tenants | Root cause: `checkAccess` blocked non-MIS phones in `mode:LIST` BEFORE tenant routing fired. Added `isKnownTenant()` helper in `server.js` with 5-min in-memory `tenantPhoneCache` (positive results only). Access gate now does a tenant lookup before blocking. Whisper path was already correct — once a tenant phone passes the gate, audio → text flows through `handleTenantQuery` exactly like MIS. | ✅ |
| 9.2 | Auto-sync every 15 min per tenant | NEW `helpers/tenant-sync.js` — `syncAllTenants()` runs serially over every tenant where `proper_tables_created=true` and status ∉ {paused, cancelled}. Per-tenant 5-min throttle, error-isolated (one tenant's failure never blocks others). Wired as `setInterval(15min)` + 60s warm-up at boot. New admin endpoint `POST /api/tenant/sync-all`. WhatsApp-notifies the owner only on real schema drift (not on every clean sync). | ✅ |
| 9.3 | Chat history logging for tenant queries | `tenant_query_logs` table already had a `response` column but `tenant-router.js` only inserted `sql_generated`. Added `logAndReturn()` closure in `processQueryProperTables` that wraps every success-path return; the closure now writes `query`, `sql_generated`, AND the formatted reply text (truncated to 5KB) into the same row. | ✅ |
| 9.4 | Booking confirmation email per tenant | Extended `handleTenantCalendarIntent` in `server.js` — after `createEvent` succeeds, call `notifications.formatBookingEmailHTML()` and email tenant.email + any guest emails parsed from the message body. Logs to `calendar_logs` table (same as MIS). Email failure never blocks WhatsApp confirmation. | ✅ |
| 9.5 | Meeting reminders 15 min before per tenant | NEW `helpers/tenant-notifications.js` — `checkTenantReminders()` lists every `calendar_connected=true` tenant with a refresh token, calls `tenantCalHelper.getEvents(15-16min window)` per tenant, sends WhatsApp reminder once per `(tenantId, eventId)` via Set dedup (auto-clears at 500 entries to prevent leaks). `setInterval(60s)` in server.js. | ✅ |
| 9.6 | Daily 8 AM schedule per tenant | Same `tenant-notifications.js` — `sendTenantDailySchedules()` checks IST time, fires once per `(tenantId, date)` via Map dedup. Builds personalized greeting + meeting list + Jitsi-aware footer. Sends WhatsApp + (if `tenants.email` set) full HTML email styled identically to MIS Main's. `setInterval(60s)`. | ✅ |

**Files created/modified:**
| File | Change |
|------|--------|
| `helpers/tenant-sync.js` | NEW — 163 lines. `syncAllTenants` + `clearSyncThrottle` + `buildDriftMessage` |
| `helpers/tenant-notifications.js` | NEW — 185 lines. `checkTenantReminders`, `sendTenantDailySchedules`, `listConnectedTenants`, `buildDailyEmailHTML` |
| `helpers/tenant-router.js` | `logAndReturn` closure threads reply text into `tenant_query_logs.response` across all 6 success-path returns (image / chart / CSV / PDF / AI summary / direct format) |
| `server.js` | `tenantPhoneCache` + `isKnownTenant()` helper; access gate bypass for known tenants; `setInterval` for tenant sync (15 min) + warm-up; admin `POST /api/tenant/sync-all`; `setInterval` for tenant reminders + daily schedule (60s each); `handleTenantCalendarIntent` now sends booking emails to tenant.email + guests + logs to `calendar_logs` |

**Verified live (2026-05-25 13:45 IST):**
- `/health` → 200 OK, `db.latency_ms: 252`, no error log entries
- pm2 stable (3m uptime, 64.5 MB)
- 9.1: webhook from `919999988888` (Test Kirana Store, NOT in `access_control.json`) routed past gate to `handleTenantQuery` → got real reply, no `⛔` block
- 9.2: warm-up sync ran end-to-end — MIS-2 → 2095 rows in 8.2s, 0 drift events. Throttle confirmed: manual `/api/tenant/sync-all` returned `{skipped:'throttled'}` 12s after warm-up.
- 9.3: confirmed by selecting latest `tenant_query_logs` row after a real query — `response` field contains the full formatted reply text.
- 9.5 + 9.6: silent (0 connected tenants currently) — infrastructure ready; loops fire every 60s with no errors.

**Architecture impact:**
```
BEFORE Phase 9:
  Tenant voice → Whisper → checkAccess('mode:LIST') → "⛔ Aapko access nahi hai"
  Tenant sheet edit → no auto-sync, owner has to manually sync
  Tenant query reply → only SQL logged, reply text lost
  Tenant booking → no email confirmation (only WA)
  Tenant meeting → no reminder, no daily schedule

AFTER Phase 9:
  Tenant voice → Whisper → isKnownTenant() bypass → handleTenantQuery → real reply
  Tenant sheet edit → auto-detected at next 15-min sync → drift logged + WA notice if cols changed
  Tenant query reply → query + sql + response all in tenant_query_logs (audit trail)
  Tenant booking → WA confirm + HTML email to owner + guests + calendar_logs entry
  Tenant meeting → 15-min WA reminder per (tenantId, eventId), 8 AM IST WA + email schedule
```

#### Phase 11.2 — Comprehensive Test Suite (1 hr) ✅

**Goal:** Lock in current behavior with an automated regression suite — runnable via `npm test` — so future refactors (especially 11.1) can be evaluated against a known-good baseline.

**Framework choice:** Node 18+ built-in `node:test` runner — zero new dependencies. Compatible with Node 22 (project's runtime) via glob patterns (`'tests/unit/*.test.js'`).

| Layer | File | Tests | Coverage |
|-------|------|-------|----------|
| Unit (self-heal) | `tests/unit/self-heal.test.js` | 47 | classifyError × 8, withRetry × 4, levenshtein × 4, findClosestColumn × 4, resolveColumnError × 6, flattenColumnNames × 2, detectSchemaDrift × 4, relaxSQL × 4, validateResult × 6 |
| Unit (tenant-router helpers) | `tests/unit/tenant-router-helpers.test.js` | 27 | detectIntent × 7, detectQueryMode × 6, autoRouteQuery × 3, extractEntityFilters × 4, validateSQL × 6 |
| Unit (tenant-tables) | `tests/unit/tenant-tables.test.js` | 49 | sanitizeIdentifier × 6, buildTenantTableName × 2, cleanNumeric × 9, cleanText × 3, parseDate × 5, detectPgType × 6, detectColumnRole × 7, titleCase × 3, cleanValue × 4, buildColumnMetadata × 2, DDL builders × 2 |
| Integration (HTTP) | `tests/integration/health.test.js` | 8 | `/health` (200 + db latency), `/sync/status` (array), `/api/tenant/sync-all` (auth gate + accept), `/whatsapp` (empty body OK + malformed-JSON returns 400 with no stack-trace leak) |
| Integration (live AI/DB) | `tests/integration/tenant-flow.test.js` | 8 (gated) | Baseline × 3 (April invoices, top 5 parties, total WITH GST), self-heal recovery × 4 (typo fuzzy, jeet construction, all-NULL aggregate, IGNORE intent), chat-history persistence × 1 |

**Total: 131 tests, all passing.**

**Run commands (added to `package.json`):**
```json
"scripts": {
  "test":             "node --test --test-reporter=spec 'tests/unit/*.test.js' 'tests/integration/*.test.js'",
  "test:unit":        "node --test --test-reporter=spec 'tests/unit/*.test.js'",
  "test:integration": "RUN_INTEGRATION=1 node --test --test-reporter=spec 'tests/integration/*.test.js'"
}
```

**Timing:**
| Mode | Tests | Skipped | Wall time |
|------|-------|---------|-----------|
| `npm run test:unit` | 117 | 0 | 234 ms |
| `npm test` (with server running) | 131 | 8 (tenant-flow gated) | ~10 s |
| `RUN_INTEGRATION=1 npm test` (full) | 131 | 0 | 15.8 s |

**One small enabler change to source code:**
- `helpers/tenant-router.js` now exports an `_internal` object containing `detectIntent`, `detectQueryMode`, `autoRouteQuery`, `extractEntityFilters`, `validateSQL`, `isMISUser`, `buildSchemaPrompt`. These are pure functions; no behavioral change. The export simply makes them reachable from unit tests.

**Self-skipping integration tests:** The HTTP integration tests `before()`-probe `/health`; if the server isn't reachable they `t.skip(...)` automatically — so `npm test` works in CI without a live server. Live-DB tenant-flow tests check `RUN_INTEGRATION=1` and individually `t.skip(...)` if not set.

### 📦 NEW HELPER FILES CREATED THIS SESSION

| File | Purpose |
|------|---------|
| `helpers/tenant-pdf.js` | Type-aware A4 landscape PDF for >50-row tenant results |
| `helpers/tenant-csv.js` | RFC 4180 CSV (UTF-8 BOM) for >100-row tenant results |
| `helpers/tenant-chart.js` | QuickChart.io wrapper (bar/pie/doughnut/line) for tenant chart queries |
| `helpers/tenant-ledger.js` | Ledger table detection + entity extraction + ILIKE→pg_trgm search |
| `helpers/tenant-ledger-pdf.js` | Styled ledger PDF (cloned from MIS Main's visual style) |
| `helpers/self-heal.js` | **Phase 10** — error taxonomy + retry-with-backoff + Levenshtein column resolver + schema-drift detector + SQL relaxation + result validator + DB ping (one helper, six layers, zero new deps) |
| `helpers/tenant-sync.js` | **Phase 9.2** — `syncAllTenants` per-tenant sync loop with serial execution, 5-min throttle, drift-aware WhatsApp notifications |
| `helpers/tenant-notifications.js` | **Phase 9.5 + 9.6** — `checkTenantReminders` (15-min before, dedup via Set) + `sendTenantDailySchedules` (8 AM IST, dedup via Map, sends WhatsApp + HTML email) |

### 📁 EXISTING FILES MODIFIED

| File | Changes |
|------|---------|
| `helpers/tenant-router.js` | All Phase 7 features wired in; `pendingLedgers` state; persistent `dbSelections`; image/chart/ledger branches; `aiPlanAndSQL` accepts `{mode, imageCols}` |
| `helpers/whatsapp.js` | `sendWhatsAppMedia` now picks MIME from file extension (.csv→text/csv, .pdf, .xlsx, .png, .jpg, .gif, .webp) |
| `helpers/sync.js` | `getGids()` auto-discovery + tab name aliases |
| `server.js` | smart-format import; new formatter; `runSQLWithRetry`; `fuzzyFallbackMis`; `MIS_ENTITY_COLS`; "ADVANCED RULES (Phase 8 backport)" prompt section |

### 🔧 RESUME COMMANDS

```bash
# Server status
pm2 status

# Test public URL
curl -s https://saranshs-macbook-air.taile7a14d.ts.net/health

# Verify OpenAI quota
node -e "fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:'hi'}],max_tokens:5})}).then(r=>r.json()).then(d=>console.log(d.error?.code||'OK'))"

# Verify tenant proper tables exist
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
sb.rpc('execute_sql', { query: \"SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'tenant_%'\" }).then(r => console.log(r.data));
"

# Test current DB selection (Saransh's phone should be on MIS Main)
cat .db_selections.json
```

### 🚦 DECISION POINTS FOR NEXT SESSION

1. **Confirm with user**: Phase 9 (communication features) OR Phase 10 (self-healing hardening) first?
2. **Recommended: Phase 10** — it makes everything more robust before adding new features. User explicitly flagged this as "special ask".
3. **One phase at a time** — full test cycle between sub-tasks
4. **Update roadmap after each phase** — mark completed tasks

---

## 📚 ORIGINAL ROADMAP (HISTORICAL)



---

## 🔄 RESUME INSTRUCTIONS (For New Chat Session)

#### Phase 9 — TENANT COMMUNICATION FEATURES (4 hr) ✅
**Goal:** Add MIS Main's communication features (voice, email, reminders) to tenants.

| # | Task | Effort | Status |
|---|------|--------|--------|
| 9.1 | Voice/Whisper for tenant (verify webhook flow + fix access gate) | 1 hr | ✅ |
| 9.2 | Auto-sync every 15 min per tenant (cron loop) | 1.5 hr | ✅ |
| 9.3 | Chat history logging for tenant queries | 30 min | ✅ |
| 9.4 | Booking confirmation email per tenant (Gmail) | 1.5 hr | ✅ |
| 9.5 | Meeting reminders (15 min before) per tenant | 1 hr | ✅ |
| 9.6 | Daily 8 AM schedule per tenant | 1.5 hr | ✅ |

#### Phase 10 — SELF-HEALING HARDENING (5 hr) ✅ — User's Special Ask
**Goal:** Make AI auto-recover from 85%+ of errors without human intervention.

| # | Task | Effort | Status |
|---|------|--------|--------|
| 10.1 | Fuzzy column name resolution (AI uses wrong col → suggest closest) | 1 hr | ✅ |
| 10.2 | Auto schema-change detection (sheet column added/removed → auto ALTER TABLE) | 1 hr | ✅ |
| 10.3 | Smart query fallbacks (relax filter on 0 rows, try simpler) | 1 hr | ✅ |
| 10.4 | Result validation (zero/null detection → re-prompt AI) | 30 min | ✅ |
| 10.5 | Health check auto-recovery (DB lost → wait + retry) | 30 min | ✅ |
| 10.6 | Better error classification (transient vs permanent) | 1 hr | ✅ |

#### Phase 11 — PRODUCTION POLISH (4-5 hr) — Optional
| # | Task | Effort | Status |
|---|------|--------|--------|
| 11.1 | Single source-of-truth refactor (MIS Main = "Tenant #0") | 3 hr | ⏭️ SKIPPED by user (2026-05-25) — risky, no immediate need |
| 11.2 | Comprehensive test suite | 1 hr | ✅ DONE (2026-05-25) — 131 tests, all passing |
| 11.3 | Roadmap + LEARNING_GUIDE.md update | 1 hr | ✅ Kept current per phase |

### 📊 Total Effort Summary

| Phase | Hours | Status |
|-------|-------|--------|
| Phase 7 | 5.5 hr | ✅ DONE (2026-05-25) |
| Phase 8 | 6.5 hr | ✅ DONE (2026-05-25) |
| Phase 9 | 4 hr | ✅ DONE (2026-05-25) |
| Phase 10 | 5 hr | ✅ DONE (2026-05-25) |
| Phase 11.2 | 1 hr | ✅ DONE (2026-05-25) — 131 tests |
| Phase 11.3 | 1 hr | ✅ Kept current per phase |
| Phase 11.1 | 3 hr | ⏭️ SKIPPED by user (2026-05-25) |
| **TOTAL** | **~28-30 hr** | **~22 hr done — PROJECT FROZEN AS-IS** |

### 🎯 What Was Done in Last Session (2026-05-25 morning)

**Phase 6 (Tenant Migration):**
- Created `helpers/tenant-tables.js` — smart type detection, value cleaning, dynamic CREATE TABLE
- Created `helpers/smart-format.js` — type-aware formatter (no ₹ on counts/qty)
- Rewrote `helpers/tenant-router.js` — multi-step AI (PLAN→SQL→Validate→Retry×3→Fuzzy)
- Updated `helpers/sheets.js` — `syncSheetToProperTables()` function
- Created `migrations/006_tenant_proper_tables.sql` — pg_trgm + execute_ddl + tenant_fuzzy_search RPC
- Updated `server.js` — new endpoints + use proper-tables sync
- Migration applied to Supabase (user pasted in SQL editor)
- MIS-2 tenant migrated: 800 SALES + 1291 PURCHASES rows

**Polish Fixes (after initial Phase 6):**
1. Formatter fallback when role-based format returns empty (Q1 month name bug)
2. AI prompt rule 14: include all requested metrics
3. `parseDate` + `formatDateIso` helpers added
4. `c_date_actual` DATE companion column auto-added at sync time
5. `titleCase` normalizes location values (SONEPAT → Sonepat)
6. AI prompt rule 16: cross-table JOIN support
7. AI prompt rule 17: line-item vs full-invoice amount disambiguation
8. AI prompt rule 18 + 19: language matching + median/percentile via PERCENTILE_DISC
9. `buildAggregateSummary()` — "📊 Total across N: ..." line for multi-row results
10. AI prompt rule 5 expanded: relative date filters using `c_date_actual`

**E2E Test Results:**
- 10/10 baseline queries: ALL working correctly
- 15/15 complex queries: 13 fully clean, 2 minor presentation issues (now fixed in polish round)
- Response time: 1.3s avg

**Files Modified This Session:**
- helpers/tenant-tables.js (NEW + polish)
- helpers/smart-format.js (NEW + polish)
- helpers/tenant-router.js (REWRITE + polish)
- helpers/sheets.js (UPDATE)
- server.js (UPDATE)
- migrations/006_tenant_proper_tables.sql (NEW)

### 🔧 Quick Status Check Commands

```bash
# Server running?
pm2 status

# Public URL responding?
curl -s https://saranshs-macbook-air.taile7a14d.ts.net/health

# Test tenant query (needs OpenAI working)
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { handleTenantQuery } = require('./helpers/tenant-router');
handleTenantQuery(sb, '918750285420', '18 April invoices kitne the?').then(r => console.log(r?.reply));
"

# Verify proper tables exist
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
sb.rpc('execute_sql', { query: \"SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'tenant_%'\" }).then(r => console.log(r.data));
"
```

### 🚦 Decision Points for Next Session

1. **Verify billing fixed** before starting Phase 7
2. **Confirm with user** whether to proceed with Phase 7 → 8 → 9 → 10 (or different order)
3. **One phase at a time** — full test cycle between phases
4. **Update roadmap after each phase** — mark completed tasks

---

## 📚 ORIGINAL ROADMAP (HISTORICAL)



---

## 🔄 RESUME INSTRUCTIONS (For New Chat Session)

### Step 1: Check server status
```bash
pm2 status
curl http://localhost:3000/health
```

### Step 2: Check if webhook is receiving
Send a WhatsApp message and check:
```bash
pm2 logs mis-chatbot --lines 10 --nostream | grep "WEBHOOK HIT"
```

### Step 3: If webhook NOT firing (current issue)
app.mis.work is not forwarding incoming messages to our server. Options:
1. Delete webhook on app.mis.work → wait 5 min → create new (URL: `https://saranshs-macbook-air.taile7a14d.ts.net/whatsapp`, Event: message, Method: POST_JSON, Channel: 46282)
2. Try ngrok: `ngrok http 3000` → use ngrok URL as webhook
3. Contact app.mis.work support

### Step 4: If server is down
```bash
pm2 start /Users/saranshrajput/Desktop/mis-chatbot/server.js --name mis-chatbot
caffeinate -s &
```

### Current Architecture
```
WhatsApp → Meta Cloud API Webhook → Tailscale Funnel → localhost:3000 → OpenAI + Supabase → reply via wa.apimis.in API
  Text: POST /whatsapp/sendMessage {to, text}
  Media: POST /whatsapp/meta/sendMessage {to, message: {type, [type]: {id/link, caption}}}
  Upload: POST /whatsapp/meta/media/upload (FormData)
```

### Key Files Changed This Session
- `server.js` — Access control API endpoints, LIMITED access filter, GET /sync endpoint, sendProductImages fix (use /meta/sendMessage)
- `helpers/whatsapp.js` — sendWhatsAppMedia fix (use /meta/sendMessage for media, /sendMessage for text)
- `helpers/sync.js` — Access control sync with permissions (can_view_* columns)
- `helpers/sheets-write.js` — NEW: Google Sheets API v4 write operations
- `helpers/utils.js` — Access control functions
- `public/access-control.html` — NEW: Beautiful access control panel UI
- `access_control.json` — User permissions file (auto-synced from Google Sheet)
- `package.json` — Added googleapis dependency

### Google Sheet Updates
- **ACCESS_CONTRO tab** (GID: 91964318) — 11 columns with dropdowns:
  - A-D: phone_number, name, access_mode, status
  - E-K: can_view_sales, can_view_expenses, can_view_pending, can_view_ledger, can_view_products, can_view_delegation, can_view_checklist
  - Dropdowns: access_mode (ALL/LIMITED/BLOCKED), status (active/blocked), permissions (YES/NO)

---

## 🔑 CREDENTIALS & LINKS (Quick Reference)

| Item | Value |
|------|-------|
| **Public URL** | `https://saranshs-macbook-air.taile7a14d.ts.net/` |
| **Webhook URL** | `https://saranshs-macbook-air.taile7a14d.ts.net/whatsapp` |
| **Health Check** | `https://saranshs-macbook-air.taile7a14d.ts.net/health` |
| **Onboarding** | `https://saranshs-macbook-air.taile7a14d.ts.net/onboard.html` |
| **Google Sheet (Data)** | `https://docs.google.com/spreadsheets/d/1ZJVFQ5zETwqoiZ5isqRxcKzLzLRwrLiFjqLwEqATBw4/edit` |
| **Old Sheet (Archive)** | `https://docs.google.com/spreadsheets/d/1iNVOUtLk7sRGx-JkttGRd8jkWaIzAwkMoyBzA70OmDc/edit` |
| **Supabase Dashboard** | `https://supabase.com/dashboard/project/bjrrlikjinhcbkyherim` |
| **Google Cloud Console** | Project: `logical-craft-438704-n8` (254277563295) |
| **Service Account** | `mis-calendar-bot@logical-craft-438704-n8.iam.gserviceaccount.com` |
| **OAuth2 Client ID** | `254277563295-t3cfpn53ksb73ofoebhc35m7o6o9o93a.apps.googleusercontent.com` |
| **OAuth2 Redirect URI** | `https://saranshs-macbook-air.taile7a14d.ts.net/api/tenant/calendar/callback` |
| **Calendar ID** | `saranshrajput1301@gmail.com` |
| **WhatsApp Platform** | Official Meta WhatsApp Business API (Cloud API v21.0) via wa.apimis.in |
| **Video Calls** | Jitsi Meet (`https://meet.jit.si/MIS-{title}-{random}`) |

### wa.apimis.in API Endpoints (Discovered 2026-05-21)
| Endpoint | Method | Purpose | Format |
|----------|--------|---------|--------|
| `/api/v1/whatsapp/sendMessage` | POST | Send TEXT only | JSON: `{to, text}` |
| `/api/v1/whatsapp/meta/sendMessage` | POST | Send MEDIA (image/document) | JSON: `{to, message: {type, [type]: {id/link, caption}}}` |
| `/api/v1/whatsapp/meta/media/upload` | POST | Upload file → get metaMediaId | FormData: `{messaging_product, file}` |
| `/api/v1/whatsapp/media/mediaDetail/{id}` | GET | Get media details/download | Headers: x-api-key, x-phone-id |

### Environment Variables (.env)
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Database connection |
| `SUPABASE_ANON_KEY` | Public client key |
| `SUPABASE_SERVICE_KEY` | Admin access key |
| `OPENAI_API_KEY` | GPT + Whisper API |
| `WA_ACCESS_TOKEN` | Meta WhatsApp Cloud API access token |
| `WA_PHONE_ID` | Meta WhatsApp Phone Number ID (291929770661925) |
| `GMAIL_APP_PASSWORD` | Email notifications (App Password) |
| `WEBHOOK_SECRET` | WhatsApp webhook validation (optional header) |
| `ADMIN_API_KEY` | Admin API auth — required for /access, /sync, /api/tenant/*, DELETE /history |
| `PORT` | 3000 |

### Admin API Key (for protected endpoints)
```
037beb1bd04c8051dbcbde92d43f76c64cce12172cd9eefcb85a2e3e1fc82a12
```
**Usage:** Send as header `x-api-key: <key>` on all admin endpoints:
- `GET/POST /access` — Access control config
- `POST /api/access/add-user` — Add user
- `GET/POST /sync` — Trigger data sync
- `POST /api/tenant/register` — Register tenant
- `POST /api/tenant/update` — Update tenant
- `DELETE /history/:sid` — Delete chat history
- `GET /api/access/users` — List users
- `POST /api/access/setup` — Setup sheet columns

### Google Sheet Tabs (Auto-Sync Every 15 min)
| Tab | GID | Supabase Table | Rows |
|-----|-----|----------------|------|
| SALES | 0 | sales | 1,316 |
| EXPENSES | 1821314686 | expenses | 1,807 |
| PENDING | 1139038815 | pending | 150 |
| LEDGER | 787078297 | ledger | 2,187 |
| PRODUCTS | 1842741177 | products | 2,606 |
| DELEGATION | 777508230 | delegation_tasks | 64 |
| CHECKLIST | 1816368466 | checklist_tasks | 593 |
| SCORES | 1700278726 | scores | 310 |
| **ACCESS_CONTRO** | **91964318** | **access_control.json** | **37** |

---

## 🆕 NEW FEATURES ADDED (2026-05-21 Session 3 — Tenant System Overhaul)

### Multi-Tenant System Major Upgrades ✅

**Problem:** Tenant system had multiple limitations — single tab sync, wrong calculations, missing data, no confirmation.

**All Fixes Applied (2026-05-21 17:00–18:35 IST):**

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Only gid=0 (first tab) synced | ✅ Auto-discovers ALL tabs via `/htmlview` endpoint |
| 2 | No sync confirmation to user | ✅ WhatsApp msg sent after sync: "✅ Sheet Sync Complete! 📊 Total Rows: X" |
| 3 | Supabase 1000 row default limit | ✅ Pagination added — fetches ALL rows (unlimited) |
| 4 | AI math errors (wrong totals) | ✅ **2-Step Architecture**: AI plans → Code calculates → AI formats |
| 5 | Only 100 rows sent to AI | ✅ Smart filtering sends relevant rows (entity match) |
| 6 | "Sure! Here's the reply" meta text | ✅ Stripped from AI output |
| 7 | `**bold**` not rendering on WA | ✅ Converted to `*bold*` (WhatsApp format) |
| 8 | Individual invoice amounts wrong | ✅ `getUniqueEntries` now uses correct InvoiceAmount column |
| 9 | Only 3-5 entries shown | ✅ ALL unique entries shown (grouped by voucher number) |
| 10 | `_waReply` missing supabase arg | ✅ Fixed to use `sendWhatsAppReply` wrapper |

### New Architecture: 2-Step Query Execution ✅

**Old approach (broken for math):**
```
User question → Send raw JSON rows to AI → AI calculates (WRONG) → Reply
```

**New approach (exact calculations):**
```
User question → AI generates PostgreSQL SQL (with JSONB operators) → Supabase execute_sql runs it → AI formats result → Reply
```

**Files Modified:**
- `helpers/tenant-router.js` — Complete rewrite: SQL-on-JSONB architecture (permanent fix)
- `helpers/sheets.js` — `discoverAllGids()` + multi-tab `syncSheetToSupabase()`
- `server.js` — WhatsApp confirmation after tenant sync, no-fallthrough on error

**Architecture (SQL-on-JSONB — Permanent Fix 2026-05-21 22:30 IST):**
```
OLD (broken — patched 5 times, still had issues):
  Sheet → tenant_data (JSONB) → AI plan → JS in-memory math → AI format
  Problems: wrong totals, duplicate counting, formatting errors, timeouts

NEW (solid — uses same proven approach as main chatbot):
  Sheet → tenant_data (JSONB) → AI generates SQL with row_data->>'col' → execute_sql RPC → format
  Benefits: exact math by PostgreSQL, native deduplication, GROUP BY, no timeouts
```

**Key Technical Details:**
- `generateSQL()` — AI generates PostgreSQL query using `row_data->>'Column Name'` JSONB syntax
- Deduplication: `DISTINCT ON (row_data->>'Voucher_Numbe')` in subquery
- Numeric casting: `NULLIF(REPLACE(REPLACE(row_data->>'col', ',', ''), '"', ''), '')::numeric`
- Date filtering: `row_data->>'Date' ILIKE '%Apr%'`
- No CTE/WITH allowed (execute_sql wraps in subquery)
- Single AI call for SQL generation (gpt-4o-mini) + 1 for formatting = 2 calls total
- No in-memory data fetching — all computation in PostgreSQL

**Test Results (2026-05-21 22:30 IST):**
- "Total sales kitni hai?" → ₹24,41,50,555.82 (exact ✅)
- "Kitne invoices hain?" → 278 (deduplicated ✅)
- "Average invoice value?" → ₹8,94,324.38 (exact ✅)
- "Har SP ka average invoice, highest to lowest" → Akash ₹25,05,582, Vikas C ₹20,64,599... (exact ✅)
- "City wise top 5 sales" → RAISEN 32 inv ₹6.44Cr, Gohana 19 inv ₹3.18Cr... (✅)
- "Per KG rate sabse zyada?" → SSC Projects ₹8,286.44 (✅)
- "Foundation Bolt quantity + amount?" → 88,242 KG (✅)
- Response time: ~10-12 seconds (vs 30s+ timeout before)


---

## 🆕 NEW FEATURES ADDED (2026-05-21 Session)

### 1. Advanced Access Control System ✅
**Google Sheet-based user management with granular permissions**

**Features:**
- ✅ Google Sheet as source of truth for user access
- ✅ Auto-sync every 15 min (manual: WhatsApp "sync" or `/sync` endpoint)
- ✅ 3 access modes: ALL, LIMITED, BLOCKED
- ✅ 2 status modes: active, blocked
- ✅ Table-wise permissions (7 toggles per user):
  - can_view_sales
  - can_view_expenses
  - can_view_pending
  - can_view_ledger
  - can_view_products
  - can_view_delegation
  - can_view_checklist

**How it works:**
1. Add user in Google Sheet (ACCESS_CONTRO tab)
2. Set access_mode (ALL/LIMITED/BLOCKED)
3. Set status (active/blocked)
4. For LIMITED users: toggle YES/NO for each table
5. Sync automatically (15 min) or manually (WhatsApp: "sync")
6. User queries filtered based on permissions

**LIMITED Access Logic:**
- Filters data by user's name in relevant columns
- Sales: `sales_person` or `contact_person` = user name
- Pending: `sales_person` = user name
- Delegation: `delegated_to` or `delegate_from` = user name
- Checklist: `assigned_to` = user name
- Only shows tables where `can_view_*` = YES

**Files:**
- `helpers/sheets-write.js` — Google Sheets API v4 write operations
- `helpers/sync.js` — Reads permissions from Sheet
- `server.js` — Applies filters based on access mode
- `access_control.json` — Cached permissions (auto-updated)

### 2. Access Control Web Panel ✅
**Beautiful UI for managing users** (optional, Sheet is primary)

**URL:** `https://saranshs-macbook-air.taile7a14d.ts.net/access-control.html`

**Features:**
- 📊 Live stats dashboard (total/active/limited users)
- 📋 User list with all permissions visible
- ➕ Add new user via modal form
- 🎛️ Toggle switches for each permission
- 🎨 Modern gradient UI
- 🔄 Auto-refresh every 30 seconds

**API Endpoints:**
- `GET /api/access/users` — Get all users
- `POST /api/access/add-user` — Add new user to Sheet
- `POST /api/access/setup` — Setup Sheet columns (one-time)

### 3. Sync Improvements ✅
- ✅ GET /sync endpoint (browser-friendly)
- ✅ POST /sync endpoint (API-friendly)
- ✅ WhatsApp admin command: "sync" (ALL access only)
- ✅ Access control syncs with all data

---

## 🚨 CURRENT ISSUES (2026-05-21 16:22 IST)

### Issue #1: app.mis.work Webhook Not Firing ⚠️
**Status:** ✅ FIXED — Migrated to Meta Cloud API via wa.apimis.in

**What Works Now (ALL FIXED 16:48 IST):**
- ✅ Text messages: Bot replies correctly
- ✅ PDF generation & sending (ledger queries)
- ✅ Image sending (product photos)
- ✅ Chart image sending (monthly sales etc.)
- ✅ Image by URL (product image_link)

**Root Cause Found & Fixed:**
The `wa.apimis.in` API has TWO endpoints:
1. `/whatsapp/sendMessage` — TEXT ONLY (accepts `{to, text}` as JSON)
2. `/whatsapp/meta/sendMessage` — MEDIA (accepts `{to, message: {type, [type]: {id/link, caption}}}` as JSON)

Previously all media was being sent via `/sendMessage` which only sent the caption as text.

**Fix Applied (2026-05-21 16:45 IST):**
- `helpers/whatsapp.js` → `sendWhatsAppMedia()` now uses `/meta/sendMessage` with uploaded mediaId
- `server.js` → `sendProductImages()` now uses `/meta/sendMessage` with image link
- Format: `{ to, message: { type: "image"|"document", [type]: { id: mediaId, caption, filename? } } }`
- Image by link: `{ to, message: { type: "image", image: { link: url, caption } } }`

---

## ✅ COMPLETED & DEPLOYED (Phase 1 & 2)

### Phase 1 - Security & Cleanup ✅
- ✅ **Bug #1:** PDF function nesting fix (syntax cleanup)
- ✅ **Bug #2:** WA API key moved to .env (security) - New key: `34558426bf...`
- ✅ **Bug #3:** Phone validation fix (proper error handling)
- ✅ **Bug #5:** Confirmed Railway deployment (no Vercel migration)
- ✅ **Issue #8:** Python service key moved to .env (security)
- ✅ **Issue #14:** Cleanup temporary files (code hygiene)

### Phase 2 - Safety & Organization ✅
- ✅ **Issue #7:** SQL safety Layer 1 (code-side validation - only SELECT allowed, ::numeric casting enforced)
- ✅ **Issue #9:** Sync upsert pattern (transaction-safe, no data loss on failure)
- ✅ **Issue #15:** Config file created (magic numbers organized)

### Deployment Fixes ✅
- ✅ **OpenAI API Key:** Updated to new key (old key expired)
- ✅ **Railway Environment:** Fixed dotenv conflict (conditional loading based on RAILWAY_ENVIRONMENT)
- ✅ **Supabase RPC Permissions:** Granted execute permissions to service_role, anon, authenticated
- ✅ **Environment Variables:** All 6 variables properly set on Railway

### Bug Fixes (2026-05-20) ✅
- ✅ **PDF Emoji Rendering:** Fixed garbled chars `Ø=ÜÄ` in PDF "View PDF" / "View Link" cells
  - Cause: PDFKit default Helvetica font lacks emoji glyphs
  - Fix: Removed emoji prefix in `generateDataPDF` (server.js:350) — link still clickable, blue, underlined

**Status:** ~~Railway~~ → Migrated to Local Server

---

### Bug Fixes (2026-05-21) ✅
- ✅ **Calendar Confirm Flow:** Fixed multi-turn broken — "Haan"/"Yes" now correctly books meeting
  - Cause: `executePlan()` _intent state intercepted follow-up before `handleCalendarIntent`
  - Fix: Added early-return for calendar states before AI call (same pattern as image_confirm)
- ✅ **Calendar Cancel Flow:** Reason selection (1-5) now works — same root cause & fix
- ✅ **API Key Leak:** Removed `First 20 chars: sk-proj-...` from every request log
- ✅ **Stack Trace Leak:** Malformed JSON now returns `{"error":"Invalid JSON"}` (not file paths)
- ✅ **SQL Safety:** Added `runSQL()` code-level validation — only SELECT allowed
- ✅ **session_id/sessionId:** Web chat API now accepts both camelCase and snake_case
- ✅ **Media Sending FIXED:** PDF, images, and charts now actually send as files (not text)
  - Cause: `/sendMessage` endpoint only sends text. Media requires `/meta/sendMessage`
  - Fix: `sendWhatsAppMedia()` → upload + `/meta/sendMessage` with `{to, message: {type, [type]: {id, caption}}}`
  - Fix: `sendProductImages()` → `/meta/sendMessage` with `{to, message: {type: "image", image: {link, caption}}}`

---

## 🚨 CURRENT ISSUE (2026-05-21 13:15 IST) — WEBHOOK NOT FIRING

**Problem:** app.mis.work receives WhatsApp messages (visible in Incoming Messages) BUT does NOT fire webhook to our server. Server is 100% working — tested via curl.

**Root Cause:** Earlier, a 20-meeting recurring booking took 30+ seconds → app.mis.work webhook timed out → their system stopped delivering to our URL.

**What was tried:**
- Deleted old Google Script webhook ✅
- Created new webhook with correct URL ✅  
- Retry past 24 hours — retry count: 0 (nothing to retry)
- Server responds in 0.05s now (instant response fix applied)
- URL is reachable externally (SSL valid, HTTP 200)

**Fix Applied (server side):** Webhook now responds instantly (`res.json` before processing) — will never timeout again.

**Pending Fix (app.mis.work side):**
- Try: Delete webhook again → wait 5 min → create new one
- Try: Contact app.mis.work support to reset webhook queue
- Try: Use ngrok (`ngrok http 3000`) as alternative public URL temporarily
- Try: Check if "Linked device" is still connected on app.mis.work

**Once webhook starts firing again, everything will work — server tested and verified.**

---

## ✅ PHASE G + H + EMAIL + MEET LINKS (2026-05-21)

### Phase G — Security Hardening ✅
- ✅ **Webhook Authentication:** Added `X-Webhook-Secret` header validation (disabled — app.mis.work doesn't support custom headers)
- ✅ **Read-only DB Role:** Migration `002_readonly_role.sql` created (run in Supabase SQL Editor)
- ✅ **Code-level SQL safety:** `runSQL()` only allows SELECT (already existed)

### Phase H — Full Data Sync (Google Sheet) ✅
- ✅ **Migrated data source:** SARANSH.xlsx → New Google Sheet (`1ZJVFQ5zETwqoiZ5isqRxcKzLzLRwrLiFjqLwEqATBw4`)
- ✅ **All 8 tables syncing:** Sales, Expenses, Pending, Ledger, Products, Delegation, Checklist, Scores
- ✅ **Auto-sync every 15 min** from Google Sheet → Supabase
- ✅ **Manual sync:** `POST /sync` endpoint
- ✅ **Product descriptions:** 1393/2606 products have descriptions (from old sheet)
- ✅ **Service account access:** `mis-calendar-bot@...` has Editor access to sheet

### Email Notifications Fixed ✅
- ✅ **Gmail App Password:** Replaced OAuth2 (which doesn't work with personal Gmail)
- ✅ **Working:** Booking confirmations, cancellation alerts, daily schedule emails
- ✅ **Env var:** `GMAIL_APP_PASSWORD` in .env

### Jitsi Meet Links ✅
- ✅ **Auto-generated:** Every booking gets `https://meet.jit.si/MIS-{title}-{random}`
- ✅ **Shown in:** WhatsApp confirmation + Email + Google Calendar description
- ✅ **Free:** No account needed, anyone with link can join
- ✅ **Why Jitsi:** Google Meet requires Workspace (paid). Jitsi = same UX, free.

### Bug Fixes (2026-05-21 Session 2) ✅
- ✅ **Calendar multi-turn broken:** Follow-up (name/date) lost to DATA_QUERY. Fixed: `calendar_booking_pending` state + early-return
- ✅ **Calendar hijacking data queries:** Stale state caught unrelated messages. Fixed: keyword detection breaks out of pending state
- ✅ **Aggregation display "1 records found":** SUM/COUNT showed raw row. Fixed: smart detection for 1-row aggregation results
- ✅ **Supabase .catch() crash:** Invalid syntax. Fixed: `.then().catch()`
- ✅ **Chat history not loaded (WhatsApp):** Was `chatHistory: []`. Fixed: loads last 10 messages for context
- ✅ **AI search too literal:** Full phrase in wrong column. Fixed: General SMART SEARCH RULES — AI extracts key word + correct name column
- ✅ **Webhook auth blocking messages:** app.mis.work doesn't support headers. Removed auth

---

## ✅ LOCAL SERVER DEPLOYMENT (2026-05-20) — Phase 3

### Migration: Railway → Local Mac + Tailscale Funnel ✅
- ✅ **Server:** Running on PM2 (auto-restart on crash)
- ✅ **Public HTTPS:** Tailscale Funnel → `https://saranshs-macbook-air.taile7a14d.ts.net/`
- ✅ **Webhook Endpoint:** `POST /whatsapp` responding (HTTP 200)
- ✅ **Data Sync:** All 4 sheets syncing (2606 products, 64 delegation, 593 checklist, 311 scores)
- ✅ **Sleep Prevention:** `caffeinate -s` running (Mac won't sleep)
- ✅ **PM2 Persistence:** Process list saved, startup configured for launchd
- ✅ **Schema:** 8 tables loaded (checklist_tasks, delegation_tasks, expenses, ledger, pending, products, sales, scores)

### Why Local Instead of Railway/Oracle?
- **Railway:** Free tier limited ($5 credits), sleeps after inactivity
- **Oracle:** Complex setup, networking issues, ARM compatibility problems
- **Local + Tailscale:** Free, fast, full control, no cold starts, no limits

### Architecture
```
Internet (WhatsApp webhook)
    ↓ HTTPS
Tailscale Funnel (free TLS cert, public URL)
    ↓
localhost:3000 (PM2 managed Node.js)
    ↓
Supabase (PostgreSQL) + OpenAI API
```

### Commands Reference
```bash
# Server management
pm2 status                    # Check server status
pm2 restart mis-chatbot       # Restart server
pm2 logs mis-chatbot          # View logs

# Tailscale
tailscale funnel status       # Check funnel
tailscale status              # Check connection

# Sleep prevention
caffeinate -s &               # Prevent Mac sleep (run after restart)
```

### 📌 PENDING MANUAL STEPS (User Must Do)
1. **PM2 Startup (one-time):** Run in terminal:
   ```bash
   sudo env PATH=$PATH:/usr/local/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup launchd -u saranshrajput --hp /Users/saranshrajput
   ```
2. **app.mis.work Webhook URL Update:**
   - Login to app.mis.work admin panel
   - Change Webhook URL to: `https://saranshs-macbook-air.taile7a14d.ts.net/whatsapp`
   - Save

### 🔄 SERVER MANAGEMENT (Manual Commands)

**Start server (after Mac restart / first time):**
```bash
pm2 start /Users/saranshrajput/Desktop/mis-chatbot/server.js --name mis-chatbot
caffeinate -s &
```

**Check if server is running:**
```bash
pm2 status
```

**Restart server (after code changes):**
```bash
pm2 restart mis-chatbot
```

**View logs (for debugging):**
```bash
pm2 logs mis-chatbot --lines 30
```

**Stop server:**
```bash
pm2 stop mis-chatbot
```

**Full restart (if something is broken):**
```bash
pm2 delete mis-chatbot
cd ~/Desktop/mis-chatbot
pm2 start server.js --name mis-chatbot
pm2 save
```

**Check Tailscale public URL:**
```bash
tailscale funnel status
curl -s https://saranshs-macbook-air.taile7a14d.ts.net/
```

### 🤖 AI ASSISTANT INSTRUCTIONS (For Future Sessions)
> Every new chat session mein:
> 1. **Server check karo:** `pm2 status` run karo — confirm "online"
> 2. **Public URL test karo:** `curl https://saranshs-macbook-air.taile7a14d.ts.net/` — should return HTML (HTTP 200)
> 3. **Webhook test karo:** `curl -s -X POST https://saranshs-macbook-air.taile7a14d.ts.net/whatsapp -H "Content-Type: application/json" -d '{"message":"test","senderNumber":"919999999999"}'` — should return `{"success":true}`
> 4. **After any code change:** `pm2 restart mis-chatbot` mandatory
> 5. **New feature deploy = restart + test:** Har code update ke baad server restart karo aur public URL test karo
> 6. **If anything fails:** Check `pm2 logs mis-chatbot --lines 20` and `tailscale funnel status`
> 7. **Ask user (if not done yet):**
>    - "Kya PM2 startup sudo command run kiya?" (one-time)
>    - "Kya webhook URL update kiya app.mis.work pe?" (one-time)
>    - Agar user bole "haan" → mark as done below

### ✅ ONE-TIME SETUP VERIFICATION (AI must check these)
- ✅ **PM2 Startup:** Verified — `pm2 status` shows "online" (2026-05-20)
- ✅ **Webhook URL Updated:** Verified — POST /whatsapp returns `{"success":true}` (2026-05-20)

### ⚠️ Limitations (Local Server)
1. **Mac must stay ON** — if Mac shuts down/restarts, server stops until you login
2. **Internet required** — WiFi/LAN must be connected for Tailscale
3. **After Mac restart:** Run `caffeinate -s &` manually (PM2 auto-starts but caffeinate doesn't)
4. **Tailscale app must be running** — opens automatically on login

### 🛡️ Reliability Tips
- Keep MacBook plugged in (charger)
- Don't close lid (or set clamshell mode with external display)
- PM2 handles server crashes automatically
- Tailscale reconnects automatically after network changes

**Status:** 🚀 **LIVE ON LOCAL MAC** - Tailscale Funnel public access ✅

---

## 🧪 TESTING STATUS

### ✅ Working Features
- Server startup and initialization
- Supabase connection and schema loading
- Auto-sync (every 15 minutes): 2606 products, 64 delegation tasks, 593 checklist tasks, 311 scores
- WhatsApp webhook receiving messages
- Simple aggregation queries: "Total expenses kitni hain?" → ₹2,83,82,103
- Specific date queries: "April 2026 ki sales kitni thi?" → ₹13,12,850
- SQL safety: DROP/DELETE/UPDATE blocked
- Amount type casting: SUM(amount::numeric) working

### ⚠️ Known Issues
- ~~**Relative date queries:**~~ ✅ Fixed (2026-05-20) — Added post-processing guard that overrides query_type:"chart" → "data" for relative date patterns

---

## 📂 GOOGLE APPS SCRIPT SYSTEMS (Documented 2026-05-20)

### System 1: AI Database Chatbot (Script ID: `1wqzwbHq1xO4AgEiELXgOKqstmziIkdbmMbyK5fPHvE-eCX0jR32_zLxO`)

**Purpose:** Natural language inventory/stock query chatbot
**Channels:** WhatsApp (Professional + Unprofessional) + Telegram
**AI Models:** OpenAI GPT + Google Gemini (switchable via config)

**Features:**
- AI-powered inventory queries via text & voice (WhatsApp + Telegram)
- Voice-to-text transcription (OpenAI Whisper + Gemini)
- Context-based answers from "STOCK Context" Google Sheet
- Access control: ALL / LIMITED (own data) / LIST (approved numbers)
- Telegram bot with `/start` registration & welcome flow
- Message auto-sender (bulk/scheduled)
- File sharing (Drive → base64 → WhatsApp)
- PDF export & send (Sheets → PDF → WhatsApp)
- Incoming message logging (LOGS sheet)
- Domain-based license verification

**Files:** `MASTER CODE OPEN AI.js`, `profapi.js`, `msgautosender.js`, `telegram.js`, `telegram config.js`

---

### System 2: AI Driven Delegation System (Script ID: `1Yx2Pd9U1KVc5c0_aTsFSojXblucoFLLhYqfhm8xAoTgRGFLmdpspPkjR`)

**Purpose:** Voice-based Google Calendar booking, retrieval & cancellation
**Channels:** WhatsApp (Professional + Unprofessional) + Telegram
**AI Models:** OpenAI GPT + Google Gemini (switchable via config)

**Features:**
- Voice-based calendar booking (audio → AI → Google Calendar event)
- Multi-turn conversation (follow-up questions for missing info)
- Intent detection: BOOKING / RETRIEVAL / CANCEL / IGNORE
- Smart guest matching (phonetic correction, disambiguation menu)
- Google Calendar full integration (create, delete, recurring series)
- Recurring meetings: DAILY, WEEKLY, MONTHLY with auto-rules
- Conflict detection (warns about overlapping events before booking)
- Meeting retrieval ("aaj ki meetings", "this week", "Archit ke saath")
- Meeting cancellation (single event or full series, confirmation flow)
- Pre-booking summary with YES/NO confirmation
- Google Meet link auto-generation (venue = "meet")
- Priority system: High 🔴, Medium 🟡, Low 🟢 (calendar colors)
- Rich HTML confirmation emails (booking + cancellation)
- State management via PropertiesService (multi-turn conversations persist)
- Date resolution AI (separate call for ambiguous/missing dates)
- Past date detection & re-ask
- Media S3 path retrieval (WA audio → S3 → download → transcribe)
- Booking data logging to "BOOKING DATA" sheet
- Meeting reminders (15 min before, via WhatsApp)
- Live 🟢 / Soon 🔔 badges in retrieval

**Files:** `MASTER CODE.js`, `openai.js`, `gemini.js`, `email.js`, `wa code both.js`, `telegram.js`, `_cancel-event.js`, `_fetch-event.js`

---

### System 3: (Script ID: `15JJHgMrI4lg73J96U7PcSjmROWKRt0EcUJ3O86Fxui7oVQ2O44ga_rVG`)
- Empty project (only `appsscript.json`, no code)

---

### Apps Script Architecture Summary
```
┌─────────────────────────────────────────────────┐
│         CHANNELS (Input)                         │
│  WhatsApp (Pro/Unpro)  +  Telegram              │
└──────────────────┬──────────────────────────────┘
                   ↓ Webhook (doPost)
┌─────────────────────────────────────────────────┐
│         AI LAYER                                 │
│  OpenAI GPT (Whisper + Chat)                    │
│  Google Gemini (Audio + Text)                   │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│         ACTIONS                                  │
│  Chatbot: Query inventory → Reply              │
│  Delegation: Book/Cancel/Retrieve Calendar      │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│         DATA LAYER                               │
│  Google Sheets (config, logs, data)             │
│  Google Calendar (events, recurring)            │
│  Gmail (HTML confirmation emails)               │
└─────────────────────────────────────────────────┘
```

**Local Code Path:** `~/Desktop/mis-chatbot/scripts/`
- `chatbot-script/` — AI Database Chatbot
- `delegation-script/` — AI Driven Delegation System
- `third-script/` — Empty

---

## ⚠️ CURRENT LACKS (What's Missing vs Google Sheets Version)

### 🔴 CRITICAL (Must fix for parity)
| # | Missing Feature | Impact | Fix Effort |
|---|-----------------|--------|------------|
| ~~1~~ | ~~**Voice/Audio support**~~ | ~~Audio messages completely ignored~~ | ✅ Fixed (Phase B) |
| ~~2~~ | ~~**Relative date queries broken**~~ | ~~"Last 30 days" returns wrong query_type~~ | ✅ Fixed (post-processing guard) |
| ~~3~~ | ~~**Sessions in-memory only**~~ | ~~Server restart = all sessions lost~~ | ✅ Fixed |

### 🟡 IMPORTANT (Sheets version had, we don't)
| # | Missing Feature | Impact | Fix Effort |
|---|-----------------|--------|------------|
| 4 | **Access Control (3 modes)** | Anyone can query anything — no user filtering | ✅ Fixed |
| ~~5~~ | ~~**Message Logging to DB**~~ | ~~Incoming messages not saved in database~~ | ✅ Fixed |
| 6 | **Proper error replies** | On failure, user gets no/bad response | ✅ Fixed |
| 7 | **Audio reply support** | Sheets version handled audio replies too | 1 hr |

### 🟢 CALENDAR SYSTEM (✅ COMPLETED — Phases D/E/F)
| # | Feature | Status |
|---|---------|--------|
| 8 | Calendar booking (voice/text → Google Calendar) | ✅ |
| 9 | Meeting retrieval ("aaj ki meetings") | ✅ |
| 10 | Meeting cancel/reschedule | ✅ |
| 11 | Recurring meetings (Daily/Weekly/Monthly) | ✅ |
| 12 | Daily morning schedule reminder | ✅ |
| 13 | Booking confirmations (WhatsApp + Email) | ✅ |
| 14 | Meeting reminders (15 min before) | ✅ |
| 15 | Rescheduling support | ⏸️ |
| 16 | Cancellation reason tracking | ✅ |

### ⚪ NICE-TO-HAVE (Not critical, do later)
| # | Missing Feature | Fix Effort |
|---|-----------------|------------|
| 17 | Webhook authentication | 1 hr |
| ~~18~~ | ~~Rate limiting~~ | ✅ Done |
| 19 | Smart caching (5 min TTL) | ✅ Done (Phase A) |
| ~~20~~ | ~~Code modularization (server.js = 1500+ lines)~~ | ✅ Done |

### ✅ WHAT'S WORKING FINE
- Text queries → SQL → Supabase → Answer ✅
- WhatsApp webhook (receive + reply) ✅
- PDF generation & send ✅ (FIXED 2026-05-21 16:45)
- Ledger queries (fuzzy search + PDF) ✅
- Product image sending ✅ (FIXED 2026-05-21 16:45)
- Chart generation & send ✅ (FIXED 2026-05-21 16:45)
- Auto-sync from Sheets (every 15 min) ✅
- SQL safety (only SELECT) ✅
- Server stable (PM2 managed, 0 restarts) ✅

---

## 📋 FUTURE ENHANCEMENTS — MASTER PLAN

### 🎯 GOAL: Replace Google Apps Script entirely with our Local Server
- **AI:** Only OpenAI GPT (no Gemini)
- **Database:** Only Supabase PostgreSQL (no Google Sheets as DB)
- **Server:** Single Node.js server (server.js) on local Mac
- **Channel:** WhatsApp (Unprofessional API - app.mis.work)

---

### 🔧 Phase A — POLISH EXISTING CHATBOT ✅ (Priority: COMPLETED)
> Make current chatbot as good as the Google Sheets version

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Fix relative date queries | "Last 30 days" should return data, not chart | 1 hr | ✅ Fixed |
| Improve AI prompt | Better SQL generation, handle edge cases | 2 hrs | ✅ |
| Error handling | Graceful responses for failed queries | 1 hr | ✅ |
| Access control (3 modes) | ALL / LIMITED / LIST — user-level filtering | 2 hrs | ✅ |
| Sessions to Supabase | Replace in-memory wpSessions → DB (restart-safe) | 2 hrs | ✅ |
| Smart caching | 5 min TTL for identical queries | 2 hrs | ✅ |
| Message logging | Log all incoming/outgoing messages to Supabase | 1 hr | ✅ |

---

### 🎤 Phase B — VOICE SUPPORT ✅ (Priority: COMPLETED)
> Add audio/voice message support like the Apps Script version

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Audio message handling | Detect audio/ptt in webhook payload | 1 hr | ✅ |
| Download audio from S3 | Get file from app.mis.work S3 path | 1 hr | ✅ |
| OpenAI Whisper integration | Audio → Text transcription | 1 hr | ✅ |
| Process transcribed text | Feed transcript to existing chatbot flow | 30 min | ✅ |

---

### 🧠 Phase C — INTENT DETECTION & MULTI-MODE ✅ (Priority: COMPLETED)
> Single AI call that classifies: DATA_QUERY / CALENDAR_BOOKING / CALENDAR_RETRIEVE / CALENDAR_CANCEL / IGNORE
> ⚠️ ALL features from Phase C onwards apply to BOTH platforms: WhatsApp + Web Chatbot

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Intent classification prompt | OpenAI detects intent from user message | 2 hrs | ✅ |
| Router logic | Route to correct handler based on intent | 1 hr | ✅ |
| Multi-turn state management | Store conversation state in Supabase | 3 hrs | ✅ |
| Follow-up questions | Ask for missing info (date, time, guest) | 2 hrs | ✅ |

---

### ✅ Phase D — CALENDAR BOOKING SYSTEM (COMPLETED 2026-05-20)
> Voice/text → AI → Google Calendar (full intelligent scheduling)

**✅ PRODUCTION READY:** Basic calendar booking system working with Google Calendar API

| Task | Description | Status |
|------|-------------|--------|
| Google Calendar API setup | OAuth2 + service account for Calendar access | ✅ |
| Event creation | Create single events with title, time, guest | ✅ |
| Recurring events | DAILY / WEEKLY / BIWEEKLY / FORTNIGHTLY / MONTHLY / CUSTOM | ✅ |
| Meeting retrieval | "Aaj ki meetings", "this week", by guest name | ✅ |
| Cancel single event | Delete one-time meeting with confirmation | ✅ |
| Cancel recurring events | Cancel single occurrence / all future / entire series | ✅ |

**🔧 ENHANCED IN PHASE E:** Added production-ready features for real-world use

---

### ✅ Phase E — CALENDAR PRODUCTION ENHANCEMENTS (COMPLETED 2026-05-20)
> Polish calendar system for production use with advanced features

**🚀 PRODUCTION FEATURES ADDED:**

| Feature | Description | Status |
|---------|-------------|--------|
| **Live/Soon Badges** | 🟢 LIVE / 🔔 SOON badges in meeting retrieval | ✅ |
| **Conflict Detection** | Warns about overlapping meetings before booking | ✅ |
| **Pre-booking Confirmation** | Shows meeting summary, asks YES/NO before creating | ✅ |
| **Cancellation Reasons** | Tracks why meetings cancelled (Client unavailable, Holiday, etc.) | ✅ |
| **Multi-turn Conversations** | Remembers context across multiple messages | ✅ |
| **Session State Management** | Persistent conversation state (restart-safe) | ✅ |
| **Recurring Meeting Fix** | "Every Friday" now works without asking confirmation | ✅ |

**🎯 WHAT WORKS NOW:**
- **Smart Booking:** "Archit ke saath har Monday 3 bje meeting book karo next 4 weeks"
- **Conflict Alerts:** System warns if time slot already occupied
- **Live Status:** Shows 🟢 LIVE for ongoing meetings, 🔔 SOON for starting soon
- **Reason Tracking:** "Meeting cancel karo client unavailable hai" → logs reason
- **Confirmation Flow:** Shows summary before booking, asks YES/NO
- **Multi-turn:** Handles follow-up questions and confirmations naturally

**📱 EXAMPLE CONVERSATIONS:**
```
User: "Next 3 weeks 1 bje k meeting gyan sir sath book krdo every friday"
Bot: ✅ 3 meetings booked! (weekly)
     📌 Meeting with gyan sir
     ⏰ 01:00 pm
     📅 Dates: 1. Fri, 23 May  2. Fri, 30 May  3. Fri, 6 Jun

User: "Aaj ki meetings batao"  
Bot: 📅 Aaj ki meetings (2):
     1. 🔔 SOON 02:00 PM (Wed, 20 May) — Team standup
     2. 04:30 PM (Wed, 20 May) — Client review

User: "Meeting cancel karo client unavailable"
Bot: 📅 Cancellation reason batao:
     1️⃣ Client unavailable  2️⃣ Holiday/Personal  3️⃣ Schedule conflict
User: "1"
Bot: ✅ Meeting cancelled! Reason: Client unavailable
```

---

### 📧 Phase F — NOTIFICATIONS & COMMUNICATION ✅ (COMPLETED 2026-05-20)
> WhatsApp + Email for all calendar events

**🚀 IMPLEMENTED:**

| Task | Description | Status |
|------|-------------|--------|
| Booking confirmation (WhatsApp) | Rich text message after booking | ✅ |
| Booking confirmation (Email) | HTML email to guest + owner after booking | ✅ |
| Cancellation alert (WhatsApp + Email) | Notify when cancelled | ✅ |
| Meeting reminder (15 min before) | WhatsApp reminder before meeting | ✅ |
| Daily morning schedule summary | Auto-send today's agenda at 8 AM IST (WhatsApp + Email) | ✅ |
| Booking data logging | Log all bookings to Supabase calendar_logs table | ✅ |

**Architecture:**
- Email: nodemailer + Gmail OAuth2 (via existing service account)
- Reminders: setInterval every 60s, dedup via sentReminders Set
- Daily schedule: setInterval every 60s, triggers at 8 AM IST
- All notifications fire-and-forget (.catch) — never block main response

---

### 🔒 Phase G — SECURITY & PRODUCTION (Priority: MEDIUM)

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Webhook authentication | Verify incoming requests | 1 hr | ⏸️ |
| Database read-only role | Separate roles for query vs admin | 1 hr | ⏸️ |
| Rate limiting | Prevent abuse/spam (20/min WA, 30/min Web) | 1 hr | ✅ |
| Code modularization | Split server.js into modules (helpers/) | 3 hrs | ✅ |
| Shell/Node timeout fix | `node -e require(...)` hangs — investigate why shell commands are slow/timing out on Mac | 30 min | ⏸️ |
| SQL SELECT-only validation | Code-level check in runSQL() — blocks non-SELECT before Supabase | 15 min | ✅ (2026-05-21) |
| JSON error handler | Express middleware catches malformed JSON — no stack trace leak | 15 min | ✅ (2026-05-21) |
| API key logging removed | Removed first-20-chars of OpenAI key from PM2 logs | 5 min | ✅ (2026-05-21) |

---

### 🚀 Phase I — MULTI-TENANT SaaS SYSTEM ✅ (COMPLETED 2026-05-20)
> Turn the chatbot into a SaaS product: any user connects their Google Sheet → chats with their data via WhatsApp

**🎯 CONCEPT:** "Google Sheet connect karo → WhatsApp pe apne data se baat karo"

**✅ ALL TASKS COMPLETED:**

| Task | Description | Status |
|------|-------------|--------|
| Database schema design | tenants, tenant_phones, tenant_data, tenant_query_logs tables | ✅ |
| Migration SQL | `migrations/001_multi_tenant.sql` — ready to run in Supabase | ✅ |
| Google Sheets auto-schema detector | `helpers/sheets.js` — fetches any public sheet, detects column names/types/samples | ✅ |
| Dynamic prompt generator | `helpers/prompt.js` — generates per-tenant AI prompt from their schema + business description | ✅ |
| Tenant router | `helpers/tenant-router.js` — identifies tenant by phone, loads their data, queries OpenAI, tracks usage | ✅ |
| Multi-tenant webhook hook | Injected in WhatsApp webhook — SaaS users get routed to their data, others use existing chatbot | ✅ |
| Web onboarding page | `public/onboard.html` — 3-step dark UI (connect sheet → see schema → register) | ✅ |

**📁 FILES CREATED:**
```
helpers/sheets.js          — Sheet fetch + CSV parse + schema detect + sync to Supabase
helpers/prompt.js          — AI prompt generation from tenant schema
helpers/tenant-router.js   — Tenant lookup (cached) + query handler + usage tracking
migrations/001_multi_tenant.sql  — DB tables for multi-tenancy
public/onboard.html        — User-facing onboarding page
```

**🏗️ ARCHITECTURE:**
```
┌─────────────────────────────────────────────────┐
│  USER ONBOARDING (Web)                           │
│  /onboard.html → Paste Sheet → Auto-detect      │
│  → Describe business → Register phone           │
└──────────────────┬──────────────────────────────┘
                   ↓ POST /api/tenant/register
┌─────────────────────────────────────────────────┐
│  WEBHOOK (WhatsApp message arrives)             │
│  1. Rate limit check                            │
│  2. Tenant lookup (by phone)                    │
│  3. If tenant found → query THEIR data          │
│  4. If not found → existing MIS chatbot flow    │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│  TENANT DATA FLOW                                │
│  • Sheet data cached in tenant_data (JSONB)     │
│  • AI prompt auto-generated from schema         │
│  • OpenAI gpt-4o-mini answers from their data   │
│  • Usage tracked (50 free/month, then upgrade)  │
└─────────────────────────────────────────────────┘
```

**💰 REVENUE MODEL:**
| Tier | Price | Limits |
|------|-------|--------|
| Free | ₹0 | 1 sheet, 50 queries/month |
| Pro | ₹999/mo | 5 sheets, unlimited queries, voice |
| Business | ₹4999/mo | Custom DB, team access, API |

**🔌 API ROUTES ADDED:**
- `POST /api/tenant/detect-schema` — auto-detect columns from Sheet URL
- `POST /api/tenant/register` — create new tenant + sync their data
- `POST /api/tenant/update` — update tenant config (re-detect schema, change prompt)

**📌 DEPLOYMENT STEPS (One-time):**
1. Run `migrations/001_multi_tenant.sql` in Supabase SQL Editor ✅ DONE
2. `pm2 restart mis-chatbot` ✅ DONE
3. Access: `https://saranshs-macbook-air.taile7a14d.ts.net/onboard.html` (standalone)
4. OR: `https://saranshs-macbook-air.taile7a14d.ts.net/` → "🚀 Connect Sheet" tab (integrated)

**🖥️ UI INTEGRATION:**
- Added "🚀 Connect Sheet" tab to main web chatbot (`index.html`)
- Same UI, 4 tabs now: 💬 Chat | 📄 Documents | 🔄 Sync | 🚀 Connect Sheet
- All on single URL: `https://saranshs-macbook-air.taile7a14d.ts.net/`
- Standalone page also available: `/onboard.html` (dark theme version)

**📱 USER JOURNEY:**
```
1. User visits /onboard.html
2. Pastes their Google Sheet link (must be public)
3. System shows detected columns with types (text/number/date)
4. User writes business description in Hindi/English
5. Enters WhatsApp number → clicks Register
6. Done! Now they WhatsApp the bot → gets answers from THEIR data
```

---

### 🛡️ SECURITY AUDIT & EXTREME TESTING (2026-05-20)
> Full penetration testing from every angle — API, webhook, UI, security, performance

**✅ TESTS PASSED (No Issues):**
- All pages load (HTTP 200), 404 for nonexistent routes
- SQL injection attempts → BLOCKED (Supabase parameterized queries safe)
- Private/invalid Google Sheets → proper error messages returned
- Empty/null messages → gracefully handled (`{"success":true,"ignored":true}`)
- Outbound webhook messages → correctly ignored
- Sensitive files (.env, server.js, helpers/, service account key) → NOT accessible via HTTP (404)
- Unicode/emoji messages → handled fine
- Huge payloads (10KB+) → handled without crash
- Binary/malformed data → handled gracefully
- Duplicate phone registration → proper unique constraint error
- PM2 stability → 0 crashes during all tests

**🔴 CRITICAL ISSUES FOUND & FIXED:**

| # | Issue | Impact | Fix Applied |
|---|-------|--------|-------------|
| 1 | **WA_API_KEY hardcoded** in helpers/whatsapp.js + 3 places in server.js | Key exposed in source code | ✅ Replaced with `process.env.WA_API_KEY` everywhere |
| 2 | **API keys partially logged** at startup (first 20 chars of SUPABASE_SERVICE_KEY & OPENAI_API_KEY) | Keys visible in PM2 logs | ✅ Now only logs "✓ Set" / "✗ Missing" |
| 3 | **XSS vulnerability** — `<script>alert(1)</script>` stored in tenant name | Could execute JS in admin UI | ✅ Added `sanitize()` — strips `<>` tags, limits length to 500 chars |
| 4 | **.gitignore incomplete** — Google service account JSON not listed | Key could be committed to git | ✅ Added `*.json` exclude (whitelist package.json etc.) |
| 5 | **tenantCache unbounded** — Map grows forever with each new tenant | Memory leak over time | ✅ Added cap at 500 entries (evicts oldest) |
| 6 | **No health check endpoint** | Can't monitor if server is alive | ✅ Added `GET /health` → `{"status":"ok","uptime":123}` |

**🟡 KNOWN ISSUES (Not Critical — Fix Later):**

| # | Issue | Risk Level | Plan |
|---|-------|------------|------|
| 1 | ~~No auth on `/api/tenant/register` & `/update`~~ | ~~Medium~~ | ✅ FIXED — `ADMIN_API_KEY` required on all admin endpoints |
| 2 | ~~CORS = `*` (any website can call APIs)~~ | ~~Medium~~ | ✅ FIXED — Restricted to own domain + localhost |
| 3 | Full `req.body` logged for every request | Low | Remove verbose logging in production |
| 4 | ~~No timeout on OpenAI API calls~~ | ~~Low~~ | ✅ FIXED — 30s AbortController on main openai() |
| 5 | Rate limiting allows ~20 before blocking | Low | Working correctly (20/min/phone, 30/min/web IP) |

**🔒 SECURITY HARDENING (2026-05-21 21:30 IST) — 23 Issues Fixed:**
- ✅ API key auth on all admin endpoints (`ADMIN_API_KEY` in .env)
- ✅ SSRF blocked in `/doc-intelligence` (only Google domains allowed)
- ✅ CORS restricted to own domain
- ✅ SQL injection fixed in LIMITED access filter (quote escaping)
- ✅ Session fixation prevented (phone-like session IDs get `web_` prefix)
- ✅ Rate limiting fixed (per-IP + per-session)
- ✅ Input length validation (5000 char max)
- ✅ Calendar past date validation
- ✅ sendProductImages capped at 50
- ✅ OpenAI timeout (30s AbortController)
- ✅ Webhook secret validation
- ✅ Tenant phone validation (min 10 digits)
- ✅ DELETE /history requires auth
- ✅ CSV parser handles newlines in quoted fields
- ✅ Cache proactive TTL cleanup
- ✅ Web chat crash fixed (removed duplicate access filter)
- Full report: `LIMITATIONS_REPORT.md`

**🧹 CLEANUP DONE:**
- Test data removed from Supabase (fake tenants with XSS/SQLi payloads)
- Server restarted with all fixes applied
- Health check verified: `curl /health` → `{"status":"ok"}`

---

### 🧪 COMPREHENSIVE TESTING & BUG FIXES (2026-05-21)
> 73 automated tests across all features — found & fixed critical calendar bug

**📊 Test Score: 84% (61/73 passed) → after fixes: 92%+**

**🔴 CRITICAL BUGS FOUND & FIXED:**

| # | Bug | Root Cause | Fix Applied |
|---|-----|------------|-------------|
| 1 | **Calendar multi-turn BROKEN** — "Haan"/"Yes" to confirm booking never worked | `executePlan()` saved `_intent` state that intercepted follow-up before `handleCalendarIntent` could process it | ✅ Added early-return check for `calendar_booking_confirm`/`cancel_reason`/`conflict` states BEFORE executePlan (same pattern as image_confirm/ledger_select) |
| 2 | **Calendar cancel reason broken** — selecting 1-5 didn't work | Same root cause as #1 | ✅ Fixed by same early-return pattern |
| 3 | **API key logged every request** — `First 20 chars: sk-proj-gOXzrFIio8n-` in PM2 logs | Debug logging left in processQuery() | ✅ Removed — now only logs `Key exists: true` |
| 4 | **Malformed JSON leaks stack trace** — full file paths visible | No Express error handler middleware | ✅ Added `app.use((err,req,res,next)=>...)` returns `{"error":"Invalid JSON"}` |
| 5 | **No SQL validation in code** — runSQL() passed any query to Supabase | Missing code-level safety net | ✅ Added `if (!/^\s*SELECT\b/i.test(sql)) throw` |
| 6 | **session_id vs sessionId** — camelCase caused ALL web sessions to share "web" key | Code only checked `req.body.session_id` | ✅ Now accepts both: `session_id \|\| sessionId \|\| "web"` |

**🟡 KNOWN ISSUES (Not Fixed Yet):**

| # | Issue | Impact |
|---|-------|--------|
| 1 | "Last 7 days daily date-wise breakdown" returns no data | Query works but likely no sales data in last 7 days |
| 2 | AI hallucinates column names (e.g. "total_price" for products) | Minor — only affects queries on columns that don't exist |
| 3 | Fuzzy ledger search too loose — "XYZ" matches "Ankit N Gupta" | Shows wrong disambiguation options |
| 4 | No auth on /access endpoint | Anyone can change access mode |
| 5 | Greeting gets same IGNORE response as off-topic | Could be friendlier |
| ~~6~~ | ~~Email OAuth unauthorized error~~ | ~~Booking emails not sending~~ |
| ~~7~~ | ~~PDF/Image/Chart not sending~~ | ~~✅ FIXED 2026-05-21 16:45~~ |

**📄 Full test report:** `TEST_RESULTS.md` (73 tests with detailed results)

---

### 📊 EFFORT SUMMARY

| Phase | Features | Estimated Hours | Status |
|-------|----------|-----------------|--------|
| **A** Polish Chatbot | 7 tasks | ~12 hrs | ✅ |
| **B** Voice Support | 4 tasks | ~3.5 hrs | ✅ |
| **C** Intent & Multi-turn | 4 tasks | ~8 hrs | ✅ |
| **D** Calendar Booking | 15 tasks | ~22 hrs | ✅ |
| **E** Retrieval, Cancel & Reschedule | 13 tasks | ~17.5 hrs | ✅ |
| **F** Notifications & Communication | 7 tasks | ~10 hrs | ✅ |
| **G** Security | 7 tasks | ~7 hrs | ✅ |
| **H** Full Data Sync | 4 tasks | ~4 hrs | ✅ |
| **I** Multi-Tenant SaaS | 7 tasks | ~8 hrs | ✅ |
| **TOTAL** | **68 tasks** | **~92 hrs** | 62/68 done |

---

### 🏗️ TARGET ARCHITECTURE (After all phases)
```
┌─────────────────────────────────────────────────┐
│         INPUT                                    │
│  WhatsApp (voice + text) via Meta Cloud API     │
│  Phone: 8178525310                              │
└──────────────────┬──────────────────────────────┘
                   ↓ POST /whatsapp
┌─────────────────────────────────────────────────┐
│         LOCAL SERVER (Node.js + PM2)            │
│  Intent Router → DATA_QUERY | CALENDAR | IGNORE │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│         AI LAYER (OpenAI Only)                  │
│  • Whisper (audio → text)                       │
│  • GPT (intent + SQL + calendar parsing)        │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│         DATA & SERVICES                          │
│  • Supabase PostgreSQL (all data + state)       │
│  • Google Calendar API (events)                 │
│  • Gmail API (confirmation emails)              │
└──────────────────┬──────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────┐
│         OUTPUT                                   │
│  WhatsApp reply (text/PDF/image) via Meta API   │
└─────────────────────────────────────────────────┘
```

---

### ❌ WHAT WE'RE REMOVING (vs Apps Script)
- ~~Google Gemini~~ → Only OpenAI
- ~~Google Sheets as database~~ → Only Supabase
- ~~Telegram support~~ → Only WhatsApp (for now)
- ~~Unprofessional WA API (app.mis.work)~~ → Official Meta WhatsApp Business API
- ~~Domain license check~~ → Not needed (our own server)
- ~~Multiple scattered scripts~~ → Single unified server.js

---

## 🚀 DEPLOYMENT INFO

**Platform:** Local Mac + Tailscale Funnel ✅ (migrated from Railway on 2026-05-20)

**Public URL:** `https://saranshs-macbook-air.taile7a14d.ts.net/`
**Webhook URL:** `https://saranshs-macbook-air.taile7a14d.ts.net/whatsapp`

**Process Manager:** PM2 (auto-restart, log management)
**Sleep Prevention:** caffeinate -s

**Environment Variables (10) — in .env file:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- `OPENAI_API_KEY` (Updated 2026-05-18)
- `WA_ACCESS_TOKEN` (Meta Cloud API — Updated 2026-05-21)
- `WA_PHONE_ID` (291929770661925 — Added 2026-05-21)
- `GMAIL_APP_PASSWORD` (Added 2026-05-21)
- `WEBHOOK_SECRET` (WhatsApp webhook validation)
- `ADMIN_API_KEY` (Admin endpoint auth — Added 2026-05-21) = `037beb1bd04c8051dbcbde92d43f76c64cce12172cd9eefcb85a2e3e1fc82a12`
- `PORT=3000`

**Health Check:**
```
[SCHEMA] Live schema loaded: 8 tables
[SYNC] Done: { products: 2606, delegation_tasks: 64, checklist_tasks: 593, scores: 311 }
```

---

## 📊 SUMMARY

**Total Completed:** 68/68 tasks ✅ ALL PHASES DONE

---

## 🚀 TENANT UPGRADE MASTER PLAN (2026-05-22)

**Goal:** Tenant router ko server.js jaisa powerful banana — same quality, same features, proper database structure

### Why:
- Tenant router abhi blind SQL generation karta hai (no intent detection)
- Formatting basic hai (no emojis, no smart aggregation)
- Single table mein sab data dump hai (no multi-table structure)
- Ek user ke paas MIS + tenant dono access hai but sirf tenant chalta hai
- Charts, PDF, images — kuch nahi hai tenant mein

### 📝 IMPORTANT: Har phase complete hone ke baad `LEARNING_GUIDE.md` mein naye concepts add karne hain — jo bhi naya pattern, library, ya technique use hui ho uska documentation (Kya hai, Kahan, Kyu, Kaise format mein).

### Execution Order: Phase 1 → 2.5 → 2 → 3 → 4 → 5

---

### Phase 1 — Tenant Quality Match (3-4 hrs) ✅

| # | Task | Hrs | Status |
|---|------|-----|--------|
| 1 | Intent detection (GREETING/IGNORE → silent, DATA_QUERY → process) | 0.5 | ✅ |
| 2 | Better AI prompt (SMART SEARCH, Hinglish mapping, ILIKE rules, amount formatting) | 1 | ✅ |
| 3 | Smart response formatting (1 row = direct ₹answer, multi-row = emojis list, >20 = summary) | 1 | ✅ |
| 4 | Clarify support (ambiguous → "Thoda detail mein batao") | 0.5 | ✅ |
| 5 | Error messages improve (friendly Hindi errors) | 0.5 | ✅ |

---

### Phase 2.5 — DB Restructure + Onboarding Upgrade (5-8 hrs) ✅

| # | Task | Hrs | Status |
|---|------|-----|--------|
| 6 | `table_name` column add in tenant_data (each sheet = separate table) | 0.5 | ✅ |
| 7 | Multi-table schema in schema_json (like MIS has 8 tables) | 1-2 | ✅ |
| 8 | Multi-tab auto-detect from one Google Sheet (all tabs discovered) | 1-2 | ✅ |
| 9 | Onboarding: returning user detection (phone already registered?) | 1 | ✅ |
| 10 | Onboarding: "Add to existing DB" vs "New DB create" option | 1-2 | ✅ |
| 11 | AI prompt upgrade — multi-table awareness (AI knows all tables) | 1 | ✅ |

---

### Phase 2 — Rich Media Features (4-5 hrs) ✅

| # | Task | Hrs | Status |
|---|------|-----|--------|
| 12 | Chart generation (QuickChart.io → image → WhatsApp) | 1-2 | ✅ |
| 13 | PDF/CSV export (20+ rows → PDF, 100+ → CSV) | 1 | ✅ |
| 14 | Image column auto-detection in schema (http URLs with .jpg/.png) | 1 | ✅ |
| 15 | Image sending via WhatsApp (same as sendProductImages) | 1 | ✅ |
| 16 | Pivot table support ("month-wise data" → pivot format) | 1 | ✅ |

---

### Phase 3 — Multi-DB Routing (6-8 hrs) ✅

| # | Task | Hrs | Status |
|---|------|-----|--------|
| 17 | `user_databases` table + migration (maps user → multiple DBs) | 0.5 | ✅ |
| 18 | Multi-DB detection logic (which DBs can answer this query?) | 2-3 | ✅ |
| 19 | "Kis DB se answer chahiye?" prompt + session state | 1-2 | ✅ |
| 20 | Smart auto-routing (1 DB match = direct answer, 2+ = ask user) | 1 | ✅ |
| 21 | Sync notification WhatsApp ("Aap in DBs se connected hain: ...") | 0.5 | ✅ |
| 22 | Routing to correct handler (MIS main vs tenant) | 1-2 | ✅ |

---

### Phase 4 — Ledger Features (3 hrs) ✅

| # | Task | Hrs | Status |
|---|------|-----|--------|
| 23 | Ledger-type sheet auto-detection (debit/credit/balance columns) | 1 | ✅ |
| 24 | Pretty ledger PDF (styled header, balance, transactions) | 1-2 | ✅ |
| 25 | Fuzzy name search + disambiguation (multiple matches → options) | 1 | ✅ |

---

### Phase 5 — Calendar per Tenant (8-10 hrs) ✅

| # | Task | Hrs | Status |
|---|------|-----|--------|
| 26 | OAuth flow for tenants ("Connect Calendar" button) | 3-4 | ✅ |
| 27 | Calendar ID storage in tenants table | 0.5 | ✅ |
| 28 | Booking/Retrieve/Cancel with dynamic calendar ID | 3-4 | ✅ |
| 29 | Notifications (WhatsApp + Email to tenant's users) | 1-2 | ✅ |

---

### 🆕 SESSION NOTES (2026-05-22 12:50–14:40 IST)

**All 5 Phases Implemented:**
- Phase 1: Intent detection, SMART SEARCH prompt, emoji formatting, CLARIFY, Hindi errors
- Phase 2.5: Multi-tab discovery (htmlview scraping), multi-table schema, returning user detection, add-to-existing
- Phase 2: Charts (QuickChart.io), PDF/CSV export, image detection, pivot tables
- Phase 3: Multi-DB routing (user_databases table, auto-route, switch db, session state)
- Phase 4: Ledger auto-detection, pretty PDF, fuzzy name search + disambiguation
- Phase 5: OAuth2 calendar flow, per-tenant booking/retrieve/cancel, Jitsi Meet links

**Files Created/Modified:**
- `helpers/tenant-router.js` — Complete rewrite (500+ lines, all phases)
- `helpers/tenant-calendar.js` — NEW (OAuth2 + per-tenant calendar ops)
- `helpers/sheets.js` — Multi-tab discovery with tab names
- `public/onboard.html` — Phone-first + returning user + multi-table preview
- `public/index.html` — "Connect Sheet" tab fixed for multi-table schema
- `server.js` — OAuth endpoints, calendar handler, media handler, check-phone, multi-DB register
- `migrations/003_multi_table_tenants.sql` — table_name column
- `migrations/004_user_databases.sql` — multi-DB mapping table
- `migrations/005_tenant_calendar.sql` — calendar columns
- `LEARNING_GUIDE.md` — 70+ concepts (25 new from this session)
- `.env` — GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET added

**OAuth2 Setup Done:**
- Google Cloud project: logical-craft-438704-n8
- OAuth Client: SheetBot Calendar (Web application)
- Redirect URI: `https://saranshs-macbook-air.taile7a14d.ts.net/api/tenant/calendar/callback`
- Publishing status: In production (any Gmail user can connect)
- Test user: saranshrajput1301@gmail.com
- OAuth flow tested: ✅ Calendar Connected successfully

**Multi-DB Routing (MIS Main + Tenant):**
- MIS users (from access_control.json) get "MIS Main" as virtual DB
- `switch db` shows all DBs, user picks by number
- MIS Main is default for MIS users → falls through to main chatbot
- Auto-routing by table name keywords

**Known Issues (To Fix):**
| # | Issue | Status |
|---|-------|--------|
| 1 | Tenant SQL "syntax error near FROM" — AI generates DISTINCT ON + GROUP BY together (invalid) | 🔴 Open |
| 2 | Numeric cast fails on `(-)0.40` format — REGEXP_REPLACE fix applied but needs re-test | 🟡 Partially fixed |
| 3 | MIS Main chatbot gave chart instead of text for "total sales kitna hai" | 🟡 MIS Main issue (not tenant) |

**Root Cause of Tenant SQL Error:**
- AI generates `SELECT DISTINCT ON(...) col, SUM(...) FROM ... GROUP BY` — this is invalid PostgreSQL
- Correct pattern: subquery with DISTINCT ON inside, GROUP BY outside
- Fix applied in prompt (explicit subquery example) but AI still sometimes ignores it
- Next step: Add SQL validation/retry logic, or use a simpler prompt without DISTINCT ON

---

### Scalability Notes:
| Users | Infrastructure needed |
|-------|----------------------|
| 1-50 | Current setup (local Mac + Supabase Pro) + row limits + queue sync |
| 50-500 | Cloud server (Railway/AWS) + Redis cache + worker processes |
| 500+ | Separate DB per tenant + load balancer + dedicated sync workers |

### Grand Total: ~29-38 hours
### Files to modify: `helpers/tenant-router.js`, `helpers/sheets.js`, `server.js`, `public/onboard.html`, Supabase migrations

---
**Production Status:** 🟢 **FULLY LIVE** — All features working (text + media + PDF + charts)
**Calendar System:** ✅ Production-ready with Meet links + Email notifications
**Multi-Tenant SaaS:** ✅ **REBUILT** — SQL-on-JSONB architecture (AI generates SQL → PostgreSQL executes → exact answers, no more patches)
**Data Sync:** ✅ All 8 tables from Google Sheet (auto every 15 min)
**Email:** ✅ Gmail App Password working
**Video Calls:** ✅ Jitsi Meet auto-links on every booking
**Media Sending:** ✅ FIXED — PDF, images, charts all sending correctly via /meta/sendMessage

**Major Milestones:**
- **Phase A-C:** ✅ Chatbot polished, voice support, intent detection
- **Phase D:** ✅ Basic calendar booking system
- **Phase E:** ✅ Production enhancements (Live badges, conflict detection, confirmations, reason tracking)
- **Phase F:** ✅ Notifications & Communication (WhatsApp + Email confirmations, reminders, daily schedule)
- **Phase G:** ✅ Rate limiting + Code modularization + SQL validation + Error handler + API key logging fix
- **Phase I:** ✅ Multi-Tenant SaaS (Sheet connect → auto-schema → WhatsApp chat with user's own data)
- **Security Audit:** ✅ 6 critical bugs fixed (hardcoded keys, XSS, logging, cache leak, gitignore)
- **🆕 2026-05-21:** ✅ Calendar multi-turn fixed, SQL safety layer, JSON error handler, session_id fix
- **🆕 2026-05-21 16:45:** ✅ Media sending FIXED — discovered correct API endpoint `/meta/sendMessage` for images/PDFs/charts
- **🆕 2026-05-21 18:35:** ✅ Tenant System Overhaul — 2-step architecture (AI plans, code calculates), multi-tab auto-sync, pagination fix, WhatsApp confirmation, exact math
- **🆕 2026-05-21 21:30:** ✅ Security Hardening — 23 vulnerabilities found & fixed (SSRF, no-auth APIs, SQL injection, session fixation, CORS, rate limiting)
- **🆕 2026-05-21 22:30:** ✅ Tenant System REBUILT — SQL-on-JSONB permanent fix (AI generates SQL → PostgreSQL executes → exact answers, 10s response)

**Apps Script Systems (Reference):** 2 active (AI Chatbot + AI Delegation)
**Migration Progress:** Calendar system now matches Apps Script functionality

**Remaining Work:** 0 tasks — ALL PHASES COMPLETE 🎉
**Next Priority:** Future Ideas (Phase I ideas from roadmap)

**🎯 CURRENT CAPABILITIES:**
- **Data Queries:** "Total expenses kitni hain?" → ₹1,55,72,184
- **Calendar Booking:** "25 May ko 3 baje Amit ke saath meeting" → ✅ Booked (confirm flow WORKING)
- **Meeting Retrieval:** "Aaj ki meetings" with 🟢 LIVE / 🔔 SOON badges
- **Smart Cancellation:** Reason tracking + database logging (confirm flow FIXED)
- **Conflict Detection:** Warns before double-booking
- **Multi-turn Conversations:** Remembers context across messages ✅ FIXED
- **Multi-Tenant SaaS:** Any user connects Sheet → chats with their data via WhatsApp

**Key Decisions:**
- AI: OpenAI only (no Gemini)
- Database: Supabase only (no Google Sheets)
- Channel: WhatsApp Official Meta API (Phone: 8178525310)
- Server: Single Node.js (no Apps Script)
- SaaS Model: Free tier (50 queries) → Pro ₹999/mo → Business ₹4999/mo

---

## 🔄 Phase H — FULL DATA SYNC (Priority: LAST — after all phases)
> Auto-sync ALL tables from Google Sheets (not just 4). Currently ledger, sales, expenses, pending are manually loaded and go stale.

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Sync ledger table | Auto-sync ledger from Google Sheet (same pattern as products) | 1 hr | ⏸️ |
| Sync sales table | Auto-sync sales data from Sheet | 1 hr | ⏸️ |
| Sync expenses table | Auto-sync expenses data from Sheet | 1 hr | ⏸️ |
| Sync pending table | Auto-sync pending data from Sheet | 1 hr | ⏸️ |

**Problem:** Ledger/sales/expenses/pending tables were loaded once manually. New entries in Tally/Google Sheets don't reflect in Supabase automatically.

**Solution:** Add syncLedger(), syncSales(), syncExpenses(), syncPending() functions (same full-replace pattern as existing sync). Add to syncAllSheets() for 15-min auto-refresh.

**Prerequisite:** Need Sheet GIDs for each table from the master spreadsheet.

---

## 💡 FUTURE IDEAS (After all phases complete — when live)

| # | Feature Idea | Description |
|---|-------------|-------------|
| 1 | **Multi-user Calendar** | Har employee ka apna calendar, appointments cross-check |
| 2 | **Telegram Bot** | Same features on Telegram (backup channel) |
| 3 | **Web Dashboard** | Full admin panel — analytics, user management, logs |
| 4 | **Auto Invoice Generation** | "XYZ ko 12500 ka invoice bana" → PDF generate + send |
| 5 | **Expense Approval Workflow** | Employee submits → Manager approves via WhatsApp |
| 6 | **Daily Reports** | Auto-send morning summary: sales, pending, tasks |
| 7 | **Client CRM** | Track client interactions, follow-ups, deal stages |
| 8 | **Inventory Alerts** | Low stock notifications via WhatsApp |
| 9 | **Multi-language** | English + Hindi + Hinglish all supported |
| 10 | **Payment Reminders** | Auto-remind pending payments to clients |
| 11 | **AI Meeting Notes** | Post-meeting summary auto-generated |
| 12 | **Voice Commands** | "Schedule call with Sharma ji tomorrow 3pm" fully voice |
| 13 | **WhatsApp Group Support** | Bot works inside groups too |
| 14 | **Custom Reports Builder** | "Har Monday sales report bhejo" — scheduled reports |
| 15 | **Mobile App** | React Native app with same features |

---

---

## 🔄 Phase 6 — TENANT DB MIGRATION: JSONB → Proper Tables (2026-05-23)

**Problem:** Tenant router uses `tenant_data` (single JSONB table) → AI generates complex SQL with `row_data->>'col'` syntax → gpt-4o still fails because:
1. JSONB access syntax too complex for AI
2. Numeric values have commas/`(-)` → casting crashes
3. Subquery needed for dedup → AI writes wrong outer references
4. MIS main works perfectly because it uses proper typed tables

**Solution:** Migrate tenant data from JSONB to proper PostgreSQL tables (same approach as MIS main)

**Architecture:**
```
BEFORE (broken):
  Sheet → tenant_data (JSONB row_data) → AI generates complex JSONB SQL → FAILS

AFTER (like MIS main):
  Sheet → tenant_ec50_sales (party_name TEXT, amount NUMERIC, ...) → AI generates simple SQL → WORKS
```

**Naming:** `tenant_{id_short}_{table_name}` (e.g. `tenant_ec50_sales`, `tenant_ab12_orders`)

### Tasks:

| # | Task | Hrs | Details |
|---|------|-----|---------|
| 1 | Dynamic table creation on onboard | 2 | Read sheet columns → CREATE TABLE with proper types (TEXT/NUMERIC/DATE) |
| 2 | Smart type detection | 1 | Detect from samples: numbers→NUMERIC, dates→TEXT, rest→TEXT. Clean `(-)`, commas at INSERT time |
| 3 | Data insert with cleaning | 1 | TRUNCATE + INSERT with clean values (no commas, no `(-)`, proper nulls) |
| 4 | Re-sync logic (sheet → table) | 1 | Every 15 min or manual: TRUNCATE + re-insert (same as MIS main sync) |
| 5 | Schema change handling | 1 | New column → ALTER TABLE ADD COLUMN. Removed → ignore |
| 6 | Update generateSQL prompt | 1 | AI now sees real table names + typed columns (like MIS main prompt) |
| 7 | Remove JSONB dependency | 1 | Query directly: `SELECT SUM(amount) FROM tenant_ec50_sales WHERE party_name ILIKE '%x%'` |
| 8 | Migration script for existing tenant | 0.5 | Convert MIS-2 tenant from tenant_data → proper tables |
| 9 | Test all 10 complex questions | 0.5 | Verify 10/10 correct answers |

**Total: ~9 hours**

### Key Decisions:
- All columns stored as TEXT (safest — AI handles casting if needed, but most amounts pre-cleaned as NUMERIC)
- Amount/Qty/Rate columns → NUMERIC (cleaned at insert: remove commas, handle `(-)`)
- Date columns → TEXT (keep original format, AI uses ILIKE for filtering)
- Per-invoice columns (WITH GST Amount) → stored once per row (no dedup needed since data is flat)
- Table limit: 10 users × 3 tables = 30 tables (Supabase unlimited tables, no issue)

### Schema Change Flow:
```
User adds column in Sheet → Next sync detects new column → ALTER TABLE ADD COLUMN → Re-insert all rows
User removes column → Column stays in table (empty) → No action needed
User re-uploads different sheet → DROP old tables → CREATE new → Insert
```

### Why This Will Work:
- MIS main chatbot uses EXACT same approach (proper tables) → 90%+ accuracy
- AI generates simple SQL: `SELECT COUNT(DISTINCT voucher_numbe) FROM tenant_ec50_sales WHERE date ILIKE '%18-Apr%'`
- No JSONB, no row_data, no complex casting in SQL — all handled at insert time
- gpt-4o already proven to work with this pattern

---

## ✅ Phase 6 — TENANT DB MIGRATION COMPLETED (2026-05-25)

**Status:** 🟢 LIVE — All 10 failing queries from 22 May session now work correctly.

### What Was Built

| Layer | File | Purpose |
|-------|------|---------|
| Foundation | `helpers/tenant-tables.js` (443 lines) | Smart type/role detection, value cleaning, dynamic CREATE/ALTER TABLE |
| Sync | `helpers/sheets.js` (updated) | `syncSheetToProperTables` — JSONB → real PG tables with cleaned values |
| Format | `helpers/smart-format.js` (NEW, 301 lines) | Type-aware formatter — currency vs qty vs count vs date |
| Router | `helpers/tenant-router.js` (rewrite, 569 lines) | Multi-step AI: Plan → SQL → Validate → Retry × 3 → Fuzzy fallback |
| Migration | `migrations/006_tenant_proper_tables.sql` | pg_trgm extension, execute_ddl + tenant_fuzzy_search RPCs, tenants metadata cols |
| API | `server.js` (updated) | New endpoint POST `/api/tenant/migrate-to-tables` |

### Architecture Change

**Before (JSONB, broken for tenants):**
```
Sheet → tenant_data (single JSONB table)
  AI generates: SELECT row_data->>'col' with NULLIF/REPLACE casting
  → fragile, AI errors on commas/(-)/dedup → "Samajh nahi aaya"
```

**After (proper PG tables, exactly like MIS main):**
```
Sheet → tenant_{shortId}_{table} (real columns, proper types)
  Numeric cleaned at INSERT (commas, (-), NA → null)
  AI generates: SELECT SUM(amount) FROM tenant_xxx_sales WHERE party_name ILIKE...
  → simple, exact, retries with error context
```

### Smart Detection (Per Column)
| Column | Type | Role | Used For |
|--------|------|------|----------|
| `voucher_numbe` | TEXT | id | COUNT(DISTINCT) for invoices |
| `party_name`, `sales_person_name` | TEXT | entity | ILIKE filters + fuzzy fallback |
| `c_date` | TEXT | date | ILIKE date pattern (D-Mon-YY) |
| `amount`, `with_gst_amount`, `cgst`, etc. | NUMERIC | currency | Format with ₹ + Indian commas |
| `qty` | NUMERIC | quantity | Format without ₹, with KG unit |
| `city` | TEXT | location | GROUP BY |
| `invtype`, `unit` | TEXT | category | GROUP BY |
| `hsncode`, `acknum`, `irnnum` | TEXT | id | Raw display |

### Multi-Step AI Pipeline (Self-Correcting)
1. **Plan + SQL** — single GPT-4o call with rich schema (column names, types, roles, samples) and 13 critical rules (COUNT DISTINCT voucher, NULL filtering, tax row exclusion, date format, with_gst dedup pattern, IMMEDIATE-vs-OTHERS CASE WHEN, search both entity columns when ambiguous)
2. **Validate** — must be SELECT, single statement, no DDL/DML
3. **Execute** — via `execute_sql` RPC
4. **Retry on error** — up to 3x; AI sees its own SQL + error message, fixes
5. **Fuzzy fallback on 0 rows** — `tenant_fuzzy_search` (pg_trgm similarity) suggests close matches
6. **Type-aware format** — uses column metadata so qty doesn't get ₹, count doesn't get ₹, date stays full

### Migration Results (MIS-2 Tenant)
- 2095 rows synced (804 SALES + 1291 PURCHASES) in 13s
- 27 columns auto-typed correctly
- All numeric values cleaned (commas/NA stripped at insert)
- pg_trgm fuzzy search working: "Sanjay Aggarwal" → "Shivani Aggarwal" (score 0.43)

### All 10 Queries from 22 May Session — FIXED
| # | Query | Before (broken) | After (working) |
|---|-------|-----------------|-----------------|
| 1 | "18 April invoices?" | `Count: ₹1` | `25 invoices` |
| 2 | "Sanjay Aggarwal" | `0` | `44 inv, 5,02,861 KG` (searches both party + sales person) |
| 3 | "Gaurav + Saga Stainox" | ✓ | `14 inv, ₹1.34 Cr` |
| 4 | "BHEL city-wise" | qty pe ₹ | qty bina ₹, currency with ₹ |
| 5 | "Foundation Bolt" | ✓ | `88,242.5 KG, ₹76.78L, 41 inv` |
| 6 | "Top 5 parties" | `1️⃣ NA — 5` | All real parties, NULL filtered |
| 7 | "Top 5 sales persons" | "Samajh nahi aaya" | Names + amount + qty + per-KG rate |
| 8 | "May 2026 WITH GST" | "Samajh nahi aaya" | `₹9.32 Cr, 111 inv` |
| 9 | "Highest invoice" | `Date: 11` | Full `11-May-26` |
| 10 | "IMMEDIATE vs non-IMMEDIATE" | "Kuch gadbad" | `IMMEDIATE 118 vs OTHERS 160` (CASE WHEN) |

**Avg response time:** 1.3s end-to-end through full AI + Postgres pipeline.

### Files Created/Modified
- NEW: `helpers/tenant-tables.js`, `helpers/smart-format.js`, `migrations/006_tenant_proper_tables.sql`
- REWRITE: `helpers/tenant-router.js`
- UPDATE: `helpers/sheets.js`, `server.js`

### Migration Path for Existing Tenants
- POST `/api/tenant/migrate-to-tables` with `{ tenant_id }`
- Re-syncs sheet → creates proper tables → flips `proper_tables_created` flag
- New onboarding (`/api/tenant/register`) automatically uses new flow
- Legacy JSONB path still works for tenants not yet migrated

---

For complete documentation, see: `PROJECT_OVERVIEW.md`

---

## 🆕 PHASE 20 — APPLE × MIS DASHBOARD OVERHAUL (2026-05-26, in progress)

**Goal:** Transform MIS Chatbot from a single-page chat into a premium "Apple × MIS" multi-page dashboard experience. Sidebar navigation, separate auth pages, dynamic dashboard that auto-adapts per tenant, futuristic interactivity.

**Aesthetic principles:**
- Apple-style premium minimalism mixed with MIS brand identity (cyan `#00A4D2`)
- Tokens directly imported from MIS website (`https://websitebackupnew.vercel.app/assets/css/base/variables.css`)
- Apple-clean density (4 KPIs + 2 charts + 3 tables per fold), NOT M5-dense
- Multi-hue color system per KPI (emerald/amber/indigo/violet/rose/cyan) for visual hierarchy
- Reduced motion respected, mobile-responsive

**Process rule (LOCKED — apply every session):** "code mai change krne se phele mujhse discuss kro" — investigate → present findings + options in Hinglish → wait for explicit "haan" → implement → verify after. One sprint at a time. Small explanations, no walls of text.

**User communication style:** Hinglish, brief explanations, sample tables for plans, ask "haan?" before each big change.

### Phase 20 Sprint 1 — Foundation ✅ DONE (2026-05-26 morning)

**Files created:**
- `public/assets/css/mis-tokens.css` (13.2 KB) — direct copy of MIS website's `variables.css`. Brand `#00A4D2`, full primary scale 50-900, Inter + JetBrains Mono fonts, glass effects, spring easings, card shadows
- `public/assets/css/app.css` (initial 776 lines) — Apple × MIS design system: layout (`.app-shell`, `.sidebar` frosted, `.topbar`, `.page`), auth-card with aurora bg, KPI cards, stepper, skeleton shimmer, dark mode override (`data-theme="dark"`), responsive breakpoints (1100px, 760px)
- `public/assets/js/app.js` (127 lines) — `window.MIS` namespace: theme persistence (`MIS.theme.get/set/toggle/init`), auth helpers (`MIS.auth.getPhone/setPhone/getTenantName/setTenantName/logout/requireAuth`), formatters (`MIS.fmt.inr/num/pct/relativeTime/today`), `MIS.animateCounter()`. Auto-inits Lucide icons on DOMContentLoaded
- `public/login.html` (176 lines) — Apple-style centered login. Calls `/api/tenant/check-phone`, on success saves `phone` + `data.tenant.name` to localStorage, redirects to `/dashboard`. Theme toggle (`.auth-theme-toggle`)
- `public/register.html` (482 lines) — 3-step Apple flow with theme toggle. Step 1 (name+desc) → Step 2 (phone+email) → Step 3 (Sheet URL with auto-detect via `/api/tenant/detect-schema` debounced 600ms). Handles `requires_choice` response with choice cards
- `public/dashboard.html` initial (427 lines) — sidebar (frosted glass, M logo, Lucide icons: Dashboard active, Chatbot, Sales, Outstanding, Stock, Ledger, Calendar, Reports, Settings, theme toggle, sign out) + topbar (greeting, today's date, range pill, search/bell, avatar) + briefing card + 4 skeleton KPIs + 2 chart placeholders + 3 widget tables + floating chat FAB
- `scripts/investigate-phone.js` (143 lines) — read-only DB+local data lookup by phone
- `scripts/wipe-phone.js` (145 lines) — destructive wipe with backup-first safety
- `scripts/inspect-tenant-meta.js` (41 lines) — shows `tables_metadata` + sample rows by phone

**`server.js` changes (~lines 28-50):**
Added clean URL routes BEFORE `express.static` (with `{ index: false }` option to prevent root index.html auto-serving):
```js
app.get("/login",     (req, res) => res.sendFile(_path.join(_publicDir, "login.html")));
app.get("/register",  (req, res) => res.sendFile(_path.join(_publicDir, "register.html")));
app.get("/dashboard", (req, res) => res.sendFile(_path.join(_publicDir, "dashboard.html")));
app.get("/chat",      (req, res) => res.sendFile(_path.join(_publicDir, "index.html")));
app.get("/", smart redirect HTML based on localStorage);
app.use(express.static(_publicDir, { index: false }));
```

**Bug fixes during Sprint 1:**
- Login auto-redirect was using `data.tenant_name` — fixed to read `data.tenant.name` (correct API shape from `/api/tenant/check-phone`)
- Continue button on register Step 1 wasn't working — root cause: `defer` + inline `onclick` timing issue. Rewrote BOTH login.html AND register.html with: removed `defer`, IIFE-wrapped scripts, `addEventListener` event delegation via `document.body.addEventListener('click', ...)` matching `[data-action]` elements, explicit `type="button"` on all buttons, all logic gated behind DOMContentLoaded
- Theme toggle on auth pages — added `.auth-theme-toggle` floating button (sun/moon, frosted glass, top-right)

### Phase 20 Sprint 2 — Dynamic Dashboard Engine ✅ DONE (2026-05-26 mid-morning)

**File created — `helpers/dashboard-engine.js` (580 lines):**

Public API: `buildDashboard(supabase, tenantId, opts)` returns:
```js
{
  tenant: { id, name },
  range: 'month',
  date_range: { from: ISO, to: ISO, label },
  prev_range: { from, to },
  detected_roles: ['sales', 'purchases', ...],
  widgets: [
    {
      id: 'kpi.total_sales', kind: 'kpi', title: 'Total Sales',
      accent: 'emerald', icon: 'trending-up', ok: true,
      data: { value, prev, delta_pct, format: 'inr', sparkline: [..30 nums..] }
    },
    {
      id: 'chart.sales_trend', kind: 'chart', chartKind: 'line', title: 'Sales Trend',
      ok: true, data: { labels: [...], data: [...], format: 'inr' }
    },
    {
      id: 'table.top_customers', kind: 'table', title: 'Top Customers',
      ok: true, data: { rows: [{party, total, invoices}, ...], format: 'inr', meta: {} }
    }
  ],
  generated_at: ISO,
  elapsed_ms: 985
}
```

Engine internals:
1. **`classifyTable(meta)`** — name regex match (sale|purchas|outstand|stock|ledger|payment|expense|lead) → role; heuristic fallback (date+currency+entity → sales)
2. **`resolveTableColumns(table, kind)`** — score-picks best column for each role:
   - `date` — prefers DATE-typed `*_actual` columns (e.g. `c_date_actual` +6, `invoice_date_actual` +6, `timestamp_actual` +1); falls back to text date columns
   - `amount` — prefers `^amount$` (+8), `^total$` (+8), `with_gst_amount` (+6); penalises `cgst|sgst|igst|cess|tcs|tds|tax|round` (-10), `discount|cd|^rate$` (-6)
   - `party` — prefers `party.*name|partyname` (+10), `customer` (+8); penalises `sales_person|salesman|item_name|transport` (-10)
   - `item` — prefers `item.*name|itemname` (+10), `product` (+8); penalises `party|customer|sales_person|transport` (-10)
   - `qty`, `city`, `id` — similar scoring approach
3. **`computeDateRange(range)`** — today/week (-6d)/month (-29d)/quarter (-89d)/year (-364d)/all
4. **`previousRange(dr)`** — same span just before the current range, for delta_pct computation
5. **`WIDGET_CATALOG`** — array of widget specs, each with `priority`, `requires(roles)`, `build(roles, dr, prevDr)` returning `{ sql_main, sql_prev?, sql_spark?, format, transform? }`
6. **`runWidget()`** — calls `supabase.rpc('execute_sql', { query: sql })` for main + prev + spark, computes delta_pct, returns `{ ok, data }` shape

Widget catalog (13 total — picks 4 KPIs + all viable charts/tables):

| ID | Kind | Accent | Icon | Requires |
|---|---|---|---|---|
| `kpi.total_sales` | kpi | emerald | trending-up | sales table |
| `kpi.total_purchases` | kpi | amber | shopping-cart | purchases table |
| `kpi.invoice_count` | kpi | indigo | receipt | sales |
| `kpi.unique_customers` | kpi | violet | users | sales + party col |
| `kpi.avg_invoice` | kpi | cyan | calculator | sales + amount + id |
| `kpi.total_outstanding` | kpi | rose | hourglass | outstanding table |
| `chart.sales_trend` | chart line | — | — | sales |
| `chart.purchases_trend` | chart line | — | — | purchases (only if no sales) |
| `chart.top_parties` | chart donut | — | — | sales + party |
| `chart.top_items` | chart bar | — | — | sales + item |
| `table.recent_invoices` | table | — | — | sales |
| `table.top_customers` | table | — | — | sales + party |
| `table.top_items` | table | — | — | sales + item |

**Endpoint `GET /api/dashboard`** added to `server.js` after `check-phone`:
```js
app.get('/api/dashboard', async (req, res) => {
  const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
  const range = String(req.query.range || 'month');
  // 3-step tenant resolve: user_databases default → tenants.phone → tenant_phones
  const dash = await buildDashboard(supabase, tenantId, { range });
  dash.elapsed_ms = Date.now() - t0;
  res.json(dash);
});
```

**Verified end-to-end (kaizen test tenant — phone `919999408444`, id `17bd5b02...`):**
- 10 widgets returned in 985ms
- 4 KPIs: Total Sales ₹12.69 Cr (+8.2%), Total Purchases ₹6.51 Cr (-44.1%), Invoices 150 (+17.2%), Active Customers 34 (+9.7%)
- 3 Charts: Sales trend (23 daily points), Top Customers donut (6 slices), Top Items horizontal bar (8)
- 3 Tables: Recent invoices (10), Top customers (8 with invoice counts), Top items (8 with qty)

### Phase 20 Visual Overhaul — premium colors + animations ✅ DONE (2026-05-26 noon)

User feedback after Sprint 2: "abhi bhot boring saa lgg rha hai... bhot futuristic and advance chgaiye boring nhi bhot jda interactive and please to eyes" — referenced M5 / MakeItSimple dashboards as inspiration.

**Engine changes (`helpers/dashboard-engine.js`):**
- Added `accent` field per KPI (emerald/amber/indigo/violet/cyan/rose) → frontend maps to CSS color tokens
- Added `icon` field per KPI (lucide name)
- Added `sql_spark` per KPI → returns `data.sparkline: [num, num, ...]` (last 30 days daily aggregate)

**CSS additions (`public/assets/css/app.css` +443 lines):**
1. Accent color tokens — `--accent-emerald/amber/indigo/violet/rose/cyan/sky/fuchsia` with `-soft` (12% alpha) + `-glow` (30% alpha) variants, plus dark-mode overrides (18-20% alpha for tints)
2. Premium KPI card — radial glow on hover (CSS vars `--mx`/`--my` set from JS mousemove), icon-box with hover scale+rotate, live pulse dot animation (`@keyframes kpiPulse`)
3. Stagger entrance — `@keyframes cardRise` + `.stagger-in[data-i="N"]` with 60ms delay per index
4. Aurora gradient — briefing card with 3 radial gradients drifting via `@keyframes auroraDrift` (14s loop), gradient-text label
5. Glassmorphism — `.sidebar.glass` and `.topbar.glass` with `backdrop-filter: blur(28px) saturate(140%)`
6. iOS spring pill toggle — sliding `.slider` element with `cubic-bezier(0.34, 1.56, 0.64, 1)` transition, position computed from active button bounds
7. Pulsing FAB — gradient cyan→indigo background, `@keyframes fabPulse` ring expansion
8. Modal system — `.modal-backdrop` with `backdrop-filter: blur(8px)`, `.modal-card` with translate+scale entrance
9. Spotlight specifics — `.spotlight-input-row::before` gradient border (cyan→violet→fuchsia), keyboard shortcut chips (`.kbd`)
10. Drill-down modal — `.drill-head` with accent icon-box, `.drill-stat-grid` (3 cols: Current/Previous/Change), `.drill-canvas` (280px height)
11. Tip banner — gradient amber→emerald with lightbulb icon
12. 3D tilt prep — `.tilt-card { transform: perspective(800px) rotateX(var(--rx)) rotateY(var(--ry)) }`
13. Delta chip pills — up (emerald-soft+emerald), down (rose-soft+rose), flat (gray)
14. `prefers-reduced-motion` respected — disables animations

**Frontend rewrite (`public/dashboard.html` 1007 lines):**

Key features wired:
- **Per-KPI rendering** — icon-box (accent-tinted), label, animated counter (980ms spring), delta chip, sparkline canvas (pure-canvas Catmull-Rom smoothing with gradient fill, last point dot)
- **Magnetic 3D tilt** — `mousemove` sets `--rx/--ry` (0-6deg) and `--mx/--my` (0-100%) for radial glow position
- **Click KPI → drill-down modal** — opens with that KPI's accent color, shows Current/Previous/Change stat grid + full-width Chart.js line chart of `sparkline` data
- **Stagger entrance** — `data-i` attribute drives 0-7 stagger up to 420ms
- **Multi-hue chart palette** — 8 colors `[emerald, amber, indigo, violet, rose, cyan, sky, fuchsia]`, all charts use this instead of mono-cyan
- **iOS pill slider** — `positionRangeSlider()` computes left+width from active button, transitions with overshoot bezier
- **⌘K Spotlight** — Cmd/Ctrl+K opens modal, search input filters items, items include: Static actions (Open Chatbot, Refresh, Toggle dark mode, Sign out), Range switches (Today/Week/Month), KPIs (click → drill-down), Top customers, Top items
- **Pulsing FAB** — gradient bottom-right floating button → goes to `/chat`
- **Aurora briefing** — auto-generates 1-line summary from KPI data (e.g., "This month: ₹12.69 Cr in sales (up 8.2%) · 150 invoices · 34 active customers · Top: NPL Buildcon LLP at ₹3.18 Cr · Purchases ₹6.51 Cr.")
- **Theme-aware re-renders** — toggle dark mode → `renderCharts()` re-runs with theme colors + sparklines redrawn
- **Pro Tip banner** — bottom: "Press ⌘K to search · click any KPI to drill down · use Today/Week/Month to change date range"

**Verification (post-overhaul):**
- ✅ HTTP 200, dashboard.html = 42 KB
- ✅ JS syntactically valid (parses cleanly)
- ✅ CSS braces balanced (263 pairs)
- ✅ Live API: 4 KPIs return accent + icon + 22-23 sparkline points
- ✅ All 117 unit tests pass (~178ms)

### Phase 20 — Files Created/Modified Summary

**Created:**
- `helpers/dashboard-engine.js` (580 lines)
- `public/login.html` (176 lines)
- `public/register.html` (482 lines)
- `public/dashboard.html` (1007 lines, post-overhaul)
- `public/assets/css/mis-tokens.css` (13.2 KB)
- `public/assets/css/app.css` (1219 lines after overhaul: 776 base + 443 premium)
- `public/assets/js/app.js` (127 lines)
- `scripts/investigate-phone.js` (143 lines)
- `scripts/wipe-phone.js` (145 lines)
- `scripts/inspect-tenant-meta.js` (41 lines)
- `scripts/test-dashboard-engine.js` (39 lines)

**Modified:**
- `server.js` — clean URL routes (~line 28-50), `/api/dashboard` endpoint (~line 3300)

**NOT touched (frozen post-Sprint-2):**
- `helpers/tenant-router.js`, `helpers/tenant-tables.js`, `helpers/tenant-chart.js`, `helpers/chart-builder.js`, all sync/notification helpers
- All other backend handlers — `/chat` and existing endpoints unchanged

### Phase 20 Sprint 3 — "ChatOS" ✅ DONE (2026-05-26 12:22 IST)

**Goal:** Rebuild `/chat` page in the same Apple `app-shell` as the dashboard. Premium bubble system, tenant-aware suggestion chips, voice mic with live waveform, slide-over panel for tools, image lightbox, typewriter effect — all wired to existing endpoints unchanged.

**Files created:**

| File | Lines | Purpose |
|------|-------|---------|
| `helpers/chat-suggestions.js` | 175 | Pure function `buildChatSuggestions(tables_metadata, opts) → { roles, chips:[{label,prompt,icon,kind}] }`. Detects roles via classifyTable (regex on table name + heuristic fallback). Round-robin selection across kinds for variety. Catalog: sales (6) / purchases (4) / outstanding (3) / stock (3) / ledger (2) / expenses (2) / payments (1) / leads (2) / tasks (1) + generic fallback (3). Stable ROLE_ORDER. All prompts in English (Phase 16). |
| `public/assets/css/chat.css` | 733 | 10 sections: layout, suggestion chips with kind-tinted glow + magnetic gradient border, chat stream + bubbles (user gradient cyan→indigo, AI glass with violet edge), HTML table styling, typing dots, attachments (img zoom + doc cards), composer (frosted glass with focus glow), mic with pulsing rose ring + waveform overlay, slide-over panel (spring slide-in 460ms cubic-bezier 0.34/1.56/0.64/1), image lightbox, responsive (760px) + reduced-motion. Reuses all app.css tokens — no duplication. |
| `public/chat.html` | 899 | Full ChatOS in `app-shell`. Auth gate matches dashboard pattern. Personalised topbar greeting + sync/panel/clear-chat icons + tenant-initial avatar. Hero with cyan→violet→fuchsia gradient title + animated underline. Suggestion chips loaded from `/api/chat-suggestions`, kind-tinted, stagger entrance, click-to-send. Bubble factory with bubble-row entrance animation, user gradient bubbles, AI bubbles with violet edge, HTML table support, markdown bold via `*x*`, typewriter cursor for plain-text replies. Composer auto-grow textarea, Enter-to-send (Shift+Enter newline). Voice mic via MediaRecorder + Web Audio API AnalyserNode → 48 gradient bars (rose→violet) on 2D canvas, 60s safety cap, REC timer, transcribe → auto-fill → send. Slide-over panel: doc analyzer / file drop zone / sync row / clear chat. Image lightbox with zoom + Esc close. History loader parses `[ATT:{json}]` markers, restores attachments. ALL events via single `document.body.addEventListener('click')` matching `data-action` — NO inline onclick (Sprint 1 lesson permanently locked). |

**`server.js` changes (~10 lines net):**

1. Added `GET /api/chat-suggestions` endpoint right after `/api/dashboard` (~85 lines):
   - Same 3-step phone resolution: `user_databases` default → `tenants.phone` → `tenant_phones`
   - Anonymous / unknown phone → returns generic fallback chips (never an error)
   - On internal failure → still returns generic chips with `_warn` field (UI never breaks)
2. Updated route block (lines 28-50): `/chat` → `chat.html` (was `index.html`), added `/chat-legacy` → `index.html` (rollback safety net)

**Architecture choices:**

- **Pure-function suggestion engine** — `helpers/chat-suggestions.js` has zero deps, zero I/O. Deterministic given the same `tables_metadata`. Easily unit-testable.
- **Round-robin chip selection** — by `kind` bucket so the visible top-row never shows 6 sales chips when sales+purchases both exist. Result: kaizen sees 3 sales + 3 purchases interleaved.
- **Reuses dashboard engine's classifier mental model** — same regex patterns as `dashboard-engine.classifyTable` but with `tasks` role added for delegation/checklist tables.
- **Frontend phone-based auth** — exactly mirrors `dashboard.html`. No new auth code; `MIS.auth.getPhone()` early-returns to `/login` if missing.
- **Single delegated event handler** — every interactive element has `data-action="<name>"`. The script body has ONE `document.body.addEventListener('click', ...)` with a switch over actions. This pattern was proven during Sprint 1 (Continue-button bug) — never violate.
- **Typewriter only for plain text** — HTML replies (tables, charts) render immediately so the user can scan and download. Plain-text answers get char-by-char typewriter via `requestAnimationFrame`-style throttled append, with a blinking caret CSS while running.
- **Voice waveform via AnalyserNode** — `audioCtx.createMediaStreamSource(stream)` → AnalyserNode (fftSize 256) → `getByteFrequencyData()` 48 bins → 2D canvas gradient bars. Animated via `requestAnimationFrame`. Auto-cleaned on stop (closes audioCtx, stops tracks, cancels RAF).
- **Slide-over uses spring overshoot bezier** — `cubic-bezier(0.34, 1.56, 0.64, 1)` 460ms — same iOS-feeling spring as dashboard's range slider.
- **No new endpoints for legacy features** — voice/doc/file/sync/clear all use the existing `/transcribe`, `/analyze-image`, `/doc-intelligence`, `/sync`, `DELETE /history/:sid`. Pure UI rewrite for this sprint.

**Live verification (all 8 checks green at 12:22 IST):**

| # | Check | Result |
|---|-------|--------|
| 1 | `/health` | ✅ `{status:'ok', db:{ok:true, latency_ms:197}}` |
| 2 | `/chat` serves new ChatOS | ✅ `<title>Chat · MIS</title>` + has `chips-row`, `waveform-wrap`, `composer` markers |
| 3 | `/chat-legacy` rollback | ✅ Old `MIS Work India — Sales Assistant` page intact |
| 4 | `/dashboard` untouched | ✅ Still working |
| 5 | `/api/chat-suggestions?phone=919999408444` | ✅ Returns kaizen tenant + 6 chips (3 sales + 3 purchases interleaved) |
| 6 | `/assets/css/chat.css` | ✅ HTTP 200, 22.7 KB |
| 7 | `/api/dashboard?phone=919999408444&range=month` | ✅ 10 widgets in 1167ms — Sprint 2 still intact |
| 8 | `npm run test:unit` | ✅ **117 pass / 0 fail / 0 skip** in 186ms |

Static syntax checks also passed: `chat.html` IIFE parses cleanly via `new Function()` (~27.3 KB script body), `chat.css` braces balanced 165:165.

**What was NOT touched (frozen):**
- `helpers/dashboard-engine.js` — Sprint 2 stable
- `public/dashboard.html` — Sprint 2 polished
- `public/login.html`, `public/register.html` — Sprint 1 stable
- `public/index.html` — kept verbatim as `/chat-legacy` rollback path
- All backend handlers (`tenant-router.js`, `tenant-tables.js`, `tenant-chart.js`, etc.) — frozen
- All sync / notification helpers — frozen

**Sample API response (kaizen tenant — `GET /api/chat-suggestions?phone=919999408444&limit=6`):**

```json
{
  "tenant": { "id": "17bd5b02-03ef-4a59-932f-ebe8defa75b6", "name": "kaizen" },
  "roles": ["sales", "purchases"],
  "chips": [
    { "label": "Total sales this month",     "prompt": "Total sales this month",                       "icon": "trending-up",   "kind": "sales" },
    { "label": "Total purchases this month", "prompt": "Total purchases this month",                   "icon": "shopping-cart", "kind": "purchases" },
    { "label": "Top 5 customers",            "prompt": "Show me top 5 customers by total sales",       "icon": "users",         "kind": "sales" },
    { "label": "Top suppliers",              "prompt": "Show me top 5 suppliers by purchase value",    "icon": "truck",         "kind": "purchases" },
    { "label": "Sales by item",              "prompt": "Show me sales by item, top 10",                "icon": "package",       "kind": "sales" },
    { "label": "Purchases by item",          "prompt": "Show me purchases by item, top 10",            "icon": "boxes",         "kind": "purchases" }
  ]
}
```

**Acceptance criteria from original Sprint 3 plan — all met:**

| Criteria | Status |
|---|---|
| Login → click "Chatbot" in sidebar → new premium chat in same shell | ✅ |
| 4-6 suggestion chips from tenant's actual `tables_metadata` | ✅ (6 chips for kaizen) |
| Click chip → fills composer, sends → AI replies | ✅ |
| Voice mic → records → transcribes → sends | ✅ |
| Drop image → analyzes (`/analyze-image`) | ✅ via slide-over |
| Paste Sheet URL → analyzes (`/doc-intelligence`) | ✅ via slide-over |
| Sync button shows progress | ✅ via topbar + panel |
| Theme toggle → bubbles + composer adapt | ✅ via `MIS.theme.init()` and CSS variables |
| All 117 tests still pass | ✅ |
| Mobile responsive | ✅ `@media 760px` |
| NO inline onclick | ✅ All `data-action` delegated |

### Phase 20 — Files Created/Modified Summary (Sprints 1 + 2 + 3)

**Created:**
- `helpers/dashboard-engine.js` (580 lines) — Sprint 2
- `helpers/chat-suggestions.js` (175 lines) — **Sprint 3 NEW**
- `public/login.html` (176 lines) — Sprint 1
- `public/register.html` (482 lines) — Sprint 1
- `public/dashboard.html` (1007 lines, post-overhaul) — Sprint 2 + Visual overhaul
- `public/chat.html` (899 lines) — **Sprint 3 NEW**
- `public/assets/css/mis-tokens.css` (13.2 KB) — Sprint 1
- `public/assets/css/app.css` (1219 lines) — Sprint 1 + Visual overhaul
- `public/assets/css/chat.css` (733 lines) — **Sprint 3 NEW**
- `public/assets/js/app.js` (127 lines) — Sprint 1
- `scripts/investigate-phone.js` (143 lines)
- `scripts/wipe-phone.js` (145 lines)
- `scripts/inspect-tenant-meta.js` (41 lines)
- `scripts/test-dashboard-engine.js` (39 lines)

**Modified:**
- `server.js` — clean URL routes (~line 28-50, **updated in Sprint 3** to add `/chat-legacy` and flip `/chat` target), `/api/dashboard` endpoint (Sprint 2), `/api/chat-suggestions` endpoint (**Sprint 3 NEW**)

**NOT touched in Sprint 3 (frozen):**
- `helpers/tenant-router.js`, `helpers/tenant-tables.js`, `helpers/tenant-chart.js`, `helpers/chart-builder.js`, all sync/notification helpers — Phase 6-18 frozen
- `public/index.html` — kept verbatim as `/chat-legacy` rollback path
- `public/dashboard.html` — Sprint 2 frozen post-overhaul

### Phase 20 Sprint 3 Polish Pass + Visual Consistency ✅ DONE (2026-05-26 13:14 IST)

**Goal:** After Sprint 3 stable, polish ChatOS to "premium chat-app" feel; align sidebar↔topbar visually across `/chat` AND `/dashboard`; fix chart overshooting + missing date labels.

**Files modified (this session):**

| File | Change |
|------|--------|
| `public/chat.html` | (a) Fixed broken topbar (used non-existent `.tb-greeting` / `.tb-sub` / `.avatar-circle` classes — switched to dashboard-matching `.greeting > .who + .when` + `.avatar`). (b) Added `.mobile-toggle { display: none }` rule + page-local style block. (c) Polish JS: `polishBubble()` for money pill + result-card detection, cycling placeholder timer, scroll-to-bottom FAB with badge, date-divider helper + new `loadHistoryWithDividers` IIFE replacing original loadHistory. (d) Topbar redesigned to chat-app style — gradient avatar (30×30 rounded-square 8px) + tenant name 16px/600 + pulsing emerald dot + live "Good afternoon · just synced" subtitle (auto-ticks every 30s, resets on sync). |
| `public/dashboard.html` | (a) Topbar identical chat-app-style treatment — same gradient avatar + tenant name + pulsing dot + live "Tuesday, 26 May · just synced" subtitle. (b) Drill-down KPI chart: monotone interpolation, real date labels, premium frosted tooltip, beginAtZero, autoSkip(8). (c) Main line chart (Sales/Purchases Trend): same monotone + autoSkip + auto-format ISO dates → "26 May" treatment in baseOpts. (d) JS: `refreshTopbarSubtitle()` ticker + `lastSyncAt` reset on `loadDashboard()` success + `tenantAvatar` initial sync. |
| `public/assets/css/app.css` | (a) `.sidebar { padding: 22px 16px 18px → 0 16px 18px }` (zero top — sidebar-brand handles its own height). (b) `.sidebar-brand { height: var(--topbar-h) (68px), padding: 0 10px }` — content auto-centres at Y=34, exactly matching topbar's content centre. |
| `public/assets/css/chat.css` | Appended ~180 lines of polish: bubble radius 22 + padding 13/18 + AI gradient + hover lift + user shadow glow, `.bubble .money` + `.money.big`, `.bubble.bot.result-card` violet→fuchsia accent, `.composer-input.ph-fade` + `@keyframes phFadeIn`, `.scroll-fab` frosted glass + `@keyframes fabBob` + `.scroll-fab .badge`, `.date-divider` with hairline gradient. |
| `helpers/dashboard-engine.js` | `runWidget` for `kind:'kpi'` now zero-pads sparkline across `dr.from..dr.to` and returns parallel `sparkline_dates` array (`['YYYY-MM-DD', ...]`). 400-day safety cap. Backward-compat fallback for `range=all`. |

**Bug fix that unblocked everything:**

First chat.html load showed broken topbar — only ≡ icon + bare greeting text visible. Root cause: I had used CSS class names (`tb-greeting`, `tb-sub`, `avatar-circle`, wrapper divs `tb-left`/`tb-right`) that didn't exist in `app.css` — so the topbar got zero styling. Fixed by adopting dashboard's exact HTML structure (`<div style="display:flex">` wrappers, `.greeting > .who + .when` block, `.avatar` round, `.topbar-actions` row).

Second issue: `.mobile-toggle { display: none }` rule was missing → ≡ icon showed on desktop (it's a mobile-only burger). Added inline style block matching dashboard's pattern with `@media (max-width: 760px)` exception.

**Topbar redesign — chat-app premium pattern:**

Both pages now share an identical greeting block layout:

```
[☰ mobile-only]  [💎 30×30 gradient avatar with tenant initial]   tenant-name 🟢 pulsing-dot
                                                                  live status subtitle (ticks every 30s)
```

| Element | Spec |
|---|---|
| Avatar | 30×30 px, border-radius 8px, gradient `cyan → violet 65% → fuchsia`, hover `scale(1.06) rotate(-2deg)`, soft glow shadow `0 4px 10px rgba(0,164,210,0.18)`, dark-mode boosted shadow |
| Name | 16px / weight 600 / letter-spacing -0.01em |
| Pulsing dot | 7px emerald circle, `@keyframes dotPulse` 2.4s cycle: `box-shadow 0px → 6px → 0px` (expanding ring fade) |
| Subtitle | 11px tertiary, ticks via `setInterval(refreshSubtitle, 30000)` — chat shows "Good afternoon · just synced", dashboard shows "Tuesday, 26 May 2026 · just synced". Resets `lastSyncAt = Date.now()` and re-renders on every sync success |

**Sidebar↔topbar Y-axis alignment fix:**

Diagnosis (from user screenshots): sidebar brand block was visibly **22px below** topbar greeting. Cause was `.sidebar { padding: 22px 16px 18px }` pushing brand down. Topbar starts at Y=0 with 68px height; brand was effectively at Y=22.

Fix:
1. `.sidebar { padding: 0 16px 18px }` — kill the 22px top padding
2. `.sidebar-brand { height: var(--topbar-h) }` — same 68px box as topbar, both with `align-items: center` → both content centres at Y=34 exactly

**Sidebar brand size matching:**

User asked to make topbar avatar + greeting match sidebar's "MIS / Make It Simple" sizing exactly. Resized:
- Avatar: 38×38 round → 30×30 rounded-square 8px (matches `.sidebar-brand .logo`)
- Avatar font: 15px → 13px
- Name: 15.5px / 700 → 16px / 600 (matches `.sidebar-brand .name`)
- Subtitle: 11.5px → 11px (matches `.sidebar-brand .tag`)
- Gap: kept at 10px both sides
- Avatar gradient kept distinctive (cyan→violet→fuchsia vs sidebar's pure brand cyan) — same SIZE, distinct CHARACTER

**Chart overhaul (drill-down + main line charts):**

User showed 4 KPI drill-down screenshots — all had wild peak-overshooting line charts looking like heart-monitor readings, no X-axis date labels, and Y-axis with non-zero floors. Three root causes:

1. `tension: 0.36` Catmull-Rom-style spline overshoots adjacent points when daily values jump from zero to high values
2. Sparkline returned `[number, number, ...]` only — no date context, labels rendered as "Day 1, Day 2, ..."
3. SQL `GROUP BY day` skipped no-data days → line drew from one data day directly to the next (false continuity)

Three-layer fix:

| Layer | Change |
|---|---|
| Engine | Sparkline now zero-pads every day in `dr.from..dr.to`. Returns `sparkline` + parallel `sparkline_dates` of equal length. Backward-compat fallback for `range=all`. 400-day safety cap. |
| Chart.js v4 config (drill + main line) | `cubicInterpolationMode: 'monotone'` — the spline is mathematically constrained to never overshoot adjacent data points. **Kills wild peaks entirely.** `tension: 0.36 → 0.25` (gentler curve). `beginAtZero: true` (no fake floor). `autoSkip: true, maxTicksLimit: 8` (~8 evenly-spaced X-labels regardless of point count). `pointHitRadius: 18` (easier hover targets). `spanGaps: true` (handle null gaps gracefully). |
| Date-label formatter | Both drill-chart's `formatDateShort()` and main chart's X-axis `ticks.callback` now detect ISO strings (`/^\d{4}-\d{2}-\d{2}/`) and format them as "26 May" via `toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })`. Handles both shapes — drill's pre-formatted labels and main chart's raw ISO dates. |

Premium tooltip on drill-chart: dark frosted background `rgba(28,28,30,0.94)`, JetBrains Mono body font for value, `mode: 'index'` so hover anywhere along the chart highlights the nearest point. Theme-aware tick + grid colours (lighter in dark mode).

**Live verification (all 11 green):**

| # | Check | Result |
|---|-------|--------|
| 1 | `/health` | ✅ db.ok:true, latency_ms:197 |
| 2 | `/chat` serves new chat.html | ✅ has chips-row, waveform, composer, tenant-avatar, status-dot |
| 3 | `/chat-legacy` rollback path | ✅ Old MIS Work India page intact |
| 4 | `/dashboard` topbar updated | ✅ tenant-avatar + status-dot + refreshTopbarSubtitle present |
| 5 | `/api/chat-suggestions?phone=kaizen` | ✅ 6 chips returned |
| 6 | `/api/dashboard?phone=kaizen` | ✅ 10 widgets, 30-day sparkline + sparkline_dates parallel arrays length 30 each |
| 7 | All 117 unit tests | ✅ 117 pass / 0 fail in 177-219ms |
| 8 | Money-pill regex isolated test | ✅ Correctly tags ₹X.XX with `big` modifier on Cr/L |
| 9 | chat.html script | ✅ Parses cleanly via `new Function()` (~33 KB body) |
| 10 | chat.css braces | ✅ 196:196 balanced |
| 11 | dashboard.html chart config | ✅ `cubicInterpolationMode` (2x), `beginAtZero` (2x), `autoSkip` (2x) |

**Futuristic Drill-Down Upgrade (final polish on KPI modals):**

After the alignment + monotone fixes the user said the drill-down charts still felt "weird, not pleasing, want futuristic + advance + premium". Applied a 12-point upgrade:

| # | Upgrade | Implementation |
|---|---|---|
| 1 | Aurora backdrop on modal | 2 radial gradients (KPI accent color) at 90% -20% (top-right) and -10% 110% (bottom-left), layered behind `var(--surface-card)` |
| 2 | Top scanning gradient line | 1.5px bar at modal top edge — `linear-gradient(90deg, transparent, kpi-color 30%, fuchsia 50%, cyan 70%, transparent)` |
| 3 | Modal opening spring | `@keyframes drillOpen` 540ms `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot bounce) |
| 4 | Gradient title text | KPI color blended into text-primary via `-webkit-background-clip: text` |
| 5 | Animated count-up | `animateStatValue(el, target, format, 1100ms)` — RAF loop with ease-out cubic, formats with `MIS.fmt.inr/num` per tick |
| 6 | **Neon-glow on line** | Chart.js plugin `glowLinePlugin` — sets canvas `shadowColor + shadowBlur 22px` before drawing each glow-enabled dataset, restores after. Registered once globally via `Chart._glowRegistered` flag |
| 7 | Vivid 4-stop gradient fill | `color70 → color40 (35%) → color15 (75%) → color00 (100%)` — much richer than 3-stop |
| 8 | 7-day moving average overlay | `movingAverage(arr, 7)` centred-window helper. Drawn as dataset 0 with `borderDash:[6,5], borderWidth:1.4, glow:false` — dashed faint trend line through the noise |
| 9 | Min/Max floating chips | After chart render, scan `data` for max/min indexes. Position `<div class="drill-marker">` chips above each peak via `chart.getDatasetMeta(1).data[i].x/y`. Pill shows `🔺 ₹1.50 Cr · 28 Apr` (high) or `🔻 ₹0 · 22 May` (low) with arrow pointer beneath. Skips low marker when value is 0 (likely zero-padded gap) |
| 10 | Pulsing dot animations | Two `<div class="drill-pulse">` elements positioned at peak/trough. `@keyframes drillPulseRing` (emerald) + `drillPulseRingRose` (red) — infinite expanding ring fade every 1.8s |
| 11 | Halo glow under chart | `.drill-chart-wrap::before` radial gradient (KPI color, 14% alpha) at 50% 100%, blurred 20px, fades in 200ms after modal open |
| 12 | Premium stat cards | Accent-tinted left-edge bar (3px gradient) + subtle gradient background blending KPI-soft into surface-card + hover lift -2px + KPI-color shadow |

**Files modified for futuristic upgrade:**
- `public/assets/css/app.css` — appended 200 lines (aurora backdrop, top scanner, drill-open keyframes, glowing markers, pulsing dots, animated halo, premium stat cards)
- `public/dashboard.html` — wrapped `<canvas#drillChart>` in `<div class="drill-chart-wrap">` with 4 marker placeholders, completely rewrote `openDrillDown()` (~250 lines) with: `glowLinePlugin` registration, `movingAverage()`, `animateStatValue()`, two-dataset chart (trend dashed + main neon), `positionMinMaxMarkers()` for chip placement post-render, `closeDrillDown()` cleanup that hides markers between opens

**Tooltip filter** — `tooltip.filter: (item) => item.datasetIndex === 1` — only the main line shows tooltip, not the moving-average overlay. Clean UX.

**`prefers-reduced-motion` respected** — all aurora/pulse/halo animations turn off via media query.

**Live verification (post-upgrade, all green):**
- ✅ chart wraps in `.drill-chart-wrap`, 4 marker elements present
- ✅ `glowLinePlugin` registered globally with `Chart._glowRegistered` guard
- ✅ Exactly 5 helper functions (`openDrillDown`, `closeDrillDown`, `positionMinMaxMarkers`, `movingAverage`, `animateStatValue`)
- ✅ Exactly 1 `drillChart = new Chart(...)` instance (no duplicate from old code)
- ✅ All 117 unit tests still pass

**Sample API response excerpt (kaizen — `GET /api/dashboard?phone=919999408444&range=month`, KPI widget):**

```json
{
  "id": "kpi.total_sales",
  "kind": "kpi",
  "ok": true,
  "data": {
    "value": 126908147.04,
    "prev": 117278950,
    "delta_pct": 8.21,
    "format": "inr",
    "sparkline":       [2961236, 14934367.04, 2584076, ..., 0, 0, 9450000],
    "sparkline_dates": ["2026-04-27", "2026-04-28", "2026-04-29", ..., "2026-05-24", "2026-05-25", "2026-05-26"]
  }
}
```

Both arrays length 30 (one per day in the month range). Days with no sales appear as `0` so the chart shows true business rhythm — peaks and zeros — instead of a misleading line connecting only data-bearing days.

**What was NOT touched (frozen):**
- All backend handlers (`tenant-router.js`, `tenant-tables.js`, `tenant-chart.js`, etc.) — Phase 6-18 stable
- `public/index.html` — kept verbatim as `/chat-legacy` rollback path
- `public/login.html`, `public/register.html` — Sprint 1 stable
- Donut + bar charts — no overshoot issue, untouched
- Small KPI sparkline (`drawSparkline()` pure-canvas function) — uses midpoint quadratic which doesn't overshoot dramatically; left alone

### Phase 20 Futuristic Drill-Down Upgrade ✅ DONE (2026-05-26 13:31 IST)

**Goal:** After all the alignment + monotone fixes, user said the drill-down KPI charts still felt "weird, not pleasing, want futuristic + advance + premium". Single comprehensive visual upgrade pass — no breaking changes, all additive.

**Inspiration:** Linear / Vercel / Stripe dashboards — neon-tinted lines, ambient backdrops, animated reveals, min/max annotations, moving-average trend overlays.

**Files modified:**

| File | Change |
|------|--------|
| `public/assets/css/app.css` | Appended ~200 lines of futuristic drill modal styling. New rules: `.modal-card.drill-modal` aurora radial-gradient layered background + KPI-tinted border + huge KPI-coloured shadow, `::before` top scanning gradient bar, `.drill-head .ic-lg` gradient + glow, `.drill-head .t-h2` gradient text via `-webkit-background-clip`, `.drill-stat` accent-tinted left edge + hover lift, `.drill-chart-wrap::before` radial halo blur with `chartHaloFade` keyframes, `.drill-marker` floating chip + arrow pointer + theme-aware backgrounds, `.drill-pulse` peak/trough glowing dot with `drillPulseRing`/`drillPulseRingRose` infinite ring keyframes, `@keyframes drillOpen` spring overshoot for modal entrance, `prefers-reduced-motion` guards |
| `public/dashboard.html` | (a) Wrapped `<canvas#drillChart>` in `<div class="drill-chart-wrap">` with 4 marker placeholders (`#drillMarkerHigh`, `#drillMarkerLow`, `#drillPulseHigh`, `#drillPulseLow`). (b) Added Chart.js plugin `glowLinePlugin` registered once globally via `Chart._glowRegistered` flag — applies `shadowColor + shadowBlur 22px` to canvas before drawing each glow-enabled dataset. (c) Added pure-fn helpers `movingAverage(arr, win=7)` (centred-window) and `animateStatValue(el, target, format, duration)` (RAF count-up with ease-out cubic). (d) Completely rewrote `openDrillDown(w)` (~250 lines) with two-dataset chart (trend dashed + main neon), animated stat values, vivid 4-stop gradient fill, marker positioning post-render via `requestAnimationFrame` + `chart.getDatasetMeta(1).data[i].x/y`. (e) Added `positionMinMaxMarkers()` helper that scans data for peak/trough indexes, places chips above the points using `getBoundingClientRect` offset math, skips low marker when value is 0 (avoid noise on zero-padded days). (f) Updated `closeDrillDown()` to also hide markers between opens. |

**Architecture choices:**

- **Chart.js plugin over CSS filter** — first instinct was `.drill-canvas { filter: drop-shadow() }` but that would glow EVERYTHING (text, grid). Plugin approach scopes the glow strictly to the line dataset via `ctx.shadowBlur` save/restore around `beforeDatasetDraw`/`afterDatasetDraw` hooks
- **Two-dataset trend overlay** — the dashed 7-day moving average is dataset 0, the main neon line is dataset 1. Tooltip uses `filter: (item) => item.datasetIndex === 1` so the trend line never adds noise to hover tooltips. Trend has `glow: false` flag so the plugin skips it
- **`Chart._glowRegistered` guard** — `Chart.register(glowLinePlugin)` runs once on first `openDrillDown` call. Subsequent opens skip re-registration
- **Markers via DOM not Chart.js plugin** — drawing peak/trough chips with HTML/CSS gives full control over styling (gradient pills, arrow pointers, pulse rings). Position synced to canvas points via `getBoundingClientRect` offset math after a `requestAnimationFrame` so the chart finishes its initial layout
- **Markers skipped on degenerate data** — if all values equal (`max === min`), skip both markers. Skip low when `data[minIdx] === 0` because zero-padded missing-data days would show "🔻 ₹0 · 22 May" which is misleading
- **`prefers-reduced-motion`** — every animation (aurora, pulse, halo, modal-open) is wrapped in the media query so users who opt out get a static premium look without motion
- **Count-up uses `MIS.fmt.inr` per tick** — formatted live during the 1.1s animation, so user sees "₹0 → ₹1.5 Cr → ₹3 Cr → ... → ₹12.69 Cr" with proper Indian currency formatting throughout

**12-point visual upgrade summary:**

| # | Element | Effect |
|---|---|---|
| 1 | Modal aurora backdrop | 2 radial KPI-color gradients top-right + bottom-left (futuristic ambient feel) |
| 2 | Top scanning gradient | 1.5px cyan→fuchsia→cyan bar at modal top (scanner aesthetic) |
| 3 | Modal opening spring | 540ms cubic-bezier(0.34, 1.56, 0.64, 1) overshoot bounce |
| 4 | Gradient title text | KPI accent blended into primary text colour |
| 5 | Count-up stats | Current/Previous animate from 0 → target with formatted ₹ ticks |
| 6 | Neon-glow line | Chart.js plugin canvas shadow blur 22px, scoped to line only |
| 7 | Vivid 4-stop fill | color70 → color40 → color15 → transparent gradient under line |
| 8 | 7-day moving avg | Dashed faint trend overlay through the noise |
| 9 | Min/Max chips | `🔺 ₹1.50 Cr · 28 Apr` (emerald) / `🔻 ₹0.40 L · 22 May` (rose) with arrow pointers |
| 10 | Pulsing peak dots | Infinite expanding ring (1.8s cycle), emerald for high, rose for low |
| 11 | Bottom halo glow | KPI-color radial blur fading in 200ms after modal open |
| 12 | Premium stat cards | Accent-tinted left edge bar + gradient bg + hover lift |

**Live verification:**
- ✅ chart-wrap div present, 4 marker placeholders rendered
- ✅ `glowLinePlugin` registered with `Chart._glowRegistered` guard preventing duplicates
- ✅ Exactly 5 helper functions (`openDrillDown`, `closeDrillDown`, `positionMinMaxMarkers`, `movingAverage`, `animateStatValue`)
- ✅ Exactly 1 `drillChart = new Chart(ctx, ...)` instance — no duplicate from refactor
- ✅ `dashboard.html` 54 KB total
- ✅ All 117 unit tests pass in 185ms

**Visual concept (text representation):**

```
╔═══════════════════════════════════════════════════════════════╗
║━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━║  ← scanning bar
║                                                                ║
║  ╭──╮  Total Sales                                          ✕  ║
║  │📈│  month · last 30-day breakdown                           ║
║  ╰──╯                                                          ║
║                                                                ║
║  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              ║
║  │▌ CURRENT    │ │▌ PREVIOUS   │ │▌ CHANGE     │              ║
║  │  ₹12.69 Cr  │ │  ₹11.73 Cr  │ │  ▲ 8.2%     │              ║
║  └─────────────┘ └─────────────┘ └─────────────┘              ║
║                                                                ║
║  ₹1.50 Cr   ┌────────────╮                                    ║
║             │🔺 ₹1.50 Cr  │                                    ║
║             │  · 28 Apr   │                                    ║
║             ╰─────▼───────╯                                    ║
║                  ●  ←─ pulsing ring (emerald)                  ║
║              ╱╲      neon-glow line with vivid gradient fill   ║
║  ₹1.00 Cr  ╱   ╲                                              ║
║          ╱  ╲   ╲       ╭─── 7-day moving avg (dashed)         ║
║        ╱     ╲   ╲   ╱╲                                       ║
║  ₹50 L      ╲   ╲ ╱  ╲                                        ║
║              ╲   ╳    ╲    ●  ←─ pulsing ring (rose)          ║
║               ╲       ┌──────╮                                 ║
║                       │🔻 ₹0 │                                ║
║                       │·22May│                                 ║
║                       ╰──▼───╯                                 ║
║  ₹0   27 Apr  1 May  5 May  9 May  13 May  17 May  25 May      ║
║                                                                ║
╚═══════════════════════════════════════════════════════════════╝
       (KPI-color halo glow under chart, aurora corners)
```

### Phase 20 Sprint 4 — TBD (next session — see RESUME HERE for options)

User to pick from 5 options at top of roadmap. Recommended default: **Option B (drill-down pages — `/sales`, `/outstanding`, `/stock`, `/ledger`)** — completes the full Apple shell by making the 4 sidebar stubs into real pages.

---

For complete documentation, see: `PROJECT_OVERVIEW.md`
