import { ImapFlow, type ListResponse } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { GMX_IMAP_HOST, GMX_IMAP_PORT } from "../constants.js";

export interface GmxCredentials {
  user: string;
  pass: string;
}

/**
 * Öffnet eine IMAP-Verbindung, führt fn aus und schließt die Verbindung danach
 * garantiert wieder — jeder Tool-Aufruf bekommt eine frische, kurzlebige Verbindung
 * statt eine Verbindung dauerhaft offen zu halten (robuster für einzelne Anfragen).
 */
export async function withImap<T>(
  creds: GmxCredentials,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = new ImapFlow({
    host: GMX_IMAP_HOST,
    port: GMX_IMAP_PORT,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export async function listFolders(creds: GmxCredentials): Promise<ListResponse[]> {
  return withImap(creds, async (client) => {
    return client.list();
  });
}

export interface EmailSummary {
  uid: number;
  subject: string;
  from: string;
  date: string | null;
  seen: boolean;
  has_attachments: boolean;
  preview: string;
}

export interface SearchOptions {
  folder: string;
  limit: number;
  unread_only?: boolean;
  from_contains?: string;
  subject_contains?: string;
  since_days?: number;
}

export async function searchEmails(creds: GmxCredentials, opts: SearchOptions): Promise<EmailSummary[]> {
  return withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(opts.folder);
    try {
      const criteria: Record<string, unknown> = {};
      if (opts.unread_only) criteria.seen = false;
      if (opts.from_contains) criteria.from = opts.from_contains;
      if (opts.subject_contains) criteria.subject = opts.subject_contains;
      if (opts.since_days) {
        const since = new Date();
        since.setDate(since.getDate() - opts.since_days);
        criteria.since = since;
      }
      const hasCriteria = Object.keys(criteria).length > 0;
      const uids = hasCriteria
        ? await client.search(criteria, { uid: true })
        : await client.search({ all: true }, { uid: true });

      if (!uids || !uids.length) return [];

      // Neueste zuerst, auf 'limit' begrenzen
      const selected = uids.slice(-opts.limit).reverse();

      const results: EmailSummary[] = [];
      for await (const msg of client.fetch(
        selected,
        { envelope: true, flags: true, bodyStructure: true, uid: true },
        { uid: true }
      )) {
        const from = msg.envelope?.from?.[0];
        const fromStr = from ? `${from.name ? from.name + " " : ""}<${from.address}>` : "unbekannt";
        results.push({
          uid: msg.uid,
          subject: msg.envelope?.subject || "(ohne Betreff)",
          from: fromStr,
          date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
          seen: msg.flags?.has("\\Seen") ?? false,
          has_attachments: bodyStructureHasAttachment(msg.bodyStructure),
          preview: "",
        });
      }
      // fetch() liefert nicht garantiert in derselben Reihenfolge wie 'selected' -> nach Datum sortieren
      results.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return results;
    } finally {
      lock.release();
    }
  });
}

function bodyStructureHasAttachment(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { disposition?: string; childNodes?: unknown[] };
  if (n.disposition && n.disposition.toLowerCase() === "attachment") return true;
  if (Array.isArray(n.childNodes)) return n.childNodes.some(bodyStructureHasAttachment);
  return false;
}

export interface FullEmail {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  message_id: string | null;
  text: string;
  attachments: { filename: string; size: number }[];
}

export async function getEmail(creds: GmxCredentials, folder: string, uid: number): Promise<FullEmail | null> {
  return withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const raw = await client.download(String(uid), undefined, { uid: true });
      if (!raw) return null;
      const parsed: ParsedMail = await simpleParser(raw.content);
      return {
        uid,
        subject: parsed.subject || "(ohne Betreff)",
        from: parsed.from?.text || "unbekannt",
        to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to.text) : "",
        date: parsed.date ? parsed.date.toISOString() : null,
        message_id: parsed.messageId || null,
        text: (parsed.text || parsed.html || "").toString(),
        attachments: (parsed.attachments || []).map((a) => ({ filename: a.filename || "unbenannt", size: a.size })),
      };
    } finally {
      lock.release();
    }
  });
}

export async function markAsRead(creds: GmxCredentials, folder: string, uid: number): Promise<void> {
  return withImap(creds, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  });
}
