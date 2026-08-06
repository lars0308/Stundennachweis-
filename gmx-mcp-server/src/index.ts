#!/usr/bin/env node
/**
 * MCP-Server für GMX-E-Mail (IMAP zum Lesen, SMTP zum Senden).
 *
 * Verbindet Claude (z.B. Claude Desktop) mit einem GMX-Postfach: Ordner/E-Mails lesen
 * und durchsuchen, neue E-Mails senden, auf E-Mails antworten.
 *
 * Läuft lokal über stdio, gedacht für Claude Desktop. Erwartet GMX_EMAIL und
 * GMX_PASSWORD als Umgebungsvariablen (siehe README.md) — GMX verlangt dafür, dass
 * POP3/IMAP-Zugriff im Webmail-Konto unter Einstellungen aktiviert ist.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReadTools } from "./tools/read.js";
import { registerSendTools } from "./tools/send.js";

async function main(): Promise<void> {
  const user = process.env.GMX_EMAIL;
  const pass = process.env.GMX_PASSWORD;
  if (!user || !pass) {
    console.error("ERROR: GMX_EMAIL und/oder GMX_PASSWORD sind nicht gesetzt. Siehe README.md.");
    process.exit(1);
  }

  const server = new McpServer({
    name: "gmx-mcp-server",
    version: "1.0.0",
  });

  registerReadTools(server);
  registerSendTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("gmx-mcp-server läuft (stdio).");
}

main().catch((error) => {
  console.error("Server-Fehler:", error);
  process.exit(1);
});
