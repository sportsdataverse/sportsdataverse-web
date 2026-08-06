// Client-side telemetry queue for the /platform area. Fire-and-forget:
// a dead ingest path must never affect the UI (errors swallowed).
type EventType = "pageview" | "platform_action" | "web_vital" | "js_error";
type BeaconEvent = { table: "client_event"; row: Record<string, unknown> };

const queue: BeaconEvent[] = [];
let login: string | null = null;

export function setLogin(l: string | null) {
  login = l;
}

export function track(
  type: EventType,
  fields: { name?: string; value?: number; path?: string } = {}
) {
  queue.push({
    table: "client_event",
    row: {
      type,
      name: fields.name ?? null,
      value: fields.value ?? null,
      path: fields.path ?? (typeof window !== "undefined" ? window.location.pathname : null),
      login,
    },
  });
  if (queue.length >= 10) flush();
}

export function flush() {
  if (queue.length === 0) return;
  const body = JSON.stringify({ events: queue.splice(0, queue.length) });
  try {
    if (
      !navigator.sendBeacon?.(
        "/api/beacon",
        new Blob([body], { type: "application/json" })
      )
    ) {
      fetch("/api/beacon", {
        method: "POST",
        body,
        keepalive: true,
        headers: { "content-type": "application/json" },
      }).catch(() => {});
    }
  } catch {
    /* fail-open */
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
