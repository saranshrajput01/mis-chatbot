
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
  const sheet = ws.getSheetByName("TELEGRAM DATA");
  if (!sheet) return false;
  const sheetRaw = sheet.getRange("A1:B").getValues();
  const userIndex = sheetRaw.findIndex(r => r[1] == chatId);
  console.log(userIndex);
  let response = {
    isNew: false
  }
  if (userIndex != -1) {
    sheet.getRange(Number(userIndex) + 1, 1, 1, 2).setValues([[senderName, chatId]]);
  } else {
    const rowNo = sheetRaw.reduce((acc, row, i) => row[0] != "" ? i + 1 : acc, 0) + 1;
    sheet.getRange(rowNo, 1, 1, 2).setValues([[senderName, chatId]]);
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



function sendTelegramSelectionMenu(chatId, matches) {
  let msg = "🤔 <b>Multiple Matches Found</b>\n\n";
  msg += "Please select the person you want to assign this task to:\n\n";

  matches.forEach((user, index) => {
    msg += `🔹 <b>${index + 1}.</b> ${escapeHtml(user[0])}\n`;
    msg += `📞 ${escapeHtml(user[0])} | 🆔 <code>${escapeHtml(user[1])}</code>\n\n`;
  });
  msg += "✍️ <i>Reply with the corresponding number (e.g., 1).</i>";

  sendTelegramMessage(chatId, msg);
}

function sendTaskTelegram(result, payload, assignedChatId, assignedName) {
  const hour = new Date().getHours();
  let greeting =
    hour < 12 ? "Good Morning ☀️" :
      hour < 17 ? "Good Afternoon 🌤️" :
        "Good Evening 🌙";

  const senderName = String((payload.message.from.first_name || "") + " " + (payload.message.from.last_name || "")).trim()
  let message = `<b>${greeting}</b>\n`;
  message += `<b>${escapeHtml(assignedName)},</b>\n\n`;

  message += `🎯 <b>You have a new task assigned</b>\n\n`;

  message += `👤 <b>Assigned By:</b> ${escapeHtml(senderName)}\n`;
  message += `📝 <b>Task:</b> ${escapeHtml(result.task_name)}\n`;

  if (result.due_date) {
    message += `📅 <b>Due Date:</b> ${escapeHtml(result.due_date)}\n`;
  }


  let pEmoji = "⚪";
  if (result.priority && result.priority.trim() !== "") {
    const p = result.priority.toLowerCase();

    if (p.includes("high")) pEmoji = "🔴";
    else if (p.includes("medium")) pEmoji = "🟡";
    else if (p.includes("low")) pEmoji = "🟢";

    message += `${pEmoji} <b>Priority:</b> ${escapeHtml(result.priority)}\n`;
  }

  message += `\n✅ <i>Please acknowledge this task at your earliest convenience.</i>`;

  sendTelegramMessage(assignedChatId, message);

  /* Build Assigner Confirmation Message  */
  let assingerName = String((payload?.message.chat.first_name || "") + " " + (payload?.message.chat.last_name || "")).trim();


  let assignerMsg = `<b>${greeting}, ${escapeHtml(assingerName)}</b>\n\n`;
  assignerMsg += `✅ <b>Task Assigned Successfully</b>\n\n`;
  assignerMsg += `👤 <b>Assigned To:</b> ${escapeHtml(assignedName)}\n`;
  assignerMsg += `📝 <b>Task:</b> ${escapeHtml(result.task_name)}\n`;

  if (result.due_date) {
    assignerMsg += `📅 <b>Due Date:</b> ${escapeHtml(result.due_date)}\n`;
  }

  if (result.priority && result.priority.trim() !== "") {
    assignerMsg += `${pEmoji} <b>Priority:</b> ${escapeHtml(result.priority)}\n`;
  }
  // assignerMsg += `💡 <b>AI Reason:</b> ${escapeHtml(result.reasoning)}\n`;
  assignerMsg += `\nℹ️ The assignee has been notified via Telegram.`;

  // sent confirmation message
  sendTelegramMessage(payload.message.chat.id, assignerMsg);
}


