import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, formatDateTime } from "@/components/app/page";
import { LeadStatusBadge, ReplyCategoryBadge } from "@/components/app/status";
import { checkRepliesNow, setReplyCategory } from "@/lib/mail.functions";
import { repliesQuery } from "@/lib/queries";
import { REPLY_CATEGORIES, type ReplyCategory } from "@/lib/replies";

type Search = { category?: string | undefined };

export const Route = createFileRoute("/_authenticated/replies")({
  head: () => ({
    meta: [
      { title: "Replies — DECILE Outreach" },
      { name: "description", content: "Every reply from your leads, sorted automatically." },
      { property: "og:title", content: "Replies — DECILE Outreach" },
      { property: "og:description", content: "Every reply from your leads, sorted automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    category: typeof s["category"] === "string" && s["category"] ? s["category"] : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(repliesQuery(deps.category)),
  component: RepliesPage,
});

function RepliesPage() {
  const { category } = Route.useSearch();
  const navigate = useNavigate({ from: "/replies" });
  const qc = useQueryClient();
  const { data: replies } = useSuspenseQuery(repliesQuery(category));
  const check = useServerFn(checkRepliesNow);
  const setCategory = useServerFn(setReplyCategory);
  const [checking, setChecking] = useState(false);

  async function runCheck() {
    setChecking(true);
    try {
      const r = await check();
      const parts = [`${r.newReplies} new ${r.newReplies === 1 ? "reply" : "replies"}`, `${r.classified} sorted`];
      if (r.bounced) parts.push(`${r.bounced} bounced`);
      toast.success(parts.join(" · "));
      if (r.notes.length) toast.warning(r.notes.join("\n").slice(0, 400));
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function change(messageId: string, value: string) {
    try {
      await setCategory({ data: { messageId, category: value as ReplyCategory } });
      toast.success("Updated");
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Replies"
        description="Replies to your campaign emails, checked every 10 minutes and sorted automatically. Change a category if it got one wrong."
        actions={
          <>
            <Select
              value={category ?? "all"}
              onValueChange={(v) => navigate({ search: { category: v === "all" ? undefined : v } })}
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All replies</SelectItem>
                <SelectItem value="unsorted">Not sorted yet</SelectItem>
                {REPLY_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="signal" onClick={runCheck} disabled={checking}>
              <RefreshCw className={checking ? "animate-spin" : undefined} /> {checking ? "Checking…" : "Check replies now"}
            </Button>
          </>
        }
      />

      {replies.length === 0 ? (
        <EmptyState title={category ? "No replies here" : "No replies yet"}>
          When a lead answers one of your campaign emails, it shows up here and on their lead page.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {replies.map((r) => {
            const name = r.leads ? [r.leads.first_name, r.leads.last_name].filter(Boolean).join(" ") : "";
            return (
              <article key={r.id} className="rounded-lg border bg-card p-4 shadow-card">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.lead_id ? (
                        <Link
                          to="/leads/$leadId"
                          params={{ leadId: r.lead_id }}
                          className="font-semibold hover:text-signal"
                        >
                          {name || r.from_email}
                        </Link>
                      ) : (
                        <span className="font-semibold">{r.from_email}</span>
                      )}
                      {r.leads?.company && <span className="text-sm text-muted-foreground">· {r.leads.company}</span>}
                      {r.leads && <LeadStatusBadge status={r.leads.status} />}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      <span className="tabular">{formatDateTime(r.sent_at ?? r.created_at)}</span>
                      <span>· {r.from_email}</span>
                      {r.campaigns?.name && <span>· {r.campaigns.name}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ReplyCategoryBadge category={r.reply_category} />
                    <Select value={r.reply_category ?? ""} onValueChange={(v) => change(r.id, v)}>
                      <SelectTrigger className="h-8 w-44 text-xs" aria-label="Change category">
                        <SelectValue placeholder="Set category" />
                      </SelectTrigger>
                      <SelectContent>
                        {REPLY_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {r.reply_summary && <p className="mt-3 text-sm font-medium text-signal">{r.reply_summary}</p>}
                <h3 className="mt-2 font-sans text-sm font-semibold">{r.subject}</h3>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm text-foreground/85">{r.body}</pre>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
