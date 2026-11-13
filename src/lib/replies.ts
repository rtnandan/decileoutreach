// Pure reply helpers shared by the browser and the server (no side effects).

export const REPLY_CATEGORIES = [
  { value: "interested", label: "Interested", tone: "success" },
  { value: "meeting_request", label: "Meeting Request", tone: "success" },
  { value: "need_more_info", label: "Need More Information", tone: "signal" },
  { value: "follow_up_later", label: "Follow Up Later", tone: "warning" },
  { value: "not_interested", label: "Not Interested", tone: "neutral" },
  { value: "out_of_office", label: "Out of Office", tone: "neutral" },
  { value: "unsubscribe", label: "Unsubscribe", tone: "danger" },
  { value: "bounce", label: "Bounce", tone: "danger" },
  { value: "other", label: "Other", tone: "info" },
] as const;

export type ReplyCategory = (typeof REPLY_CATEGORIES)[number]["value"];
export const REPLY_CATEGORY_VALUES = REPLY_CATEGORIES.map((c) => c.value) as ReplyCategory[];

export function replyCategoryMeta(value: string | null | undefined) {
  return REPLY_CATEGORIES.find((c) => c.value === value) ?? null;
}

export function isReplyCategory(v: unknown): v is ReplyCategory {
  return typeof v === "string" && (REPLY_CATEGORY_VALUES as string[]).includes(v);
}

/** Lead statuses that mean "we emailed them and haven't heard back yet". */
const PRE_REPLY = ["not_contacted", "email_sent", "delivered"];
const FINAL = ["unsubscribed", "bounced"];

const CATEGORY_STATUS: Record<ReplyCategory, string | null> = {
  interested: "interested",
  meeting_request: "meeting_requested",
  need_more_info: "follow_up_required",
  follow_up_later: "follow_up_required",
  not_interested: "not_interested",
  unsubscribe: "unsubscribed",
  bounce: "bounced",
  out_of_office: null, // an auto-reply isn't a real answer: keep the status as it is
  other: "replied",
};

/**
 * The lead status after a reply in this category.
 * Unsubscribed/bounced leads never change; "Other" never downgrades an already-sorted lead
 * (unless the owner picks it by hand, `manual`).
 */
export function nextLeadStatus(current: string, category: ReplyCategory | null, manual = false): string {
  if (FINAL.includes(current) && !manual) return current;
  if (category === null) return PRE_REPLY.includes(current) ? "replied" : current;
  const mapped = CATEGORY_STATUS[category];
  if (mapped === null) return current;
  if (category === "other" && !manual) return PRE_REPLY.includes(current) ? "replied" : current;
  return mapped;
}

/** Sorts the obvious cases without AI: opt-out wording and automatic replies. */
export function quickCategory(input: {
  subject?: string | null | undefined;
  text: string;
  autoSubmitted?: string | null | undefined;
  autoReplyHeader?: boolean | undefined;
}): ReplyCategory | null {
  const text = input.text.toLowerCase();
  if (/\b(unsubscribe|opt[ -]?out|remove me|take me off|stop (emailing|sending|contacting)|do not (email|contact)|don't (email|contact)|no more emails)\b/.test(text))
    return "unsubscribe";
  const auto = (input.autoSubmitted ?? "").toLowerCase();
  const subject = (input.subject ?? "").toLowerCase();
  if (
    (auto && auto !== "no") ||
    input.autoReplyHeader ||
    /^(out of (the )?office|automatic reply|auto[- ]?reply|autoreply|away from (the )?office)\b/.test(subject)
  )
    return "out_of_office";
  return null;
}

/** Keeps only the person's new words: drops the quoted earlier email and reply headers. */
export function extractReplyText(full: string): string {
  let t = full.replace(/\r\n/g, "\n");
  const cuts = [
    /\n[^\n]*\bOn [^\n]{0,200}(\n[^\n]{0,200})?\bwrote:\s*\n/i, // Gmail / Apple Mail
    /\n-{2,}\s*Original Message\s*-{2,}/i, // Outlook
    /\n_{8,}\s*\n\s*From:/i, // Outlook web
    /\nFrom: [^\n]+\n(Sent|Date): /i,
  ];
  for (const re of cuts) {
    const m = ("\n" + t).match(re);
    if (m && m.index !== undefined) t = ("\n" + t).slice(0, m.index).replace(/^\n/, "");
  }
  t = t
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.slice(0, 4000);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'");
}

/** "Nandan T <nandan@x.com>" -> "nandan@x.com" */
export function parseAddress(header: string | null | undefined): string {
  const h = header ?? "";
  const m = h.match(/<([^>]+)>/) ?? h.match(/[^\s<>,;"']+@[^\s<>,;"']+/);
  return (m?.[1] ?? m?.[0] ?? "").trim().toLowerCase();
}
