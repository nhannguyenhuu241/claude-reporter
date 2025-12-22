#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');

const HOME = os.homedir();
const INSTALL_DIR = path.join(HOME, '.claude-reporter');
const CONFIG_FILE = path.join(INSTALL_DIR, 'config.json');
const DB_FILE = path.join(INSTALL_DIR, 'sessions.db');

console.log(chalk.cyan.bold('\n🚀 Claude Code Auto Reporter - Setup\n'));

async function main() {
  try {
    // 1. Check prerequisites
    await checkPrerequisites();
    
    // 2. Create installation directory
    createInstallDir();
    
    // 3. Install Python dependencies
    await installPythonDeps();
    
    // 4. Create Python reporter script
    createReporterScript();
    
    // 5. Configure webhook
    const config = await configureWebhook();
    
    // 6. Setup shell alias
    await setupShellAlias();
    
    // 7. Create helper scripts
    createHelperScripts();
    
    // 8. Test installation
    await testInstallation();
    
    // 9. Show success message
    showSuccessMessage(config);
    
  } catch (error) {
    console.error(chalk.red('\n❌ Installation failed:'), error.message);
    process.exit(1);
  }
}

async function checkPrerequisites() {
  const spinner = ora('Checking prerequisites...').start();

  // Check Python
  let pythonFound = false;
  try {
    execSync('python3 --version', { stdio: 'pipe' });
    spinner.succeed('Python3 found');
    pythonFound = true;
  } catch (error) {
    spinner.fail('Python3 not found');

    // Offer to install Python 3
    const installed = await installPython3();
    if (!installed) {
      throw new Error('Python 3 is required. Please install it manually and try again.');
    }
    pythonFound = true;
  }

  // Check pip
  let pipFound = false;
  try {
    execSync('pip3 --version', { stdio: 'pipe' });
    pipFound = true;
  } catch (error) {
    try {
      execSync('pip --version', { stdio: 'pipe' });
      pipFound = true;
    } catch (error2) {
      // pip not found, try to install it
      console.log(chalk.yellow('\n⚠️  pip not found, attempting to install...'));
      try {
        execSync('python3 -m ensurepip --upgrade', { stdio: 'pipe' });
        pipFound = true;
        console.log(chalk.green('✅ pip installed successfully'));
      } catch (pipError) {
        spinner.fail('pip not found');
        throw new Error('Please install pip first: python3 -m ensurepip --upgrade');
      }
    }
  }

  // Check Claude CLI (optional but helpful)
  try {
    execSync('which claude', { stdio: 'pipe' });
    spinner.succeed('Claude CLI found');
  } catch (error) {
    spinner.warn('Claude CLI not found');
    await offerClaudeCliInstall();
  }
}

async function offerClaudeCliInstall() {
  console.log(chalk.yellow('\n⚠️  Claude CLI is not installed.\n'));
  console.log(chalk.cyan('Claude CLI is the official command-line tool from Anthropic.'));
  console.log(chalk.cyan('You need it to use this reporter.\n'));

  const platform = os.platform();

  // Show installation options
  console.log(chalk.bold('Installation options:\n'));

  if (platform === 'darwin' || platform === 'linux') {
    console.log(chalk.cyan('  Option 1: NPM (Recommended)'));
    console.log(chalk.gray('    npm install -g @anthropic-ai/claude-code\n'));

    console.log(chalk.cyan('  Option 2: Direct download'));
    console.log(chalk.gray('    https://docs.anthropic.com/en/docs/claude-code\n'));
  } else if (platform === 'win32') {
    console.log(chalk.cyan('  Option 1: NPM'));
    console.log(chalk.gray('    npm install -g @anthropic-ai/claude-code\n'));

    console.log(chalk.cyan('  Option 2: WSL (Recommended for Windows)'));
    console.log(chalk.gray('    Install WSL, then use npm install\n'));
  }

  const { installChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'installChoice',
      message: 'What would you like to do?',
      choices: [
        { name: '📦 Install Claude CLI now (npm)', value: 'npm' },
        { name: '⏭️  Skip - I\'ll install it later', value: 'skip' },
        { name: '✅ I already have it installed elsewhere', value: 'have' }
      ]
    }
  ]);

  if (installChoice === 'npm') {
    const spinner = ora('Installing Claude CLI via npm...').start();

    try {
      execSync('npm install -g @anthropic-ai/claude-code', {
        stdio: 'inherit',
        timeout: 180000 // 3 minutes
      });
      spinner.succeed('Claude CLI installed successfully!');

      // Verify
      try {
        const version = execSync('claude --version', { stdio: 'pipe' }).toString().trim();
        console.log(chalk.green(`   Version: ${version}`));
      } catch (e) {
        console.log(chalk.yellow('   Note: You may need to restart your terminal to use claude command.'));
      }
    } catch (installError) {
      spinner.fail('Failed to install Claude CLI');
      console.log(chalk.yellow('\nPlease install manually:'));
      console.log(chalk.cyan('  npm install -g @anthropic-ai/claude-code\n'));
      console.log(chalk.gray('Or visit: https://docs.anthropic.com/en/docs/claude-code'));
    }
  } else if (installChoice === 'have') {
    console.log(chalk.green('\n✅ Great! Make sure it\'s in your PATH.'));
  } else {
    console.log(chalk.yellow('\n⚠️  Remember to install Claude CLI before using the reporter.'));
    console.log(chalk.gray('   npm install -g @anthropic-ai/claude-code\n'));
  }
}

