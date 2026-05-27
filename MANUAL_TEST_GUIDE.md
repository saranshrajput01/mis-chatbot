# 🧪 MIS Chatbot — Manual Test Guide

**Tenant:** MIS-2 (Sheet: `1HYXoLNsg0lYkmqhBLUBnFbyEatmVfM8SHcbk7YxNPrw`)
**Tabs:** SALES (803 rows) + PURCHASES (1290 rows)
**Generated:** 2026-05-25 — answers computed directly from sheet, current as of last sync.

> ✅ = exact match expected | ≈ = within ±1% (formatting tolerance) | 🔁 = behavior check (no exact answer)
> Send each question via WhatsApp (or web chat) and compare. Mark Pass/Fail.

---

## 📊 SECTION 1 — Phase 6: Basic Queries (Type-aware Formatter)

| # | Query | Expected Answer | Tests |
|---|-------|-----------------|-------|
| 1.1 | `total invoices kitne hain?` | ✅ **278 invoices** (no ₹ on count) | COUNT(DISTINCT) + no ₹-on-count bug |
| 1.2 | `total sales kitni hai?` (with GST) | ✅ **₹24.42 Cr** (24,41,50,555.82) | Currency formatting |
| 1.3 | `kitne sales persons hain?` | ✅ **19 sales persons** | Count distinct + no ₹ |
| 1.4 | `Foundation Bolt ki total qty kya hai?` | ✅ **88,242.5 KG** (no ₹, with KG unit) | Quantity formatter — qty pe ₹ NAHI lagna chahiye |
| 1.5 | `Foundation Bolt ka total amount?` | ✅ **₹76.78 L** (76,77,611.30) | Currency on Amount column |
| 1.6 | `highest single invoice kaun sa hai?` | ✅ **223/2026-27** — ₹58.95 L on **11-May-26** for **MITTAL ELECTRONICS** | Full date format (not "11"), all metrics |

---

## 📅 SECTION 2 — Date Filtering (Hinglish + ILIKE)

| # | Query | Expected Answer | Tests |
|---|-------|-----------------|-------|
| 2.1 | `18 April invoices kitne the?` | ✅ **25 invoices** | ILIKE '%18-Apr%' |
| 2.2 | `April 2026 ki total sales?` (WITH GST) | ✅ **₹15.10 Cr** (15,09,94,378.32) across **164 invoices** | Month-level filter |
| 2.3 | `May 2026 ki sales WITH GST kitni hai?` | ✅ **₹9.32 Cr** (9,31,56,177.50) across **109 invoices** | Different month |
| 2.4 | `May ki invoices?` (auto-current-year) | 🔁 Should ask which May or default to most recent matching | Ambiguity handling |

---

## 👥 SECTION 3 — Top-N + Aggregate Summary (Phase 8)

| # | Query | Expected Answer | Tests |
|---|-------|-----------------|-------|
| 3.1 | `top 5 parties kaun hain?` | ✅ <br>1. **Insulators & Electricals Company** — ₹6.45 Cr (32 inv) <br>2. **NPL Buildcon LLP** — ₹4.37 Cr (25 inv) <br>3. **Bharat Heavy Electricals Limited** — ₹3.20 Cr (73 inv) <br>4. **MITTAL ELECTRONICS** — ₹1.37 Cr (16 inv) <br>5. **Saga Stainox Private Limited** — ₹1.34 Cr (14 inv) <br>📊 Total across 5: ~₹16.74 Cr | NULL filtered, dedup, full ₹ format, "Total across N" line |
| 3.2 | `top 5 sales persons` | ✅ <br>1. **Shailendra Jhalani** — ₹6.45 Cr (32 inv) <br>2. **Sanjay Aggarwal** — ₹4.37 Cr (25 inv) <br>3. **Piyush Aggarwal** — ₹1.37 Cr (16 inv) <br>4. **Gaurav** — ₹1.36 Cr (16 inv) <br>5. **Akash Jain** — ₹75.17 L (3 inv) | Sales person aggregation |
| 3.3 | `top 5 cities` | 🔁 RAISEN, Mirzapur, SONEPAT, Gohana, JHAJJAR (rough order) | GROUP BY city |

