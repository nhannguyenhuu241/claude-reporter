# 🚀 Claude Code Auto Reporter

Tự động track mọi Claude Code session. Cài 1 lần, dùng mãi mãi.

## ⚡ Quick Start

```bash
npx claude-reporter-setup
```

**Xong!** Mở terminal mới, dùng `claude` như bình thường.

→ Mọi session tự động được lưu. Zero effort. Zero maintenance.

## ✨ Features

### Multiple Storage Options
- 📁 **Google Drive** - Auto-upload reports to your Google Drive
- 🌐 **Webhook/HTTP** - Send to any custom endpoint
- 💾 **Local Storage** - Keep everything on your machine
- 🏢 **Enterprise** - Contact sales for advanced integrations

### Auto-Tracking
- ✅ Mọi `claude` command được track
- ✅ Bắt Ctrl+C, kill, crash
- ✅ Lưu full logs
- ✅ SQLite database

### Reporting
- ✅ Multiple destinations (Drive, Webhook, Local)
- ✅ Discord notifications
- ✅ JSON format
- ✅ Realtime streaming

### Configuration
- ✅ Interactive setup wizard
- ✅ Multiple storage backends
- ✅ Easy switching between backends
- ✅ Helper scripts

## 📦 Installation

### Cách 1: NPX (Recommended)

```bash
npx claude-reporter-setup
```

### Cách 2: Global Install

```bash
npm install -g claude-reporter-setup
claude-reporter-setup
```

### Cách 3: Manual

```bash
git clone https://github.com/yourusername/claude-reporter-setup.git
cd claude-reporter-setup
npm install
node bin/setup.js
```

## 🐛 Troubleshooting

### "command not found: claude"

**→ Mở terminal MỚI!** (Cmd+T hoặc Ctrl+Shift+T)

Hoặc reload:
```bash
source ~/.zshrc  # or ~/.bashrc
```

### More issues?

📖 Full guide: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

Common fixes:
- Open NEW terminal window
- Run `source ~/.zshrc` or `source ~/.bashrc`
- Check `which claude`
- Re-run setup: `npx claude-reporter-setup`

---

## 🎯 Usage

### Dùng Claude bình thường

```bash
# Reload shell
source ~/.bashrc  # hoặc ~/.zshrc

# Dùng Claude như thường lệ
claude chat
claude code fix-bug.py
claude ask "explain this code"

# Mọi thứ tự động được track!
```

### Xem lịch sử sessions

```bash
# Xem 20 sessions gần nhất
claude --view

# Xem config
claude --config

# Xem thống kê
claude --stats
```

### Xem reports

```bash
# Mở thư mục reports
cd ~/.claude-reporter/reports
ls -lt

# Hoặc dùng script helper
~/.claude-reporter/view-reports.sh
```

## ⚙️ Configuration

### Storage Options

Claude Reporter hỗ trợ nhiều storage backends:

#### 1. Google Drive (Recommended)

Tự động upload reports lên Google Drive của bạn:

```bash
# Chọn Google Drive khi setup
npx claude-reporter-setup

# Hoặc switch sau này
~/.claude-reporter/switch-storage.sh
```

📖 Chi tiết: [GDRIVE_SETUP.md](GDRIVE_SETUP.md)

#### 2. Webhook/HTTP

Gửi reports đến custom endpoint:

```bash
# Setup webhook
~/.claude-reporter/switch-storage.sh
# Chọn option 2

# Hoặc edit config
nano ~/.claude-reporter/config.json
```

Test với webhook.site:
1. Truy cập https://webhook.site
2. Copy unique URL
3. Paste vào config

#### 3. Local Storage

Chỉ lưu local, không gửi đi đâu:

```bash
~/.claude-reporter/switch-storage.sh
# Chọn option 3
```

Reports lưu tại: `~/.claude-reporter/reports/`

#### 4. Enterprise

Cần custom integration (Slack, Teams, Jira)?

