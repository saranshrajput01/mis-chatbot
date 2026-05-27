# 🚨 MIS Chatbot — Comprehensive Limitations & Vulnerability Report

**Date:** 2026-05-21 21:27 IST  
**Tested By:** Extreme Testing (All endpoints, edge cases, security vectors)

---

## 🔴 CRITICAL (Must Fix Immediately)

### 1. WEB CHAT COMPLETELY BROKEN — `access` undefined (Line 1182)
- **Impact:** ALL web chat data queries crash with `ReferenceError: access is not defined`
- **Location:** `server.js:1182` — `/chat` endpoint references `access.mode` but variable is never defined
- **Reproduction:** Any query via web chat that reaches SQL execution stage
- **Root Cause:** The LIMITED access filter code in `/chat` uses `access` variable that only exists in WhatsApp handler
- **Fix:** Either define `access` in web chat scope or remove the duplicate filter (already handled by `executePlan`)

### 2. SSRF Vulnerability — `/doc-intelligence` fetches ANY URL
- **Impact:** Can read internal services, cloud metadata, localhost endpoints
- **Tested:**
  - `http://169.254.169.254/latest/meta-data/` → ✅ Fetched (AWS metadata)
  - `http://localhost:3000/access` → ✅ Fetched (exposed all user data + phone numbers)
  - `file:///etc/passwd` → Partially blocked (OpenAI refused but endpoint tried)
- **Fix:** URL allowlist (only `docs.google.com`, `drive.google.com`), block private IPs

### 3. NO AUTHENTICATION on ALL API Endpoints
- **Impact:** Anyone on the internet can modify system configuration
- **Endpoints affected:**
  | Endpoint | Risk | What attacker can do |
  |----------|------|---------------------|
  | `POST /access` | 🔴 CRITICAL | Change access mode from LIST→ALL, add/remove users |
  | `POST /api/access/add-user` | 🔴 CRITICAL | Add themselves with ALL access |
  | `POST /api/tenant/register` | 🔴 HIGH | Register fake tenants, pollute DB |
  | `POST /api/tenant/update` | 🔴 HIGH | Modify any tenant's config |
  | `DELETE /history/:sid` | 🔴 HIGH | Delete any user's chat history |
  | `GET/POST /sync` | 🟡 MEDIUM | Trigger full data sync (DoS potential) |
  | `GET /sync/status` | 🟡 LOW | Leak sync metadata |
  | `GET /access` | 🟡 MEDIUM | Read all user phone numbers + permissions |
- **Tested:** Successfully changed mode LIST→ALL, added fake user with ALL access, deleted history

### 4. SQL Injection via LIMITED Access Filter
- **Impact:** LIMITED users can bypass access restrictions to see ALL data
- **Location:** `applyLimitedAccessFilter()` uses string interpolation:
  ```javascript
  sql.replace(/WHERE/i, `WHERE sales_person ILIKE '%${userName}%' AND`)
  ```
- **Attack:** If `userName` in access_control.json contains `' OR 1=1 OR x ILIKE '`, the filter becomes:
  ```sql
  WHERE sales_person ILIKE '%' OR 1=1 OR x ILIKE '%' AND ...
  ```
  → Returns ALL rows, bypassing LIMITED access
- **Fix:** Use parameterized queries or escape single quotes in userName

### 5. Web Chat Has NO Access Control
- **Impact:** Anyone with the URL can query ALL business data without authentication
- **Location:** `/chat` endpoint never calls `checkAccess()`
- **Contrast:** WhatsApp handler checks access by phone number
- **Fix:** Add session-based auth or at minimum IP-based access control

---

## 🟡 HIGH (Should Fix Before Public Launch)

### 6. Session Fixation / Impersonation
- **Impact:** Web user can use a WhatsApp phone number as their `session_id` to access/pollute that user's chat history
- **Tested:** `{"session_id":"918750285420"}` in web chat → shares history with WA user
- **Fix:** Prefix web sessions with `web_` and WA sessions with `wa_`

### 7. Calendar Allows Past Dates
- **Impact:** Can book meetings in 2020, 1990, etc. — pollutes Google Calendar
- **Tested:** "1 Jan 2020 ko meeting" → Shows confirmation with 2020 date
- **Fix:** Add validation: `if (startTime < Date.now()) return "Past date not allowed"`

### 8. sendProductImages — No Maximum Limit
- **Impact:** If user says "all" for 2606 products, bot sends images for 30+ minutes (700ms × 2606 = 30 min)
- **Risk:** WhatsApp API rate limiting, account ban, resource exhaustion
- **Fix:** Cap at 50 images max, inform user

### 9. Rate Limiting Not Working for Web
- **Tested:** 35 rapid requests → ALL returned 200 (limit is 30/min)
- **Root Cause:** Rate limit key is `"web:" + ip` but localhost requests may bypass or the counter logic has a bug
- **Fix:** Verify rate limit logic, add per-session limiting

### 10. No OpenAI API Timeout
- **Impact:** If OpenAI is slow/down, requests hang indefinitely — no AbortController
- **Risk:** Thread starvation, memory buildup, user gets no response
- **Fix:** Add `AbortController` with 30s timeout on all OpenAI fetch calls

### 11. CORS = `*` (Open to All Origins)
- **Impact:** Any website can make API calls to your server
- **Risk:** CSRF attacks, data theft from user's browser
- **Fix:** Restrict to your own domain(s)

---

## 🟠 MEDIUM (Fix Before Scaling)

