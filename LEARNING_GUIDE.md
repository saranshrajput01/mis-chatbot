# 📚 MIS Chatbot — Complete Learning Guide

**Purpose:** Har concept jo is project mein use hua hai — kahan, kyu, aur kaise — basic to advanced.

**Format:** Har concept ke saath:
- 🔹 **Kya hai** — simple explanation
- 🔹 **Kahan use hua** — exact file + line reference
- 🔹 **Kyu use kiya** — problem kya thi
- 🔹 **Kaise kaam karta hai** — code example from this project

---

## 🟢 LEVEL 1 — JAVASCRIPT BASICS

---

### 1.1 Variables (let, const, var)

**Kya hai:** Data store karne ke containers.
- `const` = value change nahi hogi (fixed)
- `let` = value change ho sakti hai
- `var` = purana tarika (avoid karo)

**Kahan:** `server.js` line 1-10, har file mein

**Kyu:** Har jagah data store karna padta hai — API keys, database connections, temporary values.

**Kaise:**
```javascript
// server.js mein:
const express = require("express");     // fixed — express library kabhi change nahi hogi
const supabase = createClient(url, key); // fixed — ek baar bana, baar baar use karo
let textMessage = "";                    // changeable — har message alag hoga
```

**Agar ye nahi hota:** Bina variables ke koi bhi data store nahi kar sakte — har baar recalculate karna padta.

---

### 1.2 Functions

**Kya hai:** Reusable code blocks. Ek kaam ek function mein likho, baar baar call karo.

**Kahan:** `server.js` — `buildSystemPrompt()`, `processQuery()`, `executePlan()`, `runSQL()`

**Kyu:** Same code 10 jagah likhne ki jagah ek function banao, 10 jagah call karo.

**Kaise:**
```javascript
// server.js mein:
function buildSystemPrompt(isWhatsApp = false) {
  return `You are an expert...`;  // AI ko instructions deta hai
}

// Isko 2 jagah call karte hain:
// 1. WhatsApp queries ke liye
// 2. Web chat queries ke liye
// Ek baar likha, dono jagah kaam karta hai
```

**Agar ye nahi hota:** 200 lines ka prompt 2 jagah copy-paste karna padta. Ek jagah fix karo, dusri jagah bug rehta.

---

### 1.3 Async/Await (Asynchronous Programming)

**Kya hai:** JavaScript mein kuch kaam time lete hain (database call, API call). `await` bolta hai "ruko, ye complete hone do, phir aage badho."

**Kahan:** Literally har function mein — `server.js`, `tenant-router.js`, `helpers/` sab mein

**Kyu:** Database se data laana 200ms leta hai. API call 3 seconds leti hai. Agar await nahi karo toh answer aane se pehle hi reply bhej doge (empty reply).

**Kaise:**
```javascript
// server.js mein:
async function processQuery(message, chatHistory) {
  const planText = await openai(prompt, messages);  // 3 sec wait — AI response
  const plan = JSON.parse(planText);                // instant — parse karo
  return plan;
}

// Bina await:
const planText = openai(prompt, messages);  // ❌ ye Promise return karega, actual text nahi
```

**Agar ye nahi hota:** Bot empty replies bhejta, database se data aane se pehle hi "no data found" bol deta.

---

### 1.4 Promises & .then()/.catch()

**Kya hai:** Async operations ka result — ya toh success (resolve) ya failure (reject). `.then()` = success pe kya karo. `.catch()` = error pe kya karo.

**Kahan:** `server.js` — Supabase calls, fire-and-forget operations

**Kyu:** Kuch operations mein hum result ka wait nahi karna chahte (logging, analytics) — bas fire karo aur bhool jao.

**Kaise:**
```javascript
// server.js mein — message log karna (wait nahi karte):
supabase.from("chat_history").insert({ session_id, role: "user", content: message }).then(() => {});

// Agar error aaye toh silently ignore:
supabase.from("tenants").update({ queries: count }).eq("id", id).then(() => {}, () => {});
```

**Agar ye nahi hota:** Har logging operation pe 200ms wait karna padta — user ko slow response milta.

---

### 1.5 Objects & JSON

**Kya hai:** Key-value pairs mein data store karna. JSON = JavaScript Object Notation (data exchange format).

**Kahan:** Har jagah — API responses, database rows, config, webhook payloads

**Kyu:** Structured data bhejne/receive karne ka standard format. WhatsApp webhook JSON bhejta hai, OpenAI JSON return karta hai, Supabase JSON mein data deta hai.

**Kaise:**
```javascript
// WhatsApp webhook se aata hai:
const body = {
  senderNumber: "918750285420",
  message: "total sales kitni hai",
  itemType: "text",
  boundType: "in"
};

// Access:
const phone = body.senderNumber;  // "918750285420"
const msg = body.message;         // "total sales kitni hai"
```

**Agar ye nahi hota:** Data ko strings mein parse karna padta (nightmare).

---

### 1.6 Arrays & Array Methods

**Kya hai:** Ordered list of items. Methods: `.map()`, `.filter()`, `.find()`, `.reduce()`, `.slice()`

**Kahan:** `server.js` — rows formatting, chat history, product lists

**Kyu:** Database se 100 rows aati hain — unhe format karna, filter karna, limit karna.

**Kaise:**
```javascript
// server.js mein — top 20 rows dikhana:
const displayRows = rows.slice(0, 20);  // first 20 le lo

// Har row ko formatted string mein convert:
const lines = displayRows.map((row, i) => `${i+1}. ${row.company_name} = ₹${row.total}`);

// Sirf wo rows jisme image hai:
const withImages = rows.filter(p => p.image_link && p.image_link.startsWith("http"));

// Grand total calculate:
const total = rows.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
```

**Agar ye nahi hota:** Har operation ke liye manual for-loop likhna padta — 3x zyada code.

---

### 1.7 Template Literals (Backticks)

**Kya hai:** String mein variables inject karna using `${variable}`. Multi-line strings bhi support karta hai.

**Kahan:** AI prompts, WhatsApp messages, SQL queries — har jagah

**Kyu:** Dynamic messages banana — user ka naam, amount, date sab inject karna padta hai.

**Kaise:**
```javascript
// WhatsApp reply:
const reply = `📊 *Total Sales:* ₹${total.toLocaleString("en-IN")}`;

// AI prompt (200+ lines):
const prompt = `You are an expert assistant.
Today: ${new Date().toISOString().split("T")[0]}
Tables: ${liveSchema}`;

// SQL:
const sql = `SELECT * FROM sales WHERE company_name ILIKE '%${name}%'`;
```

**Agar ye nahi hota:** String concatenation hell: `"Total: " + "₹" + total + " from " + table` — unreadable.

---

### 1.8 Destructuring

**Kya hai:** Object/Array se specific values nikalna ek line mein.

**Kahan:** `server.js` — Supabase responses, request body parsing

**Kyu:** Cleaner code — 3 lines ki jagah 1 line.

**Kaise:**
```javascript
// Supabase response se data nikalna:
const { data, error } = await supabase.from("sales").select("*");
// Instead of:
// const result = await supabase.from("sales").select("*");
// const data = result.data;
// const error = result.error;

// Request body se:
const { message, session_id } = req.body;
```

**Agar ye nahi hota:** Har value ke liye alag line — code 3x lamba.

---

### 1.9 Spread Operator (...)

**Kya hai:** Array/Object ko "spread" (phailana) karna — copy banana ya merge karna.

**Kahan:** `server.js` — chat history, unique values

**Kyu:** Arrays merge karna, objects copy karna without mutation.

**Kaise:**
```javascript
// Chat history mein naya message add:
const messages = [
  ...chatHistory.slice(-8).map(h => ({ role: h.role, content: h.content })),
  { role: "user", content: userMessage }
];

// Unique values nikalna:
const uniqueNames = [...new Set(data.map(r => r.name))];
```

**Agar ye nahi hota:** Manual loops se copy/merge — error-prone.

---

### 1.10 Ternary Operator & Short-circuit

**Kya hai:** One-line if-else. `condition ? yes : no`. Short-circuit: `value || default`.

**Kahan:** Har jagah — default values, conditional formatting

**Kyu:** Simple conditions ke liye full if-else block likhna overkill hai.

**Kaise:**
```javascript
// Default value:
const phone = body.senderNumber || body.from || "";  // pehla jo milega wo use karo

// Conditional formatting:
const balText = bal >= 0 ? "(Dr)" : "(Cr)";  // positive = Debit, negative = Credit

// Optional chaining:
const mediaId = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.audio?.id;
// Agar koi bhi level undefined hai → crash nahi karega, undefined return karega
```

**Agar ye nahi hota:** Har check ke liye 5-line if block — code unreadable.

---

### 1.11 Regular Expressions (Regex)

**Kya hai:** Text patterns match karna. `/pattern/flags` format.

**Kahan:** `server.js` — intent detection, message parsing, SQL validation, casual message filter

**Kyu:** "Kya user ne sync bola?", "Kya ye SELECT query hai?", "Kya ye casual message hai?" — ye sab pattern matching hai.

**Kaise:**
```javascript
// Admin command check:
if (/^sync$/i.test(query.trim())) { /* sync karo */ }

// SQL safety — sirf SELECT allowed:
if (!/^\s*SELECT/i.test(sql)) throw new Error("Only SELECT allowed");

// Casual message detection (tenant-router.js):
if (/^(hi+|hello|hey|kaise\s*h[oa]|how\s*are\s*you)[\s?!.]*$/i.test(query)) {
  return { silent: true };
}

// WhatsApp bold format fix:
reply = reply.replace(/\*\*/g, '*');  // **bold** → *bold*
```

**Agar ye nahi hota:** Har pattern ke liye multiple if-else + string operations — 10x zyada code.


---

## 🟡 LEVEL 2 — NODE.JS FUNDAMENTALS

---

### 2.1 What is Node.js

**Kya hai:** JavaScript ko browser ke bahar (server pe) chalane ka runtime. Chrome ka V8 engine use karta hai.

**Kahan:** Pura project Node.js pe chalta hai — `server.js` Node.js application hai

**Kyu:** Pehle JavaScript sirf browser mein chalti thi (frontend). Node.js ne allow kiya ki same language se backend server bhi bana sako. Ek language — full stack.

**Kaise:**
```bash
# Server start:
node server.js
# Ya PM2 se:
pm2 start server.js --name mis-chatbot
```

**Agar ye nahi hota:** Python/Java/PHP seekhna padta backend ke liye — alag language, alag ecosystem.

---

### 2.2 Modules (require / module.exports)

**Kya hai:** Code ko alag-alag files mein todna. `require()` = import. `module.exports` = export.

**Kahan:** `server.js` imports from `helpers/whatsapp.js`, `helpers/sheets.js`, `helpers/tenant-router.js` etc.

**Kyu:** 3000 lines ek file mein = nightmare. Alag files mein todne se organized rehta hai, ek file ka bug dusri ko affect nahi karta.

**Kaise:**
```javascript
// helpers/whatsapp.js — EXPORT:
module.exports = { sendWhatsAppReply, sendWhatsAppMedia, downloadMetaMedia, formatPhone };

// server.js — IMPORT:
const { sendWhatsAppReply, sendWhatsAppMedia, downloadMetaMedia, formatPhone } = require("./helpers/whatsapp");
```

**Agar ye nahi hota:** server.js 5000+ lines ka hota — kuch dhundna impossible.

---

### 2.3 npm & package.json

**Kya hai:** npm = Node Package Manager. Dusron ka likha hua code (libraries) install karta hai. `package.json` = project ki recipe (kaunsi libraries chahiye).

**Kahan:** `/package.json` — project root mein

**Kyu:** WhatsApp API, OpenAI, Supabase, PDF generation — ye sab kisi ne pehle se likh rakha hai. Hum sirf install karke use karte hain.

**Kaise:**
```json
// package.json:
{
  "dependencies": {
    "express": "^5.1.0",      // Web server framework
    "@supabase/supabase-js": "^2.49.4",  // Database client
    "dotenv": "^16.5.0",      // Environment variables load karo
    "pdfkit": "^0.16.0",      // PDF generate karo
    "nodemailer": "^6.10.1",  // Email bhejo
    "googleapis": "^148.0.0"  // Google Calendar/Sheets API
  }
}
```
```bash
npm install          # Sab libraries install karo
npm install express  # Ek specific library install karo
```

**Agar ye nahi hota:** Har cheez scratch se likhni padti — PDF library = 10,000 lines, email = 5,000 lines.

---

### 2.4 Environment Variables (.env)

**Kya hai:** Secret values (API keys, passwords) jo code mein hardcode nahi karte. `.env` file mein rakhte hain.

**Kahan:** `/.env` file + `process.env.VARIABLE_NAME` se access

**Kyu:** Agar API key code mein likho → GitHub pe push karo → duniya dekh legi → hack ho jaoge. `.env` file `.gitignore` mein hoti hai — kabhi push nahi hoti.

**Kaise:**
```bash
# .env file:
OPENAI_API_KEY=sk-proj-xxxxx
SUPABASE_URL=https://bjrrlikjinhcbkyherim.supabase.co
ADMIN_API_KEY=037beb1bd04c8051dbcbde92d43f76c64cce12172cd9eefcb85a2e3e1fc82a12
```
```javascript
// server.js mein access:
require("dotenv").config();  // .env file load karo
const apiKey = process.env.OPENAI_API_KEY;  // value mil gayi
```

**Agar ye nahi hota:** API keys GitHub pe leak → ₹50,000 ka OpenAI bill aa jata kisi aur ke use se.

---

### 2.5 Event Loop & Non-blocking I/O

**Kya hai:** Node.js ek time pe ek hi kaam karta hai (single-threaded) BUT I/O operations (database, file read, API call) background mein hoti hain. Jab complete ho, callback/await se result milta hai.

**Kahan:** Pura server isi principle pe chalta hai

**Kyu:** 100 users ek saath message bhejein → Node.js sab handle kar leta hai kyunki database calls background mein hoti hain. Ek user ka wait dusre ko block nahi karta.

**Kaise:**
```javascript
// Ye 3 operations PARALLEL mein hoti hain (non-blocking):
app.post("/whatsapp", async (req, res) => {
  res.status(200).json({ success: true });  // Instant reply to webhook
  
  // Background mein ye sab hota hai:
  const plan = await processQuery(message);     // 3 sec (AI call)
  const rows = await runSQL(plan.sql);          // 200ms (DB call)
  await sendWhatsAppReply(phone, formatted);    // 500ms (WA API call)
  // Total: ~4 sec — but server is FREE to handle other requests during waits
});
```

**Agar ye nahi hota:** Ek user ka 4 sec ka request dusre 99 users ko block karta — sab ko wait karna padta.

---

### 2.6 File System (fs module)

**Kya hai:** Files read/write karna — PDF save karna, CSV generate karna, JSON config load karna.

**Kahan:** `server.js` — PDF generation, CSV export, access_control.json read/write

**Kyu:** Generated PDFs ko temporarily save karna padta hai before WhatsApp pe bhejne se pehle.

**Kaise:**
```javascript
const fs = require("fs");

// CSV file write:
fs.writeFileSync(csvPath, header + "\n" + body, "utf8");

// JSON config read:
const accessData = JSON.parse(fs.readFileSync("./access_control.json", "utf8"));

// Temp file delete (cleanup):
fs.unlinkSync(tmpPath);
```

**Agar ye nahi hota:** PDFs/CSVs generate karke bhej nahi paate — sirf text replies de paate.

---

### 2.7 Path Module

**Kya hai:** File paths handle karna — OS-independent (Windows vs Mac vs Linux paths alag hote hain).

**Kahan:** `server.js` — temp files, static files serving

