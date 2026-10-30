# Browser and keyboard verification

Eastbank's deterministic Node financial tests remain the authoritative calculation checks. This additional smoke test drives **real headless Chromium** through the UI and the loopback HTTP server, with a synthetic fixture database created in a temporary directory. It does not touch the working demo database.

## Run locally

Requires Node.js 24:

```sh
npm install
npx playwright install chromium
npm test
npm run test:browser
```

The GitHub Actions `browser` job installs Chromium and Linux dependencies and executes `npm run test:browser`. This developer-only dependency is not loaded by the application in production. The main application continues to run without additional packages through `npm start`.

## What the browser smoke test checks

1. Payroll overview loads with the 2026-11-09 synthetic scenario and the expected −$6,500 headroom.
2. First keyboard Tab reaches a visible **Skip to main content** link.
3. Navigation opens the collections action desk, marks the active page, and supports filtering without dropping focus.
4. CSV preview shows two ready rows but does not persist them; acceptance increases the invoice count from 12 to 14 without changing payroll headroom.
5. Reload preserves the accepted import in the local SQLite database.
6. Downloaded Markdown brief contains the same recorded cash, headroom, and accepted invoice seen in the app.
7. The main page remains within the mobile viewport at 390px width and the collections desk stays reachable.
8. No uncaught browser JavaScript errors occur.

The app also gives keyboard focus to the new page heading on navigation, exposes semantic navigation and main landmarks, makes horizontally scrollable tables focusable, and uses a polite status region for success or errors.

## Limits

This is a **browser smoke test**, not a complete WCAG audit. It does not prove screen-reader usability, keyboard coverage of every form state, color-contrast conformance, touch-device behavior, production authorization, browser compatibility outside Chromium, or accounting accuracy against external records.

The browser test starts a fresh server and uses a non-default loopback port plus disposable SQLite path through `EASTBANK_PORT` and `EASTBANK_DATA_DIR`. The server remains bound to `127.0.0.1` and rejects unrelated Origin headers. No external services, model calls, banks, or customer data are involved.
