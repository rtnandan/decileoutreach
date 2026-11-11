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

const b64 = (s: string) =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const encodeHeader = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
const stripNewlines = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

export function buildRawEmail(input: {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  body: string;
  unsubscribeUrl?: string;
}) {
  const fromName = stripNewlines(input.fromName ?? "");
  const lines = [
    `From: ${fromName ? `${encodeHeader(`"${fromName.replace(/"/g, "")}"`)} <${input.from}>` : input.from}`,
    `To: ${stripNewlines(input.to)}`,
    `Subject: ${encodeHeader(stripNewlines(input.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.unsubscribeUrl) {
    lines.push(`List-Unsubscribe: <${input.unsubscribeUrl}>`);
    lines.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  }
  const message = [...lines, "", input.body.replace(/\r?\n/g, "\r\n")].join("\r\n");
  return b64(message).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
