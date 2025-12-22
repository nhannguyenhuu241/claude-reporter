# 🔧 Troubleshooting Guide

## ❌ "command not found: claude"

### Nguyên nhân
Alias chưa được load trong terminal session hiện tại.

### ✅ Giải pháp

**Option 1: Mở terminal MỚI** (Recommended)
```bash
# Mở terminal window/tab mới
# Cmd+T (Mac) hoặc Ctrl+Shift+T (Linux)
# Rồi chạy:
claude chat
```

**Option 2: Reload terminal hiện tại**
```bash
# Nếu dùng zsh
source ~/.zshrc

# Nếu dùng bash  
source ~/.bashrc

# Rồi chạy:
claude chat
```

**Option 3: Dùng path đầy đủ**
```bash
python3 ~/.claude-reporter/claude-reporter.py chat
```

---

## ❌ "zsh: command not found: claude-reporter-setup"

### Nguyên nhân
Bạn đang cố chạy `claude-reporter-setup` thay vì `claude`.

### ✅ Giải pháp

`claude-reporter-setup` là lệnh **cài đặt**, chỉ chạy 1 lần:
```bash
npx claude-reporter-setup
```

Sau khi cài xong, dùng lệnh `claude`:
```bash
# Mở terminal MỚI
claude chat
```

---

## ❌ "Python dependencies not found"

### Lỗi
```
ModuleNotFoundError: No module named 'requests'
```

### ✅ Giải pháp

```bash
# Install dependencies manually
pip3 install --user requests psutil google-auth google-auth-oauthlib google-api-python-client

# Hoặc
pip install --user requests psutil google-auth google-auth-oauthlib google-api-python-client
```

---

## ❌ "Permission denied"

### Lỗi
```
-bash: /Users/username/.claude-reporter/claude-reporter.py: Permission denied
```

### ✅ Giải pháp

```bash
chmod +x ~/.claude-reporter/claude-reporter.py
```

---

## ❌ Google Drive authentication failed

### Lỗi
```
credentials.json not found!
```

### ✅ Giải pháp

**Option 1: Đơn giản - Đổi sang Local storage**
```bash
~/.claude-reporter/switch-storage.sh
# Chọn: Local Only
```

**Option 2: Setup Google Drive đúng cách**

Xem chi tiết: [GDRIVE_SETUP.md](GDRIVE_SETUP.md)

Quick steps:
1. https://console.cloud.google.com/
2. Enable Google Drive API
3. Create OAuth credentials
4. Download credentials.json
5. Save to `~/.claude-reporter/credentials.json`

---

## ❌ "Session not tracked"

### Kiểm tra

```bash
# Run claude
claude chat
# Type something, exit

# Check if logged
claude --view
```

Nếu không thấy session:

### ✅ Giải pháp

**1. Check alias:**
```bash
which claude
```

Should show:
```
claude: aliased to python3 /Users/username/.claude-reporter/claude-reporter.py
```

If not:
```bash
source ~/.zshrc  # or ~/.bashrc
```

**2. Check reporter script:**
```bash
ls -la ~/.claude-reporter/claude-reporter.py
```

Should exist. If not:
```bash
# Re-run setup
npx claude-reporter-setup
```

**3. Check config:**
```bash
cat ~/.claude-reporter/config.json
```

Should have valid JSON.

---

## ❌ Webhook not receiving reports

### Kiểm tra

```bash
# Check config
claude --config
```

Should show your webhook URL.

### ✅ Giải pháp

**1. Test webhook manually:**
```bash
curl -X POST your-webhook-url \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**2. Check internet connection:**
```bash
ping google.com
```

**3. Check webhook URL:**
- Có đúng format? `https://...`
- Có còn hoạt động? (webhook.site có thể expire)

**4. Update webhook:**
```bash
~/.claude-reporter/update-webhook.sh
```

---

## ❌ "npm ERR! 404 Not Found"

Khi chạy `npx claude-reporter-setup`

### Nguyên nhân
Package chưa được publish lên NPM.

### ✅ Giải pháp

**Option 1: Publish package** (nếu bạn là developer)
```bash
cd claude-reporter
./publish.sh
```

