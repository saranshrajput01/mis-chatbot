
//23feb26
function sendMessageWithCaptionnew(receivers, textMessages, filesUrls, fileCaption, mas_username, mas_password, name, stname) {
  console.log(receivers + textMessages + filesUrls + fileCaption)
  if (whichapi == 'wa.apimis.in') {
    /**
     * curl -X 'POST' \
      'https://wa.apimis.in/api/v1/whatsapp/sendMessage?apiKey=ff51350548d6467311cee4aa2e5c30df27c3f0fb451baa017289b0345785245b99480d5380e465a8c1184d57a6ccff9bd9fe' \
      -H 'accept: application/json' \
      -H 'x-phone-id: 287368264453565' \
      -H 'Content-Type: application/json' \
      -d '{
      "to": "9069201029",
      "text": "Hello, this is a test message!"
    }'
     */

    var u = 'https://wa.apimis.in/api/v1/whatsapp/sendMessage?apiKey=' + mas_apiKey;
    var h = {
      'accept': 'application/json',
      'x-phone-id': x_phone_id,
      'Content-Type': 'application/json'
    }
    var d = {
      to: receiverIds,
      text: textMessages
    }
    var opt = {
      method: "post",
      headers: h,
      payload: JSON.stringify(d),

    }
    var res = UrlFetchApp.fetch(u, opt).getContentText()
    console.log(res)
  }
  else {
    if (textMessages == null || textMessages == " " || textMessages == "" || textMessages == undefined || textMessages == "null" || textMessages.toLowerCase().replace(/[*]/g, '') == '(no response.)')
      return;

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
      base64File: driveFiles.map((url) => getGoogleFileAsBase64(url, name, stname)),
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
      var sendNow = UrlFetchApp.fetch("http://app.mis.work/api/v1/message/create", options);
      Logger.log(sendNow)
      return true;
    } catch (e) {
      Logger.log(e)
      return false;
    }
  }
  //-----------------------------


  function getDriveFileIdFromUrl(url) {
    // url = 'https://drive.google.com/uc?id=1RcgDn9zPzfyUMDIXlZUKwt0BVa4tlgQh'
    var test = url.match(/[-\w]{25,}/g)
    if (test != null)
      return test[0]
    else
      return url.match(/[-\w]{25,}/)
  };


  function getGoogleFileAsBase64(url, fname, stname) {
    var returnValue = {}
    if (url.indexOf('docs.google.com') !== -1) {
      if (url.indexOf('spreadsheets') !== -1) {
        returnValue = {
          name: fname.replace(/\.[^/.]+$/, '') + '.pdf',
          body: Utilities.base64Encode(pdfblob(url, stname).getBytes())
        }
      }
      else {
        var file = DocumentApp.openById(getDriveFileIdFromUrl(url));
        returnValue = {
          name: file.getName().replace(/\.[^/.]+$/, '') + '.pdf',
          body: Utilities.base64Encode(file.getAs('application/pdf').getBytes())
        };
      }
    } else if (url.indexOf('drive.google.com') !== -1) {
      var file = DriveApp.getFileById(getDriveFileIdFromUrl(url));
      returnValue = {
        name: file.getName(),
        body: Utilities.base64Encode(file.getBlob().getBytes())
      }
    }
    return returnValue;
  }

  function pdfblob(url, stname) {
    var ss = SpreadsheetApp.openByUrl(url);
    var st = ss.getSheetByName(stname)
    var params = { method: "GET", headers: { "authorization": "Bearer " + ScriptApp.getOAuthToken() } };
    var token = ScriptApp.getOAuthToken();
    var response = UrlFetchApp.fetch("https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?gid=" + st.getSheetId() + "&size=A4&portrait=true&fzr=false&gridlines=false&format=pdf&fitw=true&top_margin=0.20&left_margin=0.20&right_margin=0.20&bottom_margin=0.20", params)

    var array_blob = response.getBlob().getAs('application/pdf');
    return array_blob;
  }
}

