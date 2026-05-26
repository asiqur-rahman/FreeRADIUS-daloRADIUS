import { HelpCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export function LiveProfileView() {
  const { user } = useAuth();
  if (!user) return null;
  const name = user.fullName || user.username;
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="space-y-6 max-w-2xl">
      <div><h2 className="text-2xl font-semibold text-stone-900" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Profile</h2><p className="text-sm text-stone-500 mt-1">Your account information.</p></div>
      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-center gap-4 pb-5 border-b border-stone-100"><div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-2xl font-semibold text-white">{initials}</div><div><div className="text-lg font-semibold text-stone-900">{name}</div><div className="text-sm text-stone-500">{user.email}</div></div></div>
        <div className="grid grid-cols-2 gap-4 pt-5 text-sm"><div><div className="text-xs uppercase text-stone-500">Username</div><div className="font-mono mt-1">{user.username}</div></div><div><div className="text-xs uppercase text-stone-500">Status</div><div className="mt-1 capitalize">{user.status}</div></div><div><div className="text-xs uppercase text-stone-500">Groups</div><div className="mt-1">{user.groups.map((group) => group.name).join(", ") || "None"}</div></div><div><div className="text-xs uppercase text-stone-500">MFA</div><div className="mt-1">{user.mfaEnabled ? "Enabled" : "Disabled"}</div></div></div>
      </div>
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex items-center gap-4"><HelpCircle className="w-5 h-5 text-stone-400" /><div className="text-sm text-stone-700">Contact an administrator to update your name or email address.</div></div>
    </div>
  );
}
