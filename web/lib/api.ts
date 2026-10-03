/**
 * Authenticated calls to the FastAPI backend.
 *
 * The backend no longer trusts a client-supplied user id — it wants a signed
 * bearer token. `apiFetch` keeps one in memory, refreshes it shortly before it
 * expires, and retries once on a 401 in case the token went stale mid-flight.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let cached: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string> | null = null;

// Refresh a minute early so a request never leaves with a token that expires
// while it is in transit.
const SKEW_MS = 60_000;

async function fetchToken(): Promise<string> {
  const res = await fetch("/api/token", { cache: "no-store" });
  if (!res.ok) {
    cached = null;
    throw new Error(res.status === 401 ? "Not signed in" : "Could not get an API token");
  }
  const data = (await res.json()) as { token: string; expiresAt: number };
  cached = data;
  return data.token;
}

async function getToken(force = false): Promise<string> {
  if (!force && cached && cached.expiresAt - SKEW_MS > Date.now()) {
    return cached.token;
  }
  // Collapse concurrent refreshes — the app fires several requests at once on
  // load, and they should share one token fetch.
  if (!inFlight) {
    inFlight = fetchToken().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function clearToken() {
  cached = null;
}

/** Raised when the backend says the user is out of quota (HTTP 402). */
export class QuotaError extends Error {
  usage: QuotaState | null;
  constructor(usage: QuotaState | null) {
    super(usage?.reason || "Monthly limit reached.");
    this.name = "QuotaError";
    this.usage = usage;
  }
}

export interface QuotaState {
  plan: string;
  period: string;
  allowance: number;
  used: number;
  remaining_allowance: number;
  credits: number;
  can_structure: boolean;
  reason: string | null;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, { ...init, headers });
  };

  let res = await send(await getToken());
  if (res.status === 401) {
    // Token may have expired or the secret rotated; one forced retry.
    res = await send(await getToken(true));
  }

  if (res.status === 402) {
    let usage: QuotaState | null = null;
    try {
      const body = await res.clone().json();
      usage = (body?.detail ?? null) as QuotaState | null;
    } catch {
      usage = null;
    }
    throw new QuotaError(usage);
  }

  return res;
}

/** apiFetch + JSON body + error text extraction, which most callers want. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep the status-code message */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}