**Kyu:** Mac pe `/tmp/file.pdf`, Windows pe `C:\temp\file.pdf`. Path module automatically sahi format deta hai.

**Kaise:**
```javascript
const path = require("path");
const os = require("os");

// Temp file path:
const tmpPath = path.join(os.tmpdir(), `data_${Date.now()}.pdf`);
// Mac: /var/folders/.../data_1716345678.pdf
// Windows: C:\Users\...\AppData\Local\Temp\data_1716345678.pdf

// Static files serve:
app.use(express.static(path.join(__dirname, "public")));
```

**Agar ye nahi hota:** Hardcoded paths — Mac pe chale, deploy karo toh crash.


---

## 🟠 LEVEL 3 — EXPRESS.JS & APIs

---

### 3.1 What is Express.js

**Kya hai:** Node.js ke liye web server framework. HTTP requests handle karna easy banata hai.

**Kahan:** `server.js` line 1 — `const express = require("express")`

**Kyu:** Raw Node.js mein server banana = 50 lines boilerplate. Express mein = 3 lines. Routes, middleware, static files — sab built-in.

**Kaise:**
```javascript
const express = require("express");
const app = express();
app.listen(3000, () => console.log("Server running on port 3000"));
```

**Agar ye nahi hota:** Har HTTP request manually parse karna padta — headers, body, URL sab khud handle karo.

---

### 3.2 Routes (GET, POST, DELETE)

**Kya hai:** URL + HTTP method = Route. Kaunsa URL hit kare toh kya kaam ho.

**Kahan:** `server.js` — `/whatsapp` (POST), `/health` (GET), `/chat` (POST), `/sync` (GET/POST), `/api/tenant/register` (POST)

**Kyu:** Alag-alag URLs pe alag kaam — WhatsApp webhook alag, health check alag, chat API alag.

**Kaise:**
```javascript
// Health check — browser mein /health kholo:
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// WhatsApp webhook — WhatsApp yahan message bhejta hai:
app.post("/whatsapp", async (req, res) => {
  // message process karo, reply bhejo
});

// Chat history delete:
app.delete("/history/:sid", async (req, res) => {
  // session delete karo
});
```

**Agar ye nahi hota:** Ek hi URL pe sab kuch handle karna padta — chaos.

---

### 3.3 Middleware

**Kya hai:** Har request ke beech mein chalne wala code. Request aaye → middleware → route handler. Chain of functions.

**Kahan:** `server.js` — body parser, CORS, request logger, rate limiter, JSON error handler

**Kyu:** Har route mein same code repeat karne ki jagah (logging, auth check) — ek baar middleware mein likho, sab routes pe apply ho.

**Kaise:**
```javascript
// Body parser — har request ka JSON body parse karo:
app.use(express.json({ limit: "50mb" }));

// Request logger — har request log karo:
app.use((req, res, next) => {
  console.log("[METHOD]", req.method, "[URL]", req.originalUrl);
  next();  // IMPORTANT: next() na bulao toh request hang ho jayegi
});

// Error handler (last middleware):
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  next(err);
});
```

**Agar ye nahi hota:** Har route mein manually body parse karna, logging karna, error handle karna — 100x repetition.

---

### 3.4 Request & Response (req, res)

**Kya hai:** `req` = client ne kya bheja (body, headers, URL params). `res` = server kya reply karega.

**Kahan:** Har route handler mein

**Kyu:** Client se data lena (req) aur client ko jawab dena (res) — ye hi toh server ka kaam hai.

**Kaise:**
```javascript
app.post("/chat", (req, res) => {
  // REQUEST se data nikalo:
  const { message, session_id } = req.body;     // POST body
  const apiKey = req.headers["x-api-key"];       // Header
  const userId = req.params.id;                  // URL param (/user/:id)
  const page = req.query.page;                   // Query string (?page=2)

  // RESPONSE bhejo:
  res.json({ reply: "Hello!", type: "text" });   // JSON response
  res.status(404).json({ error: "Not found" });  // Error response
  res.status(200).send("OK");                    // Plain text
});
```

**Agar ye nahi hota:** Raw HTTP streams parse karna — headers, body boundaries, encoding sab manually.

---

### 3.5 Static File Serving

**Kya hai:** HTML, CSS, JS files directly serve karna — bina route likhe.

**Kahan:** `server.js` — `app.use(express.static("public"))` → `public/` folder ki files directly accessible

**Kyu:** `index.html`, `onboard.html`, `access-control.html` — ye sab static files hain. Inke liye alag route likhne ki zaroorat nahi.

**Kaise:**
```javascript
app.use(express.static(path.join(__dirname, "public")));
// Ab:
// /index.html → public/index.html serve hoga
// /onboard.html → public/onboard.html serve hoga
// /access-control.html → public/access-control.html serve hoga
```

**Agar ye nahi hota:** Har HTML file ke liye alag `app.get("/page", ...)` route likhna padta.

---

### 3.6 REST API Design

**Kya hai:** API design ka standard pattern. Resources (data) ko URLs se represent karo, HTTP methods se actions karo.

**Kahan:** `server.js` — `/api/access/users` (GET), `/api/tenant/register` (POST), `/api/tenant/update` (POST)

**Kyu:** Standard pattern follow karo toh koi bhi developer samajh jayega ki API kaise use karni hai.

**Kaise:**
```javascript
// RESTful pattern:
GET    /api/access/users      → Sab users ki list
POST   /api/access/add-user   → Naya user add karo
POST   /api/tenant/register   → Naya tenant register
POST   /api/tenant/update     → Tenant update karo
DELETE /history/:sid          → Chat history delete

// Har endpoint JSON return karta hai:
{ "success": true, "data": [...] }
{ "error": "Not found" }
```

**Agar ye nahi hota:** Random URL patterns — `/doThis`, `/action2`, `/xyz` — koi samjhe na.

---

### 3.7 HTTP Status Codes

**Kya hai:** Server ka response code — success ya failure ka type batata hai.

**Kahan:** `server.js` — har response mein

**Kyu:** Client ko batana ki request successful thi ya nahi, aur kyu nahi.

**Kaise:**
```javascript
res.status(200).json({ success: true });   // 200 = OK, sab theek
res.status(400).json({ error: "Bad request" }); // 400 = Client ki galti (wrong data)
res.status(401).json({ error: "Unauthorized" }); // 401 = Auth nahi hai
res.status(404).json({ error: "Not found" });    // 404 = Resource nahi mila
res.status(429).json({ error: "Too many requests" }); // 429 = Rate limited
res.status(500).json({ error: "Server error" });  // 500 = Server ki galti
```

**Agar ye nahi hota:** Client ko pata nahi chalta ki error kya hai — sab kuch 200 OK mein aata.

---

### 3.8 Headers & Authentication

**Kya hai:** HTTP headers = request/response ke saath extra info. Authentication = "tu kaun hai" verify karna.

**Kahan:** `server.js` — `x-api-key` header for admin endpoints, `Content-Type` for JSON

**Kyu:** Admin endpoints (user add, sync, delete) ko protect karna — koi bhi na call kar sake.

**Kaise:**
```javascript
// Admin auth check:
app.post("/api/access/add-user", (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // ... add user
});

// Client side (curl):
// curl -H "x-api-key: 037beb1bd..." -X POST /api/access/add-user
```

**Agar ye nahi hota:** Koi bhi `/api/access/add-user` call karke users add/delete kar sakta — security zero.

---

### 3.9 CORS (Cross-Origin Resource Sharing)

**Kya hai:** Browser security — ek website dusri website ki API call nahi kar sakti by default. CORS allow karta hai specific origins ko.

**Kahan:** `server.js` — `app.use(cors(...))`

**Kyu:** Tumhara frontend (`saranshs-macbook-air.taile7a14d.ts.net`) tumhari API call kare — allow karna padta hai. But random websites na call kar sakein.

**Kaise:**
```javascript
const cors = require("cors");
app.use(cors({
  origin: ["https://saranshs-macbook-air.taile7a14d.ts.net", "http://localhost:3000"],
  methods: ["GET", "POST", "DELETE"]
}));
// Ab sirf ye 2 origins API call kar sakti hain
// Koi random website se call → browser block karega
```

**Agar ye nahi hota:** Ya toh koi bhi website tumhari API use kar le (security risk), ya tumhara apna frontend bhi call na kar paye.

---

### 3.10 Rate Limiting

**Kya hai:** Ek user kitni requests bhej sakta hai per minute — limit lagana.

**Kahan:** `server.js` — `rateLimit()` function, 20/min WhatsApp, 30/min web

**Kyu:** Koi user 1000 messages bheje 1 minute mein → server crash + OpenAI bill ₹50,000. Rate limit se protect.

**Kaise:**
```javascript
// In-memory rate limiter:
const rateLimits = {};
function rateLimit(key, maxRequests, windowSec) {
  const now = Date.now();
  if (!rateLimits[key]) rateLimits[key] = [];
  rateLimits[key] = rateLimits[key].filter(t => now - t < windowSec * 1000);
  if (rateLimits[key].length >= maxRequests) return true; // BLOCKED
  rateLimits[key].push(now);
  return false; // ALLOWED
}

// Usage:
if (rateLimit("wp:" + phone, 20, 60)) {
  console.log("[RATE LIMITED]", phone);
  return; // Silently ignore
}
```

**Agar ye nahi hota:** Spam attack → OpenAI API bill explode + server down.


---

## 🔴 LEVEL 4 — DATABASE (Supabase / PostgreSQL)

---

### 4.1 What is a Database

**Kya hai:** Data permanently store karne ki jagah. Server restart ho, data safe rahe. Tables mein organized data (like Excel sheets).

**Kahan:** Supabase (hosted PostgreSQL) — `bjrrlikjinhcbkyherim.supabase.co`

**Kyu:** In-memory data (variables) server restart pe ud jaata hai. Database mein data permanent hai — sales records, chat history, user sessions sab safe.

**Kaise:**
```
Database "mis-chatbot":
├── Table: sales (1316 rows) — invoice_no, company_name, total_price...
├── Table: expenses (1807 rows) — date, party_name, amount...
├── Table: pending (150 rows) — party_name, pending_amount...
├── Table: ledger (2187 rows) — name, debit, credit, balance...
├── Table: products (2606 rows) — item_name, image_link...
├── Table: tenant_data (dynamic) — tenant_id, row_data (JSONB)...
└── Table: chat_history — session_id, role, content, created_at
```

---

### 4.2 SQL (Structured Query Language)

**Kya hai:** Database se baat karne ki language. Data nikalo (SELECT), dalo (INSERT), update karo (UPDATE), delete karo (DELETE).

**Kahan:** `server.js` — AI generates SQL → `runSQL()` executes → results format

**Kyu:** User puchta hai "total sales kitni hai" → AI isko SQL mein convert karta hai → database exact answer deta hai.

**Kaise:**
```sql
-- Total sales:
SELECT SUM(total_price::numeric) as total FROM sales;

-- Party-wise pending:
SELECT party_name, SUM(pending_amount::numeric) as total
FROM pending GROUP BY party_name ORDER BY total DESC LIMIT 10;

-- Fuzzy search:
SELECT * FROM sales WHERE company_name ILIKE '%pansari%';

-- Date filter:
SELECT * FROM expenses WHERE date >= CURRENT_DATE - INTERVAL '30 days';
```

**Agar ye nahi hota:** Data manually search karna padta — 2000 rows mein se manually total nikalo.

---

### 4.3 Supabase Client

**Kya hai:** Supabase ka JavaScript SDK — database operations easy banata hai.

**Kahan:** `server.js` line ~36 — `createClient(url, key)`

**Kyu:** Raw SQL likhne ki jagah JavaScript methods se database operate karo.

**Kaise:**
```javascript
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Select:
const { data, error } = await supabase.from("sales").select("*").limit(100);

// Insert:
await supabase.from("chat_history").insert({ session_id: "abc", role: "user", content: "hello" });

// Upsert (insert or update):
await supabase.from("wp_sessions").upsert({ phone: "918750285420", data: sessionData });

// Delete:
await supabase.from("chat_history").delete().eq("session_id", "abc");

// RPC (custom SQL function):
const { data } = await supabase.rpc("execute_sql", { query: sqlString });
```

**Agar ye nahi hota:** Raw HTTP calls to Supabase REST API — 3x zyada code har operation ke liye.

---

### 4.4 JSONB (JSON Binary)

**Kya hai:** PostgreSQL mein JSON data store karna — flexible schema. Koi bhi structure ka data ek column mein.

**Kahan:** `tenant_data` table — `row_data JSONB` column mein tenant ka sheet data store hota hai

**Kyu:** Har tenant ka sheet alag hai — kisi mein 5 columns, kisi mein 20. Fixed columns banana impossible. JSONB mein kuch bhi store kar sakte ho.

**Kaise:**
```sql
-- Tenant data stored as:
-- row_data = {"Item": "Bolt", "Qty": "3040", "Rate": "70", "Party": "Shivani"}

-- Access JSONB fields:
SELECT row_data->>'Item' as item_name FROM tenant_data WHERE tenant_id = 'uuid';

-- Numeric operations on JSONB:
SELECT SUM(NULLIF(REPLACE(row_data->>'Rate', ',', ''), '')::numeric) FROM tenant_data;

-- Search in JSONB:
SELECT * FROM tenant_data WHERE row_data->>'Party' ILIKE '%shivani%';
```

**Agar ye nahi hota:** Har tenant ke liye alag table banana padta (1000 tenants = 1000 tables — unmanageable).

---

### 4.5 RPC Functions (Remote Procedure Call)

**Kya hai:** Database mein custom functions banana jo client se call kar sako. Complex SQL ko ek function mein wrap karo.

**Kahan:** Supabase mein `execute_sql` RPC function — dynamic SQL execute karta hai

**Kyu:** AI dynamic SQL generate karta hai (har query alag). Supabase client mein raw SQL execute karne ka direct method nahi hai — RPC se karte hain.

**Kaise:**
```sql
-- Supabase mein function create (one-time):
CREATE OR REPLACE FUNCTION execute_sql(query TEXT)
RETURNS JSON AS $$
BEGIN
  RETURN (SELECT json_agg(row_to_json(t)) FROM (EXECUTE query) t);
END;
$$ LANGUAGE plpgsql;
```
```javascript
// JavaScript se call:
const { data, error } = await supabase.rpc("execute_sql", {
  query: "SELECT company_name, SUM(total_price::numeric) as total FROM sales GROUP BY company_name"
});
// data = [{ company_name: "ABC", total: 50000 }, ...]
```

**Agar ye nahi hota:** Dynamic SQL execute nahi kar paate — sirf fixed queries chal paati.

---

### 4.6 Migrations

**Kya hai:** Database schema changes ko versioned files mein rakhna. "Ye table add karo", "ye column add karo" — step by step.

**Kahan:** `migrations/001_multi_tenant.sql`, `migrations/002_readonly_role.sql`

**Kyu:** Database changes track karna — kab kya change hua. Naye environment mein same database setup karna easy.

**Kaise:**
```sql
-- migrations/001_multi_tenant.sql:
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  sheet_url TEXT,
  schema_json JSONB,
  plan TEXT DEFAULT 'free',
  queries_this_month INT DEFAULT 0
);

CREATE TABLE tenant_data (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  row_data JSONB NOT NULL
);
```

**Agar ye nahi hota:** Database changes yaad rakhna padta — "kya kya tables banaye the?" — bhool gaye toh sab kuch manually recreate.

---

### 4.7 Indexing

**Kya hai:** Database mein search fast karne ka tarika. Book ki index jaisa — pura book padhne ki jagah index se page number dhundho.

**Kahan:** Supabase automatically primary keys pe index banata hai. `tenant_data` pe `tenant_id` indexed hai.

