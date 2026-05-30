import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_API_URL ?? "http://localhost:4000";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",

        // Assets to include in the precache manifest
        includeAssets: [
          "favicon.svg",
          "icons/*.png",
          "icons/*.svg",
          "offline.html",
        ],

        manifest: {
          id: "/",
          name: "Nexara",
          short_name: "Nexara",
          description: "Nexara — The Intelligent Nexus of Enterprise Wi-Fi Access Control. PEAP/EAP-TLS device approval & management.",
          lang: "en",
          dir: "ltr",
          theme_color: "#09090b",
          background_color: "#09090b",
          display: "standalone",
          display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
          orientation: "portrait-primary",
          scope: "/",
          start_url: "/?source=pwa",
          categories: ["business", "productivity", "utilities"],

          icons: [
            // "any" — regular icon used by most browsers and desktop installs
            {
              src: "/icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            // "maskable" — Android adaptive icon; uses the same files until
            // purpose-specific icons are generated (see public/icons/README.md).
            {
              src: "/icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],

          shortcuts: [
            {
              name: "Device approvals",
              short_name: "Approvals",
              description: "Review and approve pending device requests",
              url: "/?tab=approvals&source=pwa",
              icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
            },
            {
              name: "Users",
              short_name: "Users",
              description: "Manage WiFi user accounts",
              url: "/?tab=users&source=pwa",
              icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
            },
          ],
        },

        workbox: {
          // SPA — all navigation falls back to /index.html
          navigateFallback: "/index.html",
          // Exclude API calls, SSE, and auth endpoints from SW interception
          navigateFallbackDenylist: [/^\/api\//, /^\/manifest/, /sw\.js$/],

          // Precache all static build output
          globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],

          runtimeCaching: [
            // API responses — NetworkFirst with short cache for offline resilience
            {
              urlPattern: /^\/api\/v1\/(me|auth\/refresh)/,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-auth-cache",
                networkTimeoutSeconds: 5,
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 5, // 5 min
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // Fonts — long-lived CacheFirst
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-stylesheets",
                expiration: {
                  maxEntries: 5,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-webfonts",
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },

        devOptions: {
          // Set to true temporarily to test PWA install banner in dev
          enabled: false,
          type: "module",
          navigateFallback: "/index.html",
        },
      }),
    ],

    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },

    build: {
      target: "es2022",
      sourcemap: true,
    },
  };
});
