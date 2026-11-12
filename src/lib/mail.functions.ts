import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Finds every linked Gmail connection and adds/refreshes it as a sending account. */
export const syncSendingAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listGmailSecretNames, getGmailProfile } = await import("./gmail.server");
    const { supabase, userId } = context;
    const names = listGmailSecretNames();
    const results: { secret: string; email?: string; error?: string }[] = [];
    for (const secret of names) {
      try {
        const profile = await getGmailProfile(secret);
        const { data: existing } = await supabase
          .from("sending_accounts")
          .select("id, status")
          .eq("secret_name", secret)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("sending_accounts")
            .update({
              email: profile.emailAddress,
              last_checked_at: new Date().toISOString(),
              last_error: null,
              status: existing.status === "error" ? "active" : existing.status,
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("sending_accounts").insert({
            owner_id: userId,
            secret_name: secret,
            email: profile.emailAddress,
            last_checked_at: new Date().toISOString(),
          });
        }
        results.push({ secret, email: profile.emailAddress });
      } catch (e) {
        const message = (e as Error).message;
        await supabase
          .from("sending_accounts")
          .update({ status: "error", last_error: message, last_checked_at: new Date().toISOString() })
          .eq("secret_name", secret);
        results.push({ secret, error: message });
      }
    }
    return { found: names.length, results };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        accountId: z.string().uuid(),
        to: z.string().email().max(254),
        leadId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { buildRawEmail, sendGmail } = await import("./gmail.server");
    const { composeEmail, unsubscribeLinks } = await import("./compose");
    const { supabase, userId } = context;
    const [{ data: campaign }, { data: account }, { data: settings }] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", data.campaignId).single(),
      supabase.from("sending_accounts").select("*").eq("id", data.accountId).single(),
      supabase.from("app_settings").select("*").maybeSingle(),
    ]);
    if (!campaign) throw new Error("Campaign not found");
    if (!account) throw new Error("Sending account not found");
    let lead: Record<string, unknown> = {
      first_name: "Sample",
      last_name: "Lead",
      company: "Sample Co",
      designation: "Marketing Head",
      industry: "Media",
      email: data.to,
      custom_fields: {},
      unsubscribe_token: "00000000-0000-0000-0000-000000000000",
    };
    if (data.leadId) {
      const { data: l } = await supabase.from("leads").select("*").eq("id", data.leadId).single();
      if (l) lead = l as unknown as Record<string, unknown>;
    }
    const links = unsubscribeLinks(settings?.app_url, String(lead["unsubscribe_token"]));
    const { subject, body } = composeEmail({
      subject: campaign.subject,
      body: campaign.body,
      signature: settings?.signature,
      lead: lead as never,
      unsubscribeUrl: links.page,
    });
    const raw = buildRawEmail({
      from: account.email,
      fromName: account.from_name,
      to: data.to,
      subject: `[TEST] ${subject}`,
      body,
    });
    try {
      const sent = await sendGmail(account.secret_name, raw);
      await supabase.from("email_messages").insert({
        owner_id: userId,
        campaign_id: campaign.id,
        is_test: true,
        sending_account_id: account.id,
        to_email: data.to,
        from_email: account.email,
        subject: `[TEST] ${subject}`,
        body,
        status: "sent",
        sent_at: new Date().toISOString(),
        gmail_message_id: sent.id,
        gmail_thread_id: sent.threadId,
      });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Runs one sending batch right now for the signed-in user (same rules as the schedule). */
export const sendNextBatchNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runSender } = await import("./sender.server");
    const { MANUAL_BATCH_SIZE } = await import("./sending-rules");
    return runSender(context.supabase, { ownerId: context.userId, maxSends: MANUAL_BATCH_SIZE });
  });

/** Looks for bounce notices in the connected Gmail inboxes right now. */
export const checkBouncesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { processBounces } = await import("./bounces.server");
    return processBounces(context.supabase, { ownerId: context.userId });
  });
