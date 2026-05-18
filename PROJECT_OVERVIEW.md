# 📘 MIS Chatbot - Complete Project Overview

**Last Updated:** 2026-05-18  
**Version:** 1.0  
**Status:** Testing Phase (Local ✅ | Production ⏸️ Railway Outage)

---

## 🎯 What is this?

**MIS Chatbot** is an AI-powered business intelligence assistant that answers questions about your business data through:
- 💬 **WhatsApp** (primary interface)
- 🌐 **Web Chat** (browser interface)
- 📊 **Natural Language Queries** → SQL → Results

**Example Queries:**
- "April 2026 ki sales kitni thi?"
- "Top 5 salary wale employees kaun hain?"
- "Shammi ji ki pending payments"
- "ABC product ki image bhejo"

---

## 🛠️ Tech Stack

### Backend
- **Node.js** + Express.js (server)
- **OpenAI GPT-4o** (natural language → SQL conversion)
- **Supabase** (PostgreSQL database + RPC)
- **PDFKit** (PDF generation for reports)

### Frontend
- **Static HTML/CSS/JS** (in `/public` folder)
- **Vanilla JavaScript** (no framework)

### Integrations
- **WhatsApp API** (app.mis.work) - for messaging
- **Google Sheets** (via CSV export) - data source sync

### Deployment
- **Railway** (production hosting)
- **Environment:** Node.js v22.14.0

---

## 🏗️ Architecture Flow

```
User (WhatsApp/Web)
    ↓
Express Server (server.js)
    ↓
OpenAI GPT-4o (natural language → JSON plan)
    ↓
SQL Execution (Supabase RPC)
    ↓
Response Formatting (text/PDF/chart)
    ↓
User receives answer
```

### Auto-Sync Process (Every 15 minutes)
```
Google Sheets (CSV export)
    ↓
fetchSheetCSV() → parseCSV()
    ↓
Upsert to Supabase tables
    ↓
liveSchema updated
```

---

## ✨ Features

### 1. Natural Language Queries
- User asks in Hinglish/English
- AI converts to SQL
- Executes safely (only SELECT allowed)
- Returns formatted results

### 2. WhatsApp Integration
- Receives messages via webhook (`POST /whatsapp`)
- Sends replies via app.mis.work API
- Supports:
  - Text responses
  - PDF reports (20+ records)
  - Product images
  - Ledger selection (numbered options)
  - Image confirmation flow

### 3. Data Sync
- Auto-syncs 4 Google Sheets every 15 minutes:
  - Products (2606 items)
  - Delegation Tasks (64 items)
  - Checklist Tasks (593 items)
  - Scores (311 items)
- Uses **upsert pattern** (transaction-safe)

### 4. PDF Generation
- Ledger reports (party-wise transactions)
- Data tables (expenses, sales, etc.)
- Max 8 columns per page (landscape A4)

### 5. Chart Generation
- Bar, Line, Pie, Doughnut charts
- Rendered via Chart.js (web interface)

### 6. Multi-Interface
- WhatsApp (primary)
- Web chat (`/public/index.html`)
- REST API (`POST /query`)

---

## 📁 File Structure

```
mis-chatbot/
├── server.js              # Main server (1400+ lines)
├── config.js              # Configuration values (NEW)
├── import_data.py         # Python script for manual data import
├── package.json           # Node dependencies
├── .env                   # Environment variables (NOT in git)
├── .gitignore             # Git ignore rules
├── PROJECT_OVERVIEW.md    # This file
├── PROJECT_ROADMAP.md     # Task tracking & roadmap
├── SARANSH.xlsx           # Sample data file
└── public/                # Frontend files
    ├── index.html         # Web chat interface
    ├── styles.css         # Styling
    └── script.js          # Frontend logic
```

---

## 🗄️ Database Schema (Supabase)

### Tables

**1. products**
- `id` (primary key)
- `item_name` (unique) - Product name
- `image_link` - URL to product image
- `description` - Product description
- **Synced from:** Google Sheet GID 1581260341

**2. delegation_tasks**
- `id` (primary key)
- `del_task_id` (unique) - Task identifier
- `task_name` - Task description
- `delegated_to` - Assignee name
- `delegate_from` - Delegator name
- `plan_date`, `final_date` - Dates
- `priority`, `del_remarks`, `project_name`, `department_id`, `del_url`
- **Synced from:** Google Sheet GID 1671023111

**3. checklist_tasks**
- `id` (primary key)
- `task_name` - Task description
- `assigned_to` - Assignee name
- `status` - Task status
- `priority`, `remarks`, `department`
- **Synced from:** Google Sheet GID 426961603

**4. scores**
- `id` (primary key)
- `employee_name` - Employee name
- `score_value` - Score/rating
- `category` - Score category
- `period` - Time period
- `remarks` - Additional notes
- **Synced from:** Google Sheet GID 1226212674

