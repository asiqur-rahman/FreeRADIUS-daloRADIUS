/**
 * useSSE — subscribe to the /api/v1/events Server-Sent Events stream.
 *
 * Opens one EventSource per mounted component.  The connection is kept
 * alive with server-side pings every 25 s.  On network error it
 * reconnects automatically after 5 s.
 *
 * Usage:
 *   useSSE(token, {
 *     "device.pending": (data) => setCount(c => c + 1),
 *     "device.decided": (data) => reload(),
 *   });
 *
 * The handlers object reference may change on every render; the hook
 * stores it in a ref so you don't need to memoise it.
 */

import { useEffect, useRef } from "react";

type EventHandlers = Partial<Record<string, (data: unknown) => void>>;

export function useSSE(
  token: string | null | undefined,
  handlers: EventHandlers,
): void {
  // Keep handlers in a ref so the EventSource listener always calls the
  // latest version without needing to re-subscribe.
  const handlersRef = useRef<EventHandlers>(handlers);
  handlersRef.current = handlers;

  // Capture the event-name set once at mount — we subscribe to exactly
  // these named events for the lifetime of the component.
  const eventNamesRef = useRef<string[]>(Object.keys(handlers));

  useEffect(() => {
    if (!token) return;

    let es: EventSource | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (closed) return;

      const url = `/api/v1/events?token=${encodeURIComponent(token!)}`;
      es = new EventSource(url);

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          retryTimer = setTimeout(connect, 5_000);
        }
      };

      for (const name of eventNamesRef.current) {
        es.addEventListener(name, (e: MessageEvent) => {
          const handler = handlersRef.current[name];
          if (!handler) return;
          try {
            handler(JSON.parse((e as MessageEvent).data));
          } catch {
            handler(e.data);
          }
        });
      }
    }

    connect();

    return () => {
      closed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      es?.close();
    };
  }, [token]);
}
