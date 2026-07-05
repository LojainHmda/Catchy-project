# Announcement Banner Admin Control — Design

**Date:** 2026-06-28

## Goal

Let an admin show/hide and edit the green free-shipping announcement bar (currently
hardcoded in the Navbar) from a new tab inside the Discounts admin page.

## Background

- The green bar lives at `src/components/Navbar.tsx` (~lines 38-46). Text is hardcoded
  bilingual: `'توصيل مجاني للطلبيات فوق 300 شيكل'` / `'Free shipping on orders over 300 ILS'`.
- The app already has a settings pattern: a Firestore doc `site_settings/site` read live
  via `onSnapshot` (see `TickerBanner.tsx`) and written via `setDoc(..., { merge: true })`
  (see `AdminHeroVideo.tsx`).
- Firestore rules already allow `site_settings/{docId}`: public read, owner write
  (`firestore.rules:85-88`). No rules change needed.

## Data model

Add fields to the existing `site_settings/site` document:

| Field                 | Type    | Default                                          |
|-----------------------|---------|--------------------------------------------------|
| `announcementEnabled` | boolean | `true`                                           |
| `announcementTextAr`  | string  | `'توصيل مجاني للطلبيات فوق 300 شيكل'`             |
| `announcementTextEn`  | string  | `'Free shipping on orders over 300 ILS'`         |

## Components

### 1. `src/lib/announcementBanner.ts` (new) — single source of truth
- `ANNOUNCEMENT_DEFAULTS` — default settings (equal to current hardcoded text).
- `type AnnouncementSettings = { enabled; textAr; textEn }`.
- `subscribeAnnouncement(cb): () => void` — `onSnapshot` on `site_settings/site`,
  maps doc → settings with defaults, falls back to defaults on error.
- `saveAnnouncement(patch): Promise<void>` — `setDoc(site_settings/site, patch, { merge: true })`.

### 2. `src/components/Navbar.tsx` (edit)
- Subscribe via `subscribeAnnouncement` in a `useEffect`.
- `!enabled` → render no bar.
- Else keep existing green styling + `local_shipping` icon; text = `isAr ? textAr : textEn`.
- Start from defaults so there is no flash before the first snapshot (default == current text).

### 3. `src/components/admin/AnnouncementBannerPanel.tsx` (new) — admin editor
- Loads current settings via `subscribeAnnouncement`.
- Controls: enabled toggle (reuse `AdminToggle`), Arabic text input, English text input.
- Live preview rendering the green bar exactly as shown on the site.
- Save button → `saveAnnouncement`; success/failure → `toast`.

### 4. `src/pages/AdminDiscounts.tsx` (edit)
- Add `activeTab: 'discounts' | 'banner'` state and a tab strip under the page header.
- `discounts` tab → existing search + table + apply modal (unchanged logic).
- `banner` tab → `<AnnouncementBannerPanel />`.

## Error handling

- Snapshot error → fall back to `ANNOUNCEMENT_DEFAULTS` (matches `TickerBanner` behavior).
- Save failure → `toast.error`.
- Empty text while enabled → fall back to default text for that language.

## Verification

- `npm run lint` (`tsc --noEmit`) passes.
- Manual: toggle off hides the bar live; editing text updates the Navbar live;
  reload persists; both AR and EN render correctly.

## Out of scope (YAGNI)

Colors, fonts, icon toggle, scheduling. The scrolling ticker banner stays untouched.
