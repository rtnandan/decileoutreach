// Pure helpers shared by the browser and the server (no imports with side effects).

export const LEAD_STATUSES = [
  { value: "not_contacted", label: "Not Contacted", tone: "neutral" },
  { value: "email_sent", label: "Email Sent", tone: "info" },
  { value: "delivered", label: "Delivered", tone: "info" },
  { value: "replied", label: "Replied", tone: "signal" },
  { value: "interested", label: "Interested", tone: "success" },
  { value: "meeting_requested", label: "Meeting Requested", tone: "success" },
  { value: "follow_up_required", label: "Follow-up Required", tone: "warning" },
  { value: "not_interested", label: "Not Interested", tone: "neutral" },
  { value: "unsubscribed", label: "Unsubscribed", tone: "danger" },
  { value: "bounced", label: "Bounced", tone: "danger" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["value"];
export type Tone = (typeof LEAD_STATUSES)[number]["tone"];

export function leadStatusMeta(value: string) {
  return LEAD_STATUSES.find((s) => s.value === value) ?? LEAD_STATUSES[0];
}

/** Statuses that must never receive another email. */
export const DO_NOT_EMAIL_STATUSES: readonly string[] = ["unsubscribed", "bounced"];

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function normalizeEmail(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (email.length > 254 || email.includes("..")) return false;
  const tld = email.split(".").pop() ?? "";
  return EMAIL_RE.test(email) && /^[a-z]{2,}$/.test(tld);
}

export type LeadLike = {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  designation?: string | null;
  industry?: string | null;
  custom_fields?: Record<string, unknown> | null;
};

export const STANDARD_VARIABLES = [
  "first_name",
  "last_name",
  "company",
  "designation",
  "industry",
  "email",
] as const;

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

function lookup(lead: LeadLike, key: string): string {
  const k = key.toLowerCase();
  const std = (lead as Record<string, unknown>)[k];
  if (typeof std === "string" && std.trim()) return std.trim();
  const custom = lead.custom_fields ?? {};
  for (const [ck, cv] of Object.entries(custom)) {
    if (ck.toLowerCase() === k && cv != null && String(cv).trim()) return String(cv).trim();
  }
  return "";
}

/**
 * Replaces {{variable}} placeholders. Supports a fallback: {{first_name|there}}.
 * Unknown or empty variables become the fallback (or an empty string).
 */
export function renderTemplate(template: string, lead: LeadLike): string {
  return template.replace(VAR_RE, (_m, key: string, fallback?: string) => {
    const v = lookup(lead, key);
    return v || (fallback ?? "");
  });
}

/** Variables used in a template that this lead has no value (and no fallback) for. */
export function missingVariables(template: string, lead: LeadLike): string[] {
  const missing = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) {
    const [, key, fallback] = m;
    if (!lookup(lead, key) && fallback === undefined) missing.add(key);
  }
  return [...missing];
}

export function variablesIn(template: string): string[] {
  return [...new Set([...template.matchAll(VAR_RE)].map((m) => m[1]))];
}

/** Splits rows into new, invalid, duplicate-in-file and already-existing. */
export function classifyImportRows<T extends { email: string }>(
  rows: T[],
  existingEmails: Set<string>,
) {
  const seen = new Set<string>();
  const valid: T[] = [];
  const invalid: T[] = [];
  const duplicateInFile: T[] = [];
  const alreadyExists: T[] = [];
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!isValidEmail(email)) {
      invalid.push(row);
      continue;
    }
    if (seen.has(email)) {
      duplicateInFile.push(row);
      continue;
    }
    seen.add(email);
    if (existingEmails.has(email)) {
      alreadyExists.push(row);
      continue;
    }
    valid.push({ ...row, email });
  }
  return { valid, invalid, duplicateInFile, alreadyExists };
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
