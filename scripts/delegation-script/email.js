function sendBookingConfirmationEmail(guestEmail, result, bookingResponse, matchedUser) {
  if (!guestEmail || !guestEmail.includes("@")) {
    console.warn("sendBookingConfirmationEmail: No valid email, skipping.");
    return;
  }

  // ── Derive display values ──────────────────────────────────────────
  const start = parseAIDate(result.start_time);
  const end = new Date(start.getTime() + (result.duration || 30) * 60000);
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[start.getDay()];
  const dateStr = Utilities.formatDate(start, "GMT+5:30", "dd MMM yyyy");
  const startStr = Utilities.formatDate(start, "GMT+5:30", "hh:mm a");
  const endStr = Utilities.formatDate(end, "GMT+5:30", "hh:mm a");
  const dayNum = Utilities.formatDate(start, "GMT+5:30", "d");

  const guestName = matchedUser[1] || "Guest";
  const guestPhone = matchedUser[2] || "";
  const guestInitials = guestName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const freq = String(result.frequency || "ONCE").toUpperCase();
  const freqLabel = freq === "DAILY" ? "Daily"
    : freq === "WEEKLY" ? `Weekly`
      : freq === "MONTHLY" ? `Monthly`
        : "One-time";
  const freqSub = freq === "DAILY" ? "Every day"
    : freq === "WEEKLY" ? `Every ${dayName}`
      : freq === "MONTHLY" ? `${dayNum}th of each month`
        : "Does not repeat";

  const venue = result.venue || "Not specified";
  const isGoogleMeet = venue.toLowerCase().includes("meet");
  const isZoom = venue.toLowerCase().includes("zoom");
  const isOnline = isGoogleMeet || isZoom;
  const venueSub = isOnline ? "Online call" : "In-person";
  const meetLink = bookingResponse.meetLink || "";

  const inviteStatus = bookingResponse.invited ? "Invite Sent" : "Calendar Only";
  const inviteBg = bookingResponse.invited ? "#F0FDF4" : "#FFFBEB";
  const inviteColor = bookingResponse.invited ? "#166534" : "#92400E";
  const inviteBorder = bookingResponse.invited ? "#BBF7D0" : "#FDE68A";
  const inviteIcon = bookingResponse.invited ? "✓" : "⏳";

  const sentAt = Utilities.formatDate(new Date(), "GMT+5:30", "dd MMM yyyy, hh:mm a");

  // ── Build HTML ─────────────────────────────────────────────────────
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Meeting Confirmed — MIS Work India</title>
    </head>
    <body style="margin:0;padding:20px 16px;background:#ECEEF2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;">
      <tr><td>

        <!-- ═══ HEADER ═══ -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="border-radius:16px 16px 0 0;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#0B1D3A 0%,#142D55 60%,#1A3A6E 100%);padding:36px 36px 28px;">

              <!-- Logo -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background: #ffffff;padding: 5px 15px;border-radius: 25px;">
                    <img
                      src="https://www.mis.work/assets/images/logo.png"
                      alt="MIS Work India"
                      height="34"
                      style="display:block;max-height:34px;width:auto;image-rendering:crisp-edges;"
                    />
                  </td>
                </tr>
              </table>

              <!-- Status pill -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                  <td style="background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.35);border-radius:20px;padding:5px 14px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:7px;height:7px;background:#4ADE80;border-radius:50%;"></td>
                        <td style="padding-left:7px;font-size:11px;font-weight:700;color:#4ADE80;letter-spacing:0.09em;">CONFIRMED</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;line-height:1.2;">Your meeting is booked</p>
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);">A calendar invite has been sent to your email</p>

            </td>
          </tr>
        </table>

        <!-- Blue accent stripe -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="height:3px;background:linear-gradient(90deg,#1D4ED8,#3B82F6,#93C5FD,#3B82F6,#1D4ED8);"></td>
          </tr>
        </table>

        <!-- ═══ BODY ═══ -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:0 0 16px 16px;">
          <tr><td style="padding:32px 36px;">

            <!-- Event title block -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#F0F5FF;border-left:3px solid #3B82F6;border-radius:0 10px 10px 0;padding:16px 20px;">
                  <p style="margin:0 0 5px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#3B82F6;">Event</p>
                  <p style="margin:0;font-size:20px;font-weight:700;color:#0B1D3A;letter-spacing:-0.01em;">${result.title}</p>
                </td>
              </tr>
            </table>

            <!-- 2×2 info grid -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <!-- Date -->
                <td width="50%" style="padding:0 8px 12px 0;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="border:1px solid #E8EDF5;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="background:#F8FAFF;padding:7px 15px;border-bottom:1px solid #E8EDF5;">
                        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8FA3C0;">&#128197; &nbsp;Date</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:13px 15px;">
                        <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#0B1D3A;">${dayName}</p>
                        <p style="margin:0;font-size:13px;color:#4A6080;">${dateStr}</p>
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- Time -->
                <td width="50%" style="padding:0 0 12px 8px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="border:1px solid #E8EDF5;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="background:#F8FAFF;padding:7px 15px;border-bottom:1px solid #E8EDF5;">
                        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8FA3C0;">&#9200; &nbsp;Time (IST)</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:13px 15px;">
                        <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#0B1D3A;">${startStr}</p>
                        <p style="margin:0;font-size:13px;color:#4A6080;">Until ${endStr}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <!-- Venue -->
                <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="border:1px solid #E8EDF5;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="background:#F8FAFF;padding:7px 15px;border-bottom:1px solid #E8EDF5;">
                        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8FA3C0;">&#128205; &nbsp;Venue</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:13px 15px;">
                        <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#0B1D3A;">${venue}</p>
                        <p style="margin:0;font-size:13px;color:#4A6080;">${venueSub}</p>
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- Repeat -->
                <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="border:1px solid #E8EDF5;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="background:#F8FAFF;padding:7px 15px;border-bottom:1px solid #E8EDF5;">
                        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8FA3C0;">&#128260; &nbsp;Repeat</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:13px 15px;">
                        <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#0B1D3A;">${freqLabel}</p>
                        <p style="margin:0;font-size:13px;color:#4A6080;">${freqSub}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Thin divider -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr><td style="height:1px;background:linear-gradient(90deg,transparent,#E8EDF5 20%,#E8EDF5 80%,transparent);"></td></tr>
            </table>

            <!-- Guest card -->
            <table width="100%" cellpadding="0" cellspacing="0"
              style="border:1px solid #E8EDF5;border-radius:12px;overflow:hidden;margin-bottom:28px;">
              <tr>
                <td style="background:#F8FAFF;padding:8px 20px;border-bottom:1px solid #E8EDF5;">
                  <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8FA3C0;">Guest Details</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 20px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <!-- Avatar circle -->
                      <td style="vertical-align:middle;">
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <td width="46" height="46"
                              style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#1D4ED8,#3B82F6);text-align:center;vertical-align:middle;">
                              <span style="font-size:16px;font-weight:700;color:#ffffff;line-height:46px;display:block;">${guestInitials}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <!-- Name + email -->
                      <td style="padding-left:14px;vertical-align:middle;">
                        <p style="margin:0 0 3px;font-size:16px;font-weight:700;color:#0B1D3A;">${guestName}</p>
                        <p style="margin:0;font-size:13px;color:#4A6080;">${guestEmail}</p>
                      </td>
                    </tr>
                  </table>

                  <!-- Tags row -->
                  <table cellpadding="0" cellspacing="0" style="margin-top:14px;">
                    <tr>
                      ${guestPhone ? `
                      <td style="padding-right:8px;">
                        <span style="display:inline-block;font-size:11px;font-weight:600;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;padding:4px 12px;border-radius:20px;">&#128241; ${guestPhone}</span>
                      </td>` : ""}
                      <td>
                        <span style="display:inline-block;font-size:11px;font-weight:600;background:${inviteBg};color:${inviteColor};border:1px solid ${inviteBorder};padding:4px 12px;border-radius:20px;">${inviteIcon} ${inviteStatus}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA button — shown only when meet link exists -->
            ${isOnline && meetLink ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td align="center">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="border-radius:10px;background:linear-gradient(135deg,#1D4ED8,#3B82F6);box-shadow:0 4px 16px rgba(59,130,246,0.35);">
                        <a href="${meetLink}"
                          style="display:inline-block;padding:14px 36px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.03em;">
                          &#127909;&nbsp; Join ${isGoogleMeet ? "Google Meet" : "Zoom"} &nbsp;&#8599;
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>` : ""}

            <!-- Footer -->
            <table width="100%" cellpadding="0" cellspacing="0"
              style="border-top:1px solid #E8EDF5;padding-top:20px;">
              <tr>
                <td>
                  <p style="margin:0 0 5px;font-size:11px;color:#A0AEC0;text-align:center;">
                    Booked via AI Voice Assistant &nbsp;&middot;&nbsp; MIS Work India Pvt Ltd
                  </p>
                  <p style="margin:0;font-size:11px;color:#CBD5E0;text-align:center;">
                    ${sentAt} IST &nbsp;&middot;&nbsp; This is an automated confirmation
                  </p>
                </td>
              </tr>
            </table>

          </td></tr>
        </table>

      </td></tr>
    </table>

    </body>
    </html>
  `;

  // ── Send ───────────────────────────────────────────────────────────
  GmailApp.sendEmail(
    guestEmail,
    `Meeting Confirmed: ${result.title}`,
    // Plain-text fallback
    `Meeting confirmed: ${result.title}\nDate: ${dayName}, ${dateStr}\nTime: ${startStr} – ${endStr} IST\nVenue: ${venue}\nMeet link: ${meetLink || "N/A"}\n\nMIS Work India Pvt Ltd`,
    {
      htmlBody: html,
      name: "MIS Work India — Calendar",
      replyTo: Session.getEffectiveUser().getEmail(),
    }
  );

  console.log("Confirmation email sent to:", guestEmail);
}








