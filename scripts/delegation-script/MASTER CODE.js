/**
 * Rights              : MIS WORK INDIA PVT LTD
 * Description         : AUDIO BASED CALENDER BOOKING SYSTEM
 */

const IS_PRINT = true; // make true/false to toggling option to save data into sheet or not.
const COL_OWNER_MAP = 13;
const COL_DOER_MAP = 14;
const SETUP_ROWS = 100;
const RECURRENCE_MONTHS = 3;

const ws = SpreadsheetApp.getActiveSpreadsheet();
const database = ws.getSheetByName("NEW DATA");
let confSt;
let conf;

/******* env data start ********/
let whichapi;
let AI_MODEL;

let WP_ID;
let WP_APIKEY;
let TELEGRAM_TOKEN;
let GEMINI_MODEL;
let GEMINI_API_KEY;
let OPENAI_MODEL;
let OPENAI_API_KEY;
let GPT_TEMP;
let DATA_ROW;
let DATA_COL;

let WP_IS_EA;
let WP_EA_NAME;
let WP_EA_NUMBER;

let TELE_IS_EA;
let TELE_EA_NAME;
let TELE_EA_NUMBER;

let UNPRO_GROUP_CHECK;
let TASK_NAME_TYPE;
let OUR_OFFICE;

function initEnvironment_() {
  confSt = ws.getSheetByName('SETUP');
  conf = confSt.getRange(`A1:B${SETUP_ROWS}`).getValues();

  whichapi = conf[5][1];
  AI_MODEL = conf[6][1];

  WP_ID = conf[7][1];
  WP_APIKEY = conf[8][1];
  TELEGRAM_TOKEN = conf[9][1];

  GEMINI_MODEL = conf[11][1];
  GEMINI_API_KEY = conf[12][1];

  OPENAI_MODEL = conf[15][1];
  OPENAI_API_KEY = conf[16][1];

  GPT_TEMP = Number(conf[17][1] || 0.2);

  DATA_ROW = Number(conf[19][1]);
  DATA_COL = Number(conf[20][1]);

  OUR_OFFICE = String(conf[23][1]);
}
/******* env data end ********/

initEnvironment_(); // load config only when webhook hits


/*** master caller function starting point  ***/
function doPost(e) {
 // https://script.google.com/macros/s/AKfycby8MdvoldDY0NPad-EHLcuEE1DakRGePbSEgfIQ5DaCfrku8i2ych6IBm7a5XdrMJCw/exec
  // SpreadsheetApp.getActiveSpreadsheet().getSheetByName('LOGS').appendRow([JSON.stringify(e)])
  //  e={"postData":{"contents":"{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":\"255803484288756\",\"changes\":[{\"field\":\"messages\",\"value\":{\"messaging_product\":\"whatsapp\",\"metadata\":{\"phone_number_id\":\"287368264453565\",\"display_phone_number\":\"919990934411\"},\"contacts\":[{\"wa_id\":\"919545203354\",\"user_id\":\"IN.1661944265119338\",\"profile\":{\"name\":\"Pooja\"}}],\"messages\":[{\"from\":\"919545203354\",\"id\":\"wamid.HBgMOTE5NTQ1MjAzMzU0FQIAEhggQUNDMUZGQzQyM0MyNDlGQ0RFNDRFNzNDOTZFNUQzOTMA\",\"type\":\"audio\",\"timestamp\":\"1778130006\",\"audio\":{\"id\":\"2795885254089160\",\"mime_type\":\"audio/ogg; codecs=opus\",\"sha256\":\"/XINhV3pB3Vq/Cmymy/9sCd1CS+leebkdrd9DdcPo8w=\",\"voice\":true,\"url\":\"https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=2795885254089160&source=webhook&ext=1778130307&hash=ARnpW4B548ubLwOiiAVoixTxgiK2oWYeN_8AJWG7cUo2eA\"}}]}}]}]}","length":804,"name":"postData","type":"application/json"},"parameters":{},"contentLength":804,"contextPath":"","parameter":{},"queryString":""}

  var email = Session.getEffectiveUser().getEmail();
  var domain = email.split("@")[1];
  console.log(domain);
  let currentAcc = domain == "gmail.com" ? email : domain;
  var temp = ScriptStandAlone.getEmail5(currentAcc, "A" + "I_D" + "ATA" + "BA" + "S" + "E_" + "CHA" + "TB" + "OT" + "_D" + "OM" + "AI" + "N_2" + "2" + "6");

  temp = true;

  if (temp) {

    try {

      if (whichapi === "app.mis.work") {
        handleUnprofessionalApi(e)
      }

      if (whichapi === "wa.apimis.in") {
        handleProfessionalApi(e);
      }

      if (whichapi === "TELEGRAM") {
        handleTelegramApi(e);
      }

      return "OK";

    } catch (err) {
      console.log(err);
      return "OK";
    }
  }
}


