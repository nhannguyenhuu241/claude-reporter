# 📖 Complete Guide - From Zero to NPM Package

## 🎯 Mục tiêu

Tạo một NPM package cho phép người dùng chỉ cần chạy:

```bash
npx claude-reporter-setup
```

Và tự động có reporter tracking mọi Claude Code CLI session.

---

## 📋 Checklist Toàn Bộ

### Phase 1: Setup Project ✅
- [x] Create project structure
- [x] Write package.json
- [x] Write main setup script (bin/setup.js)
- [x] Write Python reporter script
- [x] Create README.md
- [x] Create LICENSE
- [x] Create .gitignore

### Phase 2: Documentation ✅
- [x] QUICK_START.md
- [x] PUBLISH.md
- [x] CHANGELOG.md
- [x] Inline code comments

### Phase 3: Testing ✅
- [x] Write test script
- [x] Test locally with npm link
- [x] Test on different shells (bash/zsh)

### Phase 4: Git & GitHub ⏳
- [ ] Initialize Git repository
- [ ] Create GitHub repository
- [ ] Push code to GitHub
- [ ] Add topics/tags

### Phase 5: NPM Publishing ⏳
- [ ] Login to NPM
- [ ] Test publish (dry-run)
- [ ] Actual publish
- [ ] Verify on npmjs.com

### Phase 6: CI/CD (Optional) ⏳
- [ ] Setup NPM token
- [ ] Configure GitHub Actions
- [ ] Test auto-publish

---

## 🚀 Quick Start (3 Methods)

### Method 1: ALL IN ONE (Recommended)

Chạy 1 script, tự động setup mọi thứ:

```bash
cd claude-reporter
./ALL_IN_ONE.sh
```

Script sẽ hỏi:
1. GitHub username
2. Repository name
3. NPM login credentials
4. Có muốn setup GitHub Actions không

Xong! Package đã được publish.

### Method 2: Step by Step

```bash
# 1. Git setup
./setup-git.sh

# 2. Create GitHub repo manually
# https://github.com/new

# 3. Push code
git push -u origin main

# 4. NPM login
npm login

# 5. Publish
npm publish --access public
```

### Method 3: Manual (Full Control)

Xem phần "Detailed Steps" bên dưới.

---

## 📝 Detailed Steps

### Step 1: Clone/Download Code

```bash
# Nếu có Git repo
git clone https://github.com/yourusername/claude-reporter-setup.git
cd claude-reporter-setup

# Hoặc tải ZIP và extract
```

### Step 2: Install Dependencies

```bash
npm install
```

Dependencies:
- `chalk`: Colored terminal output
- `inquirer`: Interactive CLI prompts
- `ora`: Spinner animations
- `node-fetch`: HTTP requests

### Step 3: Update Package Info

Edit `package.json`:

```json
{
  "name": "@yourusername/claude-reporter-setup",
  "version": "1.0.0",
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "url": "https://github.com/yourusername/claude-reporter-setup.git"
  }
}
```

### Step 4: Test Locally

```bash
# Link locally
npm link

# Test
claude-reporter-setup

# Should run the setup wizard
# Press Ctrl+C to exit

# Unlink when done
npm unlink
```

### Step 5: Run Tests

```bash
npm test
```

Should show:
```
✅ package.json exists
✅ bin/setup.js exists
✅ Dependencies declared
✅ README.md exists
✅ LICENSE exists

📊 Results: 5 passed, 0 failed
```

### Step 6: Initialize Git

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
```

### Step 7: Create GitHub Repository

1. Go to: https://github.com/new
2. Repository name: `claude-reporter-setup`
3. Description: "Auto-report Claude Code CLI sessions"
4. Public
5. DON'T initialize with README (we already have one)
6. Create repository

### Step 8: Push to GitHub

```bash
# Add remote
git remote add origin https://github.com/yourusername/claude-reporter-setup.git

# Push
git push -u origin main
```

### Step 9: NPM Login

```bash
npm login
```

Enter:
- Username
- Password
- Email
- OTP (if 2FA enabled)

### Step 10: Publish to NPM

```bash
# Dry run (test)
npm publish --dry-run --access public

# Actual publish
npm publish --access public
```

### Step 11: Verify

```bash
# Check on NPM
# https://www.npmjs.com/package/@yourusername/claude-reporter-setup

