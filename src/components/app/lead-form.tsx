import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { isValidEmail, normalizeEmail } from "@/lib/email-utils";

const FIELDS = [
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["company", "Company"],
  ["designation", "Designation"],
  ["industry", "Industry"],
] as const;

export function AddLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const email = normalizeEmail(form.email ?? "");
    if (!isValidEmail(email)) return toast.error("Please enter a valid email address");
    setBusy(true);
    const { data: suppressed } = await supabase.from("suppressions").select("id").eq("email", email).maybeSingle();
    const { error } = await supabase.from("leads").insert({
      email,
      first_name: form.first_name?.trim() ?? "",
      last_name: form.last_name?.trim() ?? "",
      company: form.company?.trim() ?? "",
      designation: form.designation?.trim() ?? "",
      industry: form.industry?.trim() ?? "",
      source: "manual",
      status: suppressed ? "unsubscribed" : "not_contacted",
    });
    setBusy(false);
    if (error) {
      return toast.error(error.code === "23505" ? "A lead with this email already exists" : error.message);
    }
    toast.success("Lead added", { description: suppressed ? "This email is on your suppression list, so it won't be emailed." : undefined });
    setForm({});
    qc.invalidateQueries();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a lead</DialogTitle>
          <DialogDescription>Only the email is required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lead-email">Email</Label>
            <Input id="lead-email" type="email" required value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map(([k, label]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`lead-${k}`}>{label}</Label>
                <Input id={`lead-${k}`} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Add lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
