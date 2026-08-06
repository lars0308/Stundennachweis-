import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SevdeskClient, handleSevdeskError, unwrapObjects, unwrapObject } from "../services/sevdesk-client.js";
import { INVOICE_STATUS, UNITY, CHARACTER_LIMIT } from "../constants.js";
import type { SevdeskInvoice } from "../types.js";

const INVOICE_STATUS_LABEL: Record<number, string> = {
  100: "Entwurf",
  200: "Offen",
  750: "Teilbezahlt",
  1000: "Bezahlt",
};

const ListInvoicesSchema = z
  .object({
    status: z
      .enum(["entwurf", "offen", "teilbezahlt", "bezahlt", "alle"])
      .default("alle")
      .describe("Nach Status filtern (Standard: 'alle')"),
    limit: z.number().int().min(1).max(100).default(50).describe("Maximale Anzahl Ergebnisse"),
  })
  .strict();

const GetInvoiceSchema = z
  .object({
    invoice_id: z.string().min(1).describe("sevDesk-ID der Rechnung (aus sevdesk_list_invoices)"),
  })
  .strict();

const PositionSchema = z
  .object({
    name: z.string().min(1).describe("Bezeichnung der Position, z.B. 'Montage Klimaanlage'"),
    quantity: z.number().positive().describe("Menge, z.B. Stunden oder Stückzahl"),
    price: z.number().describe("Einzelpreis netto in Euro"),
    unity: z
      .number()
      .int()
      .default(UNITY.STUECK)
      .describe("Einheit als sevDesk-Code: 1=Stück, 9=Stunde, 10=km, 12=Tag (Standard: 1=Stück)"),
    tax_rate: z.number().default(19).describe("Umsatzsteuersatz in Prozent (Standard: 19)"),
  })
  .strict();

const CreateInvoiceDraftSchema = z
  .object({
    contact_id: z.string().min(1).describe("sevDesk-Kontakt-ID des Kunden (mit sevdesk_search_contacts finden oder mit sevdesk_create_contact anlegen)"),
    title: z.string().min(1).max(200).describe("Titel/Betreff der Rechnung, z.B. 'Rechnung Reparaturarbeiten Juli'"),
    positions: z.array(PositionSchema).min(1).describe("Mindestens eine Position (Leistung/Artikel mit Menge und Preis)"),
    head_text: z.string().optional().describe("Freitext oberhalb der Positionstabelle"),
    foot_text: z.string().optional().describe("Freitext unterhalb der Positionstabelle, z.B. Zahlungsbedingungen"),
  })
  .strict();