**5. ledger** (NOT synced, static data)
- Party-wise transaction records
- Columns: `party_name`, `date`, `amount`, `type`, etc.

**6. sales** (NOT synced, static data)
- Sales records
- Columns: `party_name`, `sales_person`, `amount`, `date`, etc.

**7. expenses** (NOT synced, static data)
- Expense records
- Columns: `sub_group`, `design_number`, `amount`, `date`, etc.

**8. pending** (NOT synced, static data)
- Pending payment records
- Columns: `party_name`, `pending_amount`, `overdue_days`, `sales_person`, etc.

**9. sync_log**
- Tracks sync operations
- Columns: `sheet_name`, `rows_synced`, `status`, `created_at`

### RPC Functions
- `execute_sql(query TEXT)` - Executes dynamic SQL (SELECT only)

---

## 🔐 Environment Variables (.env)

```bash
# Supabase
SUPABASE_URL=https://bjrrlikjinhcbkyherim.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...  # Public anon key
SUPABASE_SERVICE_KEY=eyJhbGci...  # Service role key (admin access)

# OpenAI
OPENAI_API_KEY=sk-proj-...  # GPT-4o API key

# WhatsApp
WA_API_KEY=34558426bf699d0c32a41b5593b41453657fb26f1367bfdc6b  # app.mis.work API key

# Server
PORT=3000
```

**Security Notes:**
- Never commit `.env` to git
- Rotate keys periodically
- Use different keys for dev/prod

---

## 🌐 API Endpoints

### Public Endpoints

**POST /whatsapp**
- Receives WhatsApp webhook messages
- Body: `{ message: "query", senderNumber: "91..." }`
- Returns: `{ success: true }`

**POST /query**
- Web/API query endpoint
- Body: `{ message: "query", chatHistory: [...] }`
- Returns: `{ reply: "...", plan: {...}, rows: [...] }`

**POST /chat**
- Alternative chat endpoint
- Same as `/query`