📧 Contact: enterprise@claude-reporter.com

### Setup Webhook

1. Truy cập https://webhook.site
2. Copy URL duy nhất của bạn
3. Update config:

```bash
cd ~/.claude-reporter
./update-webhook.sh
```

### Manual Config

Edit file: `~/.claude-reporter/config.json`

```json
{
  "report_endpoint": "https://webhook.site/your-unique-url",
  "discord_webhook": "https://discord.com/api/webhooks/...",
  "auto_report": true,
  "save_local": true,
  "log_commands": true
}
```

### Discord Webhook Setup

1. Vào Discord Server Settings → Integrations → Webhooks
2. Create Webhook
3. Copy Webhook URL
4. Paste vào `discord_webhook` trong config

## 📊 Report Format

Reports được gửi dưng dạng JSON:

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

### Status values:
- `completed` - Session kết thúc bình thường
- `interrupted` - User nhấn Ctrl+C
- `error` - Có lỗi xảy ra

## 🗂️ File Structure

```
~/.claude-reporter/
├── config.json           # Configuration
├── sessions.db          # SQLite database
├── claude-reporter.py   # Main script
├── reports/             # JSON reports
├── logs/                # Session logs
├── backups/            # Backups
├── view-reports.sh     # Helper script
└── update-webhook.sh   # Helper script
```

## 🔧 Advanced Usage

### Custom Webhook Handler

Bạn có thể tự host webhook endpoint:

```javascript
// Express.js example
app.post('/claude-report', (req, res) => {
  const report = req.body;
  
  // Save to database
  db.reports.insert(report);
  
  // Send notification
  if (report.status === 'error') {
    sendSlackAlert(report);
  }
  
  res.json({ received: true });
});
```

### Query Database

```bash
sqlite3 ~/.claude-reporter/sessions.db
```

```sql
-- Xem tất cả sessions
SELECT * FROM sessions ORDER BY started_at DESC LIMIT 10;

-- Sessions có lỗi
SELECT * FROM sessions WHERE status = 'error';

-- Thống kê theo ngày
SELECT DATE(started_at), COUNT(*) 
FROM sessions 
GROUP BY DATE(started_at);
```

## 🐛 Troubleshooting

### "Claude not found"

```bash
# Check Claude CLI installation
which claude

# Install Claude CLI
# Visit: https://docs.anthropic.com/claude-code
```

### Reports không gửi được

```bash
# Check config
claude --config

# Test webhook manually
curl -X POST your-webhook-url \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Permission denied

```bash
chmod +x ~/.claude-reporter/claude-reporter.py
chmod +x ~/.claude-reporter/*.sh
```

## 📝 Example Workflows

### Workflow 1: Track team activity

```bash
# Setup webhook pointing to team dashboard
# Everyone on team runs: npx claude-reporter-setup
# All Claude sessions auto-reported to central dashboard
```

### Workflow 2: Personal analytics

```bash
# Use webhook.site for quick viewing
# Or setup local server to analyze patterns
# View stats: claude --stats
```

### Workflow 3: CI/CD integration

```bash
# In CI pipeline
npx claude-reporter-setup --ci
claude code --review pr-123
# Report sent to build system
```

## 🤝 Contributing

Contributions welcome! Please:

1. Fork repo
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit PR

## 📄 License

MIT License - feel free to use anywhere!

## 🔗 Links

- [Claude Code Docs](https://docs.anthropic.com/claude-code)
- [NPM Package](https://npmjs.com/package/claude-reporter-setup)
- [GitHub](https://github.com/yourusername/claude-reporter-setup)
- [Issues](https://github.com/yourusername/claude-reporter-setup/issues)

## 💬 Support

- GitHub Issues: [Report bugs](https://github.com/yourusername/claude-reporter-setup/issues)
- Discord: [Join community](https://discord.gg/...)
- Email: your-email@example.com

## 🎉 Credits

Made with ❤️ for the Claude community

---

**Happy coding with Claude! 🚀**
