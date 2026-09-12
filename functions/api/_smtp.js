// A very small SMTP client for Cloudflare's runtime. Zoho is reached over
// implicit TLS on 465, so the socket is encrypted from the first byte and the
// conversation is a handful of line commands.
import { connect } from "cloudflare:sockets";

const enc = new TextEncoder();
const dec = new TextDecoder();

// An SMTP reply can span several lines. It is finished when a line starts with
// the three digit code followed by a space rather than a hyphen.
function completeAt(buf) {
  let i = 0;
  for (;;) {
    const nl = buf.indexOf("\r\n", i);
    if (nl < 0) return 0;
    if (/^\d{3} /.test(buf.slice(i, nl))) return nl + 2;
    i = nl + 2;
  }
}

// Anything a stranger typed must never reach a header raw, or they can inject
// their own headers by including a line break.
function header(v) {
  return String(v == null ? "" : v).replace(/[\r\n]+/g, " ").trim().slice(0, 400);
}

export async function sendMail({ host, port, user, pass, from, to, replyTo, subject, text }) {
  const socket = connect({ hostname: host, port }, { secureTransport: "on" });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  let buf = "";

  async function read() {
    for (;;) {
      const end = completeAt(buf);
      if (end) { const r = buf.slice(0, end); buf = buf.slice(end); return r; }
      const { value, done } = await reader.read();
      if (done) throw new Error("server closed the connection");
      buf += dec.decode(value, { stream: true });
    }
  }
  async function say(line, expect) {
    if (line !== null) await writer.write(enc.encode(line + "\r\n"));
    const reply = await read();
    const code = parseInt(reply.slice(0, 3), 10);
    if (expect && !expect.includes(code)) {
      throw new Error("SMTP " + code + " " + reply.trim().slice(0, 160));
    }
    return reply;
  }
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

  try {
    await say(null, [220]);
    await say("EHLO relynked.com", [250]);
    await say("AUTH LOGIN", [334]);
    await say(b64(user), [334]);
    await say(b64(pass), [235]);
    await say("MAIL FROM:<" + user + ">", [250]);
    await say("RCPT TO:<" + to + ">", [250, 251]);
    await say("DATA", [354]);

    const body = String(text).replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const msg = [
      "From: " + header(from) + " <" + user + ">",
      "To: <" + to + ">",
      replyTo ? "Reply-To: " + header(replyTo) : null,
      "Subject: " + header(subject),
      "Date: " + new Date().toUTCString(),
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
      "",
      ".",
    ].filter(Boolean).join("\r\n");

    await writer.write(enc.encode(msg + "\r\n"));
    await say(null, [250]);
    try { await say("QUIT", [221]); } catch (e) { /* the close itself does not matter */ }
    return true;
  } finally {
    try { await writer.close(); } catch (e) {}
    try { await socket.close(); } catch (e) {}
  }
}

// A short human-readable handle so an applicant can quote it back to us.
export function reference(prefix) {
  const t = Date.now().toString(36).toUpperCase().slice(-4);
  const r = Math.random().toString(36).toUpperCase().slice(2, 5);
  return prefix + "-" + t + r;
}

export function clip(v, n) {
  return String(v == null ? "" : v).slice(0, n);
}

export const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