async function installPython3() {
  console.log(chalk.yellow('\n🐍 Python 3 is required but not found.\n'));

  const platform = os.platform();

  // Detect package manager and OS
  let installMethod = null;
  let installCommand = null;
  let manualInstructions = [];

  if (platform === 'darwin') {
    // macOS
    try {
      execSync('which brew', { stdio: 'pipe' });
      installMethod = 'homebrew';
      installCommand = 'brew install python3';
    } catch (e) {
      manualInstructions = [
        'Option 1: Install Homebrew first, then Python:',
        '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        '  brew install python3',
        '',
        'Option 2: Download from python.org:',
        '  https://www.python.org/downloads/macos/'
      ];
    }
  } else if (platform === 'linux') {
    // Linux - detect package manager
    try {
      execSync('which apt-get', { stdio: 'pipe' });
      installMethod = 'apt';
      installCommand = 'sudo apt-get update && sudo apt-get install -y python3 python3-pip';
    } catch (e1) {
      try {
        execSync('which dnf', { stdio: 'pipe' });
        installMethod = 'dnf';
        installCommand = 'sudo dnf install -y python3 python3-pip';
      } catch (e2) {
        try {
          execSync('which yum', { stdio: 'pipe' });
          installMethod = 'yum';
          installCommand = 'sudo yum install -y python3 python3-pip';
        } catch (e3) {
          try {
            execSync('which pacman', { stdio: 'pipe' });
            installMethod = 'pacman';
            installCommand = 'sudo pacman -S python python-pip';
          } catch (e4) {
            manualInstructions = [
              'Please install Python 3 using your distribution\'s package manager:',
              '  Ubuntu/Debian: sudo apt-get install python3 python3-pip',
              '  Fedora: sudo dnf install python3 python3-pip',
              '  CentOS/RHEL: sudo yum install python3 python3-pip',
              '  Arch: sudo pacman -S python python-pip'
            ];
          }
        }
      }
    }
  } else if (platform === 'win32') {
    manualInstructions = [
      'Please install Python 3 from:',
      '  https://www.python.org/downloads/windows/',
      '',
      'Or using winget:',
      '  winget install Python.Python.3.12',
      '',
      'Or using chocolatey:',
      '  choco install python'
    ];
  }

  // If we can auto-install
  if (installCommand) {
    console.log(chalk.cyan(`Detected: ${installMethod}`));
    console.log(chalk.cyan(`Install command: ${installCommand}\n`));

    const { shouldInstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldInstall',
        message: 'Would you like to install Python 3 now?',
        default: true
      }
    ]);

    if (shouldInstall) {
      const spinner = ora('Installing Python 3...').start();

      try {
        execSync(installCommand, {
          stdio: 'inherit',
          timeout: 300000 // 5 minutes timeout
        });
        spinner.succeed('Python 3 installed successfully!');

        // Verify installation
        try {
          execSync('python3 --version', { stdio: 'pipe' });
          return true;
        } catch (verifyError) {
          spinner.warn('Python 3 installed but not in PATH. Please restart your terminal.');
          return false;
        }
      } catch (installError) {
        spinner.fail('Failed to install Python 3');
        console.log(chalk.red('\nAutomatic installation failed.'));
        console.log(chalk.yellow('Please install Python 3 manually:\n'));
        console.log(chalk.cyan(`  ${installCommand}\n`));
        return false;
      }
    } else {
      console.log(chalk.yellow('\nPlease install Python 3 manually:'));
      console.log(chalk.cyan(`  ${installCommand}\n`));
      return false;
    }
  } else {
    // Show manual instructions
    console.log(chalk.yellow('Automatic installation not available for your system.\n'));
    manualInstructions.forEach(line => {
      console.log(chalk.cyan(line));
    });
    console.log('');

    const { installed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'installed',
        message: 'Have you installed Python 3? (Press Enter to check again)',
        default: false
      }
    ]);

    if (installed) {
      try {
        execSync('python3 --version', { stdio: 'pipe' });
        console.log(chalk.green('✅ Python 3 detected!'));
        return true;
      } catch (e) {
        console.log(chalk.red('❌ Python 3 still not found. Please install it and try again.'));
        return false;
      }
    }

    return false;
  }
}

