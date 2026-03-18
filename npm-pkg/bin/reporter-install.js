#!/usr/bin/env node
/**
 * reporter-install — install Claude Reporter hooks into Claude Code settings.
 * Works on macOS, Linux, and Windows.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const SERVER_URL =
  process.env.CLAUDE_REPORTER_URL ||
  "https://vibe-reporter.onebot-training.meobeo.ai";

const isWindows = process.platform === "win32";
const homeDir = os.homedir();

const HOOKS_DIR = path.join(homeDir, ".claude", "hooks");
const SETTINGS_PATH = path.join(homeDir, ".claude", "settings.json");
const UUID_FILE = path.join(homeDir, ".claude-reporter-uuid");

const HOOK_PATH = isWindows
  ? path.join(HOOKS_DIR, "claude-reporter.ps1")
  : path.join(HOOKS_DIR, "claude-reporter.sh");

const HOOK_CMD = isWindows
  ? `powershell -ExecutionPolicy Bypass -File "${path.join("~", ".claude", "hooks", "claude-reporter.ps1")}"`
  : `~/.claude/hooks/claude-reporter.sh`;

const SCRIPT_URL = isWindows
  ? `${SERVER_URL}/hooks/reporter.ps1`
  : `${SERVER_URL}/hooks/reporter.sh`;

console.log(`Installing Claude Reporter hook...`);
console.log(`  Server: ${SERVER_URL}`);
console.log(``);

// 1. Download hook script
fs.mkdirSync(HOOKS_DIR, { recursive: true });

const tmpPath = HOOK_PATH + ".tmp";
const file = fs.createWriteStream(tmpPath);

https
  .get(SCRIPT_URL, (res) => {
    if (res.statusCode !== 200) {
      fs.unlinkSync(tmpPath);
      console.error(`Failed to download hook: HTTP ${res.statusCode}`);
      process.exit(1);
    }

    res.pipe(file);

    file.on("finish", () => {
      file.close(() => {
        fs.renameSync(tmpPath, HOOK_PATH);
        if (!isWindows) {
          try { execSync(`chmod +x "${HOOK_PATH}"`); } catch (_) {}
        }
        console.log(`Hook script → ${HOOK_PATH}`);

        // 2. Check UUID
        if (fs.existsSync(UUID_FILE)) {
          const uuid = fs.readFileSync(UUID_FILE, "utf8").trim();
          console.log(`UUID found  → ${uuid}`);
        } else {
          console.log(``);
          console.log(`No UUID found at ${UUID_FILE}`);
          console.log(`  → Register at ${SERVER_URL}/login`);
          console.log(`  → Then run: echo YOUR_UUID > ${UUID_FILE}`);
        }

        // 3. Merge settings.json
        console.log(``);
        mergeSettings();

        console.log(``);
        console.log(`Done! Restart Claude Code to start capturing sessions.`);
        console.log(``);
        console.log(`To update the hook later, run: reporter-update`);
      });
    });
  })
  .on("error", (err) => {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    console.error(`Installation failed: ${err.message}`);
    process.exit(1);
  });

function mergeSettings() {
  const hookEntry = { type: "command", command: HOOK_CMD };
  const events = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop", "Notification"];

  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    } catch (_) {
      settings = {};
    }

    // Check if already installed
    const hooks = settings.hooks || {};
    const stopHooks = hooks.Stop || [];
    const alreadyInstalled = stopHooks.some(
      (h) => h.hooks && h.hooks.some((hh) => hh.command && hh.command.includes("claude-reporter"))
    );

    if (alreadyInstalled) {
      console.log(`Hook already in ${SETTINGS_PATH}`);
      return;
    }
  }

  if (!settings.hooks) settings.hooks = {};
  for (const event of events) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    settings.hooks[event].push({ hooks: [hookEntry] });
  }

  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  console.log(`Settings updated → ${SETTINGS_PATH}`);
}
