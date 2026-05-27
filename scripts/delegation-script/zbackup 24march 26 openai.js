// function ttt() {
//   var s = 'assign a task to archit for office automation and make sure this task complete today by 9pm'
//   s = "book calender with archit for new project status, this meeting come on daily basis at 2pm for 15 min"
//   s = "book calender with archit for new project status, this meeting come on weekly every at 7pm for 15 min meetign on zoom"
//   s = "book calender with archit for new project status, this meeting book monthly basis meetign held on meet"
//   // s = "cancel my all booking with archit"
//   // s= "provide all booking that hold today and tomorrow"
  
//   // var ownerEmail = Session.getEffectiveUser().getEmail();

//   console.log(processAudioWithOpenAI(s))
// }

// // Get transcription 
// function getTranscript(audioBlob) {
//   try {
//     const options = {
//       method: 'post',
//       headers: {
//         Authorization: `Bearer ${OPENAI_API_KEY}`
//       },
//       payload: {
//         model: 'whisper-1',
//         file: audioBlob,
//         language: 'en'
//       },
//       muteHttpExceptions: true
//     };

//     const response = UrlFetchApp.fetch(
//       'https://api.openai.com/v1/audio/transcriptions',
//       options
//     );

//     const json = JSON.parse(response.getContentText());

//     if (!json.text) {
//       throw new Error("No transcript returned");
//     }

//     return json.text.trim();

//   } catch (e) {
//     console.error("Whisper transcription failed:", e);
//     return "";
//   }
// }


// // Expert Calendar Engine: Unified Intent, Guest, and Time Processing
// function processAudioWithOpenAI(transcriptText, userNames = []) {
//   try {
//     const validNamesList = userNames.length > 0 ? userNames.join(", ") : "No list provided";
//     const now = new Date();
//     const istTime = now.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' });

//     const systemPrompt = `
//       You are an Expert AI Calendar Assistant for an Indian business environment.
//       CURRENT_DATETIME: ${istTime}.

//       ### SECTION 1: INTENT DETECTION (MANDATORY)
//       Classify the user's intent into exactly one category:
//         - BOOKING: User wants a synchronous meeting or appointment (e.g.,"Meeting fix karo", "Meet with...", "Schedule a call", "Fix a meeting").
//         - RETRIEVAL: User wants to check/list meetings (e.g., "Aaj ke event batao", "Pooja ki meeting kab hai?").
//         - CANCEL: User wants to delete/remove a meeting (e.g., "7 baje wali meeting cancel kar do").
//         - IGNORE: Use this if the user is assigning a TASK, setting a REMINDER, or giving an instruction (e.g., "Assign task to...", "Tell him to do this", "Remind me"). 
//             CRITICAL: If the transcript contains words like "Assign", "Task", "To-do", "Casual talk", "greetings" or "Do this work", set intent to IGNORE. We only book CALENDAR EVENTS, not TASKS.

//       ### SECTION 2: EXTRACTION RULES (INTENT-SPECIFIC)
//         - FOR BOOKING: Extract ALL fields (start, end, venue, frequency, guest).
//         - FOR RETRIEVAL: Extract guest_name and start_time (default to today if no date mentioned). 
//         - FOR CANCEL: Identify 'guest_name' and 'start_time' of the specific meeting to be removed.
   
