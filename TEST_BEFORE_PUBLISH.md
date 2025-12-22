# ✅ Test Before Publishing - Checklist

## 🧪 Pre-Publish Testing Checklist

Chạy hết checklist này TRƯỚC KHI publish lên NPM.

---

## 1️⃣ Syntax Check

```bash
# Check JavaScript syntax
node -c bin/setup.js

# Should show nothing (no errors)
```

✅ Pass / ❌ Fail: _____

---

## 2️⃣ Install Dependencies

```bash
npm install
```

✅ Pass / ❌ Fail: _____

---

## 3️⃣ Run Tests

```bash
npm test
```

Expected output:
```
✅ package.json exists
✅ bin/setup.js exists
✅ Dependencies declared
✅ README.md exists
✅ LICENSE exists

📊 Results: 5 passed, 0 failed
```

✅ Pass / ❌ Fail: _____

---

## 4️⃣ Test Local Install

```bash
# Link locally
npm link

# Test command exists
which claude-reporter-setup

# Should show path
```

✅ Pass / ❌ Fail: _____

---

## 5️⃣ Test Setup Wizard

```bash
# Run setup (but cancel)
claude-reporter-setup

# Press Ctrl+C when asked for storage
```

Check:
- [ ] Wizard starts without errors
- [ ] Shows storage menu with 4 options
- [ ] No syntax errors in console
- [ ] Can cancel cleanly

✅ Pass / ❌ Fail: _____

---

## 6️⃣ Test Full Setup (Optional)

```bash
# Run full setup with local storage
claude-reporter-setup
# Choose: Local Only
```

Check:
- [ ] Setup completes without errors
- [ ] Creates ~/.claude-reporter/
- [ ] Creates config.json
- [ ] Creates Python script
- [ ] Success message shows

✅ Pass / ❌ Fail: _____

---

## 7️⃣ Check Files Created

```bash
ls -la ~/.claude-reporter/
```

Should see:
- config.json
- claude-reporter.py
- view-reports.sh
- update-webhook.sh
- reports/
- logs/
- backups/

✅ Pass / ❌ Fail: _____

---

## 8️⃣ Test Alias (If did full setup)

```bash
# Open NEW terminal
# Then:
which claude
```

Should show: `alias claude='python3 /Users/.../.claude-reporter/claude-reporter.py'`

✅ Pass / ❌ Fail: _____

---

## 9️⃣ Unlink

```bash
npm unlink
```

✅ Pass / ❌ Fail: _____

---

## 🔟 Clean Test Environment

```bash
# Remove test installation
rm -rf ~/.claude-reporter
```

✅ Pass / ❌ Fail: _____

---

## 1️⃣1️⃣ Check package.json

```bash
cat package.json
```

Verify:
- [ ] `name` is correct (e.g., `@yourusername/claude-reporter-setup`)
- [ ] `version` is correct (e.g., `1.0.0`)
- [ ] `author` has your name
- [ ] `repository` URL is correct
- [ ] `bin` points to `./bin/setup.js`
- [ ] All dependencies listed

✅ Pass / ❌ Fail: _____

---

## 1️⃣2️⃣ Check README

```bash
cat README.md | head -20
```

Verify:
- [ ] Title correct
- [ ] Install instructions clear
- [ ] No broken links
- [ ] Examples work

✅ Pass / ❌ Fail: _____

---

## 1️⃣3️⃣ Dry Run Publish

```bash
npm publish --dry-run --access public
```

Should show:
```
npm notice package: @yourusername/claude-reporter-setup@1.0.0
npm notice === Tarball Contents ===
...
npm notice total files: 20+
```

No errors!

✅ Pass / ❌ Fail: _____

---

## 1️⃣4️⃣ Check NPM Login

```bash
npm whoami
```

Should show your username.

✅ Pass / ❌ Fail: _____

---

## 📊 Final Checklist

Before running `./publish.sh` or `npm publish`:

- [ ] All tests pass (1-14 above)
- [ ] package.json updated with your info
- [ ] Git committed all changes
- [ ] README looks good
- [ ] Version number correct
- [ ] No syntax errors
- [ ] Logged into NPM
- [ ] Ready to publish!

---

## 🚀 Publish Commands

### Using Script (Recommended)

```bash
./publish.sh
```

### Manual

```bash
npm publish --access public
```

---

## ✅ Post-Publish Verification

After publishing:

### 1. Check NPM

```
https://npmjs.com/package/@yourusername/claude-reporter-setup
```

- [ ] Package appears
- [ ] README renders correctly
- [ ] Version correct

### 2. Test Install

```bash
# From different directory or machine
npx @yourusername/claude-reporter-setup
```

- [ ] Downloads and runs
- [ ] Setup wizard works
- [ ] No errors

### 3. Check Download Stats

```
https://www.npmjs.com/settings/yourusername/packages
```

- [ ] Package listed
- [ ] Shows version
- [ ] Can see stats

---

## 🐛 If Something Fails

### Syntax Error
```bash
node -c bin/setup.js
# Fix errors shown
```

### Test Fails
```bash
npm test
# Read error message
# Fix issue
# Re-run test
```

### Dry Run Fails
```bash
# Check error message
# Common issues:
# - Not logged in → npm login
# - Invalid package.json → validate JSON
# - Missing files → check file paths
```

### Publish Fails
```bash
# Check error:
# - 403 Forbidden → Add --access public
# - 404 Not Found → Check package name
# - Version exists → Bump version
```

---

## 💡 Tips

1. **Always test locally first** with `npm link`
2. **Use dry-run** before actual publish
3. **Check package.json** carefully
4. **Verify login** with `npm whoami`
5. **Test in clean environment** if possible
6. **Keep checklist** for future updates

---

## 📝 Test Log Template

```
Date: ___________
Version: _________
Tester: __________

[ ] Syntax check
[ ] Dependencies install
[ ] Tests pass
[ ] Local install works
[ ] Setup wizard works
[ ] Files created correctly
[ ] Alias works
[ ] package.json correct
[ ] Dry run successful
[ ] NPM login verified

Notes:
_________________________
_________________________
_________________________

Result: ✅ READY / ❌ NOT READY
```

---

**Test thoroughly, publish confidently! 🎯**
