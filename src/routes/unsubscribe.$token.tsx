import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "./index";

export const Route = createFileRoute("/unsubscribe/$token")({
  head: () => ({
    meta: [
      { title: "Unsubscribe — DECILE Media" },
      { name: "description", content: "Stop receiving emails from DECILE Media." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Unsubscribe — DECILE Media" },
      { property: "og:description", content: "Stop receiving emails from DECILE Media." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function confirm() {
    setState("busy");
    try {
      const res = await fetch(`/api/public/unsubscribe?t=${encodeURIComponent(token)}`, { method: "POST" });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-card">
        <Wordmark />
        {state === "done" ? (
          <>
            <h1 className="mt-6 text-2xl font-semibold">You're unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">You won't receive any more emails from us.</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-semibold">Unsubscribe from our emails?</h1>
            <p className="mt-2 text-sm text-muted-foreground">We'll stop emailing this address straight away.</p>
            <Button className="mt-6" variant="signal" onClick={confirm} disabled={state === "busy"}>
              {state === "busy" ? "Unsubscribing…" : "Yes, unsubscribe me"}
            </Button>
            {state === "error" && (
              <p className="mt-3 text-sm text-destructive">Something went wrong. Please try again.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
