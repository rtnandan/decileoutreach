// Server-only sending engine. Used by the scheduled job (all owners, admin client)
// and by the "Send next batch now" button (one owner, RLS client).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DO_NOT_EMAIL_STATUSES } from "./email-utils";
import { composeEmail, unsubscribeLinks } from "./compose";
import { assignAccounts, remainingAllowance, SENDS_PER_RUN, startOfDayInTimeZone } from "./sending-rules";
import { buildRawEmail, GmailError, sendGmail } from "./gmail.server";

type DB = SupabaseClient<Database>;

export type RunResult = { sent: number; skipped: number; failed: number; notes: string[] };

export async function runSender(db: DB, opts: { ownerId?: string; maxSends?: number } = {}): Promise<RunResult> {
  const result: RunResult = { sent: 0, skipped: 0, failed: 0, notes: [] };
  let slots = Math.min(opts.maxSends ?? SENDS_PER_RUN, SENDS_PER_RUN);
  const now = new Date();

  // 1. Anything stuck "sending" for 15+ minutes is marked failed, never retried (avoids duplicates).
  {
    let q = db
      .from("campaign_leads")
      .update({ status: "failed", error: "Interrupted while sending. Not retried to avoid a duplicate email." })
      .eq("status", "sending")
      .lt("claimed_at", new Date(now.getTime() - 15 * 60_000).toISOString());
    if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
    await q;
  }

  // 2. Active, approved campaigns.
  let cq = db
    .from("campaigns")
    .select("*")
    .eq("status", "active")
    .not("approved_at", "is", null)
    .order("started_at", { ascending: true });
  if (opts.ownerId) cq = cq.eq("owner_id", opts.ownerId);
  const { data: campaigns, error: cErr } = await cq;
  if (cErr) throw new Error(cErr.message);
  if (!campaigns?.length) return result;

  const ownerIds = [...new Set(campaigns.map((c) => c.owner_id))];
  const { data: settingsRows } = await db.from("app_settings").select("*").in("owner_id", ownerIds);
  const settings = new Map((settingsRows ?? []).map((s) => [s.owner_id, s]));

  const accountIds = [...new Set(campaigns.flatMap((c) => c.account_ids ?? []))];
  const { data: accountsRows } = accountIds.length
    ? await db.from("sending_accounts").select("*").in("id", accountIds)
    : { data: [] };
  const accounts = new Map((accountsRows ?? []).map((a) => [a.id, a]));

  // Accounts paused for hitting Gmail's limit come back the next day.
  for (const a of accounts.values()) {
    const tz = settings.get(a.owner_id)?.timezone ?? "Asia/Kolkata";
    if (a.status === "rate_limited" && new Date(a.updated_at) < startOfDayInTimeZone(now, tz)) {
      await db.from("sending_accounts").update({ status: "active", last_error: null }).eq("id", a.id);
      a.status = "active";
    }
  }

  // Sent-today counts, using the earliest day start among owners (filtered precisely below).
  const dayStartByOwner = new Map(
    ownerIds.map((o) => [o, startOfDayInTimeZone(now, settings.get(o)?.timezone ?? "Asia/Kolkata")]),
  );
  const earliest = new Date(Math.min(...[...dayStartByOwner.values()].map((d) => d.getTime())));
  const { data: sentRows } = await db
    .from("email_messages")
    .select("sending_account_id, campaign_id, sent_at, owner_id")
    .eq("direction", "outbound")
    .in("status", ["sent", "bounced"])
    .gte("sent_at", earliest.toISOString())
    .in("owner_id", ownerIds)
    .limit(20000);
  const accountSent = new Map<string, number>();
  const campaignSent = new Map<string, number>();
  for (const r of sentRows ?? []) {
    const start = dayStartByOwner.get(r.owner_id);
    if (!start || !r.sent_at || new Date(r.sent_at) < start) continue;
    if (r.sending_account_id) accountSent.set(r.sending_account_id, (accountSent.get(r.sending_account_id) ?? 0) + 1);
    if (r.campaign_id) campaignSent.set(r.campaign_id, (campaignSent.get(r.campaign_id) ?? 0) + 1);
  }

  type Task = { campaign: (typeof campaigns)[number]; clId: string; accountId: string };
  const tasks: Task[] = [];

  for (const campaign of campaigns) {
    if (slots <= 0) break;
    const usable = (campaign.account_ids ?? [])
      .map((id) => accounts.get(id))
      .filter((a): a is NonNullable<typeof a> => !!a && a.status === "active");
    if (!usable.length) {
      result.notes.push(`${campaign.name}: no active sending account`);
      continue;
    }
    const campaignRemaining = remainingAllowance({
      accountDailyLimit: Number.MAX_SAFE_INTEGER,
      accountSentToday: 0,
      campaignDailyLimit: campaign.daily_limit,
      campaignSentToday: campaignSent.get(campaign.id) ?? 0,
      slotsThisRun: slots,
    });
    if (campaignRemaining <= 0) continue;
    const perAccount = usable.map((a) => ({
      id: a.id,
      remaining: remainingAllowance({
        accountDailyLimit: a.daily_limit,
        accountSentToday: accountSent.get(a.id) ?? 0,
        campaignDailyLimit: Number.MAX_SAFE_INTEGER,
        campaignSentToday: 0,
        slotsThisRun: slots,
      }),
    }));
    const plan = assignAccounts(perAccount, campaignRemaining);
    if (!plan.length) {
      result.notes.push(`${campaign.name}: daily account limit reached`);
      continue;
    }

    const { data: queued } = await db
      .from("campaign_leads")
      .select("id")
      .eq("campaign_id", campaign.id)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(plan.length);
    if (!queued?.length) {
      const { count } = await db
        .from("campaign_leads")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .in("status", ["queued", "sending"]);
      if (!count) {
        await db.from("campaigns").update({ status: "completed", completed_at: now.toISOString() }).eq("id", campaign.id);
      }
      continue;
    }

    // Claim each row atomically: only rows still "queued" move to "sending".
    for (let i = 0; i < queued.length; i++) {
      const accountId = plan[i];
      const { data: claimed } = await db
        .from("campaign_leads")
        .update({ status: "sending", claimed_at: new Date().toISOString(), sending_account_id: accountId })
        .eq("id", queued[i].id)
        .eq("status", "queued")
        .select("id");
      if (claimed?.length) {
        tasks.push({ campaign, clId: queued[i].id, accountId });
        accountSent.set(accountId, (accountSent.get(accountId) ?? 0) + 1);
        campaignSent.set(campaign.id, (campaignSent.get(campaign.id) ?? 0) + 1);
        slots--;
      }
    }
  }

  // 3. Send (at most 5 at once).
  await Promise.all(
    tasks.map(async (t) => {
      const outcome = await sendOne(db, t.campaign, t.clId, accounts.get(t.accountId)!, settings.get(t.campaign.owner_id));
      result[outcome]++;
    }),
  );
  return result;
}

