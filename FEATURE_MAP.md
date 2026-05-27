# 🗺️ MIS Chatbot — Feature Map (Every Feature Ka Logic & Location)

**Last Updated:** 2026-05-21

---

## 📁 FILE STRUCTURE

```
mis-chatbot/
├── server.js              (2382 lines — main server, all routes & logic)
├── helpers/
│   ├── whatsapp.js        — WhatsApp API: send message, send media
│   ├── notifications.js   — Email (nodemailer) + WA booking/cancel alerts
│   ├── sync.js            — Google Sheets → Supabase auto-sync
│   ├── sheets.js          — Sheet URL → auto-detect schema (SaaS)
│   ├── prompt.js          — Generate AI prompt per tenant (SaaS)
│   ├── tenant-router.js   — Multi-tenant query routing
│   └── utils.js           — Rate limiting, file utils
├── calendar.js            — Google Calendar API wrapper (create/get/delete events)
├── public/
│   ├── index.html         — Web chatbot UI (4 tabs: Chat, Docs, Sync, Connect Sheet)
│   └── onboard.html       — SaaS onboarding page (standalone dark theme)
├── migrations/
│   └── 001_multi_tenant.sql — Supabase tables for multi-tenancy
├── access.json            — Access control config (ALL/LIST/LIMITED)
├── .env                   — API keys (OPENAI, SUPABASE, WA_API_KEY, PORT)
└── TEST_RESULTS.md        — 73 automated test results
```

---

## 🌐 ACCESS POINTS (Kahan Se Access Hota Hai)

| Feature | URL / Endpoint | Method |
|---------|---------------|--------|
| Web Chatbot UI | `https://saranshs-macbook-air.taile7a14d.ts.net/` | Browser |
| SaaS Onboarding | `https://saranshs-macbook-air.taile7a14d.ts.net/onboard.html` | Browser |
| WhatsApp Bot | WhatsApp pe message bhejo (webhook: `POST /whatsapp`) | WhatsApp |
| Health Check | `GET /health` | API |
| Chat API | `POST /chat` | API |
| Chat History | `GET /history/:sid` | API |
| Access Control View | `GET /access` | API |
| Access Control Set | `POST /access` | API |
| Manual Sync | `POST /sync` | API |
| Sync Status | `GET /sync/status` | API |
| Doc Intelligence | `POST /doc-intelligence` | API |
| Image Analysis | `POST /analyze-image` | API |
| Tenant Schema Detect | `POST /api/tenant/detect-schema` | API |
| Tenant Register | `POST /api/tenant/register` | API |
| Tenant Update | `POST /api/tenant/update` | API |

---

## 🔧 FEATURE-WISE BREAKDOWN

---

### 1. 💬 DATA QUERIES (Text → SQL → Answer)

**Kya karta hai:** User Hindi/English mein question puchta hai → AI SQL generate karta hai → Supabase pe run hota hai → answer format karke bhejta hai

**Flow:**
```
User: "Total expenses kitni hain?"
  ↓
executePlan() [server.js:533]
  ↓ calls processQuery() [server.js:511]
  ↓ OpenAI GPT → generates JSON plan with SQL
  ↓
plan.query_type = "data" → runSQL(plan.sql) [server.js:688]
  ↓
Supabase RPC "execute_sql" → returns rows
  ↓
buildTableHTML(rows) [server.js:1010] → formatted HTML table
  ↓
Response: {reply: "<table>...</table>", type: "html"}
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| AI Prompt (schema + rules) | server.js | 187-394 | `buildSystemPrompt()` — includes all table schemas, column names, example queries |
| OpenAI Call | server.js | 143-164 | `openai()` — sends system prompt + user message, returns JSON |
| Plan Parser | server.js | 511-530 | `processQuery()` — extracts intent, query_type, sql, chart_config |
| Intent Router | server.js | 533-576 | `executePlan()` — routes CALENDAR/DATA/IGNORE |
| SQL Executor | server.js | 688-693 | `runSQL()` — validates SELECT-only, calls Supabase RPC |
| Table Formatter | server.js | 1010-1060 | `buildTableHTML()` — converts rows → styled HTML table |
| Amount Formatter | server.js | 166-169 | `fmtAmt()` — "Rs. 1,55,72,184" Indian format |

**Access:** Web (`POST /chat`) + WhatsApp (`POST /whatsapp`)

---

### 2. 📒 LEDGER SEARCH & PDF

**Kya karta hai:** User company name bolta hai → fuzzy search → ledger data milta hai → PDF generate → send

**Flow:**
```
User: "Sharma ji ka ledger"
  ↓
