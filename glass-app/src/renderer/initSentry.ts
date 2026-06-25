import * as Sentry from "@sentry/electron/renderer";
import { sanitizeLogText } from "../shared/logSanitizer.ts";

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
type BeforeSendEvent = NonNullable<Parameters<NonNullable<SentryInitOptions["beforeSend"]>>[0]>;

let activeSentryDsn = process.env.SENTRY_DSN?.trim() ?? "";
let sentryBootstrapped = false;

function scrubString(s: string): string {
  let out = sanitizeLogText(s);
  if (activeSentryDsn) {
    out = out.replace(activeSentryDsn, "[REDACTED]");
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

async function resolveSentryDsn(): Promise<string | undefined> {
  try {
    const fromMain = await window.glass?.getSentryDsn?.();
    if (fromMain?.trim()) return fromMain.trim();
  } catch {
    // preload not ready
  }
  const baked = process.env.SENTRY_DSN?.trim();
  return baked || undefined;
}

export async function bootstrapSentryRenderer(): Promise<void> {
  if (sentryBootstrapped) return;
  sentryBootstrapped = true;

  const dsn = await resolveSentryDsn();
  activeSentryDsn = dsn ?? "";
  if (!dsn) {
    if (import.meta.env.PROD) {
      console.warn("[sentry] SENTRY_DSN not configured — renderer crash reports disabled");
    }
    return;
  }

  Sentry.init({
    dsn,
    enabled: import.meta.env.PROD,
    attachStacktrace: true,
    maxBreadcrumbs: 40,
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
}

void bootstrapSentryRenderer();
