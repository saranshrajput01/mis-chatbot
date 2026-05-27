/**
 * Tenant Calendar — OAuth2 flow + per-tenant calendar operations
 */
const { google } = require('googleapis');

// Phase 22 Sprint 1.2 — read base URL from env so a single .env change
// updates all OAuth redirects.
const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
const REDIRECT_URI = `${BASE_URL}/api/tenant/calendar/callback`;
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TIMEZONE = 'Asia/Kolkata';

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

function getAuthURL(tenantId) {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: tenantId // pass tenant ID through OAuth flow
  });
}

async function exchangeCode(code) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

function getCalendarClient(refreshToken) {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: 'v3', auth: client });
}

// ═══ CALENDAR OPERATIONS (per-tenant) ═══

function generateMeetLink(title) {
  const slug = (title || 'meeting').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  const id = Math.random().toString(36).substring(2, 8);
  return `https://meet.jit.si/SB-${slug}-${id}`;
}

async function createEvent(refreshToken, calendarId, { title, startTime, endTime, description, guests }) {
  const cal = getCalendarClient(refreshToken);
  const meetLink = generateMeetLink(title);
  const desc = [description || '', `\n🔗 Video Call: ${meetLink}`].join('').trim();

  const event = {
    summary: title,
    description: desc,
    start: { dateTime: startTime, timeZone: TIMEZONE },
    end: { dateTime: endTime || new Date(new Date(startTime).getTime() + 3600000).toISOString(), timeZone: TIMEZONE },
  };
  if (guests && guests.length) event.attendees = guests.map(e => ({ email: e }));

  const res = await cal.events.insert({ calendarId: calendarId || 'primary', resource: event });
  res.data.meetLink = meetLink;
  return res.data;
}

async function getEvents(refreshToken, calendarId, startDate, endDate) {
  const cal = getCalendarClient(refreshToken);
  const res = await cal.events.list({
    calendarId: calendarId || 'primary',
    timeMin: startDate,
    timeMax: endDate,
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: TIMEZONE,
  });
  return res.data.items || [];
}

async function getTodayEvents(refreshToken, calendarId) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return getEvents(refreshToken, calendarId, start, end);
}

async function deleteEvent(refreshToken, calendarId, eventId) {
  const cal = getCalendarClient(refreshToken);
  await cal.events.delete({ calendarId: calendarId || 'primary', eventId });
  return true;
}

async function updateEvent(refreshToken, calendarId, eventId, updates) {
  const cal = getCalendarClient(refreshToken);
  const res = await cal.events.patch({ calendarId: calendarId || 'primary', eventId, resource: updates });
  return res.data;
}

module.exports = { getAuthURL, exchangeCode, getOAuth2Client, createEvent, getEvents, getTodayEvents, deleteEvent, updateEvent, TIMEZONE };
