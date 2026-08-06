#!/usr/bin/env node
/**
 * MCP-Server für sevDesk (deutsche Buchhaltungs-/Rechnungssoftware).
 *
 * Verbindet Claude (z.B. Claude Desktop) mit einem sevDesk-Konto: Kunden suchen/anlegen,
 * Angebote/Rechnungen lesen und als Entwurf anlegen, Kontostände & Kontobewegungen lesen.
 *
 * Läuft lokal über stdio, gedacht für Claude Desktop. Erwartet den sevDesk-API-Token
 * in der Umgebungsvariable SEVDESK_API_TOKEN (siehe README.md).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SevdeskClient } from "./services/sevdesk-client.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerAccountTools } from "./tools/accounts.js";

async function main(): Promise<void> {
  const apiToken = process.env.SEVDESK_API_TOKEN;
  if (!apiToken) {
    console.error("ERROR: Umgebungsvariable SEVDESK_API_TOKEN ist nicht gesetzt. Siehe README.md.");
    process.exit(1);
  }

  const client = new SevdeskClient(apiToken);

  const server = new McpServer({
    name: "sevdesk-mcp-server",
    version: "1.0.0",
  });

  registerContactTools(server, client);
  registerOrderTools(server, client);
  registerInvoiceTools(server, client);
  registerAccountTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("sevdesk-mcp-server läuft (stdio).");
}

main().catch((error) => {
  console.error("Server-Fehler:", error);
  process.exit(1);
});
