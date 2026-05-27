// 31-march-26 update whatsapp function helper function
// 07-March-2026 -> added phone for getWhatsappMediaS3Path(metaMediaId, wp_apikey, phoneId) this function
//NEW CODE APPLIED 22-AUG-2025



function fileJsonArray_(filesUrls) {

  if (filesUrls.length > 1) {
    filesUrls = filesUrls.map(function (a) {
      var jss = {}
      if (String(a).indexOf('http') != -1)
        jss['fileUrl'] = String(a).trim()
      else
        jss['metaMediaId'] = String(a).trim()
      return jss
    })
    return filesUrls
  }
  else
    return filesUrls
}

// professional whatsapp with template based code
function apimis(receivers, tempname, tmpVar, lang, filesUrls, mas_password, mas_username, mas_apiKey, x_phone_id) {
  console.log([receivers, tempname, tmpVar, lang, filesUrls])

  //var recarr = receivers.split(",");
  filesUrls = fileJsonArray_(filesUrls)
  var recarr = String(receivers).split(",");
  var errorcheck = 0;
  for (rr in recarr) {
    var messageBody = {
      "templateName": tempname,
      "language": lang,
      "to": String(recarr[rr]).trim(),
      "templateVariables": tmpVar
      /* support for this is pending, but structure would be like this */
    }
    if (filesUrls.length > 1)
      messageBody['files'] = filesUrls;
    else
      messageBody['fileUrl'] = filesUrls.join()

    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        ...mas_password && { 'Authorization': 'Basic ' + Utilities.base64Encode(mas_username + ':' + mas_password, Utilities.Charset.UTF_8) },
        ...mas_apiKey && { 'x-api-key': mas_apiKey },
        ...x_phone_id && { 'x-phone-id': x_phone_id }
      },
      payload: JSON.stringify(messageBody),
      muteHttpExceptions: true

    };
    console.log(options);
    var res = UrlFetchApp.fetch('https://wa.apimis.in/api/v1/whatsapp/sendMessage', options);
    console.log(res.getContentText(), res.getResponseCode())
    if (res.getResponseCode() == 200)
      errorcheck = 1;

  }
  if (errorcheck == 1)
    return "success"
  else return "error"
}

// New verison that accept message body with payload format
function apimisRaw(receivers, messageBody, mas_apiKey, x_phone_id, lang = "en", mas_password = "", mas_username = "") {
  var recarr = String(receivers).split(",");
  var success = false;

  for (var i = 0; i < recarr.length; i++) {

    // clone + inject receiver & language
    var payload = Object.assign({}, messageBody);
    payload.to = String(recarr[i]).trim();
    if (lang) payload.language = lang;

    var headers = {
      "Content-Type": "application/json"
    };

    if (mas_apiKey) headers["x-api-key"] = mas_apiKey;
    if (x_phone_id) headers["x-phone-id"] = x_phone_id;

    if (mas_username && mas_password) {
      headers["Authorization"] = "Basic " + Utilities.base64Encode(mas_username + ":" + mas_password, Utilities.Charset.UTF_8);
    }

    var options = {
      method: "post",
      contentType: "application/json",
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch("https://wa.apimis.in/api/v1/whatsapp/sendMessage", options);

    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
      success = true;
    } else {
      console.log("apimisRaw failed:", res.getContentText());
    }
  }

  return success ? "success" : "error";
}