plan.query_type = "ledger", plan.ledger_search = "Sharma"
  ↓
fuzzyLedgerSearch("Sharma") [server.js:579]
  ↓ Supabase: ILIKE search on ledger.name
  ↓
Multiple results? → Disambiguation menu (select 1-5)
Single result? → buildLedgerHTML() [server.js:620] OR generateLedgerPDF() [server.js:697]
  ↓
WhatsApp: PDF bhejta hai via sendWhatsAppMedia()
Web: HTML table return karta hai
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Fuzzy Search | server.js | 579-617 | `fuzzyLedgerSearch()` — ILIKE + word matching |
| Disambiguation | server.js | 1770-1792 | wpSessions type "ledger_select" + numbered menu |
| Ledger HTML | server.js | 620-686 | `buildLedgerHTML()` — Dr/Cr table with totals |
| Ledger PDF | server.js | 697-817 | `generateLedgerPDF()` — PDFKit landscape A4 |
| Session state | server.js | 1770 | `wpSessions[phone] = {type:"ledger_select", options:[...]}` |

**Access:** Web + WhatsApp

---

### 3. 📊 CHART GENERATION

**Kya karta hai:** "Month wise sales ka chart banao" → AI generates chart config → data fetch → QuickChart URL → image

**Flow:**
```
User: "Expense categories ka pie chart"
  ↓
plan.query_type = "chart", plan.chart_config = {type:"pie", sql:"...", label_col, value_col}
  ↓
runSQL(chart_config.sql) → rows
  ↓
buildChartURL(chartConfig, rows) [server.js:821] → QuickChart.io URL
  ↓
Web: Returns HTML table + chartMeta (frontend renders chart)
WhatsApp: downloadChartImage() → sendWhatsAppMedia() as image
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Chart URL Builder | server.js | 821-887 | `buildChartURL()` — constructs QuickChart.io URL with data |
| Chart Download | server.js | 889-896 | `downloadChartImage()` — fetches PNG from URL |
| Chart Meta (Web) | server.js | 1143-1150 | Returns `{chartMeta: {chartType, title, labelCol, valueCol}}` |

**Access:** Web (renders via Chart.js in browser) + WhatsApp (sends image)

---

### 4. 📅 CALENDAR BOOKING

**Kya karta hai:** Voice/text se meeting book karta hai Google Calendar pe

**Flow:**
```
User: "Kal 3 baje Amit ke saath meeting"
  ↓
executePlan() → intent = "CALENDAR_BOOKING" → returns {query_type:"calendar"}
  ↓
handleCalendarIntent("CALENDAR_BOOKING", msg, phone) [server.js:1181]
  ↓
parseCalendarBooking(msg) [server.js:1540] → OpenAI extracts: title, date, time, guest, recurring
  ↓
Show confirmation: "📅 Meeting Summary — Confirm karo?"
  ↓ saves wpSessions[phone] = {type:"calendar_booking_confirm", pendingBooking:{...}}
  ↓
User: "Haan" → early-return check [server.js:1794 WA / 1095 Web]
  ↓
handleCalendarIntent() → checks conflicts → gcal.createEvent(parsed) [calendar.js]
  ↓
sendBookingNotifications() [helpers/notifications.js] → Email + WA alert
  ↓
"✅ Meeting booked! 📌 Title 📅 Date ⏰ Time 🔗 Calendar link"
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Calendar Handler | server.js | 1181-1538 | `handleCalendarIntent()` — routing for book/retrieve/cancel |
| Booking Parser (AI) | server.js | 1540-1593 | `parseCalendarBooking()` — OpenAI extracts structured data |
| Confirmation State | server.js | 1409-1414 | Saves pending booking in wpSessions |
| Early-Return (WA) | server.js | 1794-1800 | Checks calendar state BEFORE AI call |
| Early-Return (Web) | server.js | 1095-1100 | Same check for web /chat |
| Conflict Detection | server.js | 1260-1290 | Checks overlapping events before booking |
| Recurring Logic | server.js | 1373-1397 | daily/weekly/monthly repeat loop |
| Google Calendar API | calendar.js | — | createEvent, getEvents, deleteEvent, updateEvent |

