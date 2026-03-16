import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  const serverUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://vibe-reporter.onebot-training.meobeo.ai";

  const script = `# Claude Reporter - Windows PowerShell Installer
# Run in PowerShell (Admin not required):
#   iex (irm '${serverUrl}/api/install/windows')

$ErrorActionPreference = "Stop"
$SERVER_URL  = "${serverUrl}"
$HOOKS_DIR   = "$HOME\\.claude\\hooks"
$SETTINGS    = "$HOME\\.claude\\settings.json"
$HOOK_SCRIPT = "$HOOKS_DIR\\claude-reporter.ps1"
$UUID_FILE   = "$HOME\\.claude-reporter-uuid"

Write-Host "==> Installing Claude Reporter hook..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $HOOKS_DIR -Force | Out-Null

# Download hook script
(New-Object System.Net.WebClient).DownloadString("$SERVER_URL/hooks/reporter.ps1") | Out-File $HOOK_SCRIPT -Encoding UTF8
Write-Host "OK  Hook script -> $HOOK_SCRIPT" -ForegroundColor Green

# Unblock the script file (Windows security policy)
Unblock-File -Path $HOOK_SCRIPT -ErrorAction SilentlyContinue

# Check UUID
if (Test-Path $UUID_FILE) {
  $uuid = (Get-Content $UUID_FILE -Raw).Trim()
  Write-Host "OK  UUID found  -> $uuid" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "!!  No UUID file found at $UUID_FILE" -ForegroundColor Yellow
  Write-Host "    -> Register at $SERVER_URL/login to get your UUID"
  Write-Host "    -> Then run:  echo 'YOUR_UUID' | Out-File $UUID_FILE -Encoding UTF8 -NoNewline"
  Write-Host ""
}

# Build hook command
$hookCmd = "powershell -ExecutionPolicy Bypass -NonInteractive -File \`"$HOOK_SCRIPT\`""

# Build settings JSON
$hookEntry   = @{ type = "command"; command = $hookCmd }
$hookWrapper = @{ hooks = @($hookEntry) }
$hooksBlock  = @{
  PreToolUse      = @($hookWrapper)
  PostToolUse     = @($hookWrapper)
  UserPromptSubmit = @($hookWrapper)
  Stop            = @($hookWrapper)
  Notification    = @($hookWrapper)
}

if (Test-Path $SETTINGS) {
  $existing = Get-Content $SETTINGS -Raw
  if ($existing -match "claude-reporter") {
    Write-Host "OK  Hook already in $SETTINGS" -ForegroundColor Green
  } else {
    Write-Host ""
    Write-Host "!!  $SETTINGS exists but doesn't have the hook." -ForegroundColor Yellow
    Write-Host "    Add this to each hook event in your settings.json:"
    Write-Host "    {\`"type\`": \`"command\`", \`"command\`": \`"$hookCmd\`"}"
    Write-Host ""
  }
} else {
  $settingsObj = @{ hooks = $hooksBlock }
  $settingsJson = $settingsObj | ConvertTo-Json -Depth 10
  New-Item -ItemType Directory -Path (Split-Path $SETTINGS) -Force | Out-Null
  $settingsJson | Out-File $SETTINGS -Encoding UTF8
  Write-Host "OK  Created $SETTINGS" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! Restart Claude Code to start capturing sessions." -ForegroundColor Green
`;

  return new NextResponse(script, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
