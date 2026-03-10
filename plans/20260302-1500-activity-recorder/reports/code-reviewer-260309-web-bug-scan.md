# Code Review Summary

## Scope
- Files reviewed: All files under `web/src/app/api/`, `web/server.ts`, `web/src/components/`, `web/src/lib/`, `web/prisma/schema.prisma`, `web/src/app/**/*.tsx`
- Lines of code analyzed: ~1,800
- Review focus: Full codebase bug scan
- Updated plans: N/A (no TODO tracking in plan for this review)

---

## Overall Assessment

The codebase is small and reasonably structured. Most logic is straightforward. However, several security, correctness, and reliability bugs were found — ranging from critical auth weaknesses to medium-priority race conditions and data-integrity gaps.

---

## Critical Issues

### BUG-01 — Admin credentials stored in plaintext Base64 token (Security: Critical)
**File:** `web/src/app/api/admin/login/route.ts` line 17
**File:** `web/src/lib/adminAuth.ts` lines 6–11

The admin "token" is just `base64(email:password)`. This is HTTP Basic Auth semantics, not a session token. Problems:
1. The credentials are recoverable by anyone who can read `localStorage` (e.g. via XSS).
2. `localStorage.setItem("admin-token", t)` in `web/src/app/admin/page.tsx` line 129 stores the credentials forever.
3. No expiry, no revocation — once leaked, valid indefinitely.
4. `checkAdminAuth` does a plain string comparison with no timing-safe equality, making it trivially vulnerable to timing attacks (though low impact given the simple equality via JS strings).

**Impact:** Any XSS vulnerability anywhere on the page grants permanent admin access.

### BUG-02 — `/api/events` and `/api/events/batch` have no authentication (Security: Critical)
**File:** `web/src/app/api/events/route.ts`
**File:** `web/src/app/api/events/batch/route.ts`

Both endpoints accept arbitrary JSON from the internet with zero authentication. An attacker can:
- Inject fake sessions and events for any user
- Forge token usage data (inflate costs for any user)
- Forge `user_uuid` to associate malicious sessions with real users
- Flood the DB (no rate limiting)

The hook script is unauthenticated by design, but without at least a shared secret there is no integrity guarantee at all.

### BUG-03 — `/api/install` reflects `Host` header into a shell script (Security: Critical)
**File:** `web/src/app/api/install/route.ts` lines 5–8

