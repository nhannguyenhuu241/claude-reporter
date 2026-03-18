# Error Screens & Notifications Design

**Status**: 🚧 In Progress | **Priority**: High | **Date**: 2026-03-17

## Scope

Redesign all error states across the Claude Reporter dashboard with immersive terminal/glitch dark aesthetic.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 01 | [404 — Signal Lost](#) | 🚧 |
| 02 | [500 — Server Crash](#) | 🚧 |
| 03 | [401 — Access Denied](#) | 🚧 |
| 04 | [Toast Notification System](#) | 🚧 |
| 05 | [Inline Error Banner](#) | 🚧 |
| 06 | [globals.css animations](#) | 🚧 |

## Design Language

- **Theme**: Dark terminal / matrix / glitch aesthetic
- **Fonts**: `ui-monospace, "Cascadia Code", "Fira Code"` (existing)
- **Colors**: Existing CSS variables + per-error accent colors
- **404**: Indigo (#6366f1) — "signal lost"
- **500**: Red/Orange (#ef4444 → #f97316) — "server crash"
- **401**: Amber (#eab308 → #f97316) — "access denied"
- **Toast**: Green/Red/Yellow/Indigo per type

## Deliverables

- `src/app/not-found.tsx` — animated glitch 404
- `src/app/error.tsx` — terminal crash 500
- `src/app/unauthorized/page.tsx` — shield lock 401
- `src/components/Toast.tsx` — global toast system + hook
- `src/components/ErrorBanner.tsx` — inline dismissible error
- `src/app/globals.css` — keyframe animations
- `src/app/layout.tsx` — ToastProvider integration