**Option 2: Install local** (nếu testing)
```bash
cd claude-reporter
npm link
claude-reporter-setup
```

---

## ❌ Database locked

### Lỗi
```
sqlite3.OperationalError: database is locked
```

### ✅ Giải pháp

```bash
# Kill any running claude processes
pkill -f claude-reporter

# Or restart terminal
```

---

## ❌ Disk full

### Lỗi
```
OSError: [Errno 28] No space left on device
```

### ✅ Giải pháp

**Check disk space:**
```bash
df -h ~
```

**Clean old reports:**
```bash
# Delete reports older than 30 days
find ~/.claude-reporter/reports -name "*.json" -mtime +30 -delete

# Or delete all reports
rm -rf ~/.claude-reporter/reports/*
```

**Switch to Google Drive:**
```bash
~/.claude-reporter/switch-storage.sh
# Choose: Google Drive
```

---

## ❌ Claude CLI not found

### Lỗi
```
Claude CLI not found! Please install it first.
```

### Nguyên nhân
Claude Code CLI chưa được cài đặt.

### ✅ Giải pháp

Install Claude Code CLI:
```bash
# Visit official docs
https://docs.anthropic.com/claude-code
```

Hoặc check if already installed:
```bash
which claude
```

---

## ❌ Reports not showing in Google Drive

### Kiểm tra

```bash
# Check config
cat ~/.claude-reporter/config.json | grep gdrive
```

### ✅ Giải pháp

**1. Check authentication:**
```bash
ls ~/.claude-reporter/gdrive_token.pickle
```

If not exists:
```bash
# Re-authenticate on next run
rm ~/.claude-reporter/gdrive_token.pickle
claude chat
# Browser will open for auth
```

**2. Check folder ID:**
```bash
# View config
claude --config
```

Make sure `gdrive_folder_id` is correct.

**3. Check permissions:**
- Open Google Drive
- Find folder by ID: `https://drive.google.com/drive/folders/YOUR_ID`
- Make sure you have edit access

---

## ❌ Terminal shows weird characters

### Lỗi
```
�[32m✅�[0m Installation Complete!
```

### Nguyên nhân
Terminal không support Unicode/colors.

### ✅ Giải pháp

Update terminal emulator hoặc use:
```bash
TERM=xterm-256color npx claude-reporter-setup
```

---

## ❌ "Already logged session with same ID"

### Nguyên nhân
SQLite database có duplicate session ID.

### ✅ Giải pháp

```bash
# Backup database
cp ~/.claude-reporter/sessions.db ~/.claude-reporter/sessions.db.backup

# Reset database
rm ~/.claude-reporter/sessions.db

# Next run will create new database
claude chat
```

---

## 🆘 Still Having Issues?

### Quick Checks

```bash
# 1. Terminal mới chưa?
# Close current terminal, open NEW one

# 2. Alias loaded?
which claude

# 3. Reporter exists?
ls ~/.claude-reporter/claude-reporter.py

# 4. Config valid?
cat ~/.claude-reporter/config.json

# 5. Python works?
python3 --version
```

### Reset Everything

```bash
# Nuclear option - start fresh
rm -rf ~/.claude-reporter
npx claude-reporter-setup
```

### Get Help

1. Check all docs in package
2. Open GitHub issue
3. Contact support

---

## 💡 Prevention Tips

### 1. Always Open New Terminal
After setup, **mở terminal MỚI**. Đừng dùng terminal cũ.

### 2. Verify Installation
```bash
# After setup, in NEW terminal:
which claude
claude --config
```

### 3. Keep Backups
```bash
# Backup config
cp ~/.claude-reporter/config.json ~/config-backup.json

# Backup database
cp ~/.claude-reporter/sessions.db ~/sessions-backup.db
```

### 4. Update Regularly
```bash
# When package updates
npx claude-reporter-setup
# Will update to latest version
```

---

## 📊 Debug Mode

Enable verbose logging:

```bash
# Add to config.json
{
  "debug": true,
  ...
}

# Or set env var
export CLAUDE_REPORTER_DEBUG=1
claude chat
```

---

**Most issues = Mở terminal MỚI! 🎯**
