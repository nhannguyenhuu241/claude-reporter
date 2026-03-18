#!/usr/bin/env node
"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

const SERVER_URL =
  process.env.CLAUDE_REPORTER_URL ||
  "https://vibe-reporter.onebot-training.meobeo.ai";

const IS_WINDOWS = process.platform === "win32";
const HOME = os.homedir();
const HOOK_SCRIPT = IS_WINDOWS
  ? path.join(HOME, ".claude", "hooks", "claude-reporter.ps1")
  : path.join(HOME, ".claude", "hooks", "claude-reporter.sh");

const DOWNLOAD_URL = IS_WINDOWS
  ? `${SERVER_URL}/hooks/reporter.ps1`
  : `${SERVER_URL}/hooks/reporter.sh`;

// ANSI colors
const isCI = process.env.CI || !process.stdout.isTTY;
const clr = isCI ? (_, t) => t : (code, t) => `\x1b[${code}m${t}\x1b[0m`;
const bold  = (t) => clr("1",  t);
const green = (t) => clr("32", t);
const red   = (t) => clr("31", t);
const gray  = (t) => clr("90", t);
const cyan  = (t) => clr("36", t);

console.log();
console.log(bold("  Updating Claude Reporter hook..."));
console.log(`  ${gray("From:")} ${cyan(DOWNLOAD_URL)}`);
console.log(`  ${gray("To:  ")} ${cyan(HOOK_SCRIPT)}`);
console.log();

fs.mkdirSync(path.dirname(HOOK_SCRIPT), { recursive: true });

const tmpPath = HOOK_SCRIPT + ".tmp";
const file = fs.createWriteStream(tmpPath);

const proto = DOWNLOAD_URL.startsWith("https") ? https : http;
proto.get(DOWNLOAD_URL, (res) => {
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    file.close();
    fs.unlinkSync(tmpPath);
    // simple redirect follow
    require("child_process").execFileSync(process.execPath, [__filename], {
      env: { ...process.env, _REDIRECT: res.headers.location },
      stdio: "inherit",
    });
    return;
  }
  if (res.statusCode !== 200) {
    file.close();
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    console.error(`  ${red("✖")} Server returned HTTP ${res.statusCode}`);
    process.exit(1);
  }

  res.pipe(file);
  file.on("finish", () => {
    file.close(() => {
      fs.renameSync(tmpPath, HOOK_SCRIPT);
      if (!IS_WINDOWS) {
        try { require("child_process").execSync(`chmod +x "${HOOK_SCRIPT}"`); } catch (_) {}
      } else {
        exec(`powershell -Command "Unblock-File -Path '${HOOK_SCRIPT}'"`, () => {});
      }
      console.log(`  ${green("✔")} Updated successfully!`);
      console.log(`  ${gray("›")} Restart Claude Code if it's running.`);
      console.log();
    });
  });
}).on("error", (err) => {
  try { fs.unlinkSync(tmpPath); } catch (_) {}
  console.error(`  ${red("✖")} Update failed: ${err.message}`);
  process.exit(1);
});
