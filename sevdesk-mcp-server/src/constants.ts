export const SEVDESK_BASE_URL = "https://my.sevdesk.de/api/v1";
export const CHARACTER_LIMIT = 25000;

// sevDesk-Statuscodes (bestätigt gegen ein echtes Konto, siehe Stundennachweis-App):
// Order (Angebote/Aufträge): 100=Entwurf, 200=Versendet, 1000=Angenommen
// Invoice (Rechnungen): 100=Entwurf, 200=Offen/Versendet, 750=Teilbezahlt, 1000=Bezahlt
export const ORDER_STATUS = {
  DRAFT: 100,
  SENT: 200,
  ACCEPTED: 1000,
} as const;

export const INVOICE_STATUS = {
  DRAFT: 100,
  OPEN: 200,
  PARTIALLY_PAID: 750,
  PAID: 1000,
} as const;

// sevDesk-Einheiten-Schlüssel für Positionen
export const UNITY = {
  STUECK: 1,
  QUADRATMETER: 2,
  METER: 3,
  KILOGRAMM: 4,
  TONNE: 5,
  LAUFMETER: 6,
  PAUSCHAL: 7,
  KUBIKMETER: 8,
  STUNDE: 9,
  KILOMETER: 10,
  PROZENT: 11,
  TAG: 12,
  LITER: 13,
} as const;
