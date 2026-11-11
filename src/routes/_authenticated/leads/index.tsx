import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Search, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddToCampaignDialog } from "@/components/app/add-to-campaign";
import { AddLeadDialog } from "@/components/app/lead-form";
import { EmptyState, PageHeader, formatDateTime } from "@/components/app/page";
import { LeadStatusBadge } from "@/components/app/status";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_STATUSES } from "@/lib/email-utils";
import { leadsQuery, PAGE_SIZE, type LeadsSearch } from "@/lib/queries";

const SORTS = ["newest", "oldest", "name", "company", "last_contacted"] as const;

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({
    meta: [
      { title: "Leads — DECILE Outreach" },
      { name: "description", content: "Search, filter and manage every lead." },
      { property: "og:title", content: "Leads — DECILE Outreach" },
      { property: "og:description", content: "Search, filter and manage every lead." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): LeadsSearch => ({
    q: typeof s["q"] === "string" && s["q"] ? s["q"] : undefined,
    status: typeof s["status"] === "string" && s["status"] ? s["status"] : undefined,
    sort: SORTS.find((x) => x === s["sort"]),
    page: Number(s["page"]) > 1 ? Number(s["page"]) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(leadsQuery(deps)),
  component: LeadsPage,
});

function LeadsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/leads/" });
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(leadsQuery(search));
  const [q, setQ] = useState(search.q ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? "") !== q) navigate({ search: (p) => ({ ...p, q: q || undefined, page: undefined }) });
    }, 350);
    return () => clearTimeout(t);
  }, [q, search.q, navigate]);

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.has(r.id));

  function toggleAll() {
    const next = new Set(selected);
    if (allOnPage) data.rows.forEach((r) => next.delete(r.id));
    else data.rows.forEach((r) => next.add(r.id));
    setSelected(next);
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selected.size} lead(s)? Their email history will also be removed.`)) return;
    const { error } = await supabase.from("leads").delete().in("id", [...selected]);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    setSelected(new Set());
    qc.invalidateQueries();
  }

  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title="Leads"
        description={`${data.total.toLocaleString()} lead${data.total === 1 ? "" : "s"}${search.status || search.q ? " match your filters" : ""}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              <Plus /> Add lead
            </Button>
            <Button asChild variant="signal">
              <Link to="/leads/import">
                <Upload /> Import CSV / Excel
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, email, company, designation…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select
          value={search.status ?? "all"}
          onValueChange={(v) => navigate({ search: (p) => ({ ...p, status: v === "all" ? undefined : v, page: undefined }) })}
        >
          <SelectTrigger className="md:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.sort ?? "newest"}
          onValueChange={(v) => navigate({ search: (p) => ({ ...p, sort: v === "newest" ? undefined : (v as LeadsSearch["sort"]) }) })}
        >
          <SelectTrigger className="md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="company">Company A–Z</SelectItem>
            <SelectItem value="last_contacted">Recently contacted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-signal/40 bg-signal-soft/50 px-4 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" onClick={() => setCampaignOpen(true)}>
            <Send /> Add to campaign
          </Button>
          <Button size="sm" variant="ghost" onClick={deleteSelected}>
            <Trash2 /> Delete
          </Button>
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {data.rows.length === 0 ? (
        <EmptyState
          title={search.q || search.status ? "No leads match" : "No leads yet"}
          action={
            !search.q && !search.status ? (
              <Button asChild variant="signal">
                <Link to="/leads/import">Import your first list</Link>
              </Button>
            ) : undefined
          }
        >
          {search.q || search.status ? "Try a different search or status." : "Upload a CSV or Excel file, or add leads one by one."}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allOnPage} onCheckedChange={toggleAll} aria-label="Select all on page" />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="hidden lg:table-cell">Designation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Last contacted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(l.id)}
                      onCheckedChange={() => {
                        const next = new Set(selected);
                        if (next.has(l.id)) next.delete(l.id);
                        else next.add(l.id);
                        setSelected(next);
                      }}
                      aria-label={`Select ${l.email}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link to="/leads/$leadId" params={{ leadId: l.id }} className="block hover:text-signal">
                      <div className="font-medium">{[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.email}</div>
                    </Link>
                  </TableCell>
                  <TableCell>{l.company || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{l.designation || "—"}</TableCell>
                  <TableCell>
                    <LeadStatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="tabular hidden text-xs text-muted-foreground md:table-cell">
                    {formatDateTime(l.last_contacted_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="tabular text-muted-foreground">
            Page {data.page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={data.page <= 1}
              onClick={() => navigate({ search: (p) => ({ ...p, page: data.page - 1 > 1 ? data.page - 1 : undefined }) })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={data.page >= pages}
              onClick={() => navigate({ search: (p) => ({ ...p, page: data.page + 1 }) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
      <AddToCampaignDialog
        open={campaignOpen}
        onOpenChange={setCampaignOpen}
        leadIds={[...selected]}
        onDone={() => setSelected(new Set())}
      />
    </>
  );
}