**Kyu:** 1 lakh rows mein se ek tenant ka data dhundhna — bina index = 1 lakh rows scan (slow). Index ke saath = direct jump (fast).

**Kaise:**
```sql
-- Index create (one-time):
CREATE INDEX idx_tenant_data_tenant_id ON tenant_data(tenant_id);

-- Ab ye query fast hogi:
SELECT * FROM tenant_data WHERE tenant_id = 'uuid-123';
-- Bina index: 100ms (full table scan)
-- Index ke saath: 2ms (direct lookup)
```

**Agar ye nahi hota:** Jaise jaise data badhta, queries slower hoti jaati — 1 lakh rows pe 5 seconds lag jaate.

---

### 4.8 Upsert Pattern

**Kya hai:** INSERT + UPDATE combined. "Agar row exist karti hai toh update karo, nahi toh insert karo."

**Kahan:** `server.js` — session save, sync operations

**Kyu:** User session save karna — pehli baar insert, baad mein update. Dono cases ek command mein handle.

**Kaise:**
```javascript
// Session save — phone already exists? update. Nahi? insert.
await supabase.from("wp_sessions").upsert({
  phone: "918750285420",
  data: { type: "ledger_select", options: ["ABC", "XYZ"] },
  updated_at: new Date().toISOString()
});
```

**Agar ye nahi hota:** Pehle check karo "exists?", phir decide karo insert ya update — 2 queries instead of 1.


---

## 🟣 LEVEL 5 — AI & OPENAI INTEGRATION

---

### 5.1 What is OpenAI API

**Kya hai:** ChatGPT ko programmatically use karna. Message bhejo → intelligent response aaye. Text generation, code generation, audio transcription.

**Kahan:** `server.js` — `openai()` function, `processQuery()`, `helpers/tenant-router.js` — `generateSQL()`

**Kyu:** User Hinglish mein puchta hai "pansari ki pending kitni hai" → AI samajhta hai → SQL generate karta hai. Ye intelligence manually code karna impossible hai.

**Kaise:**
```javascript
async function openai(systemPrompt, messages, maxTokens = 1000) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      temperature: 0,
      max_tokens: maxTokens
    })
  });
  const data = await res.json();
  return data.choices[0].message.content;
}
```

**Agar ye nahi hota:** Har possible question ke liye if-else likhna padta — 10,000 conditions bhi enough nahi hoti.

---

### 5.2 System Prompt

**Kya hai:** AI ko instructions dena — "tu kaun hai, kya karna hai, kaise karna hai." Ye har request ke saath jaata hai but user ko dikhta nahi.

**Kahan:** `server.js` — `buildSystemPrompt()` (200+ lines ka prompt)

**Kyu:** Bina system prompt ke AI generic answers dega. System prompt se AI specifically tumhare database ke columns, rules, format sab jaanta hai.

**Kaise:**
```javascript
function buildSystemPrompt() {
  return `You are an expert Sales & Finance Assistant for "Mis Work India".
Today: ${new Date().toISOString().split("T")[0]}

TABLE: public.sales
  columns: invoice_no, company_name, total_price, category, created_at

RULES:
- ALWAYS use ILIKE for text search
- SUM(amount::numeric) for totals
- JSON output only

User: "pansari ki sales"
→ {"intent": "DATA_QUERY", "sql": "SELECT * FROM sales WHERE company_name ILIKE '%pansari%'"}`;
}
```

**Agar ye nahi hota:** AI ko pata nahi hota ki tables kya hain, columns kya hain — random SQL generate karta.

---

### 5.3 Temperature

**Kya hai:** AI ki "creativity" control. 0 = deterministic (same input = same output). 1 = creative (random variations).

**Kahan:** `server.js` — `temperature: 0` for SQL generation, `temperature: 0.2` for formatting

**Kyu:** SQL generation mein creativity nahi chahiye — exact same query har baar. But response formatting mein thodi variety okay hai.

**Kaise:**
```javascript
// SQL generation — ZERO creativity (exact, predictable):
{ model: "gpt-4o-mini", temperature: 0, ... }

// Response formatting — slight creativity (natural language):
{ model: "gpt-4o-mini", temperature: 0.2, ... }
```

**Agar ye nahi hota:** AI har baar alag SQL generate karta — kabhi kaam kare kabhi na kare.

---

### 5.4 Tokens & Cost

**Kya hai:** AI text ko "tokens" mein measure karta hai (~4 chars = 1 token). Jitne zyada tokens, utna zyada cost.

**Kahan:** Har AI call mein — system prompt + user message + response = total tokens

**Kyu:** Cost control. Tumhara system prompt 2000 tokens hai + user message 100 + response 500 = 2600 tokens per query. gpt-4o-mini = $0.15/1M input tokens.

**Kaise:**
```
Ek query ka cost:
- System prompt: ~2000 tokens (input)
- User message: ~50 tokens (input)
- AI response: ~200 tokens (output)
- Total: ~2250 tokens
- Cost: ~$0.0004 per query (₹0.03)

100 queries/day = ₹3/day = ₹90/month

Agar gpt-4o use karo (10x expensive):
- Same query = ₹0.30
- 100 queries/day = ₹30/day = ₹900/month
```

**Agar ye nahi hota:** Unlimited tokens use karo → bill ₹50,000/month.

---

### 5.5 Chat History (Context)

**Kya hai:** Previous messages AI ko bhejne se AI ko context milta hai — follow-up questions samajhta hai.

**Kahan:** `server.js` — `chatHistory.slice(-8)` (last 8 messages bhejte hain)

**Kyu:** User: "Shammi ji ki sales" → AI answers. User: "uski pending bhi batao" → AI ko pata hona chahiye "uski" = Shammi ji.

**Kaise:**
```javascript
const messages = [
  ...chatHistory.slice(-8).map(h => ({ role: h.role, content: h.content })),
  { role: "user", content: userMessage }
];
// AI ko last 8 messages ka context milta hai
// Isse follow-up questions kaam karte hain
```

**Agar ye nahi hota:** Har message independent hota — "uski pending" ka matlab AI ko pata nahi chalta.

---

### 5.6 Whisper (Audio Transcription)

**Kya hai:** OpenAI ka speech-to-text model. Audio file bhejo → text mein convert kare.

**Kahan:** `server.js` — WhatsApp voice messages handle karna

**Kyu:** User voice note bhejta hai "total sales kitni hai" → Whisper text mein convert karta hai → phir normal flow chalta hai.

**Kaise:**
```javascript
// Audio file → text:
const form = new FormData();
form.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "audio.ogg");
form.append("model", "whisper-1");
form.append("language", "hi");  // Hindi

const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
  method: "POST",
  headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY },
  body: form
});
const { text } = await res.json();
// text = "total sales kitni hai"
```

**Agar ye nahi hota:** Voice messages completely ignore hote — sirf text support hota.

---

### 5.7 Intent Detection (AI-based routing)

**Kya hai:** User ka message classify karna — ye data query hai? Calendar booking hai? Greeting hai? Ignore karna hai?

**Kahan:** `server.js` — `executePlan()` function, AI response mein `intent` field

**Kyu:** Ek hi WhatsApp number pe user data bhi puchta hai, meeting bhi book karta hai, hi bhi bolta hai. Har type ka message alag handle hona chahiye.

**Kaise:**
```javascript
// AI returns:
{
  "intent": "DATA_QUERY",      // → SQL execute karo, data do
  "intent": "CALENDAR_BOOKING", // → Google Calendar mein event banao
  "intent": "GREETING",         // → Silent (no reply)
  "intent": "IGNORE"            // → Silent (no reply)
}

// Routing:
if (intent === "IGNORE" || intent === "GREETING") return { query_type: "not_relevant" };
if (intent.startsWith("CALENDAR")) return handleCalendar(...);
// else: DATA_QUERY → run SQL
```

**Agar ye nahi hota:** Har message data query maana jaata — "hi" pe bhi SQL generate hota (jo abhi fix kiya).

---

### 5.8 Prompt Engineering

**Kya hai:** AI ko sahi instructions dena taaki wo exactly wahi kare jo tum chahte ho. Art + Science.

**Kahan:** `server.js` — `buildSystemPrompt()` mein 200+ lines of carefully crafted rules

**Kyu:** AI powerful hai but dumb bhi hai — agar clearly nahi batao toh galat kaam karega. Prompt mein rules, examples, edge cases sab dene padte hain.

**Kaise:**
```javascript
// Bad prompt:
"Generate SQL for user question"
// Result: Random SQL, wrong tables, wrong columns

// Good prompt (tumhara):
`TABLE: public.sales
  columns: invoice_no, company_name, total_price
  
RULES:
- ALWAYS use ILIKE for text search
- NEVER use exact match (=)
- Extract MOST DISTINCTIVE keyword: "ajanta water bottle" → ILIKE '%ajanta%'
- For amounts: SUM(column::numeric)

EXAMPLES:
- "pansari ki sales" → WHERE company_name ILIKE '%pansari%'
- "total expenses" → SELECT SUM(amount::numeric) FROM expenses`
// Result: Accurate SQL every time
```

**Agar ye nahi hota:** AI 50% time galat SQL generate karta — wrong columns, wrong tables, wrong logic.


---

## 🔵 LEVEL 6 — WHATSAPP & WEBHOOKS

---

### 6.1 What is a Webhook

**Kya hai:** "Jab kuch ho toh mujhe batao." Tum apna URL dete ho → jab event ho (message aaye) → wo URL pe POST request aati hai automatically.

**Kahan:** `server.js` — `app.post("/whatsapp", ...)` — WhatsApp yahan message bhejta hai

**Kyu:** Tum har second WhatsApp ko nahi puch sakte "koi naya message aaya?" (polling = waste). Instead WhatsApp khud tumhe batata hai jab message aaye (webhook = efficient).

**Kaise:**
```
Normal (Polling — BAD):
Every 1 sec: "Koi message aaya?" → "Nahi" → "Koi message aaya?" → "Nahi" → ...
(99% requests waste)

Webhook (GOOD):
WhatsApp: *message aaya* → POST https://your-server.com/whatsapp → {message: "hello"}
(Sirf tab call hota hai jab actually message aaye)
```

**Agar ye nahi hota:** Har second API call karna padta — slow, expensive, unreliable.

---

### 6.2 WhatsApp Cloud API (Meta)

**Kya hai:** WhatsApp messages programmatically send/receive karna via Meta's official API (through wa.apimis.in proxy).

**Kahan:** `helpers/whatsapp.js` — send functions, `server.js` — webhook receiver

**Kyu:** Bot ko WhatsApp pe messages receive karne aur reply bhejne ke liye official API chahiye.

**Kaise:**
```javascript
// TEXT message send:
await fetch("https://wa.apimis.in/api/v1/whatsapp/sendMessage", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": token },
  body: JSON.stringify({ to: "918750285420", text: "Hello!" })
});

// IMAGE send:
await fetch("https://wa.apimis.in/api/v1/whatsapp/meta/sendMessage", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-api-key": token },
  body: JSON.stringify({
    to: "918750285420",
    message: { type: "image", image: { link: "https://...", caption: "Product photo" } }
  })
});
```

**Agar ye nahi hota:** WhatsApp pe bot nahi chala sakte — sirf manual messaging.

---

### 6.3 Webhook Payload Parsing

**Kya hai:** Webhook se aane wale data ko samajhna — kaun se field mein kya hai.

**Kahan:** `server.js` — WhatsApp webhook handler mein payload extract karna

**Kyu:** WhatsApp 2 formats mein data bhejta hai (wa.apimis.in format + Meta Cloud API format). Dono handle karne padte hain.

**Kaise:**
```javascript
// wa.apimis.in format:
{ senderNumber: "918750285420", message: "hello", itemType: "text", boundType: "in" }

// Meta Cloud API format:
{ entry: [{ changes: [{ value: { messages: [{ from: "918750285420", text: { body: "hello" } }] } }] }] }

// Dono handle:
const phone = body.senderNumber || body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
const text = body.message || body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body;
```

**Agar ye nahi hota:** Messages receive hote but extract nahi kar paate — bot deaf rehta.

---

### 6.4 Instant Response Pattern

**Kya hai:** Webhook ko turant 200 OK reply karo, phir background mein processing karo.

**Kahan:** `server.js` — `res.status(200).json({ success: true })` BEFORE processing

**Kyu:** WhatsApp webhook 30 sec mein response expect karta hai. Agar nahi mila → webhook disable kar deta hai. Processing 10 sec leti hai → pehle 200 bhejo, phir kaam karo.

**Kaise:**
```javascript
app.post("/whatsapp", async (req, res) => {
  // STEP 1: Instant reply (50ms)
  res.status(200).json({ success: true });
  
  // STEP 2: Background processing (10 sec)
  const plan = await processQuery(message);    // 3 sec
  const rows = await runSQL(plan.sql);         // 200ms
  await sendWhatsAppReply(phone, formatted);   // 500ms
  // WhatsApp ko pata hi nahi ki ye 10 sec laga — usse 50ms mein reply mil gaya
});
```

**Agar ye nahi hota:** WhatsApp webhook timeout → disable → messages aana band.

---

### 6.5 Media Upload & Send

**Kya hai:** Files (PDF, images) WhatsApp pe bhejne ke liye pehle upload karo → media ID milo → phir send karo.

**Kahan:** `helpers/whatsapp.js` — `sendWhatsAppMedia()`

**Kyu:** WhatsApp pe directly file nahi bhej sakte — pehle Meta ke server pe upload hogi, phir media ID se reference karke bhejoge.

**Kaise:**
```javascript
async function sendWhatsAppMedia(to, filePath, caption, type) {
  // Step 1: Upload file → get media ID
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", fs.createReadStream(filePath));
  const uploadRes = await fetch(".../media/upload", { method: "POST", body: form });
  const { id: mediaId } = await uploadRes.json();

  // Step 2: Send using media ID
  await fetch(".../meta/sendMessage", {
    body: JSON.stringify({
      to,
      message: { type, [type]: { id: mediaId, caption } }
    })
  });
}
```

**Agar ye nahi hota:** Sirf text replies — PDF, charts, product images kuch nahi bhej paate.

---

## 🟤 LEVEL 7 — GOOGLE APIs

---

### 7.1 Service Account

**Kya hai:** Bot ke liye Google account — bina human login ke Google services use karna. JSON key file se authenticate.

**Kahan:** `logical-craft-438704-n8-d0d8ae886a53.json` — service account key file

**Kyu:** Google Calendar mein events banana, Google Sheets se data padhna — ye sab programmatically karna hai bina manually login kiye.

**Kaise:**
```javascript
const { google } = require("googleapis");
const auth = new google.auth.GoogleAuth({
  keyFile: "./logical-craft-438704-n8-d0d8ae886a53.json",
  scopes: ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/spreadsheets"]
});
const calendar = google.calendar({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });
```

**Agar ye nahi hota:** Har baar manually Google login karna padta — bot autonomous nahi hota.

---

### 7.2 Google Calendar API

**Kya hai:** Google Calendar mein events create/read/delete karna programmatically.

**Kahan:** `server.js` — `handleCalendarIntent()`, booking/retrieval/cancellation

**Kyu:** User bole "kal 3 baje meeting book karo Amit ke saath" → bot Google Calendar mein event create kare.

**Kaise:**
```javascript
// Event create:
await calendar.events.insert({
  calendarId: "saranshrajput1301@gmail.com",
  resource: {
    summary: "Meeting with Amit",
    start: { dateTime: "2026-05-23T15:00:00+05:30" },
    end: { dateTime: "2026-05-23T16:00:00+05:30" },
    description: "Booked via MIS Bot\n🔗 https://meet.jit.si/MIS-Amit-xyz"
  }
});

// Events retrieve (today):
const events = await calendar.events.list({
  calendarId: "saranshrajput1301@gmail.com",
  timeMin: todayStart,
  timeMax: todayEnd
});
```

