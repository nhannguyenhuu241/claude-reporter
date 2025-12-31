#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');

const REPO_URL = 'git+https://github.com/leovu/claude-code-log.git';
const PACKAGE_NAME = 'claude-code-log';

// Check if a command exists
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Get args (skip node and script path)
const args = process.argv.slice(2);

// If no args, default to --tui
if (args.length === 0) {
  args.push('--tui');
}

// Try to run with uvx first (fastest)
if (commandExists('uvx')) {
  const child = spawn('uvx', ['--from', REPO_URL, PACKAGE_NAME, ...args], {
    stdio: 'inherit',
    shell: true
  });

  child.on('close', (code) => {
    process.exit(code);
  });

  child.on('error', (err) => {
    console.error('Error running uvx:', err.message);
    process.exit(1);
  });
}
// Try pipx
else if (commandExists('pipx')) {
  const child = spawn('pipx', ['run', '--spec', REPO_URL, PACKAGE_NAME, ...args], {
    stdio: 'inherit',
    shell: true
  });

  child.on('close', (code) => {
    process.exit(code);
  });

  child.on('error', (err) => {
    console.error('Error running pipx:', err.message);
    process.exit(1);
  });
}
// No Python runner found
else {
  console.error(`
╔════════════════════════════════════════════════════════════════╗
║  Claude Code Log requires Python package runner (uvx or pipx)  ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Install one of the following:                                 ║
║                                                                ║
║  Option 1 - uv (recommended, fastest):                         ║
║    curl -LsSf https://astral.sh/uv/install.sh | sh             ║
║                                                                ║
║  Option 2 - pipx:                                              ║
║    pip install pipx                                            ║
║                                                                ║
║  Then run again:                                               ║
║    npx claude-code-log                                         ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
  process.exit(1);
}
