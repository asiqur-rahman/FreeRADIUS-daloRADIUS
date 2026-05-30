import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  BookOpen,
  ChevronRight,
  Cpu,
  FileText,
  Grid2x2,
  Layers3,
  LogOut,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import { listAdminDevices } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { playNotificationSound } from "../hooks/useNotificationSound";
import { useSSE } from "../hooks/useSSE";
import { LiveAdminDocsView } from "../views/LiveAdminDocsView";
import { LiveAuditView } from "../views/LiveAuditView";
import { LiveDeviceApprovalsView } from "../views/LiveDeviceApprovalsView";
import { LiveGroupsView } from "../views/LiveGroupsView";
import { LiveNasView } from "../views/LiveNasView";
import { LiveOperationsOverview } from "../views/LiveOperationsOverview";
import { LiveSessionsView } from "../views/LiveSessionsView";
import { LiveSettingsView } from "../views/LiveSettingsView";
import { LiveUsersView } from "../views/LiveUsersView";

type AdminView =
  | "overview"
  | "users"
  | "devices"
  | "sessions"
  | "groups"
  | "nas"
  | "audit"
  | "docs"
  | "settings";

type NavItem = {
  id: AdminView;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  primaryMobile?: boolean;
};

const navItems: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    shortLabel: "Home",
    description: "Health, alerts, auth",
    icon: Grid2x2,
    primaryMobile: true,
  },
  {
    id: "users",
    label: "Users",
    shortLabel: "Users",
    description: "People and access",
    icon: UsersRound,
    primaryMobile: true,
  },
  {
    id: "devices",
    label: "Approvals",
    shortLabel: "Queue",
    description: "Pending devices",
    icon: Smartphone,
    primaryMobile: true,
  },
  {
    id: "sessions",
    label: "Sessions",
    shortLabel: "Live",
    description: "Live sessions",
    icon: Activity,
    primaryMobile: true,
  },
  {
    id: "groups",
    label: "Groups",
    shortLabel: "Groups",
    description: "Policy and VLANs",
    icon: Layers3,
  },
  {
    id: "nas",
    label: "NAS",
    shortLabel: "NAS",
    description: "APs and clients",
    icon: Cpu,
  },
  {
    id: "audit",
    label: "Audit",
    shortLabel: "Audit",
    description: "History",
    icon: BookOpen,
  },
  {
    id: "docs",
    label: "Docs",
    shortLabel: "Docs",
    description: "Runbooks",
    icon: FileText,
  },
  {
    id: "settings",
    label: "Settings",
    shortLabel: "Settings",
    description: "Platform controls",
    icon: Settings2,
  },
];

const navGroups: Array<{ title: string; items: AdminView[] }> = [
  { title: "Command", items: ["overview", "users", "devices", "sessions"] },
  { title: "Access Control", items: ["groups", "nas"] },
  { title: "Governance", items: ["audit", "docs", "settings"] },
];

