import * as Sentry from "@sentry/electron/renderer";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Only report errors in packaged (production) builds — dev runs produce
  // expected errors (401s, audio probe failures, missing env) that are noise.
  enabled: process.env.NODE_ENV === "production",
});
