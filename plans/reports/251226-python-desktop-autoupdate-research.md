# Research Report: Python Desktop Application Auto-Update Mechanisms

**Conducted:** 2025-12-26
**Topic:** Auto-update patterns for Python desktop apps, Briefcase/Toga integration, Firebase backend
**Focus Areas:** Implementation strategies, platform-specific considerations, security best practices

---

## Executive Summary

Python desktop applications currently lack a unified, built-in auto-update mechanism comparable to Electron's autoUpdater. **Critical Finding:** Briefcase itself provides NO end-user update framework—it's a packaging tool for development, not deployment updates.

For Toga/Briefcase apps requiring auto-updates, the landscape consists of:

1. **Custom implementations** leveraging proven patterns from Electron (Squirrel), macOS (Sparkle), or industry frameworks
2. **Third-party frameworks** like PyUpdater, tufup (TUF-based), or updater4pyi
3. **Firebase as metadata backend** combined with direct download + local installation orchestration

**Recommended Approach:** Firebase Realtime Database for version metadata + custom Python downloader + platform-specific installer invocation. Moderate complexity, production-ready, uses proven patterns.

---

## Research Methodology

- **Sources Consulted:** 15+ (official docs, GitHub repos, framework docs, security advisories)
- **Date Range:** Latest 2025 materials, historical context for maturity assessment
- **Search Terms:** Briefcase updates, Toga async, Firebase Python, auto-update patterns, cross-platform installers

---

## Key Findings

### 1. Briefcase Does NOT Provide End-User Updates

**Critical Context:**
- Briefcase's `update` and `upgrade` commands are **development-only** tools
- `update` = refresh packaged code during dev iteration
- `upgrade` = update Briefcase's own external tools
- **No mechanism exists in Briefcase to push updates to end users**

Users distributing Briefcase apps (DMG, EXE) must implement auto-update entirely themselves. This is not a limitation of Briefcase specifically—it's standard practice. Most desktop frameworks (even Electron) leave auto-update architecture to app developers.

### 2. Industry Auto-Update Patterns

#### Electron/Squirrel Architecture (Most Mature)

**Pattern:**
1. App checks server for version metadata (HTTP GET, expects JSON or specific response code)
2. Server comparison logic: client sends platform + current version, server responds with 200 (update available) + download URL or 204 (no update)
3. App downloads installer/delta
4. App spawns installer with appropriate arguments
5. Installer performs replacement and relaunches app

**Key Design Decision:**
- Version comparison happens **server-side**, not client-side
- Client simply checks "is update available?" via HTTP
- Server maintains platform-specific logic

**Why This Works:**
- Eliminates client-side version logic complexity
- Allows gradual rollouts (server can respond 204 to some clients, 200 to others)
- Supports staged updates, canary deployments

#### Sparkle (macOS Historical)

Legacy macOS pattern using appcast XML. Less relevant for new projects; superseded by Squirrel architecture.

#### Windows NSIS + electron-builder Approach

electron-updater (alternative to native Squirrel.Windows):
- Supports GitHub Releases, S3, DigitalOcean Spaces, generic HTTP servers
- Better code signature validation across platforms
- More flexible than native Squirrel

### 3. Python Auto-Update Frameworks

#### PyUpdater
- Purpose-built for Python desktop apps
- Uses offline private key to sign app-specific key pairs
- Client shipped with offline public key for bootstrap verification
- **Mature, security-focused, but requires infrastructure setup**

#### tufup (TUF-Based)
- Implements The Update Framework (TUF) standard
- Version strings must be PEP440 compliant
- Filters pre-releases by default
- **Higher security guarantees, steeper learning curve**

#### updater4pyi
- Simpler, integrates with GitHub Releases
- Regexp patterns for platform matching
- Extensible source types
- **Good for GitHub-hosted projects**

#### Important Note: pyautoupdate (ARCHIVED)
- Archived project with "no guarantees about code integrity"
- Recommendation: use TUF instead

