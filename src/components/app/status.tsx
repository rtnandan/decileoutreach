import { Badge } from "@/components/ui/badge";
import { leadStatusMeta } from "@/lib/email-utils";
import { replyCategoryMeta } from "@/lib/replies";

export function LeadStatusBadge({ status }: { status: string }) {
  const m = leadStatusMeta(status);
  return <Badge variant={m.tone}>{m.label}</Badge>;
}

const CAMPAIGN: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "info" }> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Sending", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "info" },
};
export function CampaignStatusBadge({ status }: { status: string }) {
  const m = CAMPAIGN[status] ?? { label: "Draft", tone: "neutral" as const };
  return <Badge variant={m.tone}>{m.label}</Badge>;
}

const RECIPIENT: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "info" | "danger" }> = {
  queued: { label: "Queued", tone: "neutral" },
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "warning" },
  pending: { label: "Pending", tone: "neutral" },
  bounced: { label: "Bounced", tone: "danger" },
  received: { label: "Received", tone: "info" },
};
export function DeliveryBadge({ status }: { status: string }) {
  const m = RECIPIENT[status] ?? { label: "Queued", tone: "neutral" as const };
  return <Badge variant={m.tone}>{m.label}</Badge>;
}

const ACCOUNT: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  active: { label: "Healthy", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  error: { label: "Needs attention", tone: "danger" },
  rate_limited: { label: "Limit reached", tone: "warning" },
};
export function AccountStatusBadge({ status }: { status: string }) {
  const m = ACCOUNT[status] ?? { label: "Healthy", tone: "success" as const };
  return <Badge variant={m.tone}>{m.label}</Badge>;
}

export function ReplyCategoryBadge({ category }: { category: string | null | undefined }) {
  const m = replyCategoryMeta(category);
  if (!m) return <Badge variant="neutral">Sorting…</Badge>;
  return <Badge variant={m.tone}>{m.label}</Badge>;
}
