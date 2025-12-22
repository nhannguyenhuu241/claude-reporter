# 📦 Hướng Dẫn Publish NPM Package

## 🎯 Mục tiêu

Publish package lên NPM để ai cũng có thể chạy:
```bash
npx claude-reporter-setup
```

---

## 🚀 Quick Guide (5 phút)

### Bước 1: Tạo tài khoản NPM

1. Truy cập: https://www.npmjs.com/signup
2. Điền form:
   - Username (ví dụ: `yourusername`)
   - Email
   - Password
3. Verify email (check inbox)
4. Xong!

### Bước 2: Login từ terminal

```bash
npm login
```

Nhập:
- Username: `yourusername`
- Password: `********`
- Email: `your@email.com`
- OTP (nếu có 2FA): `123456`

Khi thấy: `Logged in as yourusername on https://registry.npmjs.org/` → OK!

### Bước 3: Update package.json

```bash
cd claude-reporter

# Sửa file package.json
nano package.json
```

Đổi những dòng này:

```json
{
  "name": "@yourusername/claude-reporter-setup",
  "version": "1.0.0",
  "author": "Your Name <your@email.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/claude-reporter-setup.git"
  }
}
```

Thay `yourusername` = username NPM của bạn.

### Bước 4: Test local

```bash
# Install dependencies
npm install

# Test
npm test

# Link local để test
npm link
claude-reporter-setup

# Nếu OK, unlink
npm unlink
```

### Bước 5: Publish!

```bash
npm publish --access public
```

Xong! Package đã được publish lên NPM! 🎉

### Bước 6: Test install

```bash
# Test từ máy khác hoặc folder khác
npx @yourusername/claude-reporter-setup
```

Hoặc test trên: https://www.npmjs.com/package/@yourusername/claude-reporter-setup

---

## 📋 Chi Tiết Từng Bước

### 1. Tạo NPM Account

#### Option A: Qua Website

1. Mở: https://www.npmjs.com/signup
2. Form đăng ký:
   ```
   Username: yourusername       # Phải unique
   Email: your@email.com
   Password: ********          # Ít nhất 10 ký tự
   ```
3. Click "Create an Account"
4. Check email → Click verify link
5. Xong!

#### Option B: Qua CLI

```bash
npm adduser
```

Nhập username, password, email → Tự động tạo account.

### 2. NPM Login

```bash
npm login
```

**Output:**
```
Username: yourusername
Password: 
Email: (this IS public) your@email.com
```

Nếu bật 2FA:
```
Enter one-time password: 123456
```

**Success:**
```
Logged in as yourusername on https://registry.npmjs.org/.
```

**Check login:**
```bash
npm whoami
```

Sẽ show: `yourusername`

### 3. Chuẩn Bị Package

#### 3.1. Clone/Download code

```bash
# Nếu có Git repo
git clone https://github.com/yourusername/claude-reporter-setup.git
cd claude-reporter-setup

# Hoặc extract ZIP
unzip claude-reporter-complete.zip
cd claude-reporter
```

#### 3.2. Update package.json

File `package.json` cần update:

```json
{
  "name": "@yourusername/claude-reporter-setup",
  "version": "1.0.0",
  "description": "Auto-install reporter for Claude Code CLI",
  "author": "Your Name <your@email.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/claude-reporter-setup.git"
  },
  "homepage": "https://github.com/yourusername/claude-reporter-setup#readme",
  "bugs": {
    "url": "https://github.com/yourusername/claude-reporter-setup/issues"
  }
}
```

**Những field quan trọng:**

- `name`: Tên package (phải unique)
  - Scoped: `@username/package-name` (recommended)
  - Non-scoped: `package-name`
  
- `version`: Phiên bản (theo semver)
  - Format: `MAJOR.MINOR.PATCH`
  - Ví dụ: `1.0.0`

- `description`: Mô tả ngắn gọn

- `author`: Tên + email của bạn

- `repository`: Link GitHub repo

#### 3.3. Install dependencies

```bash
npm install
```