---

## 🔍 SECTION 4 — SMART SEARCH (Multi-column Entity)

| # | Query | Expected Answer | Tests |
|---|-------|-----------------|-------|
| 4.1 | `Sanjay Aggarwal ki sales kitni?` | ✅ **₹4.37 Cr, 25 invoices** (he's a sales person, not a party) | AI must search BOTH `party_name` + `sales_person_name` |
| 4.2 | `Shailendra ki sales?` | ✅ **₹6.45 Cr, 32 invoices** | Partial name match |
| 4.3 | `MITTAL ELECTRONICS ka data?` | ✅ **₹1.37 Cr, 16 invoices** | Party-side match |
| 4.4 | `Saga Stainox ki sales` | ✅ **₹1.34 Cr, 14 invoices** | Multi-word entity |

---

## 🩺 SECTION 5 — Phase 10 Self-Healing (Fuzzy + Relax + Validate)

| # | Query | Expected Behavior | Tests |
|---|-------|-------------------|-------|
| 5.1 | `Mital Electronicss ki sales` (typo) | 🔁 Fuzzy fallback → suggest **MITTAL ELECTRONICS** OR auto-substitute | pg_trgm fuzzy search |
| 5.2 | `pansaree ka data` (heavy typo) | 🔁 Fuzzy → **Pansari Industries** suggested (OR "no close match") | Similarity scoring |
| 5.3 | `BHEL ki sales August 2024` (wrong year — no data) | 🔁 0 rows → relaxSQL drops year → returns BHEL data with hint | Query relaxation |
| 5.4 | `Saga Stainox August 2024` | 🔁 0 rows → all-NULL aggregate caught → fuzzy hint | validateResult + reroute |
| 5.5 | `random_blah ki sales` (gibberish) | 🔁 No fuzzy match → AI returns "data nahi mila" gracefully | Conservative bail-out |

---

## 🎯 SECTION 6 — Advanced SQL Patterns (Phase 8 ADVANCED RULES)

| # | Query | Expected Answer | Tests |
|---|-------|-----------------|-------|
| 6.1 | `IMMEDIATE vs non-IMMEDIATE invoices ka count?` | ✅ **IMMEDIATE: 118, OTHERS: 160** | CASE WHEN aggregation |
| 6.2 | `median invoice value kya hai?` | 🔁 PERCENTILE_DISC SQL — should return reasonable mid-value | Percentile support |
| 6.3 | `invoice value ka standard deviation?` | 🔁 STDDEV() — number returned | STDDEV support |
| 6.4 | `Foundation Bolt qty + amount + invoices` | ✅ **88,242.5 KG, ₹76.78 L, 41 invoices** | Include-all-metrics rule |
| 6.5 | `tax wali rows hatake total sales?` | 🔁 Should exclude `Out Put IGST` / `INPUT CGST` rows | Tax-row exclusion |

---

## 📄 SECTION 7 — Phase 7: Tier System (Inline / Summary / PDF / CSV)

| # | Query | Expected Output Type | Tests |
|---|-------|----------------------|-------|
| 7.1 | `top 5 parties` | **Inline list** (≤15 rows) with emojis 1️⃣2️⃣3️⃣ + "Total across 5" | Tier 1 |
| 7.2 | `top 30 parties` | **AI summary** (16-50 rows) — top 20 highlighted + full totals | Tier 2 |
| 7.3 | `saare invoices list karo` | **PDF attachment** (51-100 rows) — A4 landscape, zebra stripes | Tier 3 (PDF) |
| 7.4 | `saari sales rows` (200+ rows) | **CSV attachment** (>100 rows) — UTF-8 BOM, RFC 4180 | Tier 4 (CSV) |

> Watch for: filename has `.pdf` / `.csv`, MIME correct, opens in Acrobat/Excel without errors.

---

## 📊 SECTION 8 — Phase 7: Charts

| # | Query | Expected Chart | Tests |
|---|-------|----------------|-------|
| 8.1 | `month-wise sales chart banao` | 📊 **Bar chart** image (Apr/May 2026) via QuickChart.io | Chart routing |
| 8.2 | `top 5 parties pie chart` | 📊 **Pie chart** image | Pie type detection |
| 8.3 | `sales person wise donut chart` | 📊 **Doughnut chart** image | Doughnut keyword |

---

## 🖼️ SECTION 9 — Phase 7: Image Auto-Send

| # | Query | Expected Behavior | Tests |
|---|-------|-------------------|-------|
| 9.1 | `product photos dikhao` | 🔁 If image columns detected → image(s) sent. Otherwise: "no image cols" friendly msg | Image col detection |

> MIS-2 sheet has no image URLs in samples — should show friendly "image columns nahi hain" message.

---

## 📒 SECTION 10 — Phase 7: Ledger PDF (MIS Main only)

> MIS-2 tenant doesn't have a ledger-shaped table. Test these on **MIS Main** (your phone).

| # | Query | Expected Behavior | Tests |
|---|-------|-------------------|-------|
| 10.1 | `Pansari ka ledger` | 📄 **Styled ledger PDF** (debit/credit/balance) | Ledger detection + PDF |
| 10.2 | `ledger of <ambiguous name>` | 🔁 Multi-turn: "Kaunsa? 1. X 2. Y" + select by number | Disambiguation |
| 10.3 | `pansaree ka ledger` (typo) | 🔁 Fuzzy → "Pansari Industries" suggested | pg_trgm on ledger |

---

## 🎙️ SECTION 11 — Phase 9: Voice & Communication

| # | Test | Expected Behavior | Tests |
|---|------|-------------------|-------|
| 11.1 | Send **voice note** to bot ("aaj ki sales kitni hai") | ✅ Whisper transcribes → text reply | Voice for tenant |
| 11.2 | Tenant phone (NOT in `access_control.json`) sends voice | ✅ Bypasses `checkAccess` gate via `isKnownTenant()` | Access-gate fix |
| 11.3 | After sheet edit → wait 15 min → query | ✅ Auto-sync picked up new row | Auto-sync loop |
| 11.4 | After tenant query → check `tenant_query_logs` table | ✅ `query`, `sql_generated`, `response` all 3 populated | Chat log fix |

---

## 📅 SECTION 12 — Calendar (MIS Main + Connected Tenants)

| # | Query | Expected Behavior | Tests |
|---|-------|-------------------|-------|
| 12.1 | `kal 3 baje Amit ke saath meeting` | ✅ Pre-confirm summary → user `Haan` → ✅ Booked + WhatsApp + 📧 Email + 🟢 Jitsi link | Booking + email + Jitsi |
| 12.2 | `aaj ki meetings` | ✅ List with 🔔 SOON / 🟢 LIVE badges | Live badge logic |
| 12.3 | `meeting cancel karo client unavailable hai` | ✅ Reason menu (1-5) → select 1 → ✅ Cancelled with reason | Cancel + reason tracking |
| 12.4 | Book at 3 PM, then book another at 3 PM same day | ✅ Conflict warning shown | Conflict detection |
| 12.5 | Book a meeting starting in 16 mins | ✅ At T-15min: WhatsApp reminder fires once | Reminder dedup |
| 12.6 | Wait until 8 AM IST | ✅ Daily schedule WhatsApp + Email auto-sent | Daily schedule loop |

---

## 🎭 SECTION 13 — Intent Detection (Phase C)

| # | Message | Expected Intent | Reply |
|---|---------|-----------------|-------|
| 13.1 | `hi` / `hello` | GREETING | 🔁 Friendly greeting OR silent (per config) |
| 13.2 | `thanks bro` | IGNORE | 🔁 Silent or short ack |
| 13.3 | `what's the weather?` | IGNORE | 🔁 Silent (off-topic) |
| 13.4 | `total sales?` | DATA_QUERY | ✅ Real answer |
| 13.5 | `kal meeting book karo` | CALENDAR_BOOKING | ✅ Booking flow |

---

## 🔀 SECTION 14 — Multi-DB Routing (Phase 3)

> Only relevant if your phone is registered with **multiple** databases.

| # | Query | Expected Behavior | Tests |
|---|-------|-------------------|-------|
| 14.1 | `switch db` | ✅ Numbered list of all your DBs | DB list |
| 14.2 | Select `1` after switch db | ✅ "DB switched to X" + sticky for next queries | Persistent DB selection |
| 14.3 | After PM2 restart → query | ✅ Still on same DB (`.db_selections.json` persistent) | Restart-safe |

---

## 🛡️ SECTION 15 — Health & Reliability

| # | Test | Expected | Tests |
|---|------|----------|-------|
| 15.1 | `curl /health` | ✅ HTTP 200 + `{db:{ok:true, latency_ms:<1000}}` | Real DB ping |
| 15.2 | Stop DB temporarily → `/health` | ✅ HTTP 503 + diagnostics | Health failure detect |
| 15.3 | Network blip during query | ✅ Auto-retry with backoff (250→500→1000ms) → recovers silently | withRetry |
| 15.4 | `npm test` | ✅ **131 tests pass** in ~10s | Regression suite |
| 15.5 | `RUN_INTEGRATION=1 npm test` | ✅ All 131 + 8 live tests pass in ~16s | Live AI/DB tests |

---

## 📈 PURCHASES TAB Quick Sanity (gid=1458629891)

| # | Query | Expected Answer |
|---|-------|-----------------|
| P.1 | `total purchases kitni hain?` | ✅ **₹18.09 Cr** (18,08,51,268) across **348 vouchers** |
| P.2 | `top supplier?` | ✅ **Vikrant Iron Pvt Ltd** — ₹2.48 Cr (11 vch) |
| P.3 | `top 5 suppliers` | ✅ Vikrant Iron, P.S. Enterprises, Mahawar Iron, SAIL, CLASSIC INDUSTRIES |
| P.4 | `April purchases?` | ✅ Apr-26 has **878 rows** (multi-line vouchers) |

---

## 🎯 Scoring Cheat-Sheet

- **20+ ✅ in Sections 1-6** = core query engine working
- **All ✅ in Section 5** = self-healing live
- **Sections 7+8** = media pipeline OK
- **Section 11** = communication features OK
- **Section 12** = calendar OK
- **Section 15** = infra OK

If anything fails: check `pm2 logs mis-chatbot --lines 50` and share the SQL it generated (visible in PM2 logs).

---

## 🧮 Reference Numbers (computed from sheet, 2026-05-25)

```
SALES TAB
  Total rows                        : 803
  Unique invoices (Voucher_Numbe)   : 278
  Total WITH GST (deduplicated)     : ₹24,41,50,555.82
  18-Apr-26 invoices                : 25
  Apr-26 total                      : ₹15,09,94,378.32 / 164 inv
  May-26 total                      : ₹9,31,56,177.50 / 109 inv
  IMMEDIATE / OTHERS                : 118 / 160
  Foundation Bolt                   : 88,242.5 KG, ₹76,77,611.30, 41 inv
  Highest single invoice            : 223/2026-27 — ₹58,94,708 (11-May-26, MITTAL ELECTRONICS)
  Sales persons (unique)            : 19

PURCHASES TAB
  Total rows                        : 1290
  Unique vouchers (VchNo)           : 348
  Total InvoiceAmount (deduplicated): ₹18,08,51,268.00
  Top supplier                      : Vikrant Iron Pvt Ltd — ₹2,47,74,093 (11 vch)
  Months covered                    : Apr-26 (878 rows), May-26 (413 rows)
```
