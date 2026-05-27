function handleRetrievalIntent(result, senderNumber) {
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const IST = "GMT+5:30";

  // ── STEP 1: Determine window ────────────────────────────────────────
  // Primary signal: retrieval_scope from AI
  // Fallback: keyword scan on transcript if scope missing
  const scope = String(result.retrieval_scope || "").toUpperCase().trim();
  const transcript = String(result.transcript || "").toLowerCase();

  // Keyword fallbacks (catches cases where AI didn't return scope correctly)
  const hasToday = /\baaj\b|\btoday\b|\babhi\b|\bfilhaal\b/.test(transcript);
  const hasTomorrow = /\bkal\b|\btomorrow\b|\baane wala\b|\bnext day\b/.test(transcript);
  const hasWeek = /\bweek\b|\bhafte\b|\bis hafte\b|\b7 din\b/.test(transcript);
  const hasGuest = result.guest_name && result.guest_name !== "null";

  let windowStart, windowEnd, windowLabel;
  let filterByGuest = false;   // when true, filter events by guest name
  let showDayPrefix = false;   // when true, show "Mon 28 Mar ·" before each time

  if (scope === "WEEK" || (!scope && hasWeek)) {
    windowStart = new Date(now); windowStart.setHours(0, 0, 0, 0);
    windowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    windowLabel = "This Week";
    showDayPrefix = true;

  } else if (scope === "TOMORROW" || (!scope && hasTomorrow)) {
    windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() + 1);
    windowStart.setHours(0, 0, 0, 0);
    windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
    windowLabel = "Tomorrow · " + Utilities.formatDate(windowStart, IST, "dd MMM yyyy");

  } else if ((scope === "DATE" || scope === "GUEST") && result.start_time && result.start_time !== "null") {
    // AI gave us a specific date — use it, but never go before today
    windowStart = parseAIDate(result.start_time);
    windowStart.setHours(0, 0, 0, 0);
    const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0);
    // Safety: if parsed date is before today, fall back to today
    if (windowStart < todayMidnight) windowStart = todayMidnight;
    windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
    windowLabel = Utilities.formatDate(windowStart, IST, "EEEE, dd MMM yyyy");
    if (scope === "GUEST" || hasGuest) filterByGuest = true;

  } else if (scope === "GUEST" || (!scope && hasGuest && !hasToday && !hasTomorrow)) {
    // "Archit ki meetings" with no date → next 30 days
    windowStart = new Date(now);
    windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    windowLabel = `Meetings with ${result.guest_name}`;
    filterByGuest = true;
    showDayPrefix = true;

  } else if (scope === "TODAY" || (!scope && hasToday)) {
    // Explicit today request
    windowStart = new Date(now);
    windowEnd = new Date(now); windowEnd.setHours(23, 59, 59, 0);
    windowLabel = "Today · " + Utilities.formatDate(now, IST, "dd MMM yyyy");

  } else {
    // GENERAL or no scope — show rest of today
    windowStart = new Date(now);
    windowEnd = new Date(now); windowEnd.setHours(23, 59, 59, 0);
    windowLabel = "Today · " + Utilities.formatDate(now, IST, "dd MMM yyyy");
  }

  // ── STEP 2: Fetch and optionally filter events ──────────────────────
  let allEvents = calendar.getEvents(windowStart, windowEnd);

  if (filterByGuest && hasGuest) {
    const guestUpper = result.guest_name.toUpperCase();
    allEvents = allEvents.filter(ev =>
      ev.getTitle().toUpperCase().includes(guestUpper) ||
      ev.getGuestList().some(g =>
        (g.getName() || g.getEmail()).toUpperCase().includes(guestUpper)
      )
    );
  }

  // ── STEP 3: Empty state ─────────────────────────────────────────────
  if (allEvents.length === 0) {
    let emptyMsg = `📅 *${windowLabel}*\n\n`;
    if (filterByGuest) {
      emptyMsg += `✅ No meetings found with *${result.guest_name}*.\n`;
      emptyMsg += `_Try asking for a wider date range._`;
    } else {
      emptyMsg += `✅ No meetings scheduled. Your calendar is free!`;
    }
    sendUniversalReply(senderNumber, emptyMsg);
    return;
  }

  // ── STEP 4: Cap at 50 ───────────────────────────────────────────────
  const MAX = 50;
  const shown = allEvents.slice(0, MAX);
  const extra = allEvents.length - MAX;

  // ── STEP 5: Count live meetings for footer ──────────────────────────
  const liveCount = allEvents.filter(ev =>
    ev.getStartTime() <= now && ev.getEndTime() > now
  ).length;

  // ── STEP 6: Build message ───────────────────────────────────────────
  let msg = `📅 *${windowLabel}*\n${"─".repeat(24)}\n\n`;

  shown.forEach((ev, i) => {
    const evStart = ev.getStartTime();
    const evEnd = ev.getEndTime();
    const isAllDay = ev.isAllDayEvent();
    const startT = Utilities.formatDate(evStart, IST, "hh:mm a");
    const endT = Utilities.formatDate(evEnd, IST, "hh:mm a");
    const timeStr = isAllDay ? "All Day" : `${startT} → ${endT}`;
    const venue = ev.getLocation() || "—";

    // Badges
    const isLive = !isAllDay && evStart <= now && evEnd > now;
    const isSoon = !isAllDay && !isLive && evStart > now
      && (evStart - now) <= 30 * 60 * 1000; // within 30 min
    const liveBadge = isLive ? " 🟢 *LIVE*" : "";
    const soonBadge = isSoon ? " 🔔 *SOON*" : "";
    const recurBadge = ev.isRecurringEvent() ? " 🔁" : "";

    // Day prefix for week and guest views
    const dayPrefix = showDayPrefix
      ? `_${Utilities.formatDate(evStart, IST, "EEE, dd MMM")}_\n      `
      : "";

    // Guests — safe wrapped, max 2 names
    let guestLine = null;
    try {
      const guests = ev.getGuestList();
      if (guests.length > 0) {
        const names = guests.slice(0, 2)
          .map(g => (g.getName() || g.getEmail().split("@")[0]).trim())
          .filter(Boolean);
        const overflow = guests.length > 2 ? ` +${guests.length - 2}` : "";
        guestLine = names.join(", ") + overflow;
      }
    } catch (_) { /* safe — some event types don't support getGuestList */ }

    msg += `*${i + 1}.* 📌 *${ev.getTitle()}*${recurBadge}${liveBadge}${soonBadge}\n`;
    msg += `      ${dayPrefix}🕐 ${timeStr}\n`;
    msg += `      📍 ${venue}\n`;
    if (guestLine) msg += `      👥 ${guestLine}\n`;
    msg += `\n`;
  });

  // ── STEP 7: Footer ──────────────────────────────────────────────────
  if (extra > 0) msg += `_...and ${extra} more not shown._\n\n`;
  msg += `_Total: ${allEvents.length} meeting(s)`;
  if (liveCount > 0) msg += ` · ${liveCount} live now`;
  msg += `_`;

  sendUniversalReply(senderNumber, msg);
}



