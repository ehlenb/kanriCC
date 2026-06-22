/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Outlook Add-in task pane.
 * Rendered inside Outlook's sidebar iframe — no Kanri nav/layout.
 * Loads Office.js, reads the current email, and lets the recruiter
 * log it to a matched candidate or client contact's timeline.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/addin/taskpane")({
  component: TaskpanePage,
});

// ─── Supabase (browser-safe keys) ────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

// ─── Types ────────────────────────────────────────────────────────────────────

type Match =
  | { type: "candidate"; candidateId: string; name: string; nameJapanese: string | null; company: string | null }
  | { type: "client_contact"; contactId: string; clientId: string; name: string; title: string | null; company: string | null };

type EmailData = {
  subject: string;
  fromEmail: string;
  fromName: string;
  body: string;
  sentAt: string;
  webLink: string | null;
};

type AppState =
  | "loading-office"
  | "unauthenticated"
  | "signing-in"
  | "reading-email"
  | "matching"
  | "ready"
  | "logging"
  | "logged"
  | "error";

// ─── Component ────────────────────────────────────────────────────────────────

function TaskpanePage() {
  const [state, setState] = useState<AppState>("loading-office");
  const [error, setError] = useState<string | null>(null);
  const [email, setAuthEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recruiterId, setRecruiterId] = useState<string | null>(null);
  const [emailData, setEmailData] = useState<EmailData | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [loggedUrl, setLoggedUrl] = useState<string | null>(null);

  // ── Load Office.js and initialize ──────────────────────────────────────────
  useEffect(() => {
    // Check if already signed into Kanri
    void supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id ?? null;
      if (userId) setRecruiterId(userId);
    });

    const script = document.createElement("script");
    script.src = "https://appsforoffice.microsoft.com/lib/1.1/hosted/office.js";
    script.onload = () => {
      const win = window as any;
      if (win.Office) {
        win.Office.onReady(() => {
          setState((prev) =>
            prev === "loading-office" ? "reading-email" : prev
          );
        });
      } else {
        // Running outside Outlook (dev browser preview)
        setState("reading-email");
      }
    };
    script.onerror = () => setState("reading-email"); // dev fallback
    document.head.appendChild(script);
  }, []);

  // ── Once Office is ready, check auth and read email ────────────────────────
  useEffect(() => {
    if (state !== "reading-email") return;

    void supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id ?? null;
      if (!userId) {
        setState("unauthenticated");
        return;
      }
      setRecruiterId(userId);
      readEmail();
    });
  }, [state]);

  function readEmail() {
    const win = window as any;
    const item = win.Office?.context?.mailbox?.item;

    if (!item) {
      // Dev mode — use dummy data
      setEmailData({
        subject: "[Dev] Test email",
        fromEmail: "test@example.com",
        fromName: "Test Sender",
        body: "This is a test email body for development.",
        sentAt: new Date().toISOString(),
        webLink: null,
      });
      setState("matching");
      void matchSender("test@example.com");
      return;
    }

    const subject: string = item.subject ?? "(no subject)";
    const fromEmail: string = item.from?.emailAddress ?? "";
    const fromName: string = item.from?.displayName ?? fromEmail;
    const sentAt: string = (item.dateTimeCreated as Date | null)?.toISOString() ?? new Date().toISOString();
    const webLink: string | null = (item as any).webLink ?? null;

    item.body.getAsync("text" as any, (result: any) => {
      const body: string = result.value ?? "";
      setEmailData({ subject, fromEmail, fromName, body, sentAt, webLink });
      setState("matching");
      void matchSender(fromEmail);
    });
  }

  async function matchSender(fromEmail: string) {
    try {
      const resp = await fetch("/api/addin?action=match-sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fromEmail }),
      });
      const json = (await resp.json()) as { match: Match | null; error?: string };
      setMatch(json.match);
      setState("ready");
    } catch {
      setMatch(null);
      setState("ready");
    }
  }

  async function handleSignIn() {
    setState("signing-in");
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.user) {
      setError(authError?.message ?? "Sign-in failed.");
      setState("unauthenticated");
      return;
    }
    setRecruiterId(data.user.id);
    setState("reading-email");
  }

  async function handleLog() {
    if (!emailData || !recruiterId) return;
    setState("logging");

    const payload: Record<string, unknown> = {
      recruiter_id: recruiterId,
      subject: emailData.subject,
      body: emailData.body,
      sent_at: emailData.sentAt,
      from_email: emailData.fromEmail,
      from_name: emailData.fromName,
      outlook_web_link: emailData.webLink,
    };

    if (match?.type === "candidate") {
      payload.candidate_id = match.candidateId;
    } else if (match?.type === "client_contact") {
      payload.client_id = match.clientId;
      payload.contact_id = match.contactId;
    }

    try {
      const resp = await fetch("/api/addin?action=log-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await resp.json()) as { ok?: boolean; error?: string };
      if (json.error) { setError(json.error); setState("error"); return; }
      setLoggedUrl(emailData.webLink);
      setState("logged");
    } catch {
      setError("Could not reach Kanri. Check your connection.");
      setState("error");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.wordmark}>Kanri</span>
        {recruiterId && (
          <button
            style={styles.signOutBtn}
            onClick={() => { void supabase.auth.signOut(); setState("unauthenticated"); setRecruiterId(null); }}
          >
            Sign out
          </button>
        )}
      </div>

      <div style={styles.body}>

        {/* Loading */}
        {(state === "loading-office" || state === "reading-email" || state === "matching") && (
          <p style={styles.muted}>Loading…</p>
        )}

        {/* Sign in */}
        {state === "unauthenticated" || state === "signing-in" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={styles.label}>Sign in to Kanri</p>
            {error && <p style={styles.errorText}>{error}</p>}
            <input
              style={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setAuthEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              style={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              style={styles.primaryBtn}
              onClick={() => void handleSignIn()}
              disabled={state === "signing-in"}
            >
              {state === "signing-in" ? "Signing in…" : "Sign in"}
            </button>
          </div>
        ) : null}

        {/* Ready — show email + match */}
        {(state === "ready" || state === "logging") && emailData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Email summary */}
            <div style={styles.card}>
              <p style={styles.label}>From</p>
              <p style={styles.value}>{emailData.fromName}</p>
              <p style={{ ...styles.muted, marginTop: 1 }}>{emailData.fromEmail}</p>
              <p style={{ ...styles.label, marginTop: 10 }}>Subject</p>
              <p style={styles.value}>{emailData.subject}</p>
            </div>

            {/* Match */}
            {match ? (
              <div style={{ ...styles.card, borderColor: "#27500a", background: "#eaf3de" }}>
                <p style={{ ...styles.label, color: "#27500a" }}>
                  {match.type === "candidate" ? "Candidate" : "Client contact"}
                </p>
                <p style={{ ...styles.value, color: "#27500a" }}>{match.name}</p>
                {match.company && (
                  <p style={{ ...styles.muted, color: "#27500a", marginTop: 1 }}>{match.company}</p>
                )}
              </div>
            ) : (
              <div style={{ ...styles.card, borderColor: "#b8922a", background: "#f0e8d0" }}>
                <p style={{ ...styles.label, color: "#b8922a" }}>No match found</p>
                <p style={{ ...styles.muted, color: "#b8922a" }}>
                  {emailData.fromEmail} is not linked to any candidate or client contact in Kanri.
                </p>
              </div>
            )}

            <button
              style={{
                ...styles.primaryBtn,
                opacity: state === "logging" ? 0.6 : 1,
              }}
              onClick={() => void handleLog()}
              disabled={state === "logging"}
            >
              {state === "logging" ? "Logging…" : match ? "Log to Kanri" : "Log anyway"}
            </button>
          </div>
        )}

        {/* Logged */}
        {state === "logged" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...styles.card, borderColor: "#27500a", background: "#eaf3de" }}>
              <p style={{ ...styles.value, color: "#27500a" }}>Logged to timeline ✓</p>
              <p style={{ ...styles.muted, color: "#27500a", marginTop: 4 }}>
                This email has been added to the activity timeline in Kanri.
              </p>
            </div>
            {loggedUrl && (
              <a href={loggedUrl} target="_blank" rel="noreferrer" style={styles.link}>
                Open email in Outlook →
              </a>
            )}
            <button
              style={styles.ghostBtn}
              onClick={() => { setState("reading-email"); setMatch(null); setEmailData(null); setLoggedUrl(null); }}
            >
              Log another
            </button>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={styles.errorText}>{error}</p>
            <button style={styles.ghostBtn} onClick={() => { setState("reading-email"); setError(null); }}>
              Try again
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Styles (inline — no Tailwind in isolated iframe context) ─────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 13,
    color: "#1a1814",
    background: "#f8f7f5",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "0.5px solid #d9d7d3",
    background: "#1a1814",
  },
  wordmark: {
    fontFamily: "'Shippori Mincho', serif",
    color: "#fdfcfa",
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
  signOutBtn: {
    background: "none",
    border: "none",
    color: "#b8b5b0",
    fontSize: 11,
    cursor: "pointer",
    padding: 0,
  },
  body: {
    flex: 1,
    padding: "16px",
  },
  card: {
    background: "#ffffff",
    border: "0.5px solid #d9d7d3",
    padding: "12px 14px",
  },
  label: {
    fontSize: 10,
    fontFamily: "'DM Mono', monospace",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    color: "#b8b5b0",
    marginBottom: 2,
  },
  value: {
    fontSize: 13,
    fontWeight: 500,
    color: "#1a1814",
  },
  muted: {
    fontSize: 12,
    color: "#6b6760",
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    border: "0.5px solid #d9d7d3",
    background: "#ffffff",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  primaryBtn: {
    width: "100%",
    padding: "10px 16px",
    background: "#1a1814",
    color: "#fdfcfa",
    border: "none",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  ghostBtn: {
    width: "100%",
    padding: "9px 16px",
    background: "none",
    color: "#6b6760",
    border: "0.5px solid #d9d7d3",
    fontSize: 13,
    cursor: "pointer",
  },
  link: {
    fontSize: 13,
    color: "#2c3e6b",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
  errorText: {
    fontSize: 12,
    color: "#a32d2d",
    background: "#fcebeb",
    padding: "8px 12px",
    border: "0.5px solid #a32d2d",
  },
};