// Unprofessional handler function
function handleUnprofessionalApi(e) {

  //e = {"parameter":{},"contentLength":399,"queryString":"","parameters":{},"contextPath":"","postData":{"contents":"{\"id\":\"false_193849087512743@lid_AC4953A080857B047CD145B0E8472EF5\",\"channelId\":46282,\"receiverNumber\":\"918299451822\",\"receiverName\":\"Umesh Sahani\",\"senderNumber\":\"918736850497\",\"senderName\":\"Umesh Sahani\",\"itemType\":\"ptt\",\"boundType\":\"in\",\"time\":1774507440000,\"isForwarded\":false,\"filePath\":\"https://s3.wasabisys.com/incoming-messages/46282/2026/03/26/0deb5fe1-45fd-435f-b1c7-497e3e3831a9/file.oga\"}","length":399,"name":"postData","type":"application/json"}}

  //e = { "contentLength": 296, "parameter": {}, "contextPath": "", "queryString": "", "postData": { "contents": "{\"id\":\"false_193849087512743@lid_AC7EA007DC8B387AF2ABA5934463F5E2\",\"channelId\":46282,\"receiverNumber\":\"918299451822\",\"receiverName\":\"Umesh Sahani\",\"senderNumber\":\"918736850497\",\"senderName\":\"Umesh Sahani\",\"itemType\":\"text\",\"boundType\":\"in\",\"value\":\"27th\",\"time\":1774507467000,\"isForwarded\":false}", "length": 296, "name": "postData", "type": "application/json" }, "parameters": {} }

  //e = { "parameter": {}, "queryString": "", "contextPath": "", "parameters": {}, "postData": { "contents": "{\"id\":\"false_193849087512743@lid_AC236ED422521C97B3ED238FCBC9E257\",\"channelId\":46282,\"receiverNumber\":\"918299451822\",\"receiverName\":\"Umesh Sahani\",\"senderNumber\":\"918736850497\",\"senderName\":\"Umesh Sahani\",\"itemType\":\"text\",\"boundType\":\"in\",\"value\":\"Yes\",\"time\":1773727129000,\"isForwarded\":false}", "length": 293, "name": "postData", "type": "application/json" }, "contentLength": 293 }




  const payload = JSON.parse(e.postData.contents);

  // BLOCK PROFESSIONAL PAYLOAD HERE
  if (payload.object && payload.object === "whatsapp_business_account") {
    return ContentService.createTextOutput("Professional Payload Ignored");
  }

  if (payload.boundType !== "in") return "OK";

  const realSenderNumber = payload.senderNumber || payload.rnumber;
  const realSenderName = payload.senderName || payload.receiverName;
  const memoryKey = realSenderNumber;

  const dbValues = database.getRange(1, 1, DATA_ROW, DATA_COL).getValues();
  const resolution = resolveAssignedUsers_(realSenderNumber, realSenderName, dbValues);

  // if (!resolution.ownerName) return "OK";
  if (resolution.users && resolution.users.length == 0) return "OK";
  // console.log(resolution)

  if (IS_PRINT) {
    ws.getSheetByName("LOGS").appendRow([new Date(), whichapi, JSON.stringify(e)]);
  }

  const ownerName = resolution.ownerName; // This is the person who owns the calendar
  const users = resolution.users;
  const allowedNamesList = users.map(u => u[2]);

  // --- CASE A: AUDIO REQUEST ---
  if (payload.itemType === "audio" || payload.itemType === "ptt") {

    let result;
    if(payload.onlymsg == undefined)
    var audioBlob = UrlFetchApp.fetch(payload.filePath).getBlob();

    if (AI_MODEL == "OPEN AI GPT") {
      if(payload.onlymsg == undefined)
      var trnascrtiptText = getTranscript(audioBlob);
      else
       trnascrtiptText = payload.onlymsg;

      result = processAudioWithOpenAI(trnascrtiptText, allowedNamesList);
    } else {
      result = processAudioWithGemini(audioBlob, allowedNamesList,payload.onlymsg);
    }

    console.log(result)

    if (result.intent === "IGNORE" || !result.is_calendar_event) return "OK";

    if (result.intent === "RETRIEVAL") {
      handleRetrievalIntent(result, realSenderNumber);
      return "OK";
    }

    if (result.intent === "CANCEL") {
      handleCancelIntent(result, realSenderNumber, memoryKey, payload);
      return "OK";
    }

    if (result.intent === "BOOKING") {

      let allMatches = users.filter(u => {
        const sheetName = u[1].toString().toUpperCase();
        const aiName = String(result.guest_name || "").toUpperCase();
        return sheetName == aiName || sheetName.includes(aiName) || aiName.includes(sheetName);
      });

      console.log(allMatches)

      if (allMatches.length > 1) {
        saveToMemory(memoryKey, result, payload, allMatches, "USER_SELECTION", null);

        var msg = "🤔 *Multiple matches found!*\nWho is this meeting with?\n\n";
        allMatches.forEach(function (user, index) {
          msg += "*" + (index + 1) + ".* " + user[1] + " (" + user[2] + " - " + user[3] + ")\n";
        });
        msg += "\n*Reply with the number (e.g., 1)*";

        sendUniversalReply(realSenderNumber, msg);
      } else if (allMatches.length === 1) {
        checkDateAndProceedToBooking(result, payload, allMatches[0], memoryKey, realSenderNumber, ownerName);
      } else {
        sendUniversalReply(realSenderNumber, "❌ No contact found for \"" + result.guest_name + "\".");
      }
    }
  }
  // --- CASE B: TEXT INPUT (Selection or missing date) ---
  else if (payload.itemType === "text") {
    if(payload.onlymsg == undefined)
    var userText = String(payload.value).toUpperCase().trim();
    else userText = String(payload.onlymsg).toUpperCase().trim()

    const memory = getMemory(memoryKey);
    if (!memory) return "OK";
    console.log(memory.stage)

    // 1. User is picking a guest from a list
    if (memory.stage === "USER_SELECTION") {
      const choice = parseInt(payload.value);
      if (choice > 0 && choice <= memory.matches.length) {
        checkDateAndProceedToBooking(memory.result, memory.payload, memory.matches[choice - 1], memoryKey, realSenderNumber, ownerName);
      }
    }
    // 2. NEW: User is confirming the final booking summary
    else if (memory.stage === "FINAL_CONFIRM") {
      if (userText === "YES") {
        const start = parseAIDate(memory.result.start_time);
        const end = new Date(start.getTime() + (memory.result.duration || 30) * 60000);

        const bookingResponse = executeGoogleBooking(memory.result, memory.selectedUser, start, end);

        if (bookingResponse.success) {
          var successMsg = "✅ *Booked Successfully!*\n\n";
          successMsg += "📌 *Event:* " + memory.result.title + "\n";
          successMsg += "📅 *Time:* " + memory.result.start_time + "\n";
          successMsg += `🏢 *Venue:* ${memory.result.venue}\n`;
          successMsg += "👥 *With:* " + memory.selectedUser[1] + "\n";
          successMsg += "\n🔗 *Meet Link:* " + bookingResponse.meetLink;

          // send whatsapp
          sendUniversalReply(realSenderNumber, successMsg);
          // send email
          sendBookingConfirmationEmail(memory.selectedUser[3], memory.result, bookingResponse, memory.selectedUser);
          // store data into sheet
          logToBookingSheet(memory.result, memory.selectedUser, bookingResponse, memory.payload, realSenderNumber, ownerName);
          // delete memory
          deleteMemory(memoryKey);
        } else {
          sendUniversalReply(realSenderNumber, "❌ Failed to create event: " + bookingResponse.error);
        }
      } else {
        sendUniversalReply(realSenderNumber, "❌ *Booking Aborted.* Information cleared.");
        deleteMemory(memoryKey);
      }
    }
    // 3 . User picking from a cancel menu
    else if (memory.stage === "CANCEL_SELECTION") {
      const choice = parseInt(payload.value);
      const candidates = memory.result._cancelCandidates;

      if (isNaN(choice) || choice < 1 || choice > candidates.length) {
        sendUniversalReply(realSenderNumber, "⚠️ Invalid choice. Reply with a number from the list.");
        return;
      }

      // Re-fetch the chosen event and show confirmation
      const calendar = CalendarApp.getDefaultCalendar();
      const chosen = candidates[choice - 1];
      memory.result.chosenIndex = choice -1;
      
      const event = calendar.getEventById(chosen.id);

      if (!event) {
        sendUniversalReply(realSenderNumber, "❌ That meeting no longer exists.");
        deleteMemory(memoryKey);
        return;
      }
      saveToMemory(memoryKey, memory.result, payload, [], "CANCEL_SELECTION", null);
      Utilities.sleep(10)
      _askCancelConfirmation(event, realSenderNumber, memoryKey, memory.result, memory.payload);
    }
    // 2. Final cancel confirmation (YES/NO or 1/2 for recurring)
    else if (memory.stage === "CONFIRM_CANCEL") {
      const upper = userText.toUpperCase();

      if (memory.result.targetIsRecurring) {
        // Recurring: expect 1, 2, or NO
        if (upper === "1" || upper === "2") {
          executeCancellation(memory.result, realSenderNumber, memoryKey, upper);
        } else if (upper === "NO" || upper === "NAHI") {
          deleteMemory(memoryKey);
          sendUniversalReply(realSenderNumber, "✅ Cancellation aborted. Meeting kept.");
        } else {
          sendUniversalReply(realSenderNumber,
            "⚠️ Reply *1* to cancel this occurrence, *2* to cancel all future ones, or *NO* to keep it.");
        }
      } else {
        // Single event: expect YES or NO
        if (upper === "YES" || upper === "Y" || upper === "HA") {
          executeCancellation(memory.result, realSenderNumber, memoryKey, "1");
        } else {
          deleteMemory(memoryKey);
          sendUniversalReply(realSenderNumber, "✅ Cancellation aborted. Meeting kept.");
        }
      }
    }
    // 5. Inputting a missing or past date
    else if (memory.stage === "DATE_INPUT") {
      // USE THE NEW DATE RESOLVER
      console.log(payload.value, memory.result)

      let dateResolution = null;
      if (AI_MODEL === "OPEN AI GPT") {
        dateResolution = resolveDateAndPriorityWithOpenAI(payload.value, memory.result.transcript);
      } else {
        dateResolution = resolveDateAndPriorityWithGemini(payload.value, memory.result.transcript);
      }
      console.log(dateResolution);

      if (dateResolution.date) {
        // 1. Update primary date and past status
        memory.result.start_time = dateResolution.date;
        memory.result.is_past_date = dateResolution.is_past;
        // 2. Sync recurrence details
        if (dateResolution.frequency) memory.result.frequency = dateResolution.frequency;
        if (dateResolution.recurrence_day) memory.result.recurrence_day = dateResolution.recurrence_day;

        // 3. Use your EXISTING parseAIDate helper to calculate end_time
        const startTimestamp = parseAIDate(dateResolution.date);

        // Calculate end time based on duration (default 30 mins)
        const durationMinutes = memory.result.duration || 30;
        const endTimestamp = new Date(startTimestamp.getTime() + durationMinutes * 60000);

        // Format the end_time back to string so the Summary shows it correctly
        memory.result.end_time = Utilities.formatDate(endTimestamp, "GMT+5:30", "dd-MMM-yyyy HH:mm");

        // 4. Proceed to the next step
        checkDateAndProceedToBooking(memory.result, memory.payload, memory.selectedUser, memoryKey, realSenderNumber, ownerName);
      } else {
        sendUniversalReply(realSenderNumber, "❌ Sorry, I couldn't understand that. Please provide the day/time clearly.");
      }
    }
  }
}