**Access:** Web + WhatsApp

---

### 5. 📋 CALENDAR RETRIEVAL

**Kya karta hai:** "Aaj ki meetings" → Google Calendar se fetch → list with badges

**Flow:**
```
User: "Is hafte ki meetings"
  ↓
intent = "CALENDAR_RETRIEVE" → handleCalendarIntent()
  ↓
Detects range: /kal|tomorrow/ → tomorrow, /week|hafte/ → 7 days, else → today
  ↓
gcal.getEvents(start, end) → events list
  ↓
Adds badges: 🟢 LIVE (ongoing) / 🔔 SOON (within 15 min)
  ↓
"📅 Is hafte ki meetings (2):
 1. 🟢 LIVE 03:00 pm (Fri, 22 May) — Meeting with Amit
 2. 01:00 pm (Wed, 27 May) — Meeting with gyan sir"
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Date Range Detection | server.js | 1311-1327 | Regex: /kal/, /week|hafte/, default=today |
| Events Fetch | server.js | 1328 | `gcal.getEvents(start.toISOString(), end.toISOString())` |
| Live/Soon Badges | server.js | 1338-1346 | Compares current time with event start/end |

**Access:** Web + WhatsApp

---

### 6. ❌ CALENDAR CANCELLATION

**Kya karta hai:** Meeting cancel karta hai with reason tracking

**Flow:**
```
User: "Kal ki meeting cancel karo"
  ↓
intent = "CALENDAR_CANCEL" → parseCancelRequest() → find matching events
  ↓
"📅 Cancellation reason batao: 1️⃣ Client unavailable 2️⃣ Holiday..."
  ↓ saves wpSessions[phone] = {type:"calendar_cancel_reason", eventsToCancel:[...]}
  ↓
User: "1" → early-return → handleCalendarIntent()
  ↓
gcal.updateEvent() (adds [CANCELLED] note) → gcal.deleteEvent()
  ↓ logs to calendar_logs table
  ↓ sendCancellationNotifications()
  ↓
"✅ 1 meeting(s) cancelled! Reason: Client unavailable"
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Cancel Parser (AI) | server.js | 1595-1635 | `parseCancelRequest()` — extracts what to cancel |
| Reason Detection | server.js | 1213-1244 | Regex maps "1"→Client, "2"→Holiday, etc. |
| Cancel + Log | server.js | 1229-1244 | updateEvent → insert calendar_logs → deleteEvent |
| Notifications | helpers/notifications.js | — | sendCancellationNotifications() |

**Access:** Web + WhatsApp

---

### 7. 🎤 VOICE/AUDIO SUPPORT

**Kya karta hai:** WhatsApp voice message → download → Whisper transcribe → process as text

**Flow:**
```
WhatsApp Audio Message arrives (body._isAudio = true)
  ↓
body.mediaPath → fetch from app.mis.work S3
  ↓
Download audio file to /tmp/
  ↓
OpenAI Whisper API → transcription text
  ↓
Process transcribed text through normal flow (data query / calendar / etc)
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Audio Detection | server.js | 1661-1709 | Checks `body._isAudio`, downloads from S3 path |
| Whisper Transcription | server.js | ~1680 | OpenAI audio.transcriptions.create() |
| Normal Processing | server.js | 1802+ | Transcribed text → executePlan() → same flow |

**Access:** WhatsApp only (audio messages)

---

### 8. 🔐 ACCESS CONTROL (3 Modes)

**Kya karta hai:** Controls who can use the bot

**Modes:**
- **ALL** — sabko access (default)
- **LIST** — only allowed_numbers list can use
- **LIMITED** — user can only see their own data (filters by phone number)

**Flow:**
```
Message arrives → checkAccess(phone) [server.js:68]
  ↓
Reads access.json → checks mode
  ↓
ALL → allowed
LIST → phone in allowed_numbers? 
LIMITED → allowed, but appends "[SYSTEM: filter by phone]" to AI message
  ↓
