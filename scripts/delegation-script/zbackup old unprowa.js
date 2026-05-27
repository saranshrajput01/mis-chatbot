// //MULTIPLE FILES/MULTIPLE CAPTIONS ADDED 
// var mas_username = "";
// var mas_password = "";
// // var mas_apiKey = ""//  
// // var channelId = "";

// function sendMessageWithCaption(receivers, textMessages, filesUrls, fileCaption, mas_apiKey, channelId) {
//   // console.log(receivers + textMessages + filesUrls + fileCaption)
//   var final_ar = [];
//   if (filesUrls) {
//     var driveFiles = [];
//     try {
//       var arr = filesUrls.split(',');
//     }
//     catch (e) {
//       var arr = [filesUrls];
//     }

//     arr.forEach(function (url) {
//       url = url.trim();
//       final_ar.push(url);
//     });
//   }

//   var final_ar2 = [];
//   if (fileCaption) {
//     try {
//       var arr = fileCaption.split(',');
//     }
//     catch (e) {
//       var arr = [fileCaption];
//     }

//     arr.forEach(function (url) {
//       url = url.trim();
//       final_ar2.push(url);
//     });
//   }

//   var messages = [].concat(textMessages || []);
//   var caption = [].concat(final_ar2 || []);
//   var urls = [].concat(final_ar || []);
//   var rawReceivers = [].concat(receivers || []);

//   var receiverIds = rawReceivers.filter((item) => String(item).endsWith('@c.us') || String(item).endsWith('@g.us'));
//   var receiverNumbers = rawReceivers.filter((item) => !receiverIds.includes(item));

//   var driveFiles = urls.filter((filePath) => filePath.indexOf('drive.google.com') !== -1 || filePath.indexOf('docs.google.com') !== -1);
//   var nonDriveFiles = urls.filter((filePath) => !driveFiles.includes(filePath));

//   var messageBody = {
//     username: mas_username,
//     password: mas_password,
//     receiverMobileNo: receiverNumbers.join(","),
//     recipientIds: receiverIds,
//     message: messages,
//     filePathUrl: nonDriveFiles,
//     caption: caption,
//     randomizeItems: true,
//     channelId: channelId,
//     base64File: driveFiles.map((url) => getGoogleFileAsBase64(url)),
//   };

//   var options = {
//     method: 'post',
//     contentType: 'application/json',
//     headers: {
//       ...mas_password && { 'Authorization': 'Basic ' + Utilities.base64Encode(mas_username + ':' + mas_password, Utilities.Charset.UTF_8) },
//       ...mas_apiKey && { 'x-api-key': mas_apiKey }
//     },
//     payload: JSON.stringify(messageBody)
//   };

//   try {
//     var sendNow = UrlFetchApp.fetch("http://ap" + "p.mis.w" + "ork/ap" + "i/v1/mes" + "sage/create", options);
//     Logger.log(sendNow)
//   } catch (e) {
//     Logger.log(e)
//   }
// }

// function getDriveFileIdFromUrl(url) { return url.match(/[-\w]{25,}/) };

// function getGoogleFileAsBase64(url) {
//   var returnValue = {}
//   if (url.indexOf('docs.google.com') !== -1) {
//     var file = DocumentApp.openById(getDriveFileIdFromUrl(url));
//     returnValue = {
//       name: file.getName().replace(/\.[^/.]+$/, '') + '.pdf',
//       body: Utilities.base64Encode(file.getAs('application/pdf').getBytes())
//     };
//   } else if (url.indexOf('drive.google.com') !== -1) {
//     var file = DriveApp.getFileById(getDriveFileIdFromUrl(url));
//     returnValue = {
//       name: file.getName(),
//       body: Utilities.base64Encode(file.getBlob().getBytes())
//     }
//   }
//   return returnValue;
// }


