# Internal Company Tool Authentication Analysis
**Date**: 2026-03-16
**Project**: Claude Reporter (Next.js 15 Web Dashboard)
**User Size**: ~10-50 employees
**Admin Model**: Admin-managed (no self-service signup)

---

## Executive Summary

For an internal company tool with ~10-50 users and admin-driven user management, **Email-based Magic Link with domain restrictions + Auth.js v5 SAML support** is the recommended approach. This balances zero infrastructure cost, strong security, and minimal friction.

**Priority Ranking**:
1. **Auth.js v5 + Magic Link + Domain Restrict** (RECOMMENDED)
2. **Azure Entra ID (if on Microsoft 365)**
3. **Better Auth + self-hosted SAML** (if wanting TypeScript-first framework)
4. **Clerk** (if wanting fully managed solution with free tier coverage)

---

## 1. Auth.js v5 (Successor to NextAuth.js)

### Overview
Auth.js is the new name for NextAuth.js v5 — a complete rewrite providing production authentication for Next.js 15+ with full App Router support. It shifted from password-centric to provider-centric design.

### Setup Complexity
- **Easy**: ~1-2 hours for basic email+credentials
- **Medium**: ~4-6 hours with SAML integration
- Data ownership: 100% — stores everything in your PostgreSQL

### Features for Internal Tools
✅ Multi-provider support (Google, GitHub, credentials, SAML via BoxyHQ)
✅ Session management in database (Prisma adapter available)
✅ OAuth 2.0 + SAML 2.0 support
✅ Magic links (passwordless)
✅ MFA ready
✅ Type-safe (TypeScript-first)

### Cost
**Free** — fully open source, no cloud dependency.

### Domain Restriction Strategy
```typescript
// Implement in callback
callbacks: {
  signIn({ profile }) {
    // Allow only @company.com
    if (profile?.email?.endsWith('@company.com')) return true;
    return false;
  }
}
```

### SAML Integration (with BoxyHQ)
Auth.js provides **BoxyHQ SAML** provider — wraps SAML complexity into OAuth 2.0 flow.

```typescript
import { auth } from "@/auth"
import BoxyHQSAML from "@auth/core/providers/boxyhq-saml"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    BoxyHQSAML({
      clientId: process.env.BOXYHQ_CLIENT_ID,
      clientSecret: process.env.BOXYHQ_CLIENT_SECRET,
      issuer: process.env.BOXYHQ_ISSUER
    })
  ]
})
```

### Current Gap
❌ No built-in email domain restriction (must implement in callback)
❌ Magic link implementation requires custom email handling

### Verdict
**Best for**: Teams wanting maximum control, zero external dependencies, strong TypeScript ecosystem. Good for starting with magic links, upgrading to SAML later.

---

## 2. Azure Entra ID (Microsoft Azure AD)

### Overview
Microsoft's enterprise identity platform. Free tier included with Microsoft 365; Pro Plan = $6/user/month.

### Setup Complexity
- **Medium-Hard**: ~4-8 hours (requires Azure Admin console setup)
- Must register app in Azure > configure SAML metadata
- Supports SAML 2.0, OAuth 2.0, OpenID Connect

### Features for Internal Tools
✅ Works seamlessly if company already uses Microsoft 365
✅ Automatic user sync from Azure AD directory
✅ SAML 2.0 + OAuth 2.0
✅ Email domain restriction enforced at platform level
✅ Conditional access policies (IP-based, device-based)
✅ Audit logs, SSO across all Microsoft apps

### Cost
- **Free** (included with Microsoft 365 subscriptions)
- **$6/user/month** if buying standalone Entra ID P1

### Domain Restriction
✅ **Native support** — Azure AD automatically restricts to your tenant domain(@company.com).

### Integration with Next.js
Requires Auth.js or NextAuth with custom SAML provider (less polished than BoxyHQ):

```typescript
// Via Auth.js SAML (manual setup)
// OR use Microsoft's @azure/msal-react for SPA apps
```

Alternative: Microsoft MSAL (JavaScript library) for SPA, but less elegant with Next.js App Router.

### Conditional Access (Advanced)
- Restrict by IP, device compliance, location, risk level
- Require MFA for first login
- Auto-block suspicious sign-ins

### Verdict
**Best for**: Teams already on Microsoft 365. Minimal admin work if infrastructure is already in place.
**NOT best for**: Non-Microsoft organizations (vendor lock-in risk).

---

## 3. Clerk

### Overview
Modern, managed authentication platform. Component-first React/Next.js architecture. 50,000 free Monthly Active Users.

