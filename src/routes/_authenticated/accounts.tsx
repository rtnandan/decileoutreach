import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, formatDateTime } from "@/components/app/page";
import { AccountStatusBadge } from "@/components/app/status";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_APP_URL } from "@/lib/compose";
import { syncSendingAccounts } from "@/lib/mail.functions";
import { accountsQuery, settingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Sending accounts — DECILE Outreach" },
      { name: "description", content: "Gmail accounts, daily limits, health and email settings." },
      { property: "og:title", content: "Sending accounts — DECILE Outreach" },
      { property: "og:description", content: "Gmail accounts, daily limits, health and email settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(accountsQuery()),
      context.queryClient.ensureQueryData(settingsQuery()),
    ]);
  },
  component: AccountsPage,
});

type Account = Awaited<ReturnType<NonNullable<ReturnType<typeof accountsQuery>["queryFn"]>>>[number];

function AccountsPage() {
  const { data: accounts } = useSuspenseQuery(accountsQuery());
  const { data: settings } = useSuspenseQuery(settingsQuery());
  const qc = useQueryClient();
  const sync = useServerFn(syncSendingAccounts);
  const [syncing, setSyncing] = useState(false);

  async function runSync() {
    setSyncing(true);
    try {
      const r = await sync();
      const failed = r.results.filter((x) => x.error);
      if (r.found === 0) toast.error("No connected Gmail account found");
      else if (failed.length) toast.error(`${failed.length} account(s) couldn't be reached`, { description: failed[0]?.error });
      else toast.success(`${r.found} account(s) connected and healthy`);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Sending accounts"
        description="The Gmail accounts emails go out from. Each has its own daily limit that's never exceeded."
        actions={
          <Button variant="signal" onClick={runSync} disabled={syncing}>
            <RefreshCw className={syncing ? "animate-spin" : ""} /> {syncing ? "Checking…" : "Find & check accounts"}
          </Button>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="No sending accounts yet"
          action={
            <Button variant="signal" onClick={runSync} disabled={syncing}>
              Find my Gmail account
            </Button>
          }
        >
          Your Gmail is already connected — click below to add it here.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <AccountRow key={`${a.id}-${a.updated_at}`} account={a} />
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Google Workspace allows about 2,000 emails a day per account (personal Gmail about 500). Start low (100–250) for new accounts to protect
        deliverability. To add another Gmail account, ask Lovable to connect one, then click "Find & check accounts".
      </p>

      <SettingsCard key={settings?.updated_at ?? "new"} settings={settings} />
    </>
  );
}

function AccountRow({ account }: { account: Account }) {
  const qc = useQueryClient();
  const [limit, setLimit] = useState(String(account.daily_limit));
  const [fromName, setFromName] = useState(account.from_name);
  const dirty = Number(limit) !== account.daily_limit || fromName !== account.from_name;
  const pct = Math.min(100, (account.sent_today / account.daily_limit) * 100);

  async function save(patch: { daily_limit?: number; from_name?: string; status?: string }) {
    const { error } = await supabase.from("sending_accounts").update(patch).eq("id", account.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    await qc.invalidateQueries();
  }

  const n = Math.round(Number(limit));
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{account.email}</div>
          <div className="text-xs text-muted-foreground">Last checked {formatDateTime(account.last_checked_at)}</div>
        </div>
        <AccountStatusBadge status={account.status} />
        {account.status === "paused" ? (
          <Button size="sm" variant="outline" onClick={() => save({ status: "active" })}>
            Resume
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => save({ status: "paused" })}>
            Pause
          </Button>
        )}
      </div>
      {account.last_error && account.status !== "active" && <p className="mt-2 text-xs text-destructive">{account.last_error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <Progress value={pct} className="h-1.5" />
        <span className="tabular w-32 shrink-0 text-right text-xs text-muted-foreground">
          {account.sent_today}/{account.daily_limit} today
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:w-56">
          <Label htmlFor={`from-${account.id}`}>Sender name</Label>
          <Input id={`from-${account.id}`} value={fromName} placeholder="e.g. Nandan from DECILE" onChange={(e) => setFromName(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:w-36">
          <Label htmlFor={`limit-${account.id}`}>Daily limit</Label>
          <Input id={`limit-${account.id}`} type="number" min={1} max={2000} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <Button size="sm" disabled={!dirty || !(n >= 1 && n <= 2000)} onClick={() => save({ daily_limit: n, from_name: fromName.trim() })}>
          Save
        </Button>
      </div>
    </div>
  );
}

function SettingsCard({
  settings,
}: {
  settings: { app_url: string | null; timezone: string; signature: string } | null;
}) {
  const qc = useQueryClient();
  const [appUrl, setAppUrl] = useState(settings?.app_url ?? "");
  const [timezone, setTimezone] = useState(settings?.timezone ?? "Asia/Kolkata");
  const [signature, setSignature] = useState(settings?.signature ?? "");

  async function save() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      toast.error("Unknown time zone — use a name like Asia/Kolkata");
      return;
    }
    const { error } = await supabase
      .from("app_settings")
      .upsert({ owner_id: u.user.id, app_url: appUrl.trim() || null, timezone: timezone.trim(), signature });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Settings saved");
    await qc.invalidateQueries();
  }

  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold">Email settings</h2>
      <div className="mt-4 max-w-2xl space-y-4 rounded-lg border bg-card p-5 shadow-card">
        <div className="space-y-1.5">
          <Label htmlFor="signature">Signature</Label>
          <Textarea id="signature" rows={4} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={"Nandan T\nDECILE Media"} />
          <p className="text-xs text-muted-foreground">Added under every email. Details like {"{{first_name}}"} work here too.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tz">Time zone for daily limits</Label>
            <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appurl">Unsubscribe link address</Label>
            <Input id="appurl" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder={DEFAULT_APP_URL} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave the unsubscribe address empty to use your published app's address. Publish the app so unsubscribe links work.
        </p>
        <Button onClick={save}>Save settings</Button>
      </div>
    </section>
  );
}
