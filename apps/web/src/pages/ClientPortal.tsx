import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  ChevronRight,
  KeyRound,
  LogOut,
  ShieldCheck,
  Smartphone,
  User,
  Wifi,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { PwaInstallButton } from "../components/PwaInstallButton";
import { ThemeToggle } from "../components/ThemeToggle";
import { useTheme } from "../theme/ThemeContext";
import { LiveConnectionGuideView } from "../views/LiveConnectionGuideView";
import { LivePortalOverview } from "../views/LivePortalOverview";
import { LiveProfileView } from "../views/LiveProfileView";
import { LiveSecurityView } from "../views/LiveSecurityView";
import { LiveWifiCertView } from "../views/LiveWifiCertView";
import { SelfServiceDevices } from "../views/SelfServiceDevices";

type PortalView = "overview" | "devices" | "wifi" | "security" | "profile" | "connect";

type PortalNavItem = {
  id: PortalView;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  primaryMobile?: boolean;
};

const portalItems: PortalNavItem[] = [
  {
    id: "overview",
    label: "Overview",
    shortLabel: "Home",
    description: "Status, sessions, and access",
    icon: Wifi,
    primaryMobile: true,
  },
  {
    id: "devices",
    label: "Devices",
    shortLabel: "Devices",
    description: "Your approved devices",
    icon: Smartphone,
    primaryMobile: true,
  },
  {
    id: "wifi",
    label: "Wi-Fi Certificate",
    shortLabel: "Wi-Fi",
    description: "Wi-Fi certificate setup",
    icon: KeyRound,
    primaryMobile: true,
  },
  {
    id: "security",
    label: "Security",
    shortLabel: "Security",
    description: "Password and MFA",
    icon: ShieldCheck,
    primaryMobile: true,
  },
  {
    id: "profile",
    label: "Profile",
    shortLabel: "Profile",
    description: "Your account",
    icon: User,
  },
  {
    id: "connect",
    label: "Connect Guide",
    shortLabel: "Guide",
    description: "How to connect",
    icon: BookOpen,
  },
];