function createInstallDir() {
  const spinner = ora('Creating installation directory...').start();
  
  if (!fs.existsSync(INSTALL_DIR)) {
    fs.mkdirSync(INSTALL_DIR, { recursive: true });
  }
  
  // Create subdirectories
  const dirs = ['reports', 'logs', 'backups'];
  dirs.forEach(dir => {
    const dirPath = path.join(INSTALL_DIR, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });
  
  spinner.succeed('Installation directory created');
}

async function installPythonDeps() {
  const spinner = ora('Installing Python dependencies (this may take a minute)...').start();
  
  try {
    // Try pip3 first
    execSync('pip3 install --user requests psutil google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client --quiet 2>&1', { 
      stdio: 'pipe',
      timeout: 120000 
    });
    spinner.succeed('Python dependencies installed');
  } catch (error) {
    // Try pip if pip3 fails
    try {
      execSync('pip install --user requests psutil google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client --quiet 2>&1', { 
        stdio: 'pipe',
        timeout: 120000 
      });
      spinner.succeed('Python dependencies installed');
    } catch (error2) {
      spinner.warn('Some Python dependencies may need manual installation');
      console.log(chalk.yellow('\n💡 If you see errors later, run:'));
      console.log(chalk.yellow('   pip3 install requests psutil google-auth google-auth-oauthlib google-api-python-client\n'));
    }
  }
}

function createReporterScript() {
  const spinner = ora('Creating reporter script...').start();
  
  const reporterScript = `#!/usr/bin/env python3
"""
Claude Code Auto Reporter
Auto-track and report every Claude Code CLI session
"""

import os
import sys
import json
import time
import signal
import sqlite3
import subprocess
import atexit
import tempfile
from datetime import datetime
from pathlib import Path

# Lazy import for requests - only needed when sending reports
requests = None

def get_requests():
    """Lazy load requests module"""
    global requests
    if requests is None:
        try:
            import requests as req
            requests = req
        except ImportError:
            print("⚠️  'requests' not installed. Run: pip3 install requests")
            print("   Reports will be saved locally only.")
            return None
    return requests

def clean_log(content):
    """Clean terminal log for human readability"""
    import re

    if not content:
        return ''

    # Remove ANSI escape codes
    # ESC character is chr(27) or \\x1b
    # CSI sequences: ESC [ ... letter (most common for colors)
    content = re.sub(chr(27) + '\\\\[[0-9;?]*[a-zA-Z]', '', content)

    # OSC sequences: ESC ] ... BEL
    content = re.sub(chr(27) + '\\\\][^' + chr(7) + ']*' + chr(7), '', content)

    # Other escape sequences
    content = re.sub(chr(27) + '[()][AB012]', '', content)
    content = re.sub(chr(27) + '[@-Z_]', '', content)

    # Remove carriage returns
    content = content.replace('\\r\\n', '\\n')
    content = content.replace('\\r', '')

    # Remove null bytes
    content = content.replace(chr(0), '')

    # Remove excessive blank lines (more than 2 consecutive)
    content = re.sub('\\n{3,}', '\\n\\n', content)

    # Remove control characters except newline (10) and tab (9)
    content = ''.join(c for c in content if ord(c) >= 32 or c in '\\n\\t')

    # Clean up script command artifacts
    content = re.sub('Script started.*\\n', '', content)
    content = re.sub('Script done.*\\n', '', content)
    content = re.sub('Command exit status.*\\n', '', content)

    return content.strip()

class ClaudeReporter:
    def __init__(self):
        self.home = Path.home()
        self.install_dir = self.home / '.claude-reporter'
        self.db_path = self.install_dir / 'sessions.db'
        self.config_path = self.install_dir / 'config.json'
        self.init_db()
        self.load_config()
        
    def load_config(self):
        """Load configuration"""
        if self.config_path.exists():
            with open(self.config_path) as f:
                self.config = json.load(f)
        else:
            self.config = {
                'report_endpoint': '',
                'discord_webhook': '',
                'auto_report': True,
                'save_local': True,
                'log_commands': True
            }
            self.save_config()
    
    def save_config(self):
        """Save configuration"""
        with open(self.config_path, 'w') as f:
            json.dump(self.config, f, indent=2)
    
    def init_db(self):
        """Initialize SQLite database"""
        conn = sqlite3.connect(str(self.db_path))
        conn.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE,
                started_at TEXT,
                ended_at TEXT,
                status TEXT,
                working_dir TEXT,
                command TEXT,
                log_file TEXT,
                exit_code INTEGER,
                reported BOOLEAN DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
    
    def start_session(self, session_id, working_dir, command):
        """Start tracking a new session"""
        conn = sqlite3.connect(str(self.db_path))
        conn.execute('''
            INSERT INTO sessions (session_id, started_at, working_dir, command, status)
            VALUES (?, ?, ?, ?, 'running')
        ''', (session_id, datetime.now().isoformat(), working_dir, ' '.join(command)))
        conn.commit()
        conn.close()
    
    def end_session(self, session_id, status, log_file, exit_code=0):
        """End session and trigger report"""
        conn = sqlite3.connect(str(self.db_path))
        conn.execute('''
            UPDATE sessions 
            SET ended_at = ?, status = ?, log_file = ?, exit_code = ?
            WHERE session_id = ?
        ''', (datetime.now().isoformat(), status, log_file, exit_code, session_id))
        conn.commit()
        conn.close()
        
        if self.config.get('auto_report', True):
            self.send_report(session_id)
    
    def get_session_data(self, session_id):
        """Get session data from database"""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.execute(
            'SELECT * FROM sessions WHERE session_id = ?', 
            (session_id,)
        )
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        # Read log file
        log_preview = ''
        if row[7] and os.path.exists(row[7]):
            try:
                with open(row[7], 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    # Clean the log content for human readability
                    content = clean_log(content)
                    log_preview = content[:2000] if len(content) > 2000 else content
            except Exception as e:
                log_preview = f"Error reading log: {e}"
        
        return {
            'session_id': row[1],
            'started_at': row[2],
            'ended_at': row[3],
            'status': row[4],
            'working_dir': row[5],
            'command': row[6],
            'log_preview': log_preview,
            'exit_code': row[8],
            'timestamp': datetime.now().isoformat()
        }
    
    def send_report(self, session_id):
        """Send report to configured endpoints"""
        data = self.get_session_data(session_id)
        if not data:
            return
        
        storage_type = self.config.get('storage_type', 'local')
        
        # Save local backup (always)
        if self.config.get('save_local', True):
            report_file = self.install_dir / 'reports' / f'{session_id}.json'
            with open(report_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        
        # Send to Google Drive
        if storage_type == 'gdrive':
            self.send_to_gdrive(session_id, data)
        
        # Send to HTTP endpoint
        elif storage_type == 'webhook':
            endpoint = self.config.get('report_endpoint', '')
            if endpoint:
                req = get_requests()
                if not req:
                    print("⚠️  Cannot send webhook - requests module not installed")
                    return
                try:
                    response = req.post(
                        endpoint,
                        json=data,
                        timeout=10,
                        headers={'Content-Type': 'application/json'}
                    )
                    
                    if response.status_code < 300:
                        print(f"✅ Report sent successfully")
                        
                        # Mark as reported
                        conn = sqlite3.connect(str(self.db_path))
                        conn.execute(
                            'UPDATE sessions SET reported = 1 WHERE session_id = ?',
                            (session_id,)
                        )
                        conn.commit()
                        conn.close()
                    else:
                        print(f"⚠️  Report failed: HTTP {response.status_code}")
                        
                except Exception as e:
                    print(f"⚠️  Failed to send report: {e}")
        
        # Send Discord notification (if configured)
        webhook = self.config.get('discord_webhook', '')
        if webhook:
            self.send_discord(data, webhook)
    
    def send_to_gdrive(self, session_id, data):
        """Upload report to Google Drive"""
        try:
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from google.auth.transport.requests import Request
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaFileUpload
            import pickle
            
            SCOPES = ['https://www.googleapis.com/auth/drive.file']
            
            creds = None
            token_file = self.install_dir / 'gdrive_token.pickle'
            
            # Load existing credentials
            if token_file.exists():
                with open(token_file, 'rb') as token:
                    creds = pickle.load(token)
            
            # Refresh or get new credentials
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    print("🔐 Google Drive authentication required...")
                    print("A browser window will open for authorization.")
                    print("Please sign in and grant permissions.")
                    
                    # Check if credentials.json exists
                    creds_file = self.install_dir / 'credentials.json'
                    if not creds_file.exists():
                        print("")
                        print("❌ credentials.json not found!")
                        print("")
                        print("To setup Google Drive integration:")
                        print("1. Go to: https://console.cloud.google.com/")
                        print("2. Create a new project (or use existing)")
                        print("3. Enable Google Drive API")
                        print("4. Create OAuth 2.0 credentials (Desktop app)")
                        print("5. Download credentials.json")
                        print(f"6. Save it to: {creds_file}")
                        print("")
                        print("For now, falling back to local storage...")
                        return
                    
                    flow = InstalledAppFlow.from_client_secrets_file(
                        str(creds_file), SCOPES)
                    creds = flow.run_local_server(port=0)
                
                # Save credentials
                with open(token_file, 'wb') as token:
                    pickle.dump(creds, token)
            
            # Upload to Google Drive
            service = build('drive', 'v3', credentials=creds)
            
            folder_id = self.config.get('gdrive_folder_id', '')
            if not folder_id:
                print("⚠️  No Google Drive folder ID configured")
                return
            
            # Create temp JSON file
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp:
                json.dump(data, tmp, indent=2, ensure_ascii=False)
                tmp_path = tmp.name
            
            # Upload file
            file_metadata = {
                'name': f'claude-session-{session_id[:8]}.json',
                'parents': [folder_id]
            }
            media = MediaFileUpload(tmp_path, mimetype='application/json')
            
            file = service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, webViewLink'
            ).execute()
            
            print(f"✅ Uploaded to Google Drive")
            print(f"   File ID: {file.get('id')}")
            print(f"   Link: {file.get('webViewLink')}")
            
            # Cleanup temp file
            os.unlink(tmp_path)
            
            # Mark as reported
            conn = sqlite3.connect(str(self.db_path))
            conn.execute(
                'UPDATE sessions SET reported = 1 WHERE session_id = ?',
                (session_id,)
            )
            conn.commit()
            conn.close()
            
        except ImportError:
            print("⚠️  Google Drive libraries not installed")
            print("   Install with: pip3 install --user google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client")
            print("   Falling back to local storage...")
        except Exception as e:
            print(f"⚠️  Failed to upload to Google Drive: {e}")
            print("   Report saved locally instead.")
    
    def send_discord(self, data, webhook):
        """Send Discord webhook notification"""
        req = get_requests()
        if not req:
            return

        try:
            status_emoji = {
                'completed': '✅',
                'interrupted': '⚠️',
                'error': '❌'
            }.get(data['status'], '❓')

            color = {
                'completed': 3066993,  # Green
                'interrupted': 16776960,  # Yellow
                'error': 15158332  # Red
            }.get(data['status'], 8421504)  # Gray

            embed = {
                "embeds": [{
                    "title": f"{status_emoji} Claude Code Session",
                    "color": color,
                    "fields": [
                        {"name": "Status", "value": data['status'].upper(), "inline": True},
                        {"name": "Exit Code", "value": str(data.get('exit_code', 'N/A')), "inline": True},
                        {"name": "Working Directory", "value": f"\`{data['working_dir']}\`", "inline": False},
                        {"name": "Command", "value": f"\`{data['command']}\`", "inline": False},
                        {"name": "Started", "value": data['started_at'][:19], "inline": True},
                        {"name": "Ended", "value": data['ended_at'][:19] if data['ended_at'] else 'N/A', "inline": True},
                    ],
                    "footer": {"text": f"Session ID: {data['session_id'][:8]}..."},
                    "timestamp": datetime.now().isoformat()
                }]
            }

            if data.get('log_preview'):
                preview = data['log_preview'][:500]
                embed['embeds'][0]['description'] = f"\`\`\`\\n{preview}\\n\`\`\`"

            req.post(webhook, json=embed, timeout=5)

        except Exception as e:
            print(f"Discord notification failed: {e}")

    def start_server(self, port=8765):
        """Start local HTTP server for viewing reports"""
        from http.server import HTTPServer, BaseHTTPRequestHandler
        import urllib.parse
        import webbrowser

        reporter = self

        class ReportHandler(BaseHTTPRequestHandler):
            def log_message(self, format, *args):
                print(f"   [Server] {args[0]}")  # Log requests

            def do_GET(self):
                parsed = urllib.parse.urlparse(self.path)
                path = parsed.path

                try:
                    if path == '/' or path == '/index.html':
                        self.send_html(self.get_dashboard())
                    elif path == '/api/sessions':
                        self.send_json(self.get_sessions())
                    elif path.startswith('/api/session/'):
                        session_id = path.split('/')[-1]
                        self.send_json(self.get_session_detail(session_id))
                    elif path.startswith('/session/'):
                        session_id = path.split('/')[-1]
                        self.send_html(self.get_session_page(session_id))
                    else:
                        self.send_error(404)
                except Exception as e:
                    print(f"   [Error] {e}")
                    self.send_error(500, str(e))

            def send_html(self, content):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))

            def send_json(self, data):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(data, default=str).encode('utf-8'))

            def get_sessions(self):
                try:
                    conn = sqlite3.connect(str(reporter.db_path))
                    rows = conn.execute('''
                        SELECT session_id, started_at, ended_at, status, working_dir, command, exit_code
                        FROM sessions ORDER BY started_at DESC LIMIT 100
                    ''').fetchall()
                    conn.close()
                    return [{
                        'id': r[0], 'started': r[1], 'ended': r[2],
                        'status': r[3], 'dir': r[4], 'command': r[5], 'exit_code': r[6]
                    } for r in rows]
                except Exception as e:
                    print(f"   [DB Error] {e}")
                    return []

            def get_session_detail(self, session_id):
                try:
                    data = reporter.get_session_data(session_id)
                    if data:
                        # Read full log
                        log_path = reporter.install_dir / 'logs' / f'{session_id}.log'
                        if log_path.exists():
                            try:
                                raw_log = log_path.read_text(encoding='utf-8', errors='replace')
                                # Clean the log content for human readability
                                data['full_log'] = clean_log(raw_log)
                            except:
                                data['full_log'] = data.get('log_preview', '')
                    return data or {}
                except Exception as e:
                    print(f"   [Session Error] {e}")
                    return {}

            def get_dashboard(self):
                return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Reporter Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { color: #7c3aed; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
        h1::before { content: '🤖'; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .stat-card { background: #1a1a1a; padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #333; }
        .stat-card .number { font-size: 2em; font-weight: bold; color: #7c3aed; }
        .stat-card .label { color: #888; margin-top: 5px; }
        .sessions { background: #1a1a1a; border-radius: 12px; border: 1px solid #333; overflow: hidden; }
        .session { padding: 15px 20px; border-bottom: 1px solid #333; display: grid; grid-template-columns: auto 1fr auto; gap: 15px; align-items: center; cursor: pointer; transition: background 0.2s; }
        .session:hover { background: #252525; }
        .session:last-child { border-bottom: none; }
        .status { width: 12px; height: 12px; border-radius: 50%; }
        .status.completed { background: #22c55e; }
        .status.error { background: #ef4444; }
        .status.interrupted { background: #f59e0b; }
        .status.running { background: #3b82f6; animation: pulse 1s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .session-info { overflow: hidden; }
        .session-id { font-family: monospace; color: #7c3aed; font-size: 0.9em; }
        .session-cmd { color: #888; font-size: 0.85em; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .session-time { color: #666; font-size: 0.85em; text-align: right; white-space: nowrap; }
        .refresh-btn { background: #7c3aed; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin-bottom: 20px; }
        .refresh-btn:hover { background: #6d28d9; }
        .empty { text-align: center; padding: 40px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Claude Reporter Dashboard</h1>
        <button class="refresh-btn" onclick="loadSessions()">🔄 Refresh</button>
        <div class="stats" id="stats"></div>
        <div class="sessions" id="sessions"><div class="empty">Loading...</div></div>
    </div>
    <script>
        function goToSession(id) {
            window.location.href = '/session/' + id;
        }

        async function loadSessions() {
            try {
                var res = await fetch('/api/sessions');
                var sessions = await res.json();
                console.log('Loaded sessions:', sessions);

                var stats = { total: sessions.length, completed: 0, error: 0, interrupted: 0 };
                sessions.forEach(function(s) { if (stats[s.status] !== undefined) stats[s.status]++; });

                document.getElementById('stats').innerHTML =
                    '<div class="stat-card"><div class="number">' + stats.total + '</div><div class="label">Total</div></div>' +
                    '<div class="stat-card"><div class="number" style="color:#22c55e">' + stats.completed + '</div><div class="label">Completed</div></div>' +
                    '<div class="stat-card"><div class="number" style="color:#ef4444">' + stats.error + '</div><div class="label">Errors</div></div>' +
                    '<div class="stat-card"><div class="number" style="color:#f59e0b">' + stats.interrupted + '</div><div class="label">Interrupted</div></div>';

                if (sessions.length === 0) {
                    document.getElementById('sessions').innerHTML = '<div class="empty">No sessions yet. Run some claude commands first!</div>';
                    return;
                }

                document.getElementById('sessions').innerHTML = sessions.map(function(s) {
                    return '<div class="session" onclick="goToSession(\\'' + s.id + '\\')">' +
                        '<div class="status ' + (s.status || 'unknown') + '"></div>' +
                        '<div class="session-info">' +
                            '<div class="session-id">' + (s.id ? s.id.slice(0,8) : 'N/A') + '...</div>' +
                            '<div class="session-cmd">' + (s.command || s.dir || 'N/A') + '</div>' +
                        '</div>' +
                        '<div class="session-time">' + (s.started ? new Date(s.started).toLocaleString() : 'N/A') + '</div>' +
                    '</div>';
                }).join('');
            } catch (err) {
                console.error('Error loading sessions:', err);
                document.getElementById('sessions').innerHTML = '<div class="empty">Error loading sessions: ' + err.message + '</div>';
            }
        }
        loadSessions();
        setInterval(loadSessions, 10000);
    </script>
</body>
</html>'''

            def get_session_page(self, session_id):
                return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Session {session_id[:8]}...</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e0e0e0; }}
        .container {{ max-width: 1000px; margin: 0 auto; padding: 20px; }}
        h1 {{ color: #7c3aed; margin-bottom: 20px; font-size: 1.5em; }}
        .back {{ color: #7c3aed; text-decoration: none; display: inline-block; margin-bottom: 20px; }}
        .back:hover {{ text-decoration: underline; }}
        .meta {{ background: #1a1a1a; padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #333; }}
        .meta-row {{ display: flex; margin-bottom: 10px; }}
        .meta-label {{ color: #888; width: 120px; }}
        .meta-value {{ color: #e0e0e0; font-family: monospace; }}
        .status {{ display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.85em; }}
        .status.completed {{ background: #22c55e33; color: #22c55e; }}
        .status.error {{ background: #ef444433; color: #ef4444; }}
        .status.interrupted {{ background: #f59e0b33; color: #f59e0b; }}
        .log {{ background: #1a1a1a; padding: 20px; border-radius: 12px; border: 1px solid #333; }}
        .log h2 {{ color: #7c3aed; margin-bottom: 15px; font-size: 1.1em; }}
        .log pre {{ background: #0a0a0a; padding: 15px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em; line-height: 1.5; max-height: 600px; overflow-y: auto; }}
        .loading {{ text-align: center; padding: 40px; color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back">← Back to Dashboard</a>
        <h1>Session {session_id[:8]}...</h1>
        <div class="meta" id="meta"><div class="loading">Loading...</div></div>
        <div class="log">
            <h2>📝 Conversation Log</h2>
            <pre id="log">Loading...</pre>
        </div>
    </div>
    <script>
        async function loadSession() {{
            const res = await fetch('/api/session/{session_id}');
            const s = await res.json();

            if (!s.session_id) {{
                document.getElementById('meta').innerHTML = '<div class="loading">Session not found</div>';
                document.getElementById('log').textContent = 'No data available';
                return;
            }}

            document.getElementById('meta').innerHTML =
                '<div class="meta-row"><span class="meta-label">Session ID</span><span class="meta-value">' + s.session_id + '</span></div>' +
                '<div class="meta-row"><span class="meta-label">Status</span><span class="status ' + s.status + '">' + (s.status ? s.status.toUpperCase() : '') + '</span></div>' +
                '<div class="meta-row"><span class="meta-label">Started</span><span class="meta-value">' + s.started_at + '</span></div>' +
                '<div class="meta-row"><span class="meta-label">Ended</span><span class="meta-value">' + (s.ended_at || 'N/A') + '</span></div>' +
                '<div class="meta-row"><span class="meta-label">Directory</span><span class="meta-value">' + s.working_dir + '</span></div>' +
                '<div class="meta-row"><span class="meta-label">Command</span><span class="meta-value">' + s.command + '</span></div>' +
                '<div class="meta-row"><span class="meta-label">Exit Code</span><span class="meta-value">' + (s.exit_code !== null ? s.exit_code : 'N/A') + '</span></div>';

            document.getElementById('log').textContent = s.full_log || s.log_preview || 'No log available';
        }}
        loadSession();
    </script>
</body>
</html>'''

        print(f"\\n🌐 Claude Reporter Dashboard")
        print(f"   http://localhost:{port}")
        print(f"\\n   Press Ctrl+C to stop\\n")

        try:
            webbrowser.open(f'http://localhost:{port}')
        except:
            pass

        try:
            server = HTTPServer(('localhost', port), ReportHandler)
            server.serve_forever()
        except KeyboardInterrupt:
            print("\\n👋 Server stopped")

    def run_wrapper(self, args):
        """Wrap Claude CLI execution"""
        import uuid

        session_id = str(uuid.uuid4())
        working_dir = os.getcwd()

        # Create log file
        log_file = self.install_dir / 'logs' / f'{session_id}.log'

        print(f"📝 Session: {session_id[:8]}...")

        # Start session
        self.start_session(session_id, working_dir, args)

        status = 'completed'
        exit_code = 0

        def signal_handler(signum, frame):
            nonlocal status
            status = 'interrupted'
            print("\\n⚠️  Session interrupted!")
            cleanup()
            sys.exit(130)

        def cleanup():
            self.end_session(session_id, status, str(log_file), exit_code)

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        atexit.register(cleanup)

        try:
            # Try to use PTY for interactive sessions with logging
            if sys.stdin.isatty() and sys.stdout.isatty():
                exit_code = self.run_with_pty(args, log_file)
                if exit_code != 0:
                    status = 'error'
            else:
                # Non-interactive mode - capture output
                with open(log_file, 'w', encoding='utf-8') as f:
                    process = subprocess.Popen(
                        args,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1
                    )

                    # Stream output
                    for line in process.stdout:
                        print(line, end='')
                        f.write(line)
                        f.flush()

                    exit_code = process.wait()

                    if exit_code != 0:
                        status = 'error'

        except Exception as e:
            status = 'error'
            exit_code = 1
            print(f"❌ Error: {e}")

        finally:
            cleanup()

        return exit_code

    def run_with_pty(self, args, log_file):
        """Run command with script to capture all input/output (no fork warnings)"""
        import platform

        system = platform.system()

        # Write header to log file
        with open(log_file, 'w', encoding='utf-8') as f:
            f.write(f"[Session started at {datetime.now().isoformat()}]\\n")
            f.write(f"Command: {' '.join(args)}\\n")
            f.write(f"Working dir: {os.getcwd()}\\n")
            f.write("=" * 50 + "\\n\\n")

        exit_code = 0
        cmd_str = ' '.join(f'"{a}"' if ' ' in a else a for a in args)

        try:
            if system == 'Darwin':
                # macOS: script -q -a logfile command
                exit_code = subprocess.call([
                    'script', '-q', '-a', str(log_file),
                    '/bin/sh', '-c', cmd_str
                ])
            elif system == 'Linux':
                # Linux: script -q -a logfile -c command
                exit_code = subprocess.call([
                    'script', '-q', '-a', str(log_file), '-c', cmd_str
                ])
            else:
                # Windows or other - run directly
                exit_code = subprocess.call(args)

        except FileNotFoundError:
            # script not found, run directly
            exit_code = subprocess.call(args)
        except Exception as e:
            print(f"⚠️  Error: {e}")
            exit_code = subprocess.call(args)

        # Write footer to log file
        try:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write("\\n\\n" + "=" * 50 + "\\n")
                f.write(f"[Session ended at {datetime.now().isoformat()}]\\n")
                f.write(f"Exit code: {exit_code}\\n")
        except:
            pass

        return exit_code

def main():
    reporter = ClaudeReporter()
    
    # Handle special commands
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        
        if cmd == '--config':
            print(f"\\n📝 Config: {reporter.config_path}\\n")
            print(json.dumps(reporter.config, indent=2))
            return 0
        
        elif cmd == '--view':
            conn = sqlite3.connect(str(reporter.db_path))
            rows = conn.execute('''
                SELECT session_id, started_at, ended_at, status, working_dir, exit_code
                FROM sessions 
                ORDER BY started_at DESC 
                LIMIT 20
            ''').fetchall()
            conn.close()
            
            print("\\n📊 Recent Sessions:\\n")
            for row in rows:
                emoji = {'completed': '✅', 'interrupted': '⚠️', 'error': '❌'}.get(row[3], '❓')
                print(f"{emoji} {row[0][:8]}... | {row[3].upper()}")
                print(f"   Started: {row[1][:19]}")
                print(f"   Ended:   {row[2][:19] if row[2] else 'N/A'}")
                print(f"   Dir:     {row[4]}")
                print(f"   Exit:    {row[5] if row[5] is not None else 'N/A'}")
                print()
            return 0
        
        elif cmd == '--stats':
            conn = sqlite3.connect(str(reporter.db_path))
            stats = conn.execute('''
                SELECT
                    status,
                    COUNT(*) as count
                FROM sessions
                GROUP BY status
            ''').fetchall()
            conn.close()

            print("\\n📈 Statistics:\\n")
            for status, count in stats:
                print(f"  {status}: {count}")
            return 0

        elif cmd == '--serve':
            port = 8765
            if len(sys.argv) > 2:
                try:
                    port = int(sys.argv[2])
                except:
                    pass
            reporter.start_server(port)
            return 0

    # Find real Claude CLI
    claude_path = None
    for path_dir in os.environ.get('PATH', '').split(':'):
        potential = os.path.join(path_dir, 'claude')
        if os.path.exists(potential):
            # Make sure it's not this script
            if os.path.realpath(potential) != os.path.realpath(__file__):
                claude_path = potential
                break
    
    if not claude_path:
        print("❌ Claude CLI not found!")
        print("\\nInstall it from: https://docs.anthropic.com/claude-code")
        return 1
    
    # Run with wrapper
    args = [claude_path] + sys.argv[1:]
    return reporter.run_wrapper(args)

if __name__ == '__main__':
    sys.exit(main())
`;

  const scriptPath = path.join(INSTALL_DIR, 'claude-reporter.py');
  fs.writeFileSync(scriptPath, reporterScript, { mode: 0o755 });
  
  spinner.succeed('Reporter script created');
}

async function configureWebhook() {
  console.log(chalk.yellow('\n⚙️  Storage Configuration\n'));
  
  const storageChoice = await inquirer.prompt([
    {
      type: 'list',
      name: 'storageType',
      message: 'Where do you want to store Claude Code session logs?',
      choices: [
        {
          name: '📁 Google Drive - Store logs in your Google Drive folder',
          value: 'gdrive'
        },
        {
          name: '🌐 Webhook/HTTP - Send to custom webhook endpoint',
          value: 'webhook'
        },
        {
          name: '💾 Local Only - Save logs locally on this machine',
          value: 'local'
        },
        {
          name: '🏢 Enterprise Solution - Contact sales for custom integration',
          value: 'enterprise'
        }
      ]
    }
  ]);
  
  let config = {
    storage_type: storageChoice.storageType,
    report_endpoint: '',
    discord_webhook: '',
    gdrive_folder_id: '',
    auto_report: true,
    save_local: true,
    log_commands: true
  };
  
  // Handle each storage type
  if (storageChoice.storageType === 'gdrive') {
    console.log(chalk.cyan('\n📁 Google Drive Setup\n'));
    console.log('To get your Google Drive folder ID:');
    console.log('1. Open Google Drive in browser');
    console.log('2. Create a new folder (or use existing)');
    console.log('3. Open the folder');
    console.log('4. Copy the ID from URL: drive.google.com/drive/folders/{FOLDER_ID}');
    console.log('');
    
    const gdriveAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'folderId',
        message: 'Enter Google Drive Folder ID:',
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return 'Folder ID is required';
          }
          if (input.length < 20) {
            return 'Invalid folder ID (too short)';
          }
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'enableDiscord',
        message: 'Also send notifications to Discord?',
        default: false
      },
      {
        type: 'input',
        name: 'discordWebhook',
        message: 'Discord webhook URL:',
        when: (answers) => answers.enableDiscord,
        default: ''
      }
    ]);
    
    config.gdrive_folder_id = gdriveAnswers.folderId;
    config.discord_webhook = gdriveAnswers.discordWebhook || '';
    
    console.log(chalk.green('\n✅ Google Drive configured!'));
    console.log(chalk.yellow('⚠️  Note: You\'ll need to authenticate with Google on first run'));
    
  } else if (storageChoice.storageType === 'webhook') {
    console.log(chalk.cyan('\n🌐 Webhook/HTTP Setup\n'));
    
    const webhookAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'webhookUrl',
        message: 'Enter webhook URL:',
        default: '',
        validate: (input) => {
          if (!input) return 'Webhook URL is required';
          if (!input.startsWith('http://') && !input.startsWith('https://')) {
            return 'URL must start with http:// or https://';
          }
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'enableDiscord',
        message: 'Also send notifications to Discord?',
        default: false
      },
      {
        type: 'input',
        name: 'discordWebhook',
        message: 'Discord webhook URL:',
        when: (answers) => answers.enableDiscord,
        default: ''
      }
    ]);
    
    config.report_endpoint = webhookAnswers.webhookUrl;
    config.discord_webhook = webhookAnswers.discordWebhook || '';
    
    console.log(chalk.green('\n✅ Webhook configured!'));
    console.log(chalk.yellow('💡 Tip: Visit https://webhook.site for free testing webhook'));
    
  } else if (storageChoice.storageType === 'local') {
    console.log(chalk.cyan('\n💾 Local Storage Setup\n'));
    
    const localAnswers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableDiscord',
        message: 'Send notifications to Discord?',
        default: false
      },
      {
        type: 'input',
        name: 'discordWebhook',
        message: 'Discord webhook URL:',
        when: (answers) => answers.enableDiscord,
        default: ''
      }
    ]);
    
    config.discord_webhook = localAnswers.discordWebhook || '';
    
    console.log(chalk.green('\n✅ Local storage configured!'));
    console.log(chalk.cyan(`📁 Logs will be saved to: ${INSTALL_DIR}/reports/`));
    
  } else if (storageChoice.storageType === 'enterprise') {
    console.log(chalk.cyan('\n🏢 Enterprise Solution\n'));
    console.log(chalk.bold('Contact our sales team for:'));
    console.log('  • Custom integrations (Slack, Teams, Jira, etc.)');
    console.log('  • Team dashboards and analytics');
    console.log('  • SSO and advanced security');
    console.log('  • Dedicated support');
    console.log('  • SLA guarantees');
    console.log('');
    console.log(chalk.yellow('📧 Email: enterprise@claude-reporter.com'));
    console.log(chalk.yellow('🌐 Web: https://claude-reporter.com/enterprise'));
    console.log(chalk.yellow('📞 Phone: +1 (555) 123-4567'));
    console.log('');
    
    const enterpriseAnswers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceedWithLocal',
        message: 'Continue with local storage for now?',
        default: true
      }
    ]);
    
    if (!enterpriseAnswers.proceedWithLocal) {
      console.log(chalk.yellow('\nSetup cancelled. Please contact sales before continuing.'));
      process.exit(0);
    }
    
    config.storage_type = 'local';
    console.log(chalk.green('\n✅ Using local storage temporarily'));
  }
  
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  
  console.log(chalk.green('\n✅ Configuration saved'));
  
  return config;
}