/** utilities function start */
// find attached users with sender number
function resolveAssignedUsers_(currentSenderNumber, senderName, dbValues) {
  const current = normalizeNumber_(currentSenderNumber);
  if (!current) return [];
  console.log(current)

  const ownerEmail = Session.getEffectiveUser().getEmail();

  let filterRows = [];
  for (let i = 0; i < dbValues.length; i++) {
    let row = dbValues[i];
    let numbersCell = row[0]; // Column A
    if (!numbersCell) continue;
    // Split by comma
    let numbers = numbersCell.split(",");
    for (let num of numbers) {
      let normalized = normalizeNumber_(num);
      if (normalized === current) {
        filterRows.push([row[1], row[2], row[3], row[4], ownerEmail])
      }
    }
  }

  if (filterRows.length == 0) {
    console.log("No user found.");
    return filterRows;
  }

  return {
    ownerName: senderName,
    ownerEmail,
    users: filterRows
  };

  function normalizeNumber_(num) {
    if (!num) return "";
    // Convert to string & remove all non-digits
    let cleaned = num.toString().replace(/\D/g, "");
    // Remove country code (91 or 0) if present
    if (cleaned.length > 10) {
      cleaned = cleaned.slice(-10);
    }
    return cleaned;
  }
}

// check and proceed booking
function checkDateAndProceedToBooking(result, payload, matchedUser, memoryKey, senderNumber = null, senderName = null) {

  // STEP 1: Check for Missing Recurrence Details FIRST
  // This defines the "Pattern" of the meeting.
  if (result.frequency === "WEEKLY" && (!result.recurrence_day || result.recurrence_day === "null")) {
    saveToMemory(memoryKey, result, payload, matchedUser, "DATE_INPUT", matchedUser);
    return sendUniversalReply(senderNumber, `🔄 *Which day of the week?*\nYou mentioned a Weekly meeting, but didn't say which day.\n\n_Reply with the day (e.g., "Every Tuesday")._`);
  }


  if (result.frequency === "MONTHLY" && (!result.start_time || result.start_time === "null")) {
    saveToMemory(memoryKey, result, payload, matchedUser, "DATE_INPUT", matchedUser);
    return sendUniversalReply(senderNumber, `📅 *Which date of the month?*\nFor a monthly meeting, I need a date.\n\n_Reply with the date (e.g., "15th of every month")._`);
  }


  // STEP 2: Handle Missing Time (Null Safety)
  // Now that we know it's "Weekly on Monday", we need to know "At what time?"
  if (!result.start_time || result.start_time === "null") {
    saveToMemory(memoryKey, result, payload, matchedUser, "DATE_INPUT", matchedUser);

    var dateMsg = "⏳ *What time should I book?*\n\n";
    dateMsg += "Context: _" + result.title + "_\n";
    dateMsg += "With: *" + matchedUser[0] + "*\n\n";
    dateMsg += "Please reply with the time (e.g., 'Kal subah 11 baje').";

    sendUniversalReply(senderNumber, dateMsg);

    return;
  }
  // STEP 3: Handle Past Date Error
  // Now that we have a Day and a Time, is it valid?
  if (result.is_past_date) {
    saveToMemory(memoryKey, result, payload, matchedUser, "DATE_INPUT", matchedUser);

    var pastMsg = "🚫 *Invalid Time!*\n\n";
    pastMsg += "You asked for *" + (result.start_time || result.date) + "*, which is in the past.\n\n";
    pastMsg += "Please tell me a future time.";

    sendUniversalReply(senderNumber, pastMsg);
    // sendMessageWithCaption(payload.senderNumber, pastMsg, '', '', WP_APIKEY, WP_ID);
    return;
  }


  // 4. Proceed to conflict check and Summary
  // 4. Proceed to conflict check and Summary
  const start = parseAIDate(result.start_time);
  const end = new Date(start.getTime() + (result.duration || 30) * 60000);

  // CONFLICT CHECK
  const calendar = CalendarApp.getDefaultCalendar();
  const freq = (result.frequency || "ONCE").toUpperCase();
  let conflicts = [];

  if (freq === "ONCE") {
    // Single event — just check that exact slot
    conflicts = calendar.getEvents(start, end);

  } else {
    // Recurring event — scan the full series window for any existing event
    // that falls on the same day-of-week (WEEKLY) or day-of-month (MONTHLY/DAILY)
    // at the same time, so we catch real recurring clashes not just the first slot
    const seriesEnd = new Date(start);
    seriesEnd.setMonth(seriesEnd.getMonth() + RECURRENCE_MONTHS);

    conflicts = calendar.getEvents(start, seriesEnd).filter(ev => {
      const evStart = ev.getStartTime();
      const timeMatch = evStart.getHours() === start.getHours()
        && evStart.getMinutes() === start.getMinutes();

      if (freq === "WEEKLY") {
        // Same day of week AND same time
        return evStart.getDay() === start.getDay() && timeMatch;
      }
      if (freq === "MONTHLY") {
        // Same date of month AND same time
        return evStart.getDate() === start.getDate() && timeMatch;
      }
      if (freq === "DAILY") {
        // Any event at that time slot counts as a conflict
        return timeMatch;
      }
      return false;
    });
  }

  let conflictWarning = "";
  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    const cStart = Utilities.formatDate(conflict.getStartTime(), "GMT+5:30", "HH:mm");
    const cEnd = Utilities.formatDate(conflict.getEndTime(), "GMT+5:30", "HH:mm");
    const cDate = Utilities.formatDate(conflict.getStartTime(), "GMT+5:30", "dd MMM");
    const conflictCount = conflicts.length > 1 ? ` (+${conflicts.length - 1} more conflicts in series)` : "";
    conflictWarning = `\n⚠️ *SCHEDULE CONFLICT!*\nYou are busy with: "${conflict.getTitle()}" on ${cDate} (${cStart} - ${cEnd})${conflictCount}.`;
  }

  if (result.venue == "our office") result.venue = OUR_OFFICE;

  // Save state for final step
  saveToMemory(memoryKey, result, payload, matchedUser, "FINAL_CONFIRM", matchedUser);

  // BUILD SUMMARY MESSAGE
  let msg = "🗓️ *Pre-Booking Summary*\n\n";
  msg += `📌 *Title:* ${result.title}\n`;
  msg += `👥 *Guest:* ${matchedUser[1]}\n`;
  msg += `📅 *Time:* ${result.start_time}\n`;
  msg += `🏢 *Venue:* ${result.venue}\n`;
  msg += conflictWarning + "\n\n";
  msg += "*Confirm this booking?*\nReply *YES* to book or *NO* to abort.";

  sendUniversalReply(senderNumber, msg);
}