//       ### SECTION 3: CORE DATA LOGIC
//       1. MEETING TITLE: Format: "[Context]: Detailed Subject with [Name]".
//       2. TIME MATH & SMART PICKING:
//         - DEFAULT DAY: If "Weekly" is mentioned WITHOUT a specific day, default to the next upcoming MONDAY.
//         - CURRENT DAY CHECK: If the user requests a time for "Today" or a specific day that happens to be today:
//           * Compare the requested time with CURRENT_DATETIME (${istTime}).
//           * If requested time is in the PAST (e.g., it is 6 PM and they ask for 10 AM), set 'start_time' and 'end_time' to null.
//           * If requested time is in the FUTURE (e.g., it is 6 PM and they ask for 9 PM), provide the full "DD-MMM-YYYY HH:mm" for today.
//       3. START_TIME: Format "DD-MMM-YYYY HH:mm". Set to null if the time is ambiguous or has already passed today.
//       4. DURATION: Minutes (default 30).
//       5. END_TIME: Calculated as (start_time + duration). Format: "DD-MMM-YYYY HH:mm". Set to null if start_time is null.
//       6. VENUE: Strictly [client office | our office | zoom | meet | null]. "Online" -> "zoom".
//       7. FREQUENCY: [ONCE | DAILY | WEEKLY | MONTHLY].
//       8. RECURRENCE_DAY: If frequency is WEEKLY, extract the day name (e.g., "SUNDAY", "MONDAY"). 
//         - If the user says "Every Tuesday", set recurrence_day to "TUESDAY".
//         - If the user says "Weekly" but mentions NO day, set recurrence_day to null.
//       9. GUEST MATCHING: Search [${validNamesList}].
//         - PHONETIC: Correct phonetic errors (e.g., "Archeet" -> "Archit").
//         - MULTI-MATCH: If name matches multiple (e.g., "Archit Ji" & "Archit Bhai"), return root "ARCHIT".
//         - SINGLE MATCH: Return the FULL exact name from the provided list.
//         - HONORIFIC: Match specific honorifics if spoken (e.g., "Ji", "Bhai", "Ma'am").
//       10. PRIORITY: Classify the urgency of the meeting as [high | medium | low]. 
//         - Default to "medium". 
//         - Use "high" if the user sounds urgent or uses words like "emergency", "urgent", "must", "at any cost".

//       ### SECTION 4: VALIDATION
//         - Set 'is_calendar_event' to true ONLY if intent is BOOKING, RETRIEVAL, meeting/appointment, or CANCEL.
//         - If 'start_time' is null because the time has already passed today, set 'is_past_date' to true.
//         - If the intent is "Assign a task" or "Complete a work", set 'is_calendar_event' to false and intent to IGNORE.
//     `;

//     const userPrompt = `
//       TRANSCRIPT TO ANALYZE: "${transcriptText}"

//       Return ONLY a JSON object:
//       { 
//         "intent": "BOOKING" | "RETRIEVAL" | "CANCEL" | "IGNORE",       
//         "is_calendar_event": boolean,
//         "is_past_date": boolean,
//         "title": "string",
//         "guest_name": "string",
//         "start_time": "DD-MMM-YYYY HH:mm" or null,
//         "end_time": "DD-MMM-YYYY HH:mm" or null,
//         "duration": number,
//         "venue": "client office" | "our office" | "zoom" | "meet" | null,
//         "frequency": "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY",
//         "recurrence_day": "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY" | null,
//         "priority": "high" | "medium" | "low",
//         "description": "string",
//         "transcript": "${transcriptText}",
//         "reasoning": "Explain intent choice and guest match"
//       }
//     `;

//     const payload = {
//       model: OPENAI_MODEL,
//       messages: [
//         { role: "system", content: systemPrompt },
//         { role: "user", content: userPrompt }
//       ],
//       response_format: { type: "json_object" },
//       temperature: 0.1
//     };

//     const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
//       method: "post",
//       contentType: "application/json",
//       headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
//       payload: JSON.stringify(payload)
//     });

//     const result = JSON.parse(JSON.parse(response.getContentText()).choices[0].message.content);

//     // Safety check for past dates using your custom logic
//     result.is_past_date = checkIfPast_(result.start_time);

//     return result;

//   } catch (e) {
//     console.error("AI Calendar Error:", e);
//     return { intent: "IGNORE", is_calendar_event: false, transcript: transcriptText };
//   }

//   // --- Internal Helper Functions ---

//   function parseCustomDate_(str) {
//     if (!str || str === "null") return null;
//     const [datePart, timePart] = str.split(" ");
//     const [day, mon, year] = datePart.split("-");
//     const [hour, min] = timePart.split(":");
//     const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
//     return new Date(year, months[mon], day, hour, min);
//   }

//   function checkIfPast_(start_time) {
//     const parsed = parseCustomDate_(start_time);
//     if (!parsed) return false;
//     return parsed < new Date();
//   }
// }