async function setupShellAlias() {
  const spinner = ora('Setting up shell alias...').start();
  
  const shell = process.env.SHELL || '';
  let rcFile = '';
  
  if (shell.includes('zsh')) {
    rcFile = path.join(HOME, '.zshrc');
  } else if (shell.includes('bash')) {
    rcFile = path.join(HOME, '.bashrc');
  } else {
    rcFile = path.join(HOME, '.profile');
  }
  
  // Quote the path to handle spaces in directory names (e.g., "C:\Users\Nguyen Nhan")
  const aliasLine = `\n# Claude Code Auto Reporter\nalias claude='python3 "${INSTALL_DIR}/claude-reporter.py"'\n`;
  
  // Check if alias already exists
  if (fs.existsSync(rcFile)) {
    const content = fs.readFileSync(rcFile, 'utf-8');
    if (!content.includes('claude-reporter')) {
      fs.appendFileSync(rcFile, aliasLine);
      spinner.succeed(`Alias configured in ${path.basename(rcFile)}`);
    } else {
      spinner.info('Alias already exists');
    }
  } else {
    fs.writeFileSync(rcFile, aliasLine);
    spinner.succeed('Shell configuration created');
  }
}

function createHelperScripts() {
  const spinner = ora('Creating helper scripts...').start();

  // View reports script (use $HOME for paths with spaces)
  const viewScript = `#!/bin/bash
cd "$HOME/.claude-reporter/reports"
ls -lt | head -20
`;

  fs.writeFileSync(
    path.join(INSTALL_DIR, 'view-reports.sh'),
    viewScript,
    { mode: 0o755 }
  );

  // Update webhook script
  const updateWebhook = `#!/bin/bash
echo "🔗 Update Webhook URL"
echo ""
read -p "Enter new webhook URL: " URL
python3 << EOF
import json
with open('${CONFIG_FILE}', 'r') as f:
    config = json.load(f)
config['report_endpoint'] = '$URL'
with open('${CONFIG_FILE}', 'w') as f:
    json.dump(config, f, indent=2)
print("✅ Updated!")
EOF
`;

  fs.writeFileSync(
    path.join(INSTALL_DIR, 'update-webhook.sh'),
    updateWebhook,
    { mode: 0o755 }
  );

  // Switch storage script
  const switchStorage = `#!/bin/bash
CONFIG_FILE="$HOME/.claude-reporter/config.json"

echo ""
echo "🔄 Switch Storage Backend"
echo ""
echo "Current config:"
cat "$CONFIG_FILE" | python3 -m json.tool 2>/dev/null || cat "$CONFIG_FILE"
echo ""
echo "Choose storage type:"
echo "  1) 📁 Google Drive"
echo "  2) 🌐 Webhook/HTTP"
echo "  3) 💾 Local Only"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
  1)
    read -p "Enter Google Drive Folder ID: " FOLDER_ID
    python3 << EOF
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
config['storage_type'] = 'gdrive'
config['gdrive_folder_id'] = '$FOLDER_ID'
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
print("✅ Switched to Google Drive!")
print("   Folder ID:", '$FOLDER_ID'[:20] + "...")
EOF
    ;;
  2)
    read -p "Enter Webhook URL: " WEBHOOK_URL
    python3 << EOF
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
config['storage_type'] = 'webhook'
config['report_endpoint'] = '$WEBHOOK_URL'
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
print("✅ Switched to Webhook!")
print("   URL:", '$WEBHOOK_URL')
EOF
    ;;
  3)
    python3 << EOF
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
config['storage_type'] = 'local'
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
print("✅ Switched to Local storage!")
print("   Reports saved to: ~/.claude-reporter/reports/")
EOF
    ;;
  *)
    echo "❌ Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "📄 New config:"
cat "$CONFIG_FILE" | python3 -m json.tool 2>/dev/null || cat "$CONFIG_FILE"
`;

  fs.writeFileSync(
    path.join(INSTALL_DIR, 'switch-storage.sh'),
    switchStorage,
    { mode: 0o755 }
  );

  // Uninstall script (use $HOME for paths with spaces)
  const uninstallScript = `#!/bin/bash
echo ""
echo "🗑️  Uninstall Claude Reporter"
echo ""
read -p "Are you sure you want to uninstall? [y/N]: " confirm

if [[ "$confirm" =~ ^[Yy]$ ]]; then
  echo ""
  echo "Removing $HOME/.claude-reporter..."
  rm -rf "$HOME/.claude-reporter"

  echo "Removing shell alias..."
  # Remove from .zshrc
  if [ -f "$HOME/.zshrc" ]; then
    sed -i.bak '/claude-reporter/d' "$HOME/.zshrc" 2>/dev/null || sed -i '' '/claude-reporter/d' "$HOME/.zshrc"
    rm -f "$HOME/.zshrc.bak"
  fi
  # Remove from .bashrc
  if [ -f "$HOME/.bashrc" ]; then
    sed -i.bak '/claude-reporter/d' "$HOME/.bashrc" 2>/dev/null || sed -i '' '/claude-reporter/d' "$HOME/.bashrc"
    rm -f "$HOME/.bashrc.bak"
  fi

  echo ""
  echo "✅ Uninstalled successfully!"
  echo "   Please restart your terminal or run: source ~/.zshrc"
else
  echo "Cancelled."
fi
`;

  fs.writeFileSync(
    path.join(INSTALL_DIR, 'uninstall.sh'),
    uninstallScript,
    { mode: 0o755 }
  );

  spinner.succeed('Helper scripts created');
}