```ts
const host = hdrs.get("host") ?? req.headers.get("host") ?? "vibe-mcp.onebot.meobeo.ai";
const serverUrl = `${proto}://${host}`;
```

The `Host` header is attacker-controlled. The resulting `serverUrl` is interpolated verbatim into a bash script served to users (`curl ... | bash`). A malicious reverse proxy or man-in-the-middle can inject an arbitrary URL, redirecting script download to an attacker-controlled server.

Additionally the script does `curl -s "$SERVER_URL/hooks/reporter.sh" | sed ... > "$HOOK_SCRIPT"` — if `$SERVER_URL` is compromised this writes arbitrary code to the user's machine and executes it.

---

## High Priority Findings

### BUG-04 — Race condition: `ensureSession` has a TOCTOU between `findUnique` and `upsert` (High)
**File:** `web/src/lib/processEvent.ts` lines 130–150

```ts
const existing = await prisma.session.findUnique(...)
await prisma.session.upsert(...)
```

`existing` is fetched then used in the `upsert` `update` clause to decide whether to set `userId`. Between the two DB calls another concurrent request can change the session. This is unlikely in practice (SQLite serialises writes) but is a logic flaw: if `existing` is `null` on the `findUnique` call but the session is then created by a concurrent request before the `upsert`, the `update` branch will fire with `validUserId` applied even if `existing.userId` was already set.

### BUG-05 — Token increment can double-count on concurrent PostToolUse events (High)
**File:** `web/src/lib/processEvent.ts` lines 46–56

```ts
await prisma.session.update({
  where: { id: sessionId },
  data: {
    inputTokens: { increment: usage.input_tokens ?? 0 },
    ...
  },
});
```

The `increment` is applied after the event `create`. If two `PostToolUse` events arrive simultaneously for the same session, both will independently increment the counters. In SQLite this is serialised by the write lock, so it is actually safe — but in a future migration to PostgreSQL it would be a real race. Low immediate risk; flagged as architectural concern.

### BUG-06 — `admin/page.tsx`: `loadAll` called without `await`, auth error check only on `usersRes` (High)
**File:** `web/src/app/admin/page.tsx` lines 87–111

```ts
async function loadAll(t: string) {
  ...
  const [usersRes, projsRes, deptsRes] = await Promise.all([...]);
  if (usersRes.status === 401) { ... return; }
  const [ud, pd, dd] = await Promise.all([usersRes.json(), projsRes.json(), deptsRes.json()]);
```

- `loadAll` is called without `await` in multiple places (lines 83, 131, 159, 173, 182, 194, 207). Any error thrown inside is silently swallowed — no user-facing error.
- The 401 check only guards `usersRes`. If `projsRes` or `deptsRes` returns 401 (e.g. token expired mid-load), `projsRes.json()` and `deptsRes.json()` are still called. The JSON body for a 401 response is `{"error":"Unauthorized"}` — `pd.projects` and `dd.departments` will be `undefined`, and the `?? []` fallbacks will kick in, silently hiding the auth failure.

### BUG-07 — `SessionList`: socket created before UUID loaded, stale closure over `myUuid` (High)
**File:** `web/src/components/SessionList.tsx` lines 213–227

```ts
useEffect(() => {
  if (!adminMode && !myUuid) return;
  load(adminMode ? null : myUuid);
  const socket = io({ path: "/socket.io" });
  socket.on("session_updated", ({ sessionId }) => {
    ...
    load(adminMode ? null : myUuid);  // <-- stale closure
  });
  return () => { socket.disconnect(); };
}, [myUuid, adminMode]);
```

The `load` calls inside the socket handler use `myUuid` from the closure at the time the effect ran. Because `myUuid` is in the dependency array the effect is re-run when UUID becomes available, which disconnects and reconnects the socket — this creates a brief window where events can be missed. Not a crash bug but causes flickering and potential missed real-time updates.

### BUG-08 — `admin/users/[id]/route.ts`: wrong HTTP status for email conflict (Medium-High)
**File:** `web/src/app/api/admin/users/[id]/route.ts` line 48

```ts
} catch {
  return NextResponse.json({ error: "User not found or email conflict" }, { status: 404 });
}
```

A Prisma unique constraint violation (email already taken) returns `404 Not Found` instead of `409 Conflict`. The admin UI cannot distinguish between "user doesn't exist" and "email already taken", so it will show an unhelpful error.

### BUG-09 — `departments/[id]/route.ts` DELETE: no error handling (High)
**File:** `web/src/app/api/admin/departments/[id]/route.ts` lines 31–43

If `prisma.department.delete` fails (e.g., department not found), an unhandled exception propagates and Next.js returns a 500 with a stack trace in development mode. No try/catch wraps the delete.

---

## Medium Priority Improvements

### BUG-10 — `auth/register`: `upsert` update logic is always a no-op for existing users (Medium)
**File:** `web/src/app/api/auth/register/route.ts` lines 19–28

```ts
const existing = await prisma.user.findUnique({ where: { email } });
const updateData = body.departmentId ? { departmentId: body.departmentId } : {};
...
update: existing ? {} : updateData,
```

If `existing` is truthy, `update` is always `{}` — the department is never updated for returning users. This means a user who re-registers to change their department gets silently ignored. The comment "UUID cũ sẽ được trả về" suggests this is intentional, but the `updateData` variable is dead code when `existing` is truthy.

### BUG-11 — `sessions/route.ts`: `userId` from query string is unvalidated (Medium)
**File:** `web/src/app/api/sessions/route.ts` line 8
**File:** `web/src/app/api/stats/route.ts` line 6
**File:** `web/src/app/api/report/route.ts` line 12
**File:** `web/src/app/api/projects/route.ts` line 6

These endpoints accept `?userId=<anything>` with no validation. While Prisma's parameterized queries prevent SQL injection, any authenticated user can query data for any other user's UUID by guessing or enumerating UUIDs. There is no authorization check to confirm the requesting party owns the UUID. Unauthenticated access to other users' session data is possible.

### BUG-12 — `processEvent.ts`: no size limit on `batch` events array (Medium)
**File:** `web/src/app/api/events/batch/route.ts` lines 12–28

The batch endpoint accepts an array of unlimited size. A malicious or misconfigured client can send thousands of events in one request, causing the server to make N database writes synchronously. No pagination, no max size guard beyond the implicit body size limit.

### BUG-13 — `report/page.tsx`: `setTimeout` timers not cleared on unmount (Medium)
**File:** `web/src/app/report/page.tsx` lines 135, 147–154

```ts
timerRef.current.forEach(clearTimeout);
timerRef.current = [];
```

Timers are only cleared on the next `generate()` call. If the component unmounts before all timers fire, `setCurrentProject` and `setVisibleProjects` are called on an unmounted component, causing React state-update warnings. There is no `useEffect` cleanup returning a function that clears `timerRef.current`.

### BUG-14 — `admin/page.tsx`: sorting `userGroups` dereferences `sessions[0]` without null guard (Medium)
**File:** `web/src/components/SessionList.tsx` line 238

```ts
.sort(([, a], [, b]) => new Date(b.sessions[0].startedAt).getTime() - ...)
```

If a user group somehow has zero sessions (can't happen currently but defensively incorrect), `b.sessions[0]` is `undefined` and `.startedAt` throws.

### BUG-15 — `groupByProject` sorts on `b[0].startedAt` without checking array bounds (Medium)
**File:** `web/src/components/SessionList.tsx` line 52

```ts
([, a], [, b]) => new Date(b[0].startedAt).getTime() - new Date(a[0].startedAt).getTime()
```

Same issue: if any group is empty the sort comparator dereferences `b[0]` which is `undefined`.

### BUG-16 — XSS risk in exported HTML report (Medium)
**File:** `web/src/app/report/page.tsx` lines 50–62

```ts
const rows = data.projects.map((p) => `
  <tr>
    <td><strong>${p.name}</strong><br><small>${p.path}</small></td>
    ...
    <td>${p.users.join(", ") || "—"}</td>
  </tr>`)
