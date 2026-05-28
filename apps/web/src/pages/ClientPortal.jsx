import React, { useState } from 'react';
import {
  Wifi, Smartphone, Laptop, Tablet, Shield, Key, Clock, MapPin, ChevronRight,
  AlertCircle, Plus, Trash2, Edit3, Eye, EyeOff, Download,
  HelpCircle, Bell, LogOut, User, ArrowRight, Activity,
  Info, ShieldCheck, X, Apple, Monitor
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { SelfServiceDevices } from '../views/SelfServiceDevices';
import { LivePortalOverview } from '../views/LivePortalOverview';
import { LiveSecurityView } from '../views/LiveSecurityView';
import { LiveProfileView } from '../views/LiveProfileView';

// ─── DATA ──────────────────────────────────────────────────────────────────
const me = {
  name: 'Astrid Lindgren',
  username: 'a.lindgren',
  email: 'a.lindgren@corp.io',
  group: 'Staff',
  mfaEnabled: true,
  joined: 'Joined March 2024',
};

const devices = [
  { id: 1, name: 'MacBook Pro 16"', type: 'laptop', mac: 'A4:83:E7:1F:22:CD', primary: true, lastSeen: 'Connected now', verified: true, location: 'HQ Floor 2 · AP-04' },
  { id: 2, name: 'iPhone 15 Pro', type: 'phone', mac: '7C:6D:F8:91:0A:5E', primary: false, lastSeen: '23 minutes ago', verified: true, location: 'HQ Floor 2 · AP-04' },
  { id: 3, name: 'iPad Air', type: 'tablet', mac: '9C:B6:D0:44:78:21', primary: false, lastSeen: '2 days ago', verified: true, location: 'Last: HQ Floor 1' },
];

const activity = [
  { id: 1, type: 'connect', desc: 'Connected to CorpNet', device: 'MacBook Pro 16"', time: '14:23 today', ap: 'AP-HQ-F2-04' },
  { id: 2, type: 'connect', desc: 'Connected to CorpNet', device: 'iPhone 15 Pro', time: '14:00 today', ap: 'AP-HQ-F2-04' },
  { id: 3, type: 'password', desc: 'Password changed', device: 'Web portal', time: 'Yesterday 16:42' },
  { id: 4, type: 'disconnect', desc: 'Session ended', device: 'iPad Air', time: '2 days ago' },
  { id: 5, type: 'login', desc: 'Signed in to portal', device: 'Web portal', time: '3 days ago' },
];

// ─── HELPERS ───────────────────────────────────────────────────────────────
function DeviceIcon({ type, className = "w-5 h-5" }) {
  if (type === 'phone') return <Smartphone className={className}/>;
  if (type === 'tablet') return <Tablet className={className}/>;
  return <Laptop className={className}/>;
}

function Tab({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? 'bg-white text-stone-900 shadow-sm'
          : 'text-stone-500 hover:text-stone-800 hover:bg-white/40'
      }`}>
      <Icon className="w-4 h-4"/>
      {label}
    </button>
  );
}

// ─── VIEWS ─────────────────────────────────────────────────────────────────
function OverviewTab({ live = true }) {
  if (live) return <LivePortalOverview/>;
  return (
    <div className="space-y-6">
      {/* Hero connection card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32 blur-2xl"/>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-24 -translate-x-24 blur-2xl"/>
        <div className="relative">
          <div className="flex items-center gap-2 mb-2 text-emerald-50">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse"/>
            <span className="text-xs font-semibold uppercase tracking-wider">Connected</span>
          </div>
          <h2 className="text-3xl font-semibold mb-1 tracking-tight" style={{fontFamily: 'ui-serif, Georgia, serif'}}>You're online.</h2>
          <p className="text-emerald-50 text-sm">Authenticated via PEAP-MSCHAPv2 · MacBook Pro 16"</p>

          <div className="mt-4 sm:mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-100/80">Network</div>
              <div className="text-base font-semibold mt-1">CorpNet</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-100/80">Access Point</div>
              <div className="text-base font-semibold mt-1">HQ Floor 2</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-100/80">IP Address</div>
              <div className="text-base font-semibold mt-1 font-mono">10.20.14.92</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-100/80">Session</div>
              <div className="text-base font-semibold mt-1 tabular-nums">2h 14m</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600"/>
            <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">Active</span>
          </div>
          <div className="text-2xl font-semibold text-stone-900 tracking-tight">MFA</div>
          <div className="text-xs text-stone-500 mt-1">Two-factor auth enabled</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <Smartphone className="w-5 h-5 text-indigo-600"/>
            <span className="text-[10px] uppercase tracking-wider text-stone-500">limit 5</span>
          </div>
          <div className="text-2xl font-semibold text-stone-900 tracking-tight tabular-nums">3 devices</div>
          <div className="text-xs text-stone-500 mt-1">Registered to your account</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <Key className="w-5 h-5 text-amber-600"/>
            <span className="text-[10px] uppercase tracking-wider text-stone-500">14 days ago</span>
          </div>
          <div className="text-2xl font-semibold text-stone-900 tracking-tight">Password</div>
          <div className="text-xs text-stone-500 mt-1">Last changed May 12</div>
        </div>
      </div>

      {/* Two column */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Recent activity */}
        <div className="sm:col-span-2 bg-white border border-stone-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-stone-900" style={{fontFamily: 'ui-serif, Georgia, serif'}}>Recent activity</h3>
            <button className="text-xs text-stone-500 hover:text-stone-900 flex items-center gap-1">View all<ArrowRight className="w-3 h-3"/></button>
          </div>
          <div className="space-y-1">
            {activity.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center gap-3 py-2.5 group">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  a.type === 'connect' ? 'bg-emerald-50 text-emerald-600' :
                  a.type === 'disconnect' ? 'bg-stone-100 text-stone-500' :
                  a.type === 'password' ? 'bg-amber-50 text-amber-600' :
                  'bg-indigo-50 text-indigo-600'
                }`}>
                  {a.type === 'connect' && <Wifi className="w-4 h-4"/>}
                  {a.type === 'disconnect' && <X className="w-4 h-4"/>}
                  {a.type === 'password' && <Key className="w-4 h-4"/>}
                  {a.type === 'login' && <User className="w-4 h-4"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-stone-900 font-medium">{a.desc}</div>
                  <div className="text-xs text-stone-500">{a.device}{a.ap ? ` · ${a.ap}` : ''}</div>
                </div>
                <div className="text-xs text-stone-400 tabular-nums">{a.time}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Connection guide */}
        <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-2xl p-6 text-white">
          <Download className="w-6 h-6 mb-3 text-amber-300"/>
          <h3 className="text-base font-semibold mb-1" style={{fontFamily: 'ui-serif, Georgia, serif'}}>Connect a new device</h3>
          <p className="text-xs text-stone-300 mb-5 leading-relaxed">Download a pre-configured profile and join the network in under a minute.</p>
          <div className="space-y-2">
            {[
              { icon: Apple, label: 'iOS / macOS profile' },
              { icon: Monitor, label: 'Windows / Linux guide' },
              { icon: Smartphone, label: 'Android instructions' },
            ].map((opt, i) => {
              const Icon = opt.icon;
              return (
                <button key={i} className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2.5 text-sm transition-colors group">
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-amber-300"/>
                    {opt.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-white group-hover:translate-x-0.5 transition-all"/>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DevicesTab({ live = true }) {
  const [showAdd, setShowAdd] = useState(false);
  if (live) return <SelfServiceDevices/>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{fontFamily: 'ui-serif, Georgia, serif'}}>Your devices</h2>
          <p className="text-sm text-stone-500 mt-1">Devices registered for network access. You can register up to 5.</p>
        </div>
        <button onClick={()=>setShowAdd(!showAdd)} className="bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4"/>Add device
        </button>
      </div>

      {showAdd && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <Info className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0"/>
            <div>
              <div className="text-sm font-semibold text-amber-900">How to find your MAC address</div>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                On iOS/Android: Settings → Wi-Fi → tap your network → look for "Wi-Fi Address". On macOS: System Settings → Network → Wi-Fi → Details.
                On Windows: Settings → Network → Wi-Fi properties → Physical address.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Device name (e.g. Work laptop)"
              className="px-3 py-2.5 bg-white border border-amber-300 rounded-lg text-sm placeholder-stone-400 focus:outline-none focus:border-amber-500"/>
            <input type="text" placeholder="MAC address (AA:BB:CC:DD:EE:FF)"
              className="px-3 py-2.5 bg-white border border-amber-300 rounded-lg text-sm placeholder-stone-400 focus:outline-none focus:border-amber-500 font-mono"/>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={()=>setShowAdd(false)} className="px-3 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
            <button className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors">
              Verify with password
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {devices.map(d => (
          <div key={d.id} className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-stone-300 transition-colors">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                d.lastSeen.includes('now') ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-600'
              }`}>
                <DeviceIcon type={d.type} className="w-6 h-6"/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-stone-900">{d.name}</h3>
                  {d.primary && <span className="text-[10px] font-semibold uppercase tracking-wider bg-stone-900 text-white px-1.5 py-0.5 rounded">Primary</span>}
                  {d.verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600"/>}
                </div>
                <div className="flex items-center gap-4 text-xs text-stone-500">
                  <span className="font-mono">{d.mac}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{d.lastSeen}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{d.location}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 hover:text-stone-900 transition-colors" title="Rename">
                  <Edit3 className="w-4 h-4"/>
                </button>
                <button className="p-2 hover:bg-rose-50 rounded-lg text-stone-500 hover:text-rose-600 transition-colors" title="Remove">
                  <Trash2 className="w-4 h-4"/>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-stone-400 mt-0.5 flex-shrink-0"/>
        <div className="text-xs text-stone-600 leading-relaxed">
          <strong className="text-stone-900">About MAC randomization:</strong> Modern phones may use a different MAC address per network.
          If you're having trouble connecting, go to your Wi-Fi settings and disable "Private Address" or "Randomized MAC" for the corporate network only.
        </div>
      </div>
    </div>
  );
}

function SecurityTab({ live = true }) {
  const [showPwd, setShowPwd] = useState(false);
  if (live) return <LiveSecurityView/>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{fontFamily: 'ui-serif, Georgia, serif'}}>Security</h2>
        <p className="text-sm text-stone-500 mt-1">Manage how you sign in and protect your account.</p>
      </div>

      {/* Password */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-stone-900">Password</h3>
          <span className="text-xs text-stone-500">Updated 14 days ago</span>
        </div>
        <p className="text-xs text-stone-500 mb-5">Changing your password will sign you out of all devices and update your network credentials automatically.</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">Current password</label>
            <div className="relative mt-1">
              <input type={showPwd ? 'text' : 'password'} placeholder="••••••••••"
                className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 focus:bg-white"/>
              <button onClick={()=>setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">
                {showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">New password</label>
            <input type="password" placeholder="Choose a strong password"
              className="w-full mt-1 px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 focus:bg-white"/>
            <div className="flex gap-1 mt-2">
              {[1,1,1,0,0].map((v, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full ${v ? 'bg-emerald-500' : 'bg-stone-200'}`}/>
              ))}
            </div>
            <p className="text-[11px] text-stone-500 mt-1.5">Moderate strength · add symbols or length to improve</p>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">Confirm new password</label>
            <input type="password" placeholder="Type it again"
              className="w-full mt-1 px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 focus:bg-white"/>
          </div>
          <div className="flex justify-end pt-2">
            <button className="bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
              Update password
            </button>
          </div>
        </div>
      </div>

      {/* MFA */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-emerald-600"/>
            </div>
            <div>
              <h3 className="font-semibold text-stone-900">Two-factor authentication</h3>
              <p className="text-xs text-stone-500 mt-1 max-w-md">Using authenticator app · 6 backup codes available. Required when signing in to this portal.</p>
            </div>
          </div>
          <button className="text-sm text-stone-700 hover:text-stone-900 font-medium px-3 py-1.5 hover:bg-stone-100 rounded-lg transition-colors">
            Manage
          </button>
        </div>
      </div>

      {/* Active sessions */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-stone-900">Portal sessions</h3>
            <p className="text-xs text-stone-500 mt-0.5">Where you're currently signed in to this portal</p>
          </div>
          <button className="text-xs text-rose-600 hover:text-rose-700 font-medium">Sign out of all</button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
            <Monitor className="w-4 h-4 text-stone-600"/>
            <div className="flex-1">
              <div className="text-sm text-stone-900 font-medium">Chrome on macOS · This device</div>
              <div className="text-xs text-stone-500">HQ Floor 2 · 10.20.14.92</div>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">Current</span>
          </div>
          <div className="flex items-center gap-3 p-3 hover:bg-stone-50 rounded-lg group">
            <Smartphone className="w-4 h-4 text-stone-600"/>
            <div className="flex-1">
              <div className="text-sm text-stone-900 font-medium">Safari on iOS</div>
              <div className="text-xs text-stone-500">HQ Floor 2 · 4 hours ago</div>
            </div>
            <button className="text-xs text-rose-600 hover:text-rose-700 opacity-0 group-hover:opacity-100 transition-opacity">Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ live = true }) {
  if (live) return <LiveProfileView/>;
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{fontFamily: 'ui-serif, Georgia, serif'}}>Profile</h2>
        <p className="text-sm text-stone-500 mt-1">Your account information.</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center gap-4 pb-5 border-b border-stone-100">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-2xl font-semibold text-white">
            {me.name.split(' ').map(n=>n[0]).join('')}
          </div>
          <div>
            <div className="text-lg font-semibold text-stone-900">{me.name}</div>
            <div className="text-sm text-stone-500">{me.email}</div>
            <div className="text-xs text-stone-400 mt-1">{me.joined}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-5">
          {[
            { label: 'Username', value: me.username, mono: true },
            { label: 'Email', value: me.email },
            { label: 'Group', value: me.group, badge: true },
            { label: 'Account status', value: 'Active', badgeOk: true },
          ].map((f, i) => (
            <div key={i}>
              <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">{f.label}</div>
              <div className={`mt-1 text-sm text-stone-900 ${f.mono ? 'font-mono' : ''}`}>
                {f.badge && <span className="inline-block px-2 py-0.5 bg-stone-100 rounded text-xs">{f.value}</span>}
                {f.badgeOk && <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>{f.value}</span>}
                {!f.badge && !f.badgeOk && f.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex items-center gap-4">
        <HelpCircle className="w-5 h-5 text-stone-400 flex-shrink-0"/>
        <div className="flex-1 text-sm text-stone-700">
          Need to change your name or email? Contact your IT administrator.
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ──────────────────────────────────────────────────────────────────
export default function ClientPortal() {
  const [tab, setTab] = useState('overview');
  const { user, logout } = useAuth();
  const displayName = user?.fullName || user?.username || me.name;
  const firstName = displayName.split(' ')[0];
  const initials = displayName.split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-stone-50" style={{fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif'}}>
      {/* Subtle texture background */}
      <div className="fixed inset-0 opacity-[0.015] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, #000 1px, transparent 0)',
        backgroundSize: '20px 20px'
      }}/>

      <div className="relative">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-sm border-b border-stone-200 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 h-14 sm:h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-stone-900 flex items-center justify-center">
                <Wifi className="w-5 h-5 text-white" strokeWidth={2.5}/>
              </div>
              <div>
                <div className="text-base font-semibold text-stone-900 tracking-tight" style={{fontFamily: 'ui-serif, Georgia, serif'}}>RadiusOps</div>
                <div className="text-[10px] text-stone-500 uppercase tracking-wider -mt-0.5">My account</div>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <button className="hidden sm:flex p-2 hover:bg-stone-100 rounded-lg text-stone-500 hover:text-stone-900 transition-colors">
                <HelpCircle className="w-5 h-5"/>
              </button>
              <button className="hidden sm:flex relative p-2 hover:bg-stone-100 rounded-lg text-stone-500 hover:text-stone-900 transition-colors">
                <Bell className="w-5 h-5"/>
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-emerald-500 rounded-full"/>
              </button>
              <div className="hidden sm:block h-6 w-px bg-stone-200 mx-1"/>
              <div className="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-stone-100 cursor-pointer">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-xs font-semibold text-white">
                  {initials}
                </div>
                <div className="text-sm">
                  <div className="text-stone-900 font-medium leading-tight">{firstName}</div>
                </div>
              </div>
              <button onClick={logout} title="Sign out" className="p-2 hover:bg-stone-100 rounded-lg text-stone-500 hover:text-stone-900 transition-colors">
                <LogOut className="w-5 h-5"/>
              </button>
            </div>
          </div>
        </header>

        {/* Welcome */}
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 sm:pt-10 pb-4 sm:pb-6">
          <div className="text-sm text-stone-500 mb-1">Good afternoon,</div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 tracking-tight" style={{fontFamily: 'ui-serif, Georgia, serif'}}>
            {firstName}.
          </h1>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-4 sm:pb-6">
          <div className="flex overflow-x-auto p-1.5 bg-stone-100 rounded-2xl gap-1" style={{scrollbarWidth:'none'}}>
            <Tab active={tab==='overview'} onClick={()=>setTab('overview')} icon={Activity} label="Overview"/>
            <Tab active={tab==='devices'} onClick={()=>setTab('devices')} icon={Smartphone} label="Devices"/>
            <Tab active={tab==='security'} onClick={()=>setTab('security')} icon={Shield} label="Security"/>
            <Tab active={tab==='profile'} onClick={()=>setTab('profile')} icon={User} label="Profile"/>
          </div>
        </div>

        {/* Content */}
        <main className="max-w-6xl mx-auto px-4 sm:px-8 pb-16">
          {tab === 'overview' && <OverviewTab/>}
          {tab === 'devices' && <DevicesTab/>}
          {tab === 'security' && <SecurityTab/>}
          {tab === 'profile' && <ProfileTab/>}
        </main>
      </div>
    </div>
  );
}
