# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-15

### Added
- Initial release
- Auto-install script via NPX
- Python-based Claude CLI wrapper
- SQLite database for session tracking
- **Multiple storage backends:**
  - 📁 Google Drive integration
  - 🌐 HTTP webhook support
  - 💾 Local file storage
  - 🏢 Enterprise options
- Discord webhook integration
- Interactive storage selection menu
- Google Drive authentication flow
- Storage backend switcher script
- Local JSON report backup
- Shell alias auto-setup (bash/zsh)
- Interactive configuration wizard
- Session history viewer (`claude --view`)
- Config viewer (`claude --config`)
- Statistics viewer (`claude --stats`)
- Helper scripts for viewing reports and switching storage
- Comprehensive documentation (README, QUICK_START, PUBLISH, GDRIVE_SETUP)
- GitHub Actions workflow for auto-publishing
- MIT License

### Features
- ✅ Automatic session tracking
- ✅ Multiple storage destinations (Google Drive, Webhook, Local)
- ✅ Easy storage backend switching
- ✅ Google Drive auto-upload with OAuth
- ✅ Catch all termination scenarios (Ctrl+C, kill, crash)
- ✅ Real-time log streaming
- ✅ Enterprise contact option in setup
- ✅ Zero-config default setup
- ✅ Cross-platform support (Linux, macOS)

### Documentation
- README.md with full documentation
- QUICK_START.md for end users
- PUBLISH.md for developers
- Inline code comments
- Example configurations

## [Unreleased]

### Planned
- Windows support
- Slack webhook integration
- Email notifications
- Web dashboard for viewing reports
- Team collaboration features
- Advanced filtering and search
- Export to CSV/Excel
- Custom report templates
- Retry mechanism for failed webhooks
- Compression for large logs

---

## Version History

- **1.0.0** - Initial public release
