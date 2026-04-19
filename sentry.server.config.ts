import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
    }
    return event;
  },
});