**Output:**
```
added 50 packages, and audited 51 packages in 3s
```

#### 3.4. Run tests

```bash
npm test
```

**Should show:**
```
✅ package.json exists
✅ bin/setup.js exists
✅ Dependencies declared
✅ README.md exists
✅ LICENSE exists

📊 Results: 5 passed, 0 failed
```

### 4. Test Package Locally

#### 4.1. Link package

```bash
npm link
```

**Output:**
```
added 1 package, and audited 1 package in 1s
```

#### 4.2. Test command

```bash
# Test nếu command work
claude-reporter-setup --help

# Hoặc test full setup
claude-reporter-setup
```

Press Ctrl+C để cancel.

#### 4.3. Unlink

```bash
npm unlink
```

### 5. Publish to NPM

#### 5.1. Dry run (test trước)

```bash
npm publish --dry-run --access public
```

**Output sẽ show:**
```
npm notice package: @yourusername/claude-reporter-setup@1.0.0
npm notice === Tarball Contents === 
npm notice 1.1kB  LICENSE                    
npm notice 15.5kB bin/setup.js               
npm notice 8.2kB  README.md                  
...
npm notice === Tarball Details === 
npm notice name:          @yourusername/claude-reporter-setup
npm notice version:       1.0.0                         
npm notice filename:      yourusername-claude-reporter-setup-1.0.0.tgz
npm notice package size:  18.5 kB                       
npm notice unpacked size: 120.5 kB                      
npm notice total files:   20                            
```

Nếu OK → Tiếp tục.

#### 5.2. Publish thật

```bash
npm publish --access public
```

**Note:** `--access public` cần thiết cho scoped packages (@username/...).

**Output:**
```
npm notice Publishing to https://registry.npmjs.org/
+ @yourusername/claude-reporter-setup@1.0.0
```

🎉 **Published!**

### 6. Verify

#### 6.1. Check trên NPM

Mở browser:
```
https://www.npmjs.com/package/@yourusername/claude-reporter-setup
```

Sẽ thấy package page với:
- README
- Version
- Install instructions
- Files

#### 6.2. Test install

Từ terminal khác:

```bash
# Test npx
npx @yourusername/claude-reporter-setup

# Hoặc install global
npm install -g @yourusername/claude-reporter-setup
claude-reporter-setup
```

#### 6.3. Check stats

Vào NPM dashboard:
```
https://www.npmjs.com/settings/yourusername/packages
```

Sẽ thấy package và download stats.

---

## 🔄 Update Package (Publish Version Mới)

### Bước 1: Make changes

```bash
# Edit code
nano bin/setup.js

# Test
npm test
```

### Bước 2: Bump version

```bash
# Patch version (1.0.0 → 1.0.1)
npm version patch

# Minor version (1.0.0 → 1.1.0)
npm version minor

# Major version (1.0.0 → 2.0.0)
npm version major
```

Lệnh này sẽ:
1. Update version trong package.json
2. Tạo git commit
3. Tạo git tag

### Bước 3: Push to Git

```bash
git push
git push --tags
```

### Bước 4: Publish

```bash
npm publish --access public
```

Done! Version mới đã lên NPM.

---

## 🐛 Troubleshooting

### "You must be logged in to publish packages"

```bash
npm login
npm whoami  # Check nếu đã login
```

### "Package name already exists"

Tên package bị trùng. Đổi tên:

**Option 1: Scoped package**
```json
{
  "name": "@yourusername/claude-reporter-setup"
}
```

**Option 2: Đổi tên khác**
```json
{
  "name": "claude-code-reporter-setup"
}
```

Check available: https://www.npmjs.com/search?q=claude-reporter

### "403 Forbidden"

**Nguyên nhân:**
1. Chưa login
2. Không có quyền
3. Scoped package cần `--access public`

**Fix:**
```bash
npm login
npm publish --access public
```

### "You must verify your email"

Check email inbox → Click verify link.

Hoặc:
```
https://www.npmjs.com/settings/yourusername/profile
```
→ Resend verification email

