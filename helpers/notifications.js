const nodemailer = require("nodemailer");
const path = require("path");
const gcal = require("../calendar");

const OWNER_PHONE = "918178525310";

// Gmail transporter via App Password
const gmailTransporter = (() => {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) { console.log("[EMAIL] No GMAIL_APP_PASSWORD set"); return null; }
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: "saranshrajput1301@gmail.com", pass }
  });
})();

async function sendEmail(to, subject, html) {
  if (!gmailTransporter) { console.log("[EMAIL] No transporter configured"); return; }
  try {
    await gmailTransporter.sendMail({ from: '"MIS Calendar" <saranshrajput1301@gmail.com>', to, subject, html });
    console.log(`[EMAIL] Sent to ${to}: ${subject}`);
  } catch(e) { console.error("[EMAIL ERROR]", e.message); }
}

function formatBookingConfirmation(event, parsed) {
  const start = new Date(parsed.startTime);
  const end = parsed.endTime ? new Date(parsed.endTime) : new Date(start.getTime() + 3600000);
  const time = start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const endTime = end.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const date = start.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `✅ *MEETING CONFIRMED*\n\n📌 *${event.summary}*\n📅 ${date}\n⏰ ${time} - ${endTime}\n${parsed.description ? `📝 ${parsed.description}\n` : ""}${event.meetLink ? `🔗 Meet: ${event.meetLink}\n` : ""}${event.htmlLink ? `📎 Calendar: ${event.htmlLink}\n` : ""}\n_You will get a reminder 15 minutes before._`;
}

