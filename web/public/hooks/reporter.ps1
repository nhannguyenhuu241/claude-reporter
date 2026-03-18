# Claude Reporter hook — Windows PowerShell version
# Captures Claude Code events and forwards to the reporter server.
# Never exits non-zero — must not block Claude Code.
#
# Installation: save to %USERPROFILE%\.claude\hooks\claude-reporter.ps1
# In settings.json hook command use:
#   powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\.claude\hooks\claude-reporter.ps1"

$ErrorActionPreference = "SilentlyContinue"

$SERVER_URL    = if ($env:CLAUDE_REPORTER_URL) { $env:CLAUDE_REPORTER_URL } else { "https://vibe-reporter.onebot-training.meobeo.ai" }

# ── Self-update ────────────────────────────────────────────────────────────────
if ($args -contains "--update") {
    $ScriptPath = $MyInvocation.MyCommand.Path
    Write-Host "Updating Claude Reporter hook from $SERVER_URL ..."
    try {
        $tmpPath = "$ScriptPath.tmp"
        Invoke-WebRequest -Uri "$SERVER_URL/hooks/reporter.ps1" -OutFile $tmpPath -UseBasicParsing -ErrorAction Stop
        Move-Item -Path $tmpPath -Destination $ScriptPath -Force
        Write-Host "Updated successfully: $ScriptPath"
    } catch {
        if (Test-Path "$ScriptPath.tmp") { Remove-Item "$ScriptPath.tmp" -Force -ErrorAction SilentlyContinue }
        Write-Host "Update failed: $_"
        exit 1
    }
    exit 0
}
$UUID_FILE     = "$HOME\.claude-reporter-uuid"
$QUEUE_FILE    = "$HOME\.claude-reporter-queue.jsonl"
$FLUSH_TS_FILE = "$HOME\.claude-reporter-lastflush"
$BACKOFF_FILE  = "$HOME\.claude-reporter-lastflush.backoff"
$STATE_DIR     = "$HOME\.claude-reporter-state"
$FLUSH_INTERVAL = 90
$QUEUE_MAX_LINES = 5000  # hard cap to prevent unbounded growth
$BATCH_SIZE     = 100
$MAX_BACKOFF    = 300    # max retry backoff in seconds (5 min)

# ── Read payload from stdin ───────────────────────────────────────────────────
$PAYLOAD = $input | Out-String -NoNewline

if ([string]::IsNullOrWhiteSpace($PAYLOAD)) { exit 0 }

# ── Get user UUID ─────────────────────────────────────────────────────────────
$USER_UUID = ""
if (Test-Path $UUID_FILE) { $USER_UUID = (Get-Content $UUID_FILE -Raw -ErrorAction SilentlyContinue).Trim() }

# ── Create state dir ──────────────────────────────────────────────────────────
if (-not (Test-Path $STATE_DIR)) { New-Item -ItemType Directory -Path $STATE_DIR -Force | Out-Null }

# ── Enrich payload and extract transcript messages ────────────────────────────
$allEvents = New-Object System.Collections.Generic.List[string]