Blocked? → "⛔ Aapko is bot ka access nahi hai"
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Load Config | server.js | 64-66 | `loadAccessControl()` — reads access.json |
| Check Access | server.js | 68-76 | `checkAccess(phone)` — returns {allowed, mode} |
| LIMITED filter | server.js | 1813-1816 | Appends WHERE clause instruction to AI message |
| API: View | server.js | 2169 | `GET /access` → returns config |
| API: Update | server.js | 2170-2178 | `POST /access` → writes access.json |
| Config File | access.json | — | `{mode, allowed_numbers, users}` |

**Access:** `GET/POST /access` API + WhatsApp enforcement

---

### 9. ⚡ RATE LIMITING

**Kya karta hai:** Spam protection — blocks excessive requests

**Logic:**
```
rateLimit(key, maxRequests, windowSec) [server.js:45]
  ↓
Map stores: {phone/IP → [{timestamp}, ...]}
  ↓
Filters timestamps within window → count > max? → BLOCKED
  ↓
Web: 30 req/min per IP → HTTP 429
WhatsApp: 20 req/min per phone → silent ignore
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Rate Limit Function | server.js | 45-60 | Sliding window counter per key |
| Web enforcement | server.js | 1078-1081 | `rateLimit("web:"+ip, 30, 60)` |
| WA enforcement | server.js | 1655-1659 | `rateLimit("wa:"+phone, 20, 60)` |

---

### 10. 🔄 AUTO-SYNC (Google Sheets → Supabase)

**Kya karta hai:** Har 15 min Google Sheets se data fetch → Supabase mein replace

**Flow:**
```
setInterval(syncAllSheets, 15 * 60 * 1000) — every 15 min
  ↓
helpers/sync.js → fetchSheetCSV(gid) for each:
  - Products (GID: xxx) → 2606 rows
  - Delegation Tasks (GID: xxx) → 64 rows
  - Checklist Tasks (GID: xxx) → 593 rows
  - Scores (GID: xxx) → 311 rows
  ↓
Parse CSV → upsert to Supabase tables (full replace pattern)
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Sync Module | helpers/sync.js | all | fetchSheetCSV(), parseCSV(), upsert to Supabase |
| Auto-trigger | server.js | startup | `setInterval(syncAllSheets, 900000)` |
| Manual trigger | server.js | 2183 | `POST /sync` → immediate sync |
| Status check | server.js | 2188 | `GET /sync/status` → last sync time & counts |

**Access:** Auto (every 15 min) + Manual (`POST /sync`)

---

### 11. 💾 SESSION MANAGEMENT

**Kya karta hai:** Multi-turn conversations persist across messages + server restarts

**Logic:**
```
wpSessions = {} (in-memory Map)
  ↓ loaded from Supabase wp_sessions table on startup
  ↓
Types: "ledger_select", "image_confirm", "image_sending",
       "calendar_booking_confirm", "calendar_cancel_reason", "calendar_conflict"
  ↓
saveSession(phone) → upserts to Supabase
loadSessionsFromDB() → loads all on startup
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Load from DB | server.js | 82-87 | `loadSessionsFromDB()` — SELECT * from wp_sessions |
| Save to DB | server.js | 89-93 | `saveSession(phone)` — upsert/delete |
| Session States | server.js | 106-112 | Comment documenting all session types |

---

### 12. 🏢 MULTI-TENANT SaaS

**Kya karta hai:** Koi bhi user apna Google Sheet connect kare → WhatsApp pe apne data se baat kare

**Flow:**
```
ONBOARDING:
User visits /onboard.html → paste Sheet URL → POST /api/tenant/detect-schema
  ↓ helpers/sheets.js → fetch sheet → detect columns & types
  ↓
User fills business description + phone → POST /api/tenant/register
  ↓ Creates tenant in Supabase tenants table
  ↓ helpers/prompt.js → generates custom AI prompt from schema
  ↓