// execute booking
function executeGoogleBooking(data, guest, start, end) {
  try {

    let calendar = CalendarApp.getDefaultCalendar();
    let guestEmail = (guest[3] && guest[3].includes("@")) ? guest[3] : null;
    let company = data.company || "N/A";
    let venue = (data.venue || "").toLowerCase();

    if (venue === "our office") venue = OUR_OFFICE;

    // 1. Determine if this is an Online or Offline meeting
    let isGoogleMeet = (venue.includes("meet") || venue.includes("google meet") || venue.includes("zoom"));
    let eventLocation = isGoogleMeet ? "Google Meet" : venue;

    // 2. Build the Production-Grade Description
    let richDescription = `🏢 COMPANY: ${company}\n`;
    richDescription += `👤 GUEST: ${guest[0] || "Unknown"} (${guest[1] || "No Phone"})\n`;
    richDescription += `📍 LOCATION: ${eventLocation}\n\n`;
    richDescription += `📝 DESCRIPTION:\n${data.description || "No additional details."}\n\n`;

    if (data.transcript) {
      richDescription += `🎙️ CALL TRANSCRIPT:\n"${data.transcript}"`;
    }

    // 3. Setup Event Options
    const eventOptions = {
      description: richDescription,
      location: eventLocation,
      guests: guestEmail,
      sendInvites: !!guestEmail
    };

    // ONLY add conferencing if the venue explicitly asks for Google Meet
    if (isGoogleMeet) {
      eventOptions.addConference = true;
    }

    let event;
    const freq = (data.frequency || "ONCE").toUpperCase();

    // 4. Handle Frequency (Single vs. Multiple/Series)
    if (freq !== "ONCE") {
      let recurrence = CalendarApp.newRecurrence();
      const endDate = new Date(start);
      endDate.setMonth(endDate.getMonth() + RECURRENCE_MONTHS);
      if (freq === "DAILY") {
        recurrence.addDailyRule().until(endDate);
      } else if (freq === "WEEKLY") {

        const dayMap = {
          0: CalendarApp.Weekday.SUNDAY,
          1: CalendarApp.Weekday.MONDAY,
          2: CalendarApp.Weekday.TUESDAY,
          3: CalendarApp.Weekday.WEDNESDAY,
          4: CalendarApp.Weekday.THURSDAY,
          5: CalendarApp.Weekday.FRIDAY,
          6: CalendarApp.Weekday.SATURDAY,
        };

        recurrence.addWeeklyRule().onlyOnWeekday(dayMap[start.getDay()]).until(endDate);
      } else if (freq === "MONTHLY") {
        recurrence.addMonthlyRule().onlyOnMonthDay(start.getDate()).until(endDate);
      }
      // Create Recurring Series
      event = calendar.createEventSeries(data.title, start, end, recurrence, eventOptions);
    } else {
      // Create Single Event
      event = calendar.createEvent(data.title, start, end, eventOptions);
    }

    // 11 = Red (Critical), 5 = Yellow (Important), 2 = Green (Normal/Default)
    let colorId = "2";
    if (data.priority === "high") colorId = "11";
    else if (data.priority === "medium") colorId = "5";

    event.setColor(colorId);


    var eventId = event.getId();
    var meetLink = "https://www.google.com/calendar/event?eid=" +
      Utilities.base64Encode(eventId.split('@')[0] + " " + calendar.getId()).replace(/=/g, '');

    return {
      success: true,
      calendarName: calendar.getName(),
      calendarId: calendar.getId(),
      eventId: event.getId(),
      isRecurring: freq !== "ONCE",
      hasMeetLink: isGoogleMeet,
      locationUsed: eventLocation,
      meetLink: meetLink,
      invited: guestEmail
    };

  } catch (e) {
    console.error("Booking Error: " + e.stack);
    return { success: false, error: e.message };
  }
}



