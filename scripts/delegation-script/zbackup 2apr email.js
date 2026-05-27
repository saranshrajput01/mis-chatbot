// /**
//  * Sends a professional HTML booking confirmation email.
//  *
//  * Call this right after a successful booking:
//  *   sendBookingConfirmationEmail(guestEmail, result, bookingResponse);
//  *
//  * @param {string} guestEmail      - Recipient email address
//  * @param {object} result          - AI result object (title, start_time, venue, frequency, etc.)
//  * @param {object} bookingResponse - Response from executeGoogleBooking() (meetLink, eventId, etc.)
//  * @param {Array}  matchedUser     - [ownerName, guestName, phone, email, ownerEmail]
//  */

// function sendBookingConfirmationEmail(guestEmail, result, bookingResponse, matchedUser) {
//   if (!guestEmail || !guestEmail.includes("@")) {
//     console.warn("sendBookingConfirmationEmail: No valid email, skipping.");
//     return;
//   }

//   // ── Derive display values ──────────────────────────────────────────
//   const start = parseAIDate(result.start_time);
//   const end = new Date(start.getTime() + (result.duration || 30) * 60000);
//   const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
//   const dayName = dayNames[start.getDay()];
//   const dateStr = Utilities.formatDate(start, "GMT+5:30", "dd MMM yyyy");
//   const startStr = Utilities.formatDate(start, "GMT+5:30", "hh:mm a");
//   const endStr = Utilities.formatDate(end, "GMT+5:30", "hh:mm a");

//   const guestName = matchedUser[1] || "Guest";
//   const guestPhone = matchedUser[2] || "";
//   const guestInitials = guestName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

//   const freq = String(result.frequency || "ONCE").toUpperCase();
//   const freqLabel = freq === "DAILY" ? "Daily"
//     : freq === "WEEKLY" ? `Weekly · Every ${dayName}`
//       : freq === "MONTHLY" ? `Monthly · ${Utilities.formatDate(start, "GMT+5:30", "d")}th of every month`
//         : "Once";

//   const venue = result.venue || "Not specified";
//   const isGoogleMeet = venue.toLowerCase().includes("meet") || venue.toLowerCase().includes("zoom");
//   const meetLink = bookingResponse.meetLink || "";
//   const inviteStatus = bookingResponse.invited ? "Invite sent" : "No email — calendar only";
//   const inviteBg = bookingResponse.invited ? "#EAF3DE" : "#FAEEDA";
//   const inviteColor = bookingResponse.invited ? "#27500A" : "#633806";

//   // ── Build HTML ─────────────────────────────────────────────────────
//   const html = `
//     <!DOCTYPE html>
//     <html lang="en">
//     <head>
//       <meta charset="UTF-8" />
//       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//       <title>Meeting Confirmed</title>
//     </head>
//     <body style="margin:0;padding:24px 16px;background:#f4f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

//       <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
//         <tr><td>

//           <!-- HEADER -->
//           <table width="100%" cellpadding="0" cellspacing="0"
//             style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:32px;">
//             <tr>
//               <td>
//                 <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
//                   <tr>
//                     <td style="background:rgba(255,255,255,0.1);border-radius:8px;padding:8px;width:36px;height:36px;text-align:center;vertical-align:middle;">
//                       <span style="font-size:18px;line-height:1;">&#128197;</span>
//                     </td>
//                     <td style="padding-left:10px;color:rgba(255,255,255,0.8);font-size:14px;font-weight:500;">
//                       MIS Work India
//                     </td>
//                   </tr>
//                 </table>
//                 <p style="color:#ffffff;font-size:24px;font-weight:600;margin:0 0 6px;">Meeting confirmed</p>
//                 <p style="color:rgba(255,255,255,0.5);font-size:14px;margin:0;">Your calendar has been updated</p>
//               </td>
//             </tr>
//           </table>

//           <!-- BODY -->
//           <table width="100%" cellpadding="0" cellspacing="0"
//             style="background:#ffffff;border:1px solid #e5e5e0;border-top:none;border-radius:0 0 12px 12px;padding:28px;">
//             <tr><td>

//               <!-- Event title block -->
//               <table width="100%" cellpadding="0" cellspacing="0"
//                 style="background:#f7f7f3;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
//                 <tr>
//                   <td>
//                     <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:#888;margin:0 0 5px;">Event</p>
//                     <p style="font-size:17px;font-weight:600;color:#1a1a2e;margin:0;">${result.title}</p>
//                   </td>
//                 </tr>
//               </table>

