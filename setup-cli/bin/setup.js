#!/usr/bin/env node
"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const { exec } = require("child_process");

// ──────────────────────────────────────────
// Config
// ──────────────────────────────────────────
const SERVER_URL =
  process.env.CLAUDE_REPORTER_URL ||
  "https://vibe-reporter.onebot-training.meobeo.ai";

const IS_WINDOWS = process.platform === "win32";
const HOME = os.homedir();
const HOOKS_DIR = path.join(HOME, ".claude", "hooks");
const SETTINGS_PATH = path.join(HOME, ".claude", "settings.json");
const UUID_FILE = path.join(HOME, ".claude-reporter-uuid");

const HOOK_SCRIPT = IS_WINDOWS
  ? path.join(HOOKS_DIR, "claude-reporter.ps1")
  : path.join(HOOKS_DIR, "claude-reporter.sh");

const HOOK_COMMAND = IS_WINDOWS
  ? `powershell -ExecutionPolicy Bypass -NonInteractive -File "${HOOK_SCRIPT}"`
  : "~/.claude/hooks/claude-reporter.sh";

const HOOK_DOWNLOAD_URL = IS_WINDOWS
  ? `${SERVER_URL}/hooks/reporter.ps1`
  : `${SERVER_URL}/hooks/reporter.sh`;

const HOOK_ENTRY = { type: "command", command: HOOK_COMMAND };
const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop", "Notification"];

// ──────────────────────────────────────────
// Colors (ANSI, zero deps)
// ──────────────────────────────────────────
const isCI = process.env.CI || !process.stdout.isTTY;
const clr = isCI ? (_, t) => t : (code, t) => `\x1b[${code}m${t}\x1b[0m`;
const bold   = (t) => clr("1",   t);
const dim    = (t) => clr("2",   t);
const green  = (t) => clr("32",  t);
const yellow = (t) => clr("33",  t);
const cyan   = (t) => clr("36",  t);
const red    = (t) => clr("31",  t);
const gray   = (t) => clr("90",  t);
const accent = (t) => clr("35",  t);

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return String(str).replace(/\x1b\[[0-9;]*m/g, "");
}

// ──────────────────────────────────────────
// UI helpers
// ──────────────────────────────────────────
function step(n, total, msg) {
  console.log(`\n${bold(cyan(`[${n}/${total}]`))} ${bold(msg)}`);
}
function ok(msg)   { console.log(`  ${green("✔")} ${msg}`); }
function warn(msg) { console.log(`  ${yellow("⚠")}  ${msg}`); }
function fail(msg) { console.error(`  ${red("✖")} ${msg}`); }
function info(msg) { console.log(`  ${gray("›")} ${msg}`); }

function box(lines) {
  const inner = lines.map((l) => ` ${l} `);
  const width = Math.max(...inner.map((l) => stripAnsi(l).length));
  const bar = "─".repeat(width + 2);
  const pad = (l) => l + " ".repeat(width - stripAnsi(l).length);
  console.log(`  ╭${bar}╮`);
  for (const l of inner) console.log(`  │${pad(l)} │`);
  console.log(`  ╰${bar}╯`);
}

// ──────────────────────────────────────────
// Network
// ──────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(httpGet(res.headers.location));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const proto = u.protocol === "https:" ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = proto.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, json });
          } else {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          }
        } catch {
          reject(new Error(`Phản hồi không hợp lệ (HTTP ${res.statusCode})`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ──────────────────────────────────────────
// Input helpers
// ──────────────────────────────────────────
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
  });
}

function askPassword(question) {
  // On TTY Unix: mask with *
  if (process.stdin.isTTY && !IS_WINDOWS) {
    return new Promise((resolve) => {
      process.stdout.write(question);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      let pwd = "";
      const handler = (ch) => {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.removeListener("data", handler);
          process.stdin.pause();
          process.stdout.write("\n");
          resolve(pwd);
        } else if (ch === "\u0003") {
          process.exit();
        } else if (ch === "\u007F") {
          if (pwd.length > 0) { pwd = pwd.slice(0, -1); process.stdout.write("\b \b"); }
        } else {
          pwd += ch;
          process.stdout.write("*");
        }
      };
      process.stdin.on("data", handler);
    });
  }
  // Fallback: plain readline
  return ask(question);
}

function openBrowser(url) {
  const cmd = IS_WINDOWS
    ? `start "" "${url}"`
    : process.platform === "darwin"
    ? `open "${url}"`
    : `xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || true`;
  exec(cmd);
}

