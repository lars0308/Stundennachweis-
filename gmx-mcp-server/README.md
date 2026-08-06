# gmx-mcp-server

Verbindet Claude (z.B. Claude Desktop) mit einem GMX-Postfach: E-Mails lesen,
durchsuchen, senden und beantworten — über die Standardprotokolle IMAP (Lesen) und
SMTP (Senden), die GMX für jedes E-Mail-Programm anbietet.

**Wichtig:** `gmx_send_email` und `gmx_reply_email` verschicken E-Mails **sofort und
ohne Rückfrage** — anders als beim sevDesk-Server gibt es hier keine
"Entwurf statt Versand"-Sicherung, weil E-Mail keinen Entwurfs-Zwischenschritt in
diesem Sinne kennt. Sprich Inhalte vor dem Versand im Chat ab, bevor du Claude bittest,
sie tatsächlich zu senden.

## Voraussetzungen

- [Node.js](https://nodejs.org) Version 18 oder neuer
- Claude Desktop (Mac oder Windows)
- **POP3/IMAP-Zugriff in GMX aktiviert**: GMX-Webmail öffnen → Einstellungen →
  POP3/IMAP → Zugriff erlauben. Ohne diesen Schritt lehnt GMX jede
  Fremd-Programm-Anmeldung ab, unabhängig vom Passwort.
- Falls in deinem GMX-Konto eine zusätzliche Absicherung (mobile TAN/2FA) aktiv ist,
  verlangt GMX zusätzlich ein **App-Passwort** statt deines normalen Passworts —
  das wird an derselben Stelle (Einstellungen → POP3/IMAP bzw. Sicherheit) erzeugt.

## Einrichtung

### 1. Projekt herunterladen und bauen

Der Server liegt im Branch `gmx-mcp-server` des Stundennachweis-Repos, im
Unterordner `gmx-mcp-server/`:

```bash
git clone -b gmx-mcp-server https://github.com/lars0308/Stundennachweis-.git
cd Stundennachweis-/gmx-mcp-server
npm install
npm run build
```

### 2. Claude Desktop konfigurieren

Öffne die Konfigurationsdatei von Claude Desktop:

- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Füge einen `gmx`-Eintrag hinzu (falls dort schon `mcpServers` mit anderen Einträgen
stehen, wie z.B. `sevdesk`, einfach danebenschreiben, nicht ersetzen):

```json
{
  "mcpServers": {
    "gmx": {
      "command": "node",
      "args": ["/VOLLSTÄNDIGER/PFAD/ZU/gmx-mcp-server/dist/index.js"],
      "env": {
        "GMX_EMAIL": "service.battermann@gmx.de",
        "GMX_PASSWORD": "dein-gmx-passwort-oder-app-passwort"
      }
    }
  }
}
```

### 3. Claude Desktop neu starten

Danach kannst du z.B. schreiben:

> "Hab ich ungelesene E-Mails?"
> "Fass die letzte Mail von [Absender] zusammen"
> "Antworte auf die Mail von Kunde X: Termin passt, bis Freitag."

## Verfügbare Werkzeuge

| Tool | Zweck |
|---|---|
| `gmx_list_folders` | Postfach-Ordner auflisten |
| `gmx_search_emails` | E-Mails durchsuchen/filtern (ungelesen, Absender, Betreff, Zeitraum) |
| `gmx_get_email` | Vollständigen Inhalt einer E-Mail abrufen |
| `gmx_send_email` | Neue E-Mail senden |
| `gmx_reply_email` | Auf eine E-Mail antworten (mit korrektem Threading) |

## Sicherheitshinweise

- Zugangsdaten stehen nur lokal in deiner Claude-Desktop-Konfiguration, nicht in
  diesem Repository.
- `gmx_send_email`/`gmx_reply_email` verschicken sofort — es gibt keine
  "nur Entwurf"-Option wie beim sevDesk-Server. Bitte Inhalte vorher im Chat
  gegenlesen.
- Für Anhänge ist in dieser ersten Version nur das **Anzeigen der Dateinamen**
  vorgesehen, kein Download/Versand von Anhängen — das kann bei Bedarf ergänzt
  werden.

## Bekannte Einschränkung dieser Version

Die IMAP/SMTP-Verbindung zu GMX (Server, Port, TLS) folgt den offiziellen,
seit Jahren stabilen GMX-Einstellungen, konnte aber in der Entwicklungsumgebung
nicht live gegen ein echtes Konto getestet werden (kein Netzwerkzugriff auf
Mail-Ports von dort aus). Bitte nach der Einrichtung einmal `gmx_list_folders`
ausprobieren — falls das fehlschlägt, meist liegt es an einem nicht aktivierten
POP3/IMAP-Zugriff (siehe oben) oder einem benötigten App-Passwort.

## Entwicklung

```bash
npm run dev     # Entwicklungsmodus mit Auto-Reload
npm run build   # TypeScript kompilieren
```

Zum Testen ohne Claude Desktop eignet sich der [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