// function processAudioWithOpenAI1(transcriptText, userNames = []) {
//   try {
//     const validNamesList = userNames.length > 0 ? userNames.join(", ") : "No list provided";
//     const now = new Date();

//     const systemPrompt = `
//       You are an Expert Calendar Assistant for an Indian business environment. 
//       Current Date/Time: ${now.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })}.

//       ### INTENT DETECTION (CRITICAL):
//       Identify the user's intent and set the "intent" key:
//       1. "BOOKING": User wants to schedule a new meeting.
//       2. "RETRIEVAL": User wants to check/list existing events (e.g., "Aaj ke event batao", "Pooja ke sath kab meeting hai?").
//       3. "CANCEL": User wants to delete/remove an event (e.g., "Meeting cancel kar do").
//       4. "IGNORE": The message is casual, non-business, or irrelevant to calendar tasks.

//       ### EXTRACTION RULES:
//       1. MEETING TITLE: "[Context]: Subject with [Name]".
//       2. START & END TIME: Format "DD-MMM-YYYY HH:mm". 
//          - If end time isn't mentioned, calculate based on duration.
//       3. VENUE: Strictly one of: [client office | our office | zoom | meet | null].
//          - If user says "online meeting", default to "zoom".
//       4. FREQUENCY: If mentioned (e.g., "daily", "every Sunday", "weekly on Monday"), extract the pattern. Default is "once".
//       5. GUEST MATCHING: Match from [${validNamesList}]. 
//          - Multi-match (e.g., Archit Ji/Bhai) -> return root "ARCHIT".
//          - Single match -> return FULL name.
//       6. VALIDATION: If intent is BOOKING but no meeting details exist, set 'is_calendar_event' to false.
//     `;

//     const userPrompt = `
//       Analyze this transcript: "${transcriptText}"

//       Return ONLY JSON:
//       {
//         "intent": "BOOKING" | "RETRIEVAL" | "CANCEL" | "IGNORE",
//         "is_calendar_event": boolean,
//         "is_past_date": boolean,
//         "title": "string",
//         "guest_name": "string",
//         "start_time": "DD-MMM-YYYY HH:mm" or null,
//         "end_time": "DD-MMM-YYYY HH:mm" or null,
//         "duration": number,
//         "venue": "client office" | "our office" | "zoom" | "meet" | null,
//         "frequency": "string",
//         "description": "string",
//         "transcript": "${transcriptText}",
//         "reasoning": "string"
//       }
//     `;

//     const payload = {
//       model: OPENAI_MODEL,
//       messages: [
//         { role: "system", content: systemPrompt },
//         { role: "user", content: userPrompt }
//       ],
//       response_format: { type: "json_object" },
//       temperature: 0.1
//     };

//     const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
//       method: "post",
//       contentType: "application/json",
//       headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
//       payload: JSON.stringify(payload),
//       muteHttpExceptions: true
//     });

//     const result = JSON.parse(JSON.parse(response.getContentText()).choices[0].message.content);

//     // Maintain your existing math fix
//     result.is_past_date = checkIfPast_(result.start_time);

//     return result;
//   } catch (e) {
//     console.error("OpenAI Error:", e);
//     return { intent: "IGNORE", is_calendar_event: false, transcript: transcriptText };
//   }

//   function parseCustomDate_(str) {
//     if (!str) return null;

//     const [datePart, timePart] = str.split(" ");
//     const [day, mon, year] = datePart.split("-");
//     const [hour, min] = timePart.split(":");

//     const months = {
//       Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
//       Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
//     };

//     return new Date(year, months[mon], day, hour, min);
//   }

//   function checkIfPast_(start_time) {
//     const parsed = parseCustomDate_(start_time);
//     if (!parsed) return false;
//     return parsed < new Date();
//   }
// }


// // process transcript engine 
// function processAudioWithOpenAI11(transcriptText, userNames = []) {
//   try {
//     const validNamesList = userNames.length > 0 ? userNames.join(", ") : "No list provided";
//     const now = new Date();

