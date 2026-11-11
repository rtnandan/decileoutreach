import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const tokenSchema = z.string().uuid();

async function unsubscribe(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, owner_id, email")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!lead) return false;
  await supabaseAdmin.from("leads").update({ status: "unsubscribed" }).eq("id", lead.id);
  await supabaseAdmin
    .from("suppressions")
    .upsert(
      { owner_id: lead.owner_id, email: lead.email, reason: "unsubscribe", note: "Unsubscribed via email link" },
      { onConflict: "owner_id,email", ignoreDuplicates: true },
    );
  await supabaseAdmin
    .from("campaign_leads")
    .update({ status: "skipped", error: "Unsubscribed" })
    .eq("lead_id", lead.id)
    .eq("status", "queued");
  return true;
}

// POST only: link scanners that GET the URL can't unsubscribe anyone by accident.
export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        let token = url.searchParams.get("t");
        if (!token) {
          try {
            const body = (await request.json()) as { token?: string };
            token = body.token ?? null;
          } catch {
            /* one-click posts are form-encoded; token is in the query */
          }
        }
        const parsed = tokenSchema.safeParse(token);
        if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
        const ok = await unsubscribe(parsed.data);
        // Same response either way: don't reveal whether a token exists.
        void ok;
        return Response.json({ ok: true });
      },
    },
  },
});
