import * as Sentry from "@sentry/electron/renderer";

// Infer the event type from beforeSend so we don't need a direct @sentry/types import.
type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type BeforeSendEvent = NonNullable<Parameters<NonNullable<SentryInitOptions["beforeSend"]>>[0]>;

/**
 * Scrub long token-shaped strings from Sentry events before they leave the
 * renderer. The renderer never holds API keys directly, but error messages,
 * URLs, or breadcrumb data can still carry fragments. Mirrors the main-process
 * scrubber in src/main/index.ts.
 */
function scrubString(s: string): string {
  // OpenAI bearer tokens.
  let out = s.replace(/sk-[A-Za-z0-9]{20,}/g, "[REDACTED]");
  // Deepgram-style 40+ char hex keys.
  out = out.replace(/\b[0-9a-f]{40,}\b/g, "[REDACTED]");
  // Strip any baked-in SENTRY_DSN so it never appears in its own payload.
  if (process.env.SENTRY_DSN) {
    out = out.replace(process.env.SENTRY_DSN, "[REDACTED]");
  }
  return out;
}

function scrubEvent(event: BeforeSendEvent): BeforeSendEvent {
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = scrubString(ex.value);
    }
  }
  if (event.message) event.message = scrubString(event.message);
  if (event.breadcrumbs?.length) {
    for (const crumb of event.breadcrumbs) {
      if (crumb.message) crumb.message = scrubString(crumb.message);
      if (crumb.data && typeof crumb.data === "object") {
        const data = crumb.data as Record<string, unknown>;
        for (const k of Object.keys(data)) {
          if (typeof data[k] === "string") data[k] = scrubString(data[k] as string);
        }
      }
    }
  }
  return event;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Only report errors in packaged (production) builds — dev runs produce
  // expected errors (401s, audio probe failures, missing env) that are noise.
  enabled: process.env.NODE_ENV === "production",
  attachStacktrace: true,
  maxBreadcrumbs: 40,
  beforeSend(event) {
    return scrubEvent(event);
  },
});
