# 🤖 MIS Chatbot — AI-Powered Business Intelligence Platform

A full-stack **multi-tenant AI chatbot** that connects to Tally ERP data via Google Sheets, provides real-time business dashboards, WhatsApp integration, and natural language querying — all built as a single Node.js application.

> **Live Demo:** [mis-chatbot.vercel.app](https://mis-chatbot.vercel.app)

---

## ✨ Key Features

### 🧠 AI-Powered Query Engine
- Natural language → SQL translation using GPT-4o-mini
- Multi-turn conversations with context awareness
- Self-healing SQL (auto-retries on errors with AI correction)
- Intent classification: queries, bookings, reminders, reports

### 📊 Real-Time Dashboard
- Apple-grade KPI cards with sparklines and anomaly detection (z-score)
- 4 drill-down pages: Sales, Outstanding, Stock, Ledger
- AI-generated daily briefing (cached, typewriter effect)
- Server-side spotlight search (pg_trgm fuzzy matching)
- Skeleton loading states, count-up animations, 3D hero headers

### 💬 WhatsApp Business API Integration
- Full two-way messaging (text + voice)
- Voice transcription via OpenAI Whisper
- Calendar booking via natural language ("book meeting coming wednesday")
- PDF/Excel report delivery via WhatsApp
- Product image sending with captions

### 📅 Google Calendar Integration
- OAuth2 flow for per-tenant calendar connection
- Conflict detection, reschedule, cancel
- Multi-turn booking ("buk meeing" → asks for details → confirms)

### 🏢 Multi-Tenant Architecture
- Phone-based tenant isolation
- Per-tenant Google Sheets sync (Tally → PostgreSQL)
- Dynamic table classification (sales, purchases, stock, ledger, expenses)
- Schema drift detection and auto-migration
- Role-based access control

### 🔒 Security
- HMAC-SHA256 webhook verification
- Phone-token auth gate (24-hr TTL, signed tokens)
- Rate limiting with `Retry-After` headers
- CORS env-based configuration
- SQL safety validator (blocks DROP, DELETE, ALTER, etc.)

### 📈 Reports & Exports
- Dynamic report catalogue (adapts to tenant's data)
- Multi-sheet Excel exports (SheetJS)
- PDF generation (PDFKit)
- Aging bucket analysis, top defaulters, trend charts

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Database | PostgreSQL (Supabase) |
| AI | OpenAI GPT-4o-mini + Whisper |
| Frontend | Vanilla HTML/CSS/JS + Chart.js |
| WhatsApp | Meta Cloud API |
| Sheets Sync | Google Sheets API v4 |
| Calendar | Google Calendar API |
| PDF | PDFKit |
| Excel | SheetJS |
| Charts | QuickChart.io |
| Email | Nodemailer + Gmail SMTP |
| Hosting | Vercel (frontend) + PM2 (backend) |

---

## 📁 Project Structure

```
├── server.js              # Main Express app (8500+ lines, 30+ endpoints)
├── helpers/
│   ├── dashboard-engine.js   # Widget catalogue + SQL builder
│   ├── page-engine.js        # Drill-down page builders
│   ├── tenant-router.js      # AI intent → SQL → exec → format
│   ├── smart-format.js       # Tally-style result formatting
│   ├── self-heal.js          # AI SQL retry on errors
│   ├── chart-builder.js      # QuickChart integration
│   ├── whatsapp.js           # WA Business API client
│   ├── sync.js               # Google Sheets → DB sync
│   ├── anomaly.js            # Z-score outlier detection
│   └── ...                   # 26 helper modules total
├── public/
│   ├── dashboard.html        # Main dashboard with KPIs + briefing
│   ├── chat.html             # AI chat interface
│   ├── sales.html            # Sales drill-down
│   ├── outstanding.html      # Outstanding/aging analysis
│   ├── stock.html            # Inventory management
│   ├── ledger.html           # Party-wise ledger
│   ├── calendar.html         # Google Calendar UI
│   ├── settings.html         # Tenant settings
│   ├── reports.html          # Dynamic reports
│   └── assets/               # CSS + JS
├── migrations/               # 8 SQL migrations
├── tests/                    # Unit + integration tests
└── scripts/                  # Admin/maintenance scripts
```

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/saranshrajput01/mis-chatbot.git
cd mis-chatbot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Fill in: SUPABASE_URL, OPENAI_API_KEY, WA_ACCESS_TOKEN, etc.

# Run
node server.js
# or with PM2:
pm2 start server.js --name mis-chatbot
```

---

## 🧪 Testing

```bash
# Unit tests (133 passing)
npm run test:unit

# Integration tests (requires running server)
RUN_INTEGRATION=1 npm run test:integration
```

---

## 📊 Scale & Performance

- **8 tenants** actively using the platform
- **1000+ invoices** processed per tenant
- **Sub-500ms** search latency (pg_trgm + parallel queries)
- **60-second** sync intervals for real-time data
- **1-hour** AI briefing cache for cost optimization

---

## 🎨 UI Highlights

- Dark/light theme with system preference detection
- Mobile responsive (3 breakpoints: 900px, 760px, 380px)
- Futuristic glass-morphism hero headers with 3D mouse-tilt
- Animated gradient titles, aurora backgrounds
- Skeleton loading → real data (no layout shift)
- Drill-down modals with neon line charts

---

## 👤 Author

**Saransh Singh Rajput**
- GitHub: [@saranshrajput01](https://github.com/saranshrajput01)
- Email: saranshrajputt1301@gmail.com

---

## 📄 License

This project is proprietary. All rights reserved.
