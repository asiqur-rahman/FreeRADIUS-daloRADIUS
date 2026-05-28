// Top-level router. Sends authenticated users to the role-appropriate
// dashboard; anonymous users see the login page.
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import ClientPortal from "./pages/ClientPortal.jsx";
import { PwaUpdateBanner } from "./components/PwaUpdateBanner";
import { PwaInstallPrompt } from "./components/PwaInstallPrompt";

export function App() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <div className="text-sm">Loading…</div>
      </div>
    );
  }

  if (status === "anonymous" || !user) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <PwaUpdateBanner />
        <PwaInstallPrompt />
      </>
    );
  }

  return (
    <>
      <Routes>
        {user.role === "admin" ? (
          <>
            <Route path="/admin/*" element={<AdminDashboard />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </>
        ) : (
          <>
            <Route path="/portal/*" element={<ClientPortal />} />
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </>
        )}
      </Routes>
      <PwaUpdateBanner />
      <PwaInstallPrompt />
    </>
  );
}