// CANCEL EMAIL TEMPLATE
function sendCancellationEmail(guestEmail, event, matchedUser, isSeries) {
  if (!guestEmail || !guestEmail.includes("@")) {
    console.warn("sendCancellationEmail: No valid email, skipping.");
    return;
  }

  // ── Derive display values ──────────────────────────────────────────
  const start = event.getStartTime();
  const end = event.getEndTime();

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = dayNames[start.getDay()];
  const dateStr = Utilities.formatDate(start, "GMT+5:30", "dd MMM yyyy");
  const startStr = Utilities.formatDate(start, "GMT+5:30", "hh:mm a");
  const endStr = Utilities.formatDate(end, "GMT+5:30", "hh:mm a");

  const title = event.getTitle();
  const guestName = (matchedUser && matchedUser[1]) || "Guest";
  const guestPhone = (matchedUser && matchedUser[2]) || "";
  const guestInitials = guestName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  const scopeLabel = isSeries ? "All Future Occurrences" : "This Occurrence";
  const scopeSub = isSeries ? "Entire series removed from calendar" : "Single event removed";

  const sentAt = Utilities.formatDate(new Date(), "GMT+5:30", "dd MMM yyyy, hh:mm a");

  // ── Build HTML ─────────────────────────────────────────────────────
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Meeting Cancelled — MIS Work India</title>
    </head>
    <body style="margin:0;padding:20px 16px;background:#ECEEF2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;">
      <tr><td>

        <!-- ═══ HEADER ═══ -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:16px 16px 0 0;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#1A0A0A 0%,#2D1515 60%,#3D1A1A 100%);padding:36px 36px 28px;">

              <!-- Logo -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#ffffff;padding:5px 15px;border-radius:25px;">
                    <img
                      src="https://www.mis.work/assets/images/logo.png"
                      alt="MIS Work India"
                      height="34"
                      style="display:block;max-height:34px;width:auto;image-rendering:crisp-edges;"
                    />
                  </td>
                </tr>
              </table>

              <!-- Status pill -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                  <td style="background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.35);border-radius:20px;padding:5px 14px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:7px;height:7px;background:#F87171;border-radius:50%;"></td>
                        <td style="padding-left:7px;font-size:11px;font-weight:700;color:#F87171;letter-spacing:0.09em;">CANCELLED</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;line-height:1.2;">Your meeting has been cancelled</p>
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);">This event has been removed from your calendar</p>

            </td>
          </tr>
        </table>

        <!-- Red accent stripe -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="height:3px;background:linear-gradient(90deg,#991B1B,#EF4444,#FCA5A5,#EF4444,#991B1B);"></td>
          </tr>
        </table>

        <!-- ═══ BODY ═══ -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:0 0 16px 16px;">
          <tr><td style="padding:32px 36px;">

            <!-- Cancelled event title block -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#FFF5F5;border-left:3px solid #EF4444;border-radius:0 10px 10px 0;padding:16px 20px;">
                  <p style="margin:0 0 5px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#EF4444;">Cancelled Event</p>
                  <p style="margin:0;font-size:20px;font-weight:700;color:#7F1D1D;letter-spacing:-0.01em;text-decoration:line-through;text-decoration-color:#EF4444;">${title}</p>
                </td>
              </tr>
            </table>

            <!-- 2×2 info grid -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <!-- Date -->
                <td width="50%" style="padding:0 8px 12px 0;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #FEE2E2;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="background:#FFF5F5;padding:7px 15px;border-bottom:1px solid #FEE2E2;">
                        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#F87171;">&#128197; &nbsp;Date</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:13px 15px;">
                        <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#7F1D1D;">${dayName}</p>
                        <p style="margin:0;font-size:13px;color:#9F4C4C;">${dateStr}</p>
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- Time -->
                <td width="50%" style="padding:0 0 12px 8px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #FEE2E2;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="background:#FFF5F5;padding:7px 15px;border-bottom:1px solid #FEE2E2;">
                        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#F87171;">&#9200; &nbsp;Time (IST)</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:13px 15px;">
                        <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#7F1D1D;">${startStr}</p>
                        <p style="margin:0;font-size:13px;color:#9F4C4C;">Until ${endStr}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <!-- Cancelled by -->
                <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #FEE2E2;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="background:#FFF5F5;padding:7px 15px;border-bottom:1px solid #FEE2E2;">
                        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#F87171;">&#128683; &nbsp;Action</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:13px 15px;">
                        <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#7F1D1D;">Cancelled</p>
                        <p style="margin:0;font-size:13px;color:#9F4C4C;">Via AI Voice Assistant</p>
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- Scope -->
                <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #FEE2E2;border-radius:10px;overflow:hidden;">
                    <tr>
                      <td style="background:#FFF5F5;padding:7px 15px;border-bottom:1px solid #FEE2E2;">
                        <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#F87171;">&#128260; &nbsp;Scope</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:13px 15px;">
                        <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#7F1D1D;">${scopeLabel}</p>
                        <p style="margin:0;font-size:13px;color:#9F4C4C;">${scopeSub}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Thin divider -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr><td style="height:1px;background:linear-gradient(90deg,transparent,#FEE2E2 20%,#FEE2E2 80%,transparent);"></td></tr>
            </table>

            <!-- Guest card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #FEE2E2;border-radius:12px;overflow:hidden;margin-bottom:28px;">
              <tr>
                <td style="background:#FFF5F5;padding:8px 20px;border-bottom:1px solid #FEE2E2;">
                  <p style="margin:0;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#F87171;">Guest Details</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 20px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:middle;">
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <td width="46" height="46"
                              style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#991B1B,#EF4444);text-align:center;vertical-align:middle;">
                              <span style="font-size:16px;font-weight:700;color:#ffffff;line-height:46px;display:block;">${guestInitials}</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td style="padding-left:14px;vertical-align:middle;">
                        <p style="margin:0 0 3px;font-size:16px;font-weight:700;color:#7F1D1D;">${guestName}</p>
                        <p style="margin:0;font-size:13px;color:#9F4C4C;">${guestEmail}</p>
                      </td>
                    </tr>
                  </table>
                  <table cellpadding="0" cellspacing="0" style="margin-top:14px;">
                    <tr>
                      ${guestPhone ? `
                      <td style="padding-right:8px;">
                        <span style="display:inline-block;font-size:11px;font-weight:600;background:#FFF5F5;color:#991B1B;border:1px solid #FECACA;padding:4px 12px;border-radius:20px;">&#128241; ${guestPhone}</span>
                      </td>` : ""}
                      <td>
                        <span style="display:inline-block;font-size:11px;font-weight:600;background:#FFF5F5;color:#991B1B;border:1px solid #FECACA;padding:4px 12px;border-radius:20px;">&#10005; Invite Cancelled</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Notice banner -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:18px;vertical-align:top;padding-right:10px;">&#9888;&#65039;</td>
                      <td>
                        <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#92400E;">Please update your schedule</p>
                        <p style="margin:0;font-size:12px;color:#B45309;">This meeting has been removed. If you believe this was a mistake, please contact us to rebook.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Footer -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #FEE2E2;padding-top:20px;">
              <tr>
                <td>
                  <p style="margin:0 0 5px;font-size:11px;color:#A0AEC0;text-align:center;">
                    Cancelled via AI Voice Assistant &nbsp;&middot;&nbsp; MIS Work India Pvt Ltd
                  </p>
                  <p style="margin:0;font-size:11px;color:#CBD5E0;text-align:center;">
                    ${sentAt} IST &nbsp;&middot;&nbsp; This is an automated notification
                  </p>
                </td>
              </tr>
            </table>

          </td></tr>
        </table>

      </td></tr>
    </table>

    </body>
    </html>
  `;

  // ── Send ───────────────────────────────────────────────────────────
  GmailApp.sendEmail(
    guestEmail,
    `Meeting Cancelled: ${title}`,
    `Meeting cancelled: ${title}\nDate: ${dayName}, ${dateStr}\nTime: ${startStr} – ${endStr} IST\n\nMIS Work India Pvt Ltd`,
    {
      htmlBody: html,
      name: "MIS Work India — Calendar",
      replyTo: Session.getEffectiveUser().getEmail(),
    }
  );

  console.log("Cancellation email sent to:", guestEmail);
}