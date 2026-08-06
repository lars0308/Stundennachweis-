import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SevdeskClient, handleSevdeskError, unwrapObjects, unwrapObject } from "../services/sevdesk-client.js";
import { ORDER_STATUS, UNITY, CHARACTER_LIMIT } from "../constants.js";
import type { SevdeskOrder } from "../types.js";

const ORDER_STATUS_LABEL: Record<number, string> = {
  100: "Entwurf",
  200: "Versendet",
  1000: "Angenommen",
};

const ListOrdersSchema = z
  .object({
    status: z
      .enum(["entwurf", "versendet", "angenommen", "alle"])
      .default("alle")
      .describe("Nach Status filtern: 'entwurf', 'versendet', 'angenommen' oder 'alle' (Standard)"),
    limit: z.number().int().min(1).max(100).default(50).describe("Maximale Anzahl Ergebnisse"),
  })
  .strict();

const GetOrderSchema = z
  .object({
    order_id: z.string().min(1).describe("sevDesk-ID des Angebots (aus sevdesk_list_orders)"),
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

const CreateOrderDraftSchema = z
  .object({
    contact_id: z.string().min(1).describe("sevDesk-Kontakt-ID des Kunden (mit sevdesk_search_contacts finden oder mit sevdesk_create_contact anlegen)"),
    title: z.string().min(1).max(200).describe("Titel/Betreff des Angebots, z.B. 'Angebot Dachrinnenreparatur'"),
    positions: z.array(PositionSchema).min(1).describe("Mindestens eine Position (Leistung/Artikel mit Menge und Preis)"),
    head_text: z.string().optional().describe("Freitext oberhalb der Positionstabelle, z.B. eine Anrede"),
    foot_text: z.string().optional().describe("Freitext unterhalb der Positionstabelle, z.B. Zahlungsbedingungen"),
  })
  .strict();

export function registerOrderTools(server: McpServer, client: SevdeskClient): void {
  server.registerTool(
    "sevdesk_list_orders",
    {
      title: "sevDesk-Angebote auflisten",
      description: `Listet Angebote (Order, orderType=AN) aus sevDesk auf, optional gefiltert nach Status.

Args:
  - status ('entwurf'|'versendet'|'angenommen'|'alle'): Filter (Standard: 'alle')
  - limit (number): Maximale Anzahl Ergebnisse, 1-100 (Standard: 50)

Returns: Liste mit id, Angebotsnummer, Kunde, Datum, Status, Nettosumme.

Error Handling:
  - Gibt eine leere Liste zurück, wenn nichts gefunden wurde (kein Fehler).`,
      inputSchema: ListOrdersSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ status, limit }) => {
      try {
        const params: Record<string, unknown> = { orderType: "AN", limit };
        if (status !== "alle") {
          const map = { entwurf: ORDER_STATUS.DRAFT, versendet: ORDER_STATUS.SENT, angenommen: ORDER_STATUS.ACCEPTED };
          params.status = map[status];
        }
        const data = await client.get(`/Order`, params);
        const orders = unwrapObjects<SevdeskOrder>(data);
        if (!orders.length) {
          return { content: [{ type: "text", text: "Keine Angebote gefunden." }] };
        }
        const output = {
          count: orders.length,
          orders: orders.map((o) => ({
            id: o.id,
            nr: o.orderNumber,
            contact_id: o.contact?.id,
            datum: o.orderDate,
            status: ORDER_STATUS_LABEL[o.status ?? 0] ?? String(o.status),
            summe_netto: o.sumNet,
          })),
        };
        const lines = [`# sevDesk-Angebote (${orders.length})`, ""];
        for (const o of output.orders) {
          lines.push(`- **${o.nr ?? "ohne Nr."}** (id: ${o.id}) — ${o.status}, ${o.summe_netto ?? "?"} € netto, ${o.datum ?? ""}`);
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
    "sevdesk_get_order",
    {
      title: "sevDesk-Angebot abrufen",
      description: `Ruft die Details eines einzelnen Angebots ab, inklusive Positionen.

Args:
  - order_id (string): sevDesk-ID des Angebots

Returns: Angebot mit Kopfdaten und allen Positionen (Bezeichnung, Menge, Preis).

Error Handling:
  - "Error: Nicht gefunden" wenn die order_id nicht existiert.`,
      inputSchema: GetOrderSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ order_id }) => {
      try {
        const [orderRaw, posRaw] = await Promise.all([
          client.get(`/Order/${order_id}`),
          client.get(`/Order/${order_id}/getPositions`),
        ]);
        const order = unwrapObject<SevdeskOrder>(orderRaw);
        const positions = unwrapObjects<Record<string, unknown>>(posRaw);
        if (!order) return { content: [{ type: "text", text: `Angebot ${order_id} nicht gefunden.` }] };
        const output = { order, positions };
        return {
          content: [{ type: "text", text: `# Angebot ${order.orderNumber ?? order_id}\n\n${JSON.stringify(output, null, 2)}` }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleSevdeskError(error) }] };
      }
    }
  );

  server.registerTool(
    "sevdesk_create_order_draft",
    {
      title: "sevDesk-Angebot als Entwurf anlegen",
      description: `Legt ein neues Angebot (Order, orderType=AN) in sevDesk als ENTWURF an — wird NICHT automatisch versendet oder finalisiert.

Wichtig: Das Angebot muss danach in sevDesk selbst geprüft und manuell versendet werden. Dieses Tool erstellt bewusst nur einen Entwurf, damit vor dem Versand an den Kunden immer noch einmal ein Mensch drüberschaut.

Args:
  - contact_id (string): sevDesk-Kontakt-ID des Kunden (siehe sevdesk_search_contacts)
  - title (string): Titel/Betreff des Angebots
  - positions (array): Mindestens eine Position mit name, quantity, price, optional unity und tax_rate
  - head_text (string, optional): Freitext oberhalb der Positionstabelle
  - foot_text (string, optional): Freitext unterhalb der Positionstabelle

Returns: Die neu angelegte Angebots-ID und -Nummer.

Error Handling:
  - Bei fehlenden Pflichtfeldern gibt sevDesk einen 400/422-Fehler zurück, der die Ursache benennt.
  - Bei ungültiger contact_id: "Error: sevDesk hat die Anfrage abgelehnt" — contact_id mit sevdesk_search_contacts prüfen.`,
      inputSchema: CreateOrderDraftSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ contact_id, title, positions, head_text, foot_text }) => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const body = {
          order: {
            objectName: "Order",
            contact: { id: contact_id, objectName: "Contact" },
            orderDate: today,
            status: ORDER_STATUS.DRAFT,
            header: title,
            headText: head_text ?? null,
            footText: foot_text ?? null,
            orderType: "AN",
            taxRate: positions[0]?.tax_rate ?? 19,
            taxType: "default",
            currency: "EUR",
          },
          orderPosSave: positions.map((p, i) => ({
            objectName: "OrderPos",
            quantity: p.quantity,
            price: p.price,
            name: p.name,
            unity: { id: p.unity, objectName: "Unity" },
            taxRate: p.tax_rate,
            positionNumber: i + 1,
          })),
          orderPosDelete: null,
        };
        const res = await client.post(`/Order/Factory/saveOrder`, body);
        const created = unwrapObject<{ order?: SevdeskOrder }>(res);
        const order = created?.order ?? (unwrapObject<SevdeskOrder>(res));
        return {
          content: [
            {
              type: "text",
              text: `Angebot als Entwurf angelegt: ${order?.orderNumber ?? "(Nummer wird von sevDesk vergeben)"} (id: ${order?.id}). Bitte in sevDesk prüfen und bei Bedarf versenden — es wurde NICHT automatisch verschickt.`,
            },
          ],
          structuredContent: { id: order?.id, order_number: order?.orderNumber, status: "Entwurf" },
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleSevdeskError(error) }] };
      }
    }
  );
}