QUERYING:
WhatsApp message from tenant phone → handleTenantQuery() [helpers/tenant-router.js]
  ↓ Looks up tenant by phone → loads their schema + prompt
  ↓ OpenAI answers from THEIR data (stored in tenant_data JSONB)
  ↓ Tracks usage (50 free queries/month)
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Schema Detector | helpers/sheets.js | all | Fetch public sheet → CSV → detect types |
| Prompt Generator | helpers/prompt.js | all | Schema + business desc → AI system prompt |
| Tenant Router | helpers/tenant-router.js | all | Phone lookup → load config → query OpenAI |
| Register API | server.js | 2299-2337 | Creates tenant, sanitizes XSS, generates prompt |
| Update API | server.js | 2339-2367 | Updates tenant config |
| Schema API | server.js | 2286-2297 | Calls detectSheetSchema() |
| WA Integration | server.js | 1721-1731 | handleTenantQuery() before main chatbot flow |
| Onboarding UI | public/onboard.html | all | 3-step dark UI form |
| Main UI Tab | public/index.html | "Connect Sheet" tab | Integrated in web chatbot |

**Access:** Web (onboard.html) + WhatsApp (auto-routed by phone)

---

### 13. 📄 PDF GENERATION & SEND

**Kya karta hai:** Data → PDF → WhatsApp pe bhejta hai

**Types:**
1. **Ledger PDF** — transaction history with Dr/Cr columns
2. **Data PDF** — query results in table format

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Ledger PDF | server.js | 697-817 | `generateLedgerPDF()` — PDFKit, A4 landscape |
| Data PDF | server.js | 408-509 | `generateDataPDF()` — query results as table |
| CSV Generation | server.js | 397-406 | `generateCSV()` — for web downloads |
| Send Media | helpers/whatsapp.js | — | `sendWhatsAppMedia(to, filePath, caption, type)` |

---

### 14. 🖼️ PRODUCT IMAGE SENDING

**Kya karta hai:** Product search → images bhejta hai WhatsApp pe

**Flow:**
```
User: "Samsung ka photo bhejo"
  ↓
SQL finds products with image_link → asks "Kitni images bheju?"
  ↓ wpSessions[phone] = {type:"image_confirm", products:[...]}
  ↓
User: "3" or "all"
  ↓
sendProductImages(phone, products, count) [server.js:2133]
  ↓ Loop: download each image → sendWhatsAppMedia() as "image"
  ↓ "STOP" command halts sending midway
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Image Confirm State | server.js | 1745-1768 | Number/all → triggers sending |
| Image Sender | server.js | 2133-2165 | `sendProductImages()` — loop + stop check |
| Stop Command | server.js | 1733-1743 | `/^stop$/i` → sets stopFlag |

**Access:** WhatsApp only

---

### 15. 🔔 NOTIFICATIONS (Email + WhatsApp)

**Kya karta hai:** Booking/cancel alerts + daily schedule + meeting reminders

**Components:**
| Notification | Trigger | Channel |
|-------------|---------|---------|
| Booking confirmation | After event created | WhatsApp + Email |
| Cancellation alert | After event cancelled | WhatsApp + Email |
| Meeting reminder | 15 min before meeting | WhatsApp |
| Daily schedule | 8 AM IST daily | WhatsApp + Email |

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Booking Notif | helpers/notifications.js | — | `sendBookingNotifications()` |
| Cancel Notif | helpers/notifications.js | — | `sendCancellationNotifications()` |
| Email (nodemailer) | helpers/notifications.js | — | Gmail OAuth2 transport |
| Reminder Timer | server.js | startup | `setInterval` every 60s checks upcoming |
| Daily Schedule | server.js | startup | `setInterval` triggers at 8 AM IST |

**Access:** Automatic (background timers)

---

### 16. 🧠 INTENT DETECTION & ROUTING

**Kya karta hai:** AI decides: yeh data query hai, calendar hai, ya ignore hai

**Intents:**
- `DATA_QUERY` → SQL generation path
- `CALENDAR_BOOKING` → handleCalendarIntent (book)
- `CALENDAR_RETRIEVE` → handleCalendarIntent (fetch)
- `CALENDAR_CANCEL` → handleCalendarIntent (cancel)
- `IGNORE` → silent or "Main MIS assistant hoon" response

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| System Prompt | server.js | 375-394 | Intent list + examples in prompt |
| processQuery() | server.js | 511-530 | OpenAI call → parses JSON response |
| executePlan() | server.js | 533-576 | Routes by intent, handles follow-ups |
| Calendar Override | server.js | 567-571 | Any CALENDAR* intent → force query_type:"calendar" |

---

### 17. 📝 MESSAGE LOGGING

**Kya karta hai:** Har incoming/outgoing message Supabase mein log hota hai

**Logic:**
```
logMessage(platform, direction, message, metadata) [server.js:97]
  ↓
