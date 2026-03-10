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
const SERVER_URL = "https://vibe-reporter.onebot-training.meobeo.ai";

const HOME = os.homedir();
const HOOKS_DIR = path.join(HOME, ".claude", "hooks");
const HOOK_SCRIPT = path.join(HOOKS_DIR, "claude-reporter.sh");
const SETTINGS_PATH = path.join(HOME, ".claude", "settings.json");
const UUID_FILE = path.join(HOME, ".claude-reporter-uuid");

const HOOK_ENTRY = {
  type: "command",
  command: "~/.claude/hooks/claude-reporter.sh",
};
const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Stop",
  "Notification",
];

// ──────────────────────────────────────────
// Colors (ANSI, no deps)
// ──────────────────────────────────────────
const isCI = process.env.CI || !process.stdout.isTTY;
const clr = isCI
  ? (_, t) => t
  : (code, t) => `\x1b[${code}m${t}\x1b[0m`;

const bold = (t) => clr("1", t);
const dim = (t) => clr("2", t);
const green = (t) => clr("32", t);
const yellow = (t) => clr("33", t);
const cyan = (t) => clr("36", t);
const red = (t) => clr("31", t);
const gray = (t) => clr("90", t);
const accent = (t) => clr("35", t); // magenta

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────
function step(n, total, msg) {
  console.log(`\n${bold(cyan(`[${n}/${total}]`))} ${bold(msg)}`);
}

function ok(msg) {
  console.log(`  ${green("✔")} ${msg}`);
}

function warn(msg) {
  console.log(`  ${yellow("⚠")}  ${msg}`);
}

function fail(msg) {
  console.error(`  ${red("✖")} ${msg}`);
}

function info(msg) {
  console.log(`  ${gray("›")} ${msg}`);
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto
      .get(url, (res) => {
        // follow redirect
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(httpGet(res.headers.location));
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      })
      .on("error", reject);
  });
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
      ? `start "" "${url}"`
      : `xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || true`;
  exec(cmd);
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ──────────────────────────────────────────
// Steps
// ──────────────────────────────────────────

async function installHookScript() {
  step(1, 4, "Installing hook script");

  // Create hooks dir
  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // Check if already installed
  const alreadyInstalled = fs.existsSync(HOOK_SCRIPT);

  // Download reporter.sh from server
  const url = `${SERVER_URL}/hooks/reporter.sh`;
  info(`Downloading from ${gray(url)}`);

  try {
    const { status, body } = await httpGet(url);
    if (status !== 200) throw new Error(`HTTP ${status}`);

    fs.writeFileSync(HOOK_SCRIPT, body, { mode: 0o755 });
    ok(
      `Hook script ${alreadyInstalled ? "updated" : "installed"} → ${dim(HOOK_SCRIPT)}`
    );
  } catch (err) {
    fail(`Failed to download hook script: ${err.message}`);
    fail(`Try manually: curl -s ${SERVER_URL}/hooks/reporter.sh > ${HOOK_SCRIPT} && chmod +x ${HOOK_SCRIPT}`);
    process.exit(1);
  }
}

function mergeSettings() {
  step(2, 4, "Updating Claude settings");

  let settings = {};
  let existed = false;

  if (fs.existsSync(SETTINGS_PATH)) {
    existed = true;
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    } catch {
      warn(`Could not parse ${SETTINGS_PATH} — backing up and recreating`);
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
      const alreadyHas = settings.hooks[event].some((group) =>
        Array.isArray(group.hooks) &&
        group.hooks.some((h) => h.command === HOOK_ENTRY.command)
      );
      if (!alreadyHas) {
        settings.hooks[event].push({ hooks: [HOOK_ENTRY] });
        added++;
      }
    }
  }

  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));

  if (added > 0) {
    ok(`Added hook to ${added} event${added > 1 ? "s" : ""} in ${dim(SETTINGS_PATH)}`);
  } else {
    ok(`Hook already present in ${dim(SETTINGS_PATH)}`);
  }

  if (!existed) {
    ok("Created settings.json");
  }
}