**GET /**
- Serves web chat interface (`/public/index.html`)

### Internal Functions (not exposed)
- `POST /sync` - Manual sync trigger (if implemented)

---

## 🔑 Key Functions (server.js)

### Core AI Functions

**`openai(systemPrompt, messages, maxTokens)`**
- Calls OpenAI GPT-4o API
- Returns AI response text
- Config: `config.OPENAI_MAX_TOKENS`, `config.OPENAI_TEMPERATURE`

**`buildSystemPrompt(isWhatsApp)`**
- Builds system prompt with:
  - Database schema
  - Query rules (Hinglish mapping, SQL patterns)
  - Response format (JSON)
- Returns: String prompt

**`processQuery(userMessage, chatHistory, isWhatsApp)`**
- Main query processing function
- Steps:
  1. Load live schema
  2. Call OpenAI with system prompt + user message
  3. Parse JSON response
  4. Return plan object
- Returns: `{ query_type, sql, ledger_search, chart_config, clarify_message }`

### Database Functions

**`fetchLiveSchema()`**
- Fetches all table schemas from Supabase
- Caches in `liveSchema` global variable
- Called on server start + before each query

**`runSQL(sql)`**
- Executes SQL via Supabase RPC
- **Safety:** Only SELECT allowed, blocks DROP/DELETE/UPDATE/INSERT
- Returns: Array of rows

### WhatsApp Functions

**`sendWhatsAppReply(to, message)`**
- Sends text message via app.mis.work API
- Uses `WA_API_KEY` from env

**`sendWhatsAppMedia(to, filePath, caption, mediaType)`**
- Sends PDF/image via app.mis.work API
- Uploads file as base64

**`sendProductImages(phone, products, total)`**
- Sends product images one by one
- Supports "stop" command to halt sending

### PDF Functions

**`generateLedgerPDF(info, txns)`**
- Creates party-wise ledger report
- Returns: Temp file path

**`generateDataPDF(rows, cols, title)`**
- Creates data table PDF (max 8 columns)
- Returns: Temp file path

### Sync Functions

**`syncProducts()`**
- Syncs products from Google Sheet
- Uses upsert (conflict on `item_name`)

**`syncDelegationTasks()`**
- Syncs delegation tasks
- Uses upsert (conflict on `del_task_id`)

**`syncChecklistTasks()`**
- Syncs checklist tasks
- Uses upsert (conflict on `id`)

**`syncScores()`**
- Syncs employee scores
- Uses upsert (conflict on `id`)

**`syncAllSheets()`**
- Calls all 4 sync functions
- Runs on server start + every 15 minutes

**`fetchSheetCSV(gid)`**
- Fetches CSV from Google Sheets
- URL: `https://docs.google.com/spreadsheets/d/1Hn.../export?format=csv&gid={gid}`

**`parseCSV(csvText)`**
- Parses CSV to array of objects
- Returns: `[{ col1: val1, col2: val2 }, ...]`

---

## 📱 WhatsApp Integration Details

### Webhook Flow
1. User sends message to bot number (918750285420)
2. app.mis.work sends webhook to `POST /whatsapp`
3. Server extracts:
   - `senderNumber` (from multiple possible fields)
   - `message` (query text)
4. Server processes query
5. Server sends reply via app.mis.work API

### Session Management (In-Memory)
- `wpSessions = {}` - Stores temporary user states
- **Types:**
  - `ledger_select` - User selecting from numbered ledger options
  - `image_confirm` - User confirming image count
  - `image_sending` - Images being sent (can be stopped)
- **TTL:** 10 minutes (config: `WP_SESSION_TTL_MINUTES`)

### Special Commands
- **"stop"** - Halts image sending
- **Number (1-9)** - Selects ledger option
- **Number (1-100)** - Confirms image count

### Response Types
1. **Text** - Simple answer
2. **PDF** - 20+ records → generates PDF report
3. **Images** - Product queries → sends product images
4. **Clarification** - Ambiguous query → asks for clarification

---

## 🔄 Sync Process Details

### Google Sheets Setup
- **Main Sheet ID:** `1Hn...` (in `fetchSheetCSV` function)
- **GIDs:**
  - Products: 1581260341
  - Delegation Tasks: 1671023111
  - Checklist Tasks: 426961603
  - Scores: 1226212674

### Sync Frequency
- **Auto:** Every 15 minutes (`config.SYNC_INTERVAL_MS`)
- **Manual:** Server restart triggers immediate sync

### Upsert Logic
- **Products:** Conflict on `item_name` → update existing
- **Delegation Tasks:** Conflict on `del_task_id` → update existing
- **Checklist/Scores:** Conflict on `id` → update existing
- **Benefit:** No data loss if sync fails mid-way

### Error Handling
- Errors logged to `sync_log` table
- Console logs: `[SYNC ERROR] {table}: {error}`
- Sync continues for other tables even if one fails

---

## 🚀 Deployment (Railway)

### Current Setup
- **Platform:** Railway
- **Region:** Auto (likely US)
- **Plan:** Free tier ($5 credits)
- **Domain:** Auto-generated `.railway.app` URL

### Environment Variables (Railway)
Same as `.env` file:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `OPENAI_API_KEY`
- `WA_API_KEY` ⏸️ (pending update due to outage)
- `PORT` (auto-set by Railway)

### Deployment Process
1. Push code to GitHub
2. Railway auto-deploys on push (if connected)
3. Or manual deploy via Railway dashboard

### Health Check
- Server logs: `MIS Chatbot running at http://localhost:3000`
- Sync logs: `[SYNC] Done: { products: 2606, ... }`

---

## 🔧 Configuration (config.js)

```javascript
module.exports = {
  SYNC_INTERVAL_MS: 15 * 60 * 1000,      // 15 minutes
  PDF_MAX_COLUMNS: 8,                     // Max columns in PDF
  WP_DISPLAY_LIMIT: 20,                   // Max rows in WhatsApp text
  WP_IMAGE_CONFIRM_THRESHOLD: 10,         // Ask confirmation if >10 images
  WP_SESSION_TTL_MINUTES: 10,             // Session expiry
  LEDGER_FETCH_LIMIT: 2000,               // Max ledger records
  PRODUCTS_FETCH_LIMIT: 200,              // Max products
  QUERY_CACHE_TTL_MS: 5 * 60 * 1000,     // Cache expiry (not implemented yet)
  QUERY_CACHE_MAX_SIZE: 500,              // Max cache entries (not implemented yet)
  OPENAI_MAX_TOKENS: 3000,                // Default max tokens
  OPENAI_TEMPERATURE: 0.1                 // Low temperature for consistency
};
```

---

## 🛡️ Security Features

### Implemented ✅
1. **SQL Injection Protection**
   - Only SELECT queries allowed
   - Blocks: DROP, DELETE, UPDATE, INSERT, TRUNCATE, ALTER, CREATE, GRANT, REVOKE
   - Code-side validation in `runSQL()`

2. **Environment Variables**
   - All secrets in `.env` (not in code)
   - Keys: Supabase, OpenAI, WhatsApp API

3. **Phone Validation**
   - Invalid/missing phone numbers → request ignored
   - No hardcoded fallback numbers

### Pending ⏸️
1. **Webhook Authentication** (Bug #4)
   - Verify incoming webhooks are from app.mis.work
   - Prevent fake webhook attacks

2. **Endpoint Authentication** (Issue #6)
   - Protect `/query`, `/chat` endpoints
   - API key or JWT-based auth

3. **Database Read-Only Role** (Issue #7 Layer 2)
   - Supabase RPC with read-only Postgres role
   - Database-level protection

---

## 🐛 Known Limitations

1. **Session Persistence**
   - WhatsApp sessions in-memory (lost on restart)
   - Fix: Issue #11 (move to Supabase table)

2. **No Query Caching**
   - Every query hits OpenAI (slow + costly)
   - Fix: Issue #10 (smart caching)

3. **Stale Data in Sync**
   - If item deleted from sheet, stays in DB
   - Current: Upsert only adds/updates
   - Fix: Full sync with delete detection (if needed)

4. **No Rate Limiting**
   - Unlimited queries per user
   - Fix: Add rate limiting before public launch

5. **Single Server Instance**
   - No load balancing
   - Railway free tier = 1 instance

---

## 📊 Performance Metrics

### Current Stats (Local Testing)
- **Server Start Time:** ~2 seconds
- **Schema Load:** ~500ms
- **Sync Time:** ~5-10 seconds (all 4 sheets)
- **Query Response Time:**
  - Simple query: 2-4 seconds (OpenAI + SQL)
  - Complex query: 4-8 seconds
  - PDF generation: +2-3 seconds
- **Memory Usage:** ~150-200 MB

### OpenAI Usage
- **Model:** GPT-4o
- **Avg Tokens per Query:** 1500-2000
- **Cost:** ~$0.01-0.02 per query
- **Monthly Estimate:** $10-50 (depending on usage)

---

## 🧪 Testing Checklist

### Local Testing ✅
- [x] Server starts without errors
- [x] Schema loads successfully
- [x] Sync completes (2606 products, 64 delegation tasks, etc.)
- [x] WhatsApp queries work
- [x] PDF generation works
- [x] Product images work
- [x] SQL safety blocks dangerous queries

### Production Testing ⏸️
- [ ] Railway deployment successful
- [ ] Environment variables set correctly
- [ ] WhatsApp webhook receives messages
- [ ] WhatsApp replies sent successfully
- [ ] Auto-sync runs every 15 minutes
- [ ] PDF delivery via WhatsApp
- [ ] Image delivery via WhatsApp

---

## 🔮 Future Enhancements (Roadmap)

See `PROJECT_ROADMAP.md` for detailed task list.

**Priority:**
1. **Phase 3:** Caching + Sessions to DB (performance)
2. **Phase 4:** Webhook + Endpoint auth (security)
3. **Optional:** Code split, modularization (maintainability)

---

## 📞 Support & Maintenance

### Common Issues

**Issue:** Server won't start
- **Check:** `.env` file exists with all variables
- **Check:** Node version (v22.14.0)
- **Check:** `npm install` completed

**Issue:** Sync fails
- **Check:** Google Sheets URL accessible
- **Check:** Supabase connection working
- **Check:** `sync_log` table for error messages

**Issue:** WhatsApp not responding
- **Check:** `WA_API_KEY` is correct
- **Check:** Webhook URL configured in app.mis.work
- **Check:** Server logs for incoming webhooks

**Issue:** SQL errors
- **Check:** Table schemas match expected structure
- **Check:** `execute_sql` RPC function exists in Supabase

### Logs to Monitor
- `[SCHEMA] Live schema loaded: ...` - Schema loaded successfully
- `[SYNC] Done: { products: 2606, ... }` - Sync completed
- `[WP QUERY] ... | FROM: ...` - WhatsApp query received
- `[SQL] SELECT ...` - SQL query executed
- `[SYNC ERROR] ...` - Sync failed (check `sync_log` table)

---

## 📝 Development Notes

### Adding New Features
1. Read this file + `PROJECT_ROADMAP.md` for context
2. Test locally first (`node server.js`)
3. Update config.js if adding new magic numbers
4. Update this file if architecture changes
5. Deploy to Railway after testing

### Code Style
- **Language:** JavaScript (Node.js)
- **Async:** Use `async/await` (not callbacks)
- **Error Handling:** Try-catch blocks with logging
- **Naming:** camelCase for functions, UPPER_CASE for constants
- **Comments:** Minimal, code should be self-explanatory

### Git Workflow
- **Branch:** `main` (or `master`)
- **Commits:** Descriptive messages
- **Never commit:** `.env`, `node_modules/`, temp files

---

## 🎓 Learning Resources

### Technologies Used
- **Express.js:** https://expressjs.com/
- **Supabase:** https://supabase.com/docs
- **OpenAI API:** https://platform.openai.com/docs
- **PDFKit:** https://pdfkit.org/
- **Railway:** https://docs.railway.app/

### Related Concepts
- **Natural Language to SQL:** Prompt engineering for structured output
- **Webhook Integration:** Receiving real-time events
- **Upsert Pattern:** Idempotent database operations
- **Session Management:** Stateful conversations

---

**End of Overview**

For task tracking and roadmap, see: `PROJECT_ROADMAP.md`
