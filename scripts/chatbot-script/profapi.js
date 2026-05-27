//NEW CODE APPLIED 22-AUG-2025
//23-FEB-26

function fileJsonArray(filesUrls) {

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

function apimis(receivers, tempname, tmpVar, lang, filesUrls, mas_password, mas_username, mas_apiKey, x_phone_id) {
  console.log([receivers, tempname, tmpVar, lang, filesUrls])

  //var recarr = receivers.split(",");
  filesUrls = fileJsonArray(filesUrls)
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

// New verison that accept message body
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

    // ✅ Build payload inside
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

// get path from whatsapp server
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

function getWhatsappMediaS3Path(metaMediaId, wp_apikey) {
  try {
    if (!metaMediaId || !wp_apikey) {
      throw new Error("Missing required parameters (metaMediaId or wp_apikey).");
    }

    const url = "https://wa.redlava.in/api/v1/whatsapp/media/mediaDetail/" + metaMediaId;

    const options = {
      method: "get",
      headers: {        
        "x-api-key": wp_apikey 
      },
      muteHttpExceptions: true
    };

    // Call API
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode !== 200) {
      throw new Error("API Error: " + responseCode + " - " + responseText);
    }

    const data = JSON.parse(responseText);

    // Check s3Path in the response body
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





