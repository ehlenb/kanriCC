import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" />;

  return (
    <div
      className="min-h-screen"
      style={{ background: "#eeede8" }}
    >
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div
            className="h-5 w-5 rounded-sm"
            style={{ background: "#1a1a18" }}
          />
          <span className="text-base font-semibold tracking-tight">Kanri</span>
        </div>
        <Link
          to="/login"
          className="text-sm"
          style={{ color: "#5f5e5a" }}
        >
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-20 pb-32">
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: "#888780", letterSpacing: "0.18em" }}
        >
          For boutique recruiters in Japan
        </p>
        <h1
          className="mt-4 text-5xl font-semibold leading-[1.05] tracking-tight"
          style={{ color: "#1a1a18" }}
        >
          The operating system for the recruiter, not the requisition.
        </h1>
        <p
          className="mt-5 text-base leading-relaxed"
          style={{ color: "#5f5e5a" }}
        >
          Kanri holds the relationship context, surfaces intelligence at the
          right moment, and quietly handles the admin — so you can stay in the
          conversation that matters.
        </p>

        <div className="mt-8 flex items-center gap-3">
          <Link
            to="/login"
            className="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium"
            style={{ background: "#1a1a18", color: "#ffffff" }}
          >
            Open Kanri
          </Link>
          <span className="text-sm" style={{ color: "#888780" }}>
            No setup. Sign in and start.
          </span>
        </div>

        <div
          className="mt-20 grid gap-px rounded-xl overflow-hidden md:grid-cols-3"
          style={{ background: "rgba(26,26,24,0.12)" }}
        >
          <Feature
            title="Relationship memory"
            body="Every conversation, every nuance — held for you, not buried in a CRM field."
          />
          <Feature
            title="Right-moment intelligence"
            body="Kanri surfaces the candidate, fact, or follow-up exactly when it matters."
          />
          <Feature
            title="Admin handled"
            body="Notes, summaries, follow-ups — drafted quietly in the background."
          />
        </div>
      </main>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-card p-6">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "#5f5e5a" }}>
        {body}
      </p>
    </div>
  );
}
