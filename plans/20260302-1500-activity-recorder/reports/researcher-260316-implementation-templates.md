# Auth.js v5 + Magic Link: Implementation Templates
**Ready-to-use code for Claude Reporter**

---

## 1. Updated Prisma Schema

Add these models to `web/prisma/schema.prisma`:

```prisma
// Keep existing User, Department, Session, Event models
// Add Auth.js required models:

model Account {
  id                 String  @id @default(cuid())
  userId             String  @map("user_id")
  type               String
  provider           String
  providerAccountId  String  @map("provider_account_id")
  refresh_token      String? @db.Text
  access_token       String? @db.Text
  expires_at         Int?
  token_type         String?
  scope              String?
  id_token           String? @db.Text
  session_state      String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
  @@map("accounts")
}

model AuthSession {
  id        String   @id @default(cuid())
  sessionToken String @unique @map("session_token")
  userId    String   @map("user_id")
  expires   DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("auth_sessions")
}

model VerificationToken {
  identifier String
  token      String @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}
```

Update `User` model to add foreign key to auth:
```prisma
model User {
  // ... existing fields ...
  accounts       Account[]
  authSessions   AuthSession[]
}
```

Migration:
```bash
npx prisma migrate dev --name add_auth_models
```

---

## 2. Create auth.ts Configuration

**File**: `web/auth.ts`

```typescript
import { PrismaAdapter } from "@auth/prisma-adapter"
import NextAuth from "next-auth"
import Email from "next-auth/providers/email"
import { prisma } from "@/lib/prisma"
import nodemailer from "nodemailer"

// Email transport configuration
let transporter: nodemailer.Transporter

if (process.env.NODE_ENV === 'production') {
  // Production: Use SendGrid or Resend
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
    secure: process.env.EMAIL_SERVER_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  })
} else {
  // Dev: Use local SMTP (Mailtrap, Ethereal, etc)
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST || 'localhost',
    port: parseInt(process.env.EMAIL_SERVER_PORT || '1025'),
    secure: false,
  })
}

const sendVerificationRequest = async ({
  identifier: email,
  url,
  provider,
  theme,
}: {
  identifier: string
  url: string
  provider: any
  theme: string
}) => {
  const { host } = new URL(url)
  const result = await transporter.sendMail({
    to: email,
    from: `${provider.from}`,
    subject: `Sign in to ${host}`,
    text: text({ url, host }),
    html: html({ url, host, theme }),
  })

  const failed = result.rejected.concat(result.pending).filter(Boolean)
  if (failed.length) {
    throw new Error(`Email(s) (${failed.join(', ')}) could not be sent`)
  }
}

function html({ url, host, theme }: Record<string, string>) {
  const escapedHost = host.replace(/\./g, '&#8203;.')
  const brandColor = theme === 'dark' ? '#ffffff' : '#000000'
  const color = {
    background: '#f9f9f9',
    text: '#444',
    mainBackground: '#ffffff',
    buttonBackground: '#6366f1', // indigo-500
    buttonBorder: '#6366f1',
    buttonText: '#ffffff',
  }

  return `