try {
    $data = $PAYLOAD | ConvertFrom-Json -ErrorAction Stop

    # Inject user_uuid
    if ($USER_UUID -and -not $data.user_uuid) {
        $data | Add-Member -NotePropertyName "user_uuid" -NotePropertyValue $USER_UUID -Force
    }

    # Inject entry_uuid (random GUID — dedup key)
    if (-not $data.entry_uuid) {
        $seed = "$($data.session_id)$($data.hook_event_name)$($data.tool_name)"
        # Use deterministic hash within same minute for idempotency
        $minuteStr = [DateTime]::UtcNow.ToString("yyyyMMddTHHmm")
        $seedFull = $seed + $minuteStr
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($seedFull)
        $hash = [System.Security.Cryptography.SHA1]::Create().ComputeHash($bytes)
        # Format as UUID v5-ish
        $hex = [System.BitConverter]::ToString($hash).Replace("-","").ToLower()
        $guid = "$($hex.Substring(0,8))-$($hex.Substring(8,4))-5$($hex.Substring(13,3))-$($hex.Substring(16,4))-$($hex.Substring(20,12))"
        $data | Add-Member -NotePropertyName "entry_uuid" -NotePropertyValue $guid -Force
    }

    # Inject event_timestamp
    if (-not $data.event_timestamp) {
        $data | Add-Member -NotePropertyName "event_timestamp" -NotePropertyValue ([DateTime]::UtcNow.ToString("o") + "Z") -Force
    }

    # On Stop: read transcript and emit new assistant + user messages
    if ($data.hook_event_name -eq "Stop" -and -not $data.stop_hook_active) {
        $transcriptPath = $data.transcript_path
        $sessionId      = $data.session_id
        $cwd            = $data.cwd

        if ($transcriptPath -and (Test-Path $transcriptPath) -and $sessionId) {
            $stateFile = Join-Path $STATE_DIR "$sessionId.last_uuid"
            $lastUuid  = ""
            if (Test-Path $stateFile) { $lastUuid = (Get-Content $stateFile -Raw -ErrorAction SilentlyContinue).Trim() }

            $newMessages  = New-Object System.Collections.Generic.List[object]
            $foundLast    = ($lastUuid -eq "")
            $latestUuid   = $lastUuid
            $seenUuids    = New-Object System.Collections.Generic.HashSet[string]

            try {
                foreach ($line in [System.IO.File]::ReadLines($transcriptPath)) {
                    $line = $line.Trim()
                    if ([string]::IsNullOrEmpty($line)) { continue }
                    try {
                        $entry      = $line | ConvertFrom-Json -ErrorAction Stop
                        $entryUuid  = if ($entry.uuid) { $entry.uuid } else { "" }
                        if ($entryUuid) { [void]$seenUuids.Add($entryUuid) }

                        if (-not $foundLast) {
                            if ($entryUuid -eq $lastUuid) { $foundLast = $true }
                            continue
                        }

                        # Assistant messages
                        if ($entry.type -eq "assistant") {
                            $msg       = $entry.message
                            $usage     = $msg.usage
                            $textParts = New-Object System.Collections.Generic.List[string]
                            foreach ($block in $msg.content) {
                                if ($block.type -eq "text" -and -not [string]::IsNullOrWhiteSpace($block.text)) {
                                    $textParts.Add($block.text.Trim())
                                }
                            }
                            $fullText = $textParts -join "`n"
                            if ($fullText) {
                                $ts = if ($entry.timestamp) { $entry.timestamp } else { [DateTime]::UtcNow.ToString("o") + "Z" }
                                $ev = [PSCustomObject]@{
                                    hook_event_name = "Stop"
                                    session_id      = $sessionId
                                    cwd             = $cwd
                                    user_uuid       = $USER_UUID
                                    message         = if ($fullText.Length -gt 8000) { $fullText.Substring(0, 8000) } else { $fullText }
                                    entry_uuid      = $entryUuid
                                    event_timestamp = $ts
                                }
                                if ($usage) {
                                    $ev | Add-Member -NotePropertyName "usage" -NotePropertyValue @{
                                        input_tokens                = [int](if ($null -ne $usage.input_tokens) { $usage.input_tokens } else { 0 })
                                        output_tokens               = [int](if ($null -ne $usage.output_tokens) { $usage.output_tokens } else { 0 })
                                        cache_creation_input_tokens = [int](if ($null -ne $usage.cache_creation_input_tokens) { $usage.cache_creation_input_tokens } else { 0 })
                                        cache_read_input_tokens     = [int](if ($null -ne $usage.cache_read_input_tokens) { $usage.cache_read_input_tokens } else { 0 })
                                    } -Force
                                }
                                $newMessages.Add($ev)
                                if ($entryUuid) { $latestUuid = $entryUuid }
                            }
                        }
                        # User prompts
                        elseif ($entry.type -eq "human") {
                            $msg = $entry.message
                            foreach ($block in $msg.content) {
                                if ($block.type -eq "text" -and -not [string]::IsNullOrWhiteSpace($block.text) -and $entryUuid) {
                                    $ts = if ($entry.timestamp) { $entry.timestamp } else { [DateTime]::UtcNow.ToString("o") + "Z" }
                                    $newMessages.Add([PSCustomObject]@{
                                        hook_event_name = "UserPromptSubmit"
                                        session_id      = $sessionId
                                        cwd             = $cwd
                                        user_uuid       = $USER_UUID
                                        prompt          = if ($block.text.Length -gt 10000) { $block.text.Substring(0, 10000) } else { $block.text }
                                        entry_uuid      = $entryUuid
                                        event_timestamp = $ts
                                    })
                                    break
                                }
                            }
                        }
                    } catch {}
                }
            } catch {}

            # If last_uuid not found, re-process from start
            if ($lastUuid -and -not $foundLast -and $seenUuids.Count -gt 0) {
                $newMessages.Clear()
                $latestUuid = ""
                try {
                    foreach ($line in [System.IO.File]::ReadLines($transcriptPath)) {
                        $line = $line.Trim()
                        if ([string]::IsNullOrEmpty($line)) { continue }
                        try {
                            $entry     = $line | ConvertFrom-Json -ErrorAction Stop
                            $entryUuid = if ($entry.uuid) { $entry.uuid } else { "" }
                            if ($entry.type -eq "assistant") {
                                $msg       = $entry.message
                                $usage     = $msg.usage
                                $textParts = New-Object System.Collections.Generic.List[string]
                                foreach ($block in $msg.content) {
                                    if ($block.type -eq "text" -and -not [string]::IsNullOrWhiteSpace($block.text)) {
                                        $textParts.Add($block.text.Trim())
                                    }
                                }
                                $fullText = $textParts -join "`n"
                                if ($fullText) {
                                    $ts = if ($entry.timestamp) { $entry.timestamp } else { [DateTime]::UtcNow.ToString("o") + "Z" }
                                    $ev = [PSCustomObject]@{
                                        hook_event_name = "Stop"
                                        session_id      = $sessionId
                                        cwd             = $cwd
                                        user_uuid       = $USER_UUID
                                        message         = if ($fullText.Length -gt 8000) { $fullText.Substring(0, 8000) } else { $fullText }
                                        entry_uuid      = $entryUuid
                                        event_timestamp = $ts
                                    }
                                    if ($usage) {
                                        $ev | Add-Member -NotePropertyName "usage" -NotePropertyValue @{
                                            input_tokens                = [int](if ($null -ne $usage.input_tokens) { $usage.input_tokens } else { 0 })
                                            output_tokens               = [int](if ($null -ne $usage.output_tokens) { $usage.output_tokens } else { 0 })
                                            cache_creation_input_tokens = [int](if ($null -ne $usage.cache_creation_input_tokens) { $usage.cache_creation_input_tokens } else { 0 })
                                            cache_read_input_tokens     = [int](if ($null -ne $usage.cache_read_input_tokens) { $usage.cache_read_input_tokens } else { 0 })
                                        } -Force
                                    }
                                    $newMessages.Add($ev)
                                    if ($entryUuid) { $latestUuid = $entryUuid }
                                }
                            }
                        } catch {}
                    }
                } catch {}
            }

            # Save state
            try {
                if ($latestUuid -and $latestUuid -ne $lastUuid) {
                    $latestUuid | Out-File $stateFile -Encoding UTF8 -NoNewline
                }
            } catch {}

            # Remove message from original data (already split into newMessages)
            $data.PSObject.Properties.Remove("message")

            # Queue: original event + extracted messages
            $allEvents.Add(($data | ConvertTo-Json -Compress -Depth 10))
            foreach ($ev in $newMessages) {
                $allEvents.Add(($ev | ConvertTo-Json -Compress -Depth 10))
            }
        } else {
            $allEvents.Add(($data | ConvertTo-Json -Compress -Depth 10))
        }
    } else {
        $allEvents.Add(($data | ConvertTo-Json -Compress -Depth 10))
    }
} catch {
    $allEvents.Add($PAYLOAD)
}

