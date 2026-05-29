import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Users, Wifi, Shield, Activity, AlertTriangle, CheckCircle2, Search,
  MoreVertical, Plus, Download, Bell, Settings, LogOut, ChevronRight,
  Radio, Server, Lock, Edit3, RefreshCw, ArrowUpRight, ArrowDownRight,
  Power, FileText, Globe, Smartphone, Laptop, Tablet,
  AlertCircle, Database, KeyRound, ShieldCheck,
  Home, UsersRound, Layers, Cpu, BookOpen, Sparkles, Menu, X
} from 'lucide-react';
import { listAdminDevices } from '../api/endpoints';
import { useSSE } from '../hooks/useSSE';
import { playNotificationSound } from '../hooks/useNotificationSound';
import { useAuth } from '../auth/AuthContext';
import { LiveNasView } from '../views/LiveNasView';
import { LiveSessionsView } from '../views/LiveSessionsView';
import { LiveOperationsOverview } from '../views/LiveOperationsOverview';
import { LiveAuditView } from '../views/LiveAuditView';
import { LiveUsersView } from '../views/LiveUsersView';
import { LiveGroupsView } from '../views/LiveGroupsView';
import { LiveSettingsView } from '../views/LiveSettingsView';
import { LiveDeviceApprovalsView } from '../views/LiveDeviceApprovalsView';
import { LiveAdminDocsView } from '../views/LiveAdminDocsView';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// ─── MOCK DATA ──────────────────────────────────────────────────────────────
const authTrend = [
  { time: '00:00', success: 142, reject: 8 },
  { time: '03:00', success: 89, reject: 4 },
  { time: '06:00', success: 234, reject: 12 },
  { time: '09:00', success: 891, reject: 47 },
  { time: '12:00', success: 1247, reject: 38 },
  { time: '15:00', success: 1089, reject: 29 },
  { time: '18:00', success: 678, reject: 18 },
  { time: '21:00', success: 312, reject: 11 },
];

const rejectReasons = [
  { name: 'Bad password', value: 47, color: '#dc2626' },
  { name: 'MAC mismatch', value: 28, color: '#ea580c' },
  { name: 'Account disabled', value: 19, color: '#ca8a04' },
  { name: 'Expired', value: 11, color: '#65a30d' },
  { name: 'Other', value: 8, color: '#0891b2' },
];

const siteUsage = [
  { site: 'HQ-Floor1', sessions: 234 },
  { site: 'HQ-Floor2', sessions: 189 },
  { site: 'HQ-Floor3', sessions: 156 },
  { site: 'Warehouse', sessions: 87 },
  { site: 'Remote-1', sessions: 64 },
  { site: 'Remote-2', sessions: 41 },
];

const users = [
  { id: 1, username: 'a.lindgren', name: 'Astrid Lindgren', email: 'a.lindgren@corp.io', group: 'Staff', status: 'active', devices: 3, lastSeen: '2 min ago', mfa: true },
  { id: 2, username: 'k.osei', name: 'Kwame Osei', email: 'k.osei@corp.io', group: 'Engineering', status: 'active', devices: 2, lastSeen: '8 min ago', mfa: true },
  { id: 3, username: 'm.tanaka', name: 'Miyu Tanaka', email: 'm.tanaka@corp.io', group: 'Staff', status: 'active', devices: 4, lastSeen: '21 min ago', mfa: false },
  { id: 4, username: 'r.benali', name: 'Rania Benali', email: 'r.benali@corp.io', group: 'Contractor', status: 'expired', devices: 1, lastSeen: '3 days ago', mfa: false },
  { id: 5, username: 'p.novak', name: 'Pavel Novák', email: 'p.novak@corp.io', group: 'Engineering', status: 'active', devices: 2, lastSeen: '14 min ago', mfa: true },
  { id: 6, username: 'guest-471', name: 'Guest 471', email: 'guest@temp.io', group: 'Guest', status: 'active', devices: 1, lastSeen: 'now', mfa: false },
  { id: 7, username: 'j.chen', name: 'Jiao Chen', email: 'j.chen@corp.io', group: 'Staff', status: 'suspended', devices: 2, lastSeen: '6 days ago', mfa: true },
  { id: 8, username: 's.haidari', name: 'Sahar Haidari', email: 's.haidari@corp.io', group: 'Engineering', status: 'active', devices: 3, lastSeen: '1 min ago', mfa: true },
];

