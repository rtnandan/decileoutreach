import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { EmptyState, PageHeader, formatDateTime } from "@/components/app/page";
import { CampaignStatusBadge } from "@/components/app/status";
import { supabase } from "@/integrations/supabase/client";
import { campaignsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/campaigns/")({
  head: () => ({
    meta: [
      { title: "Campaigns — DECILE Outreach" },
      { name: "description", content: "Create, approve, pause and track email campaigns." },
      { property: "og:title", content: "Campaigns — DECILE Outreach" },
      { property: "og:description", content: "Create, approve, pause and track email campaigns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(campaignsQuery());
  },
  component: CampaignsPage,
});

const STARTER_BODY = `Hi {{first_name|there}},

I came across {{company}} and noticed your work as {{designation}} in {{industry|your industry}}.

At DECILE Media we help teams like yours ...

Would you be open to a quick 15-minute call next week?`;

function CampaignsPage() {
  const { data: campaigns } = useSuspenseQuery(campaignsQuery());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data: accounts } = await supabase.from("sending_accounts").select("id").eq("status", "active");
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        name: name.trim(),
        subject: "Quick question for {{company}}",
        body: STARTER_BODY,
        account_ids: (accounts ?? []).map((a) => a.id),
      })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? "Couldn't create campaign");
      return;
    }
    qc.invalidateQueries();
    navigate({ to: "/campaigns/$campaignId", params: { campaignId: data.id } });
  }

  return (
    <>
      <PageHeader
        eyebrow="Campaigns"
        title="Campaigns"
        description="Each campaign is one email, personalised for every recipient and sent in safe daily batches."
        actions={
          <Button variant="signal" onClick={() => setOpen(true)}>
            <Plus /> New campaign
          </Button>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          action={
            <Button variant="signal" onClick={() => setOpen(true)}>
              Create your first campaign
            </Button>
          }
        >
          Write one email, choose who gets it, review and approve — the sender does the rest.
        </EmptyState>
      ) : (
        <div className="divide-y rounded-lg border bg-card shadow-card">
          {campaigns.map((c) => {
            const done = c.stats.sent + c.stats.failed + c.stats.skipped;
            const pct = c.stats.total ? Math.round((done / c.stats.total) * 100) : 0;
            return (
              <Link
                key={c.id}
                to="/campaigns/$campaignId"
                params={{ campaignId: c.id }}
                className="grid gap-3 px-5 py-4 hover:bg-muted/50 md:grid-cols-[1fr_200px_260px] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{c.name}</span>
                    <CampaignStatusBadge status={c.status} />
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{c.subject || "No subject yet"}</div>
                </div>
                <div className="tabular text-xs text-muted-foreground">Created {formatDateTime(c.created_at)}</div>
                <div className="flex items-center gap-3">
                  <Progress value={pct} className="h-1.5" />
                  <span className="tabular w-24 shrink-0 text-right text-xs text-muted-foreground">
                    {c.stats.sent}/{c.stats.total} sent
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>Give it a name you'll recognise. You'll write the email next.</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name">Name</Label>
              <Input id="campaign-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q4 brand partnerships" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || busy}>
                {busy ? "Creating…" : "Create campaign"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
