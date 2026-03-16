# Auth Strategy Quick Reference
**For Claude Reporter (10-50 internal users)**

## Recommended: Auth.js v5 + Magic Link

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: Email Magic Links (Week 1-4)                     │
├─────────────────────────────────────────────────────────────┤
│  • User enters email → gets login link in inbox              │
│  • Click link → auto-logged in → session created             │
│  • Email domain restrict: @company.com only                  │
│  • Setup: 1-2 weeks, Cost: $0 (+ email delivery)            │
│  • Data: 100% owned, stored in Postgres                     │
└─────────────────────────────────────────────────────────────┘
          ↓ (6 months later, if needed)
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: SAML Upgrade (optional, 2-3 weeks)               │
├─────────────────────────────────────────────────────────────┤
│  • Add Auth.js + BoxyHQ SAML provider                       │
│  • Users can SSO via Azure AD or Google Workspace           │
│  • Magic link still available as fallback                   │
│  • No code rewrite needed                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Decision Tree

```
Are you on Microsoft 365 NOW?
├─ YES → Azure Entra ID ($0-6/user, SAML native, 4-8h setup)
└─ NO  → Are you willing to use external service?
         ├─ YES → Clerk ($0 free tier, 30min setup)
         └─ NO  → Auth.js v5 ($0, 1-2w setup, full control)
```

---

## Side-by-Side: Top 3 Options

| | **Auth.js v5** | **Clerk** | **Azure Entra ID** |
|---|---|---|---|
| Setup Time | 1-2w | 30min | 4-8h |
| Cost | $0 | $0 free tier | $0 (M365) or $6/u |
| Data Ownership | 100% | Clerk | Microsoft |
| Domain Restrict | ✓ Custom | ✓ Built-in | ✓ Native |
| SAML | Via BoxyHQ | Pro plan | Native |
| Next.js DX | Excellent | Excellent | Okay |
| Maintenance | Self | Managed | Managed |
| **Best For** | Control-first | Speed-first | M365 shops |

---

## Migration from Current UUID System

| Aspect | How It Works |
|--------|---|
| **Current** | Email → UUID (copied to clipboard) → stored in ~/.claude-reporter-uuid |
| **New (Phase 1)** | Email → Magic link → Click link → Session cookie + DB |
| **Parallel** | Old UUID still works 6mo, prompt users to migrate |
| **Hook Script** | Instead of reading UUID file, extract email from session |

---

## Implementation Sketch (Auth.js v5)

### Prisma Migration
```prisma
// Add these models to schema.prisma
model Account { ... }
model Session { ... }
model VerificationToken { ... }
```

### auth.ts (New File)
```typescript
import NextAuth from "@auth/core"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Email from "@auth/core/providers/email"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Email({
      server: process.env.EMAIL_SERVER, // SendGrid or SMTP
      from: "noreply@company.com"
    })
  ],
  callbacks: {
    signIn({ profile }) {
      // Domain restrict: @company.com only
      if (!profile?.email?.endsWith('@company.com')) return false
      return true
    }
  }
})
```

### Pages & Routes
- `/login` — Email form (new, replaces /login with UUID)
- `/api/auth/[...nextauth]` — Auth endpoint
- Update components to use `auth()` instead of localStorage UUID

---

## Email Provider Options

| Service | Cost | Setup | Notes |
|---------|------|-------|-------|
| **SendGrid** | $20-100/mo | Easy | Most reliable, good API |
| **AWS SES** | $0.10/1K | Medium | Cheap but reputation risk |
| **Resend** | $20/mo | Easy | Dev-friendly, TypeScript |
| **Mailgun** | $20/mo | Easy | Solid, webhook support |
| **Local SMTP** | $0 | Hard | Your own mail server (risky) |

**Recommendation**: SendGrid (Pro: reliable, good docs) or Resend (if TypeScript first)

---

## Quick Cost Estimate (Annual, 50 users)

| Solution | Year 1 | Notes |
|----------|--------|-------|
| Auth.js + SendGrid | $240-1200 | $20-100/mo SendGrid + dev time |
| Auth.js + Resend | $240 | $20/mo fixed |
| Clerk (free tier) | $0-1200 | $0 if <50K MAU; $25+/mo pro |
| Azure Entra ID (M365) | $0 | Included with Office 365 |
| Auth.js (self-hosted mail) | $0 | Risky, not recommended |

---

## 30-Day Implementation Plan

```
Week 1:  Setup Auth.js, Prisma models, email provider (staging)
Week 2:  Create login page, magic link flow, test end-to-end
Week 3:  Domain restriction, session management, edge cases
Week 4:  Deploy to prod, monitor, gradual rollout (10%→50%→100%)

Post-launch:
- Monitor email delivery rates, fix bounces
- Collect user feedback, tweak UX
- Plan SAML upgrade (month 6)
```

---

## Red Flags to Avoid

❌ Self-hosted mail server (unreliable, email ends up in spam)
❌ Storing passwords in app (security nightmare)
❌ Magic links without expiration (30min max, or tokens can be reused)
❌ No domain restriction (accidental personal email registrations)
❌ Hardcoding email credentials in code (use .env)
❌ No rate limiting on email sends (abuse vector)

---

## When to Upgrade to SAML

Upgrade Phase 2 (SAML) when:
- Company wants centralized IdP (Azure AD or Google Workspace)
- Admin burden from manual user creation is high
- Regulatory compliance requires audit logs + MFA
- SSO across multiple internal tools needed

**No rush**: Magic link works fine for 1-2 years with <100 users.

---

## Questions to Answer Before Starting

1. Email service: SendGrid? Resend? SMTP?
2. User creation: Admin pre-creates or self-register with domain check?
3. Session timeout: 30 days? 7 days?
4. Magic link expiration: 15min? 30min?
5. Admin panel: Change, revoke user sessions?
6. Audit: Log all auth events?
7. MFA: Required? Nice-to-have? Can add later?
8. Department/role: Keep existing dept_head + member roles? (Yes, reuse from current system)

---

## Recommended Reading

- Auth.js Docs: https://authjs.dev
- Magic Links Guide: https://supertokens.com/blog/magiclinks
- Next.js 15 Auth Guide: https://clerk.com/articles/complete-authentication-guide-for-nextjs-app-router
- SAML vs OAuth: https://ssojet.com/blog/saml-vs-oauth-2-0-whats-the-difference-a-practical-guide-for-developers/