const sessions = [
  { id: 's1', user: 'a.lindgren', device: 'MacBook Pro', mac: 'A4:83:E7:1F:22:CD', ap: 'AP-HQ-F2-04', ssid: 'CorpNet', vlan: 20, ip: '10.20.14.92', bytes: '847 MB', duration: '2h 14m', method: 'PEAP' },
  { id: 's2', user: 'k.osei', device: 'iPhone 15', mac: '7C:6D:F8:91:0A:5E', ap: 'AP-HQ-F1-12', ssid: 'CorpNet', vlan: 20, ip: '10.20.8.41', bytes: '124 MB', duration: '47m', method: 'PEAP' },
  { id: 's3', user: 'm.tanaka', device: 'ThinkPad X1', mac: '9C:B6:D0:44:78:21', ap: 'AP-HQ-F3-09', ssid: 'CorpNet', vlan: 20, ip: '10.20.21.7', bytes: '2.1 GB', duration: '5h 02m', method: 'EAP-TLS' },
  { id: 's4', user: 'p.novak', device: 'Dell XPS', mac: 'B8:27:EB:CC:91:42', ap: 'AP-HQ-F2-07', ssid: 'EngNet', vlan: 30, ip: '10.30.4.18', bytes: '534 MB', duration: '1h 28m', method: 'EAP-TLS' },
  { id: 's5', user: 'guest-471', device: 'Android', mac: 'DC:A6:32:71:F8:0B', ap: 'AP-HQ-F1-03', ssid: 'GuestNet', vlan: 99, ip: '10.99.0.84', bytes: '38 MB', duration: '12m', method: 'PEAP' },
  { id: 's6', user: 's.haidari', device: 'MacBook Air', mac: 'F0:18:98:23:4D:E1', ap: 'AP-HQ-F2-11', ssid: 'EngNet', vlan: 30, ip: '10.30.7.55', bytes: '1.4 GB', duration: '3h 41m', method: 'EAP-TLS' },
];

const alerts = [
  { id: 1, severity: 'critical', title: 'EAP server cert expires in 27 days', detail: 'CN=radius.corp.io expires 2026-06-22. Renewal will require re-distribution.', time: '14 min ago' },
  { id: 2, severity: 'warning', title: 'AP-HQ-F3-09 silent for 18 minutes', detail: 'No accounting traffic from NAS 10.40.3.9 since 14:42 UTC.', time: '32 min ago' },
  { id: 3, severity: 'warning', title: 'Reject spike on EngNet SSID', detail: '23 rejects in last 5 min — typical avg is 1.2. Investigate r.benali, j.chen accounts.', time: '1h ago' },
  { id: 4, severity: 'info', title: 'Bulk policy update applied', detail: 'Engineering group: Session-Timeout 28800 → 14400. Affected 47 users.', time: '2h ago' },
];

const audit = [
  { id: 1, actor: 'admin', action: 'user.create', target: 's.haidari', time: '11:42:18', ip: '10.0.1.4' },
  { id: 2, actor: 'admin', action: 'session.disconnect', target: 'guest-294', time: '11:38:02', ip: '10.0.1.4' },
  { id: 3, actor: 'p.novak', action: 'password.change', target: 'self', time: '11:31:45', ip: '10.30.4.18' },
  { id: 4, actor: 'admin', action: 'group.update', target: 'Engineering', time: '11:19:33', ip: '10.0.1.4' },
  { id: 5, actor: 'a.lindgren', action: 'device.add', target: 'self', time: '11:08:21', ip: '10.20.14.92' },
];

// ─── UI ────────────────────────────────────────────────────────────────────
const navItems = [
  { id: 'overview',  icon: Home,      label: 'Overview'         },
  { id: 'users',     icon: UsersRound, label: 'Users'            },
  { id: 'devices',   icon: Smartphone, label: 'Device Approvals' },
  { id: 'sessions',  icon: Activity,   label: 'Live Sessions'    },
  { id: 'groups',    icon: Layers,     label: 'Groups & Policy'  },
  { id: 'nas',       icon: Cpu,        label: 'NAS Devices'      },
  { id: 'audit',     icon: BookOpen,   label: 'Audit Log'        },
  { id: 'settings',  icon: Settings,   label: 'Settings'         },
  { id: 'docs',      icon: FileText,   label: 'Documentation'    },
];

