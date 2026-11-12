import { renderTemplate, type LeadLike } from "./email-utils";

export const DEFAULT_APP_URL = "https://decileoutreach.lovable.app";

/**
 * A plain, personal opt-out line. No link and no "unsubscribe" mail header: those make Gmail
 * file the email under Promotions/Updates instead of the main inbox. Replies are read by the
 * inbox checker, which suppresses anyone who asks to stop.
 */
export const OPT_OUT_LINE = `P.S. If this isn't relevant, just reply "unsubscribe" and I won't email you again.`;

export function composeEmail(opts: {
  subject: string;
  body: string;
  signature?: string | null | undefined;
  lead: LeadLike;
  /** Adds the opt-out line (real campaign emails and tests). */
  optOut?: boolean;
}) {
  const subject = renderTemplate(opts.subject, opts.lead);
  let body = renderTemplate(opts.body, opts.lead).trimEnd();
  if (opts.signature?.trim()) body += `\n\n${renderTemplate(opts.signature, opts.lead).trim()}`;
  if (opts.optOut) body += `\n\n${OPT_OUT_LINE}`;
  return { subject, body };
}

export function unsubscribeLinks(appUrl: string | null | undefined, token: string) {
  const base = (appUrl || DEFAULT_APP_URL).replace(/\/+$/, "");
  return {
    page: `${base}/unsubscribe/${token}`,
    oneClick: `${base}/api/public/unsubscribe?t=${token}`,
  };
}

const PROMO_WORDS = [
  "free", "offer", "discount", "deal", "limited time", "act now", "click here", "buy now",
  "guarantee", "100%", "risk-free", "special promotion", "newsletter", "unsubscribe", "% off", "sale",
];

/** Things in an email that push Gmail to file it under Promotions instead of the inbox. */
export function inboxWarnings(subject: string, body: string): string[] {
  const w: string[] = [];
  const text = `${subject}\n${body}`.toLowerCase();
  const links = body.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links > 1) w.push(`It has ${links} links. Keep it to one at most, ideally none in a first email.`);
  else if (links === 1) w.push("It has a link. First emails without any links reach the main inbox more often.");
  const promo = PROMO_WORDS.filter((p) => new RegExp(`(^|[^a-z])${p.replace(/[%.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(text));
  if (promo.length) w.push(`Sales-style words: ${promo.map((p) => `"${p}"`).join(", ")}. Write it like a note to one person.`);
  if (/!{2,}|!\s*$/m.test(subject) || (subject.match(/!/g)?.length ?? 0) > 0) w.push("Avoid exclamation marks in the subject.");
  const capsWords = subject.split(/\s+/).filter((x) => x.length > 3 && x === x.toUpperCase() && /[A-Z]/.test(x));
  if (capsWords.length) w.push("Avoid ALL-CAPS words in the subject.");
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (words > 180) w.push(`It's ${words} words. Short emails (50–150 words) look personal and land better.`);
  return w;
}