function handleRetrievalIntent1apr(result, senderNumber) {
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();

  let windowStart, windowEnd, windowLabel;

  // ── Detect query type from transcript ──────────────────────────────
  const transcript = String(result.transcript || "").toLowerCase();
  const isWeekQuery = transcript.includes("week") || transcript.includes("hafte")
    || transcript.includes("weekly") || transcript.includes("is hafte");
  const isTomorrow = transcript.includes("kal") || transcript.includes("tomorrow")
    || transcript.includes("aane wala");

  if (isWeekQuery) {
    // "Is hafte ki meetings" → next 7 days from today
    windowStart = new Date(now);
    windowStart.setHours(0, 0, 0, 0);
    windowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    windowLabel = "This Week";

  } else if (isTomorrow && (!result.start_time || result.start_time === "null")) {
    // "Kal ki meetings" but AI didn't parse a date → build tomorrow manually
    windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() + 1);
    windowStart.setHours(0, 0, 0, 0);
    windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
    windowLabel = "Tomorrow";

  } else if (result.start_time && result.start_time !== "null") {
    // AI extracted a specific date
    windowStart = parseAIDate(result.start_time);
    windowStart.setHours(0, 0, 0, 0);
    windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
    windowLabel = Utilities.formatDate(windowStart, "GMT+5:30", "dd MMM yyyy");

  } else {
    // Default: rest of today
    windowStart = new Date(now);
    windowEnd = new Date(now);
    windowEnd.setHours(23, 59, 59, 0);
    windowLabel = "Today";
  }

  const allEvents = calendar.getEvents(windowStart, windowEnd);

  if (allEvents.length === 0) {
    const dayName = isWeekQuery ? "this week" : windowLabel;
    sendUniversalReply(senderNumber,
      `📅 *${windowLabel}*\n\n✅ No meetings scheduled. Your calendar is free!`);
    return;
  }

  // ── Cap at 10, note overflow ────────────────────────────────────────
  const MAX = 10;
  const shown = allEvents.slice(0, MAX);
  const extra = allEvents.length - MAX;

  // ── Build message ───────────────────────────────────────────────────
  let msg = `📅 *Meetings — ${windowLabel}*\n${"─".repeat(22)}\n\n`;

  shown.forEach((ev, i) => {
    const evStart = ev.getStartTime();
    const evEnd = ev.getEndTime();
    const startT = Utilities.formatDate(evStart, "GMT+5:30", "hh:mm a");
    const endT = Utilities.formatDate(evEnd, "GMT+5:30", "hh:mm a");
    const venue = ev.getLocation() || "—";
    const recurring = ev.isRecurringEvent() ? " 🔁" : "";

    // For week view show the day name so user knows which day each meeting is on
    const dayLabel = isWeekQuery
      ? Utilities.formatDate(evStart, "GMT+5:30", "EEE, dd MMM") + " · "
      : "";

    // Live badge — show if this meeting is happening right now
    const isLive = evStart <= now && evEnd > now;
    const liveBadge = isLive ? " 🟢 *LIVE*" : "";

    // Guest names — up to 2, then "+N more"
    const guests = ev.getGuestList();
    const guestLine = guests.length > 0
      ? guests.slice(0, 2).map(g => g.getName() || g.getEmail().split("@")[0]).join(", ")
      + (guests.length > 2 ? ` +${guests.length - 2} more` : "")
      : null;

    msg += `*${i + 1}.* 📌 ${ev.getTitle()}${recurring}${liveBadge}\n`;
    msg += `      🕐 ${dayLabel}${startT} → ${endT}\n`;
    msg += `      📍 ${venue}\n`;
    if (guestLine) msg += `      👥 ${guestLine}\n`;
    msg += `\n`;
  });

  if (extra > 0) msg += `_...${extra} more meeting(s) not shown._\n\n`;
  msg += `_Total: ${allEvents.length} meeting(s)_`;

  sendUniversalReply(senderNumber, msg);
}