# ── Append to local queue ─────────────────────────────────────────────────────
$queueDir = Split-Path $QUEUE_FILE
if (-not (Test-Path $queueDir)) { New-Item -ItemType Directory -Path $queueDir -Force | Out-Null }
$allEvents | Out-File -FilePath $QUEUE_FILE -Append -Encoding UTF8

# ── Trim queue if it exceeds QUEUE_MAX_LINES (keep newest events) ─────────────
try {
    if (Test-Path $QUEUE_FILE) {
        $lines = [System.IO.File]::ReadAllLines($QUEUE_FILE)
        if ($lines.Count -gt $QUEUE_MAX_LINES) {
            $trimmed = $lines[($lines.Count - $QUEUE_MAX_LINES)..($lines.Count - 1)]
            [System.IO.File]::WriteAllLines($QUEUE_FILE, $trimmed, [System.Text.UTF8Encoding]::new($false))
        }
    }
} catch {}

# ── Check flush interval (with exponential backoff support) ───────────────────
$NOW = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$LAST_FLUSH = 0
if (Test-Path $FLUSH_TS_FILE) {
    try { $LAST_FLUSH = [long](Get-Content $FLUSH_TS_FILE -Raw).Trim() } catch {}
}

# Use backoff interval if set, otherwise use default FLUSH_INTERVAL
$CURRENT_INTERVAL = $FLUSH_INTERVAL
if (Test-Path $BACKOFF_FILE) {
    try {
        $storedBackoff = [long](Get-Content $BACKOFF_FILE -Raw).Trim()
        if ($storedBackoff -gt $FLUSH_INTERVAL) { $CURRENT_INTERVAL = $storedBackoff }
    } catch {}
}

