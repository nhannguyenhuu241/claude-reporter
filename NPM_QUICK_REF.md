# 📋 NPM Quick Reference

## 🚀 Publish NPM Package - Quick Steps

### 1️⃣ First Time Setup

```bash
# Create NPM account
https://www.npmjs.com/signup

# Login from terminal
npm login

# Verify
npm whoami
```

### 2️⃣ Prepare Package

```bash
# Update package.json
nano package.json
# Change: name, version, author, repository

# Install dependencies
npm install

# Test
npm test
```

### 3️⃣ Publish

```bash
# Easy way (recommended)
./publish.sh

# Or manual
npm publish --access public
```

### 4️⃣ Verify

```bash
# Check on NPM
https://npmjs.com/package/@yourusername/package-name

# Test install
npx @yourusername/package-name
```

---

## ⚡ Common Commands

| Command | What it does |
|---------|-------------|
| `npm login` | Login to NPM |
| `npm whoami` | Check who you're logged in as |
| `npm publish --access public` | Publish package |
| `npm version patch` | 1.0.0 → 1.0.1 |
| `npm version minor` | 1.0.0 → 1.1.0 |
| `npm version major` | 1.0.0 → 2.0.0 |
| `npm unpublish pkg@version` | Remove specific version |
| `npm view package` | View package info |

---

## 🔢 Version Numbers (Semver)

```
MAJOR.MINOR.PATCH
  1  .  0  .  0

MAJOR: Breaking changes (1.0.0 → 2.0.0)
MINOR: New features    (1.0.0 → 1.1.0)
PATCH: Bug fixes       (1.0.0 → 1.0.1)
```

**Examples:**
- Fixed a bug? → `npm version patch`
- Added feature? → `npm version minor`
- Breaking change? → `npm version major`

---

## 📦 Package Names

### Scoped (Recommended)
```json
{
  "name": "@yourusername/package-name"
}
```
- ✅ No name conflicts
- ✅ Professional
- ⚠️ Needs `--access public`

### Non-scoped
```json
{
  "name": "package-name"
}
```
- ✅ Shorter
- ❌ Name might be taken

---

## 🔑 Important package.json Fields

```json
{
  "name": "@yourusername/claude-reporter-setup",
  "version": "1.0.0",
  "description": "Short description",
  "main": "index.js",
  "bin": {
    "command-name": "./bin/setup.js"
  },
  "author": "Your Name <email@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/user/repo.git"
  }
}
```

---

## 🐛 Common Errors & Fixes

| Error | Fix |
|-------|-----|
| "You must be logged in" | `npm login` |
| "Package name taken" | Change name in package.json |
| "403 Forbidden" | Add `--access public` |
| "Email not verified" | Check email, click verify link |
| "Invalid version" | Use semver: X.Y.Z |

---

## ✅ Pre-Publish Checklist

- [ ] Logged in: `npm whoami`
- [ ] package.json updated (name, version, author)
- [ ] Dependencies installed: `npm install`
- [ ] Tests pass: `npm test`
- [ ] README.md complete
- [ ] LICENSE file present
- [ ] Version bumped (if updating)
- [ ] Git committed

---

## 🔄 Update Workflow

```bash
# 1. Make changes
vim file.js

# 2. Test
npm test

# 3. Commit
git add .
git commit -m "fix: bug fix"

# 4. Bump version
npm version patch

# 5. Push
git push --follow-tags

# 6. Publish
npm publish --access public
```

---

## 🎯 One-Line Commands

```bash
# Publish new version (all-in-one)
npm version patch && git push --follow-tags && npm publish --access public

# Check package on NPM
npm view @username/package

# See all your packages
npm access list packages

# Test before publish
npm publish --dry-run --access public
```

---

## 🔐 Security

```bash
# Enable 2FA
https://www.npmjs.com/settings/yourusername/tfa

# Generate token (for CI/CD)
https://www.npmjs.com/settings/yourusername/tokens
```

---

## 📊 After Publishing

```bash
# View your package
https://npmjs.com/package/@username/package-name

# Test install
npx @username/package-name

# Check downloads
https://npm-stat.com/charts.html?package=@username/package-name

# Your packages dashboard
https://www.npmjs.com/settings/username/packages
```

---

## 🆘 Quick Help

**Forgot password?**
→ https://www.npmjs.com/forgot

**Need to change package name?**
→ Edit package.json, publish as new package

**Want to delete package?**
→ `npm unpublish package@version` (within 72h)

**Package not showing?**
→ Wait 1-5 minutes, NPM needs time to update

---

## 🎓 Learn More

- NPM Docs: https://docs.npmjs.com/
- Semver: https://semver.org/
- Full Guide: [NPM_PUBLISH_GUIDE.md](NPM_PUBLISH_GUIDE.md)

---

**Remember: Always test before publishing!** 🧪

```bash
npm test && ./publish.sh
```