async function sendOne(
  db: DB,
  campaign: Database["public"]["Tables"]["campaigns"]["Row"],
  clId: string,
  account: Database["public"]["Tables"]["sending_accounts"]["Row"],
  settings: Database["public"]["Tables"]["app_settings"]["Row"] | undefined,
): Promise<"sent" | "skipped" | "failed"> {
  const { data: cl } = await db.from("campaign_leads").select("*, leads(*)").eq("id", clId).single();
  const lead = cl?.leads;
  if (!cl || !lead) return "skipped";

  const skip = async (reason: string) => {
    await db.from("campaign_leads").update({ status: "skipped", error: reason }).eq("id", clId);
    return "skipped" as const;
  };
  if (DO_NOT_EMAIL_STATUSES.includes(lead.status)) return skip(`Lead is ${lead.status}`);
  const { data: sup } = await db
    .from("suppressions")
    .select("id")
    .eq("owner_id", lead.owner_id)
    .eq("email", lead.email)
    .maybeSingle();
  if (sup) return skip("On suppression list");

  const links = unsubscribeLinks(settings?.app_url, lead.unsubscribe_token);
  const { subject, body } = composeEmail({
    subject: campaign.subject,
    body: campaign.body,
    signature: settings?.signature,
    lead: { ...lead, custom_fields: (lead.custom_fields ?? {}) as Record<string, unknown> },
    unsubscribeUrl: links.page,
  });

  // The unique (campaign_lead_id, step) index makes a second insert impossible -> no duplicates.
  const { data: msg, error: insErr } = await db
    .from("email_messages")
    .insert({
      owner_id: lead.owner_id,
      lead_id: lead.id,
      campaign_id: campaign.id,
      campaign_lead_id: clId,
      step: 0,
      sending_account_id: account.id,
      to_email: lead.email,
      from_email: account.email,
      subject,
      body,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !msg) return skip("Already sent (duplicate prevented)");

  try {
    const raw = buildRawEmail({
      from: account.email,
      fromName: account.from_name,
      to: lead.email,
      subject,
      body,
      unsubscribeUrl: links.oneClick,
    });
    const sent = await sendGmail(account.secret_name, raw);
    const sentAt = new Date().toISOString();
    await db
      .from("email_messages")
      .update({ status: "sent", sent_at: sentAt, gmail_message_id: sent.id, gmail_thread_id: sent.threadId })
      .eq("id", msg.id);
    await db
      .from("campaign_leads")
      .update({ status: "sent", sent_at: sentAt, gmail_thread_id: sent.threadId, error: null })
      .eq("id", clId);
    await db.from("leads").update({ last_contacted_at: sentAt }).eq("id", lead.id);
    await db.from("leads").update({ status: "email_sent" }).eq("id", lead.id).eq("status", "not_contacted");
    return "sent";
  } catch (e) {
    const err = e instanceof GmailError ? e : new GmailError(String((e as Error)?.message ?? e), 0, "other");
    await db.from("email_messages").update({ status: "failed", error: err.message }).eq("id", msg.id);
    await db.from("campaign_leads").update({ status: "failed", error: err.message }).eq("id", clId);
    if (err.kind === "auth" || err.kind === "config") {
      await db.from("sending_accounts").update({ status: "error", last_error: err.message }).eq("id", account.id);
      account.status = "error";
    } else if (err.kind === "rate_limit") {
      await db.from("sending_accounts").update({ status: "rate_limited", last_error: err.message }).eq("id", account.id);
      account.status = "rate_limited";
    }
    return "failed";
  }
}
