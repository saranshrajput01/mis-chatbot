const fs = require("fs");
const path = require("path");
const { logMessage } = require("./utils");

const WA_API_KEY = process.env.WA_ACCESS_TOKEN;
const WA_PHONE_ID = process.env.WA_PHONE_ID;
const BASE_URL = "https://wa.apimis.in/api/v1";

function formatPhone(to) {
  let phone = String(to).replace(/[^0-9]/g, "");
  if (phone.startsWith("91") && phone.length === 12) return phone;
  if (phone.length === 10) return "91" + phone;
  return phone;
}

const headers = () => ({
  "Content-Type": "application/json",
  "x-api-key": WA_API_KEY,
  "x-phone-id": WA_PHONE_ID
});

async function sendWhatsAppReply(supabase, to, message) {
  const phone = formatPhone(to);
  try {
    console.log("📤 SENDING TO:", phone, "| MSG:", String(message).slice(0, 80));
    logMessage(supabase, "whatsapp", "outgoing", String(message).slice(0, 1500), { phone });
    supabase.from("chat_history").insert({ session_id: phone, role: "assistant", content: String(message).slice(0, 1500) }).then();
    const res = await fetch(`${BASE_URL}/whatsapp/sendMessage`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ to: phone, text: String(message).slice(0, 4096) })
    });
    const data = await res.json();
    if (data.success === false || data.error) console.error("❌ SEND FAILED:", JSON.stringify(data));
    else console.log("✅ SENT OK:", JSON.stringify(data).slice(0, 150));
  } catch(e) { console.error("❌ SEND ERROR:", e.message); }
}

async function sendWhatsAppMedia(supabase, to, filePath, caption, mediaType = "document") {
  const phone = formatPhone(to);
  try {
    // Detect MIME from file extension (prevents .csv being uploaded as application/pdf etc.)
    const ext = path.extname(filePath).toLowerCase();
    const MIME = {
      ".pdf":  "application/pdf",
      ".csv":  "text/csv",
      ".txt":  "text/plain",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xls":  "application/vnd.ms-excel",
      ".png":  "image/png",
      ".jpg":  "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif":  "image/gif",
      ".webp": "image/webp",
    };
    const mime = MIME[ext] || (mediaType === "image" ? "image/png" : "application/pdf");

    // Upload media first
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([fs.readFileSync(filePath)], { type: mime }), path.basename(filePath));
    const uploadRes = await fetch(`${BASE_URL}/whatsapp/meta/media/upload`, {
      method: "POST",
      headers: { "x-api-key": WA_API_KEY, "x-phone-id": WA_PHONE_ID },
      body: form
    });
    const uploadData = await uploadRes.json();
    const mediaId = uploadData.metaMediaId || uploadData.id;

    if (!mediaId) {
      console.error("[WA MEDIA UPLOAD FAILED]", JSON.stringify(uploadData));
      await sendWhatsAppReply(supabase, phone, caption + "\n\n⚠️ Could not send file.");
      return;
    }

    // Send media message via /meta/sendMessage (supports image/document with mediaId)
    const type = mediaType === "image" ? "image" : "document";
    const mediaObj = type === "document"
      ? { id: mediaId, caption: String(caption).slice(0, 1024), filename: path.basename(filePath) }
      : { id: mediaId, caption: String(caption).slice(0, 1024) };
    const payload = { to: phone, message: { type, [type]: mediaObj } };
    const res = await fetch(`${BASE_URL}/whatsapp/meta/sendMessage`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log("[WA MEDIA SENT]", type, mime, "to", phone, JSON.stringify(data));
  } catch(e) {
    console.error("[WA MEDIA ERROR]", e.message);
    await sendWhatsAppReply(supabase, phone, caption + "\n\n⚠️ Could not send file.");
  } finally {
    try { fs.unlinkSync(filePath); } catch(e) {}
  }
}

// Download media using Meta media ID (for incoming audio/images)
async function downloadMetaMedia(mediaId) {
  const res = await fetch(`${BASE_URL}/whatsapp/media/mediaDetail/${mediaId}`, {
    headers: { "x-api-key": WA_API_KEY, "x-phone-id": WA_PHONE_ID }
  });
  const data = await res.json();
  const url = data.mediaDetail?.url || data.url;
  if (!url) throw new Error("No media URL for id: " + mediaId);
  const mediaRes = await fetch(url, { headers: { "Authorization": "Bearer " + WA_API_KEY } });
  return Buffer.from(await mediaRes.arrayBuffer());
}

module.exports = { sendWhatsAppMedia, sendWhatsAppReply, downloadMetaMedia, formatPhone };
