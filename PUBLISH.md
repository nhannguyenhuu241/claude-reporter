# 📦 Hướng dẫn Publish lên NPM

## Bước 1: Tạo tài khoản NPM

1. Truy cập https://www.npmjs.com/signup
2. Đăng ký tài khoản
3. Verify email

## Bước 2: Login NPM CLI

```bash
npm login
```

Nhập:
- Username
- Password  
- Email
- OTP (nếu bật 2FA)

## Bước 3: Update package.json

```bash
cd claude-reporter

# Update các field:
# - name: đổi thành tên package độc nhất
# - version: đổi thành 1.0.0
# - author: tên bạn
# - repository: GitHub repo URL của bạn
```

Ví dụ:

```json
{
  "name": "@yourusername/claude-reporter-setup",
  "version": "1.0.0",
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/claude-reporter-setup.git"
  }
}
```

## Bước 4: Test local

```bash
# Install dependencies
npm install

# Test locally
npm link
claude-reporter-setup

# Nếu ok, unlink
npm unlink
```

## Bước 5: Publish

```bash
# Dry run để check
npm publish --dry-run

# Publish thật
npm publish

# Nếu là scoped package (@yourusername/...)
npm publish --access public
```

## Bước 6: Verify

```bash
# Check trên NPM
# https://www.npmjs.com/package/your-package-name

# Test install
npx your-package-name
```

## Update Version

Khi có update:

```bash
# Patch version (1.0.0 -> 1.0.1)
npm version patch

# Minor version (1.0.0 -> 1.1.0)  
npm version minor

# Major version (1.0.0 -> 2.0.0)
npm version major

# Push tag
git push --tags

# Publish
npm publish
```

## CI/CD với GitHub Actions

Tạo file `.github/workflows/publish.yml`:

```yaml
name: Publish to NPM

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Setup NPM token:
1. NPM → Account Settings → Access Tokens → Generate New Token
2. GitHub Repo → Settings → Secrets → New repository secret
3. Name: `NPM_TOKEN`, Value: token từ NPM

## Checklist trước khi Publish

- [ ] README.md đầy đủ
- [ ] LICENSE file
- [ ] .gitignore đúng
- [ ] package.json correct info
- [ ] Test trên nhiều OS (macOS, Linux)
- [ ] Bump version number
- [ ] Git tag version
- [ ] Update CHANGELOG.md

## Unpublish (nếu cần)

```bash
# Unpublish specific version (trong 72h)
npm unpublish package-name@version

# Unpublish toàn bộ package (DANGER!)
npm unpublish package-name --force
```

## Best Practices

1. **Semantic Versioning**: Follow semver (MAJOR.MINOR.PATCH)
2. **Changelog**: Update CHANGELOG.md mỗi release
3. **Git Tags**: Tag mỗi version
4. **Test**: Test kỹ trước khi publish
5. **Documentation**: README phải chi tiết

## Commands Tổng hợp

```bash
# Quy trình standard
git add .
git commit -m "Release v1.0.1"
npm version patch
git push --follow-tags
npm publish

# All in one
npm version patch && git push --follow-tags && npm publish
```

## Troubleshooting

### "Package name already exists"

Đổi tên trong package.json hoặc dùng scoped package:
```json
{
  "name": "@yourusername/claude-reporter-setup"
}
```

### "You must verify your email"

Check email và verify trước khi publish.

### "403 Forbidden"

- Check npm login
- Check package name không bị reserved
- Nếu là scoped package, thêm `--access public`

## Resources

- [NPM Docs](https://docs.npmjs.com/)
- [Semantic Versioning](https://semver.org/)
- [NPM Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
