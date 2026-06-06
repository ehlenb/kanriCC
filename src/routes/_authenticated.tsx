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
import { useEffect } from "react";
import { initials } from "@/lib/candidate-utils";
import { BLANK_CANDIDATE_SEARCH } from "@/routes/_authenticated/candidates";

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
        style={{ color: "#888780" }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ background: "#eeede8" }}>
      <Sidebar
        onSignOut={async () => {
          await signOut();
          navigate({ to: "/login" });
        }}
        email={user.email ?? ""}
      />
      <main className="ml-52 flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

const navItems = [
  { to: "/dashboard", icon: IconLayoutDashboard, label: "Dashboard" },
  { to: "/candidates", icon: IconUsers, label: "Candidates" },
  { to: "/clients", icon: IconBuilding, label: "Clients" },
  { to: "/jobs", icon: IconBriefcase, label: "Jobs" },
];

function Sidebar({
  onSignOut,
  email,
}: {
  onSignOut: () => void;
  email: string;
}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const isAdvancedSearch = loc.pathname === "/advanced-search";

  return (
    <aside
      className="fixed inset-y-0 left-0 z-10 flex w-52 flex-col"
      style={{
        background: "#f5f5f3",
        borderRight: "0.5px solid rgba(26,26,24,0.12)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5">
        <div
          className="h-5 w-5"
          style={{ background: "#1a1a18" }}
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
                className="flex items-center gap-2.5  px-3 py-2 text-sm transition-colors"
                style={{
                  background: active
                    ? "rgba(26,26,24,0.07)"
                    : "transparent",
                  color: active ? "#1a1a18" : "#5f5e5a",
                  fontWeight: active ? 500 : 400,
                }}
              >
                <Icon size={16} />
                {label}
              </div>
            </Link>
          );
        })}

        {/* Temporary Advanced Search entry — only shown when on that route */}
        {isAdvancedSearch && (
          <div
            className="flex items-center justify-between  px-3 py-2 text-sm"
            style={{
              background: "rgba(26,26,24,0.07)",
              color: "#1a1a18",
            }}
          >
            <span style={{ fontStyle: "italic", fontWeight: 400 }}>Advanced Search</span>
            <button
              onClick={() =>
                navigate({ to: "/candidates", search: BLANK_CANDIDATE_SEARCH })
              }
              className="ml-1 rounded p-0.5 transition-colors hover:bg-black/10"
              title="Close Advanced Search"
            >
              <IconX size={12} />
            </button>
          </div>
        )}
      </nav>

      {/* User */}
      <div
        className="p-3"
        style={{ borderTop: "0.5px solid rgba(26,26,24,0.12)" }}
      >
        <div className="flex items-center gap-2  px-2 py-2 mb-1">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
            style={{ background: "#eeede8", color: "#1a1a18" }}
          >
            {initials(email.split("@")[0] || "U")}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs" style={{ color: "#1a1a18" }}>
            {email}
          </p>
        </div>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2  px-3 py-2 text-xs transition-colors hover:bg-surface-2"
          style={{ color: "#5f5e5a" }}
        >
          <IconLogout size={14} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