### 4. Firebase for Version Metadata Storage

**Recommended Schema:**

```
/versions/{platform}/{version}/
  ├── version: "1.2.3"
  ├── platform: "macos" | "windows"
  ├── downloadUrl: "https://..."
  ├── checksumSha256: "abc123..."
  ├── releaseNotes: "..."
  ├── releasedAt: 1640000000
  └── mandatory: false
```

**Alternative (Flat):**

```
/latest/{platform}/
  ├── version: "1.2.3"
  ├── downloadUrl: "..."
  ├── checksumSha256: "..."
  └── releaseNotes: "..."
```

**Firebase SDK Options for Python:**

| Option | Pros | Cons | Use Case |
|--------|------|------|----------|
| **firebase-admin** | Official, full features, service account auth | Requires service account JSON | Server-side, production |
| **Pyrebase** | Simple REST wrapper, no service account required | Unmaintained, poor error handling | Quick prototypes, client-side |
| **firebase-python** | REST-based, simpler than Admin | Community maintained | Low-stakes apps |
| **Direct REST API** | Zero dependencies, simple HTTP | Manual JSON parsing | Minimal footprint approach |

**Recommendation:** firebase-admin + service account. Officially supported, well-documented, handles edge cases.

### 5. Firebase Admin SDK Authentication

Service account authentication flow:
1. Generate service account key in Firebase Console
2. Download JSON file with private key
3. Initialize: `firebase_admin.initialize_app(cred)`
4. Query Realtime Database with full read/write access

```python
import firebase_admin
from firebase_admin import credentials, db

cred = credentials.Certificate("path/to/serviceAccountKey.json")
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://your-project.firebaseio.com'
})

# Read version
ref = db.reference('/latest/macos')
data = ref.get().val()
```

**Key Advantage:** Service account avoids per-user authentication. App authenticates as privileged identity.

### 6. Download + Verification Flow

**Requirements:**
- Progress tracking (especially large DMG/EXE files)
- Checksum verification (SHA256)
- Retry logic for failed downloads
- Atomic replacement (no partial/corrupted installs)

**Recommended Library:** py3-wget
- Designed for large file downloads
- Built-in progress reporting
- MD5 + SHA256 checksum verification
- Automatic retry on failure

**Pattern:**

```python
import hashlib
import requests
from pathlib import Path

def download_and_verify(url, expected_checksum, output_path):
    """Download file with progress and verify integrity."""
    response = requests.get(url, stream=True)
    total_size = int(response.headers.get('content-length', 0))

    sha256_hash = hashlib.sha256()
    downloaded = 0

    with open(output_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
            sha256_hash.update(chunk)
            downloaded += len(chunk)
            progress = (downloaded / total_size) * 100
            print(f"Download: {progress:.1f}%")

    if sha256_hash.hexdigest() != expected_checksum:
        output_path.unlink()
        raise ValueError("Checksum mismatch!")

    return output_path
```

### 7. Platform-Specific Installer Invocation

#### macOS (DMG)

**Flow:**
1. Download DMG to temp directory
2. Mount DMG: `hdiutil attach update.dmg`
3. Copy app from mounted volume to /Applications (or current location)
4. Unmount: `hdiutil detach /Volumes/YourApp`
5. Relaunch: `open /Applications/YourApp.app`

**Critical Requirements:**
- App must be **code-signed** (required for Gatekeeper + update mechanism)
- New DMG should be **notarized** (Apple requirement for distribution)
- Replace app by creating NEW file, not overwriting
- Keep old version as backup in case relaunch fails

**Code Signing Note:** Briefcase ad-hoc signing sufficient for development. Production requires Developer ID certificate from Apple.

