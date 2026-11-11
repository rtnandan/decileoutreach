import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/send-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runSender } = await import("@/lib/sender.server");
          const result = await runSender(supabaseAdmin);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("send-batch failed", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