//               <!-- 4-cell info grid (table-based for email client compatibility) -->
//               <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
//                 <tr>
//                   <td width="50%" style="padding:0 6px 12px 0;">
//                     <table width="100%" cellpadding="12" cellspacing="0"
//                       style="border:1px solid #e5e5e0;border-radius:8px;">
//                       <tr><td>
//                         <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:#aaa;margin:0 0 5px;">Date</p>
//                         <p style="font-size:14px;font-weight:600;color:#1a1a2e;margin:0;">${dayName}, ${dateStr}</p>
//                       </td></tr>
//                     </table>
//                   </td>
//                   <td width="50%" style="padding:0 0 12px 6px;">
//                     <table width="100%" cellpadding="12" cellspacing="0"
//                       style="border:1px solid #e5e5e0;border-radius:8px;">
//                       <tr><td>
//                         <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:#aaa;margin:0 0 5px;">Time (IST)</p>
//                         <p style="font-size:14px;font-weight:600;color:#1a1a2e;margin:0;">${startStr} – ${endStr}</p>
//                       </td></tr>
//                     </table>
//                   </td>
//                 </tr>
//                 <tr>
//                   <td width="50%" style="padding:0 6px 0 0;">
//                     <table width="100%" cellpadding="12" cellspacing="0"
//                       style="border:1px solid #e5e5e0;border-radius:8px;">
//                       <tr><td>
//                         <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:#aaa;margin:0 0 5px;">Venue</p>
//                         <p style="font-size:14px;font-weight:600;color:#1a1a2e;margin:0;">${venue}</p>
//                       </td></tr>
//                     </table>
//                   </td>
//                   <td width="50%" style="padding:0 0 0 6px;">
//                     <table width="100%" cellpadding="12" cellspacing="0"
//                       style="border:1px solid #e5e5e0;border-radius:8px;">
//                       <tr><td>
//                         <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:#aaa;margin:0 0 5px;">Repeat</p>
//                         <p style="font-size:14px;font-weight:600;color:#1a1a2e;margin:0;">${freqLabel}</p>
//                       </td></tr>
//                     </table>
//                   </td>
//                 </tr>
//               </table>

//               <!-- Guest card -->
//               <table width="100%" cellpadding="0" cellspacing="0"
//                 style="border:1px solid #e5e5e0;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
//                 <tr>
//                   <td>
//                     <p style="font-size:10px;text-transform:uppercase;letter-spacing:0.07em;color:#aaa;margin:0 0 12px;">Guest details</p>
//                     <table cellpadding="0" cellspacing="0">
//                       <tr>
//                         <td style="vertical-align:middle;">
//                           <div style="width:40px;height:40px;border-radius:50%;background:#E6F1FB;text-align:center;line-height:40px;font-size:13px;font-weight:600;color:#0C447C;">${guestInitials}</div>
//                         </td>
//                         <td style="padding-left:12px;vertical-align:middle;">
//                           <p style="font-size:15px;font-weight:600;color:#1a1a2e;margin:0;">${guestName}</p>
//                           <p style="font-size:13px;color:#666;margin:2px 0 0;">${guestEmail}</p>
//                         </td>
//                       </tr>
//                     </table>
//                     <div style="margin-top:12px;">
//                       ${guestPhone ? `<span style="display:inline-block;font-size:12px;background:#E6F1FB;color:#0C447C;padding:3px 10px;border-radius:6px;margin-right:6px;">&#128241; ${guestPhone}</span>` : ""}
//                       <span style="display:inline-block;font-size:12px;background:${inviteBg};color:${inviteColor};padding:3px 10px;border-radius:6px;">${inviteStatus}</span>
//                     </div>
//                   </td>
//                 </tr>
//               </table>

//               <!-- CTA button (only if Google Meet link exists) -->
//               ${isGoogleMeet && meetLink ? `
//               <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
//                 <tr>
//                   <td align="center">
//                     <a href="${meetLink}"
//                       style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.02em;">
//                       Join Google Meet &#8599;
//                     </a>
//                   </td>
//                 </tr>
//               </table>` : ""}

//               <!-- Footer -->
//               <table width="100%" cellpadding="0" cellspacing="0"
//                 style="border-top:1px solid #e5e5e0;padding-top:16px;">
//                 <tr>
//                   <td>
//                     <p style="font-size:12px;color:#aaa;margin:0;">
//                       Booked via AI Voice Assistant &nbsp;·&nbsp; MIS Work India Pvt Ltd
//                       &nbsp;·&nbsp; ${Utilities.formatDate(new Date(), "GMT+5:30", "dd MMM yyyy, hh:mm a")}
//                     </p>
//                   </td>
//                 </tr>
//               </table>

//             </td></tr>
//           </table>

//         </td></tr>
//       </table>

//     </body>
//     </html>
//   `;

//   // ── Send ───────────────────────────────────────────────────────────
//   GmailApp.sendEmail(
//     guestEmail,
//     `Meeting Confirmed: ${result.title}`,
//     // Plain-text fallback (shown if HTML is blocked)
//     `Meeting confirmed: ${result.title}\nDate: ${dayName}, ${dateStr}\nTime: ${startStr} - ${endStr} IST\nVenue: ${venue}\nMeet link: ${meetLink || "N/A"}`,
//     {
//       htmlBody: html,
//       name: "MIS Work India — Calendar",
//       replyTo: Session.getEffectiveUser().getEmail(),
//     }
//   );

//   console.log("Confirmation email sent to:", guestEmail);
// }