### Setup Complexity
- **Very Easy**: ~30 minutes
- Pre-built components (SignIn, UserButton, SignUp)
- Clerk handles everything (email, passwords, social login, 2FA)

### Features for Internal Tools
✅ Zero infrastructure maintenance
✅ Pre-built UI components (drop-in SignIn/SignUp)
✅ Support for Google, GitHub, Microsoft, Apple OAuth
✅ Email domain restriction via rules engine
✅ SAML SSO support (on Pro plan)
✅ Audit logs, breach detection
✅ Mobile-friendly out-of-box

### Cost
- **Free**: 50,000 Monthly Active Users
- **$25/month**: Pro plan (adds SAML, custom domain)
- For 10-50 users: **Free tier covers 100% of usage**

### Domain Restriction
```typescript
// In Clerk dashboard, create allowlist rule
// OR via API in sign-in callback
```

### SAML Support
SAML available on **Pro plan ($25/month)**. If you're <50 users, free tier covers you unless using SAML.

### Verdict
**Best for**: Teams wanting zero setup burden, pre-built UI, generous free tier.
**NOT best for**: Teams avoiding external dependencies or needing SAML at zero cost.

---

## 4. Better Auth

### Overview
TypeScript-first, open-source authentication framework (YC-backed). Supports multi-tenancy, SSO, SAML, SCIM.

### Setup Complexity
- **Easy-Medium**: ~2-3 hours
- Framework-agnostic (works with Next.js, SvelteKit, Express, etc.)
- Built-in: email/password, OAuth (Google, GitHub, Microsoft), passkeys, magic links, 2FA, multi-tenancy

### Features for Internal Tools
✅ Multi-tenancy + teams/roles out-of-box
✅ SAML 2.0 + SCIM for B2B
✅ Magic links, passkeys, 2FA
✅ Email verification, password reset
✅ Bot detection, brute force protection
✅ Built-in email delivery or bring-your-own
✅ Type-safe, fully TypeScript

### Cost
**Free** — open source, self-hosted or managed.

### Domain Restriction
Implement in middleware:
```typescript
// Better Auth supports multi-tenancy
// Restrict by email domain in sign-up callback
```

### SAML Integration
Better Auth **includes enterprise SAML + SCIM out-of-box**, unlike Auth.js which requires BoxyHQ wrapper.

```typescript
// SAML is a first-class feature
const auth = new BetterAuth({
  plugins: [
    saml({
      // Direct SAML support
    })
  ]
})
```

### Ecosystem
- 20+ integrations (React, Next.js, Svelte, etc.)
- Community-driven plugin system

### Verdict
**Best for**: Teams that want TypeScript-first philosophy, multi-tenancy as core feature, SAML without extra wrapper.
**NOT best for**: Teams wanting Clerk-style zero-config simplicity.

---

## 5. Magic Link Authentication (Passwordless)

### Overview
Single-use, time-limited email links for login. User clicks link → authenticated session.

### Security Assessment
✅ No password storage → no password breaches
✅ Links expire quickly (15-30 min typical)
✅ Phishing-resistant (harder than password reset)
✅ High user friction (context switching: click email → return app)

❌ Single-factor (tied to email account security)
❌ Email delivery delays possible
❌ Not for high-assurance scenarios (banking, healthcare)
❌ Email phishing still possible (social engineering users)

### For Internal Tools (10-50 users)
**Suitable** — trusted users, no sensitive compliance requirements, acceptable UX trade-off.

### Implementation
Both Auth.js + Better Auth support magic links natively:

```typescript
// Auth.js email provider
import Email from "@auth/core/providers/email"

providers: [
  Email({
    server: {
      host: process.env.EMAIL_SERVER_HOST,
      port: parseInt(process.env.EMAIL_SERVER_PORT),
      auth: { user: process.env.EMAIL_FROM, pass: process.env.EMAIL_PASSWORD }
    },
    from: process.env.EMAIL_FROM
  })
]
```

### Recommendation
✅ **Use magic links as stepping stone** → easy to start, sufficient for internal tool
→ Upgrade to SAML once company growth requires it

---

## 6. SAML 2.0 vs OAuth 2.0 for Internal Tools

### Purpose
- **SAML 2.0**: "Who are you?" → Authentication (enterprise SSO)
- **OAuth 2.0**: "What can you do?" → Authorization (API access, delegated permissions)

### For Employee Login to Internal Apps
| Aspect | SAML 2.0 | OAuth 2.0 |
|--------|----------|----------|
| **Use Case** | Enterprise SSO (employee login) | API access, third-party apps |
| **Protocol** | XML-based, assertion flow | JSON, token-based |
| **Learning Curve** | Steeper (XML, federation) | Easier (token-based) |
| **Tools** | Google Workspace, Azure AD, Okta | GitHub, Google APIs, AWS STS |
| **Internal Apps** | Better choice | Only with OIDC extension |

