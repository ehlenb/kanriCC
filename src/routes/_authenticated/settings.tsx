import { useState, useEffect } from "react";
import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { IconMail, IconCheck, IconX, IconPlugConnected } from "@tabler/icons-react";
import { ImportWizard } from "@/components/shared/ImportWizard";
import { EmailTemplatesSection } from "@/components/settings/EmailTemplatesSection";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
  validateSearch: (s: Record<string, unknown>): { code?: string; state?: string } => ({
    code: s.code as string | undefined,
    state: s.state as string | undefined,
  }),
});

type OAuthStatus = {
  outlook: { email: string } | null;
};

function SettingsPage() {
  const { user } = useAuth();
  const search = useSearch({ from: "/_authenticated/settings" });
  const navigate = useNavigate();

  const [status, setStatus] = useState<OAuthStatus>({ outlook: null });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connectingOutlook, setConnectingOutlook] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function fetchStatus() {
    if (!user?.id) return;
    setLoadingStatus(true);
    try {
      const resp = await fetch(`/api/oauth?action=status&recruiter_id=${user.id}`);
      const data = (await resp.json()) as OAuthStatus;
      setStatus(data);
    } catch {
      // silently ignore — not blocking
    } finally {
      setLoadingStatus(false);
    }
  }

  // Handle the Outlook OAuth callback code in the URL
  useEffect(() => {
    if (!search.code || !user?.id) return;

    void (async () => {
      const resp = await fetch("/api/oauth?action=outlook-exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: search.code, recruiter_id: user.id }),
      });
      const data = (await resp.json()) as { email?: string; error?: string };
      if (data.error) {
        toast.error("Could not connect Outlook. Try again.");
      } else {
        toast.success(`Outlook connected: ${data.email ?? ""}`);
        await fetchStatus();
      }
      // Clear OAuth params from URL
      void navigate({ to: "/settings", search: {}, replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.code, user?.id]);

  useEffect(() => {
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function connectOutlook() {
    setConnectingOutlook(true);
    try {
      const resp = await fetch("/api/oauth?action=outlook-connect");
      const data = (await resp.json()) as { url?: string; error?: string };
      if (data.error || !data.url) {
        toast.error("Outlook OAuth is not configured on this server.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Could not start Outlook connection.");
      setConnectingOutlook(false);
    }
  }

  async function disconnect() {
    if (!user?.id) return;
    setDisconnecting("outlook");
    try {
      await fetch("/api/oauth?action=disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "outlook", recruiter_id: user.id }),
      });
      toast.success("Outlook disconnected.");
      await fetchStatus();
    } catch {
      toast.error("Could not disconnect. Try again.");
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-display text-2xl mb-1">Settings</h1>
      <p className="text-[13px] mb-8" style={{ color: "var(--color-ink-60)" }}>
        Manage your account connections and preferences.
      </p>

      {/* Email Connections */}
      <div
        className="p-6"
        style={{ background: "var(--color-white)", border: "1px solid var(--color-ink-15)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <IconMail size={15} style={{ color: "var(--color-ink-60)" }} />
          <h2 className="font-display text-base">Email connections</h2>
        </div>
        <p className="text-[12px] mb-6" style={{ color: "var(--color-ink-60)" }}>
          Connect your mailbox to send AI-drafted emails directly from Kanri. Sent emails are
          logged automatically.
        </p>

        <div className="space-y-4">
          {/* Outlook */}
          <div
            className="flex items-center justify-between p-4"
            style={{ border: "0.5px solid var(--color-ink-15)", background: "var(--color-ink-05)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-[18px] w-[18px] items-center justify-center text-[10px] font-bold"
                style={{ background: "#0078D4", color: "#fff" }}
              >
                O
              </div>
              <div>
                <p className="text-[13px] font-medium">Outlook</p>
                {loadingStatus ? (
                  <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
                    Checking…
                  </p>
                ) : status.outlook ? (
                  <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--color-moss)" }}>
                    <IconCheck size={11} /> Connected as {status.outlook.email}
                  </p>
                ) : (
                  <p className="text-[11px]" style={{ color: "var(--color-ink-30)" }}>
                    Not connected
                  </p>
                )}
              </div>
            </div>
            {status.outlook ? (
              <button
                className="btn btn-ghost btn-sm flex items-center gap-1"
                onClick={() => void disconnect()}
                disabled={disconnecting === "outlook"}
                style={{ color: "var(--color-ink-60)" }}
              >
                <IconX size={12} />
                {disconnecting === "outlook" ? "Disconnecting…" : "Disconnect"}
              </button>
            ) : (
              <button
                className="btn btn-outline btn-sm flex items-center gap-1.5"
                onClick={() => void connectOutlook()}
                disabled={connectingOutlook}
              >
                <IconPlugConnected size={13} />
                {connectingOutlook ? "Connecting…" : "Connect Outlook"}
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] mt-4" style={{ color: "var(--color-ink-30)" }}>
          Kanri stores only a refresh token. Emails are sent from your own account and are visible
          in your Sent folder.
        </p>
      </div>

      <EmailTemplatesSection />

      <div className="mt-6">
        <ImportWizard />
      </div>
    </div>
  );
}
