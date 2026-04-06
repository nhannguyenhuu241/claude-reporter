# Phase 6: Admin UI - Webhooks Tab

**Date:** 2026-03-24 | **Status:** Complete | **Est:** 2 days

---

## Context

- [Admin page](../../web/src/app/admin/page.tsx) -- tabbed interface with departments, users, projects, sessions, system
- Current tab type: `"departments" | "users" | "projects" | "sessions" | "system"`
- Auto-refresh pattern: 10s interval on system tab
- [Admin API routes from Phase 3](./phase-03-admin-api.md)

## Overview

Add a "Webhooks" tab to the existing admin dashboard. Shows webhook list with CRUD operations, test delivery button, delivery log viewer, and create/edit modal.

## Key Insights

- Existing admin page uses inline tab state -- add `"webhooks"` to Tab union type
- No external UI library -- all components are plain React + Tailwind-style inline styles
- Follow existing patterns: fetch on tab switch, table layout, action buttons
- Modal pattern not yet established in admin page -- use a simple inline form expansion instead (KISS)

## Requirements

1. New "Webhooks" tab in admin page tab bar
2. Webhook list table: URL, events, status, last delivery, actions
3. Create form: URL input, event type checkboxes, description
4. Edit inline: toggle active, update events/description
5. Test button per webhook: sends test ping, shows result inline
6. Delete with confirmation
7. Delivery log viewer: click webhook row to expand delivery history
8. Secret display: shown once on create in a copyable banner

## Architecture

### Tab Type Update

```typescript
type Tab = "departments" | "users" | "projects" | "sessions" | "system" | "webhooks";
```

### State Additions

```typescript
// Webhook state
const [webhooks, setWebhooks] = useState<AdminWebhook[]>([]);
const [webhookForm, setWebhookForm] = useState<WebhookFormState | null>(null);
const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null); // for delivery logs
const [deliveries, setDeliveries] = useState<DeliveryLog[]>([]);
const [testResult, setTestResult] = useState<TestResult | null>(null);
const [newSecret, setNewSecret] = useState<string | null>(null); // shown once after create
```

### TypeScript Interfaces

```typescript
interface AdminWebhook {
  id: string;
  targetUrl: string;
  description: string | null;
  events: string[];
  active: boolean;
  createdAt: string;
  user: { id: string; email: string } | null;
  deliveryCount: number;
  lastDelivery: {
    status: string;
    statusCode: number | null;
    createdAt: string;
  } | null;
}

interface WebhookFormState {
  mode: "create" | "edit";
  id?: string;
  targetUrl: string;
  description: string;
  events: string[];
  active: boolean;
}

interface DeliveryLog {
  id: string;
  eventType: string;
  eventId: string;
  status: string;
  statusCode: number | null;
  attempts: number;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  succeededAt: string | null;
  failedAt: string | null;
}

interface TestResult {
  webhookId: string;
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  latencyMs: number;
}
```

### Webhook List Table

```tsx
{/* Webhooks Tab */}
{tab === "webhooks" && (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
      <h2>Webhooks</h2>
      <button onClick={() => setWebhookForm({
        mode: "create", targetUrl: "", description: "", events: [], active: true
      })}>
        + Create Webhook
      </button>
    </div>

    {/* Create/Edit Form (inline, above table) */}
    {webhookForm && <WebhookForm ... />}

    {/* Secret Banner (shown once after create) */}
    {newSecret && (
      <div style={{ background: "#fef3c7", padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <strong>Webhook secret (shown once):</strong>
        <code style={{ marginLeft: 8 }}>{newSecret}</code>
        <button onClick={() => { navigator.clipboard.writeText(newSecret); }}>Copy</button>
        <button onClick={() => setNewSecret(null)}>Dismiss</button>
      </div>
    )}

    {/* Webhook Table */}
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>Events</th>
          <th>Owner</th>
          <th>Status</th>
          <th>Last Delivery</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {webhooks.map(w => (
          <React.Fragment key={w.id}>
            <tr>
              <td>{w.targetUrl}</td>
              <td>{w.events.join(", ")}</td>
              <td>{w.user?.email ?? "System"}</td>
              <td>
                <span style={{
                  color: w.active ? "#16a34a" : "#dc2626",
                  fontWeight: "bold"
                }}>
                  {w.active ? "Active" : "Disabled"}
                </span>
              </td>
              <td>
                {w.lastDelivery
                  ? `${w.lastDelivery.status} (${w.lastDelivery.statusCode ?? "—"})`
                  : "No deliveries"}
              </td>
              <td>
                <button onClick={() => handleTest(w.id)}>Test</button>
                <button onClick={() => toggleActive(w.id, !w.active)}>
                  {w.active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => loadDeliveries(w.id)}>Logs</button>
                <button onClick={() => handleDelete(w.id)}>Delete</button>
              </td>
            </tr>
            {/* Expanded delivery logs */}
            {selectedWebhook === w.id && (
              <tr><td colSpan={6}>
                <DeliveryLogTable deliveries={deliveries} />
              </td></tr>
            )}
            {/* Test result */}
            {testResult?.webhookId === w.id && (
              <tr><td colSpan={6}>
                <TestResultBanner result={testResult} />
              </td></tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </div>
)}
```

### Create Form Component

