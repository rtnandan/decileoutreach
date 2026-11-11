import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, formatDateTime } from "@/components/app/page";
import { CampaignStatusBadge, DeliveryBadge, LeadStatusBadge } from "@/components/app/status";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_STATUSES } from "@/lib/email-utils";
import { leadQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  head: () => ({
    meta: [
      { title: "Lead — DECILE Outreach" },
      { name: "description", content: "Lead details and full email history." },
      { property: "og:title", content: "Lead — DECILE Outreach" },
      { property: "og:description", content: "Lead details and full email history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(leadQuery(params.leadId)),
  component: LeadPage,
});

const EDITABLE = [
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["company", "Company"],
  ["designation", "Designation"],
  ["industry", "Industry"],
] as const;

function LeadPage() {
  const { leadId } = Route.useParams();
  const { data } = useSuspenseQuery(leadQuery(leadId));
  const { lead, messages, enrolments } = data;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => Object.fromEntries(EDITABLE.map(([k]) => [k, lead[k] ?? ""])));
  const custom = (lead.custom_fields ?? {}) as Record<string, string>;

  async function save() {
    const { error } = await supabase.from("leads").update(form).eq("id", lead.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries();
  }

  async function setStatus(status: string) {
    const { error } = await supabase.from("leads").update({ status }).eq("id", lead.id);
    if (error) return toast.error(error.message);
    if (status === "unsubscribed" || status === "bounced") {
      await supabase.from("campaign_leads").update({ status: "skipped", error: `Lead ${status}` }).eq("lead_id", lead.id).eq("status", "queued");
    }
    qc.invalidateQueries();
  }

  async function suppress() {
    const { error } = await supabase
      .from("suppressions")
      .upsert({ email: lead.email, reason: "manual", note: "Added from lead page" }, { onConflict: "owner_id,email", ignoreDuplicates: true });
    if (error) return toast.error(error.message);
    await setStatus("unsubscribed");
    toast.success("Added to suppression list");
  }

  async function remove() {
    if (!confirm("Delete this lead and its email history?")) return;
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries();
    navigate({ to: "/leads" });
  }

  return (
    <>
      <Link to="/leads" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Leads
      </Link>
      <PageHeader
        eyebrow={lead.company || "Lead"}
        title={[lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email}
        description={lead.email}
        actions={
          <>
            <LeadStatusBadge status={lead.status} />
            <Button variant="outline" size="sm" onClick={suppress} disabled={lead.status === "unsubscribed"}>
              <ShieldOff /> Do not email
            </Button>
            <Button variant="ghost" size="sm" onClick={remove}>
              <Trash2 /> Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <section className="space-y-6">
          <div className="rounded-lg border bg-card p-5 shadow-card">
            <h2 className="text-lg font-semibold">Details</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {EDITABLE.map(([k, label]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={k}>{label}</Label>
                  <Input id={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={lead.status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="mt-4" size="sm" onClick={save}>
              Save details
            </Button>
          </div>

          {Object.keys(custom).length > 0 && (
            <div className="rounded-lg border bg-card p-5 shadow-card">
              <h2 className="text-lg font-semibold">Custom fields</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {Object.entries(custom).map(([k, v]) => (
                  <div key={k} className="flex gap-3">
                    <dt className="tabular w-36 shrink-0 text-xs text-muted-foreground">{`{{${k}}}`}</dt>
                    <dd className="min-w-0 break-words">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="rounded-lg border bg-card p-5 shadow-card">
            <h2 className="text-lg font-semibold">Campaigns</h2>
            {enrolments.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Not in any campaign yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {enrolments.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <Link to="/campaigns/$campaignId" params={{ campaignId: e.campaign_id }} className="truncate hover:text-signal">
                      {e.campaigns?.name}
                    </Link>
                    <span className="flex items-center gap-2">
                      {e.campaigns && <CampaignStatusBadge status={e.campaigns.status} />}
                      <DeliveryBadge status={e.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold">Email history</h2>
          {messages.length === 0 ? (
            <EmptyState title="No emails yet">Emails sent to this lead will appear here.</EmptyState>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <article key={m.id} className="rounded-lg border bg-card p-4 shadow-card">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular">{formatDateTime(m.sent_at ?? m.created_at)}</span>
                    <span>·</span>
                    <span>{m.direction === "outbound" ? `From ${m.from_email}` : `From ${m.to_email}`}</span>
                    {m.campaigns?.name && (
                      <>
                        <span>·</span>
                        <span>{m.campaigns.name}</span>
                      </>
                    )}
                    <span className="ml-auto">
                      <DeliveryBadge status={m.status} />
                    </span>
                  </div>
                  <h3 className="mt-2 font-sans text-base font-semibold">{m.subject}</h3>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-foreground/85">{m.body}</pre>
                  {m.error && <p className="mt-2 text-xs text-destructive">{m.error}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
