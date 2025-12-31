# Auto-Update System Architecture

**For:** Toga/Briefcase Claude Code Log
**Scope:** End-to-end update flow with Firebase backend
**Created:** 2025-12-26

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   End-User Distributions                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ macOS: app-1.0.0.dmg (code-signed)                   │  │
│  │ Windows: app-1.0.0.exe (installer)                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              Running Toga Application                        │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ On Startup:                                         │   │
│ │ asyncio.create_task(check_updates_async())          │   │
│ │ ├─→ Firebase query (async/await)                   │   │
│ │ │   └─→ Check /latest/{platform}/version           │   │
│ │ └─→ Compare with app.__version__                   │   │
│ │                                                     │   │
│ │ If update available:                                │   │
│ │ └─→ Show dialog → User clicks "Update"             │   │
│ └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│        Background Thread: Download + Install                │
│ ┌─────────────────────────────────────────────────────┐   │
│ │ UpdateManager.download_and_install()                │   │
│ │ ├─→ Download DMG/EXE from CDN (progress callback)  │   │
│ │ ├─→ SHA256 verification                            │   │
│ │ ├─→ Platform-specific install                      │   │
│ │ │   ├─ macOS: mount → copy → unmount → relaunch    │   │
│ │ │   └─ Windows: silent installer → restart         │   │
│ │ └─→ Cleanup temp files                             │   │
│ └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│          New App Version Running                             │
│ (Next app launch or after macOS relaunch)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Interaction Diagram

```
Toga App (Main Thread)
├── asyncio.create_task()
│   ├── check_for_updates() [async]
│   │   └── UpdateManager.check_for_updates() [async]
│   │       └── run_in_executor(firebase_query) [blocking]
│   │           └── Firebase Admin SDK [blocking I/O]
│   │               └── GET /latest/macos.json
│   │
│   └── GUI updates from async result
│       ├── show_update_dialog()
│       └── start_download_thread()
│
└── threading.Thread (Worker)
    └── download_and_install(version_data)
        ├── _download(url, checksum, progress_cb)
        │   ├── requests.get(url, stream=True)
        │   ├── hashlib.sha256() verify
        │   └── progress_cb() [called from thread]
        │
        └── Platform-specific install
            ├── macOS: _install_macos()
            │   ├── hdiutil attach
            │   ├── cp -R
            │   ├── hdiutil detach
            │   └── open /Applications/app
            │
            └── Windows: _install_windows()
                ├── subprocess.run(exe, ['/S'])
                └── Auto-restart or next launch
```

---

## Data Flow: Version Check

```
1. App Startup
   └─→ check_for_updates() [async]
       ├─→ Firebase Admin SDK initialized
       │   └─→ Credentials: service-account-key.json
       │
       ├─→ Query: GET /latest/macos
       │   └─→ Returns:
       │       {
       │         "version": "1.0.1",
       │         "downloadUrl": "https://cdn.../app-1.0.1.dmg",
       │         "checksumSha256": "abc123...",
       │         "releaseNotes": "Bug fixes",
       │         "releasedAt": 1703001600,
       │         "mandatory": false
       │       }
       │
       ├─→ Compare: remote.version > app.version
       │   └─→ 1.0.1 > 1.0.0 → TRUE
       │
       └─→ Return version_data or None
           └─→ If data: show_update_dialog()
```

---

## Data Flow: Download & Install

```
2. User Clicks "Update"
   └─→ Threading.Thread start
       └─→ UpdateManager.download_and_install(version_data)

3. Download Phase
   ├─→ URL: version_data['downloadUrl']
   ├─→ Destination: ~/.cache/app_update/app-1.0.1.dmg
   │
   ├─→ HTTP GET with stream=True
   │   ├─→ Read chunks (8192 bytes)
   │   ├─→ Update SHA256 hash
   │   ├─→ Call progress_cb(percentage)
   │   └─→ Write chunk to disk
   │
   └─→ Verify: sha256.hexdigest() == checksumSha256
       └─→ Match: proceed
       └─→ Mismatch: delete file, raise error

4. Install Phase (macOS Example)

   a) Mount DMG
      └─→ hdiutil attach -nobrowse app-1.0.1.dmg
          └─→ Returns mount point: /Volumes/ClaudeCodeLog

   b) Locate App Bundle
      └─→ Scan /Volumes/ClaudeCodeLog/
          └─→ Find: ClaudeCodeLog.app

   c) Install (Copy to /Applications)
      ├─→ Remove old: rm -rf /Applications/ClaudeCodeLog.app
      └─→ Copy new: cp -R /Volumes/ClaudeCodeLog/ClaudeCodeLog.app /Applications/
          Note: cp -R creates NEW file (new inode)
          This preserves code signature validity

   d) Unmount DMG
      └─→ hdiutil detach /Volumes/ClaudeCodeLog

   e) Clean Up
      └─→ rm ~/.cache/app_update/app-1.0.1.dmg

   f) Relaunch App
      └─→ open /Applications/ClaudeCodeLog.app

5. Install Phase (Windows Example)

   a) Execute Installer
      └─→ subprocess.run([
            "C:\\Users\\...\\app-1.0.1.exe",
            "/S"  # Silent install
          ])

   b) Installer handles:
      ├─→ Stop running app (if any)
      ├─→ Backup old files
      ├─→ Extract/install new files to Program Files
      ├─→ Update registry entries
      └─→ Auto-restart app

   c) Clean Up (on next app launch)
      └─→ Remove temp installer file

6. App State After Update
   └─→ New version (1.0.1) running
       └─→ Next check_for_updates() sees:
           local.__version__ = "1.0.1"
           remote.version = "1.0.1"
           → No update available
```