<body style="background: ${color.background};">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 0 20px;">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="border-radius: 5px; background: ${color.mainBackground};">
              <table border="0" cellspacing="0" cellpadding="20">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius: 5px; background: ${color.buttonBackground}; text-align: center;">
                          <a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${color.buttonText}; text-decoration: none; text-align: center; display: block; padding: 10px 20px;">Sign in to Claude Reporter</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 20px 0; font-size: 14px; color: ${color.text};">
                    <p>This link expires in 24 hours.</p>
                    <p style="color: #999; font-size: 12px;">
                      If you didn't request this email, you can safely ignore it.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
  `.trim()
}

function text({ url, host }: Record<string, string>) {
  return `Sign in to ${host}\n${url}\n\n`
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Email({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
        secure: process.env.EMAIL_SERVER_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM || 'noreply@claude-reporter.dev',
      sendVerificationRequest,
      maxAge: 24 * 60 * 60, // 24 hours
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    /**
     * Domain restriction: Only allow @company.com emails
     */
    async signIn({ user, account, profile, email, credentials }) {
      const userEmail = user.email || email?.email || ''
      const allowedDomain = '@' + (process.env.AUTH_DOMAIN || 'company.com')

      if (!userEmail.endsWith(allowedDomain)) {
        console.warn(`[Auth] Rejected sign-in: ${userEmail} (not ${allowedDomain})`)
        throw new Error(
          `Only emails matching ${allowedDomain} are allowed. You used: ${userEmail}`
        )
      }

      return true
    },

    /**
     * JWT callback (if using JWT sessions)
     * Usually not needed with Prisma adapter (DB sessions)
     */
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.role = user.role
      }
      return token
    },

    /**
     * Session callback (add custom data to session)
     */
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        session.user.role = user.role as string
        session.user.departmentId = user.departmentId || undefined
      }
      return session
    },

    /**
     * Redirect callback (where to send after sign-in)
     */
    async redirect({ url, baseUrl }) {
      // Allow relative URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`
      // Allow same origin URLs
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
  },

  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log(`[Auth] User ${user.email} signed in (new: ${isNewUser})`)
    },
    async signOut({ token }) {
      console.log(`[Auth] User signed out`)
    },
  },

  debug: process.env.NODE_ENV === 'development',
})
```

---

## 3. Environment Variables

**File**: `web/.env.local` (dev) or docker-compose.yml (prod)

```env
# Auth.js core config
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=$(openssl rand -base64 32)  # Run once: openssl rand -base64 32

# Email provider (SendGrid example)
EMAIL_SERVER_HOST=smtp.sendgrid.net
EMAIL_SERVER_PORT=587
EMAIL_SERVER_SECURE=false
EMAIL_SERVER_USER=apikey
EMAIL_SERVER_PASSWORD=SG.xxx...  # SendGrid API key
EMAIL_FROM=noreply@company.com

# Domain restriction
AUTH_DOMAIN=company.com

# Database (already have this)
DATABASE_URL=postgresql://...
```

For production on VPS:
```bash
# Generate random NEXTAUTH_SECRET
openssl rand -base64 32
# Copy output to docker-compose.yml environment

# Also set SendGrid API key in docker-compose
```

---

## 4. Update API Route: /api/auth/[...nextauth]

**File**: `web/src/app/api/auth/[...nextauth]/route.ts`

```typescript
import { handlers } from "@/auth"