function formatBookingEmailHTML(event, parsed) {
  const start = new Date(parsed.startTime);
  const end = parsed.endTime ? new Date(parsed.endTime) : new Date(start.getTime() + 3600000);
  const time = start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const endTime = end.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const date = start.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
<div style="background:#4CAF50;color:white;padding:16px;text-align:center"><h2 style="margin:0">✅ Meeting Confirmed</h2></div>
<div style="padding:20px">
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:8px 0;color:#666">Title</td><td style="padding:8px 0;font-weight:bold">${event.summary}</td></tr>
<tr><td style="padding:8px 0;color:#666">Date</td><td style="padding:8px 0">${date}</td></tr>
<tr><td style="padding:8px 0;color:#666">Time</td><td style="padding:8px 0">${time} - ${endTime}</td></tr>
${event.meetLink ? `<tr><td style="padding:8px 0;color:#666">Video Call</td><td style="padding:8px 0"><a href="${event.meetLink}" style="color:#1a73e8">${event.meetLink}</a></td></tr>` : ""}
${parsed.description ? `<tr><td style="padding:8px 0;color:#666">Notes</td><td style="padding:8px 0">${parsed.description}</td></tr>` : ""}
</table>
${event.htmlLink ? `<a href="${event.htmlLink}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#1a73e8;color:white;text-decoration:none;border-radius:4px">Open in Calendar</a>` : ""}
</div></div>`;
}

function formatCancellationEmailHTML(events, reason) {
  const list = events.map(e => {
    const s = new Date(e.start?.dateTime || e.start?.date || e.event_date);
    return `<li style="padding:4px 0"><strong>${e.summary || e.event_title}</strong> — ${s.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</li>`;
  }).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
<div style="background:#f44336;color:white;padding:16px;text-align:center"><h2 style="margin:0">❌ Meeting Cancelled</h2></div>
<div style="padding:20px"><ul style="list-style:none;padding:0">${list}</ul>
<p style="color:#666;margin-top:12px"><strong>Reason:</strong> ${reason}</p></div></div>`;
}

async function logBooking(supabase, event, parsed, action = "booked") {
  try {
    await supabase.from("calendar_logs").insert({
      event_id: event.id || null, action,
      event_title: event.summary || parsed.title,
      event_date: parsed.startTime,
      reason: parsed.description || null,
      cancelled_at: action === "booked" ? null : new Date().toISOString()
    });
  } catch(e) { console.error("[BOOKING LOG ERROR]", e.message); }
}

async function sendBookingNotifications(supabase, sendWhatsAppReply, event, parsed, phone) {
  const waMsg = formatBookingConfirmation(event, parsed);
  await sendWhatsAppReply(phone || OWNER_PHONE, waMsg);
  if (parsed.guests && parsed.guests.length) {
    const html = formatBookingEmailHTML(event, parsed);
    for (const guest of parsed.guests) {
      if (guest.includes("@")) await sendEmail(guest, `Meeting Confirmed: ${event.summary}`, html);
    }
  }
  await sendEmail("saranshrajput1301@gmail.com", `Meeting Booked: ${event.summary}`, formatBookingEmailHTML(event, parsed));
  await logBooking(supabase, event, parsed, "booked");
}

async function sendCancellationNotifications(events, reason) {
  await sendEmail("saranshrajput1301@gmail.com", `Meeting Cancelled: ${events.map(e => e.summary || e.event_title).join(", ")}`, formatCancellationEmailHTML(events, reason));
}

// ── MEETING REMINDERS ─────────────────────────────────────────────────────
const sentReminders = new Set();

async function checkMeetingReminders(sendWhatsAppReply, supabase) {
  try {
    const now = new Date();
    const in15 = new Date(now.getTime() + 15 * 60 * 1000);
    const in16 = new Date(now.getTime() + 16 * 60 * 1000);
    const events = await gcal.getEvents(in15.toISOString(), in16.toISOString());
    for (const e of events) {
      if (sentReminders.has(e.id)) continue;
      const start = new Date(e.start.dateTime || e.start.date);
      const time = start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      const msg = `🔔 *REMINDER — 15 min mein meeting!*\n\n📌 ${e.summary}\n⏰ ${time}\n${e.htmlLink ? `🔗 ${e.htmlLink}` : ""}`;
      await sendWhatsAppReply(OWNER_PHONE, msg);
      sentReminders.add(e.id);
      if (sentReminders.size > 100) sentReminders.clear();
    }
  } catch(e) { console.error("[REMINDER ERROR]", e.message); }
}

// ── DAILY MORNING SCHEDULE ────────────────────────────────────────────────
let lastDailySent = "";

async function sendDailySchedule(sendWhatsAppReply, supabase) {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayKey = ist.toISOString().split("T")[0];
  if (ist.getHours() !== 8 || lastDailySent === todayKey) return;
  lastDailySent = todayKey;
  try {
    const events = await gcal.getTodayEvents();
    let msg;
    if (!events.length) {
      msg = `☀️ *Good Morning, Saransh!*\n\n📅 No meetings scheduled today.\n\nEnjoy a relaxed day! 🎉`;
    } else {
      const lines = events.map((e, i) => {
        const s = new Date(e.start.dateTime || e.start.date);
        const time = s.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        return `${i + 1}. ⏰ ${time} — ${e.summary}`;
      });
      msg = `☀️ *Good Morning, Saransh!*\n\n📅 *Today's schedule (${events.length} meetings):*\n\n${lines.join("\n")}\n\n_Have a productive day!_ 💪`;
    }
    await sendWhatsAppReply(OWNER_PHONE, msg);
    const htmlEvents = events.length ? events.map(e => {
      const s = new Date(e.start.dateTime || e.start.date);
      return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${s.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</td><td style="padding:6px 12px;border-bottom:1px solid #eee">${e.summary}</td></tr>`;
    }).join("") : `<tr><td style="padding:12px;text-align:center;color:#666" colspan="2">No meetings today 🎉</td></tr>`;
    await sendEmail("saranshrajput1301@gmail.com", `📅 Today's Schedule — ${todayKey}`,
      `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
<div style="background:#1a73e8;color:white;padding:16px;text-align:center"><h2 style="margin:0">☀️ Today's Schedule</h2><p style="margin:4px 0 0;opacity:0.9">${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
<div style="padding:16px"><table style="width:100%;border-collapse:collapse"><tr style="background:#f5f5f5"><th style="padding:8px 12px;text-align:left">Time</th><th style="padding:8px 12px;text-align:left">Meeting</th></tr>${htmlEvents}</table></div></div>`);
    console.log(`[DAILY SCHEDULE] Sent for ${todayKey} — ${events.length} meetings`);
  } catch(e) { console.error("[DAILY SCHEDULE ERROR]", e.message); }
}

module.exports = {
  OWNER_PHONE, sendEmail,
  formatBookingConfirmation, formatBookingEmailHTML, formatCancellationEmailHTML,
  logBooking, sendBookingNotifications, sendCancellationNotifications,
  checkMeetingReminders, sendDailySchedule
};
