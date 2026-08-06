export function handleMailError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("auth") || lower.includes("login") || lower.includes("invalid credentials")) {
    return (
      "Error: Anmeldung bei GMX fehlgeschlagen. Prüfe: (1) GMX_EMAIL und GMX_PASSWORD korrekt gesetzt, " +
      "(2) POP3/IMAP-Zugriff in den GMX-Einstellungen aktiviert (GMX Webmail → Einstellungen → POP3/IMAP), " +
      "(3) falls du ein App-Passwort nutzt, ist es noch gültig."
    );
  }
  if (lower.includes("timeout") || lower.includes("econnrefused") || lower.includes("enotfound")) {
    return "Error: Verbindung zu GMX fehlgeschlagen (Zeitüberschreitung oder kein Netzwerk). Bitte erneut versuchen.";
  }
  if (lower.includes("mailbox") && lower.includes("not found")) {
    return "Error: Ordner nicht gefunden. Mit gmx_list_folders die genauen Ordnernamen prüfen.";
  }
  return `Error: ${message}`;
}