---

## Threading & Async Model

```
Toga App Lifecycle
│
├─ Startup Phase
│  ├─ Initialize UI
│  ├─ Initialize UpdateManager (Firebase admin client)
│  └─ asyncio.create_task(check_for_updates())
│
├─ Main Event Loop (running)
│  ├─ Event: user clicks button
│  ├─ Event: async task completes (version check)
│  │  ├─ If update available: show dialog
│  │  └─ If update clicked: start background thread
│  │
│  └─ Background Thread (separate Python thread)
│     ├─ download_and_install() runs here
│     ├─ Blocking I/O: requests.get(), file write
│     ├─ Blocking I/O: subprocess.run(hdiutil/installer)
│     ├─ Main thread NOT blocked
│     └─ progress_cb() called to update UI
│        └─ UI updates from thread require thread-safe queue
│
└─ Shutdown Phase (or Relaunch)
   └─ App closes/relaunches with new version
```

**Key Design Decision:**
- Version CHECK: async (fast, ~500ms Firebase query)
- Download/Install: thread (blocking I/O, ~60-120s)
- GUI always responsive

---

## Firebase Schema

```
Firebase Realtime Database
└── latest/
    ├── macos/
    │   ├── version: "1.0.1"
    │   ├── downloadUrl: "https://cdn.example.com/releases/app-1.0.1.dmg"
    │   ├── checksumSha256: "abc123def456..."
    │   ├── releaseNotes: "- Fixed bug X\n- Added feature Y"
    │   ├── releasedAt: 1703001600 (Unix timestamp)
    │   └── mandatory: false
    │
    └── windows/
        ├── version: "1.0.1"
        ├── downloadUrl: "https://cdn.example.com/releases/app-1.0.1.exe"
        ├── checksumSha256: "xyz789uvw012..."
        ├── releaseNotes: "- Fixed bug X\n- Added feature Y"
        ├── releasedAt: 1703001600
        └── mandatory: false
```

**Rationale:**
- Platform-specific versioning (macOS may lag Windows)
- Single JSON retrieval per platform
- Server-side version logic (easy to implement staged rollout)
- Immutable metadata (checksums, timestamps)

---

## File Storage Locations

```
macOS (Example)
├── Running App
│   └── /Applications/ClaudeCodeLog.app/
│       └── Contents/
│           ├── MacOS/claudecodelog (executable)
│           └── Resources/
│               ├── firebase-key.json (service account)
│               └── ...
│
├── Firebase Auth
│   └── ~/.claude/...
│       └── firebase-key.json (if not bundled)
│
└── Temporary Downloads
    └── ~/.cache/app_update/
        └── app-1.0.1.dmg (deleted after install)


Windows (Example)
├── Running App
│   └── C:\Program Files\ClaudeCodeLog\
│       ├── claudecodelog.exe
│       ├── resources\
│       │   ├── firebase-key.json
│       │   └── ...
│       └── Lib\
│
├── Firebase Auth
│   └── %APPDATA%\ClaudeCodeLog\
│       └── firebase-key.json (if not bundled)
│
└── Temporary Downloads
    └── %LOCALAPPDATA%\Temp\
        └── app_update\
            └── app-1.0.1.exe (deleted after install)
```

---

## Security Architecture

```
Public Internet
└── HTTPS Download URLs (CDN)
    └── Installer files
        └── Verify: SHA256 checksum (cannot be spoofed)

Firebase Realtime Database (Public Read)
└── /latest/{platform}/
    ├── version (public, acts as source of truth)
    ├── downloadUrl (public, no secrets)
    ├── checksumSha256 (public, for verification)
    └── releaseNotes (public, no secrets)

Firebase Authentication (Private)
└── service-account-key.json (bundled with app)
    └── Read-only access to /latest/
        └── No write access exposed to users

Installer Verification Chain
├── Download: verify HTTPS certificate (TLS)
├── During Download: verify SHA256 hash (cryptographic)
├── macOS: verify code signature (Gatekeeper)
└── Windows: optional certificate validation
```