$ELAPSED = $NOW - $LAST_FLUSH
if ($ELAPSED -lt $CURRENT_INTERVAL) { exit 0 }

# ── Flush: move queue, dedup, batch POST ──────────────────────────────────────
$TEMP_QUEUE = "$QUEUE_FILE.sending"
if (-not (Test-Path $QUEUE_FILE)) { exit 0 }

try { Move-Item $QUEUE_FILE $TEMP_QUEUE -Force } catch { exit 0 }
$NOW | Out-File $FLUSH_TS_FILE -Encoding UTF8 -NoNewline

# Read and dedup
$eventsList = New-Object System.Collections.Generic.List[object]
$seenKeys   = New-Object System.Collections.Generic.HashSet[string]
try {
    foreach ($line in [System.IO.File]::ReadLines($TEMP_QUEUE)) {
        $line = $line.Trim()
        if ([string]::IsNullOrEmpty($line)) { continue }
        try {
            $ev  = $line | ConvertFrom-Json -ErrorAction Stop
            $key = "$($ev.session_id)|$($ev.entry_uuid)"
            if ($ev.entry_uuid -and -not $seenKeys.Add($key)) { continue }
            $eventsList.Add($ev)
        } catch {}
    }
} catch {}

# Send in batches
$batchFailed = $false
for ($i = 0; $i -lt $eventsList.Count; $i += $BATCH_SIZE) {
    $end   = [Math]::Min($i + $BATCH_SIZE, $eventsList.Count) - 1
    $chunk = $eventsList[$i..$end]
    $body  = @{ events = $chunk } | ConvertTo-Json -Compress -Depth 10
    try {
        $resp = Invoke-WebRequest -Uri "$SERVER_URL/api/events/batch" `
            -Method POST -Body $body -ContentType "application/json" `
            -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -lt 200 -or $resp.StatusCode -ge 300) {
            $batchFailed = $true; break
        }
    } catch { $batchFailed = $true; break }
}

if ($batchFailed) {
    # Restore unsent events: temp_queue at front, any new events at end
    try {
        if (Test-Path $QUEUE_FILE) {
            $existingQueue = Get-Content $QUEUE_FILE -Raw -ErrorAction SilentlyContinue
            ((Get-Content $TEMP_QUEUE -Raw) + "`n" + $existingQueue).Trim() |
                Out-File $QUEUE_FILE -Encoding UTF8
        } else {
            Move-Item $TEMP_QUEUE $QUEUE_FILE -Force -ErrorAction SilentlyContinue
        }
    } catch {}

    # Exponential backoff: double on each failure, cap at MAX_BACKOFF
    $prevBackoff = $FLUSH_INTERVAL
    if (Test-Path $BACKOFF_FILE) {
        try { $prevBackoff = [long](Get-Content $BACKOFF_FILE -Raw).Trim() } catch {}
    }
    $nextBackoff = [Math]::Min($prevBackoff * 2, $MAX_BACKOFF)
    $nextBackoff | Out-File $BACKOFF_FILE -Encoding UTF8 -NoNewline

    # Schedule next retry at now + nextBackoff (by backdating last flush timestamp)
    ($NOW - $FLUSH_INTERVAL + $nextBackoff) | Out-File $FLUSH_TS_FILE -Encoding UTF8 -NoNewline
} else {
    # All chunks sent (or nothing to send) — reset backoff
    if (Test-Path $BACKOFF_FILE) { Remove-Item $BACKOFF_FILE -Force -ErrorAction SilentlyContinue }
}

if (Test-Path $TEMP_QUEUE) { Remove-Item $TEMP_QUEUE -Force -ErrorAction SilentlyContinue }

exit 0