### For Internal Company Tool
**Recommended path**: Start with OAuth 2.0 (via Auth.js credentials/magic link) → Migrate to SAML when enterprise IdP (Azure AD, Google Workspace) becomes necessary.

---

## 7. Google Workspace SSO

### Overview
Google's identity platform for organizations. SSO via SAML 2.0 or OIDC.

### Setup Complexity
- **Medium**: ~3-4 hours
- Admin must configure custom SAML app in Google Workspace Admin console
- Provides ACS URL, entity ID, certificate

### Features
✅ Works if company uses Google Workspace (Gmail, Docs, etc.)
✅ Email domain restriction native (@company.com)
✅ SAML 2.0 + OIDC support
✅ Directory sync

### Cost
Included with Google Workspace (Standard plan $14/user/month).

### Integration with Next.js
Must use SAML via Auth.js + BoxyHQ or custom SAML library (no direct "Google Workspace OAuth" provider in Auth.js).

### Limitations
- OIDC support is indirect (requires additional config)
- Requires Workspace admin to set up custom SAML app
- Less seamless than OAuth 2.0 providers (Google, GitHub)

### Verdict
**Good if**: Company already on Google Workspace.
**Not ideal if**: Company on Microsoft 365 or no IdP.

---

## 8. Self-Hosted SAML Solutions

### Open Source Options

#### Keycloak
- **Mature**: Widely used, RESTful API
- **Cost**: Free
- **Setup**: Hard (~8-12 hrs, requires Docker + Postgres)
- **Best for**: Organizations needing full IAM platform

#### Authentik
- **Modern**: User-friendly UI, built for modern apps
- **Cost**: Free
- **Setup**: Medium (~4-6 hrs, Docker)
- **Best for**: Self-hosted SSO with style

#### Casdoor
- **Features**: OAuth 2.0, OIDC, SAML, LDAP, WebAuthn
- **Cost**: Free
- **Setup**: Medium (~4-6 hrs)
- **Best for**: Multi-protocol identity provider

### Verdict
**Only if**: Team willing to manage infrastructure + wants maximum control.
**NOT recommended for**: Internal tools (overhead > benefit).

---

## Detailed Comparison Table

| Factor | Auth.js v5 | Clerk | Better Auth | Azure Entra ID | Self-Hosted SAML |
|--------|-----------|-------|-----------|---|---|
| **Setup Time** | 1-2h | 30min | 2-3h | 4-8h | 8-12h |
| **Cost** | $0 | $0 (free tier) | $0 | $0-6/user | $0 + DevOps |
| **Data Ownership** | 100% | Clerk-hosted | 100% | Microsoft-hosted | 100% |
| **SAML Support** | Via BoxyHQ | Pro plan | Native | Native | Native |
| **Domain Restrict** | Custom callback | Dashboard rule | Custom callback | Native | Native |
| **Magic Link** | Yes | Yes | Yes | No | Via plugin |
| **Next.js 15** | Full support | Full support | Full support | Partial | Via adapter |
| **TypeScript DX** | Excellent | Good | Excellent | Okay | Varies |
| **Team Size <50** | Excellent | Excellent | Excellent | Okay | Overkill |

---

## Scenario-Based Recommendations

### Scenario A: "Quick MVP, No Setup"
**→ Clerk**
- 30-minute setup
- Free tier covers 50K MAU (more than enough for 50 users)
- Pre-built components eliminate custom UI work
- Can upgrade to SAML later if needed

### Scenario B: "We Already Use Microsoft 365"
**→ Azure Entra ID**
- No additional cost
- SAML setup 4-8 hours (one-time)
- Domain restriction automatic
- Conditional access for security policies

### Scenario C: "Full Control, Zero External Dependencies"
**→ Auth.js v5 + Magic Link + Domain Restrict**
- Magic links now, SAML upgrade path later
- Leverage existing Prisma + PostgreSQL
- ~1-2 hours setup
- 100% data ownership
- Smooth migration to SAML when needed

### Scenario D: "We Need Enterprise SAML Today, TypeScript-First"
**→ Better Auth + Self-Hosted Postgres**
- SAML is native feature (not wrapper)
- Multi-tenancy built-in
- TypeScript-first architecture
- ~2-3 hours setup + manage Postgres

