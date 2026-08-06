import axios, { AxiosError, type AxiosInstance } from "axios";
import { SEVDESK_BASE_URL } from "../constants.js";

/**
 * Dünner, typisierter Wrapper um die sevDesk REST API v1.
 * Auth läuft über einen API-Token im "Authorization"-Header (kein "Bearer"-Präfix,
 * so verlangt es die sevDesk-API).
 */
export class SevdeskClient {
  private http: AxiosInstance;

  constructor(apiToken: string) {
    this.http = axios.create({
      baseURL: SEVDESK_BASE_URL,
      timeout: 30000,
      headers: {
        Authorization: apiToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  }

  async get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.http.get(path, { params });
    return res.data as T;
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await this.http.post(path, body);
    return res.data as T;
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await this.http.put(path, body);
    return res.data as T;
  }
}

/** sevDesk verpackt Listen-Antworten als { objects: [...] } */
export function unwrapObjects<T = unknown>(data: unknown): T[] {
  if (data && typeof data === "object" && "objects" in (data as Record<string, unknown>)) {
    const objects = (data as { objects: unknown }).objects;
    return Array.isArray(objects) ? (objects as T[]) : [];
  }
  return Array.isArray(data) ? (data as T[]) : [];
}

/** sevDesk verpackt Einzel-Objekt-Antworten meist auch als { objects: {...} } */
export function unwrapObject<T = unknown>(data: unknown): T | null {
  if (data && typeof data === "object" && "objects" in (data as Record<string, unknown>)) {
    const objects = (data as { objects: unknown }).objects;
    if (Array.isArray(objects)) return (objects[0] as T) ?? null;
    return (objects as T) ?? null;
  }
  return (data as T) ?? null;
}

export function handleSevdeskError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ error?: { message?: string } }>;
    const apiMessage = err.response?.data?.error?.message;
    switch (err.response?.status) {
      case 401:
        return "Error: sevDesk-Token ungültig oder abgelaufen. Bitte SEVDESK_API_TOKEN prüfen.";
      case 403:
        return "Error: Keine Berechtigung für diese Aktion (Token-Rechte in sevDesk prüfen).";
      case 404:
        return "Error: Nicht gefunden. Bitte die ID prüfen.";
      case 429:
        return "Error: Zu viele Anfragen an sevDesk (Rate Limit). Bitte kurz warten.";
      case 400:
      case 422:
        return `Error: sevDesk hat die Anfrage abgelehnt${apiMessage ? " – " + apiMessage : ""}. Vermutlich fehlt ein Pflichtfeld oder ein Wert ist ungültig — bitte die Angaben prüfen und erneut versuchen.`;
      default:
        return `Error: sevDesk-Anfrage fehlgeschlagen (HTTP ${err.response?.status ?? "?"})${apiMessage ? " – " + apiMessage : ""}.`;
    }
  }
  if (error instanceof Error && error.message.includes("timeout")) {
    return "Error: Zeitüberschreitung bei der Anfrage an sevDesk. Bitte erneut versuchen.";
  }
  return `Error: Unerwarteter Fehler: ${error instanceof Error ? error.message : String(error)}`;
}