```tsx
function WebhookForm({ form, onSubmit, onCancel }: {
  form: WebhookFormState;
  onSubmit: (form: WebhookFormState) => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState(form);
  const eventTypes = [
    'session.created', 'session.ended',
    'event.tool_use', 'event.assistant_message',
    'event.user_prompt',
  ];

  return (
    <div style={{ border: "1px solid #e5e7eb", padding: 16, borderRadius: 8, marginBottom: 16 }}>
      <h3>{form.mode === "create" ? "Create Webhook" : "Edit Webhook"}</h3>
      <div>
        <label>Endpoint URL</label>
        <input
          type="url"
          value={local.targetUrl}
          onChange={(e) => setLocal({ ...local, targetUrl: e.target.value })}
          placeholder="https://example.com/webhook"
          style={{ width: "100%" }}
        />
      </div>
      <div>
        <label>Description</label>
        <input
          type="text"
          value={local.description}
          onChange={(e) => setLocal({ ...local, description: e.target.value })}
          placeholder="Optional description"
          style={{ width: "100%" }}
        />
      </div>
      <div>
        <label>Events</label>
        {eventTypes.map(evt => (
          <label key={evt} style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={local.events.includes(evt)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...local.events, evt]
                  : local.events.filter(x => x !== evt);
                setLocal({ ...local, events: next });
              }}
            />
            {evt}
          </label>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => onSubmit(local)}>
          {form.mode === "create" ? "Create" : "Save"}
        </button>
        <button onClick={onCancel} style={{ marginLeft: 8 }}>Cancel</button>
      </div>
    </div>
  );
}
```

### Fetch Functions

```typescript
async function fetchWebhooks() {
  const res = await fetch("/api/admin/webhooks", {
    headers: { Cookie: document.cookie },
  });
  if (res.ok) {
    const data = await res.json();
    setWebhooks(data.webhooks);
  }
}

async function handleTest(webhookId: string) {
  setTestResult(null);
  const res = await fetch(`/api/admin/webhooks/${webhookId}/test`, {
    method: "POST",
  });
  const result = await res.json();
  setTestResult({ webhookId, ...result });
}

async function loadDeliveries(webhookId: string) {
  if (selectedWebhook === webhookId) {
    setSelectedWebhook(null);
    return; // toggle off
  }
  const res = await fetch(`/api/admin/webhooks/${webhookId}/deliveries?limit=20`);
  if (res.ok) {
    const data = await res.json();
    setDeliveries(data.deliveries);
    setSelectedWebhook(webhookId);
  }
}

async function handleCreate(form: WebhookFormState) {
  const res = await fetch("/api/admin/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUrl: form.targetUrl,
      events: form.events,
      description: form.description || undefined,
    }),
  });
  if (res.ok) {
    const data = await res.json();
    setNewSecret(data.secret);
    setWebhookForm(null);
    fetchWebhooks();
  }
}

async function toggleActive(id: string, active: boolean) {
  await fetch(`/api/admin/webhooks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  fetchWebhooks();
}

async function handleDelete(id: string) {
  if (!confirm("Delete this webhook and all delivery history?")) return;
  await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
  fetchWebhooks();
}
```

### Tab Bar Update

Add to existing tab buttons in admin page:

```tsx
<button
  onClick={() => setTab("webhooks")}
  style={{ fontWeight: tab === "webhooks" ? "bold" : "normal" }}
>
  Webhooks
</button>
```

### useEffect for Tab Data Loading

```typescript
useEffect(() => {
  if (tab === "webhooks" && authenticated) {
    fetchWebhooks();
  }
}, [tab, authenticated]);
```

## Related Code Files

| File | Change |
|------|--------|
| `web/src/app/admin/page.tsx` | MODIFY -- add "webhooks" tab, webhook state, table, form |

## Implementation Steps

1. Add `"webhooks"` to Tab union type
2. Add webhook-related state variables
3. Add TypeScript interfaces (AdminWebhook, WebhookFormState, DeliveryLog, TestResult)
4. Add "Webhooks" button to tab bar
5. Add useEffect to fetch webhooks on tab switch
6. Implement webhook list table
7. Implement create/edit form (inline above table)
8. Implement test delivery button + result display
9. Implement delivery log expansion (click row to show logs)
10. Implement delete with confirmation
11. Implement secret banner (shown once after create, copyable)
12. Test UI flow: create webhook, see secret, test it, view logs, disable, delete

## Todo

- [x] Add "webhooks" to Tab type
- [x] Add webhook state variables
- [x] Add Webhooks tab button to tab bar
- [x] Implement webhook list table
- [x] Implement WebhookForm component (create/edit)
- [x] Implement secret display banner
- [x] Implement test delivery button + result
- [x] Implement delivery log expansion
- [x] Implement active/inactive toggle
- [x] Implement delete with confirmation
- [x] Add useEffect for data loading
- [x] **[M1+M2 FIX NEEDED]** Reset `testResult`, `selectedWebhook`, `deliveries`, `newSecret` on tab entry (useEffect cleanup)
- [x] Test full UI flow end-to-end (browser smoke test)

## Success Criteria

- "Webhooks" tab visible in admin dashboard
- Can create webhook, see generated secret
- Can test webhook and see HTTP response inline
- Can view delivery history per webhook
- Can enable/disable webhook
- Can delete webhook with confirmation
- UI follows existing admin page patterns (no external component library)

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Admin page.tsx becomes too large | Medium | Keep webhook logic in helper functions; consider extracting to separate component file if >200 lines added |
| Secret displayed but user misses it | Low | Prominent yellow banner with copy button; dismissible only by user action |

## Security Considerations

- Secret shown once in UI, never fetched again from API
- All webhook operations require admin auth
- Delete is confirmed with browser dialog to prevent accidental removal
- No sensitive data (tool input/output) shown in delivery log payloads

## Next Steps

After all 6 phases complete:
- Write integration tests (fake HTTP server, trigger events, verify deliveries)
- Add webhook status to admin system health dashboard
- Document webhook setup in project README
- Consider user-facing UI for webhook management (future enhancement)
