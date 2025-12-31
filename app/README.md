# Claude Code Log Desktop App

Desktop application cho macOS và Windows để convert Claude Code transcript JSONL files thành HTML.

## ✅ Đã build thành công!

**File installer:** `dist/Claude Code Log-0.8.0.dmg` (~38MB)

## Tính năng

- 📱 **GUI đơn giản, dễ dùng** với Toga framework
- 🖥️ **Cross-platform**: Build cho macOS và Windows
- 🎨 **Chọn mode**: All Projects, Directory, hoặc Single File
- 📅 **Date filtering**: Lọc messages theo khoảng thời gian
- 🌐 **Auto open browser**: Tự động mở HTML sau khi convert
- ⚙️ **Options**: Skip individual sessions, clear cache
- 📝 **Status log**: Theo dõi quá trình convert real-time

## 🚀 Cài đặt cho người dùng

### macOS

1. Download file `Claude Code Log-0.8.0.dmg`
2. Double-click để mở
3. Drag app vào Applications folder
4. Xong! ❌ KHÔNG CẦN cài Python hay dependencies gì

### Windows (chưa build)

1. Download file `.msi`
2. Double-click để install
3. Xong! ❌ KHÔNG CẦN cài Python hay dependencies gì

## 🛠️ Development

### Yêu cầu

- Python 3.10+
- Briefcase (tự động cài khi chạy build script)

### Build App từ source

#### macOS

```bash
cd app
./build.sh
```

Output:
- `build/claudecodelog/macos/app/Claude Code Log.app` - App bundle
- `dist/Claude Code Log-0.8.0.dmg` - DMG installer

#### Windows

```batch
cd app
build.bat
```

Output: `dist\Claude Code Log.msi`

### Run trong development mode

```bash
cd app
briefcase dev
```

Hoặc:

```bash
cd app
briefcase run
```

## Cấu trúc thư mục

```
app/
├── pyproject.toml              # Briefcase configuration
├── claudecodelog_app/          # App source code
│   ├── __init__.py
│   ├── __main__.py
│   └── app.py                  # Main GUI application
├── resources/
│   └── icon.png                # App icon (512x512)
├── build.sh                    # macOS build script
├── build.bat                   # Windows build script
└── README.md                   # This file
```

## Sử dụng

1. **Chọn Mode**:
   - All Projects: Process tất cả projects trong `~/.claude/projects/`
   - Directory: Process một thư mục cụ thể
   - Single File: Convert một file JSONL

2. **Chọn Input**: Click "Browse" để chọn file/folder

3. **Output (optional)**: Chọn nơi lưu HTML file

4. **Date filters (optional)**:
   - From: "yesterday", "last week", "2025-12-01"
   - To: "today", "2025-12-05"

5. **Options**:
   - ✅ Open in browser: Tự động mở sau khi convert
   - ☐ Skip individual sessions: Chỉ tạo combined file
   - ☐ Clear cache: Xóa cache trước khi process

6. **Click Convert** và theo dõi status log

## Icon

Thay icon mặc định bằng cách:

1. Tạo file PNG 512x512 pixels
2. Save tại: `app/resources/icon.png`
3. Briefcase sẽ tự động convert sang các format platform-specific

Recommended tools:
- macOS: [Image2icon](https://img2icnsapp.com/)
- Windows: [IcoFX](https://icofx.ro/)
- Online: [CloudConvert](https://cloudconvert.com/png-to-icns)

## Troubleshooting

### Build fails on macOS

```bash
# Install Xcode Command Line Tools
xcode-select --install
```

### Build fails on Windows

```batch
# Install Visual Studio Build Tools
# Download from: https://visualstudio.microsoft.com/downloads/
```

### Import errors

Make sure parent directory is in Python path (already handled in `app.py`):

```python
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
```

## Development

### Run tests

```bash
cd ..
uv run pytest test/
```

### Update dependencies

Edit `pyproject.toml` section `requires`:

```toml
requires = [
    "toga>=0.4.0",
    "click>=8.3.0",
    # ... other deps
]
```

Then rebuild:

```bash
briefcase update
briefcase build
```

## Publishing

### macOS

```bash
# Notarize the app for distribution
xcrun notarytool submit "dist/Claude Code Log.app" \
    --apple-id "your-email@example.com" \
    --password "app-specific-password" \
    --team-id "TEAM_ID"
```

### Windows

```batch
# Sign the MSI
signtool sign /f certificate.pfx /p password "dist\Claude Code Log.msi"
```

## License

MIT - Same as parent project
