import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Clock, Edit3, Info, Laptop, Plus, ShieldCheck, Star, Trash2, X } from "lucide-react";
import type { UserDevice } from "@app/shared";
import { useAuth } from "../auth/AuthContext";
import { createMyDevice, deleteMyDevice, listMyDevices, updateMyDevice } from "../api/endpoints";

function lastSeenLabel(value: string | null): string {
  if (!value) return "Not yet observed";
  return `Last seen ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))}`;
}

export function SelfServiceDevices() {
  const { token } = useAuth();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [mac, setMac] = useState("");
  const [password, setPassword] = useState("");
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; password: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = async () => {
    if (!token) return;
    const result = await listMyDevices(token);
    setDevices(result);
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listMyDevices(token)
      .then((result) => {
        if (!cancelled) setDevices(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setNotice({ ok: false, text: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const addDevice = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setBusy("add");
    setNotice(null);
    try {
      await createMyDevice(token, { label: label || null, mac, currentPassword: password });
      setNotice({ ok: true, text: "Device verified and bound to your network account." });
      setShowAdd(false);
      setLabel("");
      setMac("");
      setPassword("");
      await refresh();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Unable to add device" });
    } finally {
      setBusy(null);
    }
  };

  const saveLabel = async () => {
    if (!token || !editing) return;
    setBusy(editing.id);
    try {
      await updateMyDevice(token, editing.id, { label: editing.label || null });
      setEditing(null);
      await refresh();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Unable to rename device" });
    } finally {
      setBusy(null);
    }
  };

  const makePrimary = async (device: UserDevice) => {
    if (!token || device.isPrimary) return;
    setBusy(device.id);
    try {
      await updateMyDevice(token, device.id, { isPrimary: true });
      await refresh();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Unable to mark primary device" });
    } finally {
      setBusy(null);
    }
  };

  const removeDevice = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !removing) return;
    setBusy(removing.id);
    setNotice(null);
    try {
      await deleteMyDevice(token, removing.id, removing.password);
      setRemoving(null);
      setNotice({ ok: true, text: "Device removed. Active sessions for this MAC were disconnected where available." });
      await refresh();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Unable to remove device" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-stone-900 tracking-tight" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Your devices</h2>
          <p className="text-sm text-stone-500 mt-1">Bound MAC addresses permitted for your network sign-in. Limit 5.</p>
        </div>
        <button
          onClick={() => setShowAdd((current) => !current)}
          className="bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium px-4 py-2.5 rounded-xl flex items-center gap-2"
        >
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAdd ? "Close" : "Add device"}
        </button>
      </div>

      {notice && (
        <div className={`border rounded-xl px-4 py-3 text-sm ${notice.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
          {notice.text}
        </div>
      )}

      {showAdd && (
        <form onSubmit={addDevice} className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-amber-900">Register the address used on this Wi-Fi network</div>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Phones may use a private address per network. Register that address, or turn off MAC randomization for this corporate SSID only.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Device name (e.g. Work laptop)"
              className="px-3 py-2.5 bg-white border border-amber-300 rounded-lg text-sm focus:outline-none focus:border-amber-500"
            />
            <input
              required
              value={mac}
              onChange={(event) => setMac(event.target.value)}
              placeholder="MAC address (AA:BB:CC:DD:EE:FF)"
              className="px-3 py-2.5 bg-white border border-amber-300 rounded-lg text-sm font-mono focus:outline-none focus:border-amber-500"
            />
          </div>
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Confirm with your current password"
            className="w-full px-3 py-2.5 bg-white border border-amber-300 rounded-lg text-sm focus:outline-none focus:border-amber-500"
          />
          <div className="flex justify-end">
            <button disabled={busy === "add"} className="px-4 py-2 bg-amber-700 hover:bg-amber-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg">
              {busy === "add" ? "Verifying..." : "Verify and bind device"}
            </button>
          </div>
        </form>
      )}

      {!loading && devices.length === 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl px-6 py-10 text-center text-sm text-stone-500">
          No device is bound yet. Add your first device to enable MAC-aware network access.
        </div>
      )}

      <div className="space-y-3">
        {devices.map((device) => (
          <div key={device.id} className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center flex-shrink-0">
                <Laptop className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                {editing?.id === device.id ? (
                  <div className="flex gap-2 mb-2">
                    <input
                      value={editing.label}
                      onChange={(event) => setEditing({ ...editing, label: event.target.value })}
                      className="px-3 py-1.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-stone-500"
                    />
                    <button onClick={saveLabel} className="text-sm text-stone-900 font-medium">Save</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-stone-900">{device.label || "Unnamed device"}</h3>
                    {device.isPrimary && <span className="text-[10px] font-semibold uppercase bg-stone-900 text-white px-1.5 py-0.5 rounded">Primary</span>}
                    {device.verifiedAt && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs text-stone-500">
                  <span className="font-mono uppercase">{device.mac}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{lastSeenLabel(device.lastSeenAt)}</span>
                </div>
              </div>
              <div className="flex gap-1">
                {!device.isPrimary && (
                  <button onClick={() => makePrimary(device)} className="p-2 hover:bg-amber-50 rounded-lg text-stone-500 hover:text-amber-700" title="Make primary">
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setEditing({ id: device.id, label: device.label || "" })} className="p-2 hover:bg-stone-100 rounded-lg text-stone-500" title="Rename">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => setRemoving({ id: device.id, password: "" })} className="p-2 hover:bg-rose-50 rounded-lg text-stone-500 hover:text-rose-600" title="Remove">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {removing?.id === device.id && (
              <form onSubmit={removeDevice} className="mt-4 pt-4 border-t border-stone-100 flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span className="text-xs text-stone-600">Removal disconnects current sessions for this MAC.</span>
                <input
                  required
                  type="password"
                  value={removing.password}
                  onChange={(event) => setRemoving({ ...removing, password: event.target.value })}
                  placeholder="Current password"
                  className="ml-auto px-3 py-2 border border-stone-300 rounded-lg text-sm"
                />
                <button disabled={busy === device.id} className="px-3 py-2 bg-rose-600 text-white rounded-lg text-sm disabled:opacity-60">Remove</button>
              </form>
            )}
          </div>
        ))}
      </div>

      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-stone-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-stone-600 leading-relaxed">
          MAC binding is an extra check alongside your password or device certificate. It is not a replacement for strong authentication.
        </p>
      </div>
    </div>
  );
}