**Agar ye nahi hota:** Calendar manually manage karna padta — bot se booking impossible.

---

### 7.3 Google Sheets API

**Kya hai:** Google Sheets se data read/write karna programmatically.

**Kahan:** `helpers/sheets.js` — sheet data fetch + sync, `helpers/sheets-write.js` — write operations

**Kyu:** Business data Google Sheets mein hai (Tally export). Bot ko ye data chahiye answers dene ke liye. Auto-sync every 15 min.

**Kaise:**
```javascript
// Read sheet data:
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: "1ZJVFQ5zETwqoiZ5isqRxcKzLzLRwrLiFjqLwEqATBw4",
  range: "SALES!A1:Z"
});
const rows = res.data.values;  // [[header1, header2], [val1, val2], ...]

// Write to sheet:
await sheets.spreadsheets.values.append({
  spreadsheetId: "...",
  range: "ACCESS_CONTRO!A1",
  valueInputOption: "RAW",
  resource: { values: [["918750285420", "Saransh", "ALL", "active"]] }
});
```

**Agar ye nahi hota:** Data manually copy-paste karna padta Sheets se database mein — har 15 min.

---

### 7.4 Public Sheet Fetching (No Auth)

**Kya hai:** Public Google Sheets ko bina API key ke fetch karna — CSV/HTML format mein.

**Kahan:** `helpers/sheets.js` — tenant onboarding mein sheet data detect karna

**Kyu:** Tenant users apni public sheet ka link dete hain. Bina OAuth ke unka data fetch karna padta hai.

**Kaise:**
```javascript
// Public sheet → CSV fetch:
const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
const res = await fetch(url);
const csv = await res.text();
// Parse CSV → detect columns → show schema to user

// All tabs discover:
const htmlUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`;
const html = await (await fetch(htmlUrl)).text();
// Parse HTML to find all tab names and GIDs
```

**Agar ye nahi hota:** Tenant ko OAuth consent dena padta (complex) ya manually data paste karna padta.


---

## ⚫ LEVEL 8 — ARCHITECTURE & DESIGN PATTERNS

---

### 8.1 Multi-Tenancy

**Kya hai:** Ek hi application multiple users/companies ke liye kaam kare — har user ka data alag, but code same.

**Kahan:** `helpers/tenant-router.js` — har tenant ka apna data, apna schema, apna prompt

**Kyu:** SaaS product banana hai — 100 users apni sheet connect karein, sab ek hi server pe chalein but data isolated rahe.

**Kaise:**
```javascript
// Tenant identify by phone:
const tenant = await getTenant(supabase, phone);
if (tenant) {
  // Iska apna data query karo (tenant_data table, filtered by tenant_id)
  const sql = `SELECT ... FROM tenant_data WHERE tenant_id = '${tenant.id}'`;
} else {
  // Main MIS chatbot flow
}
```

**Agar ye nahi hota:** Har user ke liye alag server deploy karna padta — 100 users = 100 servers (impossible).

---

### 8.2 Caching (In-Memory)

**Kya hai:** Ek baar calculate kiya result store karo — next time same question pe database call skip karo, cached result do.

**Kahan:** `server.js` — `queryCache` Map, 5 min TTL. `tenant-router.js` — `tenantCache` Map.

**Kyu:** Same question 5 min mein 3 baar puchein → 3 AI calls + 3 DB calls = waste. Cache se 1 call + 2 instant responses.

**Kaise:**
```javascript
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCache(key) {
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;
  return null;
}

function setCache(key, value) {
  queryCache.set(key, { value, ts: Date.now() });
}

// Usage:
const cacheKey = `${phone}:${query}`;
const cached = getCache(cacheKey);
if (cached) { await sendWhatsAppReply(phone, cached); return; }
// ... expensive computation ...
setCache(cacheKey, result);
```

**Agar ye nahi hota:** Har repeated question pe 10 sec wait — user frustrated.

---

### 8.3 Session Management

**Kya hai:** User ki conversation state yaad rakhna — multi-turn conversations ke liye.

**Kahan:** `server.js` — `wpSessions` object, Supabase `wp_sessions` table

**Kyu:** User: "Ledger dikhao" → Bot: "Kaun sa? 1. ABC 2. XYZ" → User: "1" → Bot ko yaad hona chahiye ki options kya the.

**Kaise:**
```javascript
// Session save:
wpSessions[phone] = { type: "ledger_select", options: ["ABC Corp", "XYZ Ltd"] };
saveSession(phone);  // Supabase mein bhi save (restart-safe)

// Next message pe check:
if (wpSessions[phone]?.type === "ledger_select") {
  const choice = parseInt(message) - 1;
  const selected = wpSessions[phone].options[choice];
  // Selected company ka ledger dikhao
  delete wpSessions[phone];
}
```

**Agar ye nahi hota:** Multi-turn conversations impossible — bot har message ko independent treat karta.

---

### 8.4 Router Pattern

**Kya hai:** Message ka type detect karo → sahi handler ko bhejo. Traffic police jaisa — "tu idhar ja, tu udhar ja."

**Kahan:** `server.js` — `executePlan()` routes by intent: DATA_QUERY → SQL, CALENDAR → calendar handler, IGNORE → silent

**Kyu:** Ek endpoint pe alag-alag type ke messages aate hain — sab ko same handle nahi kar sakte.

**Kaise:**
```javascript
// Intent-based routing:
const intent = plan.intent.toUpperCase();

if (intent === "IGNORE" || intent === "GREETING") return { silent: true };
if (intent.startsWith("CALENDAR")) return handleCalendar(intent, message, phone);
if (intent === "DATA_QUERY") return executeSQL(plan.sql);
```

**Agar ye nahi hota:** Giant if-else chain — unmaintainable spaghetti code.

---

### 8.5 Fire-and-Forget Pattern

**Kya hai:** Kuch operations ka result tumhe chahiye nahi — bas karo aur bhool jao. Response wait mat karo.

**Kahan:** `server.js` — message logging, analytics, usage tracking

**Kyu:** User ko reply dena important hai (wait karo). But log save karna important nahi hai user ke liye — background mein ho jaye.

**Kaise:**
```javascript
// Fire-and-forget (no await):
supabase.from("chat_history").insert({ session_id, role: "user", content: message }).then(() => {});
supabase.from("message_logs").insert({ phone, message, direction: "in" }).then(() => {});

// vs. Await (wait for result):
const { data } = await supabase.from("sales").select("*");  // Ye result chahiye
```

**Agar ye nahi hota:** Har logging operation pe 200ms extra wait — user ko slow response.

---

### 8.6 Graceful Error Handling

**Kya hai:** Error aaye toh crash mat karo — user ko friendly message do, internally log karo.

**Kahan:** `server.js` — try/catch blocks har critical operation pe

**Kyu:** Database down ho, OpenAI timeout ho, file corrupt ho — kuch bhi ho sakta hai. Bot crash nahi hona chahiye.

**Kaise:**
```javascript
try {
  const rows = await runSQL(plan.sql);
  await sendWhatsAppReply(phone, formatRows(rows));
} catch(e) {
  console.error("[SQL ERROR]", e.message);  // Internal log
  await sendWhatsAppReply(phone, "⚠️ Query mein dikkat aayi. Dobara try karo.");  // User-friendly
  // Server STILL RUNNING — next request handle karega
}
```

**Agar ye nahi hota:** Ek error → server crash → PM2 restart → 5 sec downtime → sab users affected.

---

## 🟢 LEVEL 9 — DEVOPS & DEPLOYMENT

---

### 9.1 PM2 (Process Manager)

**Kya hai:** Node.js server ko production mein manage karna — auto-restart on crash, log management, monitoring.

**Kahan:** Server `pm2 start server.js --name mis-chatbot` se chalta hai

**Kyu:** `node server.js` se chalao → terminal band karo → server band. PM2 se chalao → background mein chale, crash pe auto-restart, logs save.

**Kaise:**
```bash
pm2 start server.js --name mis-chatbot  # Start
pm2 restart mis-chatbot                  # Restart (after code change)
pm2 logs mis-chatbot --lines 20          # Logs dekho
pm2 status                               # Running hai ya nahi
pm2 stop mis-chatbot                     # Stop
pm2 save                                 # Current state save (reboot ke baad bhi chale)
```

**Agar ye nahi hota:** Server crash → manually restart karna padta. Raat ko crash ho → subah tak down.

---

### 9.2 Tailscale Funnel

**Kya hai:** Local machine ko public internet pe expose karna — free HTTPS URL milta hai.

**Kahan:** `https://saranshs-macbook-air.taile7a14d.ts.net/` → localhost:3000

**Kyu:** WhatsApp webhook ko public URL chahiye. Tumhara server local Mac pe hai. Tailscale Funnel bridge banata hai: Internet → Tailscale → localhost.

**Kaise:**
```bash
tailscale funnel 3000  # Port 3000 ko public karo
# Result: https://saranshs-macbook-air.taile7a14d.ts.net/ → localhost:3000
```

**Agar ye nahi hota:** Cloud server (Railway/AWS) pe deploy karna padta — paid, complex setup.

---

### 9.3 Git (Version Control)

**Kya hai:** Code changes track karna — kab kya change hua, kaun ne kiya, purana version restore karna.

**Kahan:** `.git/` folder — project root mein

**Kyu:** Galat code likh diya → purana version restore karo. Multiple features parallel develop karo. History dekho.

**Kaise:**
```bash
git add server.js helpers/          # Changes stage karo
git commit -m "Fix: casual messages now silent"  # Save snapshot
git log --oneline                    # History dekho
git diff                             # Kya change hua dekho
git checkout -- server.js            # Purana version restore
```

**Agar ye nahi hota:** Code galat ho gaya → koi undo nahi — scratch se likhna padta.

---

### 9.4 caffeinate (Mac Sleep Prevention)

**Kya hai:** Mac ko sone se rokna — server 24/7 chale.

**Kahan:** Terminal mein `caffeinate -s &`

**Kyu:** Mac lid band karo ya idle ho → sleep mode → server band → WhatsApp messages miss.

**Kaise:**
```bash
caffeinate -s &  # Mac kabhi sleep nahi hoga (until manually killed)
```

**Agar ye nahi hota:** Raat ko Mac sleep → subah tak bot dead.

---

## 🛡️ LEVEL 10 — SECURITY

---

### 10.1 Input Validation

**Kya hai:** User se aane wale data ko check karo — valid hai ya malicious.

**Kahan:** `server.js` — message length check, phone validation, SQL validation

**Kyu:** User 1MB ka message bheje → server crash. SQL injection try kare → data leak. Validation se protect.

**Kaise:**
```javascript
// Message length limit:
if (message.length > 5000) return res.status(400).json({ error: "Too long" });

// SQL safety — only SELECT:
if (!/^\s*SELECT/i.test(sql)) throw new Error("Only SELECT allowed");

// Phone validation:
const phone = String(body.phone).replace(/[^0-9]/g, "");
if (phone.length < 10) return res.status(400).json({ error: "Invalid phone" });
```

**Agar ye nahi hota:** Attacker DROP TABLE bheje → pura database delete. Ya 100MB message → server crash.

---

### 10.2 SQL Injection Prevention

**Kya hai:** User malicious SQL inject kare through input — data delete/steal kare.

**Kahan:** `server.js` — `runSQL()` validation, parameterized queries

**Kyu:** User type kare: `'; DROP TABLE sales; --` → agar directly SQL mein dalo → table delete ho jayegi.

**Kaise:**
```javascript
// PROTECTION 1: Only SELECT allowed
function runSQL(sql) {
  if (!/^\s*SELECT/i.test(sql)) throw new Error("Only SELECT allowed");
  // DROP, DELETE, UPDATE, INSERT — sab blocked
}

// PROTECTION 2: AI generates SQL (user input directly SQL mein nahi jaata)
// User: "pansari ki sales"
// AI generates: SELECT * FROM sales WHERE company_name ILIKE '%pansari%'
// User ka raw text SQL mein nahi hai — AI ne interpret kiya

// PROTECTION 3: Supabase parameterized queries
const { data } = await supabase.from("sales").select("*").ilike("company_name", "%pansari%");
// Supabase internally parameterize karta hai — injection impossible
```

**Agar ye nahi hota:** Koi bhi tumhara database delete kar sakta tha ek message se.

---

### 10.3 XSS Prevention

**Kya hai:** Cross-Site Scripting — user malicious JavaScript inject kare jo dusre users ke browser mein chale.

**Kahan:** `server.js` — `sanitize()` function for tenant names, user inputs

**Kyu:** Tenant name mein `<script>alert('hacked')</script>` daal de → admin panel mein ye execute ho → cookie steal.

**Kaise:**
```javascript
function sanitize(str) {
  return String(str || "").replace(/[<>]/g, "").slice(0, 500);
}

// Usage:
const tenantName = sanitize(req.body.business_name);
// "<script>alert(1)</script>" → "scriptalert(1)/script" (harmless)
```

**Agar ye nahi hota:** Admin panel open karo → attacker ka script chale → session hijack.

---

### 10.4 Environment Security

**Kya hai:** Secrets (API keys, passwords) ko safe rakhna — code mein nahi, logs mein nahi, git mein nahi.

**Kahan:** `.env` file (gitignored), `.gitignore` mein sensitive files listed

**Kyu:** API key leak → koi bhi tumhare naam pe ₹50,000 ka bill generate kar sakta hai.

**Kaise:**
```bash
# .gitignore:
.env
*.json          # Service account keys
node_modules/

# Logs mein keys nahi dikhana:
console.log("OpenAI key exists:", !!process.env.OPENAI_API_KEY);  # ✅ Safe
console.log("Key:", process.env.OPENAI_API_KEY);  # ❌ NEVER DO THIS
```

**Agar ye nahi hota:** GitHub pe push → bots scan karte hain → 5 min mein key compromised → bill.

---

### 10.5 SSRF Prevention

**Kya hai:** Server-Side Request Forgery — attacker tumhare server se internal URLs hit karwaye.

**Kahan:** `server.js` — URL validation in sheet fetch, only Google domains allowed

**Kyu:** Attacker sheet URL mein `http://localhost:5432` de → tumhara server apne database ko expose kar de.

**Kaise:**
```javascript
// Only allow Google Sheet URLs:
if (!url.includes("docs.google.com/spreadsheets")) {
  return res.status(400).json({ error: "Only Google Sheet URLs allowed" });
}
```

**Agar ye nahi hota:** Attacker internal services access kar sakta — database, admin panels, etc.

---

## 📌 QUICK REFERENCE — "Ye concept kahan use hua hai"

| Concept | File | Line/Function | Purpose |
|---------|------|---------------|---------|
| Express server | server.js | Line 1-40 | Web server setup |
| Webhook | server.js | `app.post("/whatsapp")` | WhatsApp messages receive |
| OpenAI API | server.js | `openai()` function | AI text generation |
| System Prompt | server.js | `buildSystemPrompt()` | AI ko instructions |
| SQL execution | server.js | `runSQL()` | Database query |
| Supabase client | server.js | `createClient()` | Database connection |
| Session state | server.js | `wpSessions` | Multi-turn conversations |
| Rate limiting | server.js | `rateLimit()` | Spam protection |
| WhatsApp send | helpers/whatsapp.js | `sendWhatsAppReply()` | Reply bhejne |
| Media upload | helpers/whatsapp.js | `sendWhatsAppMedia()` | PDF/image bhejne |
| Sheet sync | helpers/sync.js | `syncAllSheets()` | Google Sheet → Supabase |
| Tenant routing | helpers/tenant-router.js | `handleTenantQuery()` | Multi-tenant SaaS |
| Schema detect | helpers/sheets.js | `detectSchema()` | Column types identify |
| Calendar | server.js | `handleCalendarIntent()` | Meeting booking |
| PDF generation | server.js | `generateDataPDF()` | Data → PDF file |
| Access control | server.js | `checkAccess()` | User permissions |
| Email | helpers/notifications.js | `sendEmail()` | Gmail notifications |
| Caching | server.js | `queryCache` Map | Repeated query optimization |
| Environment vars | .env | `process.env.*` | Secrets storage |
| PM2 | CLI | `pm2 start/restart` | Server management |
| Tailscale | CLI | `tailscale funnel` | Public HTTPS URL |

