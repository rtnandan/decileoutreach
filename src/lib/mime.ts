// Pure MIME helpers for building outgoing emails (no server-only imports).

const utf8 = (s: string) => new TextEncoder().encode(s);
export const b64 = (s: string) => btoa(Array.from(utf8(s), (b) => String.fromCharCode(b)).join(""));
const isAscii = (v: string) => /^[\x00-\x7F]*$/.test(v);
export const encodeHeader = (v: string) => (isAscii(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
const stripNewlines = (v: string) => v.replace(/[\r\n]+/g, " ").trim();

/**
 * Quoted-printable body encoding (RFC 2045). Keeps every line at 76 characters or less,
 * so long paragraphs and non-English text arrive intact instead of being cut or garbled.
 */
export function encodeQuotedPrintable(text: string): string {
  return text
    .replace(/\r\n|\r|\n/g, "\n")
    .split("\n")
    .map((line) => {
      const bytes = utf8(line);
      const tokens: string[] = [];
      bytes.forEach((b, i) => {
        const last = i === bytes.length - 1;
        if ((b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !last)) tokens.push(String.fromCharCode(b));
        else tokens.push(`=${b.toString(16).toUpperCase().padStart(2, "0")}`);
      });
      const out: string[] = [];
      let cur = "";
      for (const t of tokens) {
        if (cur.length + t.length > 75) {
          out.push(`${cur}=`);
          cur = "";
        }
        cur += t;
      }
      out.push(cur);
      return out.join("\r\n");
    })
    .join("\r\n");
}

export function decodeQuotedPrintable(qp: string): string {
  const joined = qp.replace(/=\r\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i]!;
    if (ch === "=" && /^[0-9A-F]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(ch.charCodeAt(0));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Builds the full RFC 2822 message text (before base64url encoding for Gmail). */
export function buildMimeMessage(input: {
  from: string;
  fromName?: string | null;
  to: string;
  subject: string;
  body: string;
}): string {
  const name = stripNewlines(input.fromName ?? "").replace(/"/g, "");
  const from = name ? `${isAscii(name) ? `"${name}"` : encodeHeader(name)} <${input.from}>` : input.from;
  const lines = [
    `From: ${from}`,
    `To: ${stripNewlines(input.to)}`,
    `Subject: ${encodeHeader(stripNewlines(input.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: quoted-printable",
  ];
  // No List-Unsubscribe header on purpose: it marks the email as bulk mail and Gmail files it
  // under Promotions. The opt-out line in the body is handled by the inbox checker.
  return [...lines, "", encodeQuotedPrintable(input.body)].join("\r\n");
}

/** Pulls failed addresses out of a bounce's X-Failed-Recipients header. */
export function parseFailedRecipients(header: string | null | undefined): string[] {
  if (!header) return [];
  return [...new Set((header.match(/[^\s<>,;"']+@[^\s<>,;"']+/g) ?? []).map((e) => e.toLowerCase()))];
}

/**
 * True when a reply asks to stop receiving emails. Looks only at the reply's own words
 * (Gmail's preview text starts with the new text), so our own P.S. line quoted below doesn't count.
 */
export function isOptOutReply(snippet: string): boolean {
  const text = snippet
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .toLowerCase()
    .split(/\bon .{3,80} wrote:|-----original message-----|p\.s\. if this isn't relevant/)[0] ?? "";
  return /\b(unsubscribe|opt[ -]?out|remove me|take me off|stop (emailing|sending|contacting)|do not (email|contact)|don't (email|contact)|no more emails)\b/.test(text);
}
