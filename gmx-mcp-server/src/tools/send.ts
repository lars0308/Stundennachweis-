import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sendEmail } from "../services/smtp-client.js";
import { getEmail, type GmxCredentials } from "../services/imap-client.js";
import { handleMailError } from "../services/errors.js";

const SendEmailSchema = z
  .object({
    to: z.string().email().describe("Empfänger-E-Mail-Adresse"),
    cc: z.string().optional().describe("Kopie an (E-Mail-Adresse, optional)"),
    bcc: z.string().optional().describe("Blindkopie an (E-Mail-Adresse, optional)"),
    subject: z.string().min(1).describe("Betreff der E-Mail"),
    text: z.string().min(1).describe("Text der E-Mail (Klartext)"),
  })
  .strict();

const ReplyEmailSchema = z
  .object({
    folder: z.string().default("INBOX").describe("Ordner, in dem die Original-E-Mail liegt (Standard: 'INBOX')"),
    uid: z.number().int().positive().describe("UID der E-Mail, auf die geantwortet wird (aus gmx_search_emails)"),
    text: z.string().min(1).describe("Antworttext (Klartext)"),
    reply_all: z.boolean().default(false).describe("Auch an ursprüngliche CC-Empfänger antworten (Standard: nur an den Absender)"),
  })
  .strict();

function getCreds(): GmxCredentials {
  const user = process.env.GMX_EMAIL;
  const pass = process.env.GMX_PASSWORD;
  if (!user || !pass) throw new Error("GMX_EMAIL/GMX_PASSWORD nicht gesetzt");
  return { user, pass };
}

export function registerSendTools(server: McpServer): void {
  server.registerTool(
    "gmx_send_email",
    {
      title: "GMX-E-Mail senden",
      description: `Verschickt eine neue E-Mail über das GMX-Konto. Wird SOFORT versendet, es gibt keinen
Entwurfs-/Bestätigungsschritt in diesem Tool — der Inhalt sollte vorher im Chat mit
der Nutzerin/dem Nutzer abgestimmt sein, bevor dieses Tool aufgerufen wird.

Args:
  - to (string): Empfänger-Adresse
  - cc, bcc (string, optional): Kopie / Blindkopie
  - subject (string): Betreff
  - text (string): Text der E-Mail (Klartext, kein HTML)

Returns: Bestätigung mit message_id nach erfolgreichem Versand.

Error Handling:
  - "Error: Anmeldung ... fehlgeschlagen" bei falschen Zugangsdaten oder wenn IMAP/SMTP-Zugriff in GMX nicht aktiviert ist.`,
      inputSchema: SendEmailSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const result = await sendEmail(getCreds(), params);
        return {
          content: [{ type: "text", text: `E-Mail an ${params.to} gesendet (Betreff: "${params.subject}").` }],
          structuredContent: { sent: true, message_id: result.messageId, to: params.to },
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleMailError(error) }] };
      }
    }
  );

  server.registerTool(
    "gmx_reply_email",
    {
      title: "Auf GMX-E-Mail antworten",
      description: `Antwortet auf eine bestehende E-Mail (per uid aus gmx_search_emails) — mit korrektem
Betreff ("Re: ...") und E-Mail-Threading (In-Reply-To/References), damit die Antwort
im selben Gesprächsverlauf erscheint. Wird SOFORT versendet, es gibt keinen
Entwurfs-/Bestätigungsschritt in diesem Tool — der Inhalt sollte vorher im Chat
abgestimmt sein.

Args:
  - folder (string): Ordner der Original-E-Mail (Standard: 'INBOX')
  - uid (number): UID der Original-E-Mail
  - text (string): Antworttext (Klartext)
  - reply_all (boolean): Auch an ursprüngliche CC-Empfänger (Standard: false, nur an Absender)

Returns: Bestätigung mit message_id nach erfolgreichem Versand.

Error Handling:
  - "Error: ..." wenn die uid nicht gefunden wird — mit gmx_search_emails erneut prüfen.`,
      inputSchema: ReplyEmailSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ folder, uid, text, reply_all }) => {
      try {
        const creds = getCreds();
        const original = await getEmail(creds, folder, uid);
        if (!original) return { content: [{ type: "text", text: `E-Mail mit uid ${uid} in '${folder}' nicht gefunden.` }] };

        const replyToAddress = extractAddress(original.from);
        if (!replyToAddress) return { content: [{ type: "text", text: "Error: Konnte keine Absenderadresse aus der Original-E-Mail lesen." }] };

        const subject = original.subject.toLowerCase().startsWith("re:") ? original.subject : `Re: ${original.subject}`;
        const result = await sendEmail(creds, {
          to: replyToAddress,
          cc: reply_all ? original.to : undefined,
          subject,
          text,
          in_reply_to: original.message_id ?? undefined,
          references: original.message_id ?? undefined,
        });
        return {
          content: [{ type: "text", text: `Antwort an ${replyToAddress} gesendet (Betreff: "${subject}").` }],
          structuredContent: { sent: true, message_id: result.messageId, to: replyToAddress },
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleMailError(error) }] };
      }
    }
  );
}

function extractAddress(fromField: string): string | null {
  const match = fromField.match(/<([^>]+)>/);
  if (match) return match[1];
  const bare = fromField.trim();
  return bare.includes("@") ? bare : null;
}
