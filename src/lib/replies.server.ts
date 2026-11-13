// Server-only reply sync: finds replies to our campaign emails in the connected Gmail inboxes,
// saves them on the lead's history, updates the lead's status and sorts them with AI.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getMessageFull, listMessageIds } from "./gmail.server";
import { suppress } from "./bounces.server";
import { extractReplyText, nextLeadStatus, parseAddress, quickCategory, type ReplyCategory } from "./replies";

type DB = SupabaseClient<Database>;
export type ReplySyncResult = { newReplies: number; classified: number; notes: string[] };

const INBOX_QUERY = "in:inbox newer_than:14d -from:(mailer-daemon OR postmaster)";
const MAX_NEW_PER_RUN = 10;

export async function syncReplies(db: DB, opts: { ownerId?: string | undefined; classifyLimit?: number | undefined } = {}): Promise<ReplySyncResult> {
  const result: ReplySyncResult = { newReplies: 0, classified: 0, notes: [] };
  let aq = db.from("sending_accounts").select("id, owner_id, email, secret_name");
  if (opts.ownerId) aq = aq.eq("owner_id", opts.ownerId);
  const { data: accounts } = await aq;

  for (const account of accounts ?? []) {
    try {
      const listed = await listMessageIds(account.secret_name, INBOX_QUERY, 50);
      const threadIds = [...new Set(listed.map((m) => m.threadId))];
      if (!threadIds.length) continue;
      const { data: ours } = await db
        .from("email_messages")
        .select("owner_id, lead_id, campaign_id, campaign_lead_id, subject, gmail_thread_id, gmail_message_id, direction")
        .eq("sending_account_id", account.id)
        .eq("is_test", false)
        .in("gmail_thread_id", threadIds);
      const outboundByThread = new Map<string, NonNullable<typeof ours>[number]>();
      const knownIds = new Set<string>();
      for (const m of ours ?? []) {
        if (m.gmail_message_id) knownIds.add(m.gmail_message_id);
        if (m.direction === "outbound" && m.gmail_thread_id && m.lead_id) outboundByThread.set(m.gmail_thread_id, m);
      }
      const fresh = listed
        .filter((m) => outboundByThread.has(m.threadId) && !knownIds.has(m.id))
        .slice(0, MAX_NEW_PER_RUN);

      for (const item of fresh) {
        const sent = outboundByThread.get(item.threadId)!;
        const msg = await getMessageFull(account.secret_name, item.id);
        if (msg.labelIds.includes("SENT")) continue; // something we sent ourselves
        const fromEmail = parseAddress(msg.headers["from"]);
        const subject = msg.headers["subject"] ?? "";
        const text = extractReplyText(msg.text);
        const quick = quickCategory({
          subject,
          text,
          autoSubmitted: msg.headers["auto-submitted"],
          autoReplyHeader: !!(msg.headers["x-autoreply"] || msg.headers["x-autorespond"]),
        });
        const { data: row, error } = await db
          .from("email_messages")
          .insert({
            owner_id: sent.owner_id,
            lead_id: sent.lead_id,
            campaign_id: sent.campaign_id,
            campaign_lead_id: sent.campaign_lead_id,
            direction: "inbound",
            is_test: false,
            sending_account_id: account.id,
            from_email: fromEmail || "unknown",
            to_email: account.email,
            subject,
            body: text || "(no text)",
            status: "received",
            sent_at: msg.receivedAt,
            gmail_message_id: msg.id,
            gmail_thread_id: msg.threadId,
            reply_category: quick,
          })
          .select("id, lead_id")
          .single();
        if (error || !row) continue; // already saved by a parallel run
        result.newReplies++;
        if (row.lead_id) {
          await db.from("leads").update({ last_replied_at: msg.receivedAt }).eq("id", row.lead_id);
          await applyCategory(db, { owner_id: sent.owner_id, lead_id: row.lead_id, email: fromEmail }, quick);
        }
      }
    } catch (e) {
      result.notes.push(`${account.email}: ${(e as Error).message}`);
    }
  }

  result.classified = await classifyPending(db, { ownerId: opts.ownerId, limit: opts.classifyLimit ?? 3, notes: result.notes });
  return result;
}

/** Sorts saved replies that have no category yet (a few per run, so each run stays short). */
async function classifyPending(db: DB, opts: { ownerId?: string | undefined; limit: number; notes: string[] }): Promise<number> {
  let q = db
    .from("email_messages")
    .select("id, owner_id, lead_id, from_email, subject, body, gmail_thread_id")
    .eq("direction", "inbound")
    .is("reply_category", null)
    .order("sent_at", { ascending: true })
    .limit(opts.limit);
  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  const { data: pending } = await q;
  if (!pending?.length) return 0;
  const { classifyReply, AiUnavailableError } = await import("./classify.server");
  let done = 0;
  for (const r of pending) {
    const { data: original } = await db
      .from("email_messages")
      .select("subject")
      .eq("gmail_thread_id", r.gmail_thread_id ?? "")
      .eq("direction", "outbound")
      .limit(1)
      .maybeSingle();
    try {
      const { category, summary } = await classifyReply({ subject: r.subject, reply: r.body, originalSubject: original?.subject });
      await db.from("email_messages").update({ reply_category: category, reply_summary: summary }).eq("id", r.id);
      if (r.lead_id) await applyCategory(db, { owner_id: r.owner_id, lead_id: r.lead_id, email: r.from_email }, category);
      done++;
    } catch (e) {
      const err = e as InstanceType<typeof AiUnavailableError>;
      opts.notes.push(err.message);
      // Bad request: give up on this one so it isn't retried forever. Anything else: try next run.
      if (err.status === 400) {
        await db.from("email_messages").update({ reply_category: "other", reply_summary: "Couldn't sort this reply automatically." }).eq("id", r.id);
        continue;
      }
      break;
    }
  }
  return done;
}

/** Moves the lead to the status that matches the reply, and suppresses on unsubscribe/bounce. */
export async function applyCategory(
  db: DB,
  who: { owner_id: string; lead_id: string; email: string },
  category: ReplyCategory | null,
  manual = false,
) {
  const { data: lead } = await db.from("leads").select("status, email").eq("id", who.lead_id).maybeSingle();
  if (!lead) return;
  if (category === "unsubscribe" || category === "bounce") {
    await suppress(
      db,
      { owner_id: who.owner_id, lead_id: who.lead_id, email: lead.email },
      category,
      category === "bounce" ? "Reply says the address doesn't work" : "Asked to stop in a reply",
    );
    return;
  }
  const next = nextLeadStatus(lead.status, category, manual);
  if (next !== lead.status) await db.from("leads").update({ status: next }).eq("id", who.lead_id);
}