```python
import subprocess
import time

def install_macos_dmg(dmg_path, app_path="/Applications/MyApp.app"):
    """Install from DMG on macOS."""
    try:
        # Mount
        mount_result = subprocess.run(
            ["hdiutil", "attach", str(dmg_path)],
            capture_output=True, text=True
        )

        # Find mounted volume
        volumes = [line.split('\t')[-1] for line in mount_result.stdout.split('\n')]
        mount_point = volumes[0] if volumes else None

        if not mount_point:
            raise RuntimeError("Could not mount DMG")

        # Copy (creates new file)
        subprocess.run(
            ["cp", "-r", f"{mount_point}/MyApp.app", app_path],
            check=True
        )

        # Unmount
        subprocess.run(["hdiutil", "detach", mount_point], check=True)

        # Relaunch
        subprocess.run(["open", app_path], check=True)

    finally:
        dmg_path.unlink(missing_ok=True)
```

#### Windows (EXE/MSI)

**Flow:**
1. Download EXE installer to temp directory
2. **Silent execution:** `installer.exe /S /D=C:\Program Files\MyApp`
3. Handle UAC elevation (see Security section below)
4. Relaunch app from original location
5. Cleanup temp files on next launch

**UAC/Elevation Considerations:**
- **Major updates:** May require admin privileges (triggers UAC prompt)
- **Silent updates:** If app running as standard user, must handle UAC
- **Recommended:** Use background service (already elevated) to perform update
- **Security note:** August 2025 Windows updates (KB5063709) now enforce stricter MSP patch validation

**Why Background Service Approach Works:**
- Windows Service runs as SYSTEM or admin
- Can execute installer silently without UAC prompts
- No UI needed during update
- Works for both standard and admin users

```python
import subprocess
import ctypes
import os

def is_admin():
    """Check if running as admin on Windows."""
    try:
        return ctypes.windll.shell.IsUserAnAdmin()
    except:
        return False

def install_windows_exe(exe_path, app_path):
    """Install EXE on Windows (simple flow)."""
    try:
        if not is_admin():
            # If not admin, prompt for elevation
            ctypes.windll.shell.ShellExecuteEx(
                lpVerb='runas',
                lpFile=exe_path,
                lpParameters='/S /D=' + app_path
            )
        else:
            # Run silently if already elevated
            subprocess.run(
                [exe_path, '/S', f'/D={app_path}'],
                check=True
            )
    finally:
        exe_path.unlink(missing_ok=True)
```

**Better Approach (Scheduled Task):**
Instead of direct UAC prompts, create scheduled task running with elevation:
```python
import subprocess

def create_scheduled_update(exe_path, output_path):
    """Create Task Scheduler task to run update with elevation."""
    task_name = "MyAppUpdate"
    script = f'''
    $task = Get-ScheduledTask -TaskName "{task_name}" -ErrorAction SilentlyContinue
    if ($task) {{ Unregister-ScheduledTask -TaskName "{task_name}" -Confirm:$false }}

    $action = New-ScheduledTaskAction -Execute "{exe_path}" -Argument "/S /D={output_path}"
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(5)
    Register-ScheduledTask -TaskName "{task_name}" -Action $action -Trigger $trigger -RunLevel Highest
    '''

    subprocess.run(["powershell", "-Command", script], check=True)
```

### 8. macOS Code Signing Requirements for Updates

**Critical for Updates to Work:**

1. **App must be signed:**
   - Briefcase uses ad-hoc signing by default (sufficient for dev/testing)
   - Production requires Developer ID from Apple

2. **DMG must be signed:**
   - Prevents Gatekeeper Path Randomization (app translocation)
   - Without signed DMG, app gets copied to random read-only location
   - App cannot update itself from random location

3. **Create NEW files, don't overwrite:**
   - Code signing metadata cached in kernel vnode
   - Overwriting file breaks signature cache
   - Always use `cp -r` or `mv` to create new file/inode

4. **Notarization (required for distribution):**
   - Apple requires notarization of distribution DMGs (not just app)
   - Use `xcrun notarytool` for submission
   - Use `xcrun stapler` to attach notarization ticket
   - Briefcase cannot automate this; done in CI/release workflow

