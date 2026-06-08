import { NextResponse } from "next/server";
import { getResend, CONTACT_FROM, CONTACT_TO } from "@/lib/resend";

type ContactBody = {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
  // Honeypot field — should always be empty for real users.
  company?: unknown;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email is not configured yet. Please try again later." },
      { status: 503 }
    );
  }

  let body: ContactBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Bot trap: if the hidden field is filled, silently accept and drop.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const subject =
    typeof body.subject === "string" && body.subject.trim()
      ? body.subject.trim()
      : "New contact form message";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || name.length > 200) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }
  if (!message || message.length < 5) {
    return NextResponse.json(
      { error: "Please enter a message." },
      { status: 400 }
    );
  }
  if (message.length > 5000) {
    return NextResponse.json(
      { error: "Message is too long (5000 characters max)." },
      { status: 400 }
    );
  }

  try {
    const { error } = await getResend().emails.send({
      from: CONTACT_FROM,
      to: CONTACT_TO,
      replyTo: email,
      subject: `[VA Corp] ${subject}`,
      text: `From: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
      html: `
        <div style="font-family:system-ui,sans-serif;line-height:1.6">
          <h2 style="margin:0 0 12px">New message via vacorp.org</h2>
          <p><strong>Name:</strong> ${escapeHtml(name)}<br/>
          <strong>Email:</strong> ${escapeHtml(email)}<br/>
          <strong>Subject:</strong> ${escapeHtml(subject)}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
          <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
        </div>
      `,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to send message." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const messageText =
      err instanceof Error ? err.message : "Failed to send message.";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
