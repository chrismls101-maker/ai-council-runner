import * as Sentry from "@sentry/electron/renderer";
import { sanitizeLogText } from "../shared/logSanitizer.ts";

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type BeforeSendEvent = NonNullable<Parameters<NonNullable<SentryInitOptions["beforeSend"]>>[0]>;

function scrubString(s: string): string {
  let out = sanitizeLogText(s);
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
  enabled: process.env.NODE_ENV === "production",
  attachStacktrace: true,
  maxBreadcrumbs: 40,
  beforeSend(event) {
    return scrubEvent(event);
  },
});
