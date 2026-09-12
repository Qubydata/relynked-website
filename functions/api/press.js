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
  const outlet = clip(d.outlet, 160).trim();
  const email = clip(d.email, 200).trim();
  const deadline = clip(d.deadline, 60).trim();
  const need = clip(d.need, 120).trim();
  const detail = clip(d.detail, 4000).trim();

  if (name.length < 2) return json({ ok: false, error: "name" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "email" }, 400);
  if (!outlet) return json({ ok: false, error: "outlet" }, 400);

  const ref = reference("RP");
  const urgent = /today|48/i.test(deadline);

  const text = [
    "Press enquiry from the press page",
    "Reference " + ref,
    "",
    "Name      " + name,
    "Outlet    " + outlet,
    "Email     " + email,
    "Deadline  " + (deadline || "Not given"),
    "Needs     " + (need || "Not given"),
    "",
    "--- About the piece ---",
    detail || "Not given",
    "",
    "Sent " + new Date().toISOString(),
  ].join("\n");

  try {
    await sendMail({
      host: MAIL_HOST, port: MAIL_PORT,
      user: env.SMTP_USER, pass: env.SMTP_PASS,
      from: "Relynked press", to: env.PRESS_TO || "press@relynked.com",
      replyTo: name + " <" + email + ">",
      subject: (urgent ? "[DEADLINE] " : "") + "Press: " + outlet + " [" + ref + "]",
      text,
    });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 502);
  }

  return json({ ok: true, ref });
}

export const onRequestGet = () => json({ ok: false, error: "post only" }, 405);