//     const systemPrompt = `
//       You are an Expert Calendar Scheduler for an Indian business environment. 
//       Current Date/Time: ${now.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })}.

//       ### EXTRACTION RULES:
//       1. MEETING TITLE: Create a highly professional and expressive title. 
//          Format: "[Context/Topic]: Detailed Subject with [Name]". 
//          Example: "App Testing: Application Status Review with ARCHIT JI".
//       2. START TIME: Strictly "DD-MMM-YYYY HH:mm". 
//          - CRITICAL: If the input does NOT mention a specific time (e.g., "Kal" or "Monday"), set 'start_time' to null.
//          - Only provide a time if it is explicitly stated or strongly implied (e.g., "sham ko" -> 18:00).
//       3. PAST CHECK: Compare the extracted time with the current time. If the extracted time is in the past, set 'is_past_date' to true.
//       4. DURATION: Extract in minutes. Default to 30.
//       5. GUEST MATCHING & NORMALIZATION: 
//          - Search the provided list: [${validNamesList}].
//          - Goal: Correct phonetic errors (e.g., "Archeet" -> "Archit") and identify the target.
//          - MULTIPLE MATCH LOGIC: If the user mentions a name that matches the START of multiple entries (e.g., "Archit" matches "ARCHIT JI" and     "ARCHIT BHAI"), return ONLY the common matching part (e.g., "ARCHIT").
//          - SINGLE MATCH LOGIC: If the name/phonetic variation maps to exactly one person in the list (e.g., "Puja" or "Pooja" maps to "POOJA MA'AM"), return the FULL exact name from the list.
//          - HONORIFIC LOGIC: If the user explicitly includes an honorific (e.g., "Archit Jee"), match it to the specific entry (e.g., "ARCHIT JI").
//          - If no match is found, return the name as heard in the transcript.
//       6. VALIDATION: If no clear meeting intent exists, set 'is_calendar_event' to false.
//     `;

//     const userPrompt = `
//       Analyze this transcript: "${transcriptText}"

//       Return ONLY JSON:
//       {
//         "is_calendar_event": boolean,
//         "is_past_date": boolean,
//         "title": "Detailed Expressive Title",
//         "guest_name": "Exact name from list",
//         "start_time": "DD-MMM-YYYY HH:mm" or null,
//         "duration": number,
//         "description": "Brief summary of meeting context",
//         "transcript": "${transcriptText}",
//         "reasoning": "Explain guest matching and why start_time is a value or null"
//       }
//     `;

//     const payload = {
//       model: OPENAI_MODEL,
//       messages: [
//         { role: "system", content: systemPrompt },
//         { role: "user", content: userPrompt }
//       ],
//       response_format: { type: "json_object" },
//       temperature: 0.1
//     };

//     const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
//       method: "post",
//       contentType: "application/json",
//       headers: {
//         Authorization: `Bearer ${OPENAI_API_KEY}`
//       },
//       payload: JSON.stringify(payload),
//       muteHttpExceptions: true
//     });

//     const resText = response.getContentText();
//     const json = JSON.parse(resText);

//     if (json.error) throw new Error(json.error.message);

//     // Parse the inner JSON string returned by OpenAI
//     const result = JSON.parse(json.choices[0].message.content);

//     // Fix here
//     result.is_past_date = checkIfPast_(result.start_time);

//     return result;

//   } catch (e) {
//     console.error("OpenAI Calendar Error:", e);
//     return { is_calendar_event: false, error: true, transcript: transcriptText };
//   }


//   function parseCustomDate_(str) {
//     if (!str) return null;

//     const [datePart, timePart] = str.split(" ");
//     const [day, mon, year] = datePart.split("-");
//     const [hour, min] = timePart.split(":");

//     const months = {
//       Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
//       Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
//     };

//     return new Date(year, months[mon], day, hour, min);
//   }

//   function checkIfPast_(start_time) {
//     const parsed = parseCustomDate_(start_time);
//     if (!parsed) return false;
//     return parsed < new Date();
//   }
// }


// function resolveDateAndPriorityWithOpenAI(userText, taskContext) {
//   const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
//   const now = new Date();
//   const todayName = days[now.getDay()];

