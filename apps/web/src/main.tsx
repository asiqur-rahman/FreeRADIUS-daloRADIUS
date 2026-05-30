import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { PwaInstallProvider } from "./pwa/PwaInstallContext";
import { ThemeProvider } from "./theme/ThemeContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <PwaInstallProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </PwaInstallProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
