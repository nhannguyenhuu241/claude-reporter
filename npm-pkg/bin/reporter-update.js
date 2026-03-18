#!/usr/bin/env node
/**
 * reporter-update — update the Claude Reporter hook script to the latest version.
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

const HOOK_PATH = isWindows
  ? path.join(homeDir, ".claude", "hooks", "claude-reporter.ps1")
  : path.join(homeDir, ".claude", "hooks", "claude-reporter.sh");

const SCRIPT_URL = isWindows
  ? `${SERVER_URL}/hooks/reporter.ps1`
  : `${SERVER_URL}/hooks/reporter.sh`;

console.log(`Updating Claude Reporter hook...`);
console.log(`  From : ${SCRIPT_URL}`);
console.log(`  To   : ${HOOK_PATH}`);

// Ensure hooks dir exists
fs.mkdirSync(path.dirname(HOOK_PATH), { recursive: true });

const tmpPath = HOOK_PATH + ".tmp";
const file = fs.createWriteStream(tmpPath);

https
  .get(SCRIPT_URL, (res) => {
    if (res.statusCode !== 200) {
      fs.unlinkSync(tmpPath);
      console.error(`Failed: server returned HTTP ${res.statusCode}`);
      process.exit(1);
    }

    res.pipe(file);

    file.on("finish", () => {
      file.close(() => {
        fs.renameSync(tmpPath, HOOK_PATH);
        if (!isWindows) {
          try {
            execSync(`chmod +x "${HOOK_PATH}"`);
          } catch (_) {}
        }
        console.log(`\nUpdated successfully!`);
        console.log(
          `Restart Claude Code for the new hook to take effect (if running).`
        );
      });
    });
  })
  .on("error", (err) => {
    try {
      fs.unlinkSync(tmpPath);
    } catch (_) {}
    console.error(`Update failed: ${err.message}`);
    process.exit(1);
  });
