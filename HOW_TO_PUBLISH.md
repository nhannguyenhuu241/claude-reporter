# 🚀 How to Publish to NPM - Super Quick

## 3 Bước Đơn Giản

### 1. Create NPM Account (2 phút)

Vào: https://www.npmjs.com/signup

Điền form → Verify email → Xong!

### 2. Login (30 giây)

```bash
npm login
```

Nhập username, password, email.

### 3. Publish (10 giây)

```bash
cd claude-reporter
./publish.sh
```

Nhấn `y` → Xong!

---

## Thế thôi!

Package đã lên NPM tại:
```
https://npmjs.com/package/@yourusername/claude-reporter-setup
```

Ai cũng có thể dùng:
```bash
npx @yourusername/claude-reporter-setup
```

---

## Chi tiết hơn?

- 📖 Full guide: [NPM_PUBLISH_GUIDE.md](NPM_PUBLISH_GUIDE.md)
- 📋 Quick ref: [NPM_QUICK_REF.md](NPM_QUICK_REF.md)

---

## Update Package?

```bash
# Sửa code
vim bin/setup.js

# Bump version
npm version patch

# Publish
./publish.sh
```

---

**Easy! 🎉**
