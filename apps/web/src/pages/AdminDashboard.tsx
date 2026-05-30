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
  X,
} from "lucide-react";
import { listAdminDevices } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { ThemeToggle } from "../components/ThemeToggle";
import { playNotificationSound } from "../hooks/useNotificationSound";
import { useSSE } from "../hooks/useSSE";
import { useTheme } from "../theme/ThemeContext";
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

function toneClass(active: boolean, isWhiteTheme: boolean) {
  if (active) return "bg-sky-400/[0.16] text-white ring-1 ring-sky-300/20";
  return isWhiteTheme
    ? "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100";
}

export default function AdminDashboard() {
  const [view, setView] = useState<AdminView>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { user, logout, token } = useAuth();
  const { isWhiteTheme } = useTheme();

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
  const isMoreActive = !mobilePrimaryItems.some((item) => item.id === view);
  const ActiveIcon = activeItem.icon;

  const titleClass = isWhiteTheme ? "text-slate-950" : "text-white";
  const copyClass = isWhiteTheme ? "text-slate-600" : "text-slate-400";
  const faintClass = isWhiteTheme ? "text-slate-500" : "text-slate-500";
  const panelClass = isWhiteTheme
    ? "theme-surface-strong text-slate-900"
    : "surface-dark-strong text-slate-100";
  const softCardClass = isWhiteTheme
    ? "border-slate-200 bg-slate-50/90"
    : "border-white/6 bg-white/[0.03]";
  const ghostButtonClass = isWhiteTheme
    ? "border-slate-200 bg-white/88 text-slate-600 hover:bg-white hover:text-slate-950"
    : "border-white/8 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white";
  const idleIconClass = isWhiteTheme ? "bg-slate-100 text-slate-500" : "bg-white/[0.04] text-slate-400";
  const mobileChromeClass = isWhiteTheme
    ? "border-slate-200/80 bg-white/84"
    : "border-white/8 bg-[#07111c]/82";
  const mobileSummaryClass = isWhiteTheme
    ? "border-slate-200 bg-white/90 shadow-[0_18px_45px_rgba(148,163,184,0.16)]"
    : "border-white/8 bg-[#07111c]/88 shadow-[0_18px_45px_rgba(2,6,23,0.28)]";
  const mobileNavPanelClass = isWhiteTheme
    ? "theme-surface-strong text-slate-900"
    : "surface-dark-strong text-slate-100";
  const overlayClass = isWhiteTheme ? "theme-overlay" : "bg-slate-950/70";

  const navigate = (nextView: AdminView) => {
    setView(nextView);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className={`min-h-screen bg-transparent ${isWhiteTheme ? "text-slate-900" : "text-slate-100"}`}>
      <div className="mx-auto flex min-h-screen max-w-[1720px] lg:px-5">
        <aside className="hidden lg:flex lg:w-[286px] lg:shrink-0 lg:flex-col lg:py-5">
          <div className={`${panelClass} flex h-full flex-col rounded-[32px] px-5 py-5`}>
            <div className="theme-divider flex items-start justify-between border-b pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-500 shadow-lg shadow-sky-500/20">
                  <Sparkles className="h-5 w-5 text-slate-950" strokeWidth={2.4} />
                </div>
                <div>
                  <div className={`text-[11px] uppercase tracking-[0.32em] ${faintClass}`}>
                    RadiusOps
                  </div>
                  <h1 className={`mt-1 text-lg font-semibold tracking-tight ${titleClass}`}>
                    Control Center
                  </h1>
                </div>
              </div>
              <ThemeToggle compact />
            </div>

            <div className={`mt-5 rounded-[26px] border p-4 ${softCardClass}`}>
              <div>
                <div>
                  <div className={`text-[11px] uppercase tracking-[0.28em] ${faintClass}`}>
                    Operator
                  </div>
                  <div className={`mt-2 text-base font-semibold ${titleClass}`}>{operatorName}</div>
                  <div className={`mt-1 flex items-center gap-2 text-xs ${copyClass}`}>
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    {user?.mfaEnabled ? "MFA on" : "Signed in"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex-1 space-y-5 overflow-y-auto pr-1">
              {navGroups.map((group) => (
                <div key={group.title}>
                  <div className={`px-3 text-[11px] uppercase tracking-[0.28em] ${faintClass}`}>
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
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${toneClass(active, isWhiteTheme)}`}
                        >
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                              active ? "bg-sky-300/18 text-sky-200" : idleIconClass
                            }`}
                          >
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{item.label}</div>
                            <div className={`mt-1 text-xs ${faintClass}`}>{item.description}</div>
                          </div>
                          {item.id === "devices" && pendingCount > 0 ? (
                            <span className="rounded-full bg-rose-500 px-2 py-1 text-[10px] font-semibold text-white">
                              {pendingCount > 99 ? "99+" : pendingCount}
                            </span>
                          ) : (
                            <ChevronRight
                              className={`h-4 w-4 transition ${
                                active ? "text-sky-200" : isWhiteTheme ? "text-slate-400" : "text-slate-600"
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
              className={`mt-5 flex items-center justify-between rounded-[24px] border px-4 py-3 transition ${ghostButtonClass}`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isWhiteTheme ? "bg-slate-100 text-slate-500" : "bg-white/[0.05]"}`}>
                  <LogOut className="h-4.5 w-4.5" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Sign out</div>
                  <div className={`text-xs ${faintClass}`}>End operator session</div>
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 ${isWhiteTheme ? "text-slate-400" : "text-slate-600"}`} />
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:px-5 lg:py-5">
          <header className={`sticky top-0 z-30 border-b px-4 py-3 backdrop-blur-2xl lg:hidden safe-top ${mobileChromeClass}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-teal-400 text-slate-950 shadow-lg shadow-sky-500/20">
                  <ActiveIcon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <div className={`text-[11px] uppercase tracking-[0.28em] ${faintClass}`}>
                    RadiusOps
                  </div>
                  <div className={`truncate text-[15px] font-semibold tracking-tight ${titleClass}`}>
                    {activeItem.label}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle compact />
                <button
                  onClick={() => navigate("devices")}
                  className={`relative flex h-10 w-10 items-center justify-center rounded-2xl border transition ${ghostButtonClass}`}
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
                  className={`flex h-10 items-center gap-2 rounded-2xl border px-3 transition ${ghostButtonClass}`}
                >
                  <span className="text-sm font-medium">More</span>
                </button>
              </div>
            </div>
          </header>

          <header className={`${panelClass} hidden rounded-none border-x-0 border-t-0 px-6 pb-5 pt-5 backdrop-blur-2xl lg:block lg:rounded-[32px] lg:border safe-top`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className={`flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] ${faintClass}`}>
                  <span className={`rounded-full border px-2 py-1 text-[10px] tracking-[0.22em] ${isWhiteTheme ? "border-slate-200 bg-white/84 text-slate-600" : "border-white/10 text-slate-300"}`}>
                    Admin
                  </span>
                  <span className="hidden sm:inline">Admin</span>
                </div>
                <div className="mt-3">
                  <h2 className={`text-2xl font-semibold tracking-tight lg:text-[2rem] ${titleClass}`}>
                    {activeItem.label}
                  </h2>
                  <p className={`mt-1 max-w-3xl text-sm text-balance ${copyClass}`}>
                    {activeItem.description}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle />
                <button
                  onClick={() => navigate("devices")}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border transition ${ghostButtonClass}`}
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
                  className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition ${ghostButtonClass}`}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>

          </header>

          <main className="page-enter min-w-0 flex-1 px-4 pb-app-nav pt-4 lg:px-0 lg:pb-0 lg:pt-6">
            <section className="mb-4 lg:hidden">
              <div className={`rounded-[28px] border px-4 py-4 ${mobileSummaryClass}`}>
                <div className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] ${faintClass}`}>
                  <span>Admin</span>
                  <span className={`h-1 w-1 rounded-full ${isWhiteTheme ? "bg-slate-300" : "bg-slate-600"}`} />
                  <span>{operatorName}</span>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className={`text-[1.85rem] font-semibold leading-none tracking-tight ${titleClass}`}>
                      {activeItem.label}
                    </h2>
                    <p className={`mt-2 max-w-[18rem] text-sm leading-6 ${copyClass}`}>
                      {activeItem.description}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {viewComponent(view)}
          </main>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:hidden safe-bottom">
        <div className={`pointer-events-auto mx-auto max-w-xl rounded-[28px] px-2 py-2 ${mobileNavPanelClass}`}>
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
                      : isWhiteTheme
                        ? "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  <span className="truncate text-[11px] font-medium">{item.shortLabel}</span>
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
                  : isWhiteTheme
                    ? "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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
            className={`fixed inset-0 z-40 backdrop-blur-sm lg:hidden ${overlayClass}`}
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 lg:hidden safe-bottom">
            <div className={`${mobileNavPanelClass} mx-auto max-w-xl rounded-[32px] px-4 py-4 card-rise`}>
              <div className="theme-divider flex items-center justify-between border-b pb-4">
                <div>
                  <div className={`text-[11px] uppercase tracking-[0.28em] ${faintClass}`}>
                    Control menu
                  </div>
                  <div className={`mt-1 text-lg font-semibold ${titleClass}`}>{operatorName}</div>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle compact />
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${ghostButtonClass}`}
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-[24px] border px-4 py-4 ${softCardClass}`}>
                    <div className={`text-[11px] uppercase tracking-[0.26em] ${faintClass}`}>
                      Pending
                    </div>
                    <div className={`mt-2 text-2xl font-semibold tabular-nums ${titleClass}`}>
                      {pendingCount}
                    </div>
                  </div>
                  <div className={`rounded-[24px] border px-4 py-4 ${softCardClass}`}>
                    <div className={`text-[11px] uppercase tracking-[0.26em] ${faintClass}`}>
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
                        className={`flex items-center gap-3 rounded-[24px] px-4 py-4 text-left transition ${toneClass(active, isWhiteTheme)}`}
                      >
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                            active ? "bg-sky-300/18 text-sky-200" : idleIconClass
                          }`}
                        >
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{item.label}</div>
                          <div className={`mt-1 text-xs ${faintClass}`}>{item.description}</div>
                        </div>
                        <ChevronRight className={`h-4 w-4 ${isWhiteTheme ? "text-slate-400" : "text-slate-600"}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={logout}
                className={`mt-4 flex w-full items-center justify-between rounded-[24px] border px-4 py-4 transition ${ghostButtonClass}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isWhiteTheme ? "bg-slate-100 text-slate-500" : "bg-white/[0.05]"}`}>
                    <LogOut className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Sign out</div>
                    <div className={`mt-1 text-xs ${faintClass}`}>Close this operator session</div>
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 ${isWhiteTheme ? "text-slate-400" : "text-slate-600"}`} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
