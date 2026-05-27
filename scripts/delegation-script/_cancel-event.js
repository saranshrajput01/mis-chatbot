function handleCancelIntent(result, senderNumber, memoryKey, payload) {
  const calendar = CalendarApp.getDefaultCalendar();

  // ── Strategy 1: Cancel by exact time (user said "3 baje wali meeting")
  if (result.start_time && result.start_time !== "null") {
    const start = parseAIDate(result.start_time);
    const end = new Date(start.getTime() + 12*60 * 60000); // 12hr search window

    const events = calendar.getEvents(start, end);
    if (events.length === 0) {
      sendUniversalReply(senderNumber, `❌ No meeting found around *${result.start_time}*.\n\nTry cancelling by name instead.`);
      return;
    }

    if (events.length === 1) {
      _askCancelConfirmation(events[0], senderNumber, memoryKey, result, payload);
    } else {
      // Multiple events in that window — show a menu
      _showCancelMenu(events, senderNumber, memoryKey, result, payload);
    }
    return;
  }

  // ── Strategy 2: Cancel by guest name (user said "Archit ke saath wali cancel karo")
  if (result.guest_name && result.guest_name !== "null") {
    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // next 30 days
    const allEvents = calendar.getEvents(now, future);

    const guestUpper = result.guest_name.toUpperCase();
    const matched = allEvents.filter(ev =>
      ev.getTitle().toUpperCase().includes(guestUpper)
    );

    if (matched.length === 0) {
      sendUniversalReply(senderNumber,
        `❌ No upcoming meetings found with *"${result.guest_name}"*.`);
      return;
    }

    if (matched.length === 1) {
      _askCancelConfirmation(matched[0], senderNumber, memoryKey, result, payload);
    } else {
      _showCancelMenu(matched.slice(0, 10), senderNumber, memoryKey, result, payload); // max 10
    }
    return;
  }

  // ── Strategy 3: Nothing to go on — show today's meetings for user to pick
  const now = new Date();
  const dayEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const events = calendar.getEvents(now, dayEnd);

  if (events.length === 0) {
    sendUniversalReply(senderNumber, "📅 No meetings found today to cancel.");
    return;
  }

  _showCancelMenu(events, senderNumber, memoryKey, result, payload);
}


// Shows a numbered list of events for the user to pick which to cancel
function _showCancelMenu(events, senderNumber, memoryKey, result, payload) {
  // Store events list in memory so we can retrieve by index
  result._cancelCandidates = events.map(ev => ({
    id: ev.getId(),
    title: ev.getTitle(),
    start: Utilities.formatDate(ev.getStartTime(), "GMT+5:30", "dd MMM YYYY hh:mm a"),
    isRecurring: ev.isRecurringEvent()
  }));

  saveToMemory(memoryKey, result, payload, [], "CANCEL_SELECTION", null);

  let msg = "🗑️ *Which meeting do you want to cancel?*\n\n";
  result._cancelCandidates.forEach((ev, i) => {
    msg += `*${i + 1}.* ${ev.title}\n`;
    msg += `      📅 ${ev.start}`;
    msg += ev.isRecurring ? " _(recurring)_\n\n" : "\n\n";
  });
  msg += "_Reply with the number (e.g., 1)_";

  sendUniversalReply(senderNumber, msg);
}


// Shows confirmation for a single event — and if recurring, asks one-vs-all
function _askCancelConfirmation(event, senderNumber, memoryKey, result, payload) {
   const candidates = result._cancelCandidates;
      var ind = result.chosenIndex;
      var eventDetails = candidates[ind];
      var stime = eventDetails.start;

  const startStr = Utilities.formatDate(event.getStartTime(), "GMT+5:30", "dd MMM yyyy, hh:mm a");
  const isRecurring = eventDetails.isRecurring;//event.isRecurringEvent();

  result.targetEventId = event.getId();
  result.targetIsRecurring = isRecurring;

  saveToMemory(memoryKey, result, payload, [], "CONFIRM_CANCEL", null);

  let msg = `🗑️ *Cancel Confirmation*\n\n`;
  msg += `📌 *"${event.getTitle()}"*\n`;
  msg += `📅 ${stime}\n\n`;

  if (isRecurring) {
    msg += `⚠️ This is a *recurring meeting*.\n\n`;
    msg += `Reply:\n`;
    msg += `*1* — Cancel only this occurrence\n`;
    msg += `*2* — Cancel ALL future occurrences\n`;
    msg += `*NO* — Keep the meeting`;
  } else {
    msg += `Reply *YES* to permanently delete or *NO* to keep it.`;
  }

  sendUniversalReply(senderNumber, msg);
}


// Updated executeCancellation — handles one vs. all for recurring
function executeCancellation(result, senderNumber, memoryKey, userChoice) {
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    const event = calendar.getEventById(result.targetEventId);

    if (!event) {
      sendUniversalReply(senderNumber, "❌ Meeting not found. It may have already been deleted.");
      deleteMemory(memoryKey);
      return;
    }

    const title = event.getTitle();

    if (result.targetIsRecurring && userChoice === "2") {
      // Delete this and all future occurrences
      event.deleteEvent(); // For recurring events this deletes from this point forward
      sendUniversalReply(senderNumber, `✅ *All future occurrences cancelled.*\n📌 _"${title}"_ series has been removed.`);

    } else if (result.targetIsRecurring && userChoice === "1") {
      var candidates = result._cancelCandidates;
      var ind = result.chosenIndex;
      var eventDetails = candidates[ind];
      var stime = (eventDetails.start);
      var evId = eventDetails.id;
      var targetDate = new Date(stime); // exact event time
      // var wholeDay = new Date(targetDate.setTime(0,0,0,0))
      var evts = calendar.getEventsForDay(targetDate);

      evts.forEach(ev => {
        const eventSeries = ev.getEventSeries();
        
        console.log([eventSeries.getId(),
        result.targetEventId,
        ev.getStartTime(),
        targetDate.getTime()])
        
        if (
          eventSeries &&
          eventSeries.getId() === result.targetEventId &&
          ev.getStartTime().getTime() === targetDate.getTime()
        ) {
          ev.deleteEvent(); // deletes ONLY this occurrence
          Logger.log("Deleted exact instance");
          sendUniversalReply(senderNumber, `✅ *Selected occurrence has been cancelled.*\n📌 _"${title}"_ occurrence of selected date has been removed.`);
        }
      });




    }
    else {
      // Delete only this single occurrence
      event.deleteEvent();
      sendUniversalReply(senderNumber, `✅ *Meeting cancelled.*\n📌 _"${title}"_ has been removed from your calendar.`);
    }

    // sendCancellationEmail(guestEmail, event, matchedUser, isSeries); // Note: call BEFORE deleteEvent in production

    deleteMemory(memoryKey);
  } catch (e) {
    console.error("Cancel error:", e.stack);
    sendUniversalReply(senderNumber, "❌ Error cancelling: " + e.message);
  }
}
