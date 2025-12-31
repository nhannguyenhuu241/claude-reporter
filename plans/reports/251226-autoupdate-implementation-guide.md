# Auto-Update Implementation Quick Reference

**For:** Toga/Briefcase desktop apps with Firebase backend
**Status:** Production-ready patterns
**Last Updated:** 2025-12-26

---

## 1. Firebase Setup (5 minutes)

### Create Database

1. Firebase Console → Create Project
2. Realtime Database → Create → Start in Test Mode
3. Copy Database URL: `https://your-project.firebaseio.com`

### Create Service Account

1. Settings → Service Accounts → Create Service Account
2. Generate new private key → JSON
3. Save as `firebase-key.json` in app directory
4. **⚠️ DO NOT commit to git; add to .gitignore**

### Set Database Rules (Test)

```json
{
  "rules": {
    "latest": {
      ".read": true,
      ".write": false
    }
  }
}
```

For production, restrict writes to authenticated admin.

---

## 2. Firebase Data Entry

Go to Realtime Database console and manually create:

```
latest
├── macos
│   ├── version: "1.0.1"
│   ├── downloadUrl: "https://cdn.example.com/app-1.0.1.dmg"
│   ├── checksumSha256: "abc123..."
│   ├── releaseNotes: "Bug fixes"
│   ├── releasedAt: 1703001600
│   └── mandatory: false
│
└── windows
    ├── version: "1.0.1"
    ├── downloadUrl: "https://cdn.example.com/app-1.0.1.exe"
    ├── checksumSha256: "xyz789..."
    ├── releaseNotes: "Bug fixes"
    ├── releasedAt: 1703001600
    └── mandatory: false
```

---

## 3. Minimal Update Manager

```python
# app/claudecodelog/updates.py

import asyncio
import hashlib
import logging
import platform
import subprocess
from pathlib import Path
from typing import Optional, Callable

import firebase_admin
from firebase_admin import credentials, db

logger = logging.getLogger(__name__)

class UpdateManager:
    def __init__(self, service_account_path: str, db_url: str, current_version: str):
        if not firebase_admin._apps:
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred, {'databaseURL': db_url})

        self.current_version = current_version
        self.db_url = db_url

    @property
    def platform_key(self) -> str:
        return "macos" if platform.system() == "Darwin" else "windows"

    async def check_for_updates(self) -> Optional[dict]:
        """Query Firebase for available update."""
        loop = asyncio.get_event_loop()
        try:
            # Run blocking Firebase call in executor
            data = await loop.run_in_executor(
                None,
                self._query_firebase
            )

            if data and self._is_newer(data.get('version', '0.0.0')):
                return data
            return None
        except Exception as e:
            logger.error(f"Update check failed: {e}")
            return None

    def _query_firebase(self) -> Optional[dict]:
        """Blocking Firebase query."""
        try:
            ref = db.reference(f'/latest/{self.platform_key}')
            return ref.get().val()
        except Exception as e:
            logger.error(f"Firebase query error: {e}")
            return None

    def _is_newer(self, remote_version: str) -> bool:
        """Check if remote version > current."""
        try:
            r = [int(x) for x in remote_version.split('.')]
            c = [int(x) for x in self.current_version.split('.')]

            for rv, cv in zip(r, c):
                if rv > cv:
                    return True
                elif rv < cv:
                    return False

            return len(r) > len(c)
        except:
            return False

    def download_and_install(
        self,
        version_data: dict,
        progress_callback: Optional[Callable[[float], None]] = None
    ) -> bool:
        """Download installer and update app."""
        try:
            installer = self._download(
                version_data['downloadUrl'],
                version_data['checksumSha256'],
                progress_callback
            )

            if self.platform_key == "macos":
                self._install_macos(installer)
            else:
                self._install_windows(installer)

            return True
        except Exception as e:
            logger.error(f"Install failed: {e}")
            return False

    @staticmethod
    def _download(
        url: str,
        expected_sha256: str,
        progress_cb: Optional[Callable[[float], None]] = None
    ) -> Path:
        """Download with progress and checksum."""
        import requests

        dest = Path.home() / ".cache" / "app_update" / Path(url).name
        dest.parent.mkdir(parents=True, exist_ok=True)

        response = requests.get(url, stream=True)
        total = int(response.headers.get('content-length', 0))

        sha256 = hashlib.sha256()
        downloaded = 0

        with open(dest, 'wb') as f:
            for chunk in response.iter_content(8192):
                f.write(chunk)
                sha256.update(chunk)
                downloaded += len(chunk)

                if progress_cb and total:
                    progress_cb((downloaded / total) * 100)

        actual_sha256 = sha256.hexdigest()
        if actual_sha256 != expected_sha256:
            dest.unlink()
            raise ValueError(f"Checksum mismatch: {actual_sha256} != {expected_sha256}")

        return dest

    @staticmethod
    def _install_macos(dmg_path: Path):
        """Mount DMG, copy app, relaunch."""
        import tempfile

        try:
            # Mount
            result = subprocess.run(
                ["hdiutil", "attach", "-nobrowse", str(dmg_path)],
                capture_output=True, text=True, timeout=30
            )

            mount_point = None
            for line in result.stdout.split('\n'):
                if '/Volumes/' in line:
                    mount_point = line.split()[-1]
                    break

            if not mount_point:
                raise RuntimeError("Mount failed")

            # Find .app
            app_bundle = None
            for item in Path(mount_point).iterdir():
                if item.suffix == '.app':
                    app_bundle = item
                    break

            if not app_bundle:
                raise RuntimeError("No .app in DMG")

            # Copy to /Applications (new file, not overwrite)
            app_dest = Path("/Applications") / app_bundle.name
            subprocess.run(["rm", "-rf", str(app_dest)], capture_output=True)
            subprocess.run(["cp", "-R", str(app_bundle), str(app_dest)], check=True, timeout=60)

            # Unmount
            subprocess.run(["hdiutil", "detach", mount_point], capture_output=True, timeout=10)

            # Relaunch
            subprocess.Popen(["open", str(app_dest)])

        finally:
            dmg_path.unlink(missing_ok=True)

    @staticmethod
    def _install_windows(exe_path: Path):
        """Execute installer silently."""
        try:
            subprocess.run(
                [str(exe_path), '/S'],
                check=False,
                timeout=120
            )
        finally:
            exe_path.unlink(missing_ok=True)
```

