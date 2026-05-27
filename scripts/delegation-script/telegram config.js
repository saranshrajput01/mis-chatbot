// you need run only resetTelegramWebhook() this, after once you added webapp url on line 3.

var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzbG2Vqh_JeUIgYgBSvcSqGZJ-RDxkHiEkCnjDeR948y_WgPkKdXzFxU6tJ8zsv_MGeKg/exec';

function resetTelegramWebhook() {
  const baseUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

  // Delete webhook + drop pending updates
  const deleteUrl = `${baseUrl}/deleteWebhook?drop_pending_updates=true`;
  const deleteRes = UrlFetchApp.fetch(deleteUrl, { muteHttpExceptions: true });

  Logger.log('DELETE WEBHOOK RESPONSE: ' + deleteRes.getContentText());
  Utilities.sleep(1000); // small delay (recommended)

  // Set new webhook
  const setUrl = `${baseUrl}/setWebhook?url=${encodeURIComponent(WEBAPP_URL)}`;
  const setRes = UrlFetchApp.fetch(setUrl, { muteHttpExceptions: true });

  Logger.log('SET WEBHOOK RESPONSE: ' + setRes.getContentText());

  // Verify webhook
  const infoRes = UrlFetchApp.fetch(`${baseUrl}/getWebhookInfo`);
  Logger.log('WEBHOOK INFO: ' + infoRes.getContentText());

}


function getWebhookInfo() {
  const baseUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
  // Verify webhook
  const infoRes = UrlFetchApp.fetch(`${baseUrl}/getWebhookInfo`);
  Logger.log('WEBHOOK INFO: ' + infoRes.getContentText());

}

function deleteWebhook() {
  const baseUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
  const deleteUrl = `${baseUrl}/deleteWebhook?drop_pending_updates=true`;
  const deleteRes = UrlFetchApp.fetch(deleteUrl, { muteHttpExceptions: true });
  Logger.log('DELETE WEBHOOK RESPONSE: ' + deleteRes.getContentText());
}