```

`p.name`, `p.path`, and `p.users` are interpolated verbatim into HTML. If a project path or user email contains `<script>` or other HTML, the exported report file will contain XSS. An attacker who can influence project paths (any authenticated user) can embed malicious HTML in the downloaded report.

---

## Low Priority Suggestions

### BUG-17 — `server.ts`: CORS `origin: "*"` allows any origin for Socket.io (Low)
**File:** `web/server.ts` line 28

Wildcard CORS for WebSocket allows any website to connect to the Socket.io server and receive all emitted events (`session_started`, `session_updated`, live event data). This leaks real-time activity to any page the user visits.

### BUG-18 — `processEvent.ts`: `hook_event_name` cast without validation (Low)
**File:** `web/src/lib/processEvent.ts` line 5

`(body.hook_event_name as string) ?? ""` — if `hook_event_name` is not a string (e.g. a number or object), the cast succeeds but `switch` falls through to `default` silently. A non-string value is coerced to string only in a loose JS sense.

### BUG-19 — `prisma.ts`: singleton not applied in production (Low)
**File:** `web/src/lib/prisma.ts` line 11

```ts
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

In production, `globalForPrisma.prisma` is never set, so every module import creates a new `PrismaClient` instance. In Next.js with a custom server (not edge/serverless), this means the connection pool is re-created per module hot-reload in dev but not a problem in prod because the process is long-lived. However if any dynamic import or code-splitting boundary recreates the module, a new client is created. This is a latent bug — the standard pattern sets the singleton unconditionally.

### BUG-20 — `sessions/[id]/page.tsx`: self-fetch via HTTP to `localhost` in production (Low)
**File:** `web/src/app/sessions/[id]/page.tsx` lines 34–41

```ts
const base = process.env.NEXT_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3456}`;
const res = await fetch(`${base}/api/sessions/${id}`, { cache: "no-store" });
```

This Server Component fetches its own API over HTTP (loopback). In Docker/production this works only if the container can reach itself on port 3456. If `PORT` is different or the container is not named `localhost`, this silently returns `null` and the page shows 404. The API route should be called directly (import `prisma` and query directly) instead of making an HTTP round-trip.

---

## Positive Observations

- Prisma parameterized queries throughout — no raw SQL injection risk.
- Proper `try/catch` around JSON parsing in most POST handlers.
- `processEvent` correctly uses `upsert` to handle out-of-order events gracefully.
- `userPrompt` and `assistantMessage` are truncated at DB write time (`slice(0, 10_000)`) preventing unbounded storage.
- Socket.io instance is shared via `globalThis` cleanly — correct pattern for Next.js custom server.
- Batch event handler continues processing even after individual failures (fault-tolerant loop).

---

## Recommended Actions

1. **[Critical]** Add a shared secret / HMAC signature to `/api/events` and `/api/events/batch` to authenticate hook payloads.
2. **[Critical]** Replace the Base64 admin token with a proper signed session (e.g. `crypto.randomBytes(32)` stored server-side with expiry), never storing credentials in `localStorage`.
3. **[Critical]** Validate and sanitize the `Host` header in `/api/install` against an allowlist (`ALLOWED_HOSTS` env var) before using it to construct the shell script URL.
4. **[High]** Add authorization to `/api/sessions`, `/api/stats`, `/api/report`, `/api/projects` — verify the requesting UUID matches the `userId` query param (e.g. via a cookie/token, not just query param matching).
5. **[High]** Wrap `DELETE` in `/api/admin/departments/[id]` in try/catch and return 404 for not-found.
6. **[High]** Fix HTTP status on email conflict in `/api/admin/users/[id]` to 409.
7. **[Medium]** Escape HTML in the exported report (`p.name`, `p.path`, `p.users`) to prevent XSS in downloaded files.
8. **[Medium]** Add `useEffect` cleanup for `timerRef.current` in `report/page.tsx`.
9. **[Medium]** Add a max batch size (e.g. 500) in `/api/events/batch`.
10. **[Low]** Restrict Socket.io CORS `origin` to the actual app domain.
11. **[Low]** Replace the self-HTTP-fetch in `sessions/[id]/page.tsx` with a direct Prisma call.
12. **[Low]** Set the Prisma singleton unconditionally (remove the `!== "production"` guard).

---

## Metrics
- Type Coverage: No typecheck run (no tsconfig strict config visible); several `as string` casts are unsafe
- Test Coverage: No tests found in `web/`
- Linting Issues: Not run (no ESLint config found)

---

## Unresolved Questions

- Is the `/api/events` endpoint intentionally unauthenticated (hook script design), or is a shared secret planned? If intentional, at minimum rate-limiting should be added.
- Is the admin password expected to be rotated, or is it a fixed env var? If fixed, the Base64 token never expires — is this acceptable?
- Does the deployment use HTTPS (via NPM proxy)? If yes, `x-forwarded-proto` should be trusted only from trusted proxies, not blindly from any request header.