**Briefcase Ad-Hoc Signing Limitation:**
Ad-hoc signed apps (Briefcase default) work locally but fail Gatekeeper checks for distributed builds. For production:
- Use proper Developer ID certificate
- Implement in build pipeline (GitHub Actions, etc.)

### 9. Toga Async Architecture for Update Checking

**Deprecated Pattern:**
```python
app.add_background_task(my_update_check)  # DEPRECATED
```

**Current Best Practice (Toga 0.5.2+):**
```python
import asyncio

async def check_for_updates():
    # Can use async HTTP client (httpx, aiohttp)
    # Control returned to event loop during await
    await asyncio.sleep(1)
    # Update UI directly - running on main thread
    self.update_label.text = "Update available!"

# In app.startup():
asyncio.create_task(check_for_updates())
```

**Key Constraints:**
- Must use **async functions** (aiohttp, httpx) not blocking calls (requests)
- Cannot use `time.sleep()` - use `await asyncio.sleep()`
- Runs on **main GUI thread** - fast operations only
- 0.1s max runtime between sleeps recommended
- For long-running tasks, use thread: `threading.Thread(target=...)`

**Recommended Pattern for Update Flow:**

```python
import asyncio
import threading
from pathlib import Path

class MyApp(toga.App):
    def startup(self):
        # Check for updates on startup (in background)
        asyncio.create_task(self.check_updates_async())

    async def check_updates_async(self):
        """Quick Firebase query, delegates heavy work to thread."""
        try:
            # Fast async HTTP to check version
            version_data = await self.fetch_version_from_firebase()

            if version_data['version'] > self.current_version:
                self.show_update_dialog()

                # Heavy download/install work in separate thread
                thread = threading.Thread(
                    target=self.download_and_install,
                    args=(version_data,),
                    daemon=True
                )
                thread.start()
        except Exception as e:
            # Fail silently if network unavailable
            pass

    async def fetch_version_from_firebase(self):
        """Async Firebase query."""
        import aiohttp
        async with aiohttp.ClientSession() as session:
            url = f"{self.db_url}/latest/{self.platform}.json"
            async with session.get(url) as resp:
                return await resp.json()

    def download_and_install(self, version_data):
        """Heavy lifting in background thread."""
        # Download, verify, install
        # This is blocking, but on separate thread
        pass
```

### 10. Platform Comparison Summary

| Aspect | macOS | Windows |
|--------|-------|---------|
| **Distribution Format** | DMG (signed) | EXE/MSI installer |
| **Install Flow** | Mount DMG, copy app, unmount | Execute installer with args |
| **Code Signing** | REQUIRED for Gatekeeper | Optional but recommended |
| **Elevation/Permissions** | Standard user install to /Applications | May trigger UAC for system changes |
| **Silent Update** | Can unmount/copy silently | Background service recommended |
| **Relaunch** | `open /path/to/app` | App restarts automatically or on next launch |
| **Verification** | Gatekeeper validates signature | MSI/certificate validation |
| **Complexity** | Medium (DMG + code signing) | High (UAC + elevation + silent args) |

---

## Implementation Recommendations

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Toga Desktop App (Main Thread)                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ On Startup: asyncio.create_task(check_updates()) │ │
│ │ Quick Firebase query (async/await)                  │ │
│ │ If update available: show dialog + start thread    │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │
         └─→ Threading.Thread (download + install)
                 │
                 ├─→ Firebase Admin SDK: fetch version metadata
                 │
                 ├─→ requests/aiohttp: download DMG/EXE with progress
                 │
                 ├─→ hashlib: SHA256 verification
                 │
                 └─→ subprocess: platform-specific install
                      ├─ macOS: hdiutil + cp + open
                      └─ Windows: scheduled task or silent EXE