export function registerInvoiceTools(server: McpServer, client: SevdeskClient): void {
  server.registerTool(
    "sevdesk_list_invoices",
    {
      title: "sevDesk-Rechnungen auflisten",
      description: `Listet Rechnungen (Invoice, invoiceType=RE) aus sevDesk auf, optional gefiltert nach Status.

Args:
  - status ('entwurf'|'offen'|'teilbezahlt'|'bezahlt'|'alle'): Filter (Standard: 'alle')
  - limit (number): Maximale Anzahl Ergebnisse, 1-100 (Standard: 50)

Returns: Liste mit id, Rechnungsnummer, Kunde, Datum, Status, Bruttosumme.

Error Handling:
  - Gibt eine leere Liste zurück, wenn nichts gefunden wurde (kein Fehler).`,
      inputSchema: ListInvoicesSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ status, limit }) => {
      try {
        const params: Record<string, unknown> = { limit };
        if (status !== "alle") {
          const map = {
            entwurf: INVOICE_STATUS.DRAFT,
            offen: INVOICE_STATUS.OPEN,
            teilbezahlt: INVOICE_STATUS.PARTIALLY_PAID,
            bezahlt: INVOICE_STATUS.PAID,
          };
          params.status = map[status];
        }
        const data = await client.get(`/Invoice`, params);
        const invoices = unwrapObjects<SevdeskInvoice>(data);
        if (!invoices.length) {
          return { content: [{ type: "text", text: "Keine Rechnungen gefunden." }] };
        }
        const output = {
          count: invoices.length,
          invoices: invoices.map((i) => ({
            id: i.id,
            nr: i.invoiceNumber,
            contact_id: i.contact?.id,
            datum: i.invoiceDate,
            status: INVOICE_STATUS_LABEL[i.status ?? 0] ?? String(i.status),
            summe_brutto: i.sumGross,
          })),
        };
        const lines = [`# sevDesk-Rechnungen (${invoices.length})`, ""];
        for (const i of output.invoices) {
          lines.push(`- **${i.nr ?? "ohne Nr."}** (id: ${i.id}) — ${i.status}, ${i.summe_brutto ?? "?"} € brutto, ${i.datum ?? ""}`);
        }
        let text = lines.join("\n");
        if (text.length > CHARACTER_LIMIT) text = text.slice(0, CHARACTER_LIMIT) + "\n\n[Gekürzt — mit 'limit' oder 'status' weiter eingrenzen]";
        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (error) {
        return { content: [{ type: "text", text: handleSevdeskError(error) }] };
      }
    }
  );

  server.registerTool(
    "sevdesk_get_invoice",
    {
      title: "sevDesk-Rechnung abrufen",
      description: `Ruft die Details einer einzelnen Rechnung ab, inklusive Positionen.

Args:
  - invoice_id (string): sevDesk-ID der Rechnung

Returns: Rechnung mit Kopfdaten und allen Positionen.

Error Handling:
  - "Error: Nicht gefunden" wenn die invoice_id nicht existiert.`,
      inputSchema: GetInvoiceSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ invoice_id }) => {
      try {
        const [invRaw, posRaw] = await Promise.all([
          client.get(`/Invoice/${invoice_id}`),
          client.get(`/Invoice/${invoice_id}/getPositions`),
        ]);
        const invoice = unwrapObject<SevdeskInvoice>(invRaw);
        const positions = unwrapObjects<Record<string, unknown>>(posRaw);
        if (!invoice) return { content: [{ type: "text", text: `Rechnung ${invoice_id} nicht gefunden.` }] };
        const output = { invoice, positions };
        return {
          content: [{ type: "text", text: `# Rechnung ${invoice.invoiceNumber ?? invoice_id}\n\n${JSON.stringify(output, null, 2)}` }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleSevdeskError(error) }] };
      }
    }
  );

  server.registerTool(
    "sevdesk_create_invoice_draft",
    {
      title: "sevDesk-Rechnung als Entwurf anlegen",
      description: `Legt eine neue Rechnung (Invoice, invoiceType=RE) in sevDesk als ENTWURF an — wird NICHT automatisch versendet, gebucht oder finalisiert.

Wichtig: Die Rechnung muss danach in sevDesk selbst geprüft und manuell freigegeben/versendet werden. Dieses Tool erstellt bewusst nur einen Entwurf, damit vor dem Versand an den Kunden immer noch einmal ein Mensch drüberschaut — insbesondere wichtig, weil eine einmal endgültig gestellte Rechnung aus GoBD-Gründen nicht mehr einfach gelöscht werden darf.

Args:
  - contact_id (string): sevDesk-Kontakt-ID des Kunden (siehe sevdesk_search_contacts)
  - title (string): Titel/Betreff der Rechnung
  - positions (array): Mindestens eine Position mit name, quantity, price, optional unity und tax_rate
  - head_text (string, optional): Freitext oberhalb der Positionstabelle
  - foot_text (string, optional): Freitext unterhalb der Positionstabelle, z.B. Zahlungsbedingungen

Returns: Die neu angelegte Rechnungs-ID und -Nummer.

Error Handling:
  - Bei fehlenden Pflichtfeldern gibt sevDesk einen 400/422-Fehler zurück, der die Ursache benennt.
  - Bei ungültiger contact_id: "Error: sevDesk hat die Anfrage abgelehnt" — contact_id mit sevdesk_search_contacts prüfen.`,
      inputSchema: CreateInvoiceDraftSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ contact_id, title, positions, head_text, foot_text }) => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const body = {
          invoice: {
            objectName: "Invoice",
            contact: { id: contact_id, objectName: "Contact" },
            invoiceDate: today,
            status: INVOICE_STATUS.DRAFT,
            header: title,
            headText: head_text ?? null,
            footText: foot_text ?? null,
            invoiceType: "RE",
            currency: "EUR",
            taxRate: positions[0]?.tax_rate ?? 19,
            taxType: "default",
          },
          invoicePosSave: positions.map((p, i) => ({
            objectName: "InvoicePos",
            quantity: p.quantity,
            price: p.price,
            name: p.name,
            unity: { id: p.unity, objectName: "Unity" },
            taxRate: p.tax_rate,
            positionNumber: i + 1,
          })),
          invoicePosDelete: null,
          takeDefaultEmail: true,
        };
        const res = await client.post(`/Invoice/Factory/saveInvoice`, body);
        const created = unwrapObject<{ invoice?: SevdeskInvoice }>(res);
        const invoice = created?.invoice ?? (unwrapObject<SevdeskInvoice>(res));
        return {
          content: [
            {
              type: "text",
              text: `Rechnung als Entwurf angelegt: ${invoice?.invoiceNumber ?? "(Nummer wird von sevDesk vergeben)"} (id: ${invoice?.id}). Bitte in sevDesk prüfen und bewusst freigeben — es wurde NICHTS automatisch versendet oder final gebucht.`,
            },
          ],
          structuredContent: { id: invoice?.id, invoice_number: invoice?.invoiceNumber, status: "Entwurf" },
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleSevdeskError(error) }] };
      }
    }
  );
}
