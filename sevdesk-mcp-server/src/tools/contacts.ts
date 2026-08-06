import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SevdeskClient, handleSevdeskError, unwrapObjects, unwrapObject } from "../services/sevdesk-client.js";
import type { SevdeskContact } from "../types.js";

const SearchContactsSchema = z
  .object({
    name: z.string().min(1).max(200).describe("Name (oder Teil davon) des Kunden/Kontakts, nach dem gesucht wird"),
  })
  .strict();

const CreateContactSchema = z
  .object({
    name: z.string().min(1).max(200).describe("Vollständiger Name des Kunden/Unternehmens"),
  })
  .strict();

export function registerContactTools(server: McpServer, client: SevdeskClient): void {
  server.registerTool(
    "sevdesk_search_contacts",
    {
      title: "sevDesk-Kontakte suchen",
      description: `Sucht Kunden/Kontakte in sevDesk nach (Teil-)Namen.

Nutze dieses Tool, um die sevDesk-interne ID eines Kunden zu finden, bevor du ein Angebot oder eine Rechnung für ihn anlegst (sevdesk_create_order_draft / sevdesk_create_invoice_draft brauchen diese ID).

Args:
  - name (string): Name oder Teil des Namens, z.B. "Meier" oder "Müller GmbH"

Returns: Liste gefundener Kontakte mit id, name und Kategorie.

Error Handling:
  - Gibt eine leere Liste zurück, wenn kein Kontakt gefunden wurde (kein Fehler).`,
      inputSchema: SearchContactsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ name }) => {
      try {
        const data = await client.get(`/Contact`, { name });
        const contacts = unwrapObjects<SevdeskContact>(data);
        if (!contacts.length) {
          return { content: [{ type: "text", text: `Keine Kontakte gefunden für "${name}".` }] };
        }
        const output = {
          count: contacts.length,
          contacts: contacts.map((c) => ({ id: c.id, name: c.name, category_id: c.category?.id })),
        };
        const lines = [`# sevDesk-Kontakte für "${name}"`, ""];
        for (const c of output.contacts) lines.push(`- **${c.name}** (id: ${c.id})`);
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleSevdeskError(error) }] };
      }
    }
  );

  server.registerTool(
    "sevdesk_create_contact",
    {
      title: "sevDesk-Kontakt anlegen",
      description: `Legt einen neuen Kunden-Kontakt in sevDesk an (Kategorie "Kunde").

Prüft vorher automatisch, ob bereits ein Kontakt mit exakt diesem Namen existiert, um Duplikate zu vermeiden — legt in dem Fall nichts Neues an und meldet das.

Args:
  - name (string): Vollständiger Name des Kunden/Unternehmens

Returns: Die neu angelegte (oder bereits vorhandene) Kontakt-ID.

Error Handling:
  - Bricht ohne Anlage ab, wenn bereits ein Kontakt mit exakt diesem Namen existiert.`,
      inputSchema: CreateContactSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ name }) => {
      try {
        const existingRaw = await client.get(`/Contact`, { name });
        const existing = unwrapObjects<SevdeskContact>(existingRaw);
        const exact = existing.find((c) => (c.name || "").trim().toLowerCase() === name.trim().toLowerCase());
        if (exact) {
          return {
            content: [{ type: "text", text: `Kontakt "${name}" existiert bereits (id: ${exact.id}) — nichts Neues angelegt.` }],
            structuredContent: { created: false, id: exact.id, name: exact.name },
          };
        }
        const res = await client.post(`/Contact`, {
          name,
          category: { id: 3, objectName: "Category" }, // 3 = Kunde in sevDesk
        });
        const created = unwrapObject<SevdeskContact>(res);
        return {
          content: [{ type: "text", text: `Kontakt "${name}" angelegt (id: ${created?.id}).` }],
          structuredContent: { created: true, id: created?.id, name },
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleSevdeskError(error) }] };
      }
    }
  );
}