### "Payment Required"

Nếu muốn private package, cần trả phí.

**Fix:** Dùng `--access public` (free).

### "ENOENT: no such file"

Check file structure:

```bash
ls -la
```

Phải có:
- package.json
- bin/setup.js
- README.md

### "Invalid package.json"

```bash
# Validate
npm pkg fix

# Hoặc check manually
cat package.json | jq .
```

---

## 📊 Best Practices

### 1. Version Number (Semver)

```
MAJOR.MINOR.PATCH

1.0.0 → 1.0.1   Bug fix (patch)
1.0.0 → 1.1.0   New feature (minor)
1.0.0 → 2.0.0   Breaking change (major)
```

### 2. Good README

- Clear description
- Installation instructions
- Usage examples
- License

### 3. .npmignore

Create `.npmignore`:

```
node_modules/
.git/
.github/
*.log
test/
.env
.DS_Store
```

Hoặc dùng `files` trong package.json:

```json
{
  "files": [
    "bin/",
    "README.md",
    "LICENSE"
  ]
}
```

### 4. Test Before Publish

```bash
# Always test
npm test

# Test local install
npm pack
npm install ./yourusername-claude-reporter-setup-1.0.0.tgz
```

### 5. Git Tag Versions

```bash
git tag v1.0.0
git push --tags
```

### 6. Changelog

Update CHANGELOG.md mỗi version.

---

## 🎯 Complete Workflow

```bash
# 1. Make changes
vim bin/setup.js

# 2. Test
npm test

# 3. Commit
git add .
git commit -m "feat: add new feature"

# 4. Bump version
npm version minor

# 5. Push
git push --follow-tags

# 6. Publish
npm publish --access public

# 7. Verify
npx @yourusername/claude-reporter-setup
```

---

## 🔐 Security

### Enable 2FA

1. Vào: https://www.npmjs.com/settings/yourusername/tfa
2. Enable 2FA
3. Scan QR code với app (Google Authenticator, Authy)
4. Backup recovery codes

### Generate Access Token

Cho CI/CD:

1. Vào: https://www.npmjs.com/settings/yourusername/tokens
2. Generate New Token
3. Type: **Automation**
4. Copy token
5. Dùng trong GitHub Actions

---

## 🤖 Auto-Publish với GitHub Actions

File `.github/workflows/publish.yml` đã có sẵn trong package.

**Setup:**

1. Generate NPM token (như trên)

2. Add to GitHub Secrets:
   - Repo → Settings → Secrets → Actions
   - New secret: `NPM_TOKEN`
   - Paste token

3. Create release trên GitHub:
   ```bash
   git tag v1.0.1
   git push --tags
   ```
   
   Hoặc: GitHub → Releases → Create new release

4. GitHub Actions tự động publish!

---

## 📞 Help

### NPM Documentation
- https://docs.npmjs.com/

### Common Commands

```bash
# Login
npm login

# Check login
npm whoami

# Publish
npm publish --access public

# Update version
npm version patch|minor|major

# Unpublish (trong 72h)
npm unpublish @username/package@version

# Deprecate version
npm deprecate @username/package@version "message"

# View package info
npm view @username/package

# View own packages
npm access list packages
```

---

## 🎉 Success!

Sau khi publish thành công:

✅ Package: https://npmjs.com/package/@yourusername/claude-reporter-setup

✅ Users có thể chạy:
```bash
npx @yourusername/claude-reporter-setup
```

✅ Track downloads tại: https://npmjs.com/package/@yourusername/claude-reporter-setup

**Congratulations! 🎊**

---

## 💡 Tips

1. **Test nhiều lần** trước khi publish
2. **Version bump** đúng theo semver
3. **README** phải rõ ràng
4. **License** phải có (MIT recommended)
5. **Changelog** update mỗi version
6. **GitHub repo** làm homepage
7. **2FA** bật để bảo mật
8. **Tags** mỗi version trong Git

---

**Ready to publish? Let's go! 🚀**

```bash
npm login
npm publish --access public
```
