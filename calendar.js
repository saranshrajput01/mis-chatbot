const { google } = require("googleapis");
const path = require("path");

const KEY_FILE = path.join(__dirname, "logical-craft-438704-n8-d0d8ae886a53.json");
const CALENDAR_ID = "saranshrajput1301@gmail.com";
const TIMEZONE = "Asia/Kolkata";

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});
const calendar = google.calendar({ version: "v3", auth });

// Generate Jitsi Meet link
function generateMeetLink(title) {
  const slug = (title || "meeting").replace(/[^a-zA-Z0-9]/g, "").substring(0, 20);
  const id = Math.random().toString(36).substring(2, 8);
  return `https://meet.jit.si/MIS-${slug}-${id}`;
}

// Create a single event
async function createEvent({ title, startTime, endTime, description, guests, addMeetLink }) {
  const meetLink = addMeetLink !== false ? generateMeetLink(title) : null;
  const desc = [description || "", meetLink ? `\n🔗 Video Call: ${meetLink}` : ""].join("").trim();
  const event = {
    summary: title,
    description: desc,
    start: { dateTime: startTime, timeZone: TIMEZONE },
    end: { dateTime: endTime || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(), timeZone: TIMEZONE },
  };
  if (guests && guests.length) event.attendees = guests.map(e => ({ email: e }));
  const res = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });
  res.data.meetLink = meetLink;
  return res.data;
}

// Get events for a date range
async function getEvents(startDate, endDate) {
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: startDate,
    timeMax: endDate,
    singleEvents: true,
    orderBy: "startTime",
    timeZone: TIMEZONE,
  });
  return res.data.items || [];
}

// Get today's events
async function getTodayEvents() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return getEvents(start, end);
}

// Delete an event
async function deleteEvent(eventId) {
  await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
  return true;
}

// Update an event
async function updateEvent(eventId, updates) {
  const res = await calendar.events.patch({ calendarId: CALENDAR_ID, eventId, resource: updates });
  return res.data;
}

module.exports = { createEvent, getEvents, getTodayEvents, deleteEvent, updateEvent, CALENDAR_ID, TIMEZONE };
