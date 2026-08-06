import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SevdeskClient, handleSevdeskError, unwrapObjects } from "../services/sevdesk-client.js";
import { CHARACTER_LIMIT } from "../constants.js";
import type { SevdeskCheckAccount, SevdeskCheckAccountTransaction } from "../types.js";

const ListTransactionsSchema = z
  .object({
    account_id: z.string().min(1).describe("sevDesk-ID des Bankkontos (aus sevdesk_list_accounts)"),
    limit: z.number().int().min(1).max(100).default(30).describe("Maximale Anzahl Buchungen (Standard: 30)"),
  })
  .strict();

export function registerAccountTools(server: McpServer, client: SevdeskClient): void {
  server.registerTool(
    "sevdesk_list_accounts",
    {
      title: "sevDesk-Bankkonten & Kontostände abrufen",
      description: `Listet alle in sevDesk hinterlegten Bankkonten mit aktuellem Kontostand auf.

Args: keine

Returns: Liste mit id, Kontoname, Kontostand in Euro.

Error Handling:
  - Gibt eine leere Liste zurück, wenn kein Konto in sevDesk hinterlegt ist.`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const data = await client.get(`/CheckAccount`);
        const accounts = unwrapObjects<SevdeskCheckAccount>(data);
        if (!accounts.length) {
          return { content: [{ type: "text", text: "Keine Bankkonten in sevDesk hinterlegt." }] };
        }
        const total = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
        const output = {
          count: accounts.length,
          total_balance_eur: total,
          accounts: accounts.map((a) => ({ id: a.id, name: a.name, balance_eur: Number(a.balance) || 0 })),
        };
        const lines = [`# sevDesk-Bankkonten`, "", `**Gesamt: ${total.toFixed(2)} €**`, ""];
        for (const a of output.accounts) lines.push(`- ${a.name}: ${a.balance_eur.toFixed(2)} € (id: ${a.id})`);
        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: output };
      } catch (error) {
        return { content: [{ type: "text", text: handleSevdeskError(error) }] };
      }
    }
  );

  server.registerTool(
    "sevdesk_list_transactions",
    {
      title: "sevDesk-Kontobewegungen abrufen",
      description: `Listet die letzten Buchungen (Ein-/Ausgänge) eines Bankkontos auf.

Args:
  - account_id (string): sevDesk-ID des Kontos (siehe sevdesk_list_accounts)
  - limit (number): Maximale Anzahl Buchungen, 1-100 (Standard: 30)

Returns: Liste mit Datum, Betrag, Verwendungszweck/Zahlungspartner je Buchung.

Error Handling:
  - Gibt eine leere Liste zurück, wenn keine Buchungen gefunden wurden.`,
      inputSchema: ListTransactionsSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ account_id, limit }) => {
      try {
        const data = await client.get(`/CheckAccountTransaction`, {
          "checkAccount[id]": account_id,
          "checkAccount[objectName]": "CheckAccount",
          limit,
        });
        const tx = unwrapObjects<SevdeskCheckAccountTransaction>(data);
        if (!tx.length) {
          return { content: [{ type: "text", text: "Keine Buchungen gefunden." }] };
        }
        const output = {
          count: tx.length,
          transactions: tx.map((t) => ({
            datum: (t.valueDate || t.entryDate || "").slice(0, 10),
            betrag_eur: Number(t.amount) || 0,
            verwendungszweck: t.paymtPurpose || t.payeePayerName || "",
          })),
        };
        const lines = [`# Kontobewegungen (${tx.length})`, ""];
        for (const t of output.transactions) {
          lines.push(`- ${t.datum}: ${t.betrag_eur >= 0 ? "+" : ""}${t.betrag_eur.toFixed(2)} € — ${t.verwendungszweck || "(ohne Verwendungszweck)"}`);
        }
        let text = lines.join("\n");
        if (text.length > CHARACTER_LIMIT) text = text.slice(0, CHARACTER_LIMIT) + "\n\n[Gekürzt — 'limit' reduzieren]";
        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (error) {
        return { content: [{ type: "text", text: handleSevdeskError(error) }] };
      }
    }
  );
}