function renderPortalView(view: PortalView) {
  switch (view) {
    case "overview":
      return <LivePortalOverview />;
    case "devices":
      return <SelfServiceDevices />;
    case "wifi":
      return <LiveWifiCertView />;
    case "security":
      return <LiveSecurityView />;
    case "profile":
      return <LiveProfileView />;
    case "connect":
      return <LiveConnectionGuideView />;
    default:
      return <LivePortalOverview />;
  }
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .map((segment) => segment[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ClientPortal() {
  const [view, setView] = useState<PortalView>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { isWhiteTheme } = useTheme();

  const activeItem = useMemo<PortalNavItem>(
    () => portalItems.find((item) => item.id === view) ?? portalItems[0]!,
    [view],
  );

  const primaryMobileItems = useMemo(
    () => portalItems.filter((item) => item.primaryMobile),
    [],
  );

  const secondaryItems = useMemo(
    () => portalItems.filter((item) => !item.primaryMobile),
    [],
  );

  const fullName = user?.fullName || user?.username || "Portal User";
  const firstName = fullName.split(/\s+/)[0] ?? "User";
  const initials = initialsFor(fullName);
  const greeting = greetingForNow();
  const isMoreActive = !primaryMobileItems.some((item) => item.id === view);

  const navigate = (nextView: PortalView) => {
    setView(nextView);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      className="min-h-screen bg-transparent text-slate-900"
      style={{
        background: isWhiteTheme
          ? "radial-gradient(circle at top left, rgba(14,165,233,0.1), transparent 28%), radial-gradient(circle at 85% 0%, rgba(20,184,166,0.08), transparent 24%), linear-gradient(180deg, #f8fafc 0%, #f1f5f9 48%, #edf2f7 100%)"
          : "radial-gradient(circle at top left, rgba(14,165,233,0.12), transparent 28%), radial-gradient(circle at 85% 0%, rgba(20,184,166,0.1), transparent 24%), linear-gradient(180deg, #f6f8fb 0%, #eef2f7 48%, #e8edf4 100%)",
      }}
    >
      <div className="pointer-events-none fixed inset-0 opacity-[0.35]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(15,23,42,0.08) 1px, transparent 0)",
            backgroundSize: "22px 22px",
            maskImage: "linear-gradient(180deg, rgba(0,0,0,0.55), transparent 92%)",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1660px] flex-col lg:px-5 lg:py-5">
        <div className="surface-light flex min-h-screen flex-1 flex-col rounded-none border-x-0 border-t-0 lg:rounded-[32px] lg:border">
          <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur-2xl lg:hidden safe-top">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 shadow-lg shadow-slate-900/10">
                  <Wifi className="h-4.5 w-4.5 text-white" strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    RadiusOps
                  </div>
                  <div className="truncate text-[15px] font-semibold tracking-tight text-slate-950">
                    {activeItem.label}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <PwaInstallButton compact />
                <ThemeToggle compact />
                <button className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white/85 text-slate-500 transition hover:bg-white hover:text-slate-950">
                  <Bell className="h-4.5 w-4.5" />
                </button>
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-3 text-slate-600 transition hover:bg-white hover:text-slate-950"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-teal-500 text-xs font-semibold text-white">
                    {initials}
                  </div>
                  <span className="text-sm font-medium">More</span>
                </button>
              </div>
            </div>
          </header>

          <header className="sticky top-0 z-30 hidden rounded-none border-b border-slate-200/70 bg-white/70 px-6 pb-5 pt-5 backdrop-blur-2xl lg:block lg:rounded-t-[32px] safe-top">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 shadow-lg shadow-slate-900/10">
                    <Wifi className="h-5 w-5 text-white" strokeWidth={2.4} />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      RadiusOps
                    </div>
                    <div className="mt-1 text-base font-semibold tracking-tight text-slate-950">
                      My Wi-Fi
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm text-slate-500">{greeting},</div>
                  <h1 className="mt-1 text-[2rem] font-semibold leading-tight tracking-tight text-slate-950 font-display">
                    {firstName}.
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-500 text-balance">
                    {activeItem.description}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <PwaInstallButton />
                <ThemeToggle />
                <button className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-slate-500 transition hover:bg-white hover:text-slate-950">
                  <Bell className="h-4.5 w-4.5" />
                </button>
                <button
                  onClick={logout}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 transition hover:bg-white hover:text-slate-950"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-slate-200 bg-white/75 px-4 py-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                  Identity
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-950">
                  {user?.username || fullName}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Personal access
                </div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white/75 px-4 py-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                  Security
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <ShieldCheck className="h-4 w-4" />
                  {user?.mfaEnabled ? "MFA on" : "Protected"}
                </div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white/75 px-4 py-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                  Access mode
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Wifi className="h-4 w-4 text-sky-600" />
                  Enterprise Wi-Fi
                </div>
              </div>
            </div>
          </header>

          <div className="flex flex-1 gap-6 px-4 pb-app-nav pt-4 lg:px-6 lg:pb-6 lg:pt-6">
            <aside className="hidden xl:block xl:w-[300px] xl:shrink-0">
              <div className="sticky top-[11.5rem] space-y-4">
                <div className="app-card-light p-5 card-rise">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-sky-500 to-teal-500 text-base font-semibold text-white">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold text-slate-950">
                        {fullName}
                      </div>
                      <div className="truncate text-sm text-slate-500">
                        {user?.username || "Authenticated user"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    {portalItems.map((item) => {
                      const Icon = item.icon;
                      const active = view === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => navigate(item.id)}
                          className={`flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left transition ${
                            active
                              ? "bg-slate-950 text-white shadow-[0_14px_35px_rgba(15,23,42,0.14)]"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                          }`}
                        >
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                              active ? "bg-white/10 text-white" : "bg-white text-slate-500"
                            }`}
                          >
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{item.label}</div>
                            <div
                              className={`mt-1 text-xs ${
                                active ? "text-slate-300" : "text-slate-500"
                              }`}
                            >
                              {item.description}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="app-card-light p-5 card-rise">
                  <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                    Quick tips
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    <div className="rounded-[22px] bg-slate-50 px-4 py-3">
                      Register the Wi-Fi address used on this network.
                    </div>
                    <div className="rounded-[22px] bg-slate-50 px-4 py-3">
                      Use Wi-Fi certificates for managed devices.
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <main className="page-enter min-w-0 flex-1">
              <section className="mb-4 lg:hidden">
                <div className="rounded-[28px] border border-slate-200 bg-white/88 px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                    <span>{greeting}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span>{user?.username || "Account"}</span>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="text-[1.85rem] font-semibold leading-none tracking-tight text-slate-950 font-display">
                        {firstName}.
                      </h1>
                      <p className="mt-2 max-w-[18rem] text-sm leading-6 text-slate-500">
                        {activeItem.description}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-right">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-sky-600">
                        View
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-950">
                        {activeItem.label}
                      </div>
                    </div>
                  </div>

                  <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto">
                    <div className="min-w-[9.5rem] rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Identity
                      </div>
                      <div className="mt-1 truncate text-sm font-semibold text-slate-950">
                        {user?.username || fullName}
                      </div>
                    </div>
                    <div className="min-w-[9.5rem] rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Security
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {user?.mfaEnabled ? "MFA on" : "Protected"}
                      </div>
                    </div>
                    <div className="min-w-[9.5rem] rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        Access
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                        <Wifi className="h-3.5 w-3.5 text-sky-600" />
                        Ready
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="hide-scrollbar mb-5 hidden gap-2 overflow-x-auto rounded-[28px] border border-slate-200 bg-white/75 p-2 lg:flex">
                {portalItems.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.id)}
                      className={`flex min-w-max items-center gap-2 rounded-[20px] px-4 py-3 text-sm font-medium transition ${
                        active
                          ? "bg-slate-950 text-white shadow-[0_14px_35px_rgba(15,23,42,0.14)]"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {renderPortalView(view)}
            </main>
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:hidden safe-bottom">
        <div className="pointer-events-auto surface-light mx-auto max-w-xl rounded-[28px] px-2 py-2 shadow-[0_22px_55px_rgba(15,23,42,0.16)]">
          <div className="grid grid-cols-5 gap-1">
            {primaryMobileItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-[22px] px-2 py-3 text-center transition ${
                    active
                      ? "bg-slate-950 text-white"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  <span className="truncate text-[11px] font-medium">{item.shortLabel}</span>
                </button>
              );
            })}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-[22px] px-2 py-3 text-center transition ${
                isMoreActive || mobileMenuOpen
                  ? "bg-slate-950 text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <User className="h-4.5 w-4.5" />
              <span className="truncate text-[11px] font-medium">More</span>
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <>
          <button
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-sm lg:hidden"
          />
          <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 lg:hidden safe-bottom">
            <div className="surface-light mx-auto max-w-xl rounded-[32px] px-4 py-4 card-rise">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 text-sm font-semibold text-white">
                    {initials}
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-950">{fullName}</div>
                    <div className="text-sm text-slate-500">
                      {user?.username || "Authenticated user"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PwaInstallButton compact />
                  <ThemeToggle compact />
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                {secondaryItems.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.id)}
                      className={`flex items-center gap-3 rounded-[24px] px-4 py-4 text-left transition ${
                        active
                          ? "bg-slate-950 text-white"
                          : "bg-white/75 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                    >
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                          active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{item.label}</div>
                        <div
                          className={`mt-1 text-xs ${
                            active ? "text-slate-300" : "text-slate-500"
                          }`}
                        >
                          {item.description}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  );
                })}
              </div>

              <button
                onClick={logout}
                className="mt-4 flex w-full items-center justify-between rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-slate-700 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                    <LogOut className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-slate-950">Sign out</div>
                    <div className="mt-1 text-xs text-slate-500">
                      End this portal session
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
