// Server-only Gmail helpers (through the Lovable connector gateway).
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

export class GmailError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: "auth" | "rate_limit" | "recipient" | "config" | "other",
  ) {
    super(message);
  }
}

export function listGmailSecretNames(): string[] {
  return Object.keys(process.env)
    .filter((k) => /^GOOGLE_MAIL_API_KEY(_\d+)?$/.test(k) && process.env[k])
    .sort();
}

function headers(secretName: string) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env[secretName];
  if (!lovableKey) throw new GmailError("Email service key is missing on the server.", 500, "config");
  if (!connKey) throw new GmailError(`Gmail connection ${secretName} is not linked.`, 500, "config");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
    "Content-Type": "application/json",
  };
}

function classify(status: number, body: string): GmailError["kind"] {
  if (status === 401 || (status === 403 && /scope|credential|auth/i.test(body))) return "auth";
  if (status === 429 || /rateLimitExceeded|userRateLimitExceeded|quota|Daily user sending limit/i.test(body)) return "rate_limit";
  if (status === 400 && /recipient|address|invalid to/i.test(body)) return "recipient";
  return "other";
}

async function gmailFetch(secretName: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY_URL}${path}`, { ...init, headers: headers(secretName) });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Gmail request failed [${res.status}]: ${text}`);
    let msg = text;
    try {
      msg = JSON.parse(text)?.error?.message ?? text;
    } catch {
      /* keep raw text */
    }
    throw new GmailError(`Gmail [${res.status}]: ${String(msg).slice(0, 300)}`, res.status, classify(res.status, text));
  }
  return res.json();
}

export async function getGmailProfile(secretName: string): Promise<{ emailAddress: string }> {
  return gmailFetch(secretName, "/users/me/profile");
}

import { b64, buildMimeMessage } from "./mime";

export function buildRawEmail(input: Parameters<typeof buildMimeMessage>[0]) {
  return b64(buildMimeMessage(input)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmail(
  secretName: string,
  raw: string,
  threadId?: string | null,
): Promise<{ id: string; threadId: string }> {
  return gmailFetch(secretName, "/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  });
}

export async function listMessageIds(
  secretName: string,
  q: string,
  maxResults = 50,
): Promise<{ id: string; threadId: string }[]> {
  const params = new URLSearchParams({ q, maxResults: String(maxResults) });
  const res = (await gmailFetch(secretName, `/users/me/messages?${params}`)) as {
    messages?: { id: string; threadId: string }[];
  };
  return res.messages ?? [];
}

export async function getMessageHeaders(
  secretName: string,
  id: string,
  names: string[],
): Promise<Record<string, string>> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const n of names) params.append("metadataHeaders", n);
  const res = (await gmailFetch(secretName, `/users/me/messages/${encodeURIComponent(id)}?${params}`)) as {
    payload?: { headers?: { name: string; value: string }[] };
  };
  const out: Record<string, string> = {};
  for (const h of res.payload?.headers ?? []) out[h.name.toLowerCase()] = h.value;
  return out;
}

/** The short preview text Gmail stores for a message (the start of the reply). */
export async function gmailGetSnippet(secretName: string, id: string): Promise<string> {
  const params = new URLSearchParams({ format: "minimal", fields: "snippet" });
  const res = (await gmailFetch(secretName, `/users/me/messages/${encodeURIComponent(id)}?${params}`)) as {
    snippet?: string;
  };
  return res.snippet ?? "";
}

type GmailPart = {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

function decodeB64Url(data: string): string {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function collectBodies(part: GmailPart | undefined, out: { text: string[]; html: string[] }) {
  if (!part) return;
  const data = part.body?.data;
  if (data && part.mimeType === "text/plain") out.text.push(decodeB64Url(data));
  else if (data && part.mimeType === "text/html") out.html.push(decodeB64Url(data));
  for (const p of part.parts ?? []) collectBodies(p, out);
}

/** One received message: headers, labels and its plain-text body. */
export async function getMessageFull(secretName: string, id: string) {
  const res = (await gmailFetch(secretName, `/users/me/messages/${encodeURIComponent(id)}?format=full`)) as {
    id: string;
    threadId: string;
    labelIds?: string[];
    snippet?: string;
    internalDate?: string;
    payload?: GmailPart;
  };
  const headers: Record<string, string> = {};
  for (const h of res.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  const bodies = { text: [] as string[], html: [] as string[] };
  collectBodies(res.payload, bodies);
  const { htmlToText } = await import("./replies");
  const text = bodies.text.join("\n") || (bodies.html.length ? htmlToText(bodies.html.join("\n")) : res.snippet ?? "");
  return {
    id: res.id,
    threadId: res.threadId,
    labelIds: res.labelIds ?? [],
    headers,
    text,
    receivedAt: res.internalDate ? new Date(Number(res.internalDate)).toISOString() : new Date().toISOString(),
  };
}
