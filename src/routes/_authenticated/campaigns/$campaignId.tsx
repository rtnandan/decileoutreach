import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, Pause, Play, Send, ShieldCheck, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, StatCard, downloadCsv, formatDateTime } from "@/components/app/page";
import { AccountStatusBadge, CampaignStatusBadge, DeliveryBadge, LeadStatusBadge } from "@/components/app/status";
import { supabase } from "@/integrations/supabase/client";
import { composeEmail } from "@/lib/compose";
import { LEAD_STATUSES, missingVariables, STANDARD_VARIABLES, toCsv, type LeadLike } from "@/lib/email-utils";
import { sendNextBatchNow, sendTestEmail } from "@/lib/mail.functions";
import { accountsQuery, campaignQuery, campaignRecipientsQuery, settingsQuery, type CampaignWithStats } from "@/lib/queries";
import { RUNS_PER_HOUR, SENDS_PER_RUN } from "@/lib/sending-rules";

export const Route = createFileRoute("/_authenticated/campaigns/$campaignId")({
  head: () => ({
    meta: [
      { title: "Campaign — DECILE Outreach" },
      { name: "description", content: "Write, preview, approve and track a campaign." },
      { property: "og:title", content: "Campaign — DECILE Outreach" },
      { property: "og:description", content: "Write, preview, approve and track a campaign." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(campaignQuery(params.campaignId)),
      context.queryClient.ensureQueryData(accountsQuery()),
      context.queryClient.ensureQueryData(settingsQuery()),
      context.queryClient.ensureQueryData(campaignRecipientsQuery(params.campaignId)),
    ]);
  },
  component: CampaignPage,
});

type Recipient = {
  id: string;
  status: string;
  sent_at: string | null;
  error: string | null;
  leads: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    company: string;
    designation: string;
    industry: string;
    status: string;
    custom_fields: unknown;
  } | null;
};

function toLead(r: Recipient["leads"]): LeadLike {
  if (!r) return {};
  return { ...r, custom_fields: (r.custom_fields ?? {}) as Record<string, unknown> };
}