export const { GET, POST } = handlers
```

That's it! Auth.js automatically handles all callbacks.

---

## 5. New Login Page

**File**: `web/src/app/login/page.tsx` (replaces current)

```typescript
"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)

  const callbackUrl = searchParams.get("callbackUrl") || "/"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const result = await signIn("email", {
        email,
        callbackUrl,
        redirect: false,
      })

      if (result?.ok) {
        setSent(true)
      } else {
        setError(result?.error || "Failed to send sign-in email")
      }
    } catch (err) {
      setError("An error occurred. Please try again.")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div style={{ maxWidth: 480, margin: "4rem auto" }}>
        <div className="card">
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{
              width: 60, height: 60, borderRadius: "50%", background: "var(--green)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "2rem", margin: "0 auto 1rem",
            }}>✓</div>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Check your email</h1>
          </div>
          <p style={{ color: "var(--text-muted)", textAlign: "center", marginBottom: "1.5rem" }}>
            We've sent a sign-in link to <strong>{email}</strong>. Click the link to sign in.
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center" }}>
            Link expires in 24 hours. Check spam folder if you don't see it.
          </p>
          <button
            onClick={() => setSent(false)}
            style={{
              display: "block", margin: "1.5rem auto 0", background: "none",
              border: "none", color: "var(--accent)", cursor: "pointer",
              textDecoration: "underline", fontSize: "0.85rem",
            }}
          >
            Try a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: "4rem auto" }}>
      <div className="card">
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Sign in</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Enter your @company.com email to receive a magic link.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              disabled={loading}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "0.5rem 0.75rem",
                color: "var(--text)",
                fontSize: "0.9rem",
                outline: "none",
              }}
            />

            {error && (
              <div style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid #ef4444",
                borderRadius: 6,
                padding: "0.5rem 0.75rem",
                color: "#ef4444",
                fontSize: "0.8rem",
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "0.5rem 1rem",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.85rem",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </div>
        </form>

        <p style={{
          color: "var(--text-muted)", fontSize: "0.7rem",
          marginTop: "1.5rem", textAlign: "center",
        }}>
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
```

---

## 6. Update Middleware (Protect Routes)

**File**: `web/middleware.ts` (create if not exists)

```typescript
import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

export async function middleware(req: NextRequest) {
  const session = await auth()

  // Protected routes
  const protectedRoutes = ["/", "/report", "/sessions", "/dept", "/admin"]
  const isProtected = protectedRoutes.some(route => req.nextUrl.pathname.startsWith(route))

  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Redirect logged-in users away from login page
  if (req.nextUrl.pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

---

## 7. Update Components: Replace localStorage UUID with Session

**File**: `web/src/components/UserBadge.tsx`

```typescript
"use client"

import { useSession } from "next-auth/react"
import { signOut } from "next-auth/react"

export default function UserBadge() {
  const { data: session } = useSession()

  if (!session?.user) return null

  const initials = session.user.email
    ?.split('@')[0]
    .toUpperCase()
    .slice(0, 2)

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "var(--accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: "0.85rem",
      }}>
        {initials}
      </div>
      <div style={{ fontSize: "0.85rem" }}>
        <div style={{ fontWeight: 600 }}>{session.user.name || session.user.email}</div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "0.7rem",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
```

---

## 8. Update Hook Script: Use Session Email Instead of UUID

**File**: `web/public/hooks/reporter.sh` (snippet)

```bash
#!/bin/bash
# Claude Reporter Hook Script

# Get user email from Auth.js session (instead of UUID file)
# This requires Auth.js to write session info to a file first
# OR hook can read from ~/.claude-reporter-email if client stores it

if [ -f "$HOME/.claude-reporter-email" ]; then
  USER_EMAIL=$(cat "$HOME/.claude-reporter-email")
else
  echo "Error: Not signed in to Claude Reporter. Run:"
  echo "  curl -s https://your-domain/api/install | bash"
  exit 1
fi

# ... rest of hook script ...
# Include user_email in events instead of user_uuid

curl -X POST "$SERVER_URL/api/events/batch" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "events": [
    {
      "user_email": "$USER_EMAIL",
      "event_type": "...",
      ...
    }
  ]
}
EOF
```

---

## 9. Update API: Accept Email Instead of UUID

**File**: `web/src/app/api/events/batch/route.ts` (update)

```typescript
import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { events?: any[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const events = body.events || []
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "No events" }, { status: 400 })
  }

  // Get user from session
  const user = await prisma.user.findUnique({
    where: { email: session.user.email! },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Process events with user.id
  for (const event of events) {
    await prisma.event.create({
      data: {
        sessionId: event.sessionId,
        eventType: event.eventType,
        userPrompt: event.userPrompt,
        assistantMessage: event.assistantMessage,
        toolName: event.toolName,
        toolInput: event.toolInput,
        toolOutput: event.toolOutput,
        entryUuid: event.entryUuid,
        // ... other fields ...
        timestamp: new Date(event.timestamp),
      },
    })
  }

  return NextResponse.json({ ok: true, received: events.length })
}
```

---

## 10. Migration: Support Both UUID and Email

Backward compatibility during transition (6 months):

```typescript
// In API route middleware
async function getUserId(req: NextRequest) {
  const session = await auth()

  // Prefer Auth.js session
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })
    if (user) return user.id
  }

  // Fallback to old UUID for backward compat
  const body = await req.json()
  const uuid = body.user_uuid
  if (uuid) {
    const user = await prisma.user.findUnique({
      where: { id: uuid },
    })
    if (user) return user.id
  }

  return null
}
```

---

## 11. Testing Checklist

```
[ ] Email delivery works (check spam folder)
[ ] Magic link expires after 24h
[ ] Domain restriction blocks non-@company.com
[ ] Session persists across browser restart
[ ] Sign-out clears session + redirects
[ ] Protected routes redirect to /login
[ ] Middleware blocks unauthorized requests
[ ] Events API works with new session
[ ] Hook script reads email instead of UUID
[ ] Old UUID still works (backward compat)
[ ] Rate limiting on email sends works
[ ] Edge case: Same email, sign-in twice
[ ] Edge case: Expired link, click again
```

---

## 12. Deployment Checklist

```
[ ] Generate NEXTAUTH_SECRET
[ ] Set EMAIL_* env vars in docker-compose
[ ] Set AUTH_DOMAIN to your company domain
[ ] Run prisma migrate on production
[ ] Test email delivery from prod server
[ ] Monitor email bounce rates
[ ] Set up CloudWatch/monitoring
[ ] Create runbook for debugging
[ ] Write docs for team onboarding
```

---

## Deployment Example (Docker)

Update `web/docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: reporter
      POSTGRES_PASSWORD: reporter_secret
      POSTGRES_DB: claude_reporter
    volumes:
      - postgres_data:/var/lib/postgresql/data

  app:
    build: .
    ports:
      - "3005:3005"
    environment:
      DATABASE_URL: postgresql://reporter:reporter_secret@postgres:5432/claude_reporter
      NEXTAUTH_URL: https://your-domain.com
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}

      EMAIL_SERVER_HOST: smtp.sendgrid.net
      EMAIL_SERVER_PORT: 587
      EMAIL_SERVER_SECURE: "false"
      EMAIL_SERVER_USER: apikey
      EMAIL_SERVER_PASSWORD: ${SENDGRID_API_KEY}
      EMAIL_FROM: noreply@company.com

      AUTH_DOMAIN: company.com

    depends_on:
      - postgres

volumes:
  postgres_data:
```

Deploy:
```bash
# Generate secret once
NEXTAUTH_SECRET=$(openssl rand -base64 32)
SENDGRID_API_KEY=SG.xxx...

# Set in VPS .env or pass directly
cd /home/nhannh/claude-reporter
docker compose up -d
```

---

## Rollback Plan

If issues:

```bash
# Switch back to UUID system (10min)
# 1. Revert auth.ts + login page
# 2. Keep old routes at /login-uuid
# 3. Redirect to /login-uuid in middleware
# 4. Restore event API to accept UUID
# 5. Rollout reversed (100% -> 50% -> 10%)

# Do NOT drop new Prisma tables immediately
# Keep Account, AuthSession, VerificationToken for 30 days
# Then drop with: npx prisma migrate resolve --rolled-back add_auth_models
```

---

## Next Steps

1. **Prep Phase** (2-3 days)
   - Set up SendGrid account + API key
   - Test email delivery locally
   - Review code templates

2. **Dev Phase** (3-5 days)
   - Implement auth.ts + Prisma models
   - Create login page + logout button
   - Update API routes to use session

3. **Staging** (2-3 days)
   - Deploy to staging VPS
   - Test end-to-end email flow
   - Load test email delivery
   - Collect feedback from test users

4. **Production** (1-2 days)
   - Gradual rollout: 10% users
   - Monitor logs + email delivery
   - Gather feedback
   - Full rollout at 100%

5. **Cleanup** (1-2 weeks)
   - Monitor UUID usage
   - Prompt old UUID users to re-login with email
   - Keep backward compat for 6 months

**Total timeline**: 2-3 weeks to production.
