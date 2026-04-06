# Code Review Summary — Phase 6: Admin UI (Webhooks Tab)

**Date:** 2026-03-26
**Reviewer:** code-reviewer agent
**Plan:** `plans/20260324-1500-outbound-webhooks/phase-06-admin-ui.md`

---

## Scope

- **Files reviewed:** `web/src/app/admin/page.tsx` (lines 59–149, 316–389, 1121–1393)
- **Lines of code analyzed:** ~280 net-new lines (webhook-related)
- **Review focus:** Phase 6 additions only — Webhooks tab, `WebhookFormPanel`, `WebhookRow`
- **Build:** `npm run build` — PASSED, zero TypeScript errors

---

## Overall Assessment

Implementation is solid. Follows existing admin page patterns faithfully (inline styles, CSS vars, no external libs). All six targeted behaviors work as designed. Two medium-priority issues and two low-priority ones identified; no critical or security-breaking problems found.

---

## Critical Issues

None.

---

## High Priority Findings

None.

---

## Medium Priority Improvements

### M1 — `testResult` persists across tab switches; no cleanup on tab change

**Location:** `page.tsx:145, 162–167`

`testResult`, `selectedWebhook`, `deliveries`, and `webhookForm` are never cleared when the admin navigates away from the Webhooks tab. Returning to the tab shows stale test result rows inline — could confuse admins into thinking a recent test was just run.

The existing `useEffect` that loads webhooks on tab entry does not reset this state:

```ts
// line 156-159
useEffect(() => {
  if (tab === "webhooks" && authenticated) fetchWebhooks();
}, [tab, authenticated]);
```

Fix: reset transient display state on tab entry:

```ts
useEffect(() => {
  if (tab === "webhooks" && authenticated) {
    setTestResult(null);
    setSelectedWebhook(null);
    setDeliveries([]);
    fetchWebhooks();
  }
}, [tab, authenticated]);
```

---

### M2 — `newSecret` can re-appear after create if user switches tabs and returns

**Location:** `page.tsx:146, 334, 1138`

`newSecret` is only cleared by the Dismiss button (`setNewSecret(null)`) or clicking "+ Tạo Webhook" again (`setNewSecret(null)` at line 1130). If user creates a webhook, switches tab without dismissing, then returns — the yellow secret banner re-appears. This contradicts the "shown once" guarantee in the plan.

Fix: add `setNewSecret(null)` to the tab-entry cleanup in M1 above.

---

## Low Priority Suggestions

### L1 — URL validated client-side only by `<input type="url">` — no JS guard before submit

**Location:** `page.tsx:1265`

The form submit button disables on `!local.targetUrl`, but `type="url"` validation only runs on native form submit — not on the `onClick` handler. A user can type a non-URL string (e.g. `"foo"`) and the button enables as long as `targetUrl` is truthy. The API will reject it, and `webhookError` will surface the message, so no data loss occurs — just a round-trip. Low severity because the API (`isValidWebhookUrl`) is the real gate.

No urgent fix needed; optionally add `local.targetUrl.startsWith("https://")` to the disabled check.

---

### L2 — `responseBody` from external server rendered via JSX text node — XSS-safe but truncated display

**Location:** `page.tsx:1344–1348`

```tsx
<code style={{ ..., whiteSpace: "nowrap" }}>
  {testResult.responseBody}
</code>
```

`testResult.responseBody` is rendered as a React text child, **not** via `dangerouslySetInnerHTML`. No XSS risk. The API already slices it to 2000 chars. The `whiteSpace: "nowrap"` + `textOverflow: "ellipsis"` means long responses silently truncate — acceptable for an admin tool. No action required.

---

## Positive Observations

- **Secret banner design is correct.** It appears only after a successful create response (`data.secret`), is cleared explicitly by both Dismiss and the "+ Tạo" button. No API route re-exposes the secret (confirmed: `GET /api/admin/webhooks` comment "secret intentionally omitted"). The banner itself never triggers a re-fetch that could re-populate `newSecret`.
- **Delivery log toggle is clean.** `loadDeliveries` guards the toggle-off path (`if (selectedWebhook === webhookId) { setSelectedWebhook(null); return; }`) before any fetch. The `WebhookRow` receives deliveries filtered by `selectedWebhook === w.id`, so stale deliveries from a previously expanded row can't bleed into another row.
- **Form validation present.** Submit button disabled on `!local.targetUrl || local.events.length === 0`. Error string wired through `webhookError` prop from parent, shown inside the form panel. Create and Update paths both set `setWebhookError("")` before each request.
- **Delete state cleanup.** `handleDeleteWebhook` clears `selectedWebhook` if the deleted webhook was expanded (line 371). Prevents orphaned expanded row.
- **Type safety.** All interfaces match the API response shapes verified against route files. `tsc --noEmit` passes. Build passes with zero warnings.
- **Pattern consistency.** Inline styles, CSS vars, Vietnamese UI strings, `className="card"`, `relTime()` utility — all match the rest of the file.
- **`statusColor` helper** scoped inside `WebhookRow` function — doesn't pollute module scope; used in both the delivery table and last-delivery cell.

---

## Recommended Actions

1. **Fix M1 + M2 together** — in the `useEffect([tab, authenticated])`, add these resets on entry:
   ```ts
   setTestResult(null);
   setSelectedWebhook(null);
   setDeliveries([]);
   setNewSecret(null);   // enforces "shown once" guarantee
   ```
2. **L1** — optionally tighten the URL check in the submit button's `disabled` predicate (not urgent).

---

## Task Completeness Verification

All todos from `phase-06-admin-ui.md` are implemented:

| Task | Status |
|------|--------|
| Add "webhooks" to Tab type | DONE (line 59) |
| Add webhook state variables | DONE (lines 141–148) |
| Add Webhooks tab button to tab bar | DONE (lines 582–583) |
| Implement webhook list table | DONE (lines 1163–1196) |
| Implement WebhookFormPanel component | DONE (lines 1214–1276) |
| Implement secret display banner | DONE (lines 1138–1151) |
| Implement test delivery button + result | DONE (lines 1336–1352 in WebhookRow) |
| Implement delivery log expansion | DONE (lines 1354–1386 in WebhookRow) |
| Implement active/inactive toggle | DONE (`toggleWebhookActive`, line 359) |
| Implement delete with confirmation | DONE (`handleDeleteWebhook`, line 368) |
| Add useEffect for data loading | DONE (lines 156–159) |
| Test full UI flow end-to-end | PENDING — not verifiable in code review |

**All code tasks complete. End-to-end UI smoke test still pending (human/browser).**

---

## Metrics

- Type Coverage: 100% (all interfaces explicit, no `any`)
- Test Coverage: N/A (no unit tests for admin UI — consistent with rest of file)
- Linting Issues: 0 (build clean, tsc clean)
- Build: PASSED

---

## Unresolved Questions

1. **`TestResult.webhookId` field** — set by the UI: `setTestResult({ webhookId, ...data })`. The API response for `test.ping` does not include `webhookId` — the field is injected client-side. This is intentional (correct), but worth noting as the `TestResult` interface declares `webhookId: string` even though it is not part of the API contract.

2. **`WEBHOOK_EVENT_OPTIONS` in `page.tsx` (line 1204)** differs slightly from the canonical list in `lib/webhookEvents.ts`. If new event types are added to the lib, `WEBHOOK_EVENT_OPTIONS` in the admin page will silently fall out of sync. Low risk today (7 types are identical), but a shared import would be cleaner.
