# 📁 Google Drive Setup Guide

## Overview

Hướng dẫn setup Google Drive để tự động lưu Claude Code session reports lên Google Drive của bạn.

---

## 🎯 Quick Setup (5 phút)

### Bước 1: Tạo Google Drive Folder

1. Mở https://drive.google.com
2. Tạo folder mới: "Claude Code Reports"
3. Mở folder vừa tạo
4. Copy Folder ID từ URL:
   ```
   https://drive.google.com/drive/folders/{FOLDER_ID}
                                          ^^^^^^^^^^^^
                                          Copy cái này
   ```

### Bước 2: Chạy Setup

```bash
npx claude-reporter-setup
```

Chọn: **📁 Google Drive**

Nhập Folder ID vừa copy.

### Bước 3: Xong!

Mọi Claude session sẽ tự động upload lên Google Drive folder của bạn.

---

## 🔐 Authentication Setup (Lần đầu)

### Option A: Simple (Recommended)

Khi chạy Claude lần đầu, script sẽ tự động:
1. Mở browser để đăng nhập Google
2. Yêu cầu cấp quyền Drive
3. Lưu credentials
4. Không cần làm lại

### Option B: Advanced (Custom OAuth App)

Nếu muốn tự tạo OAuth app:

#### 1. Tạo Google Cloud Project

1. Truy cập: https://console.cloud.google.com/
2. Tạo project mới hoặc chọn existing
3. Enable Google Drive API:
   - APIs & Services → Library
   - Tìm "Google Drive API"
   - Click Enable

#### 2. Tạo OAuth Credentials

1. APIs & Services → Credentials
2. Create Credentials → OAuth client ID
3. Application type: Desktop app
4. Name: "Claude Reporter"
5. Create

#### 3. Download Credentials

1. Click Download JSON
2. Save as `credentials.json`
3. Move to: `~/.claude-reporter/credentials.json`

#### 4. Test

```bash
claude chat
# Browser sẽ mở để authorize
# Sign in với Google account
# Grant permissions
# Done!
```

---

## 📊 What Gets Uploaded

### File Structure in Google Drive

```
Claude Code Reports/
├── claude-session-a1b2c3d4.json
├── claude-session-e5f6g7h8.json
├── claude-session-i9j0k1l2.json
└── ...
```

### Report Content

Mỗi file JSON chứa:

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "started_at": "2025-01-15T10:30:00",
  "ended_at": "2025-01-15T10:45:00",
  "status": "completed",
  "working_dir": "/home/user/project",
  "command": "claude chat",
  "log_preview": "...",
  "exit_code": 0,
  "timestamp": "2025-01-15T10:45:00"
}
```

---

## 🔧 Configuration

### Config File Location

```
~/.claude-reporter/config.json
```

### Google Drive Config

```json
{
  "storage_type": "gdrive",
  "gdrive_folder_id": "1a2b3c4d5e6f7g8h9i0j",
  "discord_webhook": "",
  "auto_report": true,
  "save_local": true,
  "log_commands": true
}
```

### Update Folder ID

```bash
# Edit config
nano ~/.claude-reporter/config.json

# Or use helper script
cd ~/.claude-reporter
python3 << EOF
import json
with open('config.json', 'r') as f:
    config = json.load(f)
config['gdrive_folder_id'] = 'YOUR_NEW_FOLDER_ID'
with open('config.json', 'w') as f:
    json.dump(config, f, indent=2)