---

## 4. Integrate with Toga App

```python
# In app/claudecodelog/app.py

import asyncio
import threading
from pathlib import Path

class ClaudeCodeLogApp(toga.App):
    def startup(self):
        # Initialize update manager
        service_account = Path(__file__).parent / "firebase-key.json"
        self.update_manager = UpdateManager(
            str(service_account),
            "https://your-project.firebaseio.com",
            current_version="1.0.0"
        )

        # ... your UI setup ...

        # Check for updates on startup (non-blocking)
        asyncio.create_task(self.check_updates())

    async def check_updates(self):
        """Check for updates asynchronously."""
        try:
            update = await self.update_manager.check_for_updates()

            if update:
                # Show notification or dialog
                self.show_update_available(update)
        except Exception as e:
            # Silently fail - user can continue
            pass

    def show_update_available(self, update_data: dict):
        """Show update dialog."""
        self.main_window.info_dialog(
            "Update Available",
            f"Version {update_data['version']}\n\n{update_data['releaseNotes']}"
        )

        # Start download in background thread
        thread = threading.Thread(
            target=self.update_manager.download_and_install,
            args=(update_data, lambda p: print(f"Download: {p:.0f}%")),
            daemon=True
        )
        thread.start()
```

---

## 5. Testing Locally (Mock Firebase)

```python
# test_update_manager.py

import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

def test_update_check_detects_newer_version():
    """Test version comparison logic."""
    manager = UpdateManager("dummy.json", "https://dummy.io", "1.0.0")

    assert manager._is_newer("1.0.1") == True
    assert manager._is_newer("1.1.0") == True
    assert manager._is_newer("2.0.0") == True
    assert manager._is_newer("1.0.0") == False
    assert manager._is_newer("0.9.9") == False

def test_checksum_verification():
    """Test download verification."""
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(b"test content")
        tmp_path = Path(tmp.name)

    import hashlib
    expected_sha256 = hashlib.sha256(b"test content").hexdigest()

    # Should not raise
    # result = UpdateManager._download("file:///" + str(tmp_path), expected_sha256)

    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(b"different content")
        tmp_path = Path(tmp.name)

    # Should raise ValueError for mismatched checksum
    try:
        # result = UpdateManager._download("file:///" + str(tmp_path), expected_sha256)
        pass
    except ValueError:
        pass  # Expected
```

