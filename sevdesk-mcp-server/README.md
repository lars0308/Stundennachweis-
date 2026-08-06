# sevdesk-mcp-server

Verbindet Claude (z.B. Claude Desktop) mit deinem [sevDesk](https://sevdesk.de)-Konto:
Kunden suchen/anlegen, Angebote und Rechnungen lesen und als Entwurf anlegen,
Kontostände und Kontobewegungen abrufen.

**Wichtig:** Angebote/Rechnungen werden von diesem Server **immer nur als Entwurf**
angelegt — nie automatisch versendet oder final gebucht. Bitte jeden Entwurf einmal
in sevDesk selbst prüfen, bevor er rausgeht (insbesondere bei Rechnungen, die aus
GoBD-Gründen nach dem endgültigen Versand nicht mehr einfach gelöscht werden dürfen).

## Voraussetzungen

- [Node.js](https://nodejs.org) Version 18 oder neuer ("LTS"-Version reicht)
- Claude Desktop (Mac oder Windows)
- Ein sevDesk-API-Token: sevDesk → Einstellungen → Benutzer → dein Benutzer → API-Token

## Einrichtung

### 1. Projekt herunterladen und bauen

```bash
git clone https://github.com/<DEIN-GITHUB-NAME>/sevdesk-mcp-server.git
cd sevdesk-mcp-server
npm install
npm run build
```

Merke dir den vollständigen Pfad zu diesem Ordner (z.B. mit `pwd` anzeigen lassen) —
den brauchst du im nächsten Schritt.

### 2. Claude Desktop konfigurieren

Öffne die Konfigurationsdatei von Claude Desktop:

- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Falls die Datei noch nicht existiert, leg sie an. Trage Folgendes ein (Pfad und
Token anpassen):

```json
{
  "mcpServers": {
    "sevdesk": {
      "command": "node",
      "args": ["/VOLLSTÄNDIGER/PFAD/ZU/sevdesk-mcp-server/dist/index.js"],
      "env": {
        "SEVDESK_API_TOKEN": "dein-sevdesk-api-token"
      }
    }
  }
}
```

Falls dort schon andere `mcpServers`-Einträge stehen, füge `"sevdesk": {...}` einfach
als weiteren Eintrag daneben ein (nicht die ganze Datei ersetzen).

### 3. Claude Desktop neu starten

Nach einem Neustart taucht "sevdesk" als verbundener MCP-Server auf (Werkzeug-Symbol
in der Nachrichtenleiste). Ab jetzt kannst du in jeder Unterhaltung z.B. schreiben:

> "Zeig mir alle offenen Rechnungen"
> "Wie hoch ist mein Kontostand?"
> "Leg ein Angebot für Kunde Müller an: 5 Stunden Montage à 55€"

## Verfügbare Werkzeuge

| Tool | Zweck |
|---|---|
| `sevdesk_search_contacts` | Kunden nach Namen suchen |
| `sevdesk_create_contact` | Neuen Kunden-Kontakt anlegen |
| `sevdesk_list_orders` | Angebote auflisten (nach Status filterbar) |
| `sevdesk_get_order` | Ein Angebot inkl. Positionen abrufen |
| `sevdesk_create_order_draft` | Neues Angebot als Entwurf anlegen |
| `sevdesk_list_invoices` | Rechnungen auflisten (nach Status filterbar) |
| `sevdesk_get_invoice` | Eine Rechnung inkl. Positionen abrufen |
| `sevdesk_create_invoice_draft` | Neue Rechnung als Entwurf anlegen |
| `sevdesk_list_accounts` | Bankkonten & Kontostände abrufen |
| `sevdesk_list_transactions` | Kontobewegungen eines Kontos abrufen |

## Sicherheitshinweise

- Der API-Token steht nur lokal in deiner Claude-Desktop-Konfigurationsdatei, nicht
  in diesem Repository.
- Alle Schreib-Operationen (Angebot/Rechnung anlegen) erzeugen ausschließlich
  Entwürfe — kein automatisches Versenden, Buchen oder Löschen.
- Falls dein sevDesk-Plan es anbietet, empfiehlt es sich, für diesen Server einen
  eigenen, möglichst rechtebeschränkten API-Token zu verwenden statt eines
  Vollzugriffs-Tokens.

## Entwicklung

```bash
npm run dev     # Entwicklungsmodus mit Auto-Reload
npm run build   # TypeScript kompilieren
```

Zum Testen ohne Claude Desktop eignet sich der [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