//   // Pre-calculate dates to remove "Math" burden from the AI
//   const tomorrowDate = new Date(now.getTime() + 86400000).toLocaleDateString('en-GB');
//   const parsoDate = new Date(now.getTime() + 172800000).toLocaleDateString('en-GB');

//   const systemPrompt = `
//     You are a professional Date Resolver for an Indian office context. 
//     CURRENT_DATE: ${now.toLocaleDateString('en-GB')} (${todayName})
//     CURRENT_TIME: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}

//     ### OBJECTIVE:
//     Extract the absolute timestamp. Use Context only if Input is vague.

//     ### EXTRACTION & TIME MATH:
//     1. RELATIVE MAPPING: "tomorrow/kal" = ${tomorrowDate}, "parso" = ${parsoDate}.
//     2. TIME CONVERSION: "2pm" -> "14:00", "11 baje" -> "11:00".
//     3. DYNAMIC OFFSETS (TIME MATH):
//        - If user says "X gante baad" or "X hours later": Add X hours to CURRENT_TIME (${now.getHours()}:${now.getMinutes()}).
//        - If user says "X minute baad": Add X minutes to CURRENT_TIME.
//        - Example: If current is 17:45 and user says "2 gante baad", return today's date with "19:45".

//     ### CRITICAL LOGIC (NULL SAFETY & PAST CHECK):
//     1. NO TIME = NULL:
//        - If the user provides a day (today/kal) but NO specific time OR no relative duration (baad), you MUST set "date" to null.
//        - NEVER use the current time as a fallback unless the user explicitly said "baad" or "now".
    
//     2. PAST-DATE CALCULATION:
//        - If the calculated time is even 1 minute earlier than ${now.getHours()}:${now.getMinutes()}, "is_past" MUST be true.

//     ### OUTPUT JSON FORMAT:
//     {"date": "DD-MMM-YYYY HH:mm", "is_past": boolean, "reasoning": "string"}
//   `;

//   const userPrompt = `
//     CONTEXT: "${taskContext}"
//     USER_INPUT: "${userText}"

//     Extract the date and time now.
//   `;

//   const payload = {
//     model: OPENAI_MODEL,
//     messages: [
//       { role: "system", content: systemPrompt },
//       { role: "user", content: userPrompt }
//     ],
//     response_format: { type: "json_object" },
//     temperature: 0
//   };

//   try {
//     const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
//       method: "post",
//       contentType: "application/json",
//       headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
//       payload: JSON.stringify(payload),
//       muteHttpExceptions: true
//     });

//     const resText = response.getContentText();
//     const json = JSON.parse(resText);

//     if (json.choices && json.choices.length > 0) {
//       const result = JSON.parse(json.choices[0].message.content);

//       // Verification: Ensure format is correct or set to null
//       if (result.date && !isValidDateTimeFormat(result.date)) {
//         console.warn("Invalid format from OpenAI:", result.date);
//         result.date = null;
//       }

//       return result;
//     } else {
//       console.error("OpenAI Error:", resText);
//       return { date: null, is_past: false, reasoning: "API Error" };
//     }

//   } catch (e) {
//     console.error("OpenAI Date Resolver Crash:", e.toString());
//     return { date: null, is_past: false, reasoning: e.toString() };
//   }
// }

// // Updated validation helper for the new format
// function isValidDateTimeFormat(dateStr) {
//   if (!dateStr) return false;
//   // Regex to check DD-MMM-YYYY HH:mm format
//   const regex = /^\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}$/;
//   if (!regex.test(dateStr)) return false;

//   const [datePart, timePart] = dateStr.split(" ");
//   const [dd, mon, yyyy] = datePart.split("-");
//   const monthMap = {
//     Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
//     Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
//   };

//   const monIndex = mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase();
//   if (!monthMap.hasOwnProperty(monIndex)) return false;

//   const d = new Date(Number(yyyy), monthMap[monIndex], Number(dd));
//   return (
//     d.getFullYear() === Number(yyyy) &&
//     d.getMonth() === monthMap[monIndex] &&
//     d.getDate() === Number(dd)
//   );
// }