function logToBookingSheet(result, matchedUser, booking, payload, senderNumber, senderName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("BOOKING DATA");

  const rowData = [
    new Date(),
    senderName,               // sender name
    senderNumber,             // sender number
    matchedUser[4],           // Owner Email (4th element from resolveAssignedUsers_)
    matchedUser[1],           // Guest Name
    matchedUser[2],           // Guest Phone
    matchedUser[3],           // Guest Email
    result.title,             // AI Title/Agenda
    result.start_time,        // Start Time
    result.end_time,          // End Time
    result.duration,          // Duration
    result.venue,             // Venue
    result.frequency,         // frequency
    result.priority,          // priority
    result.recurrence_day,    // recurrence_day
    booking.meetLink,         // Meet Link
    booking.invited ? "YES" : "NO (No Email)", // Invited Status
    booking.calendarName,     // calender name
    booking.calendarId,       // calender id
    booking.eventId,          // Event ID
    payload.filePath || "N/A",// Payload filepath
    result.transcript,        // Transcript
    result.reasoning          // reasoning
  ];

  sheet.appendRow(rowData);
}

/* Universal reply function that detects the active API*/
function sendUniversalReply(to, text) {
  if (whichapi === "wa.apimis.in") {
    // WhatsApp Cloud API (Professional)
    return apimisRawNew(to, text, WP_APIKEY, WP_ID);
  } else {
    // Custom/S3 Webhook (Unprofessional)
    // Using empty strings for caption/url/filename as per your unprofessional structure
    return sendMessageWithCaption(to, text, '', '', WP_APIKEY, WP_ID);
  }
}

