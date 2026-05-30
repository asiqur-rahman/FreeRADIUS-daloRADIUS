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
  { id: "overview",  label: "Overview",       shortLabel: "Home",     description: "Status, sessions, and access", icon: Wifi,        primaryMobile: true  },
  { id: "devices",   label: "Devices",         shortLabel: "Devices",  description: "Your approved devices",        icon: Smartphone,  primaryMobile: true  },
  { id: "wifi",      label: "Wi-Fi Certificate",shortLabel: "Wi-Fi",   description: "Wi-Fi certificate setup",      icon: KeyRound,    primaryMobile: true  },
  { id: "security",  label: "Security",         shortLabel: "Security", description: "Password and MFA",            icon: ShieldCheck, primaryMobile: true  },
  { id: "profile",   label: "Profile",          shortLabel: "Profile",  description: "Your account",                icon: User                              },
  { id: "connect",   label: "Connect Guide",    shortLabel: "Guide",    description: "How to connect",              icon: BookOpen                          },
];

function renderPortalView(view: PortalView) {
  switch (view) {
    case "overview":  return <LivePortalOverview />;
    case "devices":   return <SelfServiceDevices />;
    case "wifi":      return <LiveWifiCertView />;
    case "security":  return <LiveSecurityView />;
    case "profile":   return <LiveProfileView />;
    case "connect":   return <LiveConnectionGuideView />;
    default:          return <LivePortalOverview />;
  }
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function initialsFor(name: string) {
  return name.split(/\s+/).map((s) => s[0] ?? "").join("").slice(0, 2).toUpperCase();
}

export default function ClientPortal() {
  const [view, setView]               = useState<PortalView>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout }              = useAuth();
  const { isWhiteTheme }              = useTheme();

  const activeItem = useMemo<PortalNavItem>(
    () => portalItems.find((item) => item.id === view) ?? portalItems[0]!,
    [view],
  );

  const primaryMobileItems = useMemo(() => portalItems.filter((i) => i.primaryMobile), []);
  const secondaryItems     = useMemo(() => portalItems.filter((i) => !i.primaryMobile), []);

  const fullName  = user?.fullName || user?.username || "Portal User";
  const firstName = fullName.split(/\s+/)[0] ?? "User";
  const initials  = initialsFor(fullName);
  const greeting  = greetingForNow();
  const isMoreActive = !primaryMobileItems.some((i) => i.id === view);

  const navigate = (nextView: PortalView) => {
    setView(nextView);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Theme-aware class sets ───────────────────────────────────────────────
  const L = isWhiteTheme;

  const rootBg     = L ? "bg-transparent text-slate-900"    : "bg-transparent text-slate-100";
  const panelBg    = L ? "bg-white/70"                      : "bg-slate-900/70";
  const panelBorder= L ? "border-slate-200/70"              : "border-white/8";
  const cardBg     = L ? "bg-white/75 border-slate-200"     : "bg-white/[0.04] border-white/8";
  const headerBg   = L ? "bg-white/80 border-slate-200/70"  : "bg-[#07111c]/85 border-white/8";
  const titleColor = L ? "text-slate-950"                   : "text-white";
  const copyColor  = L ? "text-slate-600"                   : "text-slate-400";
  const faintColor = L ? "text-slate-500"                   : "text-slate-500";
  const btnBorder  = L ? "border-slate-200 bg-white/85 text-slate-500 hover:bg-white hover:text-slate-950"
                       : "border-white/8 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white";
  const btnSignOut = L ? "border-slate-200 bg-white/80 text-slate-600 hover:bg-white hover:text-slate-950"
                       : "border-white/8 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white";
  const navActive  = L ? "bg-slate-950 text-white shadow-[0_14px_35px_rgba(15,23,42,0.14)]"
                       : "bg-sky-400/[0.16] text-white ring-1 ring-sky-300/20";
  const navIdle    = L ? "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                       : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100";
  const navIconActive  = L ? "bg-white/10 text-white"      : "bg-sky-300/10 text-sky-200";
  const navIconIdle    = L ? "bg-white text-slate-500"     : "bg-white/[0.05] text-slate-400";
  const infoCardBg     = L ? "rounded-[24px] border border-slate-200 bg-white/75 px-4 py-4 shadow-sm"
                           : "rounded-[24px] border border-white/8 bg-white/[0.04] px-4 py-4";
  const pillBg         = L ? "bg-slate-50"                  : "bg-white/[0.04]";
  const mobileSummaryBg= L ? "bg-white/88 border-slate-200 shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                           : "bg-[#07111c]/88 border-white/8";
  const tabBarBg       = L ? "bg-white/75 border-slate-200" : "bg-white/[0.04] border-white/8";
  const tabActive      = L ? "bg-slate-950 text-white shadow-[0_14px_35px_rgba(15,23,42,0.14)]"
                           : "bg-sky-400 text-slate-950";
  const tabIdle        = L ? "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                           : "text-slate-400 hover:bg-white/[0.05] hover:text-white";
  const mobileNavBg    = L ? "surface-light shadow-[0_22px_55px_rgba(15,23,42,0.16)]"
                           : "surface-dark-strong shadow-[0_22px_55px_rgba(2,6,23,0.5)]";
  const mobileNavActive= L ? "bg-slate-950 text-white"      : "bg-sky-400 text-slate-950";
  const mobileNavIdle  = L ? "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                           : "text-slate-400 hover:bg-white/[0.05] hover:text-white";
  const menuPanelBg    = L ? "surface-light"                : "surface-dark-strong";
  const menuBorder     = L ? "border-slate-200"             : "border-white/8";
  const menuItemBg     = L ? "bg-white/75 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                           : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-white";
  const sidebarCard    = L ? "app-card-light"               : "app-card-dark";

  // ── Root background ──────────────────────────────────────────────────────
  const rootStyle = {
    background: L
      ? "radial-gradient(circle at top left, rgba(14,165,233,0.1), transparent 28%), radial-gradient(circle at 85% 0%, rgba(20,184,166,0.08), transparent 24%), linear-gradient(180deg, #f8fafc 0%, #f1f5f9 48%, #edf2f7 100%)"
      : "radial-gradient(circle at top left, rgba(14,165,233,0.08), transparent 28%), radial-gradient(circle at 85% 0%, rgba(20,184,166,0.06), transparent 24%), linear-gradient(180deg, #090f1a 0%, #0a1120 50%, #080e1a 100%)",
  };

  return (
    <div className={`min-h-screen bg-transparent ${rootBg}`} style={rootStyle}>
      {/* Dot grid overlay */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.3]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, ${L ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.04)"} 1px, transparent 0)`,
          backgroundSize: "22px 22px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.5), transparent 85%)",
        }} />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1660px] flex-col lg:px-5 lg:py-5">
        <div className={`flex min-h-screen flex-1 flex-col rounded-none border-x-0 border-t-0 lg:rounded-[32px] lg:border ${L ? "surface-light" : "surface-dark"}`} style={{borderColor: L ? undefined : "rgba(255,255,255,0.06)"}}>

          {/* ── Mobile header ── */}
          <header className={`sticky top-0 z-30 border-b px-4 py-3 backdrop-blur-2xl lg:hidden safe-top ${headerBg}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 shadow-lg shadow-sky-500/20">
                  <Wifi className="h-4.5 w-4.5 text-white" strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <div className={`text-[11px] uppercase tracking-[0.3em] ${faintColor}`}>Nexara</div>
                  <div className={`truncate text-[15px] font-semibold tracking-tight ${titleColor}`}>{activeItem.label}</div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle compact />
                <button className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${btnBorder}`}>
                  <Bell className="h-4.5 w-4.5" />
                </button>
                <button onClick={() => setMobileMenuOpen(true)}
                  className={`flex h-10 items-center gap-2 rounded-2xl border px-3 transition ${btnBorder}`}>
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-teal-500 text-xs font-semibold text-white">{initials}</div>
                  <span className={`text-sm font-medium ${L ? "text-slate-600" : "text-slate-300"}`}>More</span>
                </button>
              </div>
            </div>
          </header>

          {/* ── Desktop header ── */}
          <header className={`sticky top-0 z-30 hidden border-b px-6 pb-5 pt-5 backdrop-blur-2xl lg:block lg:rounded-t-[32px] safe-top ${panelBg} ${panelBorder} border-x-0 border-t-0`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 shadow-lg shadow-sky-500/20">
                    <Wifi className="h-5 w-5 text-white" strokeWidth={2.4} />
                  </div>
                  <div>
                    <div className={`text-[11px] uppercase tracking-[0.3em] ${faintColor}`}>Nexara</div>
                    <div className={`mt-1 text-base font-semibold tracking-tight ${titleColor}`}>My Wi-Fi</div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className={`text-sm ${copyColor}`}>{greeting},</div>
                  <h1 className={`mt-1 text-[2rem] font-semibold leading-tight tracking-tight ${titleColor}`}>{firstName}.</h1>
                  <p className={`mt-2 max-w-2xl text-sm text-balance ${copyColor}`}>{activeItem.description}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ThemeToggle />
                <button className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition ${btnBorder}`}>
                  <Bell className="h-4.5 w-4.5" />
                </button>
                <button onClick={logout} className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition ${btnSignOut}`}>
                  <LogOut className="h-4 w-4" />Sign out
                </button>
              </div>
            </div>

            {/* Info strip */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Identity",    value: user?.username || fullName, sub: "Personal access" },
                { label: "Security",    value: user?.mfaEnabled ? "MFA on" : "Protected",       sub: null, icon: <ShieldCheck className="h-4 w-4" />, iconColor: "text-emerald-500" },
                { label: "Access mode", value: "Enterprise Wi-Fi",                               sub: null, icon: <Wifi className="h-4 w-4 text-sky-500" /> },
              ].map((card) => (
                <div key={card.label} className={infoCardBg}>
                  <div className={`text-[11px] uppercase tracking-[0.26em] ${faintColor}`}>{card.label}</div>
                  <div className={`mt-2 flex items-center gap-2 text-sm font-semibold ${titleColor}`}>
                    {card.icon && <span className={card.iconColor ?? ""}>{card.icon}</span>}
                    {card.value}
                  </div>
                  {card.sub && <div className={`mt-1 text-xs ${copyColor}`}>{card.sub}</div>}
                </div>
              ))}
            </div>
          </header>

          <div className="flex flex-1 gap-6 px-4 pb-app-nav pt-4 lg:px-6 lg:pb-6 lg:pt-6">
            {/* ── Sidebar ── */}
            <aside className="hidden xl:block xl:w-[300px] xl:shrink-0">
              <div className="sticky top-[11.5rem] space-y-4">
                <div className={`${sidebarCard} p-5 card-rise`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-sky-500 to-teal-500 text-base font-semibold text-white">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className={`truncate text-lg font-semibold ${titleColor}`}>{fullName}</div>
                      <div className={`truncate text-sm ${copyColor}`}>{user?.username || "Authenticated user"}</div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    {portalItems.map((item) => {
                      const Icon = item.icon;
                      const active = view === item.id;
                      return (
                        <button key={item.id} onClick={() => navigate(item.id)}
                          className={`flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left transition ${active ? navActive : navIdle}`}>
                          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? navIconActive : navIconIdle}`}>
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{item.label}</div>
                            <div className={`mt-1 text-xs ${active ? (L ? "text-slate-300" : "text-sky-200/70") : faintColor}`}>{item.description}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={`${sidebarCard} p-5 card-rise`}>
                  <div className={`text-[11px] uppercase tracking-[0.26em] ${faintColor}`}>Quick tips</div>
                  <div className={`mt-4 space-y-3 text-sm ${copyColor}`}>
                    <div className={`rounded-[22px] px-4 py-3 ${pillBg}`}>Register the Wi-Fi address used on this network.</div>
                    <div className={`rounded-[22px] px-4 py-3 ${pillBg}`}>Use Wi-Fi certificates for managed devices.</div>
                  </div>
                </div>
              </div>
            </aside>

            <main className="page-enter min-w-0 flex-1">
              {/* Mobile summary card */}
              <section className="mb-4 lg:hidden">
                <div className={`rounded-[28px] border px-4 py-4 ${mobileSummaryBg}`}>
                  <div className={`flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] ${faintColor}`}>
                    <span>{greeting}</span>
                    <span className="h-1 w-1 rounded-full bg-current opacity-40" />
                    <span>{user?.username || "Account"}</span>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className={`text-[1.85rem] font-semibold leading-none tracking-tight ${titleColor}`}>{firstName}.</h1>
                      <p className={`mt-2 max-w-[18rem] text-sm leading-6 ${copyColor}`}>{activeItem.description}</p>
                    </div>
                    <div className={`rounded-2xl border px-3 py-2 text-right ${L ? "border-sky-100 bg-sky-50" : "border-sky-500/20 bg-sky-500/10"}`}>
                      <div className={`text-[10px] uppercase tracking-[0.22em] ${L ? "text-sky-600" : "text-sky-300"}`}>View</div>
                      <div className={`mt-1 text-sm font-semibold ${titleColor}`}>{activeItem.label}</div>
                    </div>
                  </div>
                  <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto">
                    {[
                      { label: "Identity", value: user?.username || fullName },
                      { label: "Security", value: user?.mfaEnabled ? "MFA on" : "Protected" },
                      { label: "Access",   value: "Ready" },
                    ].map((c) => (
                      <div key={c.label} className={`min-w-[9.5rem] rounded-[22px] border px-3 py-3 ${L ? "border-slate-200 bg-slate-50" : "border-white/8 bg-white/[0.04]"}`}>
                        <div className={`text-[10px] uppercase tracking-[0.22em] ${faintColor}`}>{c.label}</div>
                        <div className={`mt-1 truncate text-sm font-semibold ${titleColor}`}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Tab bar (lg+) */}
              <div className={`hide-scrollbar mb-5 hidden gap-2 overflow-x-auto rounded-[28px] border p-2 lg:flex ${tabBarBg}`}>
                {portalItems.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button key={item.id} onClick={() => navigate(item.id)}
                      className={`flex min-w-max items-center gap-2 rounded-[20px] px-4 py-3 text-sm font-medium transition ${active ? tabActive : tabIdle}`}>
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

      {/* ── Mobile bottom nav ── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:hidden safe-bottom">
        <div className={`pointer-events-auto mx-auto max-w-xl rounded-[28px] px-2 py-2 ${mobileNavBg}`}>
          <div className="grid grid-cols-5 gap-1">
            {primaryMobileItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button key={item.id} onClick={() => navigate(item.id)}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-[22px] px-2 py-3 text-center transition ${active ? mobileNavActive : mobileNavIdle}`}>
                  <Icon className="h-4.5 w-4.5" />
                  <span className="truncate text-[11px] font-medium">{item.shortLabel}</span>
                </button>
              );
            })}
            <button onClick={() => setMobileMenuOpen(true)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-[22px] px-2 py-3 text-center transition ${(isMoreActive || mobileMenuOpen) ? mobileNavActive : mobileNavIdle}`}>
              <User className="h-4.5 w-4.5" />
              <span className="truncate text-[11px] font-medium">More</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile menu ── */}
      {mobileMenuOpen && (
        <>
          <button onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"
            className={`fixed inset-0 z-40 backdrop-blur-sm lg:hidden ${L ? "bg-slate-950/25" : "bg-black/50"}`} />
          <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 lg:hidden safe-bottom">
            <div className={`mx-auto max-w-xl rounded-[32px] px-4 py-4 card-rise ${menuPanelBg}`}>
              <div className={`flex items-center justify-between border-b pb-4 ${menuBorder}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 text-sm font-semibold text-white">{initials}</div>
                  <div>
                    <div className={`text-base font-semibold ${titleColor}`}>{fullName}</div>
                    <div className={`text-sm ${copyColor}`}>{user?.username || "Authenticated user"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle compact />
                  <button onClick={() => setMobileMenuOpen(false)}
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${btnBorder}`}>
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                {secondaryItems.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button key={item.id} onClick={() => navigate(item.id)}
                      className={`flex items-center gap-3 rounded-[24px] px-4 py-4 text-left transition ${active ? navActive : menuItemBg}`}>
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${active ? navIconActive : navIconIdle}`}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{item.label}</div>
                        <div className={`mt-1 text-xs ${active ? (L ? "text-slate-300" : "text-sky-200/70") : faintColor}`}>{item.description}</div>
                      </div>
                      <ChevronRight className={`h-4 w-4 ${L ? "text-slate-400" : "text-slate-600"}`} />
                    </button>
                  );
                })}
              </div>

              <button onClick={logout}
                className={`mt-4 flex w-full items-center justify-between rounded-[24px] border px-4 py-4 transition ${btnSignOut}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${L ? "bg-slate-100 text-slate-500" : "bg-white/[0.06] text-slate-400"}`}>
                    <LogOut className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-left">
                    <div className={`font-medium ${titleColor}`}>Sign out</div>
                    <div className={`mt-1 text-xs ${faintColor}`}>End this portal session</div>
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 ${L ? "text-slate-400" : "text-slate-600"}`} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
