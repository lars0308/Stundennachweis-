import nodemailer from "nodemailer";
import { GMX_SMTP_HOST, GMX_SMTP_PORT } from "../constants.js";
import type { GmxCredentials } from "./imap-client.js";

export interface SendEmailInput {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  in_reply_to?: string;
  references?: string;
}

export async function sendEmail(creds: GmxCredentials, input: SendEmailInput): Promise<{ messageId: string }> {
  const transporter = nodemailer.createTransport({
    host: GMX_SMTP_HOST,
    port: GMX_SMTP_PORT,
    secure: false, // STARTTLS auf Port 587
    requireTLS: true,
    auth: { user: creds.user, pass: creds.pass },
  });
  try {
    const info = await transporter.sendMail({
      from: creds.user,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.text,
      inReplyTo: input.in_reply_to,
      references: input.references,
    });
    return { messageId: info.messageId };
  } finally {
    transporter.close();
  }
}
