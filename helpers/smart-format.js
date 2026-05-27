/**
 * Smart Type-Aware Formatter (Phase 6)
 *
 * Replaces the regex-based formatter that incorrectly added ₹ to all numbers >= 1000.
 *
 * Inputs:
 *   - rows         : array of result objects from PostgreSQL
 *   - columnsMeta  : per-column metadata { pg_name, original, role, pg_type }
 *                    sourced from tenants.tables_metadata
 *   - userQuery    : the user's question (used for AI fallback formatting)
 *
 * Roles handled:
 *   currency  → "₹1,23,456" (Indian commas, L/Cr suffix for big numbers)
 *   quantity  → "3,040 KG" (or just number if unit unknown)
 *   rate      → "₹70.00 per unit"
 *   percent   → "12.50%"
 *   count     → "47" (no ₹, no commas for small numbers)
 *   date      → "2-Apr-26" (preserved as-is)
 *   id        → "1/2026-27" (raw)
 *   entity    → "Shivani Aggarwal"
 *   location  → "SONEPAT"
 *   category  → "IMMEDIATE"
 *   text      → plain
 */

// ─────────────────────────────────────────────────────────────────────────
// VALUE FORMATTERS PER ROLE
// ─────────────────────────────────────────────────────────────────────────

function formatCurrency(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  const num = parseFloat(n);
  if (num === 0) return '₹0';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  const formatted = abs.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  if (abs >= 1e7) return `${sign}₹${formatted} (₹${(abs / 1e7).toFixed(2)} Cr)`;
  if (abs >= 1e5) return `${sign}₹${formatted} (₹${(abs / 1e5).toFixed(2)} L)`;
  return `${sign}₹${formatted}`;
}