**Assumption:** Firebase rules restrict WRITE to authenticated admin only

---

## Error Handling & Recovery

```
Scenario: Network Unavailable
└─→ check_for_updates()
    └─→ Firebase query timeout
        └─→ Catch exception
            └─→ Log error, continue (user unaffected)
                └─→ Next app launch will retry

Scenario: Checksum Mismatch
└─→ download_and_install()
    └─→ SHA256 mismatch detected
        └─→ Delete corrupted file
            └─→ Log error
                └─→ Show error dialog to user
                    └─→ User can retry

Scenario: Install Fails
└─→ macOS: hdiutil fails → subprocess raises
    └─→ Catch exception
        └─→ Cleanup: unmount, delete DMG
            └─→ Log error
                └─→ Show error dialog
                    └─→ Old app still running (no replace)

Scenario: App Won't Relaunch
└─→ macOS: open /Applications/app fails
    └─→ Catch exception
        └─→ Log error
            └─→ User can manually relaunch from Finder

Scenario: Partial Download
└─→ Download interrupted (user closes app)
    └─→ Incomplete file remains in ~/.cache/
        └─→ Next check: download starts fresh
            (old file overwritten or cleaned up)
```

---

## Deployment Topology

```
Developer Workstation
│
├─ Build macOS DMG
│  └─ Briefcase build/package
│     └─ Outputs: dist/app-1.0.1.dmg
│        └─ Sign DMG (codesign)
│           └─ Notarize (xcrun notarytool)
│
├─ Build Windows EXE
│  └─ Briefcase build/package
│     └─ Outputs: dist/app-1.0.1.exe
│        └─ Sign EXE (optional, signtool)
│
└─ Compute Checksums
   ├─ macOS: shasum -a 256 app-1.0.1.dmg
   ├─ Windows: certutil -hashfile app-1.0.1.exe SHA256
   └─ Store values for Firebase entry

         ↓

CDN (S3, Cloudflare, etc.)
│
├─ Upload: app-1.0.1.dmg
├─ Upload: app-1.0.1.exe
└─ URLs: https://cdn.example.com/releases/...

         ↓

Firebase Realtime Database
│
└─ /latest/macos/
   ├─ version: "1.0.1"
   ├─ downloadUrl: "https://cdn.example.com/releases/app-1.0.1.dmg"
   ├─ checksumSha256: "<from shasum>"
   └─ releaseNotes: "..."
└─ /latest/windows/
   ├─ version: "1.0.1"
   ├─ downloadUrl: "https://cdn.example.com/releases/app-1.0.1.exe"
   ├─ checksumSha256: "<from certutil>"
   └─ releaseNotes: "..."

         ↓

End User (Update Cycle)
│
├─ App running (v1.0.0)
├─ check_for_updates() → Firebase
├─ User: "Update available? Yes → Update"
├─ download_and_install()
│  ├─ Download from CDN
│  ├─ Verify checksum
│  ├─ Install locally
│  └─ Relaunch
└─ App running (v1.0.1)
```

---

## Performance Characteristics

| Operation | Duration | Notes |
|-----------|----------|-------|
| Firebase version query | ~200-500ms | Network dependent |
| Download 50MB DMG | ~10-60s | Depends on bandwidth |
| SHA256 verification | ~1-2s | For 50MB file |
| macOS mount/copy | ~10-30s | Disk speed dependent |
| macOS relaunch | ~5-10s | App startup time |
| Windows install | ~20-60s | Depends on HKLM changes |
| **Total user-perceived time** | **60-180s** | Mostly download time |

**Optimization Opportunities:**
- Delta updates (not implemented, future)
- Parallel downloads (rarely needed)
- Cache version check (24h TTL)

---

## Monitoring & Telemetry

Recommended tracking:
- Update checks: frequency, success rate
- Updates initiated: count, version pairs
- Download success: rate, average size
- Install success: rate, platform breakdown
- Errors: count, type, platform

Simple approach: log to Firebase or separate metrics database.

---

## Rollback Procedure

If critical bug discovered after release:

1. **Quick Rollback:**
   - Edit Firebase `/latest/{platform}/version` back to previous
   - All new checks will skip update
   - Already-updated users: manual downgrade needed

2. **Graceful Rollback:**
   - Push fix as new version (e.g., 1.0.2)
   - Update Firebase with new checksums
   - Users will auto-update to 1.0.2

3. **Emergency (Production):**
   - Disable Firebase writes to prevent accidents
   - Use staging Firebase project for testing
   - Maintain manual review of version releases

---