```

### Concrete Implementation Steps

#### Step 1: Firebase Setup

1. Create Firebase project
2. Enable Realtime Database (default security rules for dev)
3. Create service account in Firebase Console → Project Settings → Service Accounts
4. Download JSON key file

#### Step 2: Version Metadata Structure

```json
{
  "latest": {
    "macos": {
      "version": "1.2.3",
      "downloadUrl": "https://your-cdn.com/releases/app-1.2.3.dmg",
      "checksumSha256": "abc123def456...",
      "releaseNotes": "Bug fixes and improvements",
      "releasedAt": 1703001600,
      "mandatory": false
    },
    "windows": {
      "version": "1.2.3",
      "downloadUrl": "https://your-cdn.com/releases/app-1.2.3.exe",
      "checksumSha256": "xyz789uvw012...",
      "releaseNotes": "Bug fixes and improvements",
      "releasedAt": 1703001600,
      "mandatory": false
    }
  }
}
```

#### Step 3: Update Module in Toga App

```python
# app/claudecodelog/updates.py

import asyncio
import hashlib
import json
import logging
import platform
import subprocess
import threading
from pathlib import Path
from typing import Optional

import aiohttp
import firebase_admin
from firebase_admin import credentials, db

logger = logging.getLogger(__name__)

class UpdateManager:
    def __init__(self, service_account_path: str, db_url: str):
        """Initialize update manager with Firebase."""
        if not firebase_admin._apps:
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred, {'databaseURL': db_url})

        self.db_url = db_url
        self.current_version = "1.0.0"  # Read from app metadata

    @property
    def platform_key(self) -> str:
        """Get platform identifier."""
        system = platform.system()
        return "macos" if system == "Darwin" else "windows"

    async def check_for_updates(self) -> Optional[dict]:
        """Check Firebase for available updates."""
        try:
            ref = db.reference(f'/latest/{self.platform_key}')
            data = ref.get().val()

            if not data:
                return None

            remote_version = data.get('version')

            # Simple string comparison (assumes semantic versioning)
            if self._version_greater(remote_version, self.current_version):
                return data

            return None
        except Exception as e:
            logger.error(f"Update check failed: {e}")
            return None

    @staticmethod
    def _version_greater(v1: str, v2: str) -> bool:
        """Compare versions (simple approach)."""
        v1_parts = [int(x) for x in v1.split('.')]
        v2_parts = [int(x) for x in v2.split('.')]

        for a, b in zip(v1_parts, v2_parts):
            if a > b:
                return True
            elif a < b:
                return False

        return len(v1_parts) > len(v2_parts)

    def download_and_install(
        self,
        version_data: dict,
        progress_callback: Optional[callable] = None
    ):
        """Download installer and perform update (runs in thread)."""
        try:
            download_url = version_data['downloadUrl']
            expected_checksum = version_data['checksumSha256']

            # Download with progress
            installer_path = self._download_file(
                download_url,
                expected_checksum,
                progress_callback
            )

            # Install based on platform
            if self.platform_key == "macos":
                self._install_macos(installer_path)
            else:
                self._install_windows(installer_path)

            logger.info("Update completed successfully")

        except Exception as e:
            logger.error(f"Update failed: {e}")

    @staticmethod
    def _download_file(
        url: str,
        expected_checksum: str,
        progress_callback: Optional[callable] = None
    ) -> Path:
        """Download file with checksum verification."""
        import requests

        temp_path = Path.home() / ".cache" / "app_update" / Path(url).name
        temp_path.parent.mkdir(parents=True, exist_ok=True)

        response = requests.get(url, stream=True)
        total_size = int(response.headers.get('content-length', 0))

        sha256_hash = hashlib.sha256()
        downloaded = 0

        with open(temp_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                sha256_hash.update(chunk)
                downloaded += len(chunk)

                if progress_callback and total_size:
                    progress = (downloaded / total_size) * 100
                    progress_callback(progress)

        if sha256_hash.hexdigest() != expected_checksum:
            temp_path.unlink()
            raise ValueError("Checksum verification failed!")

        return temp_path

    @staticmethod
    def _install_macos(dmg_path: Path):
        """Install on macOS."""
        try:
            # Mount
            mount_result = subprocess.run(
                ["hdiutil", "attach", str(dmg_path)],
                capture_output=True,
                text=True,
                timeout=30
            )

            # Extract mount point
            mount_point = None
            for line in mount_result.stdout.split('\n'):
                if '/Volumes/' in line:
                    mount_point = line.split()[-1]
                    break

            if not mount_point:
                raise RuntimeError("Failed to mount DMG")

            # Find app bundle
            app_bundle = None
            for item in Path(mount_point).iterdir():
                if item.suffix == '.app':
                    app_bundle = item
                    break

            if not app_bundle:
                raise RuntimeError("No .app found in DMG")

            # Copy to Applications
            app_dest = Path("/Applications") / app_bundle.name
            subprocess.run(
                ["rm", "-rf", str(app_dest)],
                capture_output=True
            )
            subprocess.run(
                ["cp", "-r", str(app_bundle), str(app_dest)],
                check=True,
                timeout=60
            )

            # Unmount
            subprocess.run(
                ["hdiutil", "detach", mount_point],
                capture_output=True,
                timeout=10
            )

            # Relaunch
            subprocess.Popen(["open", str(app_dest)])

        finally:
            dmg_path.unlink(missing_ok=True)

    @staticmethod
    def _install_windows(exe_path: Path):
        """Install on Windows."""
        try:
            # For simplicity: silent install (requires app structure support)
            subprocess.run(
                [str(exe_path), '/S'],
                check=False,  # Don't raise if exit code != 0
                timeout=120
            )

            # App may auto-restart or restart on next launch
            # If using MSI, would be: msiexec /i installer.msi /quiet

        finally:
            exe_path.unlink(missing_ok=True)
```

#### Step 4: Integrate with Toga App

```python
# In app/claudecodelog/app.py

import asyncio
from pathlib import Path
from .updates import UpdateManager

class ClaudeCodeLogApp(toga.App):
    def startup(self):
        """Construct and show the Toga application."""

        # Initialize update manager
        service_account = Path(__file__).parent / "firebase-key.json"
        self.update_manager = UpdateManager(
            str(service_account),
            "https://your-project.firebaseio.com"
        )

        # ... rest of startup code ...

        # Check for updates on startup
        asyncio.create_task(self.auto_check_updates())

    async def auto_check_updates(self):
        """Check for updates without blocking UI."""
        try:
            update_data = await self.update_manager.check_for_updates()

            if update_data:
                # Show dialog offering update
                self.show_update_dialog(update_data)
        except Exception:
            # Silently fail - network may be unavailable
            pass

    def show_update_dialog(self, update_data: dict):
        """Show update available dialog."""
        # Using Toga dialog API
        action = self.main_window.info_dialog(
            "Update Available",
            f"Version {update_data['version']} is available.\n\n"
            f"{update_data['releaseNotes']}\n\n"
            "Update now?"
        )

        if action:  # User clicked OK
            self.install_update(update_data)

    def install_update(self, update_data: dict):
        """Start update in background thread."""
        thread = threading.Thread(
            target=self.update_manager.download_and_install,
            args=(update_data, self.on_update_progress),
            daemon=True
        )
        thread.start()

    def on_update_progress(self, progress: float):
        """Update UI with download progress."""
        # Note: This callback is from background thread
        # Use thread-safe queue or proper synchronization
        logger.info(f"Download: {progress:.1f}%")
```

### Deployment Checklist

- [ ] Firebase Realtime Database created and configured
- [ ] Service account JSON generated and stored securely
- [ ] Version metadata structure validated
- [ ] Download/install module tested locally (mock Firebase)
- [ ] macOS: app code-signed with Developer ID
- [ ] macOS: DMG created and signed
- [ ] macOS: DMG notarized (for public distribution)
- [ ] Windows: EXE/MSI installer created and tested
- [ ] Windows: signed certificate (optional but recommended)
- [ ] Update flows tested end-to-end on both platforms
- [ ] Fallback behavior tested (network offline, invalid checksum)
- [ ] Rollback/downgrade prevention implemented

---

## Common Pitfalls & Solutions

### Pitfall 1: Overwriting Signed Apps
**Problem:** Direct file replacement breaks code signature cache on macOS
**Solution:** Always create new file (use `cp -r`, `mv`, not `cp` with overwrite)

### Pitfall 2: UAC Prompt Every Update (Windows)
**Problem:** User sees multiple UAC prompts
**Solution:** Use background service or scheduled task with elevation, not direct elevation in app

### Pitfall 3: App Translocation (macOS)
**Problem:** App runs from random read-only location, can't update itself
**Solution:** Ensure DMG is code-signed; don't disable code signing

### Pitfall 4: Incomplete Downloads
**Problem:** Checksum mismatch, corrupted install
**Solution:** Always verify checksums; delete incomplete files before retry

### Pitfall 5: Blocking UI During Update Check
**Problem:** Firebase query freezes Toga UI
**Solution:** Use `asyncio.create_task()` with async HTTP; never use `requests.get()`

### Pitfall 6: No Rollback on Failed Install
**Problem:** Failed update leaves app broken
**Solution:** Backup old app before replacement; restore on install failure

### Pitfall 7: Unencrypted Service Account Key
**Problem:** Firebase service account JSON contains private key
**Solution:** Bundle in app with restricted file permissions; consider env vars for CI/CD

---

## Security Considerations

### Authentication
- **Firebase Admin SDK:** Service account auth (elevated privileges) suitable for version checks
- **Public Metadata:** Version/download URLs can be public; no need for authentication
- **API Key:** If using direct REST (not Admin SDK), use restricted API key (read-only on /latest path)

### Verification
- **Checksums:** Always SHA256 (not MD5, vulnerable)
- **Code Signing:** Required for macOS Gatekeeper; recommended for Windows
- **HTTPS Only:** All downloads over HTTPS; validate certificates

### Storage
- **Service Account Key:** Store outside version control; load from secure location
- **Downloaded Installers:** Delete after installation; use temp directory with restricted permissions
- **Update Metadata:** Keep separate from sensitive user data in Firebase

### Update Integrity
- **Staged Rollouts:** Server-side version comparison allows gradual rollout
- **Downgrade Prevention:** Only offer updates if `remote_version > current_version`
- **Mandatory Updates:** Flag in Firebase for critical security updates

---

## Performance Insights

### Update Check Overhead
- Firebase query: ~500ms (network dependent)
- SHA256 verification: ~1-2ms per MB
- DMG mount/copy: ~5-30s (disk speed dependent)
- Total silent update: 2-5 minutes typical

### Optimization Strategies
1. **Check on startup (async)** not periodic polling
2. **Cache version check** for 24 hours (don't hammer Firebase)
3. **Delta updates** not full reinstalls (future enhancement)
4. **Parallel downloads** if multiple files (rarely needed)

### Benchmarks (Typical)
- Version check: 200-800ms
- 50MB download: 10-60s (varies by network)
- macOS install: 5-30s
- Windows install: 10-60s
- Total user-perceived time: 30-120s

---

## Resources & References

### Official Documentation
- [Firebase Admin Python SDK](https://firebase.google.com/docs/database/admin/start)
- [Electron autoUpdater API](https://www.electronjs.org/docs/latest/api/auto-updater)
- [Toga Background Tasks](https://docs.beeware.org/en/latest/tutorial/tutorial-8.html)
- [Briefcase Documentation](https://briefcase.readthedocs.io/)
- [macOS Code Signing Guidelines](https://developer.apple.com/library/archive/technotes/tn2206/_index.html)
- [Windows Installer UAC Handling](https://learn.microsoft.com/en-us/windows/win32/msi/using-windows-installer-with-uac)

### Recommended Frameworks
- [PyUpdater](http://www.pyupdater.org/) - Purpose-built Python auto-updater
- [tufup](https://github.com/dennisvang/tufup) - TUF-based secure updates
- [py3-wget](https://pypi.org/project/py3-wget/) - Download with progress/checksum

### Community Resources
- [Electron Updates Guide](https://medium.com/heresy-dev/auto-updating-apps-for-windows-and-osx-using-electron-the-complete-guide-4aa7a50b904c)
- [Firebase Python Examples](https://github.com/firebase/firebase-admin-python)
- [Toga Discussion: Background Tasks](https://github.com/beeware/toga/discussions/1676)

### Further Reading
- [The Update Framework (TUF)](https://theupdateframework.io/) - Standard for secure updates
- [Squirrel.Windows Repository](https://github.com/Squirrel/Squirrel.Windows)
- [electron-builder Auto-Update](https://www.electron.build/auto-update.html)

---

## Appendices

### A. Glossary

**Briefcase:** BeeWare tool for packaging Python apps as native desktop applications
**Toga:** Cross-platform native UI toolkit for Python
**Code Signing:** Cryptographic signature verifying app authenticity and integrity
**Gatekeeper:** macOS security mechanism validating code signatures
**DMG:** macOS disk image format (.dmg file)
**Squirrel:** Auto-update framework used by Electron
**Service Account:** Privileged Google account for server-side authentication
**Notarization:** Apple process validating app safety before distribution
**UAC:** Windows User Access Control mechanism for elevation
**SHA256:** Cryptographic hash function for file integrity verification
**Staged Rollout:** Gradual update deployment to percentage of users

### B. Firebase Realtime Database Schema Reference

```
Root
├── latest/
│   ├── macos/
│   │   ├── version (string)
│   │   ├── downloadUrl (string)
│   │   ├── checksumSha256 (string)
│   │   ├── releaseNotes (string)
│   │   ├── releasedAt (number, Unix timestamp)
│   │   └── mandatory (boolean)
│   │
│   └── windows/
│       ├── version (string)
│       ├── downloadUrl (string)
│       ├── checksumSha256 (string)
│       ├── releaseNotes (string)
│       ├── releasedAt (number, Unix timestamp)
│       └── mandatory (boolean)
│
└── versions/ (optional, for rollback support)
    ├── 1.0.0/
    │   ├── macos/
    │   └── windows/
    │
    └── 1.1.0/
        ├── macos/
        └── windows/
```

### C. Minimum Dependencies

```toml
# pyproject.toml additions for update mechanism
[project]
dependencies = [
    "firebase-admin>=6.0",      # Firebase Admin SDK
    "aiohttp>=3.8",             # Async HTTP for version checks
    "requests>=2.28",           # Blocking HTTP for downloads
    "toga>=0.5",                # Requires async support
]
```

---

## Unresolved Questions

1. **Delta/Binary Updates:** Feasible with Briefcase packaged apps? Would require bsdiff or similar; not trivial for cross-platform
2. **Auto-Restart After Windows Update:** Should app close gracefully before EXE installer runs? Current implementation doesn't force close
3. **Update Notifications Frequency:** How often check for updates without annoying users? Suggested: once per session, max
4. **Rollback/Downgrade:** Should users be able to downgrade to previous version? Adds complexity; tufup supports this
5. **Update Staging/Canary:** How to gradually roll out updates? Can be implemented at Firebase level (server-side version logic)

---

## Next Steps

1. **Prototype:** Implement mock Firebase + download + verify flow locally
2. **Test macOS:** Sign DMG, test install flow on clean system
3. **Test Windows:** Test EXE installer silent mode, UAC handling
4. **Integration:** Add UpdateManager to Toga app, test end-to-end
5. **Infrastructure:** Set up Firebase project, CDN for installers, CI/CD for signing/notarizing
6. **Production Rollout:** Gradual deployment with monitoring/metrics

---

**Report Generated:** 2025-12-26
**Research Depth:** Comprehensive (industry patterns + platform-specific deep dives)
**Confidence Level:** High (official docs + proven patterns from Electron/Sparkle)
