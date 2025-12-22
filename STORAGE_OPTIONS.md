# 📊 Storage Options Comparison

## Overview

Claude Reporter hỗ trợ 4 storage backends. Chọn cái phù hợp với nhu cầu của bạn.

---

## 🔍 Quick Comparison

| Feature | Google Drive | Webhook | Local | Enterprise |
|---------|-------------|---------|-------|------------|
| **Setup Time** | 5 min | 2 min | 1 min | Contact Sales |
| **Cloud Storage** | ✅ Yes | Depends | ❌ No | ✅ Yes |
| **Auto Backup** | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| **Team Access** | ✅ Easy | ⚠️ Manual | ❌ No | ✅ Yes |
| **Search** | ✅ Native | ❌ No | ⚠️ Manual | ✅ Yes |
| **Cost** | Free (15GB) | Free/Paid | Free | Paid |
| **Privacy** | Your account | 3rd party | 100% local | Custom |
| **Best For** | Personal/Team | Developers | Privacy-focused | Organizations |

---

## 📁 Google Drive

### ✅ Pros
- **Auto cloud backup** - Never lose reports
- **Easy sharing** - Share folders with team
- **Search** - Built-in Google search
- **Mobile access** - View on phone
- **Version history** - Google keeps versions
- **Free storage** - 15GB included
- **Organized** - Files auto-named with timestamps

### ❌ Cons
- Requires Google account
- Initial OAuth setup
- Internet required for upload
- Subject to Google quotas

### 💡 Best For
- Personal projects
- Small teams
- Long-term storage
- Mobile access needed
- Want cloud backup

### 📝 Setup Steps
1. Create Google Drive folder
2. Copy folder ID
3. Run setup, choose Google Drive
4. Authenticate (one-time)
5. Done!

📖 Full guide: [GDRIVE_SETUP.md](GDRIVE_SETUP.md)

---

## 🌐 Webhook/HTTP

### ✅ Pros
- **Flexible** - Send to any endpoint
- **Real-time** - Instant delivery
- **Integration** - Connect to existing systems
- **Custom processing** - Full control over data
- **No auth** - Simple setup

### ❌ Cons
- Requires webhook endpoint
- No built-in storage
- Network dependent
- May need server setup

### 💡 Best For
- Developers
- Custom integrations
- Real-time monitoring
- Existing webhook systems
- CI/CD pipelines

### 📝 Setup Steps
1. Get webhook URL (e.g., webhook.site)
2. Run setup, choose Webhook
3. Enter URL
4. Test!

### 🔗 Free Webhook Services
- **webhook.site** - Testing/debugging
- **requestbin.com** - Request inspection
- **pipedream.com** - Workflows
- **zapier.com** - Automation

---

## 💾 Local Only

### ✅ Pros
- **100% private** - Data never leaves machine
- **Fast** - No network overhead
- **Simple** - No setup needed
- **Offline** - Works without internet
- **Full control** - Your disk, your rules

### ❌ Cons
- No cloud backup
- No team access
- Manual sharing
- Risk of data loss (disk failure)

### 💡 Best For
- Privacy-focused users
- Offline work
- Sensitive projects
- Quick testing
- No internet access

### 📝 Setup Steps
1. Run setup, choose Local
2. Done!

### 📁 Location
```
~/.claude-reporter/reports/
```

### 💡 Tips
- Backup to external drive periodically
- Use `rsync` to sync to NAS
- Git commit reports for version control

---

## 🏢 Enterprise

### ✅ Pros
- **Custom integrations** - Slack, Teams, Jira, etc.
- **Team features** - Dashboards, analytics
- **SSO** - SAML, OAuth, LDAP
- **SLA** - Guaranteed uptime
- **Support** - Dedicated team
- **Security** - SOC2, HIPAA compliance
- **Advanced** - AI insights, cost tracking

### ❌ Cons
- Paid service
- Requires contract
- May be overkill for individuals

### 💡 Best For
- Organizations
- Regulated industries
- Large teams (10+)
- Advanced requirements
- Enterprise tools

### 📞 Contact
- **Email:** enterprise@claude-reporter.com
- **Web:** https://claude-reporter.com/enterprise
- **Phone:** +1 (555) 123-4567

### 🎁 Enterprise Features
- Custom storage backends
- Team dashboards
- Role-based access
- Audit logs
- API access
- Priority support
- Training & onboarding
- Custom integrations
- SLA guarantees

---

## 🔄 Switching Between Options

### Easy Switch

```bash
~/.claude-reporter/switch-storage.sh
```

Interactive menu to switch storage backend anytime.

### Manual Switch

Edit `~/.claude-reporter/config.json`:

```json
{
  "storage_type": "gdrive",  // or "webhook", "local"
  "gdrive_folder_id": "...",
  "report_endpoint": "...",
  ...
}
```