### 12. CSV Parser Breaks on Newlines in Quoted Fields
- **Location:** `helpers/sync.js` `parseCSV()` — splits on `\n` first, then parses quotes
- **Impact:** Rows with multi-line cell values get split into multiple broken rows
- **Fix:** Use proper CSV parser (e.g., `csv-parse` package) or fix the parser to handle `\r\n` inside quotes

### 13. Tenant Registration Accepts Invalid Data
- **Tested:**
  - Phone `"abc"` → Accepted ✅ (should reject)
  - XSS in name → Partially sanitized (strips `<>` but not all vectors)
  - 10,000 char name → Truncated to 500 (good)
- **Fix:** Validate phone format (10-12 digits), stricter name sanitization

### 14. Access Control File — Synchronous I/O on Every Request
- **Location:** `loadAccessControl()` does `fs.readFileSync()` on EVERY incoming request
- **Impact:** Blocks event loop under load
- **Fix:** Cache in memory, reload on file change (fs.watch) or on sync

### 15. queryCache — No Proactive TTL Cleanup
- **Current:** Entries expire on access (lazy TTL), evicts oldest when >200
- **Risk:** 200 stale entries sitting in memory forever if never accessed again
- **Fix:** Add periodic cleanup (every 5 min, delete expired entries)

### 16. Chart URL Can Exceed Length Limits
- **Location:** `buildChartURL()` encodes full JSON config in URL via `encodeURIComponent`
- **Impact:** Large datasets (50+ labels) → URL > 8000 chars → QuickChart may reject
- **Fix:** Use QuickChart POST API for large charts, or limit data points

### 17. Duplicate LIMITED Access Filter Code
- **Location:** Filter exists in BOTH `/chat` handler (line 1182) AND `executePlan()` function
- **Impact:** Maintenance nightmare, inconsistent behavior, the `/chat` one is broken
- **Fix:** Remove duplicate from `/chat`, rely only on `executePlan()`

---

## 🟢 LOW (Nice to Fix)

### 18. No Input Length Validation on Messages
- **Tested:** 50KB message processed without crash (treated as not_relevant)
- **Risk:** Wastes OpenAI tokens on garbage, potential memory pressure
- **Fix:** Reject messages > 5000 chars with friendly error

### 19. Fuzzy Ledger Search Too Loose
- **Current:** Falls back to 3-char prefix match → "xyz" could match "Ankit xyz Gupta"
- **Impact:** Wrong disambiguation options shown
- **Fix:** Require minimum 4-char match, use Levenshtein distance

### 20. Memory Leaks — rateLimits Map
- **Current:** Cleaned every 5 min, but under burst traffic can grow large
- **Risk:** Minor memory pressure
- **Fix:** Already has cleanup, acceptable

### 21. Tenant Data Fetched Every Query (No Row Cache)
- **Location:** `handleTenantQuery()` fetches ALL rows from Supabase on every query
- **Impact:** Slow for large datasets, unnecessary DB load
- **Fix:** Cache tenant data in memory with TTL (already caches tenant metadata, not row data)

### 22. Google Calendar API Errors (DNS)
- **Observed:** `getaddrinfo ENOTFOUND oauth2.googleapis.com` in logs
- **Impact:** Meeting reminders and daily schedule fail silently
- **Cause:** Likely intermittent DNS resolution failure on local Mac
- **Fix:** Add retry logic, or graceful degradation

### 23. No Webhook Authentication
- **Current:** Anyone can POST to `/whatsapp` endpoint
- **Impact:** Can trigger bot responses, waste OpenAI credits
- **Fix:** Validate webhook signature or shared secret

---

## 📊 SUMMARY TABLE

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 4 | 3 | 1 | 1 |
| Bugs | 1 | 1 | 2 | 1 |
| Performance | 0 | 1 | 3 | 2 |
| Validation | 0 | 1 | 1 | 1 |
| **TOTAL** | **5** | **6** | **7** | **5** |

---

## 🎯 PRIORITY FIX ORDER

1. **FIX LINE 1182** — Web chat broken (5 min fix — remove duplicate access filter)
2. **Add auth to API endpoints** — API key header check (30 min)
3. **Block SSRF in /doc-intelligence** — URL allowlist (15 min)
4. **Add access control to /chat** — Session-based or token auth (1 hr)
5. **Fix SQL injection in LIMITED filter** — Escape quotes (15 min)
6. **Add OpenAI timeout** — AbortController 30s (15 min)
7. **Cap sendProductImages** — Max 50 (5 min)
8. **Calendar past date validation** — Reject past dates (10 min)
9. **Fix rate limiting** — Debug why web rate limit doesn't trigger (30 min)
10. **Restrict CORS** — Set specific origin (5 min)

---

## 🔒 ATTACK SCENARIOS (What a malicious user could do TODAY)

1. **Data Theft:** Visit `/access` → get all phone numbers → use `/doc-intelligence` with `http://localhost:3000/access` to get full config
2. **Privilege Escalation:** POST to `/api/access/add-user` → add self with ALL access → query all data via WhatsApp
3. **Service Disruption:** POST to `/access` with `{"mode":"ALL"}` → everyone gets unrestricted access
4. **History Deletion:** DELETE `/history/918750285420` → wipe owner's chat history
5. **Resource Exhaustion:** Trigger `/sync` repeatedly → overload Google Sheets API + Supabase
6. **Calendar Spam:** Book 1000 recurring meetings via web chat (no auth needed)
7. **Impersonation:** Use victim's phone as web `session_id` → read their chat history

---

*Report generated from live testing on running server (uptime: 9113s)*