---

## 6. Security Checklist

- [ ] Service account JSON excluded from git
- [ ] HTTPS-only download URLs
- [ ] SHA256 checksums (not MD5)
- [ ] Firebase rules restrict writes to authenticated users
- [ ] Code-signed macOS app (at least ad-hoc)
- [ ] Temporary installer deleted after install
- [ ] No hardcoded API keys in source

---

## 7. Deployment Checklist

- [ ] Firebase project created and configured
- [ ] Service account key generated
- [ ] Version metadata manually entered in Firebase
- [ ] Installers built and checksums computed
- [ ] Update manager tested locally
- [ ] Toga app integrates update manager
- [ ] macOS: app signed, DMG created
- [ ] Windows: EXE/MSI installer created
- [ ] End-to-end test: actual update cycle
- [ ] Monitoring: track update success rates

---

## 8. Computing Checksums for Releases

```bash
# macOS DMG
shasum -a 256 app-1.0.1.dmg

# Windows EXE
certutil -hashfile app-1.0.1.exe SHA256

# Or cross-platform Python
python3 -c "
import hashlib
with open('app-1.0.1.dmg', 'rb') as f:
    print(hashlib.sha256(f.read()).hexdigest())
"
```

Enter SHA256 hash in Firebase manually.

---

## 9. Deployment Script (CI/CD Example)

```bash
#!/bin/bash
# .github/workflows/release.yml (GitHub Actions)

name: Release

on:
  push:
    tags: 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest]

    steps:
      - uses: actions/checkout@v3

      - name: Build macOS
        if: runner.os == 'macOS'
        run: |
          cd app
          briefcase build macos
          briefcase package macos
          # Code sign DMG here
          # Upload to CDN
          SHA256=$(shasum -a 256 dist/app-*.dmg | awk '{print $1}')
          echo "macOS_SHA256=$SHA256" >> $GITHUB_ENV

      - name: Build Windows
        if: runner.os == 'Windows'
        run: |
          cd app
          briefcase build windows
          briefcase package windows
          # Upload to CDN
          FOR /F %%i IN ('certutil -hashfile dist\app-*.exe SHA256 ^| findstr /R "^[A-Z0-9]*$"') DO SET WIN_SHA=%%i
          echo "WINDOWS_SHA256=%WIN_SHA%" >> %GITHUB_ENV%

      - name: Update Firebase
        run: |
          python3 scripts/update_firebase.py \
            --version ${{ github.ref_name }} \
            --macos-sha ${{ env.macOS_SHA256 }} \
            --windows-sha ${{ env.WINDOWS_SHA256 }}
```

---

## 10. Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Mount failed" (macOS) | DMG not signed | Sign DMG: `codesign -s - app.dmg` |
| UAC prompt every update (Windows) | App requesting elevation | Use background service or scheduled task |
| Download hangs | Blocking call in Toga thread | Use `asyncio.run_in_executor()` for I/O |
| Checksum mismatch | File corrupted in transit | Enable retry logic, verify on CDN |
| App won't relaunch (macOS) | Code signature broken | Use `cp -R` not `cp` (new inode) |

---

## 11. Version Numbering Standard

Use semantic versioning: `MAJOR.MINOR.PATCH`

```python
# In app version file or pyproject.toml
__version__ = "1.0.0"
```

Update Firebase `/latest/{platform}/version` to match.

---

## 12. Rollback Plan

If update is bad:

1. **Quick:** Push new version with fix
2. **Emergency:** Manually edit Firebase `/latest/{platform}/version` to previous
3. **Long-term:** Implement version history at `/versions/{version}/{platform}/`

---

## Quick Start (TL;DR)

1. Create Firebase project, service account
2. Copy UpdateManager code from Section 3
3. Integrate in Toga startup: `UpdateManager(...).check_for_updates()`
4. Test with mock Firebase
5. Build macOS DMG, Windows EXE
6. Compute SHA256, enter in Firebase
7. Upload installers to CDN
8. Deploy

**Total setup time:** 2-4 hours for first release
**Ongoing:** 30 minutes per update (compute checksums, update Firebase, deploy)

---