---

## 🟠 TENANT UPGRADE — Phase 1 Concepts

---

### T1.1 Intent Detection (Message Classification)

**Kya hai:** User ka message aane pe pehle classify karo — ye greeting hai, off-topic hai, ya actual data query hai. Bina classification ke har message pe expensive AI call hoti hai.

**Kahan:** `helpers/tenant-router.js` — `detectIntent()` function

**Kyu:** Agar user "hi" bole toh SQL generate karna waste hai. Pehle intent detect karo, phir decide karo kya karna hai.

**Kaise:**
```javascript
function detectIntent(query) {
  const q = query.trim().toLowerCase();
  // Greetings — friendly reply
  if (/^(hi+|hello|namaste)[\s?!.]*$/i.test(q)) {
    return { intent: 'GREETING', greeting_reply: '🙏 Namaste! Apne data ke baare mein poocho!' };
  }
  // Off-topic — silent ignore
  if (/^(kaise\s*h[oa]|haan|ok)[\s?!.]*$/i.test(q)) {
    return { intent: 'IGNORE' };
  }
  // Too short — ask for details
  if (q.length < 4) return { intent: 'CLARIFY_NEEDED' };
  return { intent: 'DATA_QUERY' };
}
```

**Agar ye nahi hota:** "Hi" pe bhi AI call hoti, 3 sec waste, aur user ko weird SQL error milta.

---

### T1.2 CLARIFY Support (AI Asks Follow-up)

**Kya hai:** Jab user ka question ambiguous ho (multiple meanings), toh AI directly SQL generate karne ki jagah ek follow-up question return karta hai.

**Kahan:** `helpers/tenant-router.js` — `generateSQL()` prompt mein CLARIFY option

**Kyu:** "Sharma ka data" — kaunsa Sharma? Sales wala ya expenses wala? AI ko option diya ki wo pooch sake.

**Kaise:**
```javascript
// AI prompt mein:
// "If question is ambiguous → respond: CLARIFY: <follow-up question>"

// Handler mein:
const sql = await generateSQL(tenant, query);
if (sql.startsWith('CLARIFY:')) {
  const clarifyMsg = sql.replace('CLARIFY:', '').trim();
  return { reply: `🤔 ${clarifyMsg}`, tenant };
}
```

**Agar ye nahi hota:** Ambiguous queries pe wrong SQL banta, wrong data milta, user confused hota.

---

### T1.3 Tiered Response Formatting (Row Count Based)

**Kya hai:** Response format rows ki count pe depend karta hai — 1 row = direct answer, 2-10 = emoji list, 11-20 = AI format, >20 = summary.

**Kahan:** `helpers/tenant-router.js` — `formatResults()` function

**Kyu:** 1 row ke liye AI call waste hai (direct format karo). 5 rows ke liye emoji list clean dikhta hai. 50 rows ke liye summary chahiye warna WhatsApp message too long.

**Kaise:**
```javascript
async function formatResults(query, rows) {
  // 1 row, few cols → direct (no AI)
  if (rows.length === 1 && Object.keys(rows[0]).length <= 4) {
    return `📊 *Total:* ₹${num.toLocaleString('en-IN')} (₹${(num/10000000).toFixed(2)} Cr)`;
  }
  // 2-10 rows → emoji numbered list (no AI)
  if (rows.length <= 10) {
    const emojis = ['1️⃣', '2️⃣', '3️⃣', ...];
    return rows.map((row, i) => `${emojis[i]} ${values.join(' — ')}`).join('\n');
  }
  // 11-20 → AI formats
  if (rows.length <= 20) return await aiFormat(query, rows);
  // >20 → top 15 + summary note
  return `${await aiFormat(query, rows.slice(0,15))}\n📌 Total ${rows.length} entries...`;
}
```

**Agar ye nahi hota:** Har response pe AI call = slow + expensive. Ya sab same format = ugly.

---

### T1.4 Indian Number Formatting (Cr/Lakh Notation)

**Kya hai:** Amounts ko Indian format mein dikhana — ₹ symbol, Indian commas (1,23,45,678), aur bade numbers ke liye Cr/L suffix.

**Kahan:** `helpers/tenant-router.js` — `formatResults()` mein amount display

**Kyu:** User ko "24415055" samajh nahi aata. "₹2.44 Cr" instantly samajh aata hai.

**Kaise:**
```javascript
const num = parseFloat(String(v));
if (Math.abs(num) >= 10000000) return `₹${num.toLocaleString('en-IN')} (₹${(num/10000000).toFixed(2)} Cr)`;
if (Math.abs(num) >= 100000) return `₹${num.toLocaleString('en-IN')} (₹${(num/100000).toFixed(2)} L)`;
if (Math.abs(num) >= 1000) return `₹${num.toLocaleString('en-IN')}`;
```

**Agar ye nahi hota:** User ko raw numbers milte — "24415055.82" — koi samjhega nahi.

---

### T1.5 Hinglish-to-SQL Mapping (AI Prompt Engineering)

**Kya hai:** AI prompt mein explicitly batana ki Hindi/Hinglish words ka SQL mein kya matlab hai. User "kitni" bolega, AI ko "SUM" samajhna chahiye.

**Kahan:** `helpers/tenant-router.js` — `generateSQL()` prompt mein SMART SEARCH RULES section

**Kyu:** GPT English mein trained hai. "Sabse zyada" ka "ORDER BY DESC" se mapping explicitly batani padti hai.

**Kaise:**
```javascript
// Prompt mein:
`═══ SMART SEARCH RULES ═══
HINGLISH MAPPING:
- "kitni/kitna/total" → SUM/COUNT
- "sabse zyada/highest/top" → ORDER BY DESC LIMIT
- "kaun/kiska" → GROUP BY person column
- "pichle/last" → recent date filter
- "list/batao/dikhao" → SELECT with LIMIT`
```

**Agar ye nahi hota:** "Sabse zyada sales kiska hai" pe AI confused hota — wrong column, wrong ORDER.

---

---

## 🟠 TENANT UPGRADE — Phase 2.5 Concepts

---

### T2.1 HTML Scraping for Tab Discovery (Regex on Dynamic Pages)

**Kya hai:** Google Sheets ka htmlview page mein JavaScript code hota hai jo tab names + gids contain karta hai. Hum regex se extract karte hain.

**Kahan:** `helpers/sheets.js` — `discoverTabs()` function

**Kyu:** Google Sheets API key chahiye tab names ke liye. But htmlview page public hai — usme `items.push({name: "SALES", gid: "0"})` pattern hota hai jo free mein tab info deta hai.

**Kaise:**
```javascript
async function discoverTabs(sheetId) {
  const html = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`).then(r => r.text());
  const tabs = [];
  const regex = /items\.push\(\{name:\s*"([^"]+)"[^}]*gid:\s*"(\d+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    tabs.push({ name: match[1], gid: match[2] });
  }
  return tabs; // [{name: "SALES", gid: "0"}, {name: "EXPENSES", gid: "1821314686"}]
}
```

**Agar ye nahi hota:** Sirf gid=0 (first tab) sync hota, baaki tabs ka data miss hota.

---

### T2.2 Multi-Table Schema Design (JSONB per-table)

**Kya hai:** Ek tenant ke paas multiple tables ho sakti hain (SALES, EXPENSES, LEDGER). Schema mein har table ka apna column set hota hai.

**Kahan:** `helpers/sheets.js` — `detectSchema()` returns `{tables: [{name, gid, row_count, columns}]}`

**Kyu:** Pehle flat schema tha `{columns: [...]}` — sirf ek table support karta tha. Ab multi-table support chahiye jaise MIS ke 8 tables hain.

**Kaise:**
```javascript
// Old schema (single table):
{ columns: [{name: "Date", type: "date"}, ...] }

// New schema (multi-table):
{
  tables: [
    { name: "SALES", gid: "0", row_count: 1316, columns: [{name: "Date", type: "date"}, ...] },
    { name: "EXPENSES", gid: "1821314686", row_count: 1807, columns: [...] }
  ],
  total_rows: 9071
}
```

**Agar ye nahi hota:** AI ko pata nahi hota ki kaunsa column kaunsi table mein hai — wrong queries generate hoti.

---

### T2.3 Returning User Detection (Phone-First Onboarding)

**Kya hai:** Onboarding mein pehle phone check karo — agar already registered hai toh "Welcome Back" dikhao with options (add sheet / new DB).

**Kahan:** `server.js` — `POST /api/tenant/check-phone`, `public/onboard.html` — Step 0

**Kyu:** Agar user pehle se registered hai aur dobara onboard kare toh duplicate tenant ban jaata. Phone-first check se returning users ko identify karte hain.

**Kaise:**
```javascript
// Server endpoint:
app.post('/api/tenant/check-phone', async (req, res) => {
  const { data: tenant } = await supabase.from('tenants').select('*').eq('phone', phone).single();
  if (tenant) return res.json({ exists: true, tenant });
  // Also check tenant_phones (user might be added by someone else)
  const { data: mapping } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', phone).single();
  // ...
});

// Frontend: phone first → check → show appropriate UI
```

**Agar ye nahi hota:** Same phone se 5 baar register karne pe 5 duplicate tenants ban jaate.

---

### T2.4 Schema Merging (Add to Existing DB)

**Kya hai:** Returning user jab naya sheet add kare toh existing schema mein naye tables merge karo — purane tables intact rahein.

**Kahan:** `server.js` — register endpoint `add_to_existing` mode

**Kyu:** User ke paas SALES sheet hai, ab EXPENSES bhi add karna chahta hai. Purana data delete nahi hona chahiye.

**Kaise:**
```javascript
if (add_to_existing && tenant_id) {
  const oldSchema = existing.schema_json || { tables: [] };
  const mergedTables = [...(oldSchema.tables || [])];
  for (const newTable of newTables) {
    const idx = mergedTables.findIndex(t => t.name === newTable.name);
    if (idx >= 0) mergedTables[idx] = newTable; // replace if same name
    else mergedTables.push(newTable);            // add new
  }
}
```

**Agar ye nahi hota:** Naya sheet add karne pe purana data/schema overwrite ho jaata.

---

### T2.5 table_name Column (Multi-Table Filtering in SQL)

**Kya hai:** `tenant_data` table mein `table_name` column store karta hai ki ye row kaunsi table se hai (SALES, EXPENSES, etc). AI queries mein `WHERE table_name = 'SALES'` filter lagata hai.

**Kahan:** `migrations/003_multi_table_tenants.sql`, `helpers/sheets.js` — sync, `helpers/tenant-router.js` — AI prompt

**Kyu:** Ek hi `tenant_data` table mein sab data hai. Bina table_name ke AI ko pata nahi ki SALES ka row hai ya EXPENSES ka.

**Kaise:**
```sql
-- Migration:
ALTER TABLE tenant_data ADD COLUMN IF NOT EXISTS table_name TEXT;
CREATE INDEX IF NOT EXISTS idx_tenant_data_table ON tenant_data(tenant_id, table_name);