async function testInstallation() {
  const spinner = ora('Testing installation...').start();

  try {
    // Quote the path to handle spaces in directory names (e.g., "Nguyen Nhan")
    const scriptPath = path.join(INSTALL_DIR, 'claude-reporter.py');
    const testCmd = `python3 "${scriptPath}" --config`;
    execSync(testCmd, { stdio: 'pipe' });
    spinner.succeed('Installation test passed');
  } catch (error) {
    spinner.fail('Installation test failed');

    // Show detailed error for debugging
    if (error.stderr) {
      console.log(chalk.red('\nError details:'));
      console.log(chalk.gray(error.stderr.toString()));
    }
    if (error.stdout) {
      console.log(chalk.gray(error.stdout.toString()));
    }

    // Common fixes
    console.log(chalk.yellow('\n💡 Common fixes:'));
    console.log(chalk.gray('   1. Make sure Python 3 is installed: python3 --version'));
    console.log(chalk.gray('   2. Install missing dependencies: pip3 install requests psutil'));
    console.log(chalk.gray('   3. Check the script manually: python3 ~/.claude-reporter/claude-reporter.py --config'));

    throw new Error('Installation test failed. See error details above.');
  }
}

function showSuccessMessage(config) {
  console.log(chalk.green.bold('\n✅ Installation Complete!\n'));
  
  console.log(chalk.cyan.bold('🎉 You\'re all set!\n'));
  
  // Check which shell
  const shell = process.env.SHELL || '';
  let rcFile = '';
  if (shell.includes('zsh')) {
    rcFile = '~/.zshrc';
  } else if (shell.includes('bash')) {
    rcFile = '~/.bashrc';
  } else {
    rcFile = '~/.profile';
  }
  
  console.log(chalk.yellow.bold('⚠️  IMPORTANT: Open a NEW terminal window/tab\n'));
  
  console.log('Then use Claude as normal:\n');
  console.log(chalk.cyan('   claude chat'));
  console.log(chalk.cyan('   claude code fix-bug.py'));
  console.log(chalk.cyan('   claude ask "help me with..."'));
  
  console.log(chalk.gray('\n💡 Alternative: Reload current terminal:\n'));
  console.log(chalk.gray('   source ' + rcFile));
  
  console.log(chalk.gray('\n📊 Sessions are automatically tracked!\n'));
  
  // Show storage location based on type
  const storageType = config.storage_type || 'local';
  if (storageType === 'gdrive') {
    console.log(chalk.cyan('📁 Reports → Google Drive (folder: ' + config.gdrive_folder_id.substring(0, 8) + '...)'));
  } else if (storageType === 'webhook') {
    console.log(chalk.cyan('🌐 Reports → ' + config.report_endpoint));
  } else {
    console.log(chalk.cyan('💾 Reports → ~/.claude-reporter/reports/'));
  }
  
  console.log(chalk.gray('\n📋 Useful commands:\n'));
  console.log(chalk.gray('   View history:    ') + chalk.cyan('claude --view'));
  console.log(chalk.gray('   View stats:      ') + chalk.cyan('claude --stats'));
  console.log(chalk.gray('   View config:     ') + chalk.cyan('claude --config'));
  console.log(chalk.gray('   Web dashboard:   ') + chalk.cyan('claude --serve'));
  console.log(chalk.gray('   Switch storage:  ') + chalk.cyan('~/.claude-reporter/switch-storage.sh'));
  console.log(chalk.gray('   Uninstall:       ') + chalk.cyan('~/.claude-reporter/uninstall.sh'));

  console.log(chalk.green('\n🚀 Happy coding!\n'));
}

main();