function StatusPill({ status }) {
  const map = {
    active: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
    suspended: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
    expired: { bg: 'bg-rose-500/10', text: 'text-rose-400', dot: 'bg-rose-400' },
    pending: { bg: 'bg-sky-500/10', text: 'text-sky-400', dot: 'bg-sky-400' },
  };
  const s = map[status] || map.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, delta, accent }) {
  const up = delta && delta.startsWith('+');
  return (
    <div className="relative bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 overflow-hidden group hover:border-zinc-700 transition-colors">
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-20 blur-2xl ${accent}`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent} bg-opacity-20`}>
            <Icon className="w-4 h-4 text-white" strokeWidth={2.2} />
          </div>
          {delta && (
            <span className={`flex items-center gap-1 text-[11px] font-medium ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
              {up ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
              {delta}
            </span>
          )}
        </div>
        <div className="text-3xl font-semibold text-white tracking-tight tabular-nums">{value}</div>
        <div className="text-xs text-zinc-400 mt-1 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

function AlertCard({ alert }) {
  const map = {
    critical: { bar: 'bg-rose-500', icon: AlertTriangle, color: 'text-rose-400', tag: 'CRITICAL', tagBg: 'bg-rose-500/15 text-rose-400' },
    warning: { bar: 'bg-amber-500', icon: AlertCircle, color: 'text-amber-400', tag: 'WARNING', tagBg: 'bg-amber-500/15 text-amber-400' },
    info: { bar: 'bg-sky-500', icon: CheckCircle2, color: 'text-sky-400', tag: 'INFO', tagBg: 'bg-sky-500/15 text-sky-400' },
  };
  const s = map[alert.severity];
  const Icon = s.icon;
  return (
    <div className="flex gap-3 p-3 rounded-lg hover:bg-zinc-800/40 transition-colors group">
      <div className={`w-1 rounded-full ${s.bar} flex-shrink-0`} />
      <Icon className={`w-4 h-4 ${s.color} mt-0.5 flex-shrink-0`} strokeWidth={2.2}/>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.tagBg}`}>{s.tag}</span>
          <span className="text-[11px] text-zinc-500">{alert.time}</span>
        </div>
        <div className="text-sm text-zinc-100 font-medium leading-tight">{alert.title}</div>
        <div className="text-xs text-zinc-500 mt-1 leading-snug">{alert.detail}</div>
      </div>
    </div>
  );
}

function Overview({ live = true }) {
  if (live) return <LiveOperationsOverview/>;
  return (
    <div className="space-y-6">
      {/* Stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Active Users" value="847" delta="+12 today" accent="bg-emerald-600" />
        <StatCard icon={Wifi} label="Live Sessions" value="771" delta="+34 (1h)" accent="bg-sky-600" />
        <StatCard icon={Shield} label="Auth Success" value="98.7%" delta="+0.2%" accent="bg-violet-600" />
        <StatCard icon={Server} label="NAS Online" value="24/24" accent="bg-amber-600" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Auth trend - 2 cols */}
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Authentication Activity</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Last 24 hours · all SSIDs</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500"/>Accept
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-rose-500"/>Reject
              </span>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={authTrend} margin={{top: 0, right: 0, left: -20, bottom: 0}}>
                <defs>
                  <linearGradient id="acceptGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="rejectGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4}/>
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="time" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false}/>
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false}/>
                <Tooltip contentStyle={{background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12}}/>
                <Area type="monotone" dataKey="success" stroke="#10b981" strokeWidth={2} fill="url(#acceptGrad)"/>
                <Area type="monotone" dataKey="reject" stroke="#f43f5e" strokeWidth={2} fill="url(#rejectGrad)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Reject reasons */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white">Reject Reasons</h3>
          <p className="text-xs text-zinc-500 mt-0.5 mb-4">Last 24 hours</p>
          <div className="h-32 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rejectReasons} dataKey="value" innerRadius={32} outerRadius={56} paddingAngle={2}>
                  {rejectReasons.map((e, i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            {rejectReasons.map(r => (
              <div key={r.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{background: r.color}}/>
                  <span className="text-zinc-300">{r.name}</span>
                </div>
                <span className="text-zinc-400 tabular-nums font-medium">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Site usage */}
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Sessions by Site</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Current active sessions</p>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={siteUsage} margin={{top: 0, right: 0, left: -20, bottom: 0}}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="site" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false}/>
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false}/>
                <Tooltip contentStyle={{background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12}}/>
                <Bar dataKey="sessions" fill="#6366f1" radius={[6, 6, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Active Alerts</h3>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">{alerts.length}</span>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto -mx-2">
            {alerts.map(a => <AlertCard key={a.id} alert={a}/>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersView({ live = true }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const filtered = useMemo(() => users.filter(u =>
    (filter === 'all' || u.status === filter) &&
    (u.name.toLowerCase().includes(q.toLowerCase()) || u.username.includes(q.toLowerCase()) || u.email.includes(q.toLowerCase()))
  ), [q, filter]);
  if (live) return <LiveUsersView/>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Users</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{users.length} users · {users.filter(u => u.status === 'active').length} active</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4"/>Export CSV
          </button>
          <button className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg flex items-center gap-2 transition-colors font-medium">
            <Plus className="w-4 h-4"/>New User
          </button>
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl">
        <div className="p-3 border-b border-zinc-800 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"/>
            <input
              type="text" value={q} onChange={e=>setQ(e.target.value)}
              placeholder="Search by name, username, or email..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-600"
            />
          </div>
          <div className="flex gap-1">
            {['all', 'active', 'suspended', 'expired'].map(s => (
              <button key={s} onClick={()=>setFilter(s)}
                className={`px-3 py-2 text-xs rounded-lg capitalize transition-colors ${filter===s ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Group</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">MFA</th>
                <th className="px-4 py-3 font-medium">Devices</th>
                <th className="px-4 py-3 font-medium">Last Seen</th>
                <th className="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[11px] font-semibold text-white">
                        {u.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <div className="text-zinc-100 font-medium">{u.name}</div>
                        <div className="text-xs text-zinc-500">{u.username} · {u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-xs rounded">{u.group}</span>
                  </td>
                  <td className="px-4 py-3"><StatusPill status={u.status}/></td>
                  <td className="px-4 py-3">
                    {u.mfa ? <ShieldCheck className="w-4 h-4 text-emerald-400"/> : <span className="text-zinc-600 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 tabular-nums">{u.devices}</td>
                  <td className="px-4 py-3 text-zinc-400">{u.lastSeen}</td>
                  <td className="px-4 py-3">
                    <button className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-zinc-200 transition-colors">
                      <MoreVertical className="w-4 h-4"/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DeviceIcon({ device }) {
  if (/iphone|android|phone/i.test(device)) return <Smartphone className="w-3.5 h-3.5"/>;
  if (/ipad|tablet/i.test(device)) return <Tablet className="w-3.5 h-3.5"/>;
  return <Laptop className="w-3.5 h-3.5"/>;
}

function SessionsView({ live = true }) {
  if (live) return <LiveSessionsView />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            Live Sessions
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>LIVE
            </span>
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">{sessions.length} active sessions · auto-refresh 10s</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg flex items-center gap-2 transition-colors">
            <RefreshCw className="w-4 h-4"/>Refresh
          </button>
          <button className="px-3 py-2 bg-rose-600/90 hover:bg-rose-600 text-white text-sm rounded-lg flex items-center gap-2 transition-colors font-medium">
            <Power className="w-4 h-4"/>Bulk Disconnect
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Active</div>
          <div className="text-2xl font-semibold text-white mt-1 tabular-nums">771</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Throughput</div>
          <div className="text-2xl font-semibold text-white mt-1 tabular-nums">2.4 Gbps</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Avg Duration</div>
          <div className="text-2xl font-semibold text-white mt-1 tabular-nums">2h 18m</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">EAP-TLS</div>
          <div className="text-2xl font-semibold text-white mt-1 tabular-nums">42%</div>
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 bg-zinc-900/40">
              <th className="px-4 py-3 font-medium">User / Device</th>
              <th className="px-4 py-3 font-medium">MAC</th>
              <th className="px-4 py-3 font-medium">Access Point</th>
              <th className="px-4 py-3 font-medium">SSID / VLAN</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 font-medium">Traffic</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">EAP</th>
              <th className="px-4 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {sessions.map(s => (
              <tr key={s.id} className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="text-zinc-100 font-medium">{s.user}</div>
                  <div className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5"><DeviceIcon device={s.device}/>{s.device}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">{s.mac}</td>
                <td className="px-4 py-3 text-zinc-300">{s.ap}</td>
                <td className="px-4 py-3">
                  <div className="text-zinc-300">{s.ssid}</div>
                  <div className="text-xs text-zinc-500">VLAN {s.vlan}</div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">{s.ip}</td>
                <td className="px-4 py-3 text-zinc-300 tabular-nums">{s.bytes}</td>
                <td className="px-4 py-3 text-zinc-300 tabular-nums">{s.duration}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.method === 'EAP-TLS' ? 'bg-violet-500/15 text-violet-400' : 'bg-sky-500/15 text-sky-400'}`}>{s.method}</span>
                </td>
                <td className="px-4 py-3">
                  <button className="p-1 hover:bg-rose-500/20 rounded text-zinc-500 hover:text-rose-400 transition-colors" title="Disconnect">
                    <Power className="w-4 h-4"/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupsView({ live = true }) {
  if (live) return <LiveGroupsView/>;
  const groups = [
    { name: 'Staff', users: 412, vlan: 20, sessionTimeout: '8h', simulUse: 5, color: 'bg-emerald-500' },
    { name: 'Engineering', users: 184, vlan: 30, sessionTimeout: '12h', simulUse: 8, color: 'bg-indigo-500' },
    { name: 'Contractor', users: 47, vlan: 40, sessionTimeout: '4h', simulUse: 2, color: 'bg-amber-500' },
    { name: 'Guest', users: 132, vlan: 99, sessionTimeout: '1h', simulUse: 1, color: 'bg-rose-500' },
    { name: 'IoT', users: 72, vlan: 50, sessionTimeout: '∞', simulUse: 1, color: 'bg-cyan-500' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Groups & Policy</h2>
          <p className="text-sm text-zinc-500 mt-0.5">VLAN assignment, session limits, and bandwidth per group</p>
        </div>
        <button className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg flex items-center gap-2 transition-colors font-medium">
          <Plus className="w-4 h-4"/>New Group
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {groups.map(g => (
          <div key={g.name} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${g.color} bg-opacity-20 flex items-center justify-center`}>
                  <Layers className="w-5 h-5 text-white"/>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">{g.name}</h3>
                  <p className="text-xs text-zinc-500">{g.users} users assigned</p>
                </div>
              </div>
              <button className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-200">
                <Edit3 className="w-4 h-4"/>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-zinc-800">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">VLAN</div>
                <div className="text-lg font-semibold text-white tabular-nums mt-0.5">{g.vlan}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Timeout</div>
                <div className="text-lg font-semibold text-white tabular-nums mt-0.5">{g.sessionTimeout}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Max Sessions</div>
                <div className="text-lg font-semibold text-white tabular-nums mt-0.5">{g.simulUse}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NasView({ live = true }) {
  if (live) return <LiveNasView/>;
  const nas = [
    { name: 'AP-HQ-F1-01', ip: '10.40.1.1', site: 'HQ-Floor1', type: 'Ubiquiti U6-Pro', status: 'online', clients: 23 },
    { name: 'AP-HQ-F1-02', ip: '10.40.1.2', site: 'HQ-Floor1', type: 'Ubiquiti U6-Pro', status: 'online', clients: 18 },
    { name: 'AP-HQ-F2-04', ip: '10.40.2.4', site: 'HQ-Floor2', type: 'Aruba AP-515', status: 'online', clients: 31 },
    { name: 'AP-HQ-F3-09', ip: '10.40.3.9', site: 'HQ-Floor3', type: 'Aruba AP-515', status: 'silent', clients: 0 },
    { name: 'WLC-Main', ip: '10.40.0.1', site: 'HQ-Core', type: 'Cisco 9800-L', status: 'online', clients: 0 },
    { name: 'SW-Edge-01', ip: '10.40.0.10', site: 'HQ-Core', type: 'Cisco C9300', status: 'online', clients: 4 },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">NAS Devices</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{nas.length} configured · {nas.filter(n=>n.status==='online').length} online</p>
        </div>
        <button className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg flex items-center gap-2 transition-colors font-medium">
          <Plus className="w-4 h-4"/>Add NAS
        </button>
      </div>
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
              <th className="px-4 py-3 font-medium">Device</th>
              <th className="px-4 py-3 font-medium">IP Address</th>
              <th className="px-4 py-3 font-medium">Site</th>
              <th className="px-4 py-3 font-medium">Hardware</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Clients</th>
              <th className="px-4 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {nas.map(n => (
              <tr key={n.name} className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Radio className={`w-4 h-4 ${n.status==='online' ? 'text-emerald-400' : 'text-rose-400'}`}/>
                    <span className="text-zinc-100 font-medium">{n.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">{n.ip}</td>
                <td className="px-4 py-3 text-zinc-300">{n.site}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{n.type}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${n.status==='online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${n.status==='online' ? 'bg-emerald-400' : 'bg-rose-400'}`}/>
                    {n.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-300 tabular-nums">{n.clients}</td>
                <td className="px-4 py-3">
                  <button className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-zinc-200">
                    <MoreVertical className="w-4 h-4"/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditView({ live = true }) {
  if (live) return <LiveAuditView/>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Audit Log</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Immutable record of all admin actions</p>
        </div>
        <button className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg flex items-center gap-2 transition-colors">
          <Download className="w-4 h-4"/>Export
        </button>
      </div>
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {audit.map(a => (
          <div key={a.id} className="px-5 py-4 flex items-center gap-4 hover:bg-zinc-800/20 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-indigo-400"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-100 font-medium">{a.actor}</span>
                <ChevronRight className="w-3 h-3 text-zinc-600"/>
                <span className="font-mono text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-indigo-400">{a.action}</span>
                <ChevronRight className="w-3 h-3 text-zinc-600"/>
                <span className="text-zinc-300">{a.target}</span>
              </div>
              <div className="text-xs text-zinc-500 mt-1">from {a.ip}</div>
            </div>
            <div className="text-xs text-zinc-500 tabular-nums">{a.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocsView() {
  return <LiveAdminDocsView/>;
}

function SettingsView({ live = true }) {
  if (live) return <LiveSettingsView/>;
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-white">Settings</h2>
        <p className="text-sm text-zinc-500 mt-0.5">Platform configuration and policy defaults</p>
      </div>
      {[
        { icon: KeyRound, title: 'Authentication', desc: 'Password policy, MFA enforcement, session lifetime' },
        { icon: Lock, title: 'Security', desc: 'Rate limits, lockout thresholds, CSRF settings' },
        { icon: Database, title: 'RADIUS Integration', desc: 'Server endpoints, shared secret rotation, reconciliation' },
        { icon: Bell, title: 'Notifications', desc: 'SMTP settings, alert routing, webhook endpoints' },
        { icon: Globe, title: 'EAP Certificate', desc: 'Server cert · expires 2026-06-22 · 27 days remaining' },
      ].map((s, i) => {
        const Icon = s.icon;
        return (
          <button key={i} className="w-full bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 flex items-center gap-4 text-left transition-colors group">
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-zinc-300"/>
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">{s.title}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{s.desc}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors"/>
          </button>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const [view, setView] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { user, logout, token } = useAuth();
  const initials = (user?.fullName || user?.username || 'AD').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();

  const titles = {
    overview: 'Overview',
    users: 'Users',
    devices: 'Device Approvals',
    sessions: 'Live Sessions',
    groups: 'Groups & Policy',
    nas: 'NAS Devices',
    audit: 'Audit Log',
    settings: 'Settings',
    docs: 'Documentation',
  };

  // Fetch initial pending device count
  const refreshPendingCount = useCallback(async () => {
    if (!token) return;
    try {
      const result = await listAdminDevices(token, { status: 'pending', pageSize: 1 });
      setPendingCount(result.total ?? result.items?.length ?? 0);
    } catch {
      // ignore — badge is cosmetic
    }
  }, [token]);

  useEffect(() => { void refreshPendingCount(); }, [refreshPendingCount]);

  // Update badge in real-time via SSE; play ting on new device connection
  useSSE(token, {
    'device.pending': () => { playNotificationSound(); void refreshPendingCount(); },
    'device.decided': () => void refreshPendingCount(),
  });

  const navigate = (id) => {
    setView(id);
    setSidebarOpen(false); // close sidebar on mobile after navigation
  };

  const SidebarContent = () => (
    <>
      <div className="p-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5}/>
          </div>
          <div>
            <div className="text-sm font-semibold text-white tracking-tight">RadiusOps</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Admin Console</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(n => {
          const Icon = n.icon;
          const active = view === n.id;
          const isDevices = n.id === 'devices';
          return (
            <button key={n.id} onClick={() => navigate(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                active ? 'bg-indigo-600/20 text-white' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'
              }`}>
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-indigo-400' : ''}`}/>
              <span className="font-medium flex-1 text-left">{n.label}</span>
              {isDevices && pendingCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px]">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
              {active && !isDevices && <div className="ml-auto w-1 h-1 rounded-full bg-indigo-400"/>}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-zinc-800">
        <div className="bg-zinc-800/50 rounded-lg p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{user?.fullName || user?.username || 'Admin'}</div>
            <div className="text-[10px] text-zinc-500 truncate flex items-center gap-1">
              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400"/>{user?.mfaEnabled ? 'MFA enabled' : 'Signed in'}
            </div>
          </div>
          <button onClick={logout} title="Sign out" className="text-zinc-500 hover:text-zinc-200 flex-shrink-0"><LogOut className="w-3.5 h-3.5"/></button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans" style={{fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif'}}>
      <div className="flex">

        {/* ── Desktop sidebar (always visible ≥ lg) ─────────────────── */}
        <aside className="hidden lg:flex w-60 min-h-screen bg-zinc-900/80 border-r border-zinc-800 flex-col flex-shrink-0">
          <SidebarContent />
        </aside>

        {/* ── Mobile sidebar overlay ─────────────────────────────────── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-zinc-900 border-r border-zinc-800 transition-transform duration-200 lg:hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-end p-3 border-b border-zinc-800">
            <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <SidebarContent />
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          {/* Top bar */}
          <header className="h-14 border-b border-zinc-800 px-4 lg:px-6 flex items-center justify-between bg-zinc-950/60 backdrop-blur sticky top-0 z-10">
            <div className="flex items-center gap-3">
              {/* Hamburger — mobile only */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 text-sm">
                <span className="hidden sm:inline text-zinc-500">Operations</span>
                <ChevronRight className="hidden sm:inline w-3 h-3 text-zinc-700"/>
                <span className="text-zinc-100 font-medium">{titles[view]}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Bell with real pending count */}
              <button
                onClick={() => navigate('devices')}
                className="relative p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors"
                title={pendingCount > 0 ? `${pendingCount} device(s) awaiting approval` : 'Device approvals'}
              >
                <Bell className="w-4 h-4"/>
                {pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-rose-500 px-1 py-0.5 text-[9px] font-bold text-white min-w-[16px] leading-none">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
              <div className="h-5 w-px bg-zinc-800"/>
              <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
                <span className="text-xs text-zinc-400">All systems operational</span>
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="p-4 lg:p-6">
            {view === 'overview'  && <Overview/>}
            {view === 'users'     && <UsersView/>}
            {view === 'devices'   && <LiveDeviceApprovalsView/>}
            {view === 'sessions'  && <SessionsView/>}
            {view === 'groups'    && <GroupsView/>}
            {view === 'nas'       && <NasView/>}
            {view === 'audit'     && <AuditView/>}
            {view === 'settings'  && <SettingsView/>}
            {view === 'docs'      && <DocsView/>}
          </div>

          {/* Footer */}
          <footer className="border-t border-zinc-800/60 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-600">
              © {new Date().getFullYear()} <span className="text-zinc-500 font-medium">RadiusOps</span> — Enterprise Wi-Fi Access Control
            </span>
            <span className="text-[11px] text-zinc-600">
              Developed &amp; maintained by{' '}
              <span className="text-zinc-400 font-medium">Md. Asiqur Rahman Khan</span>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
