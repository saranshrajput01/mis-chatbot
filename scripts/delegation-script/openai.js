function ttt() {
  var s = 'assign a task to archit for office automation and make sure this task complete today by 9pm'
  s = "book calender with archit for new project status, this meeting come on daily basis at 2pm for 15 min"
  s = "book calender with archit for new project status, this meeting come on weekly at 7pm for 15 min meetign on zoom"
  s = "book calender with archit for new project status, this meeting book monthly basis meetign held on meet"
  s = "Book a weekly meeting with Archit at 7pm"
  s = "provide all booking that hold today and tomorrow"

  console.log(processAudioWithOpenAI(s))
}

// Get transcription 
function getTranscript(audioBlob) {
  try {
    const options = {
      method: 'post',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      payload: {
        model: 'whisper-1',
        file: audioBlob,
        language: 'en'
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      options
    );

    const json = JSON.parse(response.getContentText());

    if (!json.text) {
      throw new Error("No transcript returned");
    }

    return json.text.trim();

  } catch (e) {
    console.error("Whisper transcription failed:", e);
    return "";
  }
}


// Expert Calendar Engine: Unified Intent, Guest, and Time Processing
function processAudioWithOpenAI(transcriptText, userNames = []) {
  try {
    const validNamesList = userNames.length > 0 ? userNames.join(", ") : "No list provided";
    const istTime = Utilities.formatDate(new Date(), "GMT+5:30", "dd-MMM-yyyy HH:mm");

    const systemPrompt = `
      You are an Expert AI Calendar Assistant for an Indian business environment.
      CURRENT_DATETIME: ${istTime}.

      ### SECTION 1: INTENT DETECTION (MANDATORY)
      Classify the user's intent into exactly one category:
        - BOOKING: User wants a synchronous meeting or appointment (e.g.,"Meeting fix karo", "Meet with...", "Schedule a call", "Fix a meeting").
        - RETRIEVAL: User wants to check/list meetings (e.g., "Aaj ke event batao", "Pooja ki meeting kab hai?").
        - CANCEL: User wants to delete/remove a meeting (e.g., "7 baje wali meeting cancel kar do").
        - IGNORE: Use this if the user is assigning a TASK, setting a REMINDER, or giving an instruction (e.g., "Assign task to..."). 
                  - Task assignment: "Assign", "Task", "To-do", "Bol do", "Keh do", "Bata do"
                  - Reminders: "Remind me", "Yaad dilao", "Yaad karna"
                  - Instructions: "Tell him", "Usse kaho", "Do this work", "Ye kaam karo"
                  - Casual/noise: greetings, "Hello", "Test", "Kya haal", random words
                  - Forwarded messages: if isForwarded context suggests it is not a direct command
                - CRITICAL: Set intent to IGNORE if transcript contains ANY of these signals:
                  We ONLY book, retrieve, or cancel CALENDAR EVENTS — nothing else.

      ### SECTION 2: EXTRACTION RULES (INTENT-SPECIFIC)
        - FOR BOOKING: Extract ALL fields (start, end, venue, frequency, guest).
        - FOR RETRIEVAL:
          * Extract 'guest_name' if user mentions a person (e.g., "Archit ki meetings").
          * Extract 'start_time' ONLY if user explicitly mentions a date or day word.
            Valid triggers: "kal", "tomorrow", "Monday", "25 tarikh", "next week", "parso".
            If NO date is mentioned → set start_time to null. NEVER guess or default.
          * NEVER set is_past_date to true for RETRIEVAL — that field is for BOOKING only.
          * Set 'retrieval_scope' based on what the user asked:
              "TODAY"    → aaj, today, abhi, is waqt, filhaal
              "TOMORROW" → kal, tomorrow, aane wala din, next day
              "WEEK"     → week, hafte, is hafte, weekly, 7 din
              "DATE"     → user mentioned a specific date or day name (Monday, 15 march)
              "GUEST"    → user asked about a specific person's meetings with no date
              "GENERAL"  → no time or person context (e.g., "meetings dikhao", "list do")
          - If the transcript is completely unclear or unrelated to calendar, set retrieval_scope to "GENERAL".
          - retrieval_scope must ALWAYS be one of the 6 values above — never null.
        - FOR CANCEL: Identify 'guest_name' and 'start_time' of the specific meeting to be removed.
   
      ### SECTION 3: CORE DATA LOGIC
      1. MEETING TITLE: Format: "[Context]: Detailed Subject with [Name]".
      2. TIME MATH & SMART PICKING:
        - If user says "Weekly" or "Every week" but DOES NOT mention a specific day (e.g., Tuesday, Wednesday):
          * You MUST set "start_time" to null.
          * You MUST set "recurrence_day" to null.
          * DO NOT guess a default day like Monday.
        - CURRENT DAY CHECK: If the user requests a time for "Today" or a specific day that happens to be today:
          * Compare the requested time with CURRENT_DATETIME (${istTime}).
          * If requested time is in the PAST (e.g., it is 6 PM and they ask for 10 AM), set 'start_time' and 'end_time' to null.
          * If requested time is in the FUTURE (e.g., it is 6 PM and they ask for 9 PM), provide the full "DD-MMM-YYYY HH:mm" for today.
      3. START_TIME: Format "DD-MMM-YYYY HH:mm". Set to null if the time is ambiguous or has already passed today.
      4. DURATION: Minutes (default 30).
      5. END_TIME: Calculated as (start_time + duration). Format: "DD-MMM-YYYY HH:mm". Set to null if start_time is null.
      6. VENUE: Strictly [client office | our office | zoom | meet | null]. "Online" -> "zoom".
      7. FREQUENCY: [ONCE | DAILY | WEEKLY | MONTHLY].
      8. RECURRENCE_DAY: If frequency is WEEKLY, extract the day name (e.g., "SUNDAY", "MONDAY"). 
        - If the user says "Every Tuesday", set recurrence_day to "TUESDAY".
        - If the user says "Weekly" but mentions NO day, set recurrence_day to null.
      9. GUEST MATCHING: Search [${validNamesList}].
        - PHONETIC: Correct phonetic errors (e.g., "Archeet" -> "Archit").
        - MULTI-MATCH: If name matches multiple (e.g., "Archit Ji" & "Archit Bhai"), return root "ARCHIT".
        - SINGLE MATCH: Return the FULL exact name from the provided list.
        - HONORIFIC: Match specific honorifics if spoken (e.g., "Ji", "Bhai", "Ma'am").
      10. PRIORITY: Classify the urgency of the meeting as [high | medium | low]. 
        - Default to "medium". 
        - Use "high" if the user sounds urgent or uses words like "emergency", "urgent", "must", "at any cost".

      ### SECTION 4: VALIDATION
        - Set 'is_calendar_event' to true ONLY if intent is BOOKING, RETRIEVAL, meeting/appointment, or CANCEL.
        - If 'start_time' is null because the time has already passed today, set 'is_past_date' to true.
        - If the intent is "Assign a task" or "Complete a work", set 'is_calendar_event' to false and intent to IGNORE.
        - EXCEPTION: For RETRIEVAL intent, always set is_past_date to false regardless of start_time.
    `;

    const userPrompt = `
      TRANSCRIPT TO ANALYZE: "${transcriptText}"

      Return ONLY a JSON object:
      { 
        "intent": "BOOKING" | "RETRIEVAL" | "CANCEL" | "IGNORE",       
        "is_calendar_event": boolean,
        "is_past_date": boolean,
        "title": "string",
        "guest_name": "string",
        "start_time": "DD-MMM-YYYY HH:mm" or null,
        "end_time": "DD-MMM-YYYY HH:mm" or null,
        "duration": number,
        "venue": "client office" | "our office" | "zoom" | "meet" | null,
        "frequency": "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY",
        "recurrence_day": "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY" | null,
        "priority": "high" | "medium" | "low",
        "description": "string",
        "retrieval_scope": "TODAY" | "TOMORROW" | "WEEK" | "DATE" | "GUEST" | "GENERAL",
        "transcript": "${transcriptText}",
        "reasoning": "Explain intent choice and guest match"
      }
    `;

    const payload = {
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    };

    const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      payload: JSON.stringify(payload)
    });

    const result = JSON.parse(JSON.parse(response.getContentText()).choices[0].message.content);

    // Safety check for past dates using your custom logic
    // result.is_past_date = checkIfPast_(result.start_time);
    if (result.intent === "BOOKING" || result.intent === "CANCEL") {
      result.is_past_date = checkIfPast_(result.start_time);
    } else {
      result.is_past_date = false; // never relevant for RETRIEVAL
    }

    return result;

  } catch (e) {
    console.error("AI Calendar Error:", e);
    return { intent: "IGNORE", is_calendar_event: false, transcript: transcriptText };
  }

  // --- Internal Helper Functions ---

  function parseCustomDate_(str) {
    if (!str || str === "null") return null;
    const [datePart, timePart] = str.split(" ");
    const [day, mon, year] = datePart.split("-");
    const [hour, min] = timePart.split(":");
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    return new Date(year, months[mon], day, hour, min);
  }

  function checkIfPast_(start_time) {
    const parsed = parseCustomDate_(start_time);
    if (!parsed) return false;
    return parsed < new Date();
  }
}


