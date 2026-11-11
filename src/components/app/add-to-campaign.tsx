import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { campaignsQuery } from "@/lib/queries";

export function AddToCampaignDialog({
  open,
  onOpenChange,
  leadIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadIds: string[];
  onDone?: () => void;
}) {
  const { data: campaigns = [] } = useQuery({ ...campaignsQuery(), enabled: open });
  const qc = useQueryClient();
  const [campaignId, setCampaignId] = useState<string>("");
  const [skipContacted, setSkipContacted] = useState(true);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!campaignId) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("enroll_leads", {
      _campaign_id: campaignId,
      _lead_ids: leadIds,
      _skip_contacted: skipContacted,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const added = Number(data ?? 0);
    toast.success(`${added} added`, {
      description: added < leadIds.length ? `${leadIds.length - added} skipped (already added, contacted, unsubscribed or bounced)` : undefined,
    });
    qc.invalidateQueries();
    onOpenChange(false);
    onDone?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {leadIds.length} lead{leadIds.length === 1 ? "" : "s"} to a campaign</DialogTitle>
          <DialogDescription>Unsubscribed, bounced and suppressed leads are always left out.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={skipContacted} onCheckedChange={(v) => setSkipContacted(v === true)} className="mt-0.5" />
            <span>Skip leads already emailed (or queued) in another campaign</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={add} disabled={!campaignId || busy}>
            {busy ? "Adding…" : "Add to campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
