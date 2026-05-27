
/**PV1-20 MARCH 2026
/**V2- 23 FEB
 * Rights              : MIS WORK INDIA PVT LTD
 * Description         : AI_DATABASE_CHATBOT_DOMAIN_226
 *                     : AI SUPPORT- CHATGPT_GEMINI
 *                     : REPLY SUPPORT- PROFF & UNPROFESSIONAL WA AND TELEGRAM(AUDIO+TEXT)          : 
 * CREATED AT          : 25-Dec-2025
 * UPDATED AT          : 12-Feb-2026// 23FEB
 * Version             : v1, V2-23feb -Prof Api Audio Added roapi.gs
 * Version notes/name  : 
 * System notes/name   : Prof and unpof (A+T) WA & Telegram
 *                     : Gemini and ChatGpt Ai Suppport
 * Trigger.            : NO TRIGGERS:Just deploy it once .
 * NOTE 						   : RUN DO POST - SEE IF ANY PERSMISSIONS ARE NEEDED- LIKE GOOGLE SHEETS API ETC.
 *                       ADD THESE IN SERVICES ARE APPSCRIPT - JSON
 *                     : WA- Deploy and add webhook in apps.mis.work
 *                     : Telegram Deploy and webhook in telegram config  "WebApp url", create a newbot/add api in sheet
 *                     : Update Apis in Stepup sheet
 *  */

/** utilities funciton start */
//https://script.google.com/macros/s/AKfycbycT9Zo0wDzhh2bRc_4sowAK9041wW7s654ivVenxA1rx0kUNbTECLACIE2br1ob-xa/exec

const IS_PRINT = true;// make this ture(boolean)value to store logs file from webhook.or false to skip it// always deploy if change

const ss = SpreadsheetApp.getActiveSpreadsheet();
const confSt = ss.getSheetByName('Configuration');
const contextSheet = ss.getSheetByName('STOCK Context');
const conf = confSt.getDataRange().getValues();

/******* env data start ********/
const SYSTEM_PROMPT = conf[0][1];
const isAll = conf[7][1];
const whichapi = conf[8][1];
const AI_MODEL = conf[9][1];
const x_phone_id = conf[10][1];
const mas_apiKey = conf[11][1];
const TELEGRAM_TOKEN = conf[12][1];

const GPT_MODEL = conf[14][1];
const OPENAI_API_KEY = conf[15][1];
const GPT_TEMP = Number(conf[16][1]) || 0.2;
const GEMINI_MODEL = conf[18][1];
const GEMINI_API_KEY = conf[19][1];
const GEMINI_TEMP = conf[20][1];
/******* env data end ********/