// ──────────────────────────────────────────
// Step 1 — Download hook script
// ──────────────────────────────────────────
async function installHookScript() {
  step(1, 4, `Tải hook script ${IS_WINDOWS ? "(PowerShell)" : "(bash)"}`);
  fs.mkdirSync(HOOKS_DIR, { recursive: true });
  const existed = fs.existsSync(HOOK_SCRIPT);

  info(`Đang tải từ ${gray(HOOK_DOWNLOAD_URL)}`);
  try {
    const { status, body } = await httpGet(HOOK_DOWNLOAD_URL);
    if (status !== 200) throw new Error(`HTTP ${status}`);

    // Patch server URL inside the script
    const patched = body.replace(/https:\/\/vibe-mcp\.onebot\.meobeo\.ai/g, SERVER_URL);
    fs.writeFileSync(HOOK_SCRIPT, patched, { mode: IS_WINDOWS ? undefined : 0o755 });

    if (IS_WINDOWS) exec(`powershell -Command "Unblock-File -Path '${HOOK_SCRIPT}'"`, () => {});

    ok(`Hook script ${existed ? "cập nhật" : "cài đặt"} → ${dim(HOOK_SCRIPT)}`);
  } catch (err) {
    fail(`Không tải được hook script: ${err.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────────
// Step 2 — Merge settings.json
// ──────────────────────────────────────────
function mergeSettings() {
  step(2, 4, "Cập nhật Claude Code settings");

  let settings = {};
  let existed = false;

  if (fs.existsSync(SETTINGS_PATH)) {
    existed = true;
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    } catch {
      warn(`Không đọc được ${SETTINGS_PATH} — backup và tạo lại`);
      fs.copyFileSync(SETTINGS_PATH, `${SETTINGS_PATH}.bak`);
      settings = {};
    }
  }

  if (!settings.hooks) settings.hooks = {};

  let added = 0;
  for (const event of HOOK_EVENTS) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [{ hooks: [HOOK_ENTRY] }];
      added++;
    } else {
      const has = settings.hooks[event].some(
        (g) =>
          Array.isArray(g.hooks) &&
          g.hooks.some((h) => h.command && h.command.includes("claude-reporter"))
      );
      if (!has) { settings.hooks[event].push({ hooks: [HOOK_ENTRY] }); added++; }
    }
  }

  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));

  if (added > 0) ok(`Đã gắn hook vào ${added} event → ${dim(SETTINGS_PATH)}`);
  else ok(`Hook đã tồn tại trong ${dim(SETTINGS_PATH)}`);
  if (!existed) ok("Đã tạo settings.json mới");
}

// ──────────────────────────────────────────
// Step 3 — Auth (register / login / manual)
// ──────────────────────────────────────────
async function getUUID() {
  step(3, 4, "Xác thực tài khoản");

  // Reuse existing UUID?
  if (fs.existsSync(UUID_FILE)) {
    const existing = fs.readFileSync(UUID_FILE, "utf8").trim();
    if (existing) {
      info(`Đã có UUID: ${accent(existing.slice(0, 8))}…`);
      const keep = await ask(`  ${yellow("?")} Giữ UUID cũ? ${gray("[Y/n]")} `);
      if (!keep || keep.toLowerCase() !== "n") {
        ok(`Dùng UUID hiện tại: ${accent(existing)}`);
        return existing;
      }
    }
  }

  return await authMenu();
}

async function authMenu() {
  console.log();
  console.log(`  ${bold("Chọn một tùy chọn:")}`);
  console.log(`    ${cyan("1")}  Đăng nhập  ${dim("(đã có tài khoản)")}`);
  console.log(`    ${cyan("2")}  Đăng ký    ${dim("(lần đầu sử dụng)")}`);
  console.log(`    ${cyan("3")}  Mở trình duyệt & nhập UUID thủ công`);
  console.log();

  const choice = await ask(`  ${bold(yellow("›"))} ${bold("Lựa chọn [1/2/3]:")} `);

  if (choice === "1") return await doLogin();
  if (choice === "2") return await doRegister();
  if (choice === "3") return await browserFlow();

  warn("Vui lòng nhập 1, 2 hoặc 3.");
  return await authMenu();
}

async function collectCredentials(action) {
  console.log();
  const email = await ask(`  ${bold(yellow("›"))} ${bold("Email:")} `);
  if (!email || !email.includes("@")) {
    warn("Email không hợp lệ. Thử lại.");
    return null;
  }
  const password = await askPassword(`  ${bold(yellow("›"))} ${bold("Mật khẩu:")} `);
  if (!password || password.length < 6) {
    warn("Mật khẩu phải ít nhất 6 ký tự.");
    return null;
  }
  return { email, password };
}

async function doLogin() {
  console.log(`\n  ${bold("Đăng nhập")}`);
  const creds = await collectCredentials("login");
  if (!creds) return await authMenu();

  info("Đang xác thực…");
  try {
    const { json } = await httpPost(
      `${SERVER_URL}/api/auth/login`,
      JSON.stringify(creds)
    );
    ok(`Đăng nhập thành công — ${accent(json.email)}`);
    return json.uuid;
  } catch (err) {
    warn(`Đăng nhập thất bại: ${err.message}`);
    const retry = await ask(`  ${yellow("?")} Thử lại? ${gray("[Y/n]")} `);
    if (!retry || retry.toLowerCase() !== "n") return await authMenu();
    process.exit(0);
  }
}

async function doRegister() {
  console.log(`\n  ${bold("Đăng ký tài khoản mới")}`);
  const creds = await collectCredentials("register");
  if (!creds) return await authMenu();

  info("Đang đăng ký…");
  try {
    const { json } = await httpPost(
      `${SERVER_URL}/api/auth/register`,
      JSON.stringify(creds)
    );
    ok(`Đăng ký thành công — ${accent(json.email)}`);
    return json.uuid;
  } catch (err) {
    warn(`Đăng ký thất bại: ${err.message}`);
    const retry = await ask(`  ${yellow("?")} Thử lại? ${gray("[Y/n]")} `);
    if (!retry || retry.toLowerCase() !== "n") return await authMenu();
    process.exit(0);
  }
}

async function browserFlow() {
  const loginUrl = `${SERVER_URL}/login`;
  console.log();
  info(`Đang mở trình duyệt: ${cyan(loginUrl)}`);
  openBrowser(loginUrl);
  console.log();
  box([
    bold("Hướng dẫn lấy UUID:"),
    "",
    `${cyan("1.")} Đăng ký / Đăng nhập tại trang vừa mở`,
    `${cyan("2.")} Vào trang ${bold("Profile")} (click vào email góc trên phải)`,
    `${cyan("3.")} Bấm ${bold("\"👁 Hiển thị\"")} để hiện UUID`,
    `${cyan("4.")} Bấm ${bold("\"Copy\"")} rồi dán vào dấu nhắc bên dưới`,
  ]);
  console.log();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  while (true) {
    const uuid = await ask(`  ${bold(yellow("›"))} ${bold("Dán UUID:")} `);
    if (!uuid) { warn("UUID không được để trống."); continue; }

    if (!uuidRegex.test(uuid)) {
      warn(`Định dạng không đúng. Cần: ${gray("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")}`);
      const retry = await ask(`  ${yellow("?")} Thử lại? ${gray("[Y/n]")} `);
      if (retry.toLowerCase() === "n") process.exit(0);
      continue;
    }

    info("Xác minh với server…");
    try {
      const { status, body } = await httpGet(`${SERVER_URL}/api/auth/verify/${uuid}`);
      if (status === 200) {
        const data = JSON.parse(body);
        if (data.valid) {
          ok(`UUID hợp lệ — ${accent(data.email)}`);
          return uuid;
        }
      }
      warn("UUID không tìm thấy trên server. Đăng ký tài khoản trước nhé.");
    } catch {
      warn("Không kết nối được server — lưu UUID và tiếp tục.");
      return uuid;
    }

    const retry = await ask(`  ${yellow("?")} Thử lại? ${gray("[Y/n]")} `);
    if (retry.toLowerCase() === "n") process.exit(0);
  }
}

// ──────────────────────────────────────────
// Step 4 — Save UUID
// ──────────────────────────────────────────
function saveUUID(uuid) {
  step(4, 4, "Lưu UUID vào máy");
  fs.writeFileSync(UUID_FILE, uuid);
  ok(`UUID đã lưu → ${dim(UUID_FILE)}`);
}

// ──────────────────────────────────────────
// Main
// ──────────────────────────────────────────
async function main() {
  console.log();
  console.log(bold(accent("  ◆ Claude Reporter — Thiết lập")));
  console.log(dim("  Kết nối Claude Code của bạn với dashboard theo dõi team"));
  console.log(dim(`  Dashboard: ${cyan(SERVER_URL)}`));
  if (IS_WINDOWS) console.log(dim(`  Platform:  ${yellow("Windows")} (PowerShell hook)`));
  console.log();

  try {
    await installHookScript();
    mergeSettings();
    const uuid = await getUUID();
    saveUUID(uuid);
  } catch (err) {
    console.error();
    fail(`Lỗi không mong đợi: ${err.message}`);
    process.exit(1);
  }

  console.log();
  console.log("  " + "─".repeat(52));
  console.log();
  console.log(`  ${green("🎉")} ${bold("Thiết lập hoàn tất!")}`);
  console.log();
  console.log(`  ${gray("›")} ${dim("Khởi động lại Claude Code — session sẽ tự động được ghi lại.")}`);
  console.log(`  ${gray("›")} ${dim("Dashboard:")} ${cyan(SERVER_URL)}`);
  console.log(`  ${gray("›")} ${dim("Profile:  ")} ${cyan(SERVER_URL + "/profile")}`);
  console.log();
}

main();
