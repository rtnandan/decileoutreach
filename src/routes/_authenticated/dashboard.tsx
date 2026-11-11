import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState, PageHeader, StatCard, formatDateTime } from "@/components/app/page";
import { CampaignStatusBadge, DeliveryBadge } from "@/components/app/status";
import { LEAD_STATUSES } from "@/lib/email-utils";
import { accountsQuery, campaignsQuery, dashboardQuery, recentActivityQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — DECILE Outreach" },
      { name: "description", content: "Leads, sends, replies and follow-ups at a glance." },
      { property: "og:title", content: "Dashboard — DECILE Outreach" },
      { property: "og:description", content: "Leads, sends, replies and follow-ups at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(dashboardQuery()),
      context.queryClient.ensureQueryData(campaignsQuery()),
      context.queryClient.ensureQueryData(accountsQuery()),
      context.queryClient.ensureQueryData(recentActivityQuery()),
    ]),
  component: Dashboard,
});

function Dashboard() {
  const { data: s } = useSuspenseQuery(dashboardQuery());
  const { data: campaigns } = useSuspenseQuery(campaignsQuery());
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: activity } = useSuspenseQuery(recentActivityQuery());
  const n = (k: string) => Number(s[k] ?? 0);
  const delivered = Math.max(0, n("emails_sent") - n("bounced"));
  const capacity = accounts.filter((a) => a.status === "active").reduce((t, a) => t + Math.max(0, a.daily_limit - a.sent_today), 0);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Where every lead stands, and what the sender will do next."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/leads/import">
                <Upload /> Import leads
              </Link>
            </Button>
            <Button asChild variant="signal">
              <Link to="/campaigns">New campaign</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total leads" value={n("total_leads")} />
        <StatCard label="Emails sent" value={n("emails_sent")} />
        <StatCard label="Delivered" value={delivered} hint="Sent minus bounced" />
        <StatCard label="Bounced" value={n("bounced")} />
        <StatCard label="Opened" value="—" hint="Not tracked — unreliable for plain emails" />
        <StatCard label="Replies" value={n("replies")} />
        <StatCard label="Interested" value={n("interested")} emphasis />
        <StatCard label="Meetings" value={n("meetings")} emphasis />
        <StatCard label="Pending follow-ups" value={n("pending_follow_ups")} />
        <StatCard label="Queued to send" value={n("queued")} hint={`${capacity} can still go out today`} />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Campaigns</h2>
            <Link to="/campaigns" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              All campaigns <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet">Import some leads, then create your first campaign.</EmptyState>
          ) : (
            <div className="divide-y rounded-lg border bg-card shadow-card">
              {campaigns.slice(0, 5).map((c) => {
                const done = c.stats.sent + c.stats.failed + c.stats.skipped;
                const pct = c.stats.total ? Math.round((done / c.stats.total) * 100) : 0;
                return (
                  <Link
                    key={c.id}
                    to="/campaigns/$campaignId"
                    params={{ campaignId: c.id }}
                    className="block px-4 py-3 hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium">{c.name}</span>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={pct} className="h-1.5" />
                      <span className="tabular w-28 shrink-0 text-right text-xs text-muted-foreground">
                        {c.stats.sent}/{c.stats.total} sent
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold">Lead status</h2>
          <div className="rounded-lg border bg-card p-4 shadow-card">
            {LEAD_STATUSES.map((st) => {
              const count = Number(s.by_status?.[st.value] ?? 0);
              const pct = n("total_leads") ? (count / n("total_leads")) * 100 : 0;
              return (
                <Link
                  key={st.value}
                  to="/leads"
                  search={{ status: st.value }}
                  className="flex items-center gap-3 py-1.5 text-sm hover:text-signal"
                >
                  <span className="w-40 shrink-0">{st.label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full bg-signal" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="tabular w-10 text-right text-muted-foreground">{count}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-xl font-semibold">Recent emails</h2>
        {activity.length === 0 ? (
          <EmptyState title="Nothing sent yet">Sent emails will show up here.</EmptyState>
        ) : (
          <div className="divide-y rounded-lg border bg-card shadow-card">
            {activity.map((m) => (
              <div key={m.id} className="flex flex-col gap-1 px-4 py-3 text-sm md:flex-row md:items-center md:gap-4">
                <span className="tabular w-32 shrink-0 text-xs text-muted-foreground">{formatDateTime(m.sent_at ?? m.created_at)}</span>
                <span className="w-56 shrink-0 truncate">{m.to_email}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{m.subject}</span>
                <span className="flex items-center gap-2">
                  {m.is_test && <span className="eyebrow">test</span>}
                  <DeliveryBadge status={m.status} />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