### Scenario E: "Company on Google Workspace, Minimal Overhead"
**→ Auth.js v5 + BoxyHQ SAML (pointing to Google Workspace)**
- Google Workspace SAML → BoxyHQ SAML → Auth.js
- 4-6 hours setup (one-time, by admin)
- Free except Google Workspace subscription
- Email domain restriction via Google Workspace + Auth.js callback

---

## Recommended Implementation Path

### Phase 1 (Immediate): Auth.js v5 + Magic Link
```
Timeline: 1-2 weeks
Cost: $0
Code changes: Add email provider + Prisma adapter

Benefits:
- Drop-in replacement for current UUID system
- No external dependencies
- Passwordless improves UX vs current clipboard copy UUID
- Email domain restrict easy to add
- Session data in Postgres (already have infrastructure)
```

### Phase 2 (if SAML needed): Add BoxyHQ SAML Provider
```
Timeline: 2-3 weeks
Cost: $0 (BoxyHQ is open source)
Prerequisites: Phase 1 complete

Add SAML provider:
- Company configure custom SAML app in Azure AD or Google Workspace
- App provides metadata → BoxyHQ instance
- Auth.js routes to BoxyHQ → SAML IdP → back to app
- Magic link still available as fallback
```

### Phase 3 (if Admin Load High): Implement Domain Restrict
```
Timeline: 3-5 days
Cost: $0

Add callback:
- Reject emails not matching @company.com
- Prevent accidental registration of personal emails
- Admin still manually approves first login
```

---

## Migration Strategy from Current UUID System

### Current State
- User registers email → generates UUID
- UUID stored in localStorage
- Hook script reads UUID, injects into events
- Minimal auth, no password/SAML

### Migration Path (Auth.js v5 + Magic Link)

**Step 1**: Deploy Auth.js with credentials provider
```typescript
// Keep UUID system alongside, for backward compat
// New users register via magic link (email-based)
// Old users still work with UUID from localStorage
```

**Step 2**: Redirect UUID users to re-authenticate
```typescript
// Check localStorage for old UUID
// If found, prompt: "Migrate to email-based login?"
// Maintain session continuity
```

**Step 3**: Deprecate UUID (6 months later)
- UUID users forced to re-register with email
- More secure, better UX

---

## Implementation Checklist

### Auth.js v5 + Magic Link (Recommended Start)
- [ ] Install `@auth/core`, `@auth/prisma-adapter`
- [ ] Create `web/auth.ts` config file
- [ ] Update Prisma schema: add Account, Session, VerificationToken models
- [ ] Create email provider config (SendGrid, AWS SES, or local SMTP)
- [ ] Create sign-in page at `/login` (replace current UUID page)
- [ ] Create sign-out endpoint
- [ ] Add domain restriction callback (`@company.com`)
- [ ] Update hook script: extract email from session instead of UUID
- [ ] Update API routes: use `auth()` to get current user
- [ ] Test email delivery in development + staging
- [ ] Deploy to production with email provider credentials

### For Azure Entra ID (if on Microsoft 365)
- [ ] Register app in Azure AD
- [ ] Get client ID, secret, tenant ID
- [ ] Download SAML metadata
- [ ] Configure SAML app in Azure AD (ACS URL, entity ID)
- [ ] Create Auth.js SAML provider config (or use BoxyHQ)
- [ ] Test SAML flow end-to-end

---

## Security Considerations

### Email Domain Restriction
```typescript
// MUST implement in Auth.js callback
callbacks: {
  signIn({ profile }) {
    const email = profile?.email || '';
    if (!email.endsWith('@company.com')) {
      console.error(`Rejected non-company email: ${email}`);
      return false; // Deny sign-in
    }
    return true;
  }
}
```

### Magic Link Security
- ✅ Link expires in 15 minutes
- ✅ Single-use only
- ✅ Stored hashed in database
- ✅ Rate limit email sends (5 per 10 min per IP) — already in current code
- ✅ HTTPS required (secure cookie flag)

### Session Management
- ✅ Sessions in database (not JWT)
- ✅ CSRF protection (SameSite=Strict cookies)
- ✅ Secure, HttpOnly flags
- ✅ Automatic expiration (30 days default)

### SAML Security (if implemented)
- ✅ Verify SAML assertion signature
- ✅ Check issuer matches IdP
- ✅ Validate not-before / not-after timestamps
- ✅ Prevent XML signature wrapping attacks
- (Handled by Auth.js + BoxyHQ)

---

## Cost Summary (100 users, 12 months)

