import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import {
  IconLayoutDashboard,
  IconUsers,
  IconBuilding,
  IconBriefcase,
  IconLogout,
  IconX,
} from "@tabler/icons-react";
import { Component, useEffect } from "react";
import type { ReactNode } from "react";
import { initials } from "@/lib/candidate-utils";
import { BLANK_CANDIDATE_SEARCH } from "@/routes/_authenticated/candidates";
import { useTranslation } from "react-i18next";
import { setLanguage, getLanguage } from "@/i18n";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center gap-4"
          style={{ background: "var(--color-ink-05)" }}
        >
          <h1 className="text-xl font-display" style={{ color: "var(--color-ink)" }}>
            Something went wrong.
          </h1>
          <p className="text-sm font-sans" style={{ color: "var(--color-ink-60)" }}>
            An unexpected error occurred. Please reload the page.
          </p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Route = createFileRoute("/_authenticated")({
  component: AuthedShell,
});

function AuthedShell() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm"
        style={{ color: "var(--color-ink-30)" }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-ink-05)" }}>
      <Sidebar
        onSignOut={async () => {
          await signOut();
          navigate({ to: "/login" });
        }}
        email={user.email ?? ""}
      />
      <main className="ml-52 flex-1 min-w-0">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}

function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = getLanguage();

  function toggle() {
    setLanguage(current === "en" ? "ja" : "en");
  }

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors"
      style={{ color: "var(--color-ink-60)" }}
      title={current === "en" ? "Switch to Japanese" : "Switch to English"}
    >
      <span
        className="font-mono text-[10px] px-1.5 py-0.5"
        style={{
          background: "var(--color-ink-10)",
          color: "var(--color-ink)",
          letterSpacing: "0.05em",
        }}
      >
        {i18n.language === "ja" ? "JP" : "EN"}
      </span>
      <span>{i18n.language === "ja" ? "English" : "日本語"}</span>
    </button>
  );
}

function Sidebar({
  onSignOut,
  email,
}: {
  onSignOut: () => void;
  email: string;
}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isAdvancedSearch = loc.pathname === "/advanced-search";

  const navItems = [
    { to: "/dashboard", icon: IconLayoutDashboard, label: t("nav.dashboard") },
    { to: "/candidates", icon: IconUsers, label: t("nav.candidates") },
    { to: "/clients", icon: IconBuilding, label: t("nav.clients") },
    { to: "/jobs", icon: IconBriefcase, label: t("nav.jobs") },
  ];

  return (
    <aside
      className="fixed inset-y-0 left-0 z-10 flex w-52 flex-col"
      style={{
        background: "var(--color-white)",
        borderRight: "1px solid var(--color-ink-15)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5">
        <div
          className="h-5 w-5"
          style={{ background: "var(--color-ink)" }}
        />
        <span className="text-base font-semibold tracking-tight font-display">Kanri</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-1">
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = loc.pathname === to || (to !== "/dashboard" && loc.pathname.startsWith(to));
          return (
            <Link key={to} to={to}>
              <div
                className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
                style={{
                  background: active ? "rgba(26,26,24,0.07)" : "transparent",
                  color: active ? "var(--color-ink)" : "var(--color-ink-60)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                <Icon size={16} />
                {label}
              </div>
            </Link>
          );
        })}

        {/* Advanced Search entry — only shown when on that route */}
        {isAdvancedSearch && (
          <div
            className="flex items-center justify-between px-3 py-2 text-sm"
            style={{
              background: "rgba(26,26,24,0.07)",
              color: "var(--color-ink)",
            }}
          >
            <span style={{ fontStyle: "italic", fontWeight: 400 }}>{t("nav.advancedSearch")}</span>
            <button
              onClick={() =>
                navigate({ to: "/candidates", search: BLANK_CANDIDATE_SEARCH })
              }
              className="ml-1 transition-colors hover:bg-black/10"
              title={t("common.close")}
            >
              <IconX size={12} />
            </button>
          </div>
        )}
      </nav>

      {/* User + language toggle */}
      <div
        className="p-3"
        style={{ borderTop: "0.5px solid rgba(26,26,24,0.12)" }}
      >
        <div className="flex items-center gap-2 px-2 py-2 mb-1">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
            style={{ background: "var(--color-ink-10)", color: "var(--color-ink)" }}
          >
            {initials(email.split("@")[0] || "U")}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--color-ink)" }}>
            {email}
          </p>
        </div>
        <LanguageToggle />
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-surface-2"
          style={{ color: "var(--color-ink-60)" }}
        >
          <IconLogout size={14} />
          {t("nav.signOut")}
        </button>
      </div>
    </aside>
  );
}