// handling date logic
function resolveDateAndPriorityWithOpenAI(userText, taskContext) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = new Date();
  const todayName = days[now.getDay()];

  // Pre-calculate dates for the AI to prevent 1983 or hallucinated years
  const tomorrowDate = new Date(now.getTime() + 86400000).toLocaleDateString('en-GB');
  const parsoDate = new Date(now.getTime() + 172800000).toLocaleDateString('en-GB');

  const systemPrompt = `
    You are a professional Date and Recurrence Resolver for an Indian office context. 
    CURRENT_DATE: ${now.toLocaleDateString('en-GB')} (${todayName})
    CURRENT_TIME: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}

    ### OBJECTIVE:
    Extract the absolute timestamp AND any recurrence details. You MUST provide a "date" even for recurring events to act as the start date.

    ### CRITICAL MERGING RULES:
    1. RECURRING START DATE: If a user says "Every Friday", you MUST calculate the date of the NEXT upcoming Friday. 
       - If today is Wednesday, the "date" is this Friday. 
       - If today is Friday AND the time has passed, the "date" is next Friday.
    2. TIME EXTRACTION: Look for the time in TASK_CONTEXT (e.g., "7pm") if not provided in USER_INPUT.
    3. COMBINE: Merge the Time (7pm) with the Day (Friday) to create a full "DD-MMM-YYYY HH:mm" string.

    ### EXTRACTION LOGIC:
    1. DATE: Always return a specific "DD-MMM-YYYY HH:mm" for the FIRST occurrence.
    2. FREQUENCY: [DAILY | WEEKLY | MONTHLY | ONCE].
    3. RECURRENCE_DAY: [MONDAY, TUESDAY, etc.].

    ### OUTPUT JSON FORMAT:
    {
      "date": "DD-MMM-YYYY HH:mm", 
      "is_past": boolean,
      "frequency": "WEEKLY",
      "recurrence_day": "FRIDAY",
      "reasoning": "Explain which Friday you picked and why"
    }
  `;

  const userPrompt = `
    TASK_CONTEXT: "${taskContext}"
    USER_INPUT: "${userText}"

    Analyze and merge these to return the JSON.
  `;

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0
  };

  try {
    const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const resText = response.getContentText();
    const json = JSON.parse(resText);

    if (json.choices && json.choices.length > 0) {
      const result = JSON.parse(json.choices[0].message.content);

      if (result.date && !isValidDateTimeFormat_(result.date)) {
        result.date = null;
      }
      return result;
    } else {
      return { date: null, is_past: false, frequency: null, recurrence_day: null, reasoning: "API Error" };
    }

  } catch (e) {
    return { date: null, is_past: false, frequency: null, recurrence_day: null, reasoning: e.toString() };
  }

  function isValidDateTimeFormat_(dateStr) {
    if (!dateStr) return false;
    const regex = /^\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}$/;
    if (!regex.test(dateStr)) return false;

    const [datePart, timePart] = dateStr.split(" ");
    const [dd, mon, yyyy] = datePart.split("-");
    const monthMap = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    const monIndex = mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase();
    if (!monthMap.hasOwnProperty(monIndex)) return false;

    const d = new Date(Number(yyyy), monthMap[monIndex], Number(dd));
    return (d.getFullYear() === Number(yyyy) && d.getMonth() === monthMap[monIndex] && d.getDate() === Number(dd));
  }
}