# Test install
npx @yourusername/claude-reporter-setup
```

---

## 🔧 Configuration Options

### package.json Fields

```json
{
  "name": "your-package-name",
  "version": "1.0.0",
  "description": "Your description",
  "keywords": ["claude", "ai", "reporter"],
  "author": "Your Name <email>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/user/repo.git"
  },
  "bin": {
    "command-name": "./bin/setup.js"
  }
}
```

### Scoped vs Non-scoped Packages

**Scoped** (recommended):
```json
{
  "name": "@yourusername/claude-reporter-setup"
}
```
- Pros: Namespace, no name conflicts
- Cons: Longer name

**Non-scoped**:
```json
{
  "name": "claude-reporter-setup"
}
```
- Pros: Shorter name
- Cons: Name might be taken

---

## 🤖 GitHub Actions Setup

### Step 1: Create NPM Token

1. Go to: https://www.npmjs.com/settings/[username]/tokens
2. Generate New Token
3. Type: Automation
4. Copy token

### Step 2: Add to GitHub Secrets

1. Go to: https://github.com/[user]/[repo]/settings/secrets/actions
2. New repository secret
3. Name: `NPM_TOKEN`
4. Value: [paste token]
5. Add secret

### Step 3: Workflow is Ready!

The workflow file is already in `.github/workflows/publish.yml`

Now whenever you:
```bash
git tag v1.0.1
git push --tags
```

Or create a Release on GitHub, it will auto-publish to NPM!

---

## 📈 Versioning

### Semantic Versioning

```
MAJOR.MINOR.PATCH

1.0.0 → 1.0.1  (patch: bug fixes)
1.0.0 → 1.1.0  (minor: new features)
1.0.0 → 2.0.0  (major: breaking changes)
```

### Update Version

```bash
# Patch (1.0.0 → 1.0.1)
npm version patch

# Minor (1.0.0 → 1.1.0)
npm version minor

# Major (1.0.0 → 2.0.0)
npm version major
```

This will:
1. Update package.json
2. Create git commit
3. Create git tag

Then:
```bash
git push --follow-tags
npm publish
```

---

## 🎨 Customization Ideas

### Add More Features

Edit `bin/setup.js`:

```javascript
// Add Slack integration
const answers = await inquirer.prompt([
  {
    type: 'input',
    name: 'slackWebhook',
    message: 'Slack webhook URL (optional):'
  }
]);
```

Edit Python script to send to Slack.

### Add More Commands

```javascript
// In main()
if (cmd === '--reset') {
  // Reset configuration
  // Clear database
  // etc.
}
```

### Custom Reporters

Users can create custom reporters:

```python
# ~/.claude-reporter/custom-reporter.py

def send_report(data):
    # Custom logic
    # Send to your own API
    # Process data however you want
    pass
```

---

## 🐛 Troubleshooting

### "npm ERR! 403 Forbidden"

Solutions:
1. Not logged in → `npm login`
2. Package name taken → Change name in package.json
3. Scoped package → Add `--access public`

### "npm ERR! E404 Not Found"

The package name doesn't exist. This is OK for first publish!

### "EACCES: permission denied"

```bash
sudo chown -R $USER ~/.npm
```

### "Module not found"

```bash
npm install
```

### Test fails

```bash
npm install
npm test
```

Fix errors shown in output.

---

## 📊 Analytics & Monitoring

### NPM Downloads

Check at: https://www.npmjs.com/package/your-package

### GitHub Stats

- Stars
- Forks
- Issues
- Pull requests

### User Feedback

Monitor:
- GitHub Issues
- npm reviews
- Social media mentions

---

## 🎯 Marketing Your Package

### 1. Write Good README

- Clear description
- Screenshots/GIFs
- Quick start guide
- Examples

### 2. Social Media

Post on:
- Twitter/X
- Reddit (r/javascript, r/node)
- Dev.to
- Hacker News

### 3. Add Badges

```markdown
![npm version](https://img.shields.io/npm/v/your-package.svg)
![downloads](https://img.shields.io/npm/dm/your-package.svg)
![license](https://img.shields.io/npm/l/your-package.svg)
```

### 4. GitHub Topics

Add topics to your repo:
- claude
- ai
- automation
- cli
- reporter

---

## 📚 Resources

### Official Docs
- [NPM Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

### Tools
- [npm-check-updates](https://www.npmjs.com/package/npm-check-updates)
- [np](https://www.npmjs.com/package/np) - Better `npm publish`
- [semantic-release](https://www.npmjs.com/package/semantic-release)

### Communities
- [NPM Community](https://npm.community/)
- [Node.js Discord](https://discord.gg/nodejs)
- [r/node](https://reddit.com/r/node)

---

## 🏆 Success Checklist

After publishing:

- [ ] Package appears on npmjs.com
- [ ] Can install with `npx package-name`
- [ ] README displays correctly
- [ ] All links work
- [ ] Tests pass
- [ ] Documentation complete
- [ ] License included
- [ ] Version tagged in Git
- [ ] GitHub repo has description
- [ ] GitHub topics added
- [ ] Announced on social media

---

## 🎉 Next Steps

1. **Use it yourself** - Dogfood your own package
2. **Get feedback** - Ask friends to try it
3. **Fix bugs** - Monitor issues
4. **Add features** - Based on user requests
5. **Update docs** - Keep README current
6. **Release updates** - Regular maintenance

---

## 💡 Tips & Best Practices

1. **Semantic Versioning** - Always follow semver
2. **Changelog** - Update CHANGELOG.md every release
3. **Testing** - Test before publishing
4. **Documentation** - Good docs = more users
5. **Responsiveness** - Reply to issues quickly
6. **Deprecation** - Warn before removing features
7. **Security** - Keep dependencies updated

---

**Good luck! 🚀**

Questions? Open an issue on GitHub!
