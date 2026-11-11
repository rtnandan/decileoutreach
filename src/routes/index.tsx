import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DECILE Outreach — personalised email campaigns" },
      { name: "description", content: "Upload leads, send personalised email campaigns in safe daily batches, and track every reply." },
      { property: "og:title", content: "DECILE Outreach" },
      { property: "og:description", content: "Personalised email campaigns, replies and follow-ups for DECILE Media." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <main className="flex min-h-screen flex-col bg-ink text-ink-foreground">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Wordmark />
        <Button asChild variant="signal" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <section className="flex flex-1 flex-col justify-center px-6 pb-24 md:px-12">
        <div className="eyebrow mb-6 text-ink-foreground/60">DECILE Media · Outreach desk</div>
        <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] md:text-7xl">
          Every lead, one <em className="text-signal not-italic">personal</em> email at a time.
        </h1>
        <p className="mt-6 max-w-xl text-base text-ink-foreground/70">
          Upload your list, write once with personal details filled in, approve, and let the sender work through it
          in safe daily batches — without ever emailing someone twice or anyone who opted out.
        </p>
        <div className="mt-10 flex gap-3">
          <Button asChild variant="signal" size="lg">
            <Link to="/auth">Open the desk</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-xl font-semibold tracking-tight ${className}`}>
      DECILE<span className="text-signal">.</span>
    </span>
  );
}
