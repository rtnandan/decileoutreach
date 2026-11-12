import { renderTemplate, type LeadLike } from "./email-utils";

export const DEFAULT_APP_URL = "https://decileoutreach.lovable.app";

export function composeEmail(opts: {
  subject: string;
  body: string;
  signature?: string | null | undefined;
  lead: LeadLike;
  unsubscribeUrl?: string | undefined;
}) {
  const subject = renderTemplate(opts.subject, opts.lead);
  let body = renderTemplate(opts.body, opts.lead).trimEnd();
  if (opts.signature?.trim()) body += `\n\n${renderTemplate(opts.signature, opts.lead).trim()}`;
  if (opts.unsubscribeUrl) body += `\n\n--\nNot relevant? Unsubscribe here: ${opts.unsubscribeUrl}`;
  return { subject, body };
}

export function unsubscribeLinks(appUrl: string | null | undefined, token: string) {
  const base = (appUrl || DEFAULT_APP_URL).replace(/\/+$/, "");
  return {
    page: `${base}/unsubscribe/${token}`,
    oneClick: `${base}/api/public/unsubscribe?t=${token}`,
  };
}
