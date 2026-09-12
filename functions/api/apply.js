import { sendMail, reference, clip, json } from "./_smtp.js";

const MAIL_HOST = "smtppro.zoho.com";
const MAIL_PORT = 465;

export async function onRequestPost({ request, env }) {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    return json({ ok: false, error: "mail not configured" }, 503);
  }

  let d;
  try { d = await request.json(); } catch (e) { return json({ ok: false, error: "bad request" }, 400); }

  const name = clip(d.name, 120).trim();
  const email = clip(d.email, 200).trim();
  const story = clip(d.story, 6000).trim();
  const critique = clip(d.critique, 4000).trim();

  if (name.length < 2) return json({ ok: false, error: "name" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "email" }, 400);
  if (story.length < 120) return json({ ok: false, error: "story" }, 400);

  const areas = Array.isArray(d.areas) ? d.areas.slice(0, 10).map((a) => clip(a, 60)) : [];
  const ref = reference("RA");

  const text = [
    "Application from the careers page",
    "Reference " + ref,
    "",
    "Name      " + name,
    "Email     " + email,
    "Phone     " + (clip(d.phone, 40).trim() || "Not given"),
    "Area      " + (areas.join(", ") || "Not sure yet"),
    "Made      " + (clip(d.link, 400).trim() || "Nothing linked"),
    "",
    "--- Something they made unasked ---",
    story,
    "",
    "--- What they think we get wrong ---",
    critique || "Not given",
    "",
    "Sent " + new Date().toISOString(),
  ].join("\n");

  try {
    await sendMail({
      host: MAIL_HOST, port: MAIL_PORT,
      user: env.SMTP_USER, pass: env.SMTP_PASS,
      from: "Relynked careers", to: env.CAREERS_TO || "careers@relynked.com",
      replyTo: name + " <" + email + ">",
      subject: "Application: " + name + " [" + ref + "]",
      text,
    });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 502);
  }

  return json({ ok: true, ref });
}

export const onRequestGet = () => json({ ok: false, error: "post only" }, 405);
