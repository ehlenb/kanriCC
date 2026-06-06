import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate({ to: "/dashboard" });
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#eeede8" }}>
      <header className="mx-auto flex max-w-5xl items-center px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="h-5 w-5 rounded-sm"
            style={{ background: "#1a1a18" }}
          />
          <span className="text-base font-semibold tracking-tight">Kanri</span>
        </Link>
      </header>

      <main className="mx-auto max-w-sm px-6 pt-16">
        <h1 className="text-2xl font-semibold tracking-tight font-display">
          {mode === "signin" ? "Sign in to Kanri" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#5f5e5a" }}>
          {mode === "signin"
            ? "Welcome back."
            : "A quiet workspace for your candidates."}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "#5f5e5a" }}>
          {mode === "signin" ? "New to Kanri?" : "Already have an account?"}{" "}
          <button
            onClick={() =>
              setMode(mode === "signin" ? "signup" : "signin")
            }
            className="underline-offset-4 hover:underline"
            style={{ color: "#1a1a18" }}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </main>
    </div>
  );
}