// New version of code for send raw message with plain text body
function apimisRawNew(receiver, messageText, mas_apiKey, x_phone_id, lang = "en", mas_password = "", mas_username = "") {
  try {

    if (!receiver) throw new Error("Receiver required");
    if (!messageText) throw new Error("Message required");

    receiver = String(receiver).trim();

    // Build payload inside
    var payload = {
      to: receiver,
      text: String(messageText)
    };

    if (lang) payload.language = lang;


    var headers = {
      "Content-Type": "application/json"
    };

    if (mas_apiKey) headers["x-api-key"] = mas_apiKey;
    if (x_phone_id) headers["x-phone-id"] = x_phone_id;

    if (mas_username && mas_password) {
      headers["Authorization"] =
        "Basic " +
        Utilities.base64Encode(
          mas_username + ":" + mas_password,
          Utilities.Charset.UTF_8
        );
    }

    var options = {
      method: "post",
      contentType: "application/json",
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(
      "https://wa.apimis.in/api/v1/whatsapp/sendMessage",
      options
    );

    var code = res.getResponseCode();

    if (code >= 200 && code < 300) {
      return "success";
    } else {
      console.log("apimisRaw failed:", res.getContentText());
      return "error";
    }

  } catch (err) {
    console.log("apimisRaw exception:", err.message);
    return "error";
  }
}

// get path from whatsapp server professional
function getWhatsappMediaS3PathWithUserNamePassword(metaMediaId, username, password) {
  try {
    if (!metaMediaId || !username || !password) {
      throw new Error("Missing required parameters.");
    }

    // Create Basic Auth header
    const credentials = Utilities.base64Encode(username + ":" + password);

    const url = "https://wa.redlava.in/api/v1/whatsapp/media/mediaDetail/" + metaMediaId;

    const options = {
      method: "get",
      headers: {
        "Authorization": "Basic " + credentials
      },
      muteHttpExceptions: true
    };

    //  Call API
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode !== 200) {
      throw new Error("API Error: " + responseCode + " - " + responseText);
    }

    const data = JSON.parse(responseText);

    //  Check s3Path
    if (data && data.s3Path) {
      return {
        success: true,
        s3Path: data.s3Path,
        fileName: data.filename || "",
        metaMediaId: metaMediaId
      };
    } else {
      throw new Error("s3Path not found in response.");
    }

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// get file s3 file path from server prfessional
function getWhatsappMediaS3Path(metaMediaId, wp_apikey, phoneId) {
  try {

    if (!metaMediaId || !wp_apikey || !phoneId) {
      throw new Error("Missing required parameters (metaMediaId, wp_apikey, phoneId).");
    }

    const url = "https://wa.redlava.in/api/v1/whatsapp/media/mediaDetail/" + metaMediaId;

    const options = {
      method: "get",
      headers: {
        "x-api-key": wp_apikey,
        "x-phone-id": phoneId
      },
      muteHttpExceptions: true
    };

    // function to call API
    function callApi() {
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();

      if (responseCode !== 200) {
        throw new Error("API Error: " + responseCode + " - " + response.getContentText());
      }

      return JSON.parse(response.getContentText());
    }

    // First attempt
    let data = callApi();

    // If s3Path missing → retry once after 5 sec
    if (!data || !data.s3Path) {
      console.log("s3Path not found, retrying after 5 seconds...");
      Utilities.sleep(5000);

      data = callApi();
    }

    // Final check
    if (data && data.s3Path) {
      return {
        success: true,
        s3Path: data.s3Path,
        fileName: data.filename || "",
        metaMediaId: metaMediaId
      };
    }

    throw new Error("s3Path not found even after retry.");

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}


















// ===========UNPROFESSIONAL WA==================

//MULTIPLE FILES/MULTIPLE CAPTIONS ADDED 
var mas_username = "";
var mas_password = "";
// var mas_apiKey = ""//  
// var channelId = "";

function sendMessageWithCaption(receivers, textMessages, filesUrls, fileCaption, mas_apiKey, channelId) {
  // console.log(receivers + textMessages + filesUrls + fileCaption)
  var final_ar = [];
  if (filesUrls) {
    var driveFiles = [];
    try {
      var arr = filesUrls.split(',');
    }
    catch (e) {
      var arr = [filesUrls];
    }

    arr.forEach(function (url) {
      url = url.trim();
      final_ar.push(url);
    });
  }

  var final_ar2 = [];
  if (fileCaption) {
    try {
      var arr = fileCaption.split(',');
    }
    catch (e) {
      var arr = [fileCaption];
    }

    arr.forEach(function (url) {
      url = url.trim();
      final_ar2.push(url);
    });
  }

  var messages = [].concat(textMessages || []);
  var caption = [].concat(final_ar2 || []);
  var urls = [].concat(final_ar || []);
  var rawReceivers = [].concat(receivers || []);

  var receiverIds = rawReceivers.filter((item) => String(item).endsWith('@c.us') || String(item).endsWith('@g.us'));
  var receiverNumbers = rawReceivers.filter((item) => !receiverIds.includes(item));

  var driveFiles = urls.filter((filePath) => filePath.indexOf('drive.google.com') !== -1 || filePath.indexOf('docs.google.com') !== -1);
  var nonDriveFiles = urls.filter((filePath) => !driveFiles.includes(filePath));

  var messageBody = {
    username: mas_username,
    password: mas_password,
    receiverMobileNo: receiverNumbers.join(","),
    recipientIds: receiverIds,
    message: messages,
    filePathUrl: nonDriveFiles,
    caption: caption,
    randomizeItems: true,
    channelId: channelId,
    base64File: driveFiles.map((url) => getGoogleFileAsBase64_(url)),
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      ...mas_password && { 'Authorization': 'Basic ' + Utilities.base64Encode(mas_username + ':' + mas_password, Utilities.Charset.UTF_8) },
      ...mas_apiKey && { 'x-api-key': mas_apiKey }
    },
    payload: JSON.stringify(messageBody)
  };

  try {
    var sendNow = UrlFetchApp.fetch("http://ap" + "p.mis.w" + "ork/ap" + "i/v1/mes" + "sage/create", options);
    Logger.log(sendNow)
  } catch (e) {
    Logger.log(e)
  }
}

function getDriveFileIdFromUrl_(url) { return url.match(/[-\w]{25,}/) };

function getGoogleFileAsBase64_(url) {
  var returnValue = {}
  if (url.indexOf('docs.google.com') !== -1) {
    var file = DocumentApp.openById(getDriveFileIdFromUrl_(url));
    returnValue = {
      name: file.getName().replace(/\.[^/.]+$/, '') + '.pdf',
      body: Utilities.base64Encode(file.getAs('application/pdf').getBytes())
    };
  } else if (url.indexOf('drive.google.com') !== -1) {
    var file = DriveApp.getFileById(getDriveFileIdFromUrl_(url));
    returnValue = {
      name: file.getName(),
      body: Utilities.base64Encode(file.getBlob().getBytes())
    }
  }
  return returnValue;
}