function CampaignPage() {
  const { campaignId } = Route.useParams();
  const { data: campaign } = useSuspenseQuery(campaignQuery(campaignId));
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const { data: recipients } = useSuspenseQuery(campaignRecipientsQuery(campaignId));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runNow = useServerFn(sendNextBatchNow);
  const [approveOpen, setApproveOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const editable = campaign.status === "draft" || campaign.status === "paused";
  const campaignAccounts = accounts.filter((a) => campaign.account_ids.includes(a.id));

  async function update(patch: Partial<Pick<CampaignWithStats, "status" | "name" | "subject" | "body" | "daily_limit" | "account_ids">>) {
    const { error } = await supabase.from("campaigns").update(patch).eq("id", campaign.id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await qc.invalidateQueries();
    return true;
  }

  async function sendBatch() {
    setRunning(true);
    try {
      const r = await runNow();
      toast.success(`Batch done: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed`, {
        description: r.notes.length ? r.notes.join(" · ") : undefined,
      });
      await qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function exportCsv() {
    const rows = (recipients as Recipient[]).map((r) => ({
      email: r.leads?.email ?? "",
      first_name: r.leads?.first_name ?? "",
      last_name: r.leads?.last_name ?? "",
      company: r.leads?.company ?? "",
      designation: r.leads?.designation ?? "",
      industry: r.leads?.industry ?? "",
      lead_status: r.leads?.status ?? "",
      send_status: r.status,
      sent_at: r.sent_at ?? "",
      error: r.error ?? "",
    }));
    downloadCsv(`${campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report.csv`, toCsv(rows));
  }

  async function remove() {
    if (!confirm("Delete this campaign? Sent-email history stays on each lead.")) return;
    const { error } = await supabase.from("campaigns").delete().eq("id", campaign.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries();
    navigate({ to: "/campaigns" });
  }

  return (
    <>
      <Link to="/campaigns" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Campaigns
      </Link>
      <PageHeader
        eyebrow="Campaign"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {campaign.name} <CampaignStatusBadge status={campaign.status} />
          </span>
        }
        description={
          campaign.approved_at
            ? `Approved ${formatDateTime(campaign.approved_at)} · up to ${campaign.daily_limit}/day`
            : "Not approved yet — nothing will be sent until you approve it."
        }
        actions={
          <>
            {campaign.status === "draft" && (
              <Button variant="signal" onClick={() => setApproveOpen(true)}>
                <ShieldCheck /> Review & approve
              </Button>
            )}
            {campaign.status === "active" && (
              <>
                <Button variant="outline" onClick={sendBatch} disabled={running}>
                  <Zap /> {running ? "Sending…" : "Send next batch now"}
                </Button>
                <Button variant="outline" onClick={() => update({ status: "paused" })}>
                  <Pause /> Pause
                </Button>
              </>
            )}
            {campaign.status === "paused" && (
              <Button variant="signal" onClick={() => (campaign.approved_at ? update({ status: "active" }) : setApproveOpen(true))}>
                <Play /> Resume
              </Button>
            )}
            <Button variant="outline" onClick={exportCsv}>
              <Download /> Export CSV
            </Button>
            {campaign.status !== "active" && (
              <Button variant="ghost" size="icon" onClick={remove} aria-label="Delete campaign">
                <Trash2 />
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Recipients" value={campaign.stats.total} />
        <StatCard label="Queued" value={campaign.stats.queued + campaign.stats.sending} />
        <StatCard label="Sent" value={campaign.stats.sent} emphasis />
        <StatCard label="Failed" value={campaign.stats.failed} />
        <StatCard label="Skipped" value={campaign.stats.skipped} hint="Unsubscribed, bounced or duplicate" />
      </div>

      {campaign.status === "active" && (
        <p className="mt-3 text-xs text-muted-foreground">
          The sender sends {SENDS_PER_RUN} email every minute (~{SENDS_PER_RUN * RUNS_PER_HOUR}/hour), within each account's daily limit.
        </p>
      )}

      <Tabs defaultValue="email" className="mt-8">
        <TabsList>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="recipients">Recipients ({campaign.stats.total})</TabsTrigger>
          <TabsTrigger value="settings">Sending</TabsTrigger>
        </TabsList>
        <TabsContent value="email" className="mt-6">
          <EmailEditor
            key={campaign.updated_at}
            campaign={campaign}
            editable={editable}
            signature={settings?.signature ?? ""}
            recipients={recipients as Recipient[]}
            accounts={campaignAccounts.length ? campaignAccounts : accounts}
            onSave={(p) => update(p)}
          />
        </TabsContent>
        <TabsContent value="recipients" className="mt-6">
          <RecipientsPanel campaign={campaign} />
        </TabsContent>
        <TabsContent value="settings" className="mt-6">
          <SendingSettings key={campaign.updated_at} campaign={campaign} accounts={accounts} editable={editable} onSave={(p) => update(p)} />
        </TabsContent>
      </Tabs>

      <ApproveDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        campaign={campaign}
        accounts={campaignAccounts}
        signature={settings?.signature ?? ""}
        firstRecipient={(recipients as Recipient[]).find((r) => r.status === "queued") ?? null}
        isFirstEver={!settings?.first_campaign_approved_at}
      />
    </>
  );
}

function EmailEditor({
  campaign,
  editable,
  signature,
  recipients,
  accounts,
  onSave,
}: {
  campaign: CampaignWithStats;
  editable: boolean;
  signature: string;
  recipients: Recipient[];
  accounts: { id: string; email: string }[];
  onSave: (p: { subject: string; body: string }) => Promise<boolean>;
}) {
  const [subject, setSubject] = useState(campaign.subject);
  const [body, setBody] = useState(campaign.body);
  const [previewId, setPreviewId] = useState<string>(recipients[0]?.id ?? "sample");
  const [testTo, setTestTo] = useState("");
  const [testAccount, setTestAccount] = useState(accounts[0]?.id ?? "");
  const [testing, setTesting] = useState(false);
  const sendTest = useServerFn(sendTestEmail);
  const dirty = subject !== campaign.subject || body !== campaign.body;

  const sample: LeadLike = { first_name: "Priya", last_name: "Sharma", company: "Acme Media", designation: "Marketing Head", industry: "FMCG", email: "priya@acme.com", custom_fields: {} };
  const previewRecipient = recipients.find((r) => r.id === previewId);
  const previewLead = previewRecipient ? toLead(previewRecipient.leads) : sample;
  const preview = composeEmail({ subject, body, signature, lead: previewLead, optOut: true });
  const missing = [...new Set([...missingVariables(subject, previewLead), ...missingVariables(body, previewLead)])];

  const customKeys = useMemo(() => {
    const keys = new Set<string>();
    recipients.slice(0, 50).forEach((r) => Object.keys((r.leads?.custom_fields ?? {}) as Record<string, unknown>).forEach((k) => keys.add(k)));
    return [...keys];
  }, [recipients]);

  function insertVar(v: string) {
    setBody((b) => `${b}{{${v}}}`);
  }

  async function test() {
    if (!testTo || !testAccount) return;
    if (dirty) {
      const ok = await onSave({ subject, body });
      if (!ok) return;
    }
    setTesting(true);
    const res = await sendTest({
      data: { campaignId: campaign.id, accountId: testAccount, to: testTo, leadId: previewRecipient?.leads?.id ?? null },
    });
    setTesting(false);
    if (res.ok) toast.success(`Test email sent to ${testTo}`);
    else toast.error(res.error);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {!editable && (
          <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm">Pause the campaign to edit the email.</div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!editable} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="body">Email</Label>
          <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} disabled={!editable} rows={14} className="font-sans leading-relaxed" />
        </div>
        <div>
          <div className="eyebrow mb-2">Insert a detail</div>
          <div className="flex flex-wrap gap-1.5">
            {[...STANDARD_VARIABLES, ...customKeys].map((v) => (
              <button
                key={v}
                type="button"
                disabled={!editable}
                onClick={() => insertVar(v)}
                className="tabular rounded border bg-card px-2 py-1 text-xs hover:border-signal hover:text-signal disabled:opacity-50"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Add a fallback for empty values like {"{{first_name|there}}"}. Your signature and a short "reply unsubscribe" line are added automatically.
          </p>
        </div>
        {editable && (
          <Button onClick={() => onSave({ subject, body })} disabled={!dirty}>
            {dirty ? "Save email" : "Saved"}
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="eyebrow">Preview for</span>
          <Select value={previewId} onValueChange={setPreviewId}>
            <SelectTrigger className="h-8 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sample">Sample lead (Priya, Acme Media)</SelectItem>
              {recipients.slice(0, 100).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {[r.leads?.first_name, r.leads?.last_name].filter(Boolean).join(" ") || r.leads?.email} · {r.leads?.company || "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <article className="rounded-lg border bg-card p-5 shadow-card">
          <div className="border-b pb-3 text-sm">
            <div className="text-xs text-muted-foreground">To: {previewLead.email || "—"}</div>
            <div className="mt-1 font-semibold">{preview.subject || "(no subject)"}</div>
          </div>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">{preview.body}</pre>
        </article>
        {missing.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              This lead has no {missing.map((m) => `{{${m}}}`).join(", ")} — it will be left blank. Add a fallback like {"{{industry|your industry}}"}.
            </span>
          </div>
        )}
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="text-sm font-medium">Send a test to yourself</div>
          <p className="mt-1 text-xs text-muted-foreground">Uses the lead shown in the preview. Test emails don't count towards the campaign.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input type="email" placeholder="you@decile.media" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            {accounts.length > 1 && (
              <Select value={testAccount} onValueChange={setTestAccount}>
                <SelectTrigger className="sm:w-56">
                  <SelectValue placeholder="From" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" onClick={test} disabled={!testTo || !testAccount || testing}>
              <Send /> {testing ? "Sending…" : "Send test"}
            </Button>
          </div>
          {!accounts.length && (
            <p className="mt-2 text-xs text-destructive">
              No sending account yet — <Link to="/accounts" className="underline">add one</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RecipientsPanel({ campaign }: { campaign: CampaignWithStats }) {
  const [filter, setFilter] = useState<string>("all");
  const [statuses, setStatuses] = useState<string[]>(["not_contacted"]);
  const [skipContacted, setSkipContacted] = useState(true);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery(campaignRecipientsQuery(campaign.id, filter === "all" ? undefined : filter));
  const recipients = rows as Recipient[];

  async function addLeads() {
    setBusy(true);
    const { data, error } = await supabase.rpc("enroll_leads", {
      _campaign_id: campaign.id,
      _statuses: statuses,
      _skip_contacted: skipContacted,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${Number(data ?? 0)} recipients added`);
    await qc.invalidateQueries();
  }

  async function removeQueued(id: string) {
    const { error } = await supabase.from("campaign_leads").delete().eq("id", id).eq("status", "queued");
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="h-fit rounded-lg border bg-card p-4 shadow-card">
        <div className="font-medium">Add recipients</div>
        <p className="mt-1 text-xs text-muted-foreground">Add every lead with these statuses. You can also pick leads one by one on the Leads page.</p>
        <div className="mt-3 space-y-2">
          {LEAD_STATUSES.filter((s) => s.value !== "unsubscribed" && s.value !== "bounced").map((s) => (
            <label key={s.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={statuses.includes(s.value)}
                onCheckedChange={(v) => setStatuses(v === true ? [...statuses, s.value] : statuses.filter((x) => x !== s.value))}
              />
              {s.label}
            </label>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-2 border-t pt-3 text-sm">
          <Checkbox checked={skipContacted} onCheckedChange={(v) => setSkipContacted(v === true)} className="mt-0.5" />
          <span>Skip leads already emailed or queued in another campaign</span>
        </label>
        <Button className="mt-4 w-full" onClick={addLeads} disabled={!statuses.length || busy}>
          {busy ? "Adding…" : "Add matching leads"}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Unsubscribed, bounced and suppressed emails are always left out. Nobody is added twice.</p>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All recipients</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">Showing up to 500 · export CSV for the full list</span>
        </div>
        {recipients.length === 0 ? (
          <EmptyState title="No recipients">Add leads on the left to queue them for this campaign.</EmptyState>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead className="hidden md:table-cell">Lead status</TableHead>
                  <TableHead>Send</TableHead>
                  <TableHead className="hidden md:table-cell">Sent</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.leads ? (
                        <Link to="/leads/$leadId" params={{ leadId: r.leads.id }} className="hover:text-signal">
                          <div className="font-medium">{[r.leads.first_name, r.leads.last_name].filter(Boolean).join(" ") || r.leads.email}</div>
                          <div className="text-xs text-muted-foreground">{r.leads.email}</div>
                        </Link>
                      ) : (
                        "—"
                      )}
                      {r.error && <div className="mt-1 text-xs text-destructive">{r.error}</div>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{r.leads && <LeadStatusBadge status={r.leads.status} />}</TableCell>
                    <TableCell>
                      <DeliveryBadge status={r.status} />
                    </TableCell>
                    <TableCell className="tabular hidden text-xs text-muted-foreground md:table-cell">{formatDateTime(r.sent_at)}</TableCell>
                    <TableCell>
                      {r.status === "queued" && (
                        <button onClick={() => removeQueued(r.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function SendingSettings({
  campaign,
  accounts,
  editable,
  onSave,
}: {
  campaign: CampaignWithStats;
  accounts: { id: string; email: string; status: string; daily_limit: number; sent_today: number }[];
  editable: boolean;
  onSave: (p: { name: string; daily_limit: number; account_ids: string[] }) => Promise<boolean>;
}) {
  const [name, setName] = useState(campaign.name);
  const [limit, setLimit] = useState(String(campaign.daily_limit));
  const [ids, setIds] = useState<string[]>(campaign.account_ids);
  const limitNum = Math.round(Number(limit));
  const valid = name.trim() && limitNum >= 1 && limitNum <= 5000;

  return (
    <div className="max-w-2xl space-y-6">
      {!editable && <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm">Pause the campaign to change these settings.</div>}
      <div className="space-y-1.5">
        <Label htmlFor="cname">Campaign name</Label>
        <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="limit">Campaign daily limit</Label>
        <Input id="limit" type="number" min={1} max={5000} value={limit} onChange={(e) => setLimit(e.target.value)} disabled={!editable} className="w-40" />
        <p className="text-xs text-muted-foreground">Each sending account's own daily limit always applies too — the lower one wins.</p>
      </div>
      <div>
        <Label>Send from</Label>
        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No sending accounts yet. <Link to="/accounts" className="underline">Add one</Link>.
          </p>
        ) : (
          <div className="mt-2 divide-y rounded-lg border bg-card">
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Checkbox
                  checked={ids.includes(a.id)}
                  disabled={!editable}
                  onCheckedChange={(v) => setIds(v === true ? [...ids, a.id] : ids.filter((x) => x !== a.id))}
                />
                <span className="flex-1">{a.email}</span>
                <span className="tabular text-xs text-muted-foreground">
                  {a.sent_today}/{a.daily_limit} today
                </span>
                <AccountStatusBadge status={a.status} />
              </label>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">With more than one account, emails rotate between them.</p>
      </div>
      {editable && (
        <Button disabled={!valid} onClick={() => onSave({ name: name.trim(), daily_limit: limitNum, account_ids: ids })}>
          Save settings
        </Button>
      )}
    </div>
  );
}

function ApproveDialog({
  open,
  onOpenChange,
  campaign,
  accounts,
  signature,
  firstRecipient,
  isFirstEver,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign: CampaignWithStats;
  accounts: { id: string; email: string; status: string; daily_limit: number }[];
  signature: string;
  firstRecipient: Recipient | null;
  isFirstEver: boolean;
}) {
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const activeAccounts = accounts.filter((a) => a.status === "active");
  const queued = campaign.stats.queued;
  const checks = [
    { ok: !!campaign.subject.trim() && !!campaign.body.trim(), label: "Subject and email written" },
    { ok: activeAccounts.length > 0, label: "At least one healthy sending account selected" },
    { ok: queued > 0, label: `Recipients queued (${queued})` },
  ];
  const ready = checks.every((c) => c.ok) && confirmed;
  const preview = firstRecipient
    ? composeEmail({ subject: campaign.subject, body: campaign.body, signature, lead: toLead(firstRecipient.leads), optOut: true })
    : null;
  const perDay = Math.min(campaign.daily_limit, activeAccounts.reduce((t, a) => t + a.daily_limit, 0));

  async function approve() {
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("campaigns")
      .update({ status: "active", approved_at: now, started_at: campaign.started_at ?? now })
      .eq("id", campaign.id);
    if (!error && isFirstEver) {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) await supabase.from("app_settings").upsert({ owner_id: u.user.id, first_campaign_approved_at: now });
    }
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Approved — sending starts within a minute");
    onOpenChange(false);
    await qc.invalidateQueries();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review & approve</DialogTitle>
          <DialogDescription>
            {isFirstEver
              ? "This is your first campaign. Please check everything carefully — nothing goes out until you approve."
              : "Nothing goes out until you approve."}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm">
          {checks.map((c) => (
            <li key={c.label} className={c.ok ? "text-foreground" : "text-destructive"}>
              {c.ok ? "✓" : "✗"} {c.label}
            </li>
          ))}
        </ul>
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          {queued} emails · up to <span className="tabular">{perDay}</span> per day · from {activeAccounts.map((a) => a.email).join(", ") || "—"}
        </div>
        {preview && (
          <article className="max-h-64 overflow-auto rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">First email · to {firstRecipient?.leads?.email}</div>
            <div className="mt-1 font-semibold">{preview.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{preview.body}</pre>
          </article>
        )}
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
          <span>I've reviewed this email and approve sending it to {queued} people.</span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="signal" onClick={approve} disabled={!ready || busy}>
            {busy ? "Approving…" : "Approve & start sending"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
