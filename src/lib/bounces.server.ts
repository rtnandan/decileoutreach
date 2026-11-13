// Server-only bounce checker: finds bounce notices in the connected Gmail inboxes and makes sure
// those people are never emailed again. ("Please stop" replies are handled by replies.server.ts.)
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getMessageHeaders, listMessageIds } from "./gmail.server";
import { parseFailedRecipients } from "./mime";

type DB = SupabaseClient<Database>;
export type InboxResult = { bounced: number; optedOut: number; notes: string[] };

const BOUNCE_QUERY = "in:anywhere from:(mailer-daemon OR postmaster) newer_than:3d -subject:delay";
const MAX_LOOKUPS = 8; // keeps each run short

export async function processBounces(db: DB, opts: { ownerId?: string } = {}): Promise<InboxResult> {
  const result: InboxResult = { bounced: 0, optedOut: 0, notes: [] };
  let aq = db.from("sending_accounts").select("id, owner_id, email, secret_name");
  if (opts.ownerId) aq = aq.eq("owner_id", opts.ownerId);
  const { data: accounts } = await aq;
  let lookups = 0;

  for (const account of accounts ?? []) {
    try {
      // 1. Bounces. Gmail files the bounce in the same conversation as the email we sent.
      const notices = await listMessageIds(account.secret_name, BOUNCE_QUERY, 50);
      const threadIds = [...new Set(notices.map((n) => n.threadId))];
      const known = threadIds.length
        ? ((
            await db
              .from("email_messages")
              .select("id, owner_id, lead_id, to_email, status, gmail_thread_id")
              .eq("sending_account_id", account.id)
              .eq("direction", "outbound")
              .eq("is_test", false)
              .in("gmail_thread_id", threadIds)
          ).data ?? [])
        : [];
      const byThread = new Map(known.map((m) => [m.gmail_thread_id, m]));
      for (const n of notices) {
        const msg = byThread.get(n.threadId);
        if (msg) {
          if (msg.status === "sent") {
            await markBounced(db, msg);
            result.bounced++;
          }
          continue;
        }
        // Not in a known conversation: read who it failed for.
        if (lookups >= MAX_LOOKUPS) continue;
        lookups++;
        const h = await getMessageHeaders(account.secret_name, n.id, ["X-Failed-Recipients"]);
        for (const email of parseFailedRecipients(h["x-failed-recipients"])) {
          const { data: m } = await db
            .from("email_messages")
            .select("id, owner_id, lead_id, to_email, status, gmail_thread_id")
            .eq("sending_account_id", account.id)
            .eq("direction", "outbound")
            .eq("is_test", false)
            .eq("to_email", email)
            .eq("status", "sent")
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (m) {
            await markBounced(db, m);
            result.bounced++;
          }
        }
      }

    } catch (e) {
      result.notes.push(`${account.email}: ${(e as Error).message}`);
    }
  }
  return result;
}

async function markBounced(db: DB, msg: { id: string; owner_id: string; lead_id: string | null; to_email: string }) {
  await db.from("email_messages").update({ status: "bounced", error: "Bounced: the address doesn't accept email" }).eq("id", msg.id);
  await suppress(db, { owner_id: msg.owner_id, lead_id: msg.lead_id, email: msg.to_email }, "bounce", "Bounce notice received");
}

export async function suppress(
  db: DB,
  who: { owner_id: string; lead_id: string | null; email: string },
  reason: "bounce" | "unsubscribe",
  note: string,
) {
  const email = who.email.trim().toLowerCase();
  await db
    .from("suppressions")
    .upsert({ owner_id: who.owner_id, email, reason, note }, { onConflict: "owner_id,email", ignoreDuplicates: true });
  if (who.lead_id) {
    await db.from("leads").update({ status: reason === "bounce" ? "bounced" : "unsubscribed" }).eq("id", who.lead_id);
    await db
      .from("campaign_leads")
      .update({ status: "skipped", error: reason === "bounce" ? "Bounced" : "Unsubscribed" })
      .eq("lead_id", who.lead_id)
      .eq("status", "queued");
  }
}