/*** master caller function starting point  ***/
function doPost(e) {
 // e={"queryString":"","parameter":{},"contextPath":"","parameters":{},"contentLength":804,"postData":{"contents":"{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":\"255803484288756\",\"changes\":[{\"field\":\"messages\",\"value\":{\"messaging_product\":\"whatsapp\",\"metadata\":{\"phone_number_id\":\"287368264453565\",\"display_phone_number\":\"919990934411\"},\"contacts\":[{\"wa_id\":\"919545203354\",\"user_id\":\"IN.1661944265119338\",\"profile\":{\"name\":\"Pooja\"}}],\"messages\":[{\"from\":\"919545203354\",\"id\":\"wamid.HBgMOTE5NTQ1MjAzMzU0FQIAEhggQUM4OTQyRDk2QUIyQTdFRUYzM0EzNjk0QzFGODQ3RUEA\",\"type\":\"audio\",\"timestamp\":\"1777289001\",\"audio\":{\"id\":\"4337645913149982\",\"mime_type\":\"audio/ogg; codecs=opus\",\"sha256\":\"im6P16NYpoMnxaymb/VCPI5+hDMYC6gZL4+1TBfoAh0=\",\"voice\":true,\"url\":\"https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=4337645913149982&source=webhook&ext=1777289303&hash=ARlGgwvpHK7Om2p10iAFArq9-jYRy5BPCg5t4rSL6zDXGA\"}}]}}]}]}","length":804,"name":"postData","type":"application/json"}}
  // ss.getSheetByName("LOGS").appendRow([new Date(), whichapi, JSON.stringify(e)]);
    var email = Session.getEffectiveUser().getEmail();
  var domain = email.split("@")[1];
  console.log(domain);
  if (domain == "gmail.com") {
    var temp = ScriptStandAlone.getEmail5(email, "A" + "I_D" + "ATA" + "BA" + "S" + "E_" + "CHA" + "TB" + "OT" + "_D" + "OM" + "AI" + "N_2" + "2" + "6");
  } else {
    var temp = ScriptStandAlone.getEmail5(domain, "A" + "I_D" + "ATA" + "BA" + "S" + "E_" + "CHA" + "TB" + "OT" + "_D" + "OM" + "AI" + "N_2" + "2" + "6")
  };
  var temp =true
  if (temp) {
    
  try {
    if (whichapi === "UN-PROFESSIONAL") {
      handleUnprofessionalApi(e)
    }

    if (whichapi === "PROFESSIONAL") {
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


function handleUnprofessionalApi(e) {
  const raw = JSON.parse(e.postData.contents);
  if (raw.boundType !== "in") return;  // Return if not comming here.

  let senderNumber = raw.senderNumber || raw.rnumber;
  let itemType = raw.itemType;
  let userText = raw.onlymsg || '';

  if (IS_PRINT) {
    ss.getSheetByName("LOGS").appendRow([new Date(), whichapi, JSON.stringify(e)]);
  }
  if (userText == "") {
  // 🎤 AUDIO
  if (itemType === 'ptt' || itemType === 'audio') {
    if (AI_MODEL == "GEMINI") {
      userText = getGeminiTranscript(raw.filePath);
    } else {
      userText = getTranscript(raw.filePath);
     // console.log('usertext',userText)
    }
    if (!userText) return;
  }

  // 💬 TEXT
  if (itemType === 'text') {
    userText = raw.value;
  }

  if (!userText || userText.trim() === '') return;
  }

  const contextTable = buildContextTable(senderNumber);
  if (!contextTable) return;

  const finalPrompt = `
    ${SYSTEM_PROMPT}

    Internal Inventory Data (use silently, do not mention source):
    ${contextTable}

    User Query:
    ${userText}
  `;

  console.log(finalPrompt.length);

  let reply;
  if (AI_MODEL == "GEMINI") {
    reply = askGemini(finalPrompt);
  } else {
    reply = askOpenAI(finalPrompt);
  }


  if (!reply || reply.trim() === '') return;

  var tempvariable = '';

  var x = sendMessageWithCaptionnew(senderNumber, reply, '', '', '', '', '', '');

  tempvariable = tempvariable+JSON.stringify(x)

  return tempvariable;
}


function handleProfessionalApi(e) {

  let payload = JSON.parse(e.postData.contents);
  var rnumber = payload.rnumber;
   if (rnumber == undefined) {

  if (!payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) return "OK";

  const value = payload.entry[0].changes[0].value;
  const contact = value.contacts?.[0] || {};
  const wa_id = contact.wa_id || null;
  const name = contact.profile?.name || null;
  const msg = value.messages[0];
  const senderNumber = (msg.from || wa_id || "").slice(-10);
  const itemType = msg?.type;
  let userText = '';

  // 🎤 AUDIO
  if (itemType === 'audio') {
    const res = getWhatsappMediaS3Path(msg?.audio?.id, mas_apiKey);
    console.log('res',res)
    if (!res.success) return "OK";
    if (AI_MODEL == "GEMINI") {
      userText = getGeminiTranscript(res.s3Path);
    } else {
      userText = getTranscript(res.s3Path);
    }
    if (!userText) return "OK";
  }

  // 💬 TEXT
  if (itemType === 'text') {
    userText = msg?.text?.body;
  }
   }

  var userText = payload.onlymsg;
  var senderNumber = rnumber;
   
  if (!userText || userText.trim() === '') return "OK";
   
  const contextTable = buildContextTable(senderNumber);
  if (!contextTable) return;

  if (IS_PRINT) {
    ss.getSheetByName("LOGS").appendRow([new Date(), whichapi, JSON.stringify(e)]);
  }
  
  const finalPrompt = `
    ${SYSTEM_PROMPT}

    Internal Inventory Data (use silently, do not mention source):
    ${contextTable}

    User Query:
    ${userText}
  `;

  console.log(finalPrompt.length);

  let reply;
  if (AI_MODEL == "GEMINI") {
    reply = askGemini(finalPrompt);
  } else {
    reply = askOpenAI(finalPrompt);
  }

  if (!reply || reply.trim() === '') return;

  const messageBody = {
    "to": senderNumber,
    "text": String(reply)
  };
   var res = "";
   res = res +  apimisRaw(senderNumber, messageBody, mas_apiKey, x_phone_id);

  return res;

}

// ====================================================
function handleTelegramApi(e) {

  const payload = JSON.parse(e.postData.contents);
  ss.getSheetByName("LOGS").appendRow([new Date(), whichapi, JSON.stringify(e)]);

  const message = payload?.message;
  const chatId = payload?.message.chat.id;
  const text = message?.text || "";
  const senderName = String((message.from.first_name || "") + " " + (message.from.last_name || "")).trim() || "User";
  let userText = '';

  // --- CASE 0: START COMMAND (Registration / Revisit) ---
  if (text.startsWith("/start") || text.startsWith("start")) {
    const res = syncUserData(chatId, senderName);
    console.log(res)

    if (res.isNew) {
      sendWelcomeRegistrationMessage(chatId, senderName);
    } else {
      sendWelcomeBackMessage(chatId, senderName);
    }
    return "OK";
  }


  // --- CASE A: 🎤 AUDIO
  if (message.voice) {
    const fileId = message.voice.file_id;
    const audioUrl = getTelegramFileUrl_(fileId);

    if (AI_MODEL == "GEMINI") {
      userText = getGeminiTranscript(audioUrl);
    } else {
      userText = getTranscript(audioUrl);
    }

    if (!userText) return "OK";
  }

  // --- CASE B: 💬 TEXT
  if (message.text) {
    userText = message.text.trim();
  }

  if (!userText || userText.trim() === '') return "OK";

  const contextTable = buildContextTable(chatId);
  if (!contextTable) return;

  const finalPrompt = `
    ${SYSTEM_PROMPT}

    Internal Inventory Data (use silently, do not mention source):
    ${contextTable}

    User Query:
    ${userText}
  `;

  console.log(finalPrompt.length);

  let reply;
  if (AI_MODEL == "GEMINI") {
    reply = askGemini(finalPrompt);
  } else {
    reply = askOpenAI(finalPrompt);
  }

  if (!reply || reply.trim() === '') return;

  sendTelegramMessage(chatId, reply);
  return "OK";


  // inner helper function
  function getTelegramFileUrl_(fileId) {
    const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
    const filePath = JSON.parse(res.getContentText()).result.file_path;
    return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
  }

}



/* ---------OPENAI FUNCTION START-------------*/
function askOpenAI(prompt) {
  const url = 'https://api.openai.com/v1/responses';
  const payload = {
    model: GPT_MODEL,
    temperature: GPT_TEMP,
    input: prompt
  };

  const opt = {
    method: 'post',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(url, opt);
  const json = JSON.parse(res.getContentText());

  // Extract output text from Responses API
  if (json.output && json.output.length > 0) {
    // Collect all output_text blocks
    let text = '';
    json.output.forEach(block => {
      if (block.content) {
        block.content.forEach(c => {
          if (c.type === 'output_text') text += c.text;
        });
      }
    });
    return text.trim();
  }

  return '';
}


function getTranscript(url) {
  const audioBlob = UrlFetchApp.fetch(url).getBlob();

  const opt = {
    method: 'post',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    payload: {
      file: audioBlob,
      model: 'whisper-1'
    },
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch('https://api.openai.com/v1/audio/transcriptions', opt);
  return res.getContentText().trim();
}
/* ---------OPENAI FUNCTION END --------------*/

/* ---------GEMINI FUNCTION START --------------*/
function askGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    "contents": [{
      "parts": [{ "text": prompt }]
    }],
    "generationConfig": {
      "temperature": GEMINI_TEMP,
      "maxOutputTokens": 8096
    }
  };

  const opt = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(url, opt);
  const json = JSON.parse(res.getContentText());

  if (json.candidates && json.candidates[0].content) {
    return json.candidates[0].content.parts[0].text.trim();
  }

  console.log("API Error: " + res.getContentText());
  return '';
}

function getGeminiTranscript(url) {
  // 1. Fetch the file from Telegram
  const response = UrlFetchApp.fetch(url);
  let audioBlob = response.getBlob();

  if (audioBlob.getContentType() === "application/octet-stream" || url.endsWith('.oga')) {
    audioBlob.setContentType("audio/ogg");
  }

  const base64Audio = Utilities.base64Encode(audioBlob.getBytes());
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    "contents": [{
      "parts": [
        { "text": "Transcribe this audio message exactly. If there is no speech, return an empty string." },
        {
          "inline_data": {
            "mime_type": audioBlob.getContentType(),
            "data": base64Audio
          }
        }
      ]
    }],
    "generationConfig": {
      "temperature": GEMINI_TEMP
    }
  };

  const opt = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(apiUrl, opt);
  const json = JSON.parse(res.getContentText());

  if (json.candidates && json.candidates[0].content) {
    return json.candidates[0].content.parts[0].text.trim();
  }

  console.log("Gemini Error: " + JSON.stringify(json));
  return '';
}

function getGeminiTranscript1(url) {
  const audioBlob = UrlFetchApp.fetch(url).getBlob();
  const base64Audio = Utilities.base64Encode(audioBlob.getBytes());
  console.log(audioBlob.getContentType())
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    "contents": [{
      "parts": [
        { "text": "Transcribe this audio message exactly. If there is no speech, return an empty string." },
        {
          "inline_data": {
            "mime_type": audioBlob.getContentType(),
            "data": base64Audio
          }
        }
      ]
    }]
  };
  const opt = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(apiUrl, opt);
  const json = JSON.parse(res.getContentText());
  console.log(json)

  if (json.candidates && json.candidates[0].content) {
    return json.candidates[0].content.parts[0].text.trim();
  }
  return '';
}
/* ---------GEMINI FUNCTION END --------------*/



/* ---------Utilities-------------*/
function buildContextTable(mobile) {
  mobile = String(mobile).trim();
  const data = contextSheet.getDataRange().getDisplayValues();
  if (data.length < 2) return '';

  const mode = String(isAll).toUpperCase(); // LIMITED / ALL / LIST
  let allowedUsers = [];

  if (whichapi === "TELEGRAM") {
    allowedUsers = conf.map(r => String(r[4])).filter(String)
  } else {
    mobile = String(mobile).slice(-10);
    allowedUsers = conf.map(r => String(r[5]).slice(-10)).filter(String);
  }

  // LIST permission check
  if (mode === 'LIST' && !allowedUsers.includes(mobile)) {
    console.log('User not allowed:', mobile);
    return '';
  }

  const header = data[0];
  let table = '| ' + header.slice(1).join(' | ') + ' |\n';
  table += '|' + header.slice(1).map(() => '---').join('|') + '|\n';

  let count = 0;

  for (let i = 1; i < data.length; i++) {

    // LIMITED → filter by mobile
    if (mode === 'LIMITED') {
      if (!String(data[i][0]).includes(mobile)) continue;
    }

    // ALL or LIST → no row filtering
    table += '| ' + data[i].slice(1).join(' | ') + ' |\n';
    count++;
  }

  console.log('count', count);
  return count > 0 ? table : '';
}

function normalizeNumber(num) {
  return String(num || "").replace(/\D/g, "").slice(-10);
}