// Memory & Helper Helpers
function parseAIDate(str) {
  if (!str || str === "null") return new Date();
  try {
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const parts = str.match(/(\d+)-([A-Za-z]+)-(\d+)\s+(\d+):(\d+)/);
    if (!parts) return new Date();
    // Force current year if AI hallucinates 1983
    const year = parseInt(parts[3]) < 2024 ? new Date().getFullYear() : parseInt(parts[3]);
    return new Date(year, months[parts[2]], parseInt(parts[1]), parseInt(parts[4]), parseInt(parts[5]));
  } catch (e) { return new Date(); }
}


/* Professional handler route function */
function handleProfessionalApi(e) {

  let payload = JSON.parse(e.postData.contents);

  if (payload.onlymsg == undefined) {


    if (!payload.object || payload.object !== "whatsapp_business_account") {
      return ContentService.createTextOutput("Invalid WA Payload");
    }

    if (!payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) return "OK";

    var value = payload.entry[0].changes[0].value;
    var contact = value.contacts?.[0] || {};
    var msg = value.messages[0];
    var realSenderNumber = (msg.from || contact.wa_id || "").slice(-10);
    var rawSenderName = contact.profile?.name || "User";
    var itemType = msg?.type;
  }else{
    realSenderNumber = payload.rnumber;
    itemType = payload.type;
    rawSenderName = payload.receiverName || "User"
     
  }

  const memoryKey = realSenderNumber;

  // ── Auth & user lookup ──────────────────────────────────────────────
  const dbValues = database.getRange(1, 1, DATA_ROW, DATA_COL).getValues();
  const resolution = resolveAssignedUsers_(realSenderNumber, rawSenderName, dbValues);

  if (!resolution.ownerName) return "OK";

  if (IS_PRINT) {
    ws.getSheetByName("LOGS").appendRow([new Date(), whichapi, JSON.stringify(e)]);
  }

  const ownerName = resolution.ownerName;
  const users = resolution.users;
  const allowedNamesList = users.map(u => u[2]); // same index as unprofessional

  // ══════════════════════════════════════════════════════════════════
  // CASE A: AUDIO
  // ══════════════════════════════════════════════════════════════════
  if (itemType === "audio") {
    if(payload.onlymsg == undefined){
    const res = getWhatsappMediaS3Path(msg?.audio?.id, WP_APIKEY, WP_ID);
    if (!res.success) return "OK";

    var audioBlob = UrlFetchApp.fetch(res.s3Path).getBlob();
    }
    let result;
    if (AI_MODEL === "OPEN AI GPT") {
      if(payload.onlymsg == undefined)
      var transcriptText = getTranscript(audioBlob);
      else transcriptText = payload.onlymsg;

      result = processAudioWithOpenAI(transcriptText, allowedNamesList);
      
    } else {
      result = processAudioWithGemini(audioBlob, allowedNamesList,payload.onlymsg);
    }

    console.log(result);

    if (result.intent === "IGNORE" || !result.is_calendar_event) return "OK";

    // ── RETRIEVAL ──
    if (result.intent === "RETRIEVAL") {
      handleRetrievalIntent(result, realSenderNumber);
      return "OK";
    }

    // ── CANCEL ──
    if (result.intent === "CANCEL") {
      handleCancelIntent(result, realSenderNumber, memoryKey, payload);
      return "OK";
    }

    // ── BOOKING ──
    if (result.intent === "BOOKING") {
      const allMatches = users.filter(u => {
        const sheetName = u[1].toString().toUpperCase();
        const aiName = String(result.guest_name || "").toUpperCase();
        return sheetName === aiName
          || sheetName.includes(aiName)
          || aiName.includes(sheetName);
      });

      console.log(allMatches);

      if (allMatches.length > 1) {
        saveToMemory(memoryKey, result, payload, allMatches, "USER_SELECTION", null);

        let menuMsg = "🤔 *Multiple matches found!*\nWho is this meeting with?\n\n";
        allMatches.forEach((user, index) => {
          menuMsg += `*${index + 1}.* ${user[1]} (${user[2]} - ${user[3]})\n`;
        });
        menuMsg += "\n*Reply with the number (e.g., 1)*";
        sendUniversalReply(realSenderNumber, menuMsg);

      } else if (allMatches.length === 1) {
        checkDateAndProceedToBooking(result, payload, allMatches[0], memoryKey, realSenderNumber, ownerName);

      } else {
        sendUniversalReply(realSenderNumber,
          `❌ No contact found for "${result.guest_name}".`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // CASE B: TEXT  (all multi-turn stages)
  // ══════════════════════════════════════════════════════════════════
  else if (itemType === "text") {
    if(payload.onlymsg == undefined){
    var userText = String(msg?.text?.body || "").toUpperCase().trim();
    var rawText = String(msg?.text?.body || "").trim(); // preserve original case for date parsing
    }
    else
    {
      userText = String(payload.onlymsg).toUpperCase().trim();
      rawText = String(payload.onlymsg).trim();
    }
    const memory = getMemory(memoryKey);
    if (!memory) return "OK";
    console.log(memory.stage);

    // ── 1. Guest selection from disambiguation menu ──────────────────
    if (memory.stage === "USER_SELECTION") {
      const choice = parseInt(rawText);
      if (choice > 0 && choice <= memory.matches.length) {
        checkDateAndProceedToBooking(
          memory.result, memory.payload,
          memory.matches[choice - 1],
          memoryKey, realSenderNumber, ownerName
        );
      } else {
        sendUniversalReply(realSenderNumber,
          "⚠️ Invalid choice. Reply with a number from the list.");
      }
    }

    // ── 2. Final booking confirmation (YES / NO) ─────────────────────
    else if (memory.stage === "FINAL_CONFIRM") {
      if (userText === "YES" || userText === "Y" || userText === "HA") {
        const start = parseAIDate(memory.result.start_time);
        const end = new Date(start.getTime() + (memory.result.duration || 30) * 60000);

        const bookingResponse = executeGoogleBooking(
          memory.result, memory.selectedUser, start, end
        );

        if (bookingResponse.success) {
          let successMsg = "✅ *Booked Successfully!*\n\n";
          successMsg += "📌 *Event:* " + memory.result.title + "\n";
          successMsg += "📅 *Time:* " + memory.result.start_time + "\n";
          successMsg += `🏢 *Venue:* ${memory.result.venue}\n`;
          successMsg += "👥 *With:* " + memory.selectedUser[1] + "\n";
          successMsg += "\n🔗 *Meet Link:* " + bookingResponse.meetLink;

          sendUniversalReply(realSenderNumber, successMsg);
          sendBookingConfirmationEmail(
            memory.selectedUser[3], memory.result,
            bookingResponse, memory.selectedUser
          );
          logToBookingSheet(
            memory.result, memory.selectedUser,
            bookingResponse, memory.payload,
            realSenderNumber, ownerName
          );
          deleteMemory(memoryKey);

        } else {
          sendUniversalReply(realSenderNumber,
            "❌ Failed to create event: " + bookingResponse.error);
        }

      } else {
        sendUniversalReply(realSenderNumber,
          "❌ *Booking Aborted.* Information cleared.");
        deleteMemory(memoryKey);
      }
    }

    // ── 3. Cancel — pick from menu ───────────────────────────────────
    else if (memory.stage === "CANCEL_SELECTION") {
      const choice = parseInt(rawText);
      const candidates = memory.result._cancelCandidates;

      if (isNaN(choice) || choice < 1 || choice > candidates.length) {
        sendUniversalReply(realSenderNumber,
          "⚠️ Invalid choice. Reply with a number from the list.");
        return "OK";
      }
       memory.result.chosenIndex = choice -1;
      const calObj = CalendarApp.getDefaultCalendar();
      const chosen = candidates[choice - 1];
      const event = calObj.getEventById(chosen.id);

      if (!event) {
        sendUniversalReply(realSenderNumber, "❌ That meeting no longer exists.");
        deleteMemory(memoryKey);
        return "OK";
      }
 saveToMemory(memoryKey, memory.result, payload, [], "CANCEL_SELECTION", null);
      Utilities.sleep(10)

      _askCancelConfirmation(event, realSenderNumber, memoryKey, memory.result, memory.payload);
    }

    // ── 4. Cancel — final confirmation (YES/NO or 1/2 for recurring) ─
    else if (memory.stage === "CONFIRM_CANCEL") {
      if (memory.result.targetIsRecurring) {
        // Recurring: 1 = this only, 2 = all future, NO = keep
        if (userText === "1" || userText === "2") {
          executeCancellation(memory.result, realSenderNumber, memoryKey, userText);
        } else if (userText === "NO" || userText === "NAHI") {
          deleteMemory(memoryKey);
          sendUniversalReply(realSenderNumber, "✅ Cancellation aborted. Meeting kept.");
        } else {
          sendUniversalReply(realSenderNumber,
            "⚠️ Reply *1* to cancel this occurrence, *2* to cancel all future ones, or *NO* to keep it.");
        }
      } else {
        // Single event: YES or NO
        if (userText === "YES" || userText === "Y" || userText === "HA") {
          executeCancellation(memory.result, realSenderNumber, memoryKey, "1");
        } else {
          deleteMemory(memoryKey);
          sendUniversalReply(realSenderNumber, "✅ Cancellation aborted. Meeting kept.");
        }
      }
    }

    // ── 5. Date input — missing / past / recurrence day ─────────────
    else if (memory.stage === "DATE_INPUT") {
      console.log(rawText, memory.result);

      let dateResolution = null;
      if (AI_MODEL === "OPEN AI GPT") {
        dateResolution = resolveDateAndPriorityWithOpenAI(rawText, memory.result.transcript);
      } else {
        dateResolution = resolveDateAndPriorityWithGemini(rawText, memory.result.transcript);
      }
      console.log(dateResolution);

      if (dateResolution.date) {
        // Update date fields
        memory.result.start_time = dateResolution.date;
        memory.result.is_past_date = dateResolution.is_past;

        // Sync recurrence fields if AI returned them
        if (dateResolution.frequency) memory.result.frequency = dateResolution.frequency;
        if (dateResolution.recurrence_day) memory.result.recurrence_day = dateResolution.recurrence_day;

        // Recalculate end_time from new start
        const startTs = parseAIDate(dateResolution.date);
        const durationMins = memory.result.duration || 30;
        const endTs = new Date(startTs.getTime() + durationMins * 60000);
        memory.result.end_time = Utilities.formatDate(endTs, "GMT+5:30", "dd-MMM-yyyy HH:mm");

        checkDateAndProceedToBooking(
          memory.result, memory.payload,
          memory.selectedUser,
          memoryKey, realSenderNumber, ownerName
        );

      } else {
        sendUniversalReply(realSenderNumber,
          "❌ Sorry, I couldn't understand that. Please provide the day/time clearly.\n" +
          "_Example: 'Kal subah 11 baje' or 'Tomorrow 3 PM'_");
      }
    }
  }

  return ContentService.createTextOutput('OK')
}




function sendMeetingReminders() {
  const sheet = ws.getSheetByName("CALENDAR_LOGS");
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    const start = parseAIDate(data[i][1]);
    const diff = (start - now) / (1000 * 60);
    if (diff > 0 && diff <= 20 && data[i][5] === "PENDING") {
      const msg = `⏰ *Reminder:* Meeting "${data[i][4]}" starts in 15 mins with ${data[i][3]}!`;
      sendMessageWithCaption(WP_EA_NUMBER, msg, '', '', WP_APIKEY, WP_ID);
      sheet.getRange(i + 1, 6).setValue("REMINDED");
    }
  }
}
/** utilities function end */




/******************** MEMORY SYSTEM (STATE MANAGEMENT) *************/
// function saveToMemory(senderNumber, result, payload, matches, stage, selectedUser) {
//   const ws = SpreadsheetApp.getActiveSpreadsheet();
//   let memSheet = ws.getSheetByName("TEMP_STORAGE");
//   if (!memSheet) {
//     memSheet = ws.insertSheet("TEMP_STORAGE");
//   }

//   const dataString = JSON.stringify({ result, payload, matches, stage, selectedUser });
//   // Clean up old memory for this user first
//   deleteMemory(senderNumber);

//   memSheet.appendRow([senderNumber, dataString, new Date()]);
// }

function saveToMemory(senderNumber, result, payload, matches, stage, selectedUser) {
  const props = PropertiesService.getScriptProperties();

  const dataObject = {
    result,
    payload,
    matches,
    stage,
    selectedUser,
    timestamp: new Date().toISOString()
  };

  const key = senderNumber.toString();

  // Save directly (overwrite old automatically)
  props.setProperty(key, JSON.stringify(dataObject));
}

function getMemory(senderNumber) {
  const props = PropertiesService.getScriptProperties();
  const key = senderNumber.toString();

  const data = props.getProperty(key);

  if (!data) return null;

  return JSON.parse(data);
}

// function getMemory(senderNumber) {
//   const ws = SpreadsheetApp.getActiveSpreadsheet();
//   const memSheet = ws.getSheetByName("TEMP_STORAGE");
//   if (!memSheet) return null;
//   const data = memSheet.getRange(1, 1, 150, 3).getValues();
//   for (let i = data.length - 1; i >= 0; i--) {
//     if (data[i][0].toString() === senderNumber.toString()) {
//       return JSON.parse(data[i][1]);
//     }
//   }
//   return null;
// }

function deleteMemory(senderNumber) {
  const ws = SpreadsheetApp.getActiveSpreadsheet();
  const memSheet = ws.getSheetByName("TEMP_STORAGE");
  const data = memSheet.getRange(1, 1, 150, 3).getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0].toString() === senderNumber.toString()) {
      memSheet.deleteRow(i + 1);
    }
  }
}
/******************** WHATSAPP & SHEET STORAGE ********************/