| Solution | Monthly | Annual | Notes |
|----------|---------|--------|-------|
| **Auth.js + Magic Link** | $0 | $0 | Just email delivery (~$20-30/month if send 1K+ emails) |
| **Clerk (free tier)** | $0 | $0 | 50K MAU free; 100 users = $100/mo for pro |
| **Better Auth** | $0 | $0 | Self-hosted, no per-user cost |
| **Azure Entra ID** | $0-600 | $0-7200 | Free with M365; $6/user/mo if standalone |
| **Auth.js + BoxyHQ SAML** | $0 | $0 | One-time setup (~4-6h labor) |
| **Keycloak** | $100-200 | $1200-2400 | Server cost only; no per-user licensing |

---

## Recommended Solution: Auth.js v5 + Magic Link

### Why This Recommendation

1. **Zero Cost**: No SaaS or licensing fees
2. **Minimal Setup**: 1-2 weeks to deploy
3. **Full Control**: Data ownership 100%
4. **Clear Upgrade Path**: SAML later without rewrite
5. **Integrates with Existing Stack**: Prisma, Next.js 15, PostgreSQL already in use
6. **Better UX**: Magic link >> clipboard UUID
7. **Type-Safe**: Full TypeScript support
8. **Future-Proof**: Auth.js is maintained, industry-standard

### Migration from UUID
- Keep UUID system running alongside for backward compatibility (6 months)
- New users register with email + magic link
- Prompt existing UUID users to "migrate" but don't force immediately
- Deprecate UUID after 6 months

### Next Steps
1. **Week 1-2**: Implement Auth.js + magic link, deploy to staging
2. **Week 2-3**: Test email delivery, domain restriction, session management
3. **Week 4**: Gradual rollout (10% users) → 50% → 100%
4. **Month 3-6**: Monitor, collect feedback, refine
5. **Month 6+**: If SAML needed, add BoxyHQ provider (2-3 weeks)

---

## Unresolved Questions

1. **Email Delivery**: Which email service? (SendGrid, AWS SES, Resend)?
2. **User Onboarding**: Will admin pre-create user accounts or self-register with domain check?
3. **Fallback**: If email system down, what's the recovery mechanism?
4. **MFA**: Is 2FA required for sensitive admin actions? (Can add later)
5. **Audit Trail**: How detailed do authentication logs need to be? (Auth.js provides basic, upgrade to advanced monitoring separately)
6. **LDAP/AD Sync**: Does company have on-premises Active Directory to sync from? (Not covered in this analysis)

---

## Sources

- [NextAuth.js 2025: Secure Authentication for Next.js Apps](https://strapi.io/blog/nextauth-js-secure-authentication-next-js-guide)
- [NextAuth.js Official](https://next-auth.js.org)
- [User Authentication for Next.js: Top Tools (2025)](https://clerk.com/articles/user-authentication-for-nextjs-top-tools-and-recommendations-for-2025)
- [Auth.js Migrating to v5](https://authjs.dev/getting-started/migrating-to-v5)
- [Stop Crying Over Auth: Next.js 15 & Auth.js v5](https://javascript.plainenglish.io/stop-crying-over-auth-a-senior-devs-guide-to-next-js-15-auth-js-v5-42a57bc5b4ce)
- [Clerk: Complete Authentication Guide for Next.js 2025](https://clerk.com/articles/complete-authentication-guide-for-nextjs-app-router)
- [Better Auth Framework](https://better-auth.com/)
- [Better Auth: YC X25](https://www.ycombinator.com/companies/better-auth)
- [Microsoft Entra Pricing](https://www.microsoft.com/en-us/security/business/microsoft-entra-pricing)
- [Azure Entra ID Integration](https://msadvance.com/en/azure-ad-entra-id-integration-sso-oauth-saml-on-prem-apps/)
- [Magic Links Security](https://supertokens.com/blog/magiclinks)
- [OTP vs Magic Links](https://www.scalekit.com/blog/otp-vs-magic-links-passwordless-authentication)
- [SAML vs OAuth 2.0 for Enterprise](https://ssojet.com/blog/saml-vs-oauth-2-0-whats-the-difference-a-practical-guide-for-developers/)
- [Google Workspace SSO](https://support.google.com/a/answer/12032922?hl=en)
- [Set Up Custom SAML App](https://support.google.com/a/answer/6087519?hl=en)
- [Auth.js BoxyHQ SAML Provider](https://authjs.dev/getting-started/providers/boxyhq-saml)
- [SAML SSO: Missing Piece in Next.js Apps](https://dev.to/nathan_tarbert/saml-sso-the-missing-piece-in-your-next-js-apps-authentication-puzzle-3h9f)
- [Keycloak](https://www.keycloak.org/)
- [Authentik](https://goauthentik.io/)
- [Casdoor](https://casdoor.github.io/)
- [Open-Source SSO Solutions](https://workos.com/blog/source-sso-solutions)
