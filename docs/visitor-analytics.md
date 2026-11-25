# Visitor analytics

Owner-only visitor statistics for the storefront: a floating live-visitor counter and the
**Admin → Analytics** dashboard (`/admin/analytics`). History starts when tracking is first
deployed; visits before that were never recorded and cannot be recovered.

## What is counted

| Term | Meaning |
| --- | --- |
| **Visitor** | One browser, identified by a random anonymous id in `localStorage` (`catchy.an.vid`). Not linked to the customer account. Clearing site data, private windows and other devices count as new visitors. |
| **Session** | Activity from one browser with no gap longer than 30 minutes. All tabs of the browser share it; a refresh keeps it. |
| **Page view** | A change of page (URL pathname) in a tab. Catalog filters/sorting (query changes), re-renders and React StrictMode double effects do not add views. Admin (`/admin…`) and POS (`/pos…`) screens are not tracked. |
| **Product view** | A page view of `/product/:id`. |
| **Unique visitors (one day)** | Exact count of browser ids that reported their first visit of that day (store time zone `Asia/Hebron`). |
| **Unique visitors (several days, months)** | HyperLogLog estimate (4096 registers, typically within ±2%, near-exact for small numbers), so a visitor who returns on several days is counted once. Shown with "≈". |
| **Live visitors** | Sessions that sent a page view or heartbeat in the last 5 minutes. A browser sends at most one presence update per 2 minutes, only while a tab is visible and the visitor was active in the last 30 minutes. Closing the last tab sends a "leave" beacon; a closed tab can otherwise still count for up to 5 minutes. Shown as an estimate ("≈"). |

## Traffic sources

Classified once per session start, on the server, from data the browser sends: the referrer's
**host name only**, the `utm_source` value, and whether `gclid`/`fbclid` were present.

- **Google / Instagram / Facebook**: referrer host (web or Android app package), `utm_source`, or click id.
- **Direct**: no referrer and no campaign tag. Apps that hide the referrer (some in-app browsers) also land here.
- **Other referral**: any other site; its host is kept (e.g. `wa.me`).
- **Unknown**: a referrer was present but could not be read.

## Privacy

No names, emails, phone numbers, passwords, auth tokens, IP addresses or full URLs are stored.
Order ids and query strings are dropped from paths. Visitor ids are stored only as a HyperLogLog
register entry (not reversible to the id). Browsers sending Global Privacy Control or
Do Not Track are not tracked. Known bots are ignored. There is no existing consent banner in the app;
if one is added, gate `AnalyticsTracker` on it.

## Architecture and security

- Browser → `POST /api/analytics/collect` (public, same-origin only, rate limited, validated) → the
  Cloud Run server writes with the Admin SDK. Firestore rules have **no** match for the analytics
  collections, so browsers cannot read or write them directly (default deny); no rule change is needed.
- `POST /api/admin/analytics/live` and `/summary` require a Firebase ID token that passes the
  server's owner check (`verifyAdminRequest`, same as order cancel/returns). A profile role of
  `admin` alone is not enough.
- Collections:
  - `analytics_daily/{YYYY-MM-DD}_{0..3}`: daily counters in 4 shards (spreads write load); one
    write per page view (`increment` / `arrayUnion`, no read).
  - `analytics_presence/{hash}`: one doc per session (`lastSeen`, `seq`, `expiresAt`). Live count =
    count query on `lastSeen`. `expiresAt` allows enabling a Firestore TTL policy later to delete old docs.
- Local testing: the Vite dev server mirrors these routes **only in emulator mode**
  (`npm run dev:emulator`); plain `npm run dev` does not track.

## Limitations

- Counts are per browser, not per person; ad/script blockers and DNT/GPC browsers are not counted.
- The browser decides "first visit today" and "new session"; a tampered client could inflate numbers
  (rate limiting and validation reduce, but do not remove, this).
- Live visitors are per 5-minute window and approximate.
- The rate limiter is per server instance (in memory).