/******************** DATE UTILITIES (Provided) ********************/
function parseDateValue(msg) {
  if (!msg) return null;
  msg = String(msg).trim();
  const match = msg.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;

  let day = Number(match[1]);
  let monthStr = match[2].toUpperCase();
  let year = Number(match[3]);

  const monthMap = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  if (!(monthStr in monthMap)) return null;

  const month = monthMap[monthStr];
  const date = new Date(year, month, day);

  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

function formatValue(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "dd-MMM-yyyy");
  }
  return String(val ?? "").trim();
}

function normalizeNumber(num) {
  return String(num || "").replace(/\D/g, "").slice(-10);
}

function isValidPhone(num) {
  const s = String(num || "").trim();
  return /^\d{10}$/.test(s) || /^\d{12}$/.test(s); // allow 10 or 12 digits
}

function normalizePhoneStrict(num) {
  const s = String(num || "").trim();
  if (!/^\d+$/.test(s)) return null;
  return s.slice(-10);
}


function getOrCreateErrorSheet() {
  const errorSheetName = "ERROR MSG";
  let errorSheet = ws.getSheetByName(errorSheetName);
  // Check if the sheet exists
  if (!errorSheet) {
    // If not present, create it
    errorSheet = ws.insertSheet(errorSheetName);
    errorSheet.appendRow(["Timestamp", "Transcript Msg"]);
    errorSheet.getRange("A1:B1").setFontWeight("bold").setBackground("#f4cccc");

    console.log("Sheet '" + errorSheetName + "' created.");
  } else {
    console.log("Sheet '" + errorSheetName + "' already exists.");
  }
  return errorSheet;
}