Inserts into chat_history table: {session_id, role, content, created_at}
  ↓
Used for: AI context (last 20 messages), history API, debugging
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Log Function | server.js | 97-99 | `logMessage()` — inserts to chat_history |
| History API | server.js | 1063-1071 | `GET /history/:sid` — returns chat history |
| AI Context | server.js | 1101-1106 | Last 20 messages loaded for OpenAI context |

---

### 18. 💨 QUERY CACHING (5 min TTL)

**Kya karta hai:** Same question within 5 min → cached response (no OpenAI call)

**Logic:**
```
queryCache = new Map()
  ↓
Before AI call: getCached("web:" + key) → if exists & fresh → return cached
  ↓
After AI response: setCache(key, result) → stores with timestamp
  ↓
Max 200 entries (evicts oldest when full)
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Cache Get | server.js | 104 | `getCached(key)` — checks TTL (5 min) |
| Cache Set | server.js | 105 | `setCache(key, val)` — stores + cap at 200 |
| Web check | server.js | 1091-1092 | Before executePlan |
| WA check | server.js | 1803-1807 | Before executePlan |

---

### 19. 📄 DOCUMENT INTELLIGENCE

**Kya karta hai:** Upload document/image → AI analyzes → answers questions about it

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Doc Analysis | server.js | 2216-2252 | `POST /doc-intelligence` — OpenAI vision/text |
| Doc History | server.js | 2254-2259 | `GET /doc-intelligence/history` |
| Image Analysis | server.js | 2261-2281 | `POST /analyze-image` — OpenAI vision API |

**Access:** Web UI (Documents tab)

---

### 20. 🏥 HEALTH CHECK

**Kya karta hai:** Server alive check for monitoring

```
GET /health → {"status":"ok","uptime":12345}
```

**Key Files & Lines:**
| Component | File | Line | Logic |
|-----------|------|------|-------|
| Health route | server.js | 2283 | `app.get('/health', ...)` — returns uptime |

---

## 🗄️ DATABASE TABLES (Supabase PostgreSQL)

| Table | Purpose | Synced From |
|-------|---------|-------------|
| `products` | 2606 product items | Google Sheet (auto-sync) |
| `delegation_tasks` | 64 delegation tasks | Google Sheet (auto-sync) |
| `checklist_tasks` | 593 checklist items | Google Sheet (auto-sync) |
| `scores` | 311 score records | Google Sheet (auto-sync) |
| `expenses` | Expense records | Manual load |
| `sales` | Sales records | Manual load |
| `ledger` | Ledger (party-wise) | Manual load |
| `pending` | Pending amounts | Manual load |
| `chat_history` | All messages (in/out) | Auto-logged |
| `wp_sessions` | Multi-turn session state | Auto-saved |
| `calendar_logs` | Booking/cancel actions | Auto-logged |
| `tenants` | SaaS tenant config | API registration |
| `tenant_data` | SaaS user's sheet data | On registration |
| `tenant_phones` | Phone → tenant mapping | On registration |
| `tenant_query_logs` | SaaS usage tracking | Auto-logged |

---

## 🔑 ENVIRONMENT VARIABLES (.env)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Database connection |
| `SUPABASE_ANON_KEY` | Public API key |
| `SUPABASE_SERVICE_KEY` | Admin API key (for RPC) |
| `OPENAI_API_KEY` | GPT-4o-mini + Whisper |
| `WA_API_KEY` | app.mis.work WhatsApp API |
| `PORT` | Server port (3000) |

---

## 🔄 BACKGROUND PROCESSES (Always Running)

| Process | Interval | Logic |
|---------|----------|-------|
| Auto-sync sheets | Every 15 min | Fetches 4 Google Sheets → upserts to Supabase |
| Meeting reminder | Every 60 sec | Checks upcoming meetings → sends WA 15 min before |
| Daily schedule | Every 60 sec | At 8 AM IST → sends today's meetings list |
| Cache cleanup | On access | Expired entries (>5 min) removed on read |

---

*Generated: 2026-05-21*