print("✅ Updated!")
EOF
```

---

## 🔍 Permissions

### Required Google Drive Permissions

- **drive.file** - Upload and manage files created by this app
- No access to other files in your Drive
- You can revoke anytime

### Revoke Access

1. Go to: https://myaccount.google.com/permissions
2. Find "Claude Reporter"
3. Click Remove Access

---

## 🐛 Troubleshooting

### "credentials.json not found"

**Solution:**
1. Create OAuth credentials (see Advanced setup above)
2. Download JSON
3. Save to `~/.claude-reporter/credentials.json`

Or use Simple authentication - it creates credentials automatically.

### "Invalid folder ID"

**Check:**
- Folder ID is at least 20 characters
- No spaces or special characters
- Copied from correct part of URL

**Test:**
```bash
# Open in browser
https://drive.google.com/drive/folders/YOUR_FOLDER_ID
# Should show your folder
```

### "Permission denied"

**Solutions:**
1. Re-authenticate:
   ```bash
   rm ~/.claude-reporter/gdrive_token.pickle
   claude chat  # Will re-authenticate
   ```

2. Check folder permissions:
   - Right-click folder → Share
   - Make sure your account has edit access

### "Upload failed"

**Check:**
1. Internet connection
2. Google Drive storage quota
3. Folder still exists
4. Credentials valid

**Fallback:**
Reports are always saved locally at:
```
~/.claude-reporter/reports/
```

### "Browser doesn't open for auth"

**Manual auth:**
```bash
python3 << EOF
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ['https://www.googleapis.com/auth/drive.file']
flow = InstalledAppFlow.from_client_secrets_file(
    '~/.claude-reporter/credentials.json', SCOPES)
creds = flow.run_local_server(port=8080)

import pickle
with open('~/.claude-reporter/gdrive_token.pickle', 'wb') as token:
    pickle.dump(creds, token)
print("✅ Authenticated!")
EOF
```

---

## 🔄 Migration

### From Webhook to Google Drive

```bash
# Update config
nano ~/.claude-reporter/config.json
```

Change:
```json
{
  "storage_type": "webhook",  → "storage_type": "gdrive",
  "report_endpoint": "...",   → "gdrive_folder_id": "YOUR_ID",
}
```

### From Local to Google Drive

Same as above. Old local reports stay in `~/.claude-reporter/reports/`

---

## 📈 Advanced Usage

### Multiple Folders

Different projects → Different folders:

```bash
# Project A
export CLAUDE_GDRIVE_FOLDER="folder_id_A"
claude chat

# Project B  
export CLAUDE_GDRIVE_FOLDER="folder_id_B"
claude chat
```

### Shared Team Folder

1. Create shared folder in Google Drive
2. Share with team members (edit access)
3. Everyone uses same folder ID
4. All sessions go to same folder
5. Team visibility!

### Auto-Organize by Date

Script automatically names files with timestamp.

To organize further, use Google Drive folders:

```
Claude Code Reports/
├── 2025-01/
│   ├── session-1.json
│   └── session-2.json
├── 2025-02/
│   └── ...
```

Manual or use Apps Script to auto-organize.

---

## 🔐 Security Best Practices

1. **Use Desktop OAuth** (not Service Account)
2. **Limit scope** to drive.file only
3. **Don't share credentials.json** publicly
4. **Use private folders** for sensitive projects
5. **Revoke access** when done

---

## 💡 Tips

### Tip 1: Folder Organization

```
Google Drive/
└── Claude Code/
    ├── Work Projects/        ← Folder ID 1
    ├── Personal Projects/    ← Folder ID 2
    └── Learning/            ← Folder ID 3
```

Switch folder ID per project.

### Tip 2: Backup

Google Drive = cloud backup automatically!

Local reports are still saved for double safety.

### Tip 3: Search

In Google Drive, search:
```
type:json "claude-session"
```

Find all Claude reports instantly.

### Tip 4: Sharing

Share specific session with teammate:
1. Right-click file → Share
2. Send link
3. They can view the JSON

### Tip 5: Automation

Use Google Apps Script to:
- Auto-organize by date
- Send email summaries
- Create dashboards
- Analyze patterns

---

## 📞 Support

Need help with Google Drive setup?

- 📖 Check troubleshooting section above
- 🐛 GitHub Issues for bugs
- 💬 Discord community for questions
- 📧 Email support for enterprise

---

## 🎉 Success Checklist

After setup:

- [ ] Google Drive folder created
- [ ] Folder ID copied and configured
- [ ] First authentication completed
- [ ] Test session uploaded successfully
- [ ] Can view JSON in Google Drive
- [ ] Credentials saved for future use

All checked? You're all set! 🚀

---

**Happy reporting with Google Drive! 📁**