### Migration

Old reports stay in local storage. New reports go to new backend.

To migrate old reports:

**To Google Drive:**
```bash
# Upload all local reports
cd ~/.claude-reporter/reports
for file in *.json; do
  # Use Google Drive API or manual upload
done
```

**To Webhook:**
```bash
# Replay all reports
cd ~/.claude-reporter/reports
for file in *.json; do
  curl -X POST your-webhook-url -d @$file
done
```

---

## 🎯 Decision Guide

### Choose Google Drive if:
- ✅ Want cloud backup
- ✅ Need team access
- ✅ Use Google Workspace
- ✅ Want easy sharing
- ✅ Need mobile access

### Choose Webhook if:
- ✅ Building custom system
- ✅ Have existing webhook infrastructure
- ✅ Need real-time processing
- ✅ Want custom integrations
- ✅ Are a developer

### Choose Local if:
- ✅ Privacy is critical
- ✅ Work offline
- ✅ Don't need sharing
- ✅ Want simplest setup
- ✅ Handle backups yourself

### Choose Enterprise if:
- ✅ Large organization
- ✅ Need compliance
- ✅ Want advanced features
- ✅ Require SLA
- ✅ Have budget

---

## 💡 Hybrid Approach

You can combine multiple backends!

### Example 1: Local + Google Drive

```json
{
  "storage_type": "gdrive",
  "save_local": true,  // Also keep local copies
  ...
}
```

Reports go to both Google Drive AND local storage.

### Example 2: Webhook + Discord

```json
{
  "storage_type": "webhook",
  "report_endpoint": "https://your-api.com/reports",
  "discord_webhook": "https://discord.com/api/webhooks/...",
  ...
}
```

Main reports to webhook, notifications to Discord.

### Example 3: All Three

```json
{
  "storage_type": "gdrive",
  "save_local": true,
  "discord_webhook": "...",
  ...
}
```

Google Drive backup + Local copies + Discord notifications!

---

## 📈 Storage Costs

### Free Options

| Service | Free Tier | Limit |
|---------|-----------|-------|
| Google Drive | ✅ | 15 GB |
| webhook.site | ✅ | Limited history |
| Local Storage | ✅ | Your disk space |

### Paid Options

| Service | Price | Features |
|---------|-------|----------|
| Google One | $2/mo | 100 GB |
| Webhook.site Pro | $10/mo | Unlimited |
| Enterprise | Custom | All features |

---

## 🔐 Security Comparison

### Google Drive
- OAuth 2.0
- Google account security
- 2FA supported
- Encrypted at rest
- Encrypted in transit

### Webhook
- HTTPS required (recommended)
- Authentication depends on endpoint
- You control security

### Local
- File system permissions
- Disk encryption (if enabled)
- No network exposure

### Enterprise
- Custom security policies
- SSO integration
- Audit logs
- Compliance certifications

---

## 🎓 Examples

### Example 1: Freelancer

**Use:** Google Drive
- Cloud backup for safety
- Access from anywhere
- Share with clients easily
- Free 15GB enough

### Example 2: Startup Team

**Use:** Google Drive + Discord
- Team folder in Drive
- Notifications in Discord
- Collaborate easily
- Cost: Free

### Example 3: Developer

**Use:** Webhook → Custom API
- Process reports in real-time
- Store in own database
- Custom analytics
- Full control

### Example 4: Privacy Advocate

**Use:** Local Only
- No data leaves machine
- Full privacy
- Manual backups
- Complete control

### Example 5: Enterprise

**Use:** Enterprise Plan
- Custom integration with Jira
- Team dashboard
- SSO with Okta
- SLA support

---

## ❓ FAQs

**Q: Can I use multiple storage backends?**
A: Yes! Local + (Drive OR Webhook) + Discord

**Q: Can I switch later?**
A: Yes! Use `switch-storage.sh`

**Q: What happens to old reports when switching?**
A: They stay in old location. New reports go to new backend.

**Q: Is Google Drive secure?**
A: Yes, OAuth 2.0, encryption, and Google's security.

**Q: Do I need a server for webhook?**
A: Can use webhook.site for free testing, or your own server.

**Q: What if my disk fills up (local)?**
A: Delete old reports or switch to Google Drive.

**Q: Can I customize where local reports go?**
A: Edit config.json (advanced users only).

---

## 🚀 Getting Started

1. **Run setup:**
   ```bash
   npx claude-reporter-setup
   ```

2. **Choose storage** based on this guide

3. **Test it:**
   ```bash
   claude chat
   ```

4. **Verify** reports are where you expect

5. **Switch anytime** with `switch-storage.sh`

---

**Need help deciding? Start with Google Drive - it's the best balance of features and ease!** 📁
