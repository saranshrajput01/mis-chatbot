//23feb26
function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  };

  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
  } catch (e) {
    // prevent code from breaking
    Logger.log("Telegram send failed for chatId " + chatId + ": " + e);
  }
}



function sendWelcomeRegistrationMessage(chatId, senderName) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good Morning ☀️" :
      hour < 17 ? "Good Afternoon 🌤️" :
        "Good Evening 🌙";

  let msg = `<b>${greeting}, ${escapeHtml(senderName)}</b>\n\n`;

  msg += `👋 <b>Welcome to MIS WORK INDIA Bot</b>\n\n`;

  msg += `✅ <b>Your account has been successfully registered!</b>\n\n`;

  msg += `🚀 <b>What you can do now:</b>\n`;
  msg += `• Assign tasks using <b>voice commands</b> 🎙️\n`;
  msg += `• Automatically notify team members\n`;
  msg += `• Track work without typing\n\n`;

  msg += `💡 <i>Just send a voice message describing the task to begin.</i>\n`;

  sendTelegramMessage(chatId, msg);
}


function sendWelcomeBackMessage(chatId, senderName) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good Morning ☀️" :
      hour < 17 ? "Good Afternoon 🌤️" :
        "Good Evening 🌙";

  let msg = `<b>${greeting}, ${escapeHtml(senderName)}</b>\n\n`;

  msg += `👋 <b>Welcome back!</b>\n\n`;

  msg += `✅ You're already registered and ready to continue.\n\n`;

  msg += `🎙️ <i>Send a voice message anytime to assign a new task.</i>\n`;

  sendTelegramMessage(chatId, msg);
}



function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function syncUserData(chatId, senderName) {
  const ws = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ws.getSheetByName("Configuration");
  if (!sheet) return false;
  const sheetRaw = sheet.getRange("D1:F").getValues();
  const userIndex = sheetRaw.findIndex(r => r[1] == chatId);
  console.log(userIndex);

  let response = {
    isNew: false
  }

  if (userIndex != -1) {
    sheet.getRange(Number(userIndex) + 1, 4, 1, 2).setValues([[senderName, chatId]]);
  } else {
    const rowNo = sheetRaw.reduce((acc, row, i) => row[0] != "" ? i + 1 : acc, 0) + 1;
    sheet.getRange(rowNo, 4, 1, 2).setValues([[senderName, chatId]]);
    response.isNew = true;
  }

  return response;
}

function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: chatId,
      text: text
    }),
    muteHttpExceptions: true
  });
}