function formatQuantity(n, unit) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  const num = parseFloat(n);
  const formatted = num.toLocaleString('en-IN', { maximumFractionDigits: 3 });
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatRate(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  const num = parseFloat(n);
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatPercent(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  const num = parseFloat(n);
  return `${num.toFixed(2)}%`;
}

function formatCount(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  const num = parseFloat(n);
  if (Number.isInteger(num)) return num.toLocaleString('en-IN');
  return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatPlain(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

// ─────────────────────────────────────────────────────────────────────────
// ROLE INFERENCE (for AI-generated columns that aren't in tables_metadata)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Infer role from a result-set column name.
 * Used when AI generates aliases like "total_amount", "invoice_count", "avg_rate".
 */
function inferRoleFromKey(key, value) {
  const k = String(key || '').toLowerCase();

  // Entity FIRST (specific identifiers — must beat currency check below)
  // "sales_person" should NOT be treated as currency just because it contains "sales"
  if (/(^|_)(person|name|party|customer|vendor|client|supplier|employee|account)(_|$)|^name$|^party$|sales_?person|salesperson/.test(k)) return 'entity';

  // ID-like (voucher, invoice no)
  if (/voucher|invoice.*no|bill.*no|ref.*no|hsn|gst.*no|^id$|_id$/.test(k)) return 'id';

  // Date
  if (/^date$|_date$|^dt|created|updated|timestamp/.test(k)) return 'date';

  // City/location
  if (/^city$|^state$|^country$|^location$|^region$|^area$|^address$|_city|_state|_country/.test(k)) return 'location';

  // Type/category
  if (/^type$|^category$|^class$|^status$|^priority$|^stage$|^group$|^unit$|invtype/.test(k)) return 'category';

  // Count-like aliases
  if (/^count$|_count$|^cnt$|^num_|^n_|^invoices?$|^orders?$|invoice_count|num_invoices|total_invoices|order_count|total_orders|total_count/.test(k)) return 'count';

  // Currency-like
  if (/amount|amt|price|cost|^total$|_total$|total_amount|total_amt|^sale$|^sales$|_sales$|revenue|income|expense|debit|credit|balance|gst|cgst|sgst|igst|tax|cess|discount|profit|margin|fees|^sum_|_sum$/.test(k)) return 'currency';

  // Quantity
  if (/^qty$|_qty$|quantity|weight|stock|units|^kg$|_kg$|total_qty|total_quantity|tot_qty/.test(k)) return 'quantity';

  // Percent
  if (/pct|percent|%/.test(k)) return 'percent';

  // Average rate (value depends on context — small floats often rates)
  if (/^avg$|^average|^avg_|_avg$|^mean_|_mean$|per_kg|per_unit|^rate$|_rate$/.test(k)) {
    const n = parseFloat(value);
    if (!isNaN(n) && n > 1000) return 'currency';
    return 'rate';
  }

  // Sample-driven fallback
  if (value !== null && value !== undefined && value !== '') {
    const n = parseFloat(value);
    if (!isNaN(n)) return 'number';
  }

  return 'text';
}

/**
 * Format a single value given role + optional unit.
 * If role-based formatting returns empty for a non-empty value, fall back to plain text.
 */
function formatValue(value, role, unit) {
  if (value === null || value === undefined || value === '') return '';
  let formatted;
  switch (role) {
    case 'currency': formatted = formatCurrency(value); break;
    case 'quantity': formatted = formatQuantity(value, unit); break;
    case 'rate':     formatted = formatRate(value); break;
    case 'percent':  formatted = formatPercent(value); break;
    case 'count':    formatted = formatCount(value); break;
    case 'number':   formatted = formatCount(value); break;
    case 'date':
    case 'id':
    case 'entity':
    case 'location':
    case 'category':
    case 'text':
    default:         formatted = formatPlain(value);
  }
  // Fallback: if numeric formatter returned empty but value is non-empty (e.g. text passed to currency formatter), use plain text
  if (!formatted && value !== null && value !== undefined && value !== '') {
    formatted = formatPlain(value);
  }
  return formatted;
}

// ─────────────────────────────────────────────────────────────────────────
// LABEL HUMANIZATION
// ─────────────────────────────────────────────────────────────────────────

function humanizeLabel(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\bgst\b/gi, 'GST')
    .replace(/\bcgst\b/gi, 'CGST')
    .replace(/\bsgst\b/gi, 'SGST')
    .replace(/\bigst\b/gi, 'IGST')
    .replace(/\bhsn\b/gi, 'HSN')
    .replace(/\bid\b/gi, 'ID')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN FORMATTING
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build a role lookup map from the current tenant's columnsMeta + AI-aliases.
 *
 * @param resultRow first row of the result (used for inference)
 * @param tableColumns array of {pg_name, original, role, pg_type} for the source table
 */
function buildRoleMap(resultRow, tableColumns = []) {
  const map = {};
  // Pre-populate from tableColumns (exact match by pg_name or lowercased pg_name)
  for (const c of tableColumns) {
    if (c.pg_name) {
      map[c.pg_name] = { role: c.role, original: c.original, pg_type: c.pg_type };
      map[c.pg_name.toLowerCase()] = map[c.pg_name];
    }
  }
  // For each result key, fall back to inference
  for (const k of Object.keys(resultRow || {})) {
    if (!map[k] && !map[k.toLowerCase()]) {
      const role = inferRoleFromKey(k, resultRow[k]);
      map[k] = { role, original: humanizeLabel(k) };
    }
  }
  return map;
}

/**
 * Format result rows as a WhatsApp-friendly message.
 *
 * @param query        user's original question
 * @param rows         result-set rows (array of objects)
 * @param tableColumns columnsMeta from tenants.tables_metadata for the queried table
 *                     (used for role lookup)
 */
function formatResults(query, rows, tableColumns = []) {
  if (!rows || !rows.length) return null;

  const roleMap = buildRoleMap(rows[0], tableColumns);

  // ── Single row, few keys → vertical key:value layout ──
  if (rows.length === 1 && Object.keys(rows[0]).length <= 6) {
    const lines = [];
    for (const [key, val] of Object.entries(rows[0])) {
      if (val === null || val === undefined || val === '') continue;
      const meta = roleMap[key] || roleMap[key.toLowerCase()] || { role: inferRoleFromKey(key, val), original: humanizeLabel(key) };
      const label = humanizeLabel(meta.original || key);
      const formatted = formatValue(val, meta.role);
      if (formatted) lines.push(`*${label}:* ${formatted}`);
    }
    return `📊 ${lines.join('\n')}`;
  }

  // ── Multi-row → numbered list with emoji bullets + summary ──
  if (rows.length <= 15) {
    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','1️⃣1️⃣','1️⃣2️⃣','1️⃣3️⃣','1️⃣4️⃣','1️⃣5️⃣'];
    const keys = Object.keys(rows[0]);

    const lines = rows.map((row, i) => {
      const parts = [];
      for (const k of keys) {
        const val = row[k];
        if (val === null || val === undefined || val === '') continue;
        const meta = roleMap[k] || roleMap[k.toLowerCase()] || { role: inferRoleFromKey(k, val), original: humanizeLabel(k) };
        const formatted = formatValue(val, meta.role);
        if (formatted) parts.push(formatted);
      }
      return `${emojis[i] || `${i + 1}.`} ${parts.join(' — ')}`;
    });

    // Aggregate summary across rows (only for currency / quantity / count columns)
    const summary = buildAggregateSummary(rows, keys, roleMap);

    let out = `📋 *${rows.length} results:*\n\n${lines.join('\n')}`;
    if (summary) out += `\n\n${summary}`;
    return out;
  }

  // ── Many rows: hand off to AI for summarization (with type hints) ──
  return null;  // signal caller to use aiFormat / PDF / CSV
}

/**
 * Build aggregate summary line for multi-row output.
 * Returns e.g. "📊 *Totals:* ₹X across N entries" or null if not meaningful.
 */
function buildAggregateSummary(rows, keys, roleMap) {
  if (rows.length < 2) return null;
  const numericRoles = ['currency', 'quantity', 'count', 'number', 'rate'];
  const summable = keys.filter(k => {
    const meta = roleMap[k] || roleMap[k.toLowerCase()] || { role: inferRoleFromKey(k, rows[0][k]) };
    return numericRoles.includes(meta.role);
  });

  if (!summable.length) return null;

  const parts = [];
  for (const k of summable) {
    const meta = roleMap[k] || roleMap[k.toLowerCase()] || { role: inferRoleFromKey(k, rows[0][k]), original: humanizeLabel(k) };
    if (meta.role === 'rate') continue;  // averages don't sum meaningfully
    let total = 0, count = 0;
    for (const r of rows) {
      const n = parseFloat(r[k]);
      if (!isNaN(n)) { total += n; count++; }
    }
    if (count === 0) continue;
    const label = humanizeLabel(meta.original || k);
    const formatted = formatValue(total, meta.role);
    if (formatted) parts.push(`*${label}:* ${formatted}`);
  }

  if (!parts.length) return null;
  return `📊 *Total across ${rows.length}:* ${parts.join(' | ')}`;
}

/**
 * AI fallback formatter for >15 rows. Called only when formatResults returns null.
 */
async function aiFormat(query, rows, tableColumns = []) {
  // Pre-format rows with proper types so AI doesn't need to guess
  const roleMap = buildRoleMap(rows[0], tableColumns);
  const preformatted = rows.slice(0, 20).map(r => {
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      const meta = roleMap[k] || roleMap[k.toLowerCase()] || { role: inferRoleFromKey(k, v) };
      o[humanizeLabel(meta.original || k)] = formatValue(v, meta.role) || (v ?? '');
    }
    return o;
  });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Format as a clean WhatsApp message in ENGLISH ONLY. Values are PRE-FORMATTED — DO NOT add or remove ₹ or commas, use them as-is.

QUESTION: ${query}
DATA (${rows.length} total, showing top 20):
${JSON.stringify(preformatted, null, 2)}

Rules:
- ALWAYS reply in English (user may write in any language — output is always English)
- Use *bold* for keys (single asterisks, WhatsApp format)
- Emoji bullets (1️⃣, 2️⃣, ...) for each row
- NO intro like "Sure!" or "Here's"
- End with: "Need more details? Just ask 👇"`
      }]
    })
  });
  const data = await res.json();
  let reply = data.choices?.[0]?.message?.content || '';
  reply = reply.replace(/###\s*/g, '').replace(/\*\*/g, '*').replace(/^(Sure!?|Here'?s?|Of course).*?(reply|message|answer):?\s*/i, '').trim();
  if (rows.length > 20) reply += `\n\n📌 _Total ${rows.length} entries. Top 20 shown._`;
  return reply;
}

module.exports = {
  formatResults,
  aiFormat,
  formatValue,
  formatCurrency,
  formatQuantity,
  formatCount,
  formatRate,
  formatPercent,
  inferRoleFromKey,
  humanizeLabel,
  buildRoleMap,
};
