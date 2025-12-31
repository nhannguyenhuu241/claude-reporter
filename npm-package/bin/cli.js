#!/usr/bin/env node

const { spawn, execSync } = require('child_process');

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

// Filter stderr to hide uvx/pipx internal messages
function createFilteredSpawn(cmd, cmdArgs) {
  const child = spawn(cmd, cmdArgs, {
    stdio: ['inherit', 'inherit', 'pipe']
  });

  // Filter stderr - hide git/pip update messages
  child.stderr.on('data', (data) => {
    const text = data.toString();
    // Skip lines containing git URLs, pip warnings, or update messages
    const lines = text.split('\n').filter(line => {
      const lower = line.toLowerCase();
      return !(
        lower.includes('github.com') ||
        lower.includes('updating') ||
        lower.includes('updated') ||
        lower.includes('building') ||
        lower.includes('built') ||
        lower.includes('installed') ||
        lower.includes('resolved') ||
        lower.includes('prepared') ||
        lower.includes('warning') ||
        lower.includes('deprecation') ||
        line.trim() === ''
      );
    });
    if (lines.length > 0) {
      process.stderr.write(lines.join('\n') + '\n');
    }
  });

  return child;
}

// Try to run with uvx first (fastest)
if (commandExists('uvx')) {
  const child = createFilteredSpawn('uvx', ['--from', REPO_URL, PACKAGE_NAME, ...args]);

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
  const child = createFilteredSpawn('pipx', ['run', '--spec', REPO_URL, PACKAGE_NAME, ...args]);

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