-- AI prompt mein:
-- "To query SALES data: WHERE tenant_id = '...' AND table_name = 'SALES'"
```

**Agar ye nahi hota:** "Total sales kitni hai" pe expenses bhi count ho jaati — wrong answers.

---

---

## 🟠 TENANT UPGRADE — Phase 2 Concepts

---

### T3.1 QuickChart.io (Server-Side Chart Generation)

**Kya hai:** Chart banana bina browser ke — URL mein chart config encode karo, QuickChart.io PNG image return karta hai. No canvas, no puppeteer needed.

**Kahan:** `helpers/tenant-router.js` — `buildChartURL()` + `downloadChart()`

**Kyu:** WhatsApp pe chart bhejne ke liye image chahiye. Browser-based charting server pe possible nahi. QuickChart.io free API hai jo URL se PNG generate karta hai.

**Kaise:**
```javascript
function buildChartURL(rows, query) {
  const chartDef = { type: 'bar', data: { labels, datasets: [{ data: values }] }, options: {...} };
  return `https://quickchart.io/chart?w=900&h=500&c=${encodeURIComponent(JSON.stringify(chartDef))}`;
}
async function downloadChart(url) {
  const buffer = Buffer.from(await fetch(url).then(r => r.arrayBuffer()));
  const tmpPath = path.join(os.tmpdir(), `chart_${Date.now()}.png`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}
```

**Agar ye nahi hota:** Chart generate karne ke liye Puppeteer install karna padta (500MB+), ya client-side rendering — WhatsApp pe bhej nahi sakte.

---

### T3.2 Query Mode Detection (Pre-SQL Classification)

**Kya hai:** SQL generate karne se pehle detect karo ki user chart chahta hai, images, pivot, ya normal data. Mode ke basis pe SQL prompt alag hota hai.

**Kahan:** `helpers/tenant-router.js` — `detectQueryMode()`

**Kyu:** "Bar chart dikhao" aur "total batao" dono data queries hain but output format alag hai. Pehle mode detect karo, phir accordingly SQL generate karo aur response format karo.

**Kaise:**
```javascript
function detectQueryMode(query) {
  if (/chart|graph|visual|bar|pie|line/i.test(query)) return 'chart';
  if (/image|photo|tasveer|pic/i.test(query)) return 'images';
  if (/month[\s-]*wise|breakdown|pivot/i.test(query)) return 'pivot';
  return 'data';
}
// Then in generateSQL: add chart/pivot specific instructions to AI prompt
```

**Agar ye nahi hota:** Sab queries same format mein answer hoti — chart request pe bhi text list milti.

---

### T3.3 Media Return Pattern (Handler → Caller Separation)

**Kya hai:** tenant-router.js media generate karta hai (chart PNG, PDF, CSV) but WhatsApp sending server.js karta hai. Router sirf `{reply, media: {type, path}}` return karta hai.

**Kahan:** `helpers/tenant-router.js` returns media object, `server.js` handles sending

**Kyu:** Separation of concerns — router ko WhatsApp API details nahi pata honi chahiye. Wo sirf data process kare, server.js delivery handle kare.

**Kaise:**
```javascript
// tenant-router.js:
return { reply: '📊 Chart ready', media: { type: 'image', path: '/tmp/chart.png' }, tenant };

// server.js:
if (tenantResult.media) {
  if (m.type === 'images') { /* loop and send via /meta/sendMessage */ }
  else if (m.path) { await sendWhatsAppMedia(phone, m.path, reply, m.type); }
}
```

**Agar ye nahi hota:** Router mein WhatsApp API code hota — tightly coupled, test karna mushkil.

---

### T3.4 Auto Column Type Detection for Charts

**Kya hai:** Chart ke liye automatically detect karo ki kaunsa column label hai (text) aur kaunsa value hai (number). User ko specify nahi karna padta.

**Kahan:** `helpers/tenant-router.js` — `buildChartURL()` mein label/value detection

**Kyu:** User sirf "bar chart dikhao" bolega — usse pata nahi ki label_col kya hai. Code automatically first text column = label, first numeric column = value detect karta hai.

**Kaise:**
```javascript
const keys = Object.keys(rows[0]);
const labelCol = keys.find(k => isNaN(parseFloat(rows[0][k]))) || keys[0];
const valueCol = keys.find(k => k !== labelCol && !isNaN(parseFloat(rows[0][k]))) || keys[1];
```

**Agar ye nahi hota:** User ko har baar "label_col=name, value_col=amount" specify karna padta.

---

### T3.5 Tiered Export (Row Count → Format Decision)

**Kya hai:** Result size ke basis pe automatically best format choose karo: <20 rows = text, 20-99 = PDF, 100+ = CSV.

**Kahan:** `helpers/tenant-router.js` — main handler mein row count checks

**Kyu:** 200 rows WhatsApp text mein nahi bhej sakte (too long). PDF 100 rows tak readable hai. 500+ rows ke liye CSV best hai (Excel mein open karo).

**Kaise:**
```javascript
if (rows.length >= 100) {
  const csvPath = generateCSV(rows);
  return { reply: '📎 CSV bhej raha hoon', media: { type: 'document', path: csvPath } };
}
if (rows.length >= 20) {
  const pdfPath = await generatePDF(rows, title);
  return { reply: '📄 PDF bhej raha hoon', media: { type: 'document', path: pdfPath } };
}
// else: text format
```

**Agar ye nahi hota:** 500 rows ka text message — WhatsApp crash ya truncate kar deta.

---

---

## 🟠 TENANT UPGRADE — Phase 3 Concepts

---

### T4.1 Multi-DB Session State (In-Memory DB Selection)

**Kya hai:** Jab user ke paas 2+ databases hain, ek baar select karne ke baad 30 min tak wahi DB use hota hai. Session Map mein store hota hai.

**Kahan:** `helpers/tenant-router.js` — `dbSessions` Map, `getSelectedDB()`, `setSelectedDB()`

**Kyu:** Har message pe "Kaunsa DB?" poochna annoying hai. Ek baar select karo, 30 min tak same DB se answers aayenge.

**Kaise:**
```javascript
const dbSessions = new Map(); // phone → { selectedTenantId, expiresAt }
const DB_SESSION_TTL = 30 * 60 * 1000;

function getSelectedDB(phone) {
  const session = dbSessions.get(phone);
  if (session && Date.now() < session.expiresAt) return session.selectedTenantId;
  dbSessions.delete(phone);
  return null;
}
function setSelectedDB(phone, tenantId) {
  dbSessions.set(phone, { selectedTenantId: tenantId, expiresAt: Date.now() + DB_SESSION_TTL });
}
```

**Agar ye nahi hota:** Har query pe "Kaunsa DB?" poochna padta — terrible UX.

---

### T4.2 Smart Auto-Routing (Query → DB Matching)

**Kya hai:** User ka query analyze karo — agar kisi DB ka naam ya table name mention hai toh automatically wahi DB select ho jaye.

**Kahan:** `helpers/tenant-router.js` — `autoRouteQuery()`

**Kyu:** User bole "sales data dikhao" — agar ek DB mein SALES table hai toh directly wahi query karo, poochne ki zaroorat nahi.

**Kaise:**
```javascript
function autoRouteQuery(query, dbs) {
  const q = query.toLowerCase();
  // Check DB name/alias in query
  for (const db of dbs) {
    if (q.includes(db.alias.toLowerCase().split(' ')[0])) return db;
  }
  // Check table names
  for (const db of dbs) {
    for (const t of db.schema_json?.tables || []) {
      if (q.includes(t.name.toLowerCase())) return db;
    }
  }
  return null; // Can't determine → ask user
}
```

**Agar ye nahi hota:** 2 DB wale user ko har baar manually select karna padta — even when query clearly ek DB ke liye hai.

---

### T4.3 Pending Selection Pattern (Numbered Choice)

**Kya hai:** User ko numbered list dikhao, wo number bheje toh uska choice process karo. "Pending" state Map mein store hota hai.

**Kahan:** `helpers/tenant-router.js` — `dbSessions` with `${phone}_pending` key

**Kyu:** WhatsApp mein buttons nahi hain (plain text API). Numbered list + number reply = simplest selection UX.

**Kaise:**
```javascript
// Show options:
dbSessions.set(`${phone}_pending`, dbs); // Store pending choices
return { reply: "1️⃣ Sharma Store\n2️⃣ Office Data\n\nNumber bhejo 👆" };

// When user replies "1":
if (intent === 'DB_SELECT') {
  const pending = dbSessions.get(`${phone}_pending`);
  const selected = pending[choice - 1];
  setSelectedDB(phone, selected.id);
  dbSessions.delete(`${phone}_pending`);
}
```

**Agar ye nahi hota:** User ko exact DB name type karna padta — typos, confusion.

---

### T4.4 Graceful Fallthrough (Tenant → MIS Main)

**Kya hai:** Agar user kisi tenant DB se linked nahi hai toh `handleTenantQuery` returns `null` → server.js MIS main chatbot flow continue karta hai.

**Kahan:** `helpers/tenant-router.js` — `handleTenantQuery()` first line, `server.js` — if(tenantResult) check

**Kyu:** Same WhatsApp number pe dono systems kaam karte hain. Tenant users ko tenant data milta hai, non-tenant users ko MIS main data.

**Kaise:**
```javascript
// tenant-router.js:
async function handleTenantQuery(supabase, phone, query) {
  const dbs = await getUserDatabases(supabase, phone);
  if (!dbs.length) return null; // ← Not a tenant → fall through
  // ... process tenant query
}

// server.js:
const tenantResult = await handleTenantQuery(supabase, phone, query);
if (tenantResult) { /* handle tenant response */ return; }
// ... continue with MIS main chatbot flow
```

**Agar ye nahi hota:** Tenant system MIS main chatbot ko block kar deta — non-tenant users ko koi response nahi milta.

---

---

## 🟠 TENANT UPGRADE — Phase 4 Concepts

---

### T5.1 Schema-Based Feature Detection (Ledger Auto-Detect)

**Kya hai:** Schema columns analyze karke automatically detect karo ki ye table ledger hai ya nahi — bina user ko bataye.

**Kahan:** `helpers/tenant-router.js` — `detectLedgerTable()`

**Kyu:** User ko nahi pata ki uska data "ledger type" hai. System automatically detect kare ki debit/credit columns hain → ledger features enable karo.

**Kaise:**
```javascript
function detectLedgerTable(schema) {
  for (const t of schema.tables) {
    const colNames = t.columns.map(c => c.name.toLowerCase());
    const hasDebit = colNames.some(c => /debit|dr/i.test(c));
    const hasCredit = colNames.some(c => /credit|cr/i.test(c));
    const hasBalance = colNames.some(c => /balance|bal/i.test(c));
    if ((hasDebit || hasCredit) && hasBalance) return t; // This is a ledger!
  }
  return null;
}
```

**Agar ye nahi hota:** User ko manually batana padta "mera data ledger hai" — bad UX.

---

### T5.2 Fuzzy Name Search (Scoring Algorithm)

**Kya hai:** User partial/misspelled naam de toh bhi match karo. Exact match = 100 score, contains = 80, word match = 30 per word. Top 8 return karo.

**Kahan:** `helpers/tenant-router.js` — `fuzzyNameSearch()`

**Kyu:** User "sharma" bolega but DB mein "Sharma Enterprises Pvt Ltd" hai. Exact match fail hoga, fuzzy match success.

**Kaise:**
```javascript
const scored = allNames.map(name => {
  const lower = name.toLowerCase();
  let score = 0;
  if (lower === searchTerm.toLowerCase()) score = 100;      // exact
  else if (lower.includes(searchTerm.toLowerCase())) score = 80; // contains
  else { for (const w of words) { if (lower.includes(w)) score += 30; } } // word match
  return { name, score };
}).filter(m => m.score > 0).sort((a, b) => b.score - a.score);
```

**Agar ye nahi hota:** Sirf exact match kaam karta — "sharma" se "Sharma Trading Co" nahi milta.

---

### T5.3 Multi-Step Disambiguation (Ledger Selection Flow)

**Kya hai:** Fuzzy search se multiple matches aayein toh numbered list dikhao → user number bheje → uska ledger generate karo. State `dbSessions` mein store hota hai.

**Kahan:** `helpers/tenant-router.js` — ledger mode + DB_SELECT intent handler

**Kyu:** "Sharma" se 3 companies match hoti hain — user ko choose karne do ki kaunsi chahiye.

**Kaise:**
```javascript
// Step 1: Multiple matches found
if (matches.length > 1) {
  dbSessions.set(`${phone}_ledger_pending`, { matches, tenant, ledgerCols });
  return { reply: "1. Sharma Enterprises\n2. Sharma Trading\n\nNumber bhejo" };
}

// Step 2: User sends "1"
if (intent === 'DB_SELECT') {
  const pending = dbSessions.get(`${phone}_ledger_pending`);
  if (pending) {
    const partyName = pending.matches[choice - 1];
    // Generate ledger PDF for selected party
  }
}
```

**Agar ye nahi hota:** System randomly pehla match pick karta — wrong party ka ledger milta.

---

---

## 🟠 TENANT UPGRADE — Phase 5 Concepts

---

### T6.1 OAuth2 Flow (User Consent → Refresh Token)

**Kya hai:** User apna Google Calendar connect karta hai. Server Google pe redirect karta hai → user consent deta hai → Google code bhejta hai → server code exchange karke refresh_token store karta hai.

**Kahan:** `helpers/tenant-calendar.js` — `getAuthURL()`, `exchangeCode()`. `server.js` — `/api/tenant/calendar/auth`, `/api/tenant/calendar/callback`

**Kyu:** Service account sirf owner ke calendar pe kaam karta hai. Tenants ke liye OAuth2 chahiye — har user apna calendar connect kare.

**Kaise:**
```javascript
// Step 1: Generate auth URL
function getAuthURL(tenantId) {
  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  return client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, state: tenantId });
}

// Step 2: Callback — exchange code for tokens
app.get('/api/tenant/calendar/callback', async (req, res) => {
  const { code, state: tenantId } = req.query;
  const tokens = await exchangeCode(code); // { refresh_token, access_token }
  await supabase.from('tenants').update({ calendar_refresh_token: tokens.refresh_token }).eq('id', tenantId);
});

// Step 3: Use refresh_token for API calls
function getCalendarClient(refreshToken) {
  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: 'v3', auth: client });
}
```

**Agar ye nahi hota:** Har tenant ka calendar access karne ke liye manually service account share karna padta — scalable nahi.

---

### T6.2 State Parameter in OAuth (Tenant ID Passthrough)

**Kya hai:** OAuth redirect mein `state` parameter use karte hain tenant_id pass karne ke liye. Google callback mein same state wapas aata hai — isse pata chalta hai kaunse tenant ka token store karna hai.

**Kahan:** `helpers/tenant-calendar.js` — `getAuthURL(tenantId)` passes state, callback reads `req.query.state`

**Kyu:** OAuth callback ek generic URL hai. Bina state ke pata nahi chalega ki ye token kaunse tenant ka hai.

**Kaise:**
```javascript
// Auth URL mein state = tenantId
client.generateAuthUrl({ ..., state: tenantId });

