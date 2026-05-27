

// process audio blob
/**
 * Expert Calendar Engine: Gemini Version
 * Processes audio directly to extract intents, guests, and schedule data.
 */
function processAudioWithGemini(audioBlob, userNames = [],trasncriptMsg) {
  try {
    if(trasncriptMsg == undefined){
    var audioBase64 = Utilities.base64Encode(audioBlob.getBytes());
    var mimeType = "audio/ogg";
    }
    else{
    audioBase64 = trasncriptMsg;
    mimeType = "text/plain";
    }
    // const audioBase64 = Utilities.base64Encode(audioBlob.getBytes());
    const validNamesList = userNames.length > 0 ? userNames.join(", ") : "No list provided";
    const istTime = Utilities.formatDate(new Date(), "GMT+5:30", "dd-MMM-yyyy HH:mm");

    const systemPrompt = `
      You are an Expert AI Calendar Assistant for an Indian business environment.
      CURRENT_DATETIME: ${istTime}.

      ### SECTION 1: INTENT DETECTION (MANDATORY)
      Classify the user's intent into exactly one category:
        - BOOKING: Synchronous meeting/appointment (e.g., "Meeting fix karo", "Schedule a call").
        - RETRIEVAL: Check/list meetings (e.g., "Events batao", "Pooja ki meeting kab hai?").
        - CANCEL: Delete/remove a meeting (e.g., "Meeting cancel kar do").
        - IGNORE: If the user assigns a TASK, REMINDER, or instruction (e.g., "Assign task", "Remind me", "Tell him to do this").
            CRITICAL: Words like "Assign", "Task", "To-do", or casual talk/greetings = IGNORE. We ONLY book CALENDAR EVENTS.

      ### SECTION 2: EXTRACTION & DATA LOGIC
      1. MEETING TITLE: "[Context]: Detailed Subject with [Name]".
      2. TIME MATH & SMART PICKING:
        - If "Weekly" is mentioned WITHOUT a specific day: Set "start_time" and "recurrence_day" to null.
        - PAST CHECK: If requested time is today but has already passed (e.g., 10 AM requested at 6 PM), set 'start_time' and 'end_time' to null and 'is_past_date' to true.
      3. START_TIME: Format "DD-MMM-YYYY HH:mm". Null if ambiguous or passed.
      4. DURATION: Minutes (default 30).
      5. END_TIME: (start_time + duration). Format: "DD-MMM-YYYY HH:mm". Null if start_time is null.
      6. VENUE: Strictly [client office | our office | zoom | meet | null]. "Online" -> "zoom".
      7. FREQUENCY: [ONCE | DAILY | WEEKLY | MONTHLY].
      8. RECURRENCE_DAY: Day name (e.g., "TUESDAY") if frequency is WEEKLY. Else null.
      9. GUEST MATCHING: Search [${validNamesList}]. Correct phonetics (Archeet -> Archit). 
         - Multi-match (Archit Ji & Archit Bhai) -> Return "ARCHIT".
         - Single match -> Return FULL exact name from list.
      10. PRIORITY: [high | medium | low]. Default "medium". "High" for urgent/emergency.

      ### SECTION 3: VALIDATION
      - 'is_calendar_event' = true ONLY if intent is BOOKING, RETRIEVAL, or CANCEL.
      - If intent is IGNORE, 'is_calendar_event' = false.
    `;

    const userPrompt = `
      Analyze the attached audio or text and return ONLY a JSON object:
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
        "transcript": "Full verbatim text from audio",
        "reasoning": "Explain intent choice and guest match"
      }
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
      contents: [{
        parts: [
          { text: userPrompt },
          { inline_data: { mime_type: mimeType, data: audioBase64 } }
        ]
      }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const jsonResponse = JSON.parse(response.getContentText());

    if (jsonResponse.candidates && jsonResponse.candidates[0].content.parts[0].text) {
      let result = JSON.parse(jsonResponse.candidates[0].content.parts[0].text);

      // Secondary safety check for past dates using your logic
      if (result.start_time) {
        result.is_past_date = checkIfPast_(result.start_time);
      }

      return result;
    } else {
      throw new Error("Empty response from Gemini");
    }

  } catch (e) {
    console.error("Gemini Audio Engine Error:", e);
    return { intent: "IGNORE", is_calendar_event: false, error: true };
  }
}

/**
 * Internal Helper Functions to match OpenAI version behavior
 */
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



// DATE TIME MANAGE BY AI
function resolveDateAndPriorityWithGemini(userText, taskContext) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = new Date();
  const todayName = days[now.getDay()];

  const systemPrompt = `
    You are a professional Date Resolver. 
    CURRENT_DATE: ${now.toLocaleDateString('en-GB')} (${todayName})
    CURRENT_TIME: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}

    ### OBJECTIVE:
    Extract or calculate the absolute timestamp from the Input. 
    Use the Context only if the Input is missing information (like "same time").

    ### RULES:
    1. "tomorrow" / "kal" = ${new Date(now.getTime() + 86400000).toLocaleDateString('en-GB')}
    2. "parso" = ${new Date(now.getTime() + 172800000).toLocaleDateString('en-GB')}
    3. If time is "2pm", return "14:00". If "11 baje", return "11:00".
    4. Format: "DD-MMM-YYYY HH:mm".

    ### OUTPUT JSON FORMAT:
    {"date": "string or null", "is_past": boolean, "reasoning": "string"}
  `;

  // We wrap the user prompt to be very direct
  const userPrompt = `
    CONTEXT: "${taskContext}"
    USER_INPUT: "${userText}"

    Extract the date and time now.
  `;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      // Use a schema to force the model to behave
      responseSchema: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING", nullable: true },
          is_past: { type: "BOOLEAN" },
          reasoning: { type: "STRING" }
        },
        required: ["date", "is_past", "reasoning"]
      },
      temperature: 0
    }
  };

  try {
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const resCode = response.getResponseCode();
    const resText = response.getContentText();
    const json = JSON.parse(resText);

    if (resCode === 200 && json.candidates) {
      const result = JSON.parse(json.candidates[0].content.parts[0].text);
      // console.log("Resolved Date Object:", result); // Debugging
      return result;
    } else {
      console.error("Gemini Error:", resText);
      return { date: null };
    }
  } catch (e) {
    console.error("Crash:", e.toString());
    return { date: null };
  }
}
