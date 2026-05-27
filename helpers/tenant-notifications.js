/**
 * Tenant Notifications — Phase 9.5 + 9.6
 *
 * Mirrors helpers/notifications.js but iterates over all calendar-connected tenants
 * instead of the single MIS owner.
 *
 *   9.5 checkTenantReminders     — fires once per minute; sends WA reminder 15 min before each meeting
 *   9.6 sendTenantDailySchedules — fires once per minute; at 8 AM IST sends each tenant's day plan
 *
 * Both are best-effort: a single tenant's calendar failure never blocks the rest.
 *
 * State (in-memory, lost on restart by design — duplicate reminders are far worse than missed ones):
 *   sentReminders   Set<string>          keyed `${tenantId}:${eventId}` to avoid double-sending
 *   lastDailySent   Map<tenantId, dateKey>  one daily-schedule per tenant per day
 */
'use strict';

const tenantCalHelper = require('./tenant-calendar');
const notifications = require('./notifications'); // sendEmail, formatters

// ── 9.5: REMINDERS STATE ──────────────────────────────────────────────────
const sentReminders = new Set();
const SENT_REMINDERS_MAX = 500; // self-limit so the Set never grows unbounded

// ── 9.6: DAILY SCHEDULE STATE ─────────────────────────────────────────────
const lastDailySent = new Map(); // tenantId → 'YYYY-MM-DD'

/**
 * List all tenants that have completed the OAuth flow + are not paused.
 * Cached per call (tenants is a small list — a few rows per minute is fine).
 */
async function listConnectedTenants(supabase) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, phone, email, calendar_id, calendar_refresh_token, calendar_connected, status')
    .eq('calendar_connected', true)
    .neq('status', 'paused')
    .neq('status', 'cancelled');
  if (error) {
    console.error('[TENANT-NOTIF LIST]', error.message);
    return [];
  }
  return (data || []).filter(t => t.calendar_refresh_token && t.phone);
}

/**
 * 9.5 — scan every connected tenant's calendar for events 15–16 min from now,
 * send a WhatsApp reminder once per (tenantId, eventId).
 */
async function checkTenantReminders(supabase, sendWhatsAppReply) {
  let tenants;
  try { tenants = await listConnectedTenants(supabase); }
  catch (e) { console.error('[TENANT REMINDER LIST]', e.message); return; }
  if (!tenants.length) return;

  const now = new Date();
  const in15 = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const in16 = new Date(now.getTime() + 16 * 60 * 1000).toISOString();

  for (const t of tenants) {
    try {
      const events = await tenantCalHelper.getEvents(
        t.calendar_refresh_token,
        t.calendar_id || 'primary',
        in15,
        in16
      );
      for (const e of events) {
        const key = `${t.id}:${e.id}`;
        if (sentReminders.has(key)) continue;
        const start = new Date(e.start.dateTime || e.start.date);
        const time = start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        const meetLink = (e.description && e.description.match(/https:\/\/meet\.jit\.si\/\S+/)?.[0]) || e.htmlLink || '';
        const msg = `🔔 *REMINDER — Meeting in 15 min!*\n\n📌 ${e.summary || 'Meeting'}\n⏰ ${time}\n${meetLink ? `🔗 ${meetLink}` : ''}`;
        try {
          await sendWhatsAppReply(t.phone, msg);
          sentReminders.add(key);
        } catch (sendErr) {
          console.error(`[TENANT REMINDER SEND] ${t.name}: ${sendErr.message}`);
        }
      }
    } catch (e) {
      console.error(`[TENANT REMINDER] ${t.name}: ${e.message}`);
    }
  }

  // GC: if Set grows past limit, just clear it. We'd rather risk one duplicate
  // reminder than leak memory forever.
  if (sentReminders.size > SENT_REMINDERS_MAX) sentReminders.clear();
}

/**
 * 9.6 — at 8 AM IST, send each tenant their day's schedule via WhatsApp + email.
 * Re-runs are guarded by the per-tenant `lastDailySent` map keyed by date.
 */
async function sendTenantDailySchedules(supabase, sendWhatsAppReply) {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  if (ist.getHours() !== 8) return;
  const todayKey = ist.toISOString().split('T')[0];

  let tenants;
  try { tenants = await listConnectedTenants(supabase); }
  catch (e) { console.error('[TENANT DAILY LIST]', e.message); return; }
  if (!tenants.length) return;

  for (const t of tenants) {
    if (lastDailySent.get(t.id) === todayKey) continue;
    try {
      const events = await tenantCalHelper.getTodayEvents(
        t.calendar_refresh_token,
        t.calendar_id || 'primary'
      );

      const greeting = `☀️ *Good Morning${t.name ? ', ' + t.name : ''}!*`;
      let waMsg;
      if (!events.length) {
        waMsg = `${greeting}\n\n📅 No meetings scheduled today.\n\nEnjoy a relaxed day! 🎉`;
      } else {
        const lines = events.map((e, i) => {
          const s = new Date(e.start.dateTime || e.start.date);
          const time = s.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
          return `${i + 1}. ⏰ ${time} — ${e.summary || 'Meeting'}`;
        });
        waMsg = `${greeting}\n\n📅 *Today's schedule (${events.length} meeting${events.length === 1 ? '' : 's'}):*\n\n${lines.join('\n')}\n\n_Have a productive day!_ 💪`;
      }

      try { await sendWhatsAppReply(t.phone, waMsg); }
      catch (sendErr) { console.error(`[TENANT DAILY WA] ${t.name}: ${sendErr.message}`); }

      // Email if tenant has one configured
      if (t.email && /@/.test(t.email)) {
        try {
          const html = buildDailyEmailHTML(t.name, events, todayKey);
          await notifications.sendEmail(t.email, `📅 Today's Schedule — ${todayKey}`, html);
        } catch (mailErr) {
          console.error(`[TENANT DAILY EMAIL] ${t.name}: ${mailErr.message}`);
        }
      }

      lastDailySent.set(t.id, todayKey);
      console.log(`[TENANT DAILY] ${t.name} (${todayKey}): ${events.length} meetings`);
    } catch (e) {
      console.error(`[TENANT DAILY] ${t.name}: ${e.message}`);
    }
  }
}

/**
 * Build daily-schedule email HTML (same visual style as MIS Main).
 */
function buildDailyEmailHTML(tenantName, events, dateKey) {
  const headerDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const rows = events.length
    ? events.map(e => {
        const s = new Date(e.start.dateTime || e.start.date);
        const time = s.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${time}</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${(e.summary || 'Meeting').replace(/[<>]/g, '')}</td></tr>`;
      }).join('')
    : `<tr><td style="padding:12px;text-align:center;color:#666" colspan="2">No meetings today 🎉</td></tr>`;

  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
<div style="background:#1a73e8;color:white;padding:16px;text-align:center">
  <h2 style="margin:0">☀️ Today's Schedule</h2>
  <p style="margin:4px 0 0;opacity:0.9">${headerDate}</p>
  ${tenantName ? `<p style="margin:4px 0 0;opacity:0.85;font-size:13px">${tenantName.replace(/[<>]/g, '')}</p>` : ''}
</div>
<div style="padding:16px">
  <table style="width:100%;border-collapse:collapse">
    <tr style="background:#f5f5f5">
      <th style="padding:8px 12px;text-align:left">Time</th>
      <th style="padding:8px 12px;text-align:left">Meeting</th>
    </tr>
    ${rows}
  </table>
</div></div>`;
}

module.exports = {
  checkTenantReminders,
  sendTenantDailySchedules,
  listConnectedTenants,
};
