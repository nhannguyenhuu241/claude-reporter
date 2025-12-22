# ⚡ Quick Start - Claude Code Auto Reporter

## 🎯 Mục tiêu

Bạn chỉ cần chạy 1 lệnh, xong mọi thứ tự động.

## 📦 Bước 1: Cài (10 giây)

```bash
npx claude-reporter-setup
```

## 🎨 Bước 2: Chọn nơi lưu

Script sẽ hỏi bạn muốn lưu logs ở đâu:

- **📁 Google Drive** - Lưu lên Drive (recommended)
- **🌐 Webhook** - Gửi về server
- **💾 Local** - Chỉ lưu máy

Chọn 1 cái → Enter.

## ✅ Xong!

Mở **terminal mới** và dùng:

```bash
claude chat
claude code fix-bug.py
```

**Mọi session tự động được lưu!**

---

## 📊 Xem lại sessions

```bash
claude --view
```

## 🔄 Đổi nơi lưu

```bash
~/.claude-reporter/switch-storage.sh
```

---

## ❓ FAQ

**Q: Tôi phải làm gì sau khi cài?**  
A: **Mở terminal mới!** Cmd+T (Mac) hoặc Ctrl+Shift+T (Linux). Rồi dùng `claude` bình thường.

**Q: Lỗi "command not found: claude"?**  
A: Bạn chưa mở terminal mới. Mở terminal mới hoặc chạy `source ~/.zshrc` (hoặc `~/.bashrc`)

**Q: Làm sao biết nó hoạt động?**  
A: Chạy `claude chat`, kết thúc, rồi chạy `claude --view`. Sẽ thấy session vừa rồi.

**Q: Tôi muốn đổi nơi lưu?**  
A: Chạy `~/.claude-reporter/switch-storage.sh`

**Q: Google Drive folder ID là gì?**  
A: Xem [GDRIVE_SETUP.md](GDRIVE_SETUP.md)

**Q: Vẫn có lỗi?**  
A: Xem [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

**Chỉ có vậy thôi! Super simple. 🎉**

---

## Cho Developers (Setup & Publish)

### Setup Project

```bash
# Clone hoặc tải code
git clone https://github.com/yourusername/claude-reporter-setup.git
cd claude-reporter-setup

# Install dependencies
npm install

# Test locally
npm link
claude-reporter-setup
npm unlink
```

### Publish lên NPM

#### Lần đầu

```bash
# 1. Tạo NPM account tại npmjs.com
# 2. Login
npm login

# 3. Update package.json:
#    - name (phải unique)
#    - author
#    - repository URL

# 4. Publish
npm publish --access public
```

#### Update sau này

```bash
# Bump version
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0

# Publish
npm publish
```

### Setup GitHub

```bash
# Chạy script tự động
./setup-git.sh

# Hoặc manual:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/repo.git
git push -u origin main
```

### Setup CI/CD (Optional)

1. Vào https://www.npmjs.com/settings/[username]/tokens
2. Generate new token (Automation)
3. Copy token
4. Vào GitHub repo → Settings → Secrets → Actions
5. Add secret: `NPM_TOKEN` = token vừa copy
6. Giờ mỗi khi tạo Release, GitHub Actions sẽ tự publish

---

## Features Overview

### Tự động bắt mọi trường hợp:
- ✅ User chạy `claude chat` bình thường
- ✅ User nhấn Ctrl+C (SIGINT)
- ✅ Process bị kill (SIGTERM)
- ✅ Terminal đóng đột ngột
- ✅ Computer tắt nguồn

### Gửi report đến:
- 🌐 HTTP Webhook (webhook.site, custom endpoint)
- 💬 Discord (via webhook)
- 💾 Local JSON files (backup)

### Xem thông tin:
```bash
claude --view    # Xem 20 sessions gần nhất
claude --config  # Xem config hiện tại
claude --stats   # Xem thống kê
```

---

## Configuration

### File location
```
~/.claude-reporter/config.json
```

### Config structure
```json
{
  "report_endpoint": "https://webhook.site/xxx",
  "discord_webhook": "https://discord.com/api/webhooks/xxx",
  "auto_report": true,
  "save_local": true,
  "log_commands": true
}
```

### Update webhook URL
```bash
cd ~/.claude-reporter
./update-webhook.sh
```

---

## Troubleshooting

### "Claude not found"
Install Claude CLI first:
https://docs.anthropic.com/claude-code

### "Permission denied"
```bash
chmod +x ~/.claude-reporter/claude-reporter.py
```

### Reports không gửi được
```bash
# Check config
claude --config

# Test webhook
curl -X POST your-webhook-url -d '{"test":true}'
```

---

## File Structure

```
~/.claude-reporter/
├── config.json              # Configuration
├── sessions.db             # SQLite database
├── claude-reporter.py      # Main Python script
├── reports/                # JSON reports
│   ├── session-1.json
│   └── session-2.json
├── logs/                   # Full session logs
│   ├── session-1.log
│   └── session-2.log
├── view-reports.sh         # Helper script
└── update-webhook.sh       # Helper script
```

---

## Examples

### Setup webhook.site (miễn phí)

1. Truy cập https://webhook.site
2. Copy URL duy nhất (vd: `https://webhook.site/abc123`)
3. Update config:
```bash
cd ~/.claude-reporter
./update-webhook.sh
# Paste URL
```
4. Mở webhook.site trong browser
5. Chạy `claude chat`
6. Xem realtime requests trong webhook.site!

### Setup Discord notifications

1. Vào Discord server → Settings → Integrations
2. Create Webhook
3. Copy webhook URL
4. Update config:
```bash
nano ~/.claude-reporter/config.json
# Paste vào "discord_webhook"
```

### Query database trực tiếp

```bash
sqlite3 ~/.claude-reporter/sessions.db

# Show all sessions
SELECT * FROM sessions ORDER BY started_at DESC LIMIT 10;

# Show only errors
SELECT * FROM sessions WHERE status = 'error';

# Count by status
SELECT status, COUNT(*) FROM sessions GROUP BY status;
```

---

## Support

- 📖 Full docs: [README.md](README.md)
- 🐛 Issues: https://github.com/yourusername/claude-reporter-setup/issues
- 💬 Discord: [Your Discord Server]
- 📧 Email: your.email@example.com

---

**Happy coding! 🚀**
