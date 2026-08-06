import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listFolders, searchEmails, getEmail, markAsRead, type GmxCredentials } from "../services/imap-client.js";
import { handleMailError } from "../services/errors.js";
import { CHARACTER_LIMIT, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT, BODY_PREVIEW_LIMIT } from "../constants.js";

const SearchEmailsSchema = z
  .object({
    folder: z.string().default("INBOX").describe("Ordnername, z.B. 'INBOX', 'Sent', 'Drafts' (Standard: 'INBOX'; mit gmx_list_folders die genauen Namen prüfen)"),
    unread_only: z.boolean().default(false).describe("Nur ungelesene E-Mails anzeigen"),
    from_contains: z.string().optional().describe("Nur E-Mails von Absendern, deren Adresse/Name diesen Text enthält"),
    subject_contains: z.string().optional().describe("Nur E-Mails, deren Betreff diesen Text enthält"),
    since_days: z.number().int().positive().optional().describe("Nur E-Mails der letzten N Tage"),
    limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).default(DEFAULT_SEARCH_LIMIT).describe(`Maximale Anzahl Ergebnisse (Standard: ${DEFAULT_SEARCH_LIMIT})`),
  })
  .strict();

const GetEmailSchema = z
  .object({
    folder: z.string().default("INBOX").describe("Ordnername, in dem die E-Mail liegt (Standard: 'INBOX')"),
    uid: z.number().int().positive().describe("UID der E-Mail (aus gmx_search_emails)"),
    mark_as_read: z.boolean().default(false).describe("E-Mail beim Abrufen zusätzlich als gelesen markieren"),
  })
  .strict();

function getCreds(): GmxCredentials {
  const user = process.env.GMX_EMAIL;
  const pass = process.env.GMX_PASSWORD;
  if (!user || !pass) throw new Error("GMX_EMAIL/GMX_PASSWORD nicht gesetzt");
  return { user, pass };
}

export function registerReadTools(server: McpServer): void {
  server.registerTool(
    "gmx_list_folders",
    {
      title: "GMX-Postfach-Ordner auflisten",
      description: `Listet alle Ordner im GMX-Postfach auf (INBOX, Gesendet, Entwürfe, Papierkorb, eigene Ordner ...).

Args: keine

Returns: Liste der Ordnernamen, genau so wie sie für 'folder' in gmx_search_emails/gmx_get_email verwendet werden müssen.`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const folders = await listFolders(getCreds());
        const names = folders.map((f) => f.path);
        return {
          content: [{ type: "text", text: `# GMX-Ordner\n\n${names.map((n) => `- ${n}`).join("\n")}` }],
          structuredContent: { folders: names },
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleMailError(error) }] };
      }
    }
  );

  server.registerTool(
    "gmx_search_emails",
    {
      title: "GMX-E-Mails durchsuchen",
      description: `Durchsucht einen Ordner im GMX-Postfach und listet passende E-Mails auf (neueste zuerst).

Args:
  - folder (string): Ordnername (Standard: 'INBOX')
  - unread_only (boolean): Nur ungelesene (Standard: false)
  - from_contains (string, optional): Filter auf Absender
  - subject_contains (string, optional): Filter auf Betreff
  - since_days (number, optional): Nur E-Mails der letzten N Tage
  - limit (number): Maximale Anzahl, 1-${MAX_SEARCH_LIMIT} (Standard: ${DEFAULT_SEARCH_LIMIT})

Returns: Liste mit uid, Betreff, Absender, Datum, gelesen/ungelesen, ob Anhänge vorhanden sind.
Die uid brauchst du für gmx_get_email, um den vollen Inhalt zu lesen.

Error Handling:
  - Gibt eine leere Liste zurück, wenn nichts gefunden wurde (kein Fehler).`,
      inputSchema: SearchEmailsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const emails = await searchEmails(getCreds(), params);
        if (!emails.length) {
          return { content: [{ type: "text", text: `Keine E-Mails gefunden in '${params.folder}' mit diesen Filtern.` }] };
        }
        const output = { count: emails.length, folder: params.folder, emails };
        const lines = [`# GMX: ${emails.length} E-Mail(s) in '${params.folder}'`, ""];
        for (const e of emails) {
          lines.push(`- ${e.seen ? "" : "**[ungelesen]** "}uid ${e.uid} — "${e.subject}" von ${e.from} (${e.date ?? "kein Datum"})${e.has_attachments ? " 📎" : ""}`);
        }
        let text = lines.join("\n");
        if (text.length > CHARACTER_LIMIT) text = text.slice(0, CHARACTER_LIMIT) + "\n\n[Gekürzt — 'limit' reduzieren oder Filter enger fassen]";
        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (error) {
        return { content: [{ type: "text", text: handleMailError(error) }] };
      }
    }
  );

  server.registerTool(
    "gmx_get_email",
    {
      title: "GMX-E-Mail vollständig abrufen",
      description: `Ruft den vollständigen Inhalt einer E-Mail ab (Text, Absender/Empfänger, Anhang-Liste).

Args:
  - folder (string): Ordnername, in dem die E-Mail liegt (Standard: 'INBOX')
  - uid (number): UID der E-Mail (aus gmx_search_emails)
  - mark_as_read (boolean): Zusätzlich als gelesen markieren (Standard: false)

Returns: Vollständiger E-Mail-Text (bei sehr langen E-Mails gekürzt), message_id (nötig für gmx_reply_email), Anhang-Namen.

Error Handling:
  - "Error: ..." wenn die uid im angegebenen Ordner nicht existiert — mit gmx_search_emails die uid neu prüfen.`,
      inputSchema: GetEmailSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ folder, uid, mark_as_read }) => {
      try {
        const creds = getCreds();
        const email = await getEmail(creds, folder, uid);
        if (!email) return { content: [{ type: "text", text: `E-Mail mit uid ${uid} in '${folder}' nicht gefunden.` }] };
        if (mark_as_read) await markAsRead(creds, folder, uid).catch(() => {});

        let bodyText = email.text;
        let truncated = false;
        if (bodyText.length > BODY_PREVIEW_LIMIT) {
          bodyText = bodyText.slice(0, BODY_PREVIEW_LIMIT);
          truncated = true;
        }
        const output = { ...email, text: bodyText, truncated };
        const lines = [
          `# ${email.subject}`,
          `Von: ${email.from}`,
          `An: ${email.to}`,
          `Datum: ${email.date ?? "?"}`,
          email.attachments.length ? `Anhänge: ${email.attachments.map((a) => a.filename).join(", ")}` : "Keine Anhänge",
          "",
          bodyText,
          truncated ? "\n[Text gekürzt]" : "",
        ];
        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: output };
      } catch (error) {
        return { content: [{ type: "text", text: handleMailError(error) }] };
      }
    }
  );
}