async function registerUUID() {
  step(3, 4, "Register your UUID");

  // Check if UUID already exists
  if (fs.existsSync(UUID_FILE)) {
    const existing = fs.readFileSync(UUID_FILE, "utf8").trim();
    if (existing) {
      info(`UUID file already exists: ${dim(UUID_FILE)}`);
      const keep = await prompt(
        `  ${yellow("?")} Keep existing UUID ${accent(existing.slice(0, 8))}…? ${gray("[Y/n]")} `
      );
      if (!keep || keep.toLowerCase() !== "n") {
        ok(`Using existing UUID: ${accent(existing)}`);
        return existing;
      }
    }
  }

  // Open browser
  const loginUrl = `${SERVER_URL}/login`;
  info(`Opening ${cyan(loginUrl)} in your browser…`);
  openBrowser(loginUrl);
  console.log();
  console.log(
    `  ${gray("If the browser didn't open, visit:")} ${cyan(loginUrl)}`
  );
  console.log(
    `  ${gray("Enter your email to get a UUID, then come back here.")}`
  );
  console.log();

  // Prompt for UUID
  let uuid = "";
  while (true) {
    uuid = await prompt(`  ${bold(yellow("›"))} ${bold("Enter your UUID:")} `);

    if (!uuid) {
      warn("UUID cannot be empty. Try again.");
      continue;
    }

    // Basic UUID format check (8-4-4-4-12)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      warn(`That doesn't look like a valid UUID. Expected format: ${gray("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")}`);
      const retry = await prompt(`  ${yellow("?")} Try again? ${gray("[Y/n]")} `);
      if (retry.toLowerCase() === "n") process.exit(0);
      continue;
    }

    // Validate against server
    info("Verifying UUID with server…");
    try {
      const { status, body } = await httpGet(`${SERVER_URL}/api/auth/verify/${uuid}`);
      if (status === 200) {
        const data = JSON.parse(body);
        if (data.valid) {
          ok(`UUID verified — linked to ${accent(data.email)}`);
          return uuid;
        }
      }
      warn("UUID not found. Make sure you registered at the login page first.");
      const retry = await prompt(`  ${yellow("?")} Try again? ${gray("[Y/n]")} `);
      if (retry.toLowerCase() === "n") process.exit(0);
    } catch {
      warn("Could not verify UUID (no internet?). Saving anyway.");
      return uuid;
    }
  }
}

async function saveUUID(uuid) {
  step(4, 4, "Saving UUID");
  fs.writeFileSync(UUID_FILE, uuid + "\n");
  ok(`UUID saved → ${dim(UUID_FILE)}`);
}

// ──────────────────────────────────────────
// Main
// ──────────────────────────────────────────
async function main() {
  console.log();
  console.log(
    bold(accent("  ◆ Claude Reporter Setup"))
  );
  console.log(
    dim("  Connects Claude Code sessions to your real-time dashboard")
  );
  console.log(
    dim(`  Dashboard: ${cyan(SERVER_URL)}`)
  );
  console.log();

  try {
    await installHookScript();
    mergeSettings();
    const uuid = await registerUUID();
    await saveUUID(uuid);
  } catch (err) {
    console.error();
    fail(`Unexpected error: ${err.message}`);
    process.exit(1);
  }

  // Done!
  console.log();
  console.log("  " + "─".repeat(50));
  console.log();
  console.log(`  ${green("🎉")} ${bold("All done! You're set up.")}`);
  console.log();
  console.log(`  ${gray("›")} ${dim("Restart Claude Code — sessions will be tracked automatically.")}`);
  console.log(`  ${gray("›")} ${dim("Dashboard:")} ${cyan(SERVER_URL)}`);
  console.log();
}

main();
