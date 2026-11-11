import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, formatDateTime } from "@/components/app/page";
import { supabase } from "@/integrations/supabase/client";
import { isValidEmail, normalizeEmail } from "@/lib/email-utils";
import { suppressionsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/suppression")({
  head: () => ({
    meta: [
      { title: "Suppression list — DECILE Outreach" },
      { name: "description", content: "Emails that will never be contacted." },
      { property: "og:title", content: "Suppression list — DECILE Outreach" },
      { property: "og:description", content: "Emails that will never be contacted." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(suppressionsQuery());
  },
  component: SuppressionPage,
});

const REASON: Record<string, "danger" | "warning" | "neutral"> = { unsubscribe: "danger", bounce: "warning", complaint: "danger", manual: "neutral" };

function SuppressionPage() {
  const { data: rows } = useSuspenseQuery(suppressionsQuery());
  const qc = useQueryClient();
  const [emails, setEmails] = useState("");
  const [q, setQ] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    const list = [...new Set(emails.split(/[\s,;]+/).map(normalizeEmail).filter(Boolean))];
    const valid = list.filter(isValidEmail);
    if (!valid.length) {
      toast.error("Enter at least one valid email");
      return;
    }
    const { error } = await supabase
      .from("suppressions")
      .upsert(valid.map((email) => ({ email, reason: "manual" })), { onConflict: "owner_id,email", ignoreDuplicates: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("leads").update({ status: "unsubscribed" }).in("email", valid);
    const { data: leadRows } = await supabase.from("leads").select("id").in("email", valid);
    const ids = (leadRows ?? []).map((l) => l.id);
    if (ids.length) {
      await supabase.from("campaign_leads").update({ status: "skipped", error: "On suppression list" }).in("lead_id", ids).eq("status", "queued");
    }
    toast.success(`${valid.length} added${list.length > valid.length ? `, ${list.length - valid.length} invalid ignored` : ""}`);
    setEmails("");
    await qc.invalidateQueries();
  }

  async function remove(id: string) {
    if (!confirm("Remove from the suppression list? This person could be emailed again.")) return;
    const { error } = await supabase.from("suppressions").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries();
  }

  const filtered = rows.filter((r) => !q || r.email.includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Suppression list"
        description="These addresses are never emailed — unsubscribes are added automatically."
      />
      <form onSubmit={add} className="mb-6 flex flex-col gap-2 sm:flex-row">
        <Input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="Add emails, separated by commas or spaces" />
        <Button type="submit">Add to list</Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No suppressed emails">When someone unsubscribes, they'll appear here.</EmptyState>
      ) : (
        <>
          <Input className="mb-3 max-w-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="overflow-hidden rounded-lg border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="hidden md:table-cell">Added</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>{r.email}</div>
                      {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={REASON[r.reason] ?? "neutral"}>{r.reason}</Badge>
                    </TableCell>
                    <TableCell className="tabular hidden text-xs text-muted-foreground md:table-cell">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell>
                      <button onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