// Callback mein state wapas milta hai
app.get('/callback', (req, res) => {
  const tenantId = req.query.state; // ← ye wahi tenantId hai
  // Store token for this tenant
});
```

**Agar ye nahi hota:** Callback pe pata nahi chalta ki token kiske liye hai — wrong tenant mein store ho sakta.

---

### T6.3 Dynamic Calendar Operations (Per-Tenant Credentials)

**Kya hai:** Har calendar operation (create/get/delete) mein tenant ka refresh_token + calendar_id pass karte hain. Koi hardcoded calendar nahi.

**Kahan:** `helpers/tenant-calendar.js` — all functions take `refreshToken, calendarId` as first params

**Kyu:** Har tenant ka apna calendar hai. Same function different credentials ke saath kaam kare.

**Kaise:**
```javascript
// Same function, different tenant's calendar
await createEvent(tenant1.refresh_token, tenant1.calendar_id, { title: 'Meeting' });
await createEvent(tenant2.refresh_token, tenant2.calendar_id, { title: 'Call' });
// Each creates event on THEIR OWN calendar
```

**Agar ye nahi hota:** Sab tenants ki meetings ek hi calendar pe ban jaati — privacy breach.

---

## 🟠 PHASE 10 — SELF-HEALING HARDENING (2026-05-25)

Goal: Chatbot ko itna resilient banao ki 85%+ errors khud-ba-khud recover ho jaayein. Ek single helper file (`helpers/self-heal.js`, 507 lines) — chhe layers — zero new dependencies.

---

### S10.1 Levenshtein Distance (Fuzzy Column Resolution)

**Kya hai:** Do strings kitni alag hain — exact number of edits (insert / delete / substitute) needed to convert one to the other. "amount" vs "amout" = 1 edit (delete 'n'). Pure DP, runs in O(m·n).

**Kahan:** `helpers/self-heal.js` — `levenshtein()` + `findClosestColumn()` + `resolveColumnError()`

**Kyu:** AI sometimes hallucinates a column name (`total_price` instead of `amount`, `date` instead of `c_date`). Postgres throws `column "X" does not exist`. Old behavior: re-prompt AI from scratch (expensive, slow, unreliable). New behavior: extract bad name from error, find nearest real column via Levenshtein, rewrite SQL, retry — saves an AI roundtrip.

**Kaise:**
```javascript
// helpers/self-heal.js
function levenshtein(a, b) {
  // Iterative DP — 2 rows of memory instead of full matrix
  let prev = [...Array(a.length + 1).keys()];
  let curr = new Array(a.length + 1);
  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      curr[i] = Math.min(curr[i-1]+1, prev[i]+1, prev[i-1]+cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

// Substring boost: "amount" inside "with_gst_amount" should beat raw distance
function findClosestColumn(bad, candidates) {
  let best = null;
  for (const c of candidates) {
    let dist = levenshtein(bad.toLowerCase(), c.toLowerCase());
    if (c.includes(bad) || bad.includes(c)) dist -= Math.min(bad.length, c.length) / 2;
    if (!best || dist < best.distance) best = { name: c, distance: dist };
  }
  return best;
}
```

**Live test results against MIS Main schema:**
| Bad column | Fixed to | Score |
|-----------|----------|-------|
| `amt` | `amount` | 0.50 |
| `party` | `party_name` | 0.85 |
| `date` | `c_date` | 1.00 |
| `t.partyname` (prefix stripped) | `party_name` | 0.90 |
| `company_naem` (real typo) | `company_name` | 0.83 — SQL re-executed live ✓ |
| `random_blah` | bailed (no close match) | — |
| `salesman` | bailed (score < 0.5) | — |

**Agar ye nahi hota:** Every column typo would cost an extra AI re-prompt (~1.5s + tokens). On schema-drift (new col not yet in metadata), system would loop until 3rd attempt.

---

### S10.2 Schema Drift Detection (Diff PG vs Sheet)

**Kya hai:** Har sync pe compare karo — sheet mein kya columns hain vs database mein actually kya columns hain — aur log karo kya badla.

**Kahan:** `helpers/self-heal.js` → `detectSchemaDrift()`. Wired in `helpers/sheets.js` → `syncSheetToProperTables()`.

**Kyu:** User Google Sheet mein column add karta hai → ALTER TABLE ADD COLUMN silently runs → log mein kuch nahi dikhta → debugging nightmare. Aur removed columns? Old code unhe ignore karta tha (kept stale data). Type drift (TEXT → NUMERIC)? Detected nowhere.

**Kaise:**
```javascript
function detectSchemaDrift(pgColumns, sheetColumns, previousMeta) {
  const pgLower   = new Set(pgColumns.map(c => c.toLowerCase()));
  const sheetLower = new Set(sheetColumns.map(c => c.pg_name.toLowerCase()));
  const added     = sheetColumns.filter(c => !pgLower.has(c.pg_name.toLowerCase()));
  const removed   = pgColumns.filter(c => !sheetLower.has(c.toLowerCase()));
  const typeChanged = []; // diff against previous metadata snapshot
  // ...
  return { added, removed, typeChanged, summary: `+${added.length} -${removed.length} ~${typeChanged.length}` };
}
```

**Sample log output (when sheet adds a column):**
```
[SCHEMA-DRIFT] SALES → tenant_xx_sales: schema drift: +1 added
  + added: customer_email (TEXT/text)
[SYNC P6] SALES → tenant_xx_sales: 804/804 rows
```

**Design choice:** Removed columns are LOGGED but NOT dropped. Reason: data preservation. Sheet author may have just renamed the header; we don't want to silently lose historical column values.

**Agar ye nahi hota:** Every sheet schema change is a black box. Bugs would manifest later in queries with no clear cause.

---

### S10.3 SQL Relaxation (Zero-Row Rescue)

**Kya hai:** Jab user ka query 0 rows return kare, AUTOMATICALLY simpler variants try karo — date filter drop, longest ILIKE shorten, dono combine.

**Kahan:** `helpers/self-heal.js` → `relaxSQL(sql)`. Wired in tenant-router 0-row branch + server.js MIS Main 0-row branch (both AFTER pg_trgm fuzzy fallback).

**Kyu:** User asks "August 2024 mein BHEL ki sales kya thi?" but data only has 2026 entries. Old behavior: "Koi data nahi mila" — user has to guess what's wrong. New behavior: drop the date filter, find that BHEL has data in 2026, suggest the entity name back to user.

**Kaise (3 progressive variants):**
```javascript
function relaxSQL(sql) {
  const variants = [];
  // L1: drop all date predicates
  let v1 = sql.replace(/\s+AND\s+\w*date\w*\s+ILIKE\s+'[^']*'/gi, '')
              .replace(/\s+AND\s+\w*_actual\b[^)]*?(?=\s+AND|\s+GROUP|...)/gi, '');
  if (v1 !== sql) variants.push(v1);

  // L2: shorten longest ILIKE term to first word
  // "party_name ILIKE '%Sanjay Aggarwal%'" → "party_name ILIKE '%Sanjay%'"
  const ilikeRe = /(\w+)\s+ILIKE\s+'%([^%']+)%'/gi;
  let longest = null;
  for (const m of [...sql.matchAll(ilikeRe)]) {
    if (m[2].includes(' ') && (!longest || m[2].length > longest.term.length)) longest = { full: m[0], term: m[2], col: m[1] };
  }
  if (longest) {
    const firstWord = longest.term.split(' ')[0];
    variants.push(sql.replace(longest.full, `${longest.col} ILIKE '%${firstWord}%'`));
  }
  // L3: combine L1 + L2
  return variants;
}
```

**Order matters:** Caller tries variants in order, stops on first one that returns rows. Most-specific filter (date) is dropped first because it's the most common over-restriction.

**Agar ye nahi hota:** Many "no data" replies are actually filter-too-tight, not data-doesn't-exist. User keeps trying variations until they hit the right phrasing.

---

### S10.4 Result Validation (All-NULL & Single-Row Heuristics)

**Kya hai:** SQL successful tha, par result actually meaningful hai ya nahi — heuristics se check karo.

**Kahan:** `helpers/self-heal.js` → `validateResult(rows, query)`. Wired in tenant-router (treats single-row-all-NULL as 0-row → triggers fuzzy/relax recovery).

**Kyu:** PostgreSQL `SUM(amount) WHERE party_name='nonexistent'` returns ONE row with NULL — not zero rows. Old code happily formatted this as "Total: ₹0.00" — user thinks party exists with zero sales (wrong). New code detects all-NULL and reroutes to recovery.

**Three heuristics:**
1. **Single-row all-NULL aggregate** → filter matched nothing
2. **Single-row all-zero numeric** when query mentions "total/sum/kitn[aei]/avg" → suspicious
3. **List asked, ≤1 row returned** when query has "top N / list / sabhi / wise / breakdown" → wrong GROUP BY

**Kaise:**
```javascript
function validateResult(rows, query) {
  if (rows.length === 1) {
    const r = rows[0];
    const allNull = Object.keys(r).every(k => r[k] === null);
    if (allNull) return { ok: false, hint: 'WHERE matched no rows. Widen filter or check column names.' };

    const numerics = Object.values(r).filter(v => typeof v === 'number');
    if (numerics.length && numerics.every(v => v === 0) &&
        /\b(total|sum|kitn[aei]|avg|highest|lowest)\b/i.test(query)) {
      return { ok: false, hint: 'Aggregate is 0 across all numerics. Filters may be too narrow.' };
    }
  }
  if (rows.length <= 1 && /\b(top\s*\d+|list|sabhi|wise|breakdown|month-?wise)\b/i.test(query)) {
    return { ok: false, hint: `User asked for list but got ${rows.length} row. GROUP BY likely wrong.` };
  }
  return { ok: true };
}
```

**Agar ye nahi hota:** "Total: ₹0.00" lies. Hard to debug because SQL technically worked.

---

### S10.5 Error Taxonomy + Exponential Backoff

**Kya hai:** Har error ko ek category mein daalo: TRANSIENT (retry karo), SCHEMA (fix-and-retry), USER (clarify maango), PERMANENT (fail fast). Phir uss category ke hisaab se action lo.

**Kahan:** `helpers/self-heal.js` → `classifyError(err)` + `withRetry(fn, opts)`.

**Kyu:** Old code retried EVERYTHING 3 times — wasted time on permission errors and SQL syntax errors that no amount of retry will fix. Plus, transient network blips (ECONNRESET) bubbled up as failures even though a 250ms retry would've worked.

**Categories:**
| Kind | Examples | Retry? | Action |
|------|----------|--------|--------|
| `TRANSIENT` | ECONNRESET, ETIMEDOUT, fetch failed, 502/503 | ✓ exponential backoff | `withRetry` auto-handles |
| `TIMEOUT` | "deadline exceeded" | ✓ once | Same |
| `RATE_LIMIT` | 429, "too many requests" | ✓ longer delay | Same |
| `SCHEMA_COLUMN` | `column "X" does not exist` | ✓ via column resolver | `resolveColumnError` |
| `SCHEMA_RELATION` | `relation "X" does not exist` | ✗ | "Sheet sync karna padega" |
| `SQL_SYNTAX` | `syntax error`, `GROUP BY missing` | ✓ via AI re-prompt | Outer retry loop |
| `PERMISSION` | RLS, role denied | ✗ | "Admin se baat karo" |
| `PERMANENT` | division by zero, range overflow | ✗ | "Calculation error" |

**Exponential backoff (250ms → 500ms → 1000ms):**
```javascript
async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 250, label }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(attempt); }
    catch (err) {
      const cls = classifyError(err);
      if (!cls.retryable || attempt >= maxAttempts) throw err;
      await sleep(baseDelayMs * Math.pow(2, attempt - 1));
    }
  }
}
```

**Wired everywhere:**
- `runSQL` (both tenant + MIS Main) wrapped in `withRetry` → ECONNRESET auto-recovers
- `runSQLWithRetry` (MIS Main) uses `classifyError` to fail fast on PERMISSION
- Tenant retry loop uses `classifyError` to skip useless re-prompts on PERMANENT errors

**Agar ye nahi hota:** Network blips = visible failures. Wasted AI calls on errors that can't be fixed by re-prompting.

---

### S10.6 Health Check with Real DB Ping

**Kya hai:** `/health` endpoint ne actually DB se baat karke confirm karo ki sab kuch theek hai — sirf Node process up hai, ye batane se kaam nahi chalega.

**Kahan:** `helpers/self-heal.js` → `pingDb(supabase, opts)`. Wired in `server.js` → `app.get('/health', ...)`.

**Kyu:** Old `/health` returned `{"status":"ok","uptime":123}` even when Supabase was unreachable. Monitoring tools would say "all good" while users got errors. New version actually round-trips a `SELECT 1` and returns 503 with diagnostics if DB is unreachable.

**Kaise (with timeout race):**
```javascript
async function pingDb(supabase, { timeoutMs = 3000 } = {}) {
  const start = Date.now();
  const racePromise = supabase.rpc('execute_sql', { query: 'SELECT 1 AS ok' });
  const timeout    = new Promise((_, rej) => setTimeout(() => rej(new Error('ping timeout')), timeoutMs));
  try {
    const { data, error } = await Promise.race([racePromise, timeout]);
    if (error) return { ok: false, latencyMs: Date.now()-start, error: error.message };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now()-start, error: e.message };
  }
}

// server.js
app.get('/health', async (req, res) => {
  const ping = await selfHeal.pingDb(supabase, { timeoutMs: 3000 });
  res.status(ping.ok ? 200 : 503).json({
    status: ping.ok ? 'ok' : 'degraded',
    uptime: process.uptime() | 0,
    db: { ok: ping.ok, latency_ms: ping.latencyMs, ...(ping.error ? { error: ping.error } : {}) },
    timestamp: new Date().toISOString(),
  });
});
```

**Live response:**
```json
{ "status": "ok", "uptime": 7, "db": { "ok": true, "latency_ms": 486 }, "timestamp": "..." }
```

**`Promise.race` pattern:** Either the actual ping resolves OR the timeout rejects — whichever happens first wins. Critical so a hung DB connection doesn't block the health endpoint indefinitely.

**Agar ye nahi hota:** Production "all green" dashboard while DB is on fire. Slow incident detection.

---

### S10.7 Layered Recovery Strategy (How They Compose)

**Kya hai:** Six self-heal layers hain — har ek apne kaam ka, but they're ORDERED so cheap fixes happen before expensive ones.

**The order (per request):**
```
User query
  ↓
AI generates SQL
  ↓
Validate SQL (selectSQL only, no DDL)
  ↓
RUN SQL ──[withRetry: TRANSIENT auto-recovers]──→ rows
  ↓ (on error)
Classify error
  ├── PERMISSION / SCHEMA_RELATION → fail fast (no retry)
  ├── SCHEMA_COLUMN → resolveColumnError (Levenshtein) → rewrite & retry SAME attempt (no AI cost)
  └── SQL_SYNTAX / UNKNOWN → re-prompt AI with error context (next attempt)
  ↓
Still 0 rows OR all-NULL aggregate?
  ↓
Try fuzzyFallback (pg_trgm on entity columns) — suggest similar names
  ↓ (no match)
Try relaxSQL variants (drop date / loosen ILIKE / both) — broader search
  ↓ (still nothing)
Friendly "no data" reply with hints
  ↓ (rows found)
validateResult — log warnings if suspicious, but don't override
  ↓
Format & return
```

**Why this order matters:**
- **Cheap before expensive:** Levenshtein column-fix is free; AI re-prompt is ~1.5s + tokens.
- **Specific before general:** pg_trgm fuzzy (entity-aware) before relaxSQL (filter-removal).
- **Honest before optimistic:** all-NULL detection prevents false "₹0.00" totals.

**Agar ye order ulta hota:** Slower responses, more wrong answers, more wasted AI calls.

---

## 🟠 PHASE 9 — TENANT COMMUNICATION FEATURES (2026-05-25)

Goal: Make every tenant feel like a first-class user — voice messages, auto-sync, chat history, booking emails, meeting reminders, and daily schedules.

---

### S9.1 Access-Gate Bypass for Known Tenants (Phone Cache)

**Kya hai:** Ek dum simple in-memory cache jo bata deta hai "yeh phone tenant hai ya nahi" — bina har message pe DB query kiye.

**Kahan:** `server.js` → `tenantPhoneCache` Map + `isKnownTenant(phone)` async helper.

**Kyu:** Old code: `checkAccess` reads `access_control.json` (MIS-only list). If `mode='LIST'` and phone not in list → blocked at gate. But registered TENANT phones aren't in that list — they're in the `tenants` table. Result: voice messages from tenants got `⛔ Aapko access nahi hai` BEFORE the tenant router could see them.

**Kaise:**
```javascript
const tenantPhoneCache = new Map(); // phone → ts (5-min TTL)
const TENANT_PHONE_CACHE_TTL = 5 * 60 * 1000;

async function isKnownTenant(phone) {
  const cached = tenantPhoneCache.get(phone);
  if (cached && Date.now() - cached < TENANT_PHONE_CACHE_TTL) return true;
  const { data: t } = await supabase.from('tenants').select('id').eq('phone', phone).maybeSingle();
  if (t) { tenantPhoneCache.set(phone, Date.now()); return true; }
  const { data: m } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', phone).maybeSingle();
  if (m) { tenantPhoneCache.set(phone, Date.now()); return true; }
  return false;
}

// Webhook gate:
const access = checkAccess(actualPhone);
if (!access.allowed) {
  if (!(await isKnownTenant(actualPhone))) {
    await sendWhatsAppReply(actualPhone, "⛔ Aapko is bot ka access nahi hai...");
    return;
  }
  access.allowed = true;
  access.access  = 'TENANT';
}
```

**Two key design choices:**
- **Positive cache only** — we only remember "yes this is a tenant". Negative results are NOT cached so a freshly-registered tenant doesn't have to wait for cache expiry.
- **TTL not LRU** — small enough that adding/removing a tenant becomes effective within 5 minutes. No eviction logic needed.

**Agar ye nahi hota:** Tenants cannot use the bot at all. Voice + text both blocked.

---

### S9.2 Per-Tenant Auto-Sync with Serial Execution + Throttle

**Kya hai:** Har 15 minute mein, sab tenants ki sheets ko sync karo — ek-ek karke (parallel nahi). Aur same tenant ko 5 min ke andar dobara sync nahi karo.

**Kahan:** `helpers/tenant-sync.js` → `syncAllTenants()`. `setInterval(..., 15min)` in `server.js`.

**Kyu:**
- **Serial, not parallel:** 50 tenants in parallel = 50 simultaneous Google Sheets API calls + 50 simultaneous Supabase writes. Easy way to hit rate limits or thrash the DB. Serial keeps it predictable.
- **Throttle:** If both the boot warm-up AND the cron tick fire (or a user manually hits `/api/tenant/sync-all`), we don't want to re-sync within 5 minutes — it's pointless network/CPU.
- **Drift-only notifications:** Most syncs are "0 drift events". Spamming the user "✅ synced!" every 15 min would be terrible. Only message them when something actually changed.

**Kaise:**
```javascript
const lastSyncedAt = new Map(); // tenantId → ts
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let syncRunning = false;

