import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, StatCard } from "@/components/app/page";
import { supabase } from "@/integrations/supabase/client";
import { classifyImportRows, normalizeEmail } from "@/lib/email-utils";
import { guessTarget, IMPORT_TARGETS, mapRow, type ImportTarget, type MappedLead } from "@/lib/import-mapping";

export const Route = createFileRoute("/_authenticated/leads/import")({
  head: () => ({
    meta: [
      { title: "Import leads — DECILE Outreach" },
      { name: "description", content: "Upload leads from a CSV or Excel file." },
      { property: "og:title", content: "Import leads — DECILE Outreach" },
      { property: "og:description", content: "Upload leads from a CSV or Excel file." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

const MAX_ROWS = 20000;

async function fetchExisting(table: "leads" | "suppressions", emails: string[]) {
  const found = new Set<string>();
  for (let i = 0; i < emails.length; i += 200) {
    const { data, error } = await supabase.from(table).select("email").in("email", emails.slice(i, i + 200));
    if (error) throw new Error(error.message);
    data?.forEach((r) => found.add(r.email));
  }
  return found;
}

function ImportPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, ImportTarget>>({});
  const [check, setCheck] = useState<null | (ReturnType<typeof classifyImportRows<MappedLead>> & { suppressed: Set<string> })>(null);
  const [busy, setBusy] = useState<"" | "reading" | "checking" | "importing">("");
  const [progress, setProgress] = useState(0);

  async function onFile(file: File) {
    setBusy("reading");
    setCheck(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      if (!json.length) throw new Error("The file has no rows");
      if (json.length > MAX_ROWS) throw new Error(`Please split the file — max ${MAX_ROWS.toLocaleString()} rows at a time`);
      const hs = Object.keys(json[0]);
      const m: Record<string, ImportTarget> = {};
      hs.forEach((h) => (m[h] = guessTarget(h)));
      setFileName(file.name);
      setHeaders(hs);
      setRows(json);
      setMapping(m);
    } catch (e) {
      toast.error((e as Error).message || "Couldn't read that file");
    } finally {
      setBusy("");
    }
  }

  const mapped = useMemo(() => rows.map((r, i) => mapRow(r, mapping, i)), [rows, mapping]);
  const hasEmail = Object.values(mapping).includes("email");

  async function runCheck() {
    setBusy("checking");
    try {
      const emails = [...new Set(mapped.map((m) => normalizeEmail(m.email)).filter(Boolean))];
      const [existing, suppressed] = await Promise.all([fetchExisting("leads", emails), fetchExisting("suppressions", emails)]);
      setCheck({ ...classifyImportRows(mapped, existing), suppressed });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function runImport() {
    if (!check) return;
    setBusy("importing");
    setProgress(0);
    const source = `import:${fileName}`.slice(0, 120);
    const payload = check.valid.map(({ _row, ...l }) => ({
      ...l,
      source,
      status: check.suppressed.has(l.email) ? "unsubscribed" : "not_contacted",
    }));
    let done = 0;
    try {
      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500);
        const { error } = await supabase.from("leads").upsert(chunk, { onConflict: "owner_id,email", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
        done += chunk.length;
        setProgress(Math.round((done / payload.length) * 100));
      }
      toast.success(`${done.toLocaleString()} leads imported`);
      qc.invalidateQueries();
      navigate({ to: "/leads" });
    } catch (e) {
      toast.error(`Import stopped after ${done} leads: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <Link to="/leads" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Leads
      </Link>
      <PageHeader
        eyebrow="Leads · Import"
        title="Import leads"
        description="CSV, XLS or XLSX. We'll match your columns, check every email, and skip duplicates."
      />

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-card px-6 py-10 text-center hover:border-signal/60">
        <FileSpreadsheet className="h-8 w-8 text-signal" />
        <span className="mt-3 font-medium">{fileName || "Choose a file"}</span>
        <span className="mt-1 text-xs text-muted-foreground">
          {busy === "reading" ? "Reading…" : rows.length ? `${rows.length.toLocaleString()} rows found — choose another file to replace` : "First row must contain column names"}
        </span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>

      {headers.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">1. Match columns</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Unrecognised columns are kept as custom fields — use them in emails as {"{{column_name}}"}.
          </p>
          <div className="mt-4 divide-y rounded-lg border bg-card shadow-card">
            {headers.map((h) => (
              <div key={h} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                <div className="min-w-0 md:w-1/3">
                  <div className="truncate font-medium">{h}</div>
                  <div className="truncate text-xs text-muted-foreground">e.g. {String(rows[0]?.[h] ?? "") || "—"}</div>
                </div>
                <Select value={mapping[h]} onValueChange={(v) => { setMapping({ ...mapping, [h]: v as ImportTarget }); setCheck(null); }}>
                  <SelectTrigger className="md:w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPORT_TARGETS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {!hasEmail && <p className="mt-3 text-sm text-destructive">Pick which column holds the email address.</p>}
          <Button className="mt-4" onClick={runCheck} disabled={!hasEmail || !!busy}>
            {busy === "checking" ? "Checking…" : "Check emails & duplicates"}
          </Button>
        </section>
      )}

      {check && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">2. Review</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Ready to import" value={check.valid.length} emphasis />
            <StatCard label="Invalid emails" value={check.invalid.length} />
            <StatCard label="Duplicates in file" value={check.duplicateInFile.length} />
            <StatCard label="Already in leads" value={check.alreadyExists.length} />
          </div>
          {check.suppressed.size > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {check.valid.filter((v) => check.suppressed.has(v.email)).length} of these are on your suppression list and will be
              imported as Unsubscribed (never emailed).
            </p>
          )}
          {check.invalid.length > 0 && (
            <details className="mt-4 rounded-md border bg-card px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">Show invalid rows</summary>
              <ul className="tabular mt-2 max-h-48 space-y-1 overflow-auto text-xs text-muted-foreground">
                {check.invalid.slice(0, 200).map((r) => (
                  <li key={r._row}>
                    Row {r._row}: {r.email || "(empty)"}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {busy === "importing" && <Progress value={progress} className="mt-4 h-2" />}
          <Button className="mt-4" variant="signal" onClick={runImport} disabled={!check.valid.length || !!busy}>
            {busy === "importing" ? `Importing… ${progress}%` : `Import ${check.valid.length.toLocaleString()} leads`}
          </Button>
        </section>
      )}
    </>
  );
}