function handleRetrievalIntent31march(result, senderNumber) {
  const calendar = CalendarApp.getDefaultCalendar();

  // Determine the time window to show
  let windowStart, windowEnd, windowLabel;

  if (result.start_time && result.start_time !== "null") {
    // User asked about a specific date
    windowStart = parseAIDate(result.start_time);
    windowStart.setHours(0, 0, 0, 0);
    windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
    windowLabel = Utilities.formatDate(windowStart, "GMT+5:30", "dd MMM yyyy");
  } else {
    // Default: rest of today
    windowStart = new Date();
    windowEnd = new Date();
    windowEnd.setHours(23, 59, 59, 0);
    windowLabel = "Today";
  }

  const events = calendar.getEvents(windowStart, windowEnd);

  if (events.length === 0) {
    sendUniversalReply(senderNumber,
      `📅 *${windowLabel}*\n\n✅ No meetings scheduled. Your calendar is free!`);
    return;
  }

  let msg = `📅 *Meetings — ${windowLabel}*\n${"─".repeat(22)}\n\n`;

  events.forEach((ev, i) => {
    const startT = Utilities.formatDate(ev.getStartTime(), "GMT+5:30", "hh:mm a");
    const endT = Utilities.formatDate(ev.getEndTime(), "GMT+5:30", "hh:mm a");
    const venue = ev.getLocation() || "—";
    const recurring = ev.isRecurringEvent() ? " 🔁" : "";

    msg += `*${i + 1}.* 📌 ${ev.getTitle()}${recurring}\n`;
    msg += `      🕐 ${startT} → ${endT}\n`;
    msg += `      📍 ${venue}\n\n`;
  });

  msg += `_Total: ${events.length} meeting(s)_`;
  sendUniversalReply(senderNumber, msg);
}