async function syncAllTenants(supabase, opts = {}) {
  if (syncRunning) return { skipped: true }; // no overlapping runs
  syncRunning = true;
  try {
    const { data: tenants } = await supabase.from('tenants')
      .select('id, name, phone, sheet_url, status, proper_tables_created')
      .eq('proper_tables_created', true)
      .neq('status', 'paused');

    for (const t of tenants) {
      const last = lastSyncedAt.get(t.id);
      if (last && Date.now() - last < MIN_SYNC_INTERVAL_MS && !opts.force) continue;
      try {
        const r = await syncSheetToProperTables(supabase, t.id, t.sheet_url);
        lastSyncedAt.set(t.id, Date.now());
        // notify only on real drift (added/removed/typeChanged columns)
        const drift = (r.drift || []).reduce((n, d) => n + d.added.length + d.removed.length + d.typeChanged.length, 0);
        if (drift > 0 && opts.sendWhatsAppReply && t.phone) {
          await opts.sendWhatsAppReply(t.phone, buildDriftMessage(t.name, r.drift));
        }
      } catch (e) {
        console.error(`[TENANT-SYNC] ${t.name}: ${e.message}`); // continue with next tenant
      }
    }
  } finally { syncRunning = false; }
}
```

**Why a `syncRunning` flag instead of locks:** If the cron fires while the previous run is still in flight (say sync took 6 minutes due to a slow tenant), we don't queue — we just skip. The next tick is 15 min away, and that's plenty of time to retry stragglers next round.

**Agar ye nahi hota:** Tenants ka data stale rehta. Or unka WhatsApp har 15 min spam hota.

---

### S9.3 Closure-Wrapped Logging (Threading Reply Through Multiple Returns)

**Kya hai:** Ek closure function bana lo jo har return path par log + return dono kar sake — bina poori function refactor kiye.

**Kahan:** `helpers/tenant-router.js` → `processQueryProperTables` mein `logAndReturn()` closure.

**Kyu:** Function ke 6 alag-alag return points hain (image / chart / CSV / PDF / AI summary / direct format). Har ek mein same logging code copy-paste karna hota. Plus reply text har return par alag hota — aap top par log nahi kar sakte.

**Kaise:**
```javascript
async function processQueryProperTables(tenant, query) {
  // ... compute lastSQL, rows ...

  // Closure captures supabase + tenant + query + lastSQL from outer scope
  const logAndReturn = (result) => {
    const replyText = typeof result.reply === 'string' ? result.reply.slice(0, 5000) : null;
    supabase.from('tenant_query_logs').insert({
      tenant_id: tenant.id, phone: tenant.__phone, query,
      sql_generated: lastSQL, response: replyText, tokens_used: 0,
    }).then(() => {}, () => {});
    return result;
  };

  // Now every return becomes a one-line wrap:
  if (mode === 'images') return logAndReturn({ reply, media: { type: 'images', items }, tenant });
  if (mode === 'chart')  return logAndReturn({ reply, media: { type: 'image', path }, tenant });
  if (rows.length > CSV_ROW_THRESHOLD) return logAndReturn({ reply, media: { type: 'document', path }, tenant });
  // ... etc ...
  return logAndReturn({ reply: fmt.formatResults(query, rows, cols), tenant });
}
```

**Why closures here, not a method:** Closure has zero-cost access to `supabase`, `tenant`, `query`, and the mutable `lastSQL` variable. A method would need all of those as parameters (verbose) or as `this` properties (would require restructuring as a class). The closure pattern is small, local, and self-contained.

**Truncation to 5KB:** PostgreSQL TEXT can hold > 5KB but indexing + retrieval get slower. Reply text in WhatsApp is typically < 1KB. 5KB is a safe upper bound.

**Agar ye nahi hota:** Either 6× duplicated logging code, or a chunky helper function with 6 if/else branches that the linter hates.

---

### S9.4 Email-on-Booking with Multi-Recipient + Best-Effort Send

**Kya hai:** Jab tenant ki calendar mein meeting book ho jaaye, multiple logon ko email bhej do — tenant owner, parsed guests, sab. Lekin email failure se WhatsApp confirmation NEVER block hona chahiye.

**Kahan:** `server.js` → `handleTenantCalendarIntent()` after `createEvent`.

**Kyu:**
- Owner ko email chahiye for record-keeping (calendar log + email proof).
- Guests ko email chahiye taaki unhe alag se invite na bhejna pade.
- Email service slow hota hai (Gmail SMTP can be 3-5s). User ko WhatsApp confirm IMMEDIATELY chahiye, email background mein chal jaaye.

**Kaise:**
```javascript
const event = await tenantCalHelper.createEvent(refreshToken, calendarId, { title, startTime, endTime });

// WhatsApp confirmation FIRST (fast — user sees it immediately)
sendWhatsAppReply(phone, notifMsg).catch(() => {});

// Email AFTER (background — slow but non-blocking)
try {
  const html = notifications.formatBookingEmailHTML(event, parsedForEmail);
  const subj = `Meeting Confirmed: ${event.summary}`;

  if (tenant.email && /@/.test(tenant.email)) {
    notifications.sendEmail(tenant.email, subj, html).catch(e => console.error('[OWNER]', e.message));
  }
  for (const g of parsedForEmail.guests) {
    notifications.sendEmail(g, subj, html).catch(e => console.error('[GUEST]', e.message));
  }
  notifications.logBooking(supabase, event, parsedForEmail, 'booked').catch(() => {});
} catch (e) {
  console.error('[BOOKING EMAIL ERROR]', e.message);
  // explicitly DON'T re-throw — we don't want email errors blocking the WA reply
}

return `✅ *Meeting booked!*\n...`;
```

**Pattern: `.catch(() => {})` (silent swallow):** All email sends are fire-and-forget. We log errors to console for debugging but never propagate them. The user's calendar already has the event; the email is value-add.

**Agar ye nahi hota:** A flaky Gmail SMTP would intermittently fail bookings — user sees "❌ Calendar error" even though the event was actually created.

---

### S9.5 Per-Tenant Reminder Loop with Compound-Key Dedup

**Kya hai:** Har tenant ki calendar pe 15-min-before reminder bhejo — but make sure same event ko duplicate reminder na jaaye.

**Kahan:** `helpers/tenant-notifications.js` → `checkTenantReminders()`. `setInterval(60s)` in `server.js`.

**Kyu:**
- The check fires every 60s.
- Each event is in the "15-16 min away" window for ~1 minute (one tick).
- But network blips, slow DB queries, or clock drift could cause the same event to fall in the window for 2 ticks.
- Without dedup → same user gets 2 reminder texts. Annoying.

**Kaise (compound key = `tenantId:eventId`):**
```javascript
const sentReminders = new Set();
const SENT_REMINDERS_MAX = 500;

async function checkTenantReminders(supabase, sendWhatsAppReply) {
  const tenants = await listConnectedTenants(supabase);
  const now = new Date();
  const in15 = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const in16 = new Date(now.getTime() + 16 * 60 * 1000).toISOString();

  for (const t of tenants) {
    try {
      const events = await tenantCalHelper.getEvents(t.calendar_refresh_token, t.calendar_id, in15, in16);
      for (const e of events) {
        const key = `${t.id}:${e.id}`;  // ← compound key — same event can exist on multiple calendars
        if (sentReminders.has(key)) continue;
        await sendWhatsAppReply(t.phone, `🔔 REMINDER — 15 min mein meeting!\n📌 ${e.summary}`);
        sentReminders.add(key);
      }
    } catch (err) { console.error(`[REMINDER] ${t.name}: ${err.message}`); /* continue with next tenant */ }
  }

  if (sentReminders.size > SENT_REMINDERS_MAX) sentReminders.clear(); // hard cap
}
```

**Why compound key:** Two different tenants might somehow get the same Google event ID (rare but possible if they share calendars). Keying by tenantId+eventId ensures each tenant gets their own reminder.

**Why `Set.clear()` instead of LRU:** A stricter LRU is overkill. Worst-case if we hit 500 entries and clear, the next tick MAY duplicate a few reminders for events that are still in the window. That's a 1-in-500 edge case for a transient inconvenience — not worth the complexity.

**Agar ye nahi hota:** Same reminder fires multiple times. Or memory leaks with unbounded Set.

---

### S9.6 IST-Aware Daily Schedule with Per-Tenant Date Dedup

**Kya hai:** Har tenant ko 8 AM IST par roz ek baar daily schedule bhejo — WhatsApp + email dono.

**Kahan:** `helpers/tenant-notifications.js` → `sendTenantDailySchedules()`. Same `setInterval(60s)` rhythm.

**Kyu:**
- Server runs in UTC but the audience is in India. So "8 AM" must be IST, not UTC.
- The 60s tick means we'd fire 60 times in the 8:00-8:59 IST hour without dedup.
- Two-key dedup needed: `(tenantId, date)` so each tenant gets exactly one "morning brief" per calendar day, even if the server restarts and the in-memory map resets.

**Kaise:**
```javascript
const lastDailySent = new Map(); // tenantId → 'YYYY-MM-DD'

async function sendTenantDailySchedules(supabase, sendWhatsAppReply) {
  // Convert "now" to IST and check the hour
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  if (ist.getHours() !== 8) return;  // gate: only fire during the 8 AM IST hour
  const todayKey = ist.toISOString().split('T')[0]; // YYYY-MM-DD in IST

  const tenants = await listConnectedTenants(supabase);
  for (const t of tenants) {
    if (lastDailySent.get(t.id) === todayKey) continue; // already sent today

    try {
      const events = await tenantCalHelper.getTodayEvents(t.calendar_refresh_token, t.calendar_id);

      const greeting = `☀️ *Good Morning${t.name ? ', ' + t.name : ''}!*`;
      const waMsg = events.length === 0
        ? `${greeting}\n\n📅 Aaj koi meeting nahi hai.`
        : `${greeting}\n\n📅 *Aaj ki schedule:*\n${events.map(formatLine).join('\n')}`;

      await sendWhatsAppReply(t.phone, waMsg);

      if (t.email) {
        await notifications.sendEmail(t.email, `Today's Schedule — ${todayKey}`, buildDailyEmailHTML(t.name, events, todayKey));
      }
      lastDailySent.set(t.id, todayKey);  // mark done — survives the rest of the day
    } catch (e) { console.error(`[DAILY] ${t.name}: ${e.message}`); }
  }
}
```

**Why timezone-aware via `toLocaleString`:** Node's `Date` is always UTC under the hood. `toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })` gives a string in IST, which we re-parse into a `Date` — its `getHours()` then reflects IST. Most idiomatic way in plain Node without `moment-timezone`.

**Why a Map keyed by tenantId:** Each tenant has their own `lastDailySent` value. If server restarts at 8:30 AM, only tenants who got their morning message before 8:30 are skipped; the rest still get theirs (correct).

**Edge case — server restart at exactly 8 AM:** `lastDailySent` resets to empty. Loop fires for all tenants. Map populates again. They each get exactly one message. ✓

**Agar ye nahi hota:** 60 daily schedule messages per tenant per morning. Or worse, none at all if the timezone math is off.

---

## 🟠 PHASE 11.2 — AUTOMATED TEST SUITE (2026-05-25)

---

### S11.2 Node's Built-in Test Runner (`node:test`) — Zero-Dependency Testing

**Kya hai:** Node.js 18+ ke andar ek built-in test framework hai — `node:test` module + `node:assert` + `node --test` CLI. Jest, Mocha, ya kuch aur install karne ki zaroorat nahi.

**Kahan:** `tests/unit/*.test.js` + `tests/integration/*.test.js`. Run via `npm test`.

**Kyu:**
- **Zero dependencies:** This project intentionally has very few deps. Adding Jest = 50+ MB of node_modules + lockfile churn + a new config file. `node:test` = 0 KB extra.
- **Modern syntax:** describe/test/before/after, async/await, all native — no transpilation, no `require('@jest/globals')`.
- **Spec reporter built-in:** `--test-reporter=spec` gives the same hierarchical output as Mocha/Jest.
- **Glob patterns:** Node 22 needs explicit globs (`'tests/unit/*.test.js'`) — directories alone don't work.

**Kaise (basic structure):**
```javascript
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict'); // strict variant — like Jest's expect

describe('classifyError', () => {
  test('ECONNRESET → TRANSIENT', () => {
    const r = sh.classifyError({ code: 'ECONNRESET' });
    assert.equal(r.kind, 'TRANSIENT');
    assert.equal(r.retryable, true);
  });

  test('async test with timeout', { timeout: 5000 }, async (t) => {
    const result = await someAsyncFn();
    assert.ok(result);
  });
});
```

**`npm test` script (added to `package.json`):**
```json
"scripts": {
  "test":             "node --test --test-reporter=spec 'tests/unit/*.test.js' 'tests/integration/*.test.js'",
  "test:unit":        "node --test --test-reporter=spec 'tests/unit/*.test.js'",
  "test:integration": "RUN_INTEGRATION=1 node --test --test-reporter=spec 'tests/integration/*.test.js'"
}
```

**Pattern: graceful-skip integration tests via env-var gate:**
```javascript
const RUN  = process.env.RUN_INTEGRATION === '1';

before(async () => {
  if (!RUN) return; // skip setup if not running
  // ... real setup ...
});

test('expensive AI test', { timeout: 30000 }, async (t) => {
  if (!RUN) return t.skip('RUN_INTEGRATION not set');
  // ... real test ...
});
```

This way `npm test` is fast + free for CI (only unit + cheap HTTP), and `RUN_INTEGRATION=1 npm test` runs the full live AI/DB suite locally.

**Pattern: server-up probe before HTTP integration tests:**
```javascript
let serverUp = false;
before(async () => {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2500) });
    serverUp = r.ok || r.status === 503;
  } catch { serverUp = false; }
});

test('GET /health', async (t) => {
  if (!serverUp) return t.skip('server not reachable');
  // ... test ...
});
```

This makes integration tests CI-safe — they self-skip if the server isn't running.

**Test count + timing for this project:**
| Mode | Tests | Wall time |
|------|-------|-----------|
| `npm run test:unit` | 117 | 234 ms |
| `npm test` (server up) | 131 (8 skipped — gated) | ~10 s |
| `RUN_INTEGRATION=1 npm test` | 131 | 15.8 s |

**Agar ye nahi hota:** Manual smoke-testing every change. No regression safety net for refactors. Future Phase 11.1 (the risky source-of-truth refactor) would be way scarier without 131 green tests as a safety net.

---

### S11.3 Exposing Internal Helpers for Testability via `_internal`

**Kya hai:** Pure helper functions jo module-private hain, unhe `module.exports._internal` namespace mein expose karo — sirf testing ke liye.

**Kahan:** `helpers/tenant-router.js` — exports a `_internal` object with `detectIntent`, `detectQueryMode`, `autoRouteQuery`, `extractEntityFilters`, `validateSQL`, `isMISUser`, `buildSchemaPrompt`.

**Kyu:** These functions were previously closure-scoped within tenant-router.js — fine for the hot path, but unreachable from tests. Three options:
1. Move them to a separate file (over-engineering for ~10-line helpers)
2. Use `proxyquire` / `rewire` (extra dependency + dynamic-require gymnastics)
3. **Export them under a `_internal` key** — convention signals "this is for tests, not for production callers"

**Kaise:**
```javascript
// helpers/tenant-router.js
function detectIntent(query) { /* ... */ }
function detectQueryMode(query) { /* ... */ }
function validateSQL(sql) { /* ... */ }

// Production exports — what server.js imports
module.exports = {
  getTenant: getUserDatabases,
  handleTenantQuery,
  invalidateTenantCache,
  // Phase 11.2: pure helpers exposed for unit tests
  _internal: {
    detectIntent,
    detectQueryMode,
    autoRouteQuery,
    extractEntityFilters,
    validateSQL,
    isMISUser,
    buildSchemaPrompt,
  },
};

// tests/unit/tenant-router-helpers.test.js
const { _internal } = require('../../helpers/tenant-router');
const { detectIntent, detectQueryMode } = _internal;
test('greetings return GREETING', () => {
  assert.equal(detectIntent('hi').intent, 'GREETING');
});
```

**Why the underscore prefix:** Convention from Python — `_foo` means "private API; touch at your own risk". Production code SHOULD NOT import from `_internal`; only tests.

**Trade-off vs alternative — separate file:**
| Approach | Pros | Cons |
|----------|------|------|
| Move helpers to `helpers/intent.js` | Clean separation | Extra file, extra `require` for ~80 lines of regex code |
| `_internal` namespace export | Helpers stay near callers | Slightly larger public surface (but underscored = warning) |

For helpers tightly coupled to one file (like intent detection used only by tenant-router), the `_internal` pattern wins.

**Agar ye nahi hota:** Either no unit tests for these helpers (loss of 27 test cases of regression safety), or invasive refactoring to move them out.

---

*Last Updated: 2026-05-25*
*Total Concepts Covered: 85+*
*Project: MIS Chatbot — WhatsApp AI Business Assistant*