function viewComponent(view: AdminView) {
  switch (view) {
    case "overview":
      return <LiveOperationsOverview />;
    case "users":
      return <LiveUsersView />;
    case "devices":
      return <LiveDeviceApprovalsView />;
    case "sessions":
      return <LiveSessionsView />;
    case "groups":
      return <LiveGroupsView />;
    case "nas":
      return <LiveNasView />;
    case "audit":
      return <LiveAuditView />;
    case "docs":
      return <LiveAdminDocsView />;
    case "settings":
      return <LiveSettingsView />;
    default:
      return <LiveOperationsOverview />;
  }
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .map((segment) => segment[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toneClass(active: boolean) {
  return active
    ? "bg-sky-400/[0.16] text-white ring-1 ring-sky-300/20"
    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100";
}

export default function AdminDashboard() {
  const [view, setView] = useState<AdminView>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { user, logout, token } = useAuth();

  const activeItem = useMemo<NavItem>(
    () => navItems.find((item) => item.id === view) ?? navItems[0]!,
    [view],
  );

  const mobilePrimaryItems = useMemo(
    () => navItems.filter((item) => item.primaryMobile),
    [],
  );

  const secondaryItems = useMemo(
    () => navItems.filter((item) => !item.primaryMobile),
    [],
  );

  const refreshPendingCount = useCallback(async () => {
    if (!token) return;
    try {
      const result = await listAdminDevices(token, { status: "pending", pageSize: 1 });
      setPendingCount(result.total ?? result.items.length);
    } catch {
      // Cosmetic badge only.
    }
  }, [token]);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  useSSE(token, {
    "device.pending": () => {
      playNotificationSound();
      void refreshPendingCount();
    },
    "device.decided": () => {
      void refreshPendingCount();
    },
  });

  const operatorName = user?.fullName || user?.username || "Admin Operator";
  const operatorInitials = initialsFor(operatorName);
  const isMoreActive = !mobilePrimaryItems.some((item) => item.id === view);

  const navigate = (nextView: AdminView) => {
    setView(nextView);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1720px] lg:px-5">
        <aside className="hidden lg:flex lg:w-[286px] lg:shrink-0 lg:flex-col lg:py-5">
          <div className="surface-dark-strong flex h-full flex-col rounded-[32px] px-5 py-5">
            <div className="flex items-start justify-between border-b border-white/6 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-500 shadow-lg shadow-sky-500/20">
                  <Sparkles className="h-5 w-5 text-slate-950" strokeWidth={2.4} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500">
                    RadiusOps
                  </div>
                  <h1 className="mt-1 text-lg font-semibold tracking-tight text-white">
                    Control Center
                  </h1>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[26px] border border-white/6 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                    Operator
                  </div>
                  <div className="mt-2 text-base font-semibold text-white">{operatorName}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    {user?.mfaEnabled ? "MFA on" : "Signed in"}
                  </div>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-sm font-semibold text-slate-950">
                  {operatorInitials}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/6 bg-slate-950/60 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Queue
                  </div>
                  <div className="mt-2 text-2xl font-semibold tabular-nums text-white">
                    {pendingCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/6 bg-slate-950/60 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    Plane
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_6px_rgba(74,222,128,0.1)]" />
                      Live
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex-1 space-y-5 overflow-y-auto pr-1">
              {navGroups.map((group) => (
                <div key={group.title}>
                  <div className="px-3 text-[11px] uppercase tracking-[0.28em] text-slate-500">
                    {group.title}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {group.items.map((id) => {
                      const item = navItems.find((entry) => entry.id === id);
                      if (!item) return null;
                      const Icon = item.icon;
                      const active = view === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => navigate(item.id)}
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${toneClass(active)}`}
                        >
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                              active
                                ? "bg-sky-300/18 text-sky-200"
                                : "bg-white/[0.04] text-slate-400"
                            }`}
                          >
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{item.label}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {item.description}
                            </div>
                          </div>
                          {item.id === "devices" && pendingCount > 0 ? (
                            <span className="rounded-full bg-rose-500 px-2 py-1 text-[10px] font-semibold text-white">
                              {pendingCount > 99 ? "99+" : pendingCount}
                            </span>
                          ) : (
                            <ChevronRight
                              className={`h-4 w-4 transition ${
                                active ? "text-sky-200" : "text-slate-600"
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={logout}
              className="mt-5 flex items-center justify-between rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-3 text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.05]">
                  <LogOut className="h-4.5 w-4.5" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Sign out</div>
                  <div className="text-xs text-slate-500">End operator session</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:px-5 lg:py-5">
          <header className="sticky top-0 z-30 border-b border-white/8 bg-[#07111c]/82 px-4 py-3 backdrop-blur-2xl lg:hidden safe-top">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-teal-400 text-slate-950 shadow-lg shadow-sky-500/20">
                  <activeItem.icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                    RadiusOps
                  </div>
                  <div className="truncate text-[15px] font-semibold tracking-tight text-white">
                    {activeItem.label}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => navigate("devices")}
                  className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  title="Device approval queue"
                >
                  <Bell className="h-4.5 w-4.5" />
                  {pendingCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-rose-500 px-1 py-0.5 text-[9px] font-semibold text-white">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="flex h-10 items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.04] px-3 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-xs font-semibold text-slate-950">
                    {operatorInitials}
                  </div>
                  <span className="text-sm font-medium">More</span>
                </button>
              </div>
            </div>
          </header>

          <header className="surface-dark-strong sticky top-0 z-30 hidden rounded-none border-x-0 border-t-0 px-6 pb-5 pt-5 backdrop-blur-2xl lg:block lg:rounded-[32px] lg:border safe-top">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] tracking-[0.22em] text-slate-300">
                    Admin
                  </span>
                  <span className="hidden sm:inline">Admin</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold tracking-tight text-white lg:text-[2rem]">
                      {activeItem.label}
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-400 text-balance">
                      {activeItem.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => navigate("devices")}
                  className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  title="Device approval queue"
                >
                  <Bell className="h-4.5 w-4.5" />
                  {pendingCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-[1.2rem] rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={logout}
                  className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/6 bg-slate-950/45 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                  Queue pressure
                </div>
                <div className="mt-2 flex items-end gap-3">
                  <div className="text-2xl font-semibold tabular-nums text-white">
                    {pendingCount}
                  </div>
                  <div className="pb-1 text-xs text-slate-400">
                    pending
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] border border-white/6 bg-slate-950/45 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                  Session trust
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                  {user?.mfaEnabled ? "MFA on" : "Signed in"}
                </div>
              </div>
              <div className="rounded-[24px] border border-white/6 bg-slate-950/45 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                  Console mode
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-slate-200">
                  <Wifi className="h-4 w-4 text-sky-300" />
                  Live console
                </div>
              </div>
            </div>
          </header>

          <main className="page-enter min-w-0 flex-1 px-4 pb-app-nav pt-4 lg:px-0 lg:pb-0 lg:pt-6">
            <section className="mb-4 lg:hidden">
              <div className="rounded-[28px] border border-white/8 bg-[#07111c]/88 px-4 py-4 shadow-[0_18px_45px_rgba(2,6,23,0.28)]">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
                  <span>Admin</span>
                  <span className="h-1 w-1 rounded-full bg-slate-600" />
                    <span>{operatorName}</span>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[1.85rem] font-semibold leading-none tracking-tight text-white">
                      {activeItem.label}
                    </h2>
                    <p className="mt-2 max-w-[18rem] text-sm leading-6 text-slate-400">
                      {activeItem.description}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-sky-400/15 bg-sky-400/[0.08] px-3 py-2 text-right">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-sky-300">
                      Queue
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {pendingCount}
                    </div>
                  </div>
                </div>

                <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto">
                  <div className="min-w-[9.5rem] rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      Account
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-white">
                      {user?.username || operatorName}
                    </div>
                  </div>
                  <div className="min-w-[9.5rem] rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      Security
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {user?.mfaEnabled ? "MFA on" : "Signed in"}
                    </div>
                  </div>
                  <div className="min-w-[9.5rem] rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                      Console
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
                      <Wifi className="h-3.5 w-3.5 text-sky-300" />
                      Ready
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {viewComponent(view)}
          </main>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:hidden safe-bottom">
        <div className="pointer-events-auto surface-dark-strong mx-auto max-w-xl rounded-[28px] px-2 py-2">
          <div className="grid grid-cols-5 gap-1">
            {mobilePrimaryItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`relative flex min-w-0 flex-col items-center gap-1 rounded-[22px] px-2 py-3 text-center transition ${
                    active
                      ? "bg-sky-400/[0.16] text-white"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  <span className="truncate text-[11px] font-medium">
                    {item.shortLabel}
                  </span>
                  {item.id === "devices" && pendingCount > 0 && (
                    <span className="absolute right-3 top-2 min-w-[1rem] rounded-full bg-rose-500 px-1 py-0.5 text-[9px] font-semibold text-white">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={`relative flex min-w-0 flex-col items-center gap-1 rounded-[22px] px-2 py-3 text-center transition ${
                isMoreActive || mobileMenuOpen
                  ? "bg-sky-400/[0.16] text-white"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
              }`}
            >
              <Settings2 className="h-4.5 w-4.5" />
              <span className="truncate text-[11px] font-medium">More</span>
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <>
          <button
            className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 lg:hidden safe-bottom">
            <div className="surface-dark-strong mx-auto max-w-xl rounded-[32px] px-4 py-4 card-rise">
              <div className="flex items-center justify-between border-b border-white/6 pb-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                    Control menu
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {operatorName}
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-slate-300"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                      Pending
                    </div>
                    <div className="mt-2 text-2xl font-semibold tabular-nums text-white">
                      {pendingCount}
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4">
                    <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                      Security
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-emerald-300">
                      <ShieldCheck className="h-4 w-4" />
                      {user?.mfaEnabled ? "MFA on" : "Signed in"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  {secondaryItems.map((item) => {
                    const Icon = item.icon;
                    const active = view === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(item.id)}
                        className={`flex items-center gap-3 rounded-[24px] px-4 py-4 text-left transition ${toneClass(active)}`}
                      >
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                            active
                              ? "bg-sky-300/18 text-sky-200"
                              : "bg-white/[0.04] text-slate-400"
                          }`}
                        >
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{item.label}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.description}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-600" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={logout}
                className="mt-4 flex w-full items-center justify-between rounded-[24px] border border-white/6 bg-white/[0.03] px-4 py-4 text-slate-200"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05]">
                    <LogOut className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Sign out</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Close this operator session
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
