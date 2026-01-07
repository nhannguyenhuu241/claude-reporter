"""Main GUI application using Toga."""

import webbrowser
import asyncio
import queue
import threading
import hashlib
import json
import urllib.request
import urllib.error
import zipfile
import io
import base64
from pathlib import Path
from datetime import datetime
import toga
from toga.style import Pack
from toga.style.pack import COLUMN, ROW

# Import from bundled claude_code_log package

# License key configuration
LICENSE_CONFIG_FILE = Path.home() / ".claude-code-log" / "license.json"
# License key: CCL-471C6F78EA080D05 (fallback local hash)
VALID_LICENSE_HASH = "f17e054863f939017831a0f86d5d18b3f8b3545063cc1832d1b675db89c69594"

# Admin license key - has full access (All Projects + Management)
ADMIN_LICENSE_KEY = "CCL-471C6F78EA080D05"

# Google Drive Apps Script URL (Upload)
APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwwmTgsQepdxauMBXl_VAyHy1OuJ6uL4e86-AAq53-OfATLNLrgVE_F6WA_gbuACTp5/exec"

# Google Drive Apps Script URL (List Folders)
DRIVE_LIST_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzWo13DkOGHLxGd4bolid1XeQqolHEARXKACWPjHBfz4r_jWxjzTzET6HVoraDcGng/exec"

# Firebase Firestore configuration
FIREBASE_PROJECT_ID = "claude-log"
FIREBASE_API_KEY = "AIzaSyDf62KkjB4FI001yCqrh0kF_OvqAz-ZND0"
FIRESTORE_BASE_URL = f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/databases/(default)/documents"


def get_license_config_dir():
    """Get or create license config directory."""
    config_dir = Path.home() / ".claude-code-log"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


def validate_license_from_firestore(key: str) -> dict:
    """Validate license key against Firestore database.

    Returns:
        dict with 'valid' (bool), 'error' (str or None), 'data' (license data or None)
    """
    if not key:
        return {"valid": False, "error": "Empty key", "data": None}

    try:
        # Query Firestore for the license key
        # Collection: licenses, Document ID: the license key itself
        key_clean = key.strip()
        url = f"{FIRESTORE_BASE_URL}/licenses/{key_clean}?key={FIREBASE_API_KEY}"

        req = urllib.request.Request(url, method="GET")
        req.add_header("Content-Type", "application/json")

        with urllib.request.urlopen(
            req, timeout=10, context=get_ssl_context()
        ) as response:
            data = json.loads(response.read().decode("utf-8"))

            # Check if license is active
            fields = data.get("fields", {})
            is_active = fields.get("active", {}).get("booleanValue", False)

            if is_active:
                return {
                    "valid": True,
                    "error": None,
                    "data": {
                        "key": key_clean,
                        "active": True,
                        "created": fields.get("created", {}).get("timestampValue"),
                        "email": fields.get("email", {}).get("stringValue"),
                        "drive_url": fields.get("drive_url", {}).get("stringValue"),
                    },
                }
            else:
                return {"valid": False, "error": "License deactivated", "data": None}

    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"valid": False, "error": "License not found", "data": None}
        return {"valid": False, "error": f"HTTP {e.code}", "data": None}
    except urllib.error.URLError as e:
        return {"valid": False, "error": f"Network error: {e}", "data": None}
    except Exception as e:
        return {"valid": False, "error": str(e), "data": None}


def get_license_drive_url() -> str | None:
    """Get drive URL for current license from Firestore."""
    key = load_license_key()
    if not key:
        return None

    result = validate_license_from_firestore(key)
    if result["valid"] and result["data"]:
        return result["data"].get("drive_url")
    return None


def extract_folder_id_from_url(url: str) -> str | None:
    """Extract folder ID from Google Drive URL."""
    if not url:
        return None
    # URL format: https://drive.google.com/drive/folders/FOLDER_ID
    if "/folders/" in url:
        parts = url.split("/folders/")
        if len(parts) > 1:
            folder_id = parts[1].split("?")[0].split("/")[0]
            return folder_id
    return None


def get_ssl_context():
    """Get SSL context with certifi certificates and Windows compatibility."""
    import ssl
    import sys

    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()

    # Windows-specific fixes for WinError 10053/10054
    if sys.platform == "win32":
        # Disable check_hostname and verify for problematic connections
        # Use TLS 1.2+ for better Windows compatibility
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        # Set reasonable options
        ctx.options |= ssl.OP_NO_SSLv2
        ctx.options |= ssl.OP_NO_SSLv3

    return ctx


def fetch_folder_contents(folder_id: str) -> dict:
    """Fetch folder contents from Google Drive via Apps Script."""
    try:
        url = f"{DRIVE_LIST_SCRIPT_URL}?action=list&folderId={folder_id}"

        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(
            req, timeout=30, context=get_ssl_context()
        ) as response:
            data = json.loads(response.read().decode("utf-8"))
            return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "error": str(e)}


def validate_license_key(key: str) -> bool:
    """Validate license key - try Firestore first, fallback to local hash."""
    if not key:
        return False

    # Try Firestore first
    firestore_result = validate_license_from_firestore(key)
    if firestore_result["valid"]:
        return True

    # Fallback to local hash validation (offline support)
    key_hash = hashlib.sha256(key.strip().encode()).hexdigest()
    return key_hash == VALID_LICENSE_HASH


def save_license_key(key: str) -> bool:
    """Save license key to config file."""
    try:
        config_file = get_license_config_dir() / "license.json"
        with open(config_file, "w") as f:
            json.dump({"license_key": key.strip()}, f)
        return True
    except Exception:
        return False


def load_license_key() -> str | None:
    """Load license key from config file."""
    try:
        config_file = get_license_config_dir() / "license.json"
        if config_file.exists():
            with open(config_file, "r") as f:
                data = json.load(f)
                return data.get("license_key")
    except Exception:
        pass
    return None


def is_licensed() -> bool:
    """Check if valid license exists - validates against Firestore."""
    key = load_license_key()
    if not key:
        return False

    # Validate against Firestore (online check)
    result = validate_license_from_firestore(key)

    if result["valid"]:
        return True

    # If Firestore says invalid/deactivated, check if it was a network error
    # Only fallback to local hash if network error (offline support)
    if result["error"] and (
        "Network error" in result["error"] or "timeout" in result["error"].lower()
    ):
        # Offline - fallback to local hash
        key_hash = hashlib.sha256(key.strip().encode()).hexdigest()
        return key_hash == VALID_LICENSE_HASH

    # Firestore explicitly said invalid/deactivated - license is not valid
    return False


def is_admin() -> bool:
    """Check if current license is admin (full access)."""
    key = load_license_key()
    if not key:
        return False
    return key.strip() == ADMIN_LICENSE_KEY and is_licensed()


def get_license_level() -> str:
    """Get license level: 'admin', 'licensed', or 'none'.

    - admin: CCL-471C6F78EA080D05 - All Projects + Management + Crown
    - licensed: Other valid keys - Management only (gold border)
    - none: No license - Basic features only
    """
    if not is_licensed():
        return "none"
    if is_admin():
        return "admin"
    return "licensed"


def load_drive_folder_id() -> str | None:
    """Load saved Google Drive folder ID."""
    try:
        config_file = get_license_config_dir() / "drive_config.json"
        if config_file.exists():
            with open(config_file, "r") as f:
                data = json.load(f)
                return data.get("folder_id")
    except Exception:
        pass
    return None


def save_drive_folder_id(folder_id: str) -> bool:
    """Save Google Drive folder ID."""
    try:
        config_file = get_license_config_dir() / "drive_config.json"
        with open(config_file, "w") as f:
            json.dump({"folder_id": folder_id.strip()}, f)
        return True
    except Exception:
        return False


def upload_to_drive(
    folder_id: str,
    file_name: str,
    content: str,
    date_folder: str,
    is_base64: bool = False,
    max_retries: int = 3,
) -> dict:
    """Upload file to Google Drive via Apps Script with retry logic.

    Handles Windows-specific network errors (WinError 10053/10054) with
    exponential backoff retry mechanism.
    """
    import time
    import sys

    data = json.dumps(
        {
            "folderId": folder_id,
            "fileName": file_name,
            "content": content,
            "dateFolder": date_folder,
            "isBase64": is_base64,
        }
    ).encode("utf-8")

    last_error = None

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                APPS_SCRIPT_URL,
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "ClaudeCodeLog/1.0",
                    "Connection": "keep-alive",
                },
                method="POST",
            )

            with urllib.request.urlopen(
                req, timeout=180, context=get_ssl_context()
            ) as response:
                return {"success": True, "status": response.status}

        except urllib.error.URLError as e:
            last_error = e
            error_str = str(e)

            # Check for Windows connection errors that are retryable
            is_retryable = any(err in error_str for err in [
                "WinError 10053",  # Connection aborted by host
                "WinError 10054",  # Connection reset by peer
                "Connection reset",
                "Connection aborted",
                "timed out",
                "EOF occurred",
            ])

            if is_retryable and attempt < max_retries - 1:
                # Exponential backoff: 2s, 4s, 8s
                wait_time = 2 ** (attempt + 1)
                time.sleep(wait_time)
                continue
            else:
                return {"success": False, "error": f"Upload failed after {attempt + 1} attempts: {error_str}"}

        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                time.sleep(2 ** (attempt + 1))
                continue
            return {"success": False, "error": f"Upload failed: {str(e)}"}

    return {"success": False, "error": f"Upload failed after {max_retries} attempts: {str(last_error)}"}


def generate_index_html(html_files: list, base_path: Path) -> str:
    """Generate an index.html that lists all projects and files."""
    # Group files by project folder
    projects = {}
    for html_file in html_files:
        try:
            rel_path = html_file.relative_to(base_path)
            parts = rel_path.parts
            if len(parts) > 1:
                project_name = parts[0]
                file_name = "/".join(parts)
            else:
                project_name = "Root"
                file_name = str(rel_path)

            if project_name not in projects:
                projects[project_name] = []
            projects[project_name].append(
                {
                    "name": html_file.name,
                    "path": str(rel_path),
                    "size": html_file.stat().st_size,
                }
            )
        except Exception:
            pass

    # Generate HTML
    date_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    total_files = len(html_files)
    total_size = sum(f.stat().st_size for f in html_files if f.exists()) / (1024 * 1024)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Code Logs - {date_str}</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }}
        .container {{
            max-width: 1000px;
            margin: 0 auto;
        }}
        h1 {{
            color: white;
            text-align: center;
            margin-bottom: 10px;
            font-size: 2em;
        }}
        .subtitle {{
            color: rgba(255,255,255,0.8);
            text-align: center;
            margin-bottom: 30px;
        }}
        .stats {{
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-bottom: 30px;
        }}
        .stat {{
            background: rgba(255,255,255,0.2);
            padding: 15px 25px;
            border-radius: 10px;
            color: white;
            text-align: center;
        }}
        .stat-value {{ font-size: 1.5em; font-weight: bold; }}
        .stat-label {{ font-size: 0.9em; opacity: 0.8; }}
        .project {{
            background: white;
            border-radius: 12px;
            margin-bottom: 15px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }}
        .project-header {{
            background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
            padding: 15px 20px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .project-header:hover {{ background: #e8ebef; }}
        .project-name {{
            font-weight: 600;
            color: #333;
            word-break: break-all;
        }}
        .project-count {{
            background: #667eea;
            color: white;
            padding: 3px 10px;
            border-radius: 15px;
            font-size: 0.85em;
        }}
        .project-files {{
            display: none;
            padding: 10px 20px;
            border-top: 1px solid #eee;
        }}
        .project.open .project-files {{ display: block; }}
        .file-link {{
            display: block;
            padding: 8px 0;
            color: #667eea;
            text-decoration: none;
            border-bottom: 1px solid #f0f0f0;
        }}
        .file-link:last-child {{ border-bottom: none; }}
        .file-link:hover {{ color: #764ba2; }}
        .file-size {{
            float: right;
            color: #999;
            font-size: 0.85em;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>📋 Claude Code Logs</h1>
        <p class="subtitle">Generated: {date_str}</p>

        <div class="stats">
            <div class="stat">
                <div class="stat-value">{len(projects)}</div>
                <div class="stat-label">Projects</div>
            </div>
            <div class="stat">
                <div class="stat-value">{total_files}</div>
                <div class="stat-label">HTML Files</div>
            </div>
            <div class="stat">
                <div class="stat-value">{total_size:.1f} MB</div>
                <div class="stat-label">Total Size</div>
            </div>
        </div>
"""

    # Add projects
    for project_name in sorted(projects.keys()):
        files = projects[project_name]
        files.sort(key=lambda x: x["name"])

        html += f"""
        <div class="project">
            <div class="project-header" onclick="this.parentElement.classList.toggle('open')">
                <span class="project-name">{project_name}</span>
                <span class="project-count">{len(files)} files</span>
            </div>
            <div class="project-files">
"""
        for f in files:
            size_kb = f["size"] / 1024
            html += f'''                <a href="{f["path"]}" class="file-link">
                    {f["name"]}
                    <span class="file-size">{size_kb:.1f} KB</span>
                </a>
'''
        html += """            </div>
        </div>
"""

    html += """
    </div>
    <script>
        // Auto-open first project
        document.querySelector('.project')?.classList.add('open');
    </script>
</body>
</html>"""

    return html


def create_zip_from_files(
    html_files: list, base_path: Path, include_main_index: bool = True
) -> bytes:
    """Create a ZIP file from HTML files and return bytes."""
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add main index.html from projects folder (the full dashboard version)
        if include_main_index:
            main_index = base_path / "index.html"
            if main_index.exists():
                # Use the full dashboard index.html
                zf.writestr("index.html", main_index.read_bytes())
            else:
                # Fallback to simple generated index
                index_html = generate_index_html(html_files, base_path)
                zf.writestr("index.html", index_html.encode("utf-8"))

        # Add all HTML files
        for html_file in html_files:
            try:
                # Skip the main index.html (already added above)
                if html_file.name == "index.html" and html_file.parent == base_path:
                    continue

                # Get relative path for archive name
                try:
                    rel_path = html_file.relative_to(base_path)
                    arc_name = str(rel_path)
                except ValueError:
                    arc_name = html_file.name

                # Read and add to zip
                content = html_file.read_bytes()
                zf.writestr(arc_name, content)
            except Exception:
                pass  # Skip files that can't be read

    zip_buffer.seek(0)
    return zip_buffer.read()


def discover_projects_with_sessions(projects_dir: Path):
    """Discover all projects with non-empty sessions.

    Returns a list of dicts with project info:
    [
        {
            'path': Path,
            'name': str,
            'session_count': int,
            'message_count': int,
            'last_modified': str
        },
        ...
    ]
    """
    projects = []

    if not projects_dir.exists():
        return projects

    # Iterate through project directories
    for project_dir in sorted(projects_dir.iterdir()):
        if not project_dir.is_dir():
            continue

        # Skip if name starts with '.' (hidden directories)
        if project_dir.name.startswith("."):
            continue

        # Count JSONL files and check if they have content
        jsonl_files = list(project_dir.glob("*.jsonl"))
        non_empty_files = [f for f in jsonl_files if f.stat().st_size > 0]

        # Skip projects with no sessions
        if not non_empty_files:
            continue

        # Try to get cache data for better info
        session_count = len(non_empty_files)
        message_count = 0
        last_modified = None

        try:
            from claudecodelog.claude_code_log.cache import (
                CacheManager,
                get_library_version,
            )

            cache_manager = CacheManager(project_dir, get_library_version())
            project_cache = cache_manager.get_cached_project_data()

            if project_cache and project_cache.sessions:
                # Filter empty sessions
                non_empty_sessions = [
                    s for s in project_cache.sessions.values() if s.message_count > 0
                ]
                session_count = len(non_empty_sessions)
                message_count = sum(s.message_count for s in non_empty_sessions)

                # Get latest timestamp
                if project_cache.latest_timestamp:
                    try:
                        dt = datetime.fromisoformat(
                            project_cache.latest_timestamp.replace("Z", "+00:00")
                        )
                        last_modified = dt.strftime("%Y-%m-%d %H:%M")
                    except:
                        pass
        except Exception:
            pass

        # Get last modified from files if not from cache
        if not last_modified and non_empty_files:
            latest_mtime = max(f.stat().st_mtime for f in non_empty_files)
            last_modified = datetime.fromtimestamp(latest_mtime).strftime(
                "%Y-%m-%d %H:%M"
            )

        projects.append(
            {
                "path": project_dir,
                "name": project_dir.name,
                "session_count": session_count,
                "message_count": message_count,
                "last_modified": last_modified or "Unknown",
            }
        )

    # Sort by last modified (most recent first)
    projects.sort(key=lambda p: p["last_modified"], reverse=True)

    return projects


class ClaudeCodeLogApp(toga.App):
    """Main application class."""

    def startup(self):
        """Construct and show the Toga application."""
        # Check license level: 'admin', 'licensed', or 'none'
        self.license_level = get_license_level()
        self.has_license = self.license_level != "none"
        self.is_admin = self.license_level == "admin"

        # Main window container
        main_box = toga.Box(style=Pack(direction=COLUMN, margin=20))

        self.main_box = main_box  # Store reference for dynamic add/remove

        # Title row with license icon
        title_box = toga.Box(
            style=Pack(direction=ROW, margin=(0, 5), align_items="center")
        )

        # Title with crown for admin
        if self.is_admin:
            title_text = "👑 Claude Code Log"
        elif self.has_license:
            title_text = "Claude Code Log"
        else:
            title_text = "Claude Code Log"

        title = toga.Label(
            title_text,
            style=Pack(flex=1, font_size=18, font_weight="bold"),
        )
        title_box.add(title)

        # License icon button based on level
        if self.is_admin:
            icon = "👑"  # Crown for admin
        elif self.has_license:
            icon = "💼"  # Manager briefcase for licensed
        else:
            icon = "🔑"  # Key for no license

        self.license_icon_btn = toga.Button(
            icon,
            on_press=self.show_license_dialog,
            style=Pack(width=40, height=30, font_size=14, margin_right=5),
        )
        title_box.add(self.license_icon_btn)

        # Help/Guide button
        self.help_btn = toga.Button(
            "📖",
            on_press=self.open_user_guide,
            style=Pack(width=40, height=30, font_size=14),
        )
        title_box.add(self.help_btn)

        main_box.add(title_box)

        # Description
        description = toga.Label(
            "Convert Claude Code transcript JSONL files to HTML",
            style=Pack(margin=(0, 5, 10, 5)),
        )
        main_box.add(description)

        # Mode selection
        mode_box = toga.Box(style=Pack(direction=ROW, margin=5))
        mode_label = toga.Label("Mode:", style=Pack(margin_right=10, width=100))
        mode_box.add(mode_label)

        # Show All Projects only for admin
        # Licensed users get Management mode (gold border) but not All Projects
        if self.is_admin:
            mode_items = ["All Projects", "Directory", "Single File"]
        else:
            mode_items = ["Directory", "Single File"]

        self.mode_selection = toga.Selection(
            items=mode_items,
            style=Pack(flex=1),
            on_change=self.on_mode_change,
        )
        mode_box.add(self.mode_selection)
        main_box.add(mode_box)

        # Project selection UI (for "All Projects" mode)
        self.project_selection_box = toga.Box(style=Pack(direction=COLUMN, margin=5))

        # Project list header with buttons
        project_header_box = toga.Box(style=Pack(direction=ROW, margin=5))
        projects_label = toga.Label(
            "Select Projects:",
            style=Pack(flex=1, font_weight="bold"),
        )
        project_header_box.add(projects_label)

        refresh_btn = toga.Button(
            "Refresh",
            on_press=self.refresh_projects,
            style=Pack(width=80, margin_right=5),
        )
        project_header_box.add(refresh_btn)

        select_all_btn = toga.Button(
            "Select All",
            on_press=self.select_all_projects,
            style=Pack(width=80, margin_right=5),
        )
        project_header_box.add(select_all_btn)

        deselect_all_btn = toga.Button(
            "Deselect All",
            on_press=self.deselect_all_projects,
            style=Pack(width=100),
        )
        project_header_box.add(deselect_all_btn)

        self.project_selection_box.add(project_header_box)

        # Scrollable container for project checkboxes
        self.project_list_container = toga.Box(style=Pack(direction=COLUMN))

        project_scroll = toga.ScrollContainer(
            content=self.project_list_container,
            style=Pack(height=200, margin=5),
        )
        self.project_selection_box.add(project_scroll)

        # Project checkboxes will be dynamically added here
        self.project_checkboxes = []

        # Will be added/removed from main_box dynamically

        # Input path selection
        self.input_box = toga.Box(style=Pack(direction=ROW, margin=5))
        input_label = toga.Label("Input:", style=Pack(margin_right=10, width=100))
        self.input_box.add(input_label)

        self.input_path = toga.TextInput(
            placeholder="Select file or directory...",
            readonly=True,
            style=Pack(flex=1, margin_right=5),
        )
        self.input_box.add(self.input_path)

        select_btn = toga.Button(
            "Browse",
            on_press=self.select_input,
            style=Pack(width=80),
        )
        self.input_box.add(select_btn)
        # Will be added/removed dynamically

        # Output path selection
        self.output_box = toga.Box(style=Pack(direction=ROW, margin=5))
        output_label = toga.Label("Output:", style=Pack(margin_right=10, width=100))
        self.output_box.add(output_label)

        self.output_path = toga.TextInput(
            placeholder="Optional output path...",
            style=Pack(flex=1, margin_right=5),
        )
        self.output_box.add(self.output_path)

        select_output_btn = toga.Button(
            "Browse",
            on_press=self.select_output,
            style=Pack(width=80),
        )
        self.output_box.add(select_output_btn)
        main_box.add(self.output_box)  # Output box is always shown

        # Date filters - format dd/MM/yyyy
        date_box = toga.Box(style=Pack(direction=ROW, margin=5, align_items="center"))
        from_label = toga.Label("From:", style=Pack(margin_right=5, width=40))
        date_box.add(from_label)

        self.from_date = toga.TextInput(
            placeholder="dd/MM/yyyy",
            style=Pack(width=90),
        )
        date_box.add(self.from_date)

        # Clear from date - small text link style
        clear_from_btn = toga.Button(
            "×",
            on_press=self.clear_from_date,
            style=Pack(
                width=20, height=20, font_size=10, margin_left=2, margin_right=10
            ),
        )
        date_box.add(clear_from_btn)

        to_label = toga.Label("To:", style=Pack(margin_right=5, width=25))
        date_box.add(to_label)

        # Default to today's date
        today = datetime.now().strftime("%d/%m/%Y")
        self.to_date = toga.TextInput(
            value=today,
            placeholder="dd/MM/yyyy",
            style=Pack(width=90),
        )
        date_box.add(self.to_date)

        # Clear to date - small text link style
        clear_to_btn = toga.Button(
            "×",
            on_press=self.clear_to_date,
            style=Pack(width=20, height=20, font_size=10, margin_left=2),
        )
        date_box.add(clear_to_btn)

        main_box.add(date_box)

        # Options
        options_box = toga.Box(style=Pack(direction=COLUMN, margin=5))

        self.open_browser = toga.Switch(
            "Open in browser after conversion",
            value=True,
            style=Pack(margin=2),
        )
        options_box.add(self.open_browser)

        self.no_individual = toga.Switch(
            "Skip individual session files",
            value=False,
            style=Pack(margin=2),
        )
        options_box.add(self.no_individual)

        self.clear_cache = toga.Switch(
            "Clear cache before processing",
            value=False,
            style=Pack(margin=2),
        )
        options_box.add(self.clear_cache)

        main_box.add(options_box)

        # Status/Log area
        status_label = toga.Label(
            "Status:",
            style=Pack(margin=(20, 5, 5, 5), font_weight="bold"),
        )
        main_box.add(status_label)

        self.status_text = toga.MultilineTextInput(
            readonly=True,
            style=Pack(flex=1, margin=5, height=200),
        )
        main_box.add(self.status_text)

        # Action buttons
        button_box = toga.Box(style=Pack(direction=ROW, margin=10))

        self.convert_btn = toga.Button(
            "Convert",
            on_press=self.convert_files,
            style=Pack(flex=1, margin=5),
        )
        button_box.add(self.convert_btn)

        self.upload_btn = toga.Button(
            "☁️ Upload to Drive",
            on_press=self.show_upload_dialog,
            style=Pack(flex=1, margin=5),
        )
        button_box.add(self.upload_btn)

        # Team Report button (only for admin)
        if self.is_admin:
            self.team_report_btn = toga.Button(
                "📊 Team Report",
                on_press=self.show_team_report_dialog,
                style=Pack(flex=1, margin=5),
            )
            button_box.add(self.team_report_btn)

        clear_btn = toga.Button(
            "Clear Log",
            on_press=self.clear_log,
            style=Pack(width=100, margin=5),
        )
        button_box.add(clear_btn)

        main_box.add(button_box)

        # Store last output path for upload
        self.last_output_path = None

        # Create and show main window
        self.main_window = toga.MainWindow(title=self.formal_name)
        self.main_window.content = main_box
        self.main_window.show()

        # Set default path to Claude projects
        default_path = Path.home() / ".claude" / "projects"
        if default_path.exists():
            self.input_path.value = str(default_path)

        # Initialize UI state based on default mode
        self.on_mode_change(None)

    def on_mode_change(self, widget):
        """Handle mode selection change - show/hide project list."""
        mode = self.mode_selection.value

        if mode == "All Projects":
            # Show project selection, hide input path
            # Remove input box if present
            try:
                self.main_box.remove(self.input_box)
            except ValueError:
                pass  # Not in main_box

            # Add project selection box if not present
            # Insert after mode selection, before output box
            try:
                mode_box_index = self.main_box.children.index(
                    self.mode_selection.parent
                )
                self.main_box.insert(mode_box_index + 1, self.project_selection_box)
            except ValueError:
                pass  # Already added

            # Load projects if not already loaded
            if not self.project_checkboxes:
                self.refresh_projects(None)
        else:
            # Hide project selection, show input path
            # Remove project selection box if present
            try:
                self.main_box.remove(self.project_selection_box)
            except ValueError:
                pass  # Not in main_box

            # Add input box if not present
            # Insert after mode selection, before output box
            try:
                mode_box_index = self.main_box.children.index(
                    self.mode_selection.parent
                )
                self.main_box.insert(mode_box_index + 1, self.input_box)
            except ValueError:
                pass  # Already added

    def refresh_projects(self, widget):
        """Discover and populate project list."""
        try:
            self.log("Discovering projects...")

            # Get projects directory
            projects_dir = Path.home() / ".claude" / "projects"

            # Discover projects with sessions
            projects = discover_projects_with_sessions(projects_dir)

            # Clear existing checkboxes
            self.project_list_container.clear()
            self.project_checkboxes = []

            if not projects:
                self.log("No projects with sessions found.")
                no_projects_label = toga.Label(
                    "No projects with sessions found in ~/.claude/projects/",
                    style=Pack(margin=10),
                )
                self.project_list_container.add(no_projects_label)
                return

            # Create checkbox for each project
            for project in projects:
                # Project info text
                info_text = f"{project['name']} ({project['session_count']} sessions, {project['message_count']} messages, {project['last_modified']})"

                # Create checkbox
                checkbox = toga.Switch(
                    info_text,
                    value=False,
                    style=Pack(margin=2),
                )

                # Store project data with checkbox
                checkbox.project_data = project

                self.project_checkboxes.append(checkbox)
                self.project_list_container.add(checkbox)

            self.log(f"Found {len(projects)} projects with sessions.")

        except Exception as e:
            self.log(f"Error discovering projects: {e}")

    def select_all_projects(self, widget):
        """Check all project checkboxes."""
        for checkbox in self.project_checkboxes:
            checkbox.value = True
        self.log(f"Selected all {len(self.project_checkboxes)} projects.")

    def deselect_all_projects(self, widget):
        """Uncheck all project checkboxes."""
        for checkbox in self.project_checkboxes:
            checkbox.value = False
        self.log("Deselected all projects.")

    def clear_license(self, widget):
        """Clear saved license key."""
        asyncio.create_task(self._confirm_clear_license())

    async def _confirm_clear_license(self):
        """Confirm and clear license."""
        confirm = await self.main_window.dialog(
            toga.QuestionDialog(
                "Clear License",
                "Bạn có chắc muốn xóa license?\n\nApp sẽ khởi động lại.",
            )
        )
        if confirm:
            # Delete license file
            try:
                config_file = get_license_config_dir() / "license.json"
                if config_file.exists():
                    config_file.unlink()
                self.log("🗑️ License cleared!")

                # Show restart message
                await self.main_window.dialog(
                    toga.InfoDialog(
                        "License Cleared",
                        "License đã xóa.\n\nVui lòng khởi động lại app.",
                    )
                )
            except Exception as e:
                self.log(f"❌ Error clearing license: {e}")

    def show_license_dialog(self, widget):
        """Show license activation popup dialog."""
        if self.has_license:
            # Already licensed - show status window with clear button
            self._show_license_status_window()
            return

        # Create license input window
        self._create_license_window()

    def _show_license_status_window(self):
        """Show license status window with clear button."""
        if self.is_admin:
            title = "👑 Admin Status"
            status_text = "👑 Admin Mode Active"
            features = "• All Projects mode\n• Full management features"
        else:
            title = "💼 Manager Status"
            status_text = "💼 Manager Mode Active"
            features = "• View Report\n• Management features"

        # Create status window IMMEDIATELY (don't wait for network)
        window_height = 250 if not self.is_admin else 200
        status_window = toga.Window(title=title, size=(320, window_height))

        content = toga.Box(style=Pack(direction=COLUMN, margin=20))

        # Status label
        status_label = toga.Label(
            status_text,
            style=Pack(margin_bottom=10, font_size=14, font_weight="bold"),
        )
        content.add(status_label)

        # Features label
        features_label = toga.Label(
            features,
            style=Pack(margin_bottom=15),
        )
        content.add(features_label)

        # View Report button (for managers - will be enabled after loading)
        if not self.is_admin:
            self._report_btn = toga.Button(
                "⏳ Loading...",
                on_press=lambda w: None,  # Will be updated after load
                style=Pack(margin_bottom=15),
                enabled=False,
            )
            content.add(self._report_btn)
            self._status_window_ref = status_window

            # Load drive URL in background
            asyncio.create_task(self._load_drive_url_async())

        # Buttons
        btn_box = toga.Box(style=Pack(direction=ROW))

        close_btn = toga.Button(
            "Đóng",
            on_press=lambda w: status_window.close(),
            style=Pack(flex=1, margin_right=10),
        )
        btn_box.add(close_btn)

        clear_btn = toga.Button(
            "🗑️ Xóa License",
            on_press=lambda w: self._clear_license_from_window(status_window),
            style=Pack(flex=1),
        )
        btn_box.add(clear_btn)

        content.add(btn_box)

        status_window.content = content
        status_window.show()

    async def _load_drive_url_async(self):
        """Load drive URL in background and update button."""
        try:
            # Run network call in thread to not block UI
            drive_url = await asyncio.to_thread(get_license_drive_url)

            if drive_url and hasattr(self, "_report_btn"):
                # Update button
                self._report_btn.text = "📊 View Report"
                self._report_btn.enabled = True
                self._report_btn.on_press = lambda w: self._open_report_browser(
                    drive_url, self._status_window_ref
                )
            elif hasattr(self, "_report_btn"):
                # No drive URL configured
                self._report_btn.text = "❌ No Report URL"
                self._report_btn.enabled = False
        except Exception as e:
            if hasattr(self, "_report_btn"):
                self._report_btn.text = f"❌ Error"
                self._report_btn.enabled = False

    def _clear_license_from_window(self, status_window):
        """Clear license from status window."""
        status_window.close()
        asyncio.create_task(self._confirm_clear_license())

    def _show_loading_window(self):
        """Show a loading indicator window."""
        self._loading_window = toga.Window(title="Loading...", size=(250, 100))

        content = toga.Box(
            style=Pack(direction=COLUMN, margin=20, align_items="center")
        )

        # Animated loading text
        loading_label = toga.Label(
            "⏳ Đang tải dữ liệu...",
            style=Pack(margin_bottom=10, font_size=14, text_align="center"),
        )
        content.add(loading_label)

        # Progress bar (indeterminate style - just animate)
        self._loading_progress = toga.ProgressBar(
            max=100,
            value=0,
            style=Pack(width=200),
        )
        content.add(self._loading_progress)

        self._loading_window.content = content
        self._loading_window.show()

        # Start progress animation
        asyncio.create_task(self._animate_loading())

    async def _animate_loading(self):
        """Animate loading progress bar."""
        progress = 0
        while hasattr(self, "_loading_window") and self._loading_window:
            progress = (progress + 5) % 100
            try:
                self._loading_progress.value = progress
            except Exception:
                break
            await asyncio.sleep(0.1)

    def _close_loading_window(self):
        """Close the loading window if open."""
        if hasattr(self, "_loading_window") and self._loading_window:
            try:
                self._loading_window.close()
            except Exception:
                pass
            self._loading_window = None

    def _open_report_browser(self, drive_url, parent_window):
        """Open folder browser window."""
        parent_window.close()

        folder_id = extract_folder_id_from_url(drive_url)
        if not folder_id:
            self.log("❌ Invalid Drive URL")
            return

        # Show loading indicator immediately
        self._show_loading_window()

        # Create browser window
        self.report_window = toga.Window(title="📊 Report Browser", size=(500, 450))

        content = toga.Box(style=Pack(direction=COLUMN, margin=10))

        # Header with back button and current path
        header_box = toga.Box(style=Pack(direction=ROW, margin_bottom=10))

        self._back_btn = toga.Button(
            "⬅️ Back",
            on_press=self._go_back_folder,
            style=Pack(width=80, margin_right=10),
            enabled=False,
        )
        header_box.add(self._back_btn)

        self._path_label = toga.Label(
            "Loading...",
            style=Pack(flex=1, font_weight="bold"),
        )
        header_box.add(self._path_label)

        content.add(header_box)

        # Folder list container
        self._folder_list_box = toga.Box(style=Pack(direction=COLUMN))

        folder_scroll = toga.ScrollContainer(
            content=self._folder_list_box,
            style=Pack(flex=1, height=350),
        )
        content.add(folder_scroll)

        # Action buttons box (for ZIP convert)
        self._action_box = toga.Box(style=Pack(direction=ROW, margin_top=10))

        self._convert_btn = toga.Button(
            "📦 Convert ZIP",
            on_press=self._convert_selected_zip,
            style=Pack(flex=1, margin_right=5),
            enabled=False,
        )
        self._action_box.add(self._convert_btn)

        self._open_btn = toga.Button(
            "🌐 Open HTML",
            on_press=self._open_selected_html,
            style=Pack(flex=1),
            enabled=False,
        )
        self._action_box.add(self._open_btn)

        content.add(self._action_box)

        # Progress bar for downloads
        self._download_progress = toga.ProgressBar(
            max=100,
            value=0,
            style=Pack(height=8),
        )
        content.add(self._download_progress)

        # Status bar
        self._browser_status = toga.Label(
            "",
            style=Pack(margin_top=5),
        )
        content.add(self._browser_status)

        # Close button
        close_btn = toga.Button(
            "Đóng",
            on_press=lambda w: self.report_window.close(),
            style=Pack(margin_top=10),
        )
        content.add(close_btn)

        # Selected file tracking
        self._selected_file = None

        self.report_window.content = content
        self.report_window.show()

        # Initialize folder history
        self._folder_history = []
        self._current_folder_id = folder_id

        # Load folder contents
        asyncio.create_task(self._load_folder_contents(folder_id))

    async def _load_folder_contents(self, folder_id):
        """Load and display folder contents."""
        self._browser_status.text = "⏳ Loading..."
        self._folder_list_box.clear()

        # Fetch in background
        result = await asyncio.to_thread(fetch_folder_contents, folder_id)

        # Close loading window if open
        self._close_loading_window()

        if not result["success"]:
            self._browser_status.text = f"❌ Error: {result.get('error', 'Unknown')}"
            return

        data = result["data"]

        if "error" in data:
            self._browser_status.text = f"❌ {data['error']}"
            return

        # Update path label
        self._path_label.text = f"📁 {data.get('folderName', 'Unknown')}"
        self._current_folder_id = folder_id

        items = data.get("items", [])

        # Store items for selection
        self._current_items = items

        if not items:
            empty_label = toga.Label(
                "📭 Thư mục trống",
                style=Pack(margin=20),
            )
            self._folder_list_box.add(empty_label)
        else:
            # Grid layout: 4 columns with larger boxes
            COLS = 4
            BOX_WIDTH = 110
            BOX_HEIGHT = 70

            row_box = None
            for idx, item in enumerate(items):
                # Create new row every COLS items
                if idx % COLS == 0:
                    row_box = toga.Box(style=Pack(direction=ROW, margin=2))
                    self._folder_list_box.add(row_box)

                # Truncate name smartly
                name = item["name"]
                if len(name) > 12:
                    name = name[:10] + ".."

                if item["type"] == "folder":
                    icon = "📁"
                    # Folder button - clickable to navigate
                    item_btn = toga.Button(
                        f"{icon} {name}",
                        on_press=lambda w, fid=item["id"]: self._navigate_to_folder(
                            fid
                        ),
                        style=Pack(
                            width=BOX_WIDTH, height=BOX_HEIGHT, margin=2, font_size=10
                        ),
                    )
                else:
                    # File icon based on type
                    mime = item.get("mimeType", "")
                    is_zip = (
                        "zip" in mime or "compressed" in mime or name.endswith(".zip")
                    )
                    is_html = "html" in mime or name.endswith(".html")

                    if is_zip:
                        icon = "📦"
                    elif is_html:
                        icon = "🌐"
                    elif "image" in mime:
                        icon = "🖼️"
                    elif "pdf" in mime:
                        icon = "📄"
                    else:
                        icon = "📃"

                    # File button - different behavior for ZIP vs HTML vs others
                    if is_zip:
                        # ZIP: select for Convert
                        item_btn = toga.Button(
                            f"{icon} {name}",
                            on_press=lambda w, it=item: self._select_zip_file(it),
                            style=Pack(
                                width=BOX_WIDTH,
                                height=BOX_HEIGHT,
                                margin=2,
                                font_size=10,
                            ),
                        )
                    elif is_html:
                        # HTML: download then open locally
                        item_btn = toga.Button(
                            f"{icon} {name}",
                            on_press=lambda w, it=item: asyncio.create_task(
                                self._download_and_open_html(it)
                            ),
                            style=Pack(
                                width=BOX_WIDTH,
                                height=BOX_HEIGHT,
                                margin=2,
                                font_size=10,
                            ),
                        )
                    else:
                        # Other files: open Drive URL in browser
                        item_btn = toga.Button(
                            f"{icon} {name}",
                            on_press=lambda w, url=item.get("url"): webbrowser.open(url)
                            if url
                            else None,
                            style=Pack(
                                width=BOX_WIDTH,
                                height=BOX_HEIGHT,
                                margin=2,
                                font_size=10,
                            ),
                        )

                row_box.add(item_btn)

        self._browser_status.text = f"📊 {len(items)} items"

    def _navigate_to_folder(self, folder_id):
        """Navigate into a subfolder."""
        # Save current folder to history
        self._folder_history.append(self._current_folder_id)
        self._back_btn.enabled = True

        # Load new folder
        asyncio.create_task(self._load_folder_contents(folder_id))

    def _go_back_folder(self, widget):
        """Go back to previous folder."""
        if self._folder_history:
            prev_folder_id = self._folder_history.pop()
            self._back_btn.enabled = len(self._folder_history) > 0
            asyncio.create_task(self._load_folder_contents(prev_folder_id))

    def _select_zip_file(self, item):
        """Select a ZIP file for conversion."""
        self._selected_file = item
        self._convert_btn.enabled = True
        self._open_btn.enabled = False
        # Show file size
        size_bytes = item.get("size", 0)
        size_str = self._format_size(size_bytes)
        self._browser_status.text = f"📦 {item['name']} ({size_str})"
        self._download_progress.value = 0

    def _format_size(self, size_bytes):
        """Format bytes to human readable string."""
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        else:
            return f"{size_bytes / (1024 * 1024):.2f} MB"

    def _convert_selected_zip(self, widget):
        """Download ZIP, extract, and open index.html."""
        if not self._selected_file:
            return
        asyncio.create_task(self._do_convert_zip())

    async def _do_convert_zip(self):
        """Async task to download and extract ZIP via Apps Script."""
        item = self._selected_file
        if not item:
            return

        self._convert_btn.enabled = False
        self._convert_btn.text = "⏳ Downloading..."
        self._download_progress.value = 0

        # Get file size for progress display
        total_size = item.get("size", 0)
        total_size_str = self._format_size(total_size)

        try:
            file_id = item.get("id")
            if not file_id:
                self._browser_status.text = "❌ Cannot get file ID"
                self._convert_btn.enabled = True
                self._convert_btn.text = "📦 Convert ZIP"
                return

            # Download via Apps Script
            file_data = None
            download_error = None
            download_done = False

            def do_download():
                nonlocal file_data, download_error, download_done
                try:
                    url = f"{DRIVE_LIST_SCRIPT_URL}?action=download&folderId=root&fileId={file_id}"
                    req = urllib.request.Request(url, method="GET")
                    req.add_header("User-Agent", "Mozilla/5.0")

                    with urllib.request.urlopen(
                        req, timeout=180, context=get_ssl_context()
                    ) as response:
                        result = json.loads(response.read().decode("utf-8"))

                        if result.get("success"):
                            content_b64 = result.get("content", "")
                            file_data = base64.b64decode(content_b64)
                        else:
                            download_error = result.get("error", "Unknown error")

                except Exception as e:
                    download_error = str(e)
                finally:
                    download_done = True

            download_thread = threading.Thread(target=do_download, daemon=True)
            download_thread.start()

            # Animate progress bar while downloading
            progress = 0
            while not download_done:
                # Simulate progress (since we can't get real progress from Apps Script)
                if progress < 85:
                    progress += 2
                self._download_progress.value = progress
                downloaded_est = int(total_size * progress / 100)
                self._browser_status.text = (
                    f"⬇️ {self._format_size(downloaded_est)} / {total_size_str}"
                )
                await asyncio.sleep(0.1)

            # Complete progress bar
            self._download_progress.value = 100

            if download_error:
                self._browser_status.text = f"❌ {download_error}"
                self._download_progress.value = 0
                self._convert_btn.enabled = True
                self._convert_btn.text = "📦 Convert ZIP"
                return

            if not file_data:
                self._browser_status.text = "❌ No data received"
                self._download_progress.value = 0
                self._convert_btn.enabled = True
                self._convert_btn.text = "📦 Convert ZIP"
                return

            # Show actual downloaded size
            actual_size_str = self._format_size(len(file_data))
            self._browser_status.text = f"✅ Downloaded: {actual_size_str}"

            # Extract ZIP
            self._convert_btn.text = "📦 Extracting..."
            await asyncio.sleep(0.1)

            import tempfile

            extract_dir = Path(tempfile.mkdtemp(prefix="claude_report_"))

            try:
                zip_buffer = io.BytesIO(file_data)
                with zipfile.ZipFile(zip_buffer, "r") as zf:
                    zf.extractall(extract_dir)
            except zipfile.BadZipFile:
                self._browser_status.text = "❌ Invalid ZIP file"
                self._convert_btn.enabled = True
                self._convert_btn.text = "📦 Convert ZIP"
                return

            # Find index.html
            index_path = extract_dir / "index.html"
            if not index_path.exists():
                html_files = list(extract_dir.rglob("*.html"))
                if html_files:
                    index_path = html_files[0]
                else:
                    self._browser_status.text = "❌ No HTML file found in ZIP"
                    self._convert_btn.enabled = True
                    self._convert_btn.text = "📦 Convert ZIP"
                    return

            # Open in browser
            self._browser_status.text = f"🚀 Opening: {index_path.name}"
            webbrowser.open(f"file://{index_path}")

            self.log(f"📂 Extracted to: {extract_dir}")
            self.log(f"🌐 Opened: {index_path.name}")

        except Exception as e:
            self._browser_status.text = f"❌ Error: {e}"
            self.log(f"❌ Convert ZIP error: {e}")

        self._convert_btn.enabled = True
        self._convert_btn.text = "📦 Convert ZIP"

    async def _download_and_open_html(self, item):
        """Download HTML file and open locally."""
        self._download_progress.value = 0
        total_size = item.get("size", 0)
        total_size_str = self._format_size(total_size)

        try:
            file_id = item.get("id")
            if not file_id:
                self._browser_status.text = "❌ Cannot get file ID"
                return

            # Download via Apps Script
            file_data = None
            download_error = None
            download_done = False

            def do_download():
                nonlocal file_data, download_error, download_done
                try:
                    url = f"{DRIVE_LIST_SCRIPT_URL}?action=download&folderId=root&fileId={file_id}"
                    req = urllib.request.Request(url, method="GET")
                    req.add_header("User-Agent", "Mozilla/5.0")

                    with urllib.request.urlopen(
                        req, timeout=180, context=get_ssl_context()
                    ) as response:
                        result = json.loads(response.read().decode("utf-8"))

                        if result.get("success"):
                            content_b64 = result.get("content", "")
                            file_data = base64.b64decode(content_b64)
                        else:
                            download_error = result.get("error", "Unknown error")

                except Exception as e:
                    download_error = str(e)
                finally:
                    download_done = True

            download_thread = threading.Thread(target=do_download, daemon=True)
            download_thread.start()

            # Animate progress
            progress = 0
            while not download_done:
                if progress < 85:
                    progress += 3
                self._download_progress.value = progress
                downloaded_est = int(total_size * progress / 100)
                self._browser_status.text = (
                    f"⬇️ {self._format_size(downloaded_est)} / {total_size_str}"
                )
                await asyncio.sleep(0.08)

            self._download_progress.value = 100

            if download_error:
                self._browser_status.text = f"❌ {download_error}"
                self._download_progress.value = 0
                return

            if not file_data:
                self._browser_status.text = "❌ No data received"
                self._download_progress.value = 0
                return

            # Save to temp file
            import tempfile

            temp_dir = Path(tempfile.mkdtemp(prefix="claude_html_"))
            html_path = temp_dir / item["name"]
            html_path.write_bytes(file_data)

            # Open in browser
            actual_size_str = self._format_size(len(file_data))
            self._browser_status.text = (
                f"🚀 Opening: {item['name']} ({actual_size_str})"
            )
            webbrowser.open(f"file://{html_path}")

            self.log(f"🌐 Opened: {html_path}")

        except Exception as e:
            self._browser_status.text = f"❌ Error: {e}"
            self._download_progress.value = 0

    def _open_selected_html(self, widget):
        """Open selected HTML file in browser."""
        if self._selected_file and self._selected_file.get("url"):
            webbrowser.open(self._selected_file["url"])

    def _create_license_window(self):
        """Create a popup window for license input."""
        # Create license window
        license_window = toga.Window(title="🔐 Activate License", size=(350, 180))

        content = toga.Box(style=Pack(direction=COLUMN, margin=20))

        # Label
        label = toga.Label(
            "Enter license key to activate:",
            style=Pack(margin_bottom=10),
        )
        content.add(label)

        # Input field
        self._license_key_input = toga.TextInput(
            placeholder="CCL-XXXX-XXXX-XXXX",
            style=Pack(margin_bottom=15, width=300),
        )
        content.add(self._license_key_input)

        # Buttons
        btn_box = toga.Box(style=Pack(direction=ROW))

        cancel_btn = toga.Button(
            "Cancel",
            on_press=lambda w: license_window.close(),
            style=Pack(margin_right=10, width=100),
        )
        btn_box.add(cancel_btn)

        self._activate_btn = toga.Button(
            "Activate",
            on_press=lambda w: self._activate_key(license_window),
            style=Pack(width=100),
        )
        btn_box.add(self._activate_btn)

        content.add(btn_box)

        license_window.content = content
        license_window.show()

    def _activate_key(self, license_window):
        """Activate the license key from popup."""
        key = self._license_key_input.value

        # Trim whitespace from copy/paste
        if key:
            key = key.strip()

        if not key:
            self.log("⚠️ Please enter a license key.")
            return

        # Show loading state
        self._activate_btn.text = "⏳ Checking..."
        self._activate_btn.enabled = False
        self._license_key_input.enabled = False

        # Run validation in background
        asyncio.create_task(self._validate_license_async(key, license_window))

    async def _validate_license_async(self, key, license_window):
        """Validate license key in background thread."""
        try:
            # Run network call in thread to not block UI
            is_valid = await asyncio.to_thread(validate_license_key, key)

            if is_valid:
                # Save the license key
                save_license_key(key)

                # Update license level
                self.license_level = get_license_level()
                self.has_license = True
                self.is_admin = key.strip() == ADMIN_LICENSE_KEY

                # Update icon based on level
                if self.is_admin:
                    self.license_icon_btn.text = "👑"
                    self.log("✅ Admin license activated! 👑")

                    # Add "All Projects" to mode selection for admin
                    current_mode = self.mode_selection.value
                    self.mode_selection.items = [
                        "All Projects",
                        "Directory",
                        "Single File",
                    ]
                    self.mode_selection.value = current_mode
                else:
                    self.license_icon_btn.text = "💼"
                    self.log("✅ License activated! (Manager mode) 💼")

                # Close popup
                license_window.close()

                # Show success
                await self._show_success()
            else:
                self.log("❌ Invalid license key.")
                # Reset button state
                self._activate_btn.text = "Activate"
                self._activate_btn.enabled = True
                self._license_key_input.enabled = True
                await self._show_error()
        except Exception as e:
            self.log(f"❌ Error validating license: {e}")
            # Reset button state
            self._activate_btn.text = "Activate"
            self._activate_btn.enabled = True
            self._license_key_input.enabled = True

    async def _show_success(self):
        """Show success dialog."""
        if self.is_admin:
            message = "👑 Admin mode activated!\n\n• All Projects mode\n• Full management features"
        else:
            message = "🔓 License activated!\n\n• Management features enabled"

        await self.main_window.dialog(toga.InfoDialog("License Activated", message))

    async def _show_error(self):
        """Show error dialog."""
        await self.main_window.dialog(
            toga.ErrorDialog(
                "Invalid License",
                "The license key is not valid.\nPlease check and try again.",
            )
        )

    def log(self, message):
        """Add message to status log - newest at top."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        current = self.status_text.value or ""

        # Prepend new log at top (reverse order for visibility)
        new_text = f"[{timestamp}] {message}\n{current}"

        # Limit to last 500 lines to avoid memory issues
        lines = new_text.split("\n")
        if len(lines) > 500:
            lines = lines[:500]
            new_text = "\n".join(lines)

        self.status_text.value = new_text

        # Force scroll to top by setting cursor to beginning
        try:
            self.status_text.selection = (0, 0)
        except Exception:
            pass

    def clear_log(self, widget):
        """Clear the status log."""
        self.status_text.value = ""

    def open_user_guide(self, widget):
        """Open user guide URL in browser."""
        guide_url = "https://docs.google.com/document/d/14PSsjMS56L5dXaVctZ6f7u5VMQOvILyHKdNq8zdlazg/edit?usp=sharing"
        webbrowser.open(guide_url)

    def clear_from_date(self, widget):
        """Clear the from date field."""
        self.from_date.value = ""

    def clear_to_date(self, widget):
        """Clear the to date field."""
        self.to_date.value = ""

    def _convert_date_format(self, date_str: str) -> str:
        """Convert dd/MM/yyyy to YYYY-MM-DD format for converter."""
        if not date_str:
            return date_str
        # Try to parse dd/MM/yyyy format
        try:
            parts = date_str.split("/")
            if len(parts) == 3:
                day, month, year = parts
                return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        except Exception:
            pass
        # Return as-is if not in expected format (let dateparser handle it)
        return date_str

    async def select_input(self, widget):
        """Select input file or directory."""
        try:
            mode = self.mode_selection.value
            if mode == "Single File":
                path = await self.main_window.open_file_dialog(
                    title="Select JSONL file",
                    file_types=["jsonl"],
                )
            else:
                path = await self.main_window.dialog(
                    toga.SelectFolderDialog(title="Select directory")
                )

            if path:
                self.input_path.value = str(path)
                self.log(f"Selected: {path}")
        except Exception as e:
            self.log(f"Error selecting input: {e}")

    async def select_output(self, widget):
        """Select output location (file or directory depending on mode)."""
        try:
            mode = self.mode_selection.value

            if mode == "Single File":
                # For single file, select output HTML file
                path = await self.main_window.save_file_dialog(
                    title="Save HTML file as",
                    suggested_filename="combined_transcripts.html",
                    file_types=["html"],
                )
            else:
                # For directory or all projects, select output directory
                path = await self.main_window.dialog(
                    toga.SelectFolderDialog(title="Select output directory")
                )

            if path:
                self.output_path.value = str(path)
                self.log(f"Output: {path}")
        except Exception as e:
            self.log(f"Error selecting output: {e}")

    def run_conversion_worker(
        self, cmd_args, open_in_browser, log_queue, selected_projects=None
    ):
        """Worker thread that runs conversion and puts logs in queue."""
        try:
            # Parse command line args
            input_path = None
            output_path = None
            from_date = None
            to_date = None
            all_projects = False
            no_individual = False
            clear_cache = False

            i = 0
            while i < len(cmd_args):
                arg = cmd_args[i]
                if arg == "--all-projects":
                    all_projects = True
                elif arg == "--no-individual-sessions":
                    no_individual = True
                elif arg == "--clear-cache":
                    clear_cache = True
                elif arg == "--output" and i + 1 < len(cmd_args):
                    output_path = cmd_args[i + 1]
                    i += 1
                elif arg == "--from-date" and i + 1 < len(cmd_args):
                    from_date = cmd_args[i + 1]
                    i += 1
                elif arg == "--to-date" and i + 1 < len(cmd_args):
                    to_date = cmd_args[i + 1]
                    i += 1
                elif not arg.startswith("--"):
                    input_path = arg
                i += 1

            # Import converter functions
            from claudecodelog.claude_code_log.converter import (
                convert_jsonl_to_html,
                process_projects_hierarchy,
                process_selected_projects,
            )
            from pathlib import Path
            import click
            import sys

            # Custom stdout/stderr that redirects to queue
            class QueueWriter:
                def write(self, message):
                    message = message.strip()
                    if message:
                        log_queue.put(("log", message))

                def flush(self):
                    pass

            # Save originals
            original_stdout = sys.stdout
            original_stderr = sys.stderr
            original_echo = click.echo

            # Custom echo function that puts logs in queue
            def custom_echo(message=None, **kwargs):
                if message:
                    log_queue.put(("log", str(message)))

            # Redirect stdout/stderr and click.echo
            sys.stdout = QueueWriter()
            sys.stderr = QueueWriter()
            click.echo = custom_echo

            try:
                # Run conversion
                result_path = None

                if all_projects:
                    # Check if we have selected projects
                    if selected_projects:
                        log_queue.put(
                            (
                                "log",
                                f"Processing {len(selected_projects)} selected projects...",
                            )
                        )
                        result_path = process_selected_projects(
                            selected_project_dirs=selected_projects,
                            from_date=from_date,
                            to_date=to_date,
                            use_cache=not clear_cache,  # Invert logic
                            generate_individual_sessions=not no_individual,
                            output_dir=Path(output_path) if output_path else None,
                        )
                    else:
                        log_queue.put(("log", "Processing all projects..."))
                        projects_path = Path.home() / ".claude" / "projects"
                        result_path = process_projects_hierarchy(
                            projects_path=projects_path,
                            from_date=from_date,
                            to_date=to_date,
                            use_cache=not clear_cache,  # Invert logic
                            generate_individual_sessions=not no_individual,
                            output_dir=Path(output_path) if output_path else None,
                        )
                    log_queue.put(("log", f"Generated index at: {result_path}"))
                else:
                    log_queue.put(("log", f"Converting: {input_path}"))
                    input_file = Path(input_path)

                    # Check if directory contains subdirectories with JSONL (multi-project)
                    # or JSONL files directly (single project)
                    is_multi_project = False
                    if input_file.is_dir():
                        # Check for subdirectories containing JSONL files
                        for subdir in input_file.iterdir():
                            if subdir.is_dir():
                                jsonl_files = list(subdir.glob("*.jsonl"))
                                if jsonl_files:
                                    is_multi_project = True
                                    break

                    if is_multi_project:
                        # Multi-project directory - use process_projects_hierarchy
                        log_queue.put(
                            (
                                "log",
                                "Detected multi-project directory, processing all projects...",
                            )
                        )
                        result_path = process_projects_hierarchy(
                            projects_path=input_file,
                            from_date=from_date,
                            to_date=to_date,
                            use_cache=not clear_cache,
                            generate_individual_sessions=not no_individual,
                            output_dir=Path(output_path) if output_path else None,
                        )
                        log_queue.put(("log", f"Generated index at: {result_path}"))
                    else:
                        # Single project or file
                        result_path = convert_jsonl_to_html(
                            input_file,
                            output_path=Path(output_path) if output_path else None,
                            from_date=from_date,
                            to_date=to_date,
                            use_cache=not clear_cache,
                            generate_individual_sessions=not no_individual,
                        )
                        log_queue.put(
                            ("log", f"Successfully converted to: {result_path}")
                        )
            finally:
                # Restore original stdout/stderr/echo
                sys.stdout = original_stdout
                sys.stderr = original_stderr
                click.echo = original_echo

            log_queue.put(("success", result_path, open_in_browser))

        except Exception as e:
            import traceback

            log_queue.put(("error", str(e), traceback.format_exc()))

    async def run_conversion_async(
        self, cmd_args, open_in_browser, selected_projects=None
    ):
        """Run conversion in thread and monitor log queue."""
        log_queue = queue.Queue()

        # Start worker thread
        worker = threading.Thread(
            target=self.run_conversion_worker,
            args=(cmd_args, open_in_browser, log_queue, selected_projects),
            daemon=True,
        )
        worker.start()

        # Monitor queue and update UI
        try:
            while True:
                try:
                    # Check queue non-blocking
                    msg = log_queue.get(timeout=0.1)

                    if msg[0] == "log":
                        self.log(msg[1])
                    elif msg[0] == "success":
                        result_path, should_open = msg[1], msg[2]
                        self.log("✅ Conversion completed successfully!")
                        if result_path and should_open:
                            self.log(f"Opening in browser: {result_path}")
                            webbrowser.open(f"file://{result_path}")
                        break
                    elif msg[0] == "error":
                        self.log(f"❌ Fatal error: {msg[1]}")
                        self.log(msg[2])
                        break

                except queue.Empty:
                    # Allow UI updates while waiting
                    await asyncio.sleep(0.1)

        finally:
            # Re-enable convert button
            self.convert_btn.enabled = True
            self.convert_btn.text = "Convert"
            worker.join(timeout=1)

    async def convert_files(self, widget):
        """Convert files based on settings."""
        try:
            mode = self.mode_selection.value
            input_val = self.input_path.value

            if not input_val and mode != "All Projects":
                await self.main_window.dialog(
                    toga.InfoDialog(
                        "Input Required", "Please select an input file or directory."
                    )
                )
                return

            # Collect selected projects if in "All Projects" mode
            selected_projects = None
            if mode == "All Projects":
                # Get checked projects
                selected_projects = [
                    cb.project_data["path"]
                    for cb in self.project_checkboxes
                    if cb.value
                ]

                if not selected_projects:
                    await self.main_window.dialog(
                        toga.InfoDialog(
                            "No Projects Selected",
                            "Please select at least one project to convert.",
                        )
                    )
                    return

                self.log(f"Selected {len(selected_projects)} projects to convert")

            self.log("Starting conversion...")

            # Prepare parameters
            output = self.output_path.value if self.output_path.value else None

            # Get date values and convert dd/MM/yyyy to YYYY-MM-DD for converter
            from_date = None
            to_date = None
            if self.from_date.value and self.from_date.value.strip():
                from_date = self._convert_date_format(self.from_date.value.strip())
            if self.to_date.value and self.to_date.value.strip():
                to_date = self._convert_date_format(self.to_date.value.strip())

            # Build command line args
            args = []
            if input_val:
                args.append(input_val)

            params = {
                "--output": output if output else None,
                "--from-date": from_date if from_date else None,
                "--to-date": to_date if to_date else None,
            }

            flags = []

            if mode == "All Projects":
                flags.append("--all-projects")

            if self.no_individual.value:
                flags.append("--no-individual-sessions")

            if self.clear_cache.value:
                flags.append("--clear-cache")

            cmd_args = args.copy()
            cmd_args.extend(flags)

            for key, value in params.items():
                if value is not None:
                    cmd_args.extend([key, str(value)])

            self.log(f"Running: claude-code-log {' '.join(cmd_args)}")

            # Disable convert button and change text
            self.convert_btn.enabled = False
            self.convert_btn.text = "Converting..."

            # Run async to avoid UI freeze
            asyncio.create_task(
                self.run_conversion_async(
                    cmd_args, self.open_browser.value, selected_projects
                )
            )

        except Exception as e:
            self.log(f"❌ Error: {e}")
            # Re-enable button on error
            self.convert_btn.enabled = True
            self.convert_btn.text = "Convert"
            await self.main_window.dialog(
                toga.ErrorDialog("Conversion Failed", f"An error occurred:\n\n{e}")
            )

    def show_upload_dialog(self, widget):
        """Show upload to Google Drive dialog."""
        # Create upload window
        upload_window = toga.Window(title="☁️ Upload to Google Drive", size=(450, 320))

        content = toga.Box(style=Pack(direction=COLUMN, margin=20))

        # Folder ID section
        folder_label = toga.Label(
            "Google Drive Folder ID:",
            style=Pack(margin_bottom=5, font_weight="bold"),
        )
        content.add(folder_label)

        # Load saved folder ID
        saved_folder_id = load_drive_folder_id()

        # Container for folder ID display/edit
        self._folder_box = toga.Box(style=Pack(direction=COLUMN, margin_bottom=10))

        if saved_folder_id:
            # Show saved folder ID with edit button
            self._folder_display_box = toga.Box(
                style=Pack(direction=ROW, margin_bottom=5)
            )

            self._folder_id_label = toga.Label(
                f"📁 {saved_folder_id[:20]}...{saved_folder_id[-10:]}"
                if len(saved_folder_id) > 35
                else f"📁 {saved_folder_id}",
                style=Pack(flex=1),
            )
            self._folder_display_box.add(self._folder_id_label)

            self._edit_folder_btn = toga.Button(
                "✏️ Edit",
                on_press=lambda w: self._show_folder_input(upload_window),
                style=Pack(width=70),
            )
            self._folder_display_box.add(self._edit_folder_btn)

            self._folder_box.add(self._folder_display_box)

            # Hidden input (will show when edit is clicked)
            self._folder_id_input = toga.TextInput(
                value=saved_folder_id,
                style=Pack(width=400),
            )
            self._folder_input_box = toga.Box(
                style=Pack(direction=ROW, margin_bottom=5)
            )
            self._folder_input_box.add(self._folder_id_input)

            self._save_folder_btn = toga.Button(
                "💾 Save",
                on_press=lambda w: self._save_and_show_folder(upload_window),
                style=Pack(width=70, margin_left=5),
            )
            self._folder_input_box.add(self._save_folder_btn)
            # Don't add input box yet - it's hidden

            self._is_editing_folder = False
        else:
            # No saved folder ID - show input directly
            self._folder_id_input = toga.TextInput(
                placeholder="Paste folder ID từ URL thư mục Drive",
                style=Pack(margin_bottom=5, width=330),
                on_change=self._on_folder_id_change,
            )

            self._folder_input_box = toga.Box(
                style=Pack(direction=ROW, margin_bottom=5)
            )
            self._folder_input_box.add(self._folder_id_input)

            self._save_folder_btn = toga.Button(
                "💾 Save",
                on_press=lambda w: self._save_folder_id_now(),
                style=Pack(width=70, margin_left=5),
            )
            self._folder_input_box.add(self._save_folder_btn)

            self._folder_box.add(self._folder_input_box)
            self._is_editing_folder = True
            self._folder_display_box = None

        content.add(self._folder_box)

        hint_label = toga.Label(
            "Lấy từ URL: drive.google.com/drive/folders/[FOLDER_ID]",
            style=Pack(margin_bottom=15, font_size=10),
        )
        content.add(hint_label)

        # Show what will be uploaded based on license and mode
        mode = self.mode_selection.value
        if self.has_license and mode == "All Projects":
            # Get selected projects
            selected = [cb for cb in self.project_checkboxes if cb.value]
            if selected:
                info_text = f"📦 Upload {len(selected)} project(s) đã chọn (nén ZIP)"
            else:
                info_text = "⚠️ Chưa chọn project nào - sẽ upload toàn bộ"
        else:
            info_text = "📦 Upload toàn bộ HTML files (nén ZIP)"

        info_label = toga.Label(
            info_text,
            style=Pack(margin_bottom=15),
        )
        content.add(info_label)

        # Status label
        self._upload_status = toga.Label(
            "",
            style=Pack(margin_bottom=10),
        )
        content.add(self._upload_status)

        # Progress
        self._upload_progress = toga.ProgressBar(
            max=100,
            value=0,
            style=Pack(margin_bottom=15, width=400),
        )
        content.add(self._upload_progress)

        # Buttons
        btn_box = toga.Box(style=Pack(direction=ROW))

        cancel_btn = toga.Button(
            "Cancel",
            on_press=lambda w: upload_window.close(),
            style=Pack(margin_right=10, flex=1),
        )
        btn_box.add(cancel_btn)

        self._upload_start_btn = toga.Button(
            "🚀 Upload ZIP",
            on_press=lambda w: asyncio.create_task(self._start_upload(upload_window)),
            style=Pack(flex=1),
        )
        btn_box.add(self._upload_start_btn)

        content.add(btn_box)

        upload_window.content = content
        upload_window.show()

    def _on_folder_id_change(self, widget):
        """Auto-save folder ID when changed."""
        folder_id = widget.value.strip()
        if folder_id and len(folder_id) > 10:
            save_drive_folder_id(folder_id)

    def _save_folder_id_now(self):
        """Save folder ID immediately."""
        folder_id = self._folder_id_input.value.strip()
        if folder_id:
            if save_drive_folder_id(folder_id):
                self.log(f"✅ Saved folder ID: {folder_id[:20]}...")
                # Update status in upload dialog if available
                if hasattr(self, "_upload_status") and self._upload_status:
                    self._upload_status.text = "✅ Folder ID saved successfully!"
                # Update button to show saved
                if hasattr(self, "_save_folder_btn"):
                    self._save_folder_btn.text = "✅ Saved"
                    # Reset after 2 seconds
                    asyncio.create_task(self._reset_save_btn())
            else:
                self.log("❌ Failed to save folder ID")
                if hasattr(self, "_upload_status") and self._upload_status:
                    self._upload_status.text = "❌ Failed to save folder ID"
        else:
            self.log("⚠️ Please enter a folder ID")

    async def _reset_save_btn(self):
        """Reset save button text after delay."""
        await asyncio.sleep(2)
        if hasattr(self, "_save_folder_btn") and self._save_folder_btn:
            self._save_folder_btn.text = "💾 Save"

    def _show_folder_input(self, upload_window):
        """Show folder ID input for editing."""
        if self._folder_display_box:
            try:
                self._folder_box.remove(self._folder_display_box)
            except ValueError:
                pass
        self._folder_box.add(self._folder_input_box)
        self._is_editing_folder = True

    def _save_and_show_folder(self, upload_window):
        """Save folder ID and show display mode."""
        folder_id = self._folder_id_input.value.strip()
        if folder_id:
            if save_drive_folder_id(folder_id):
                self.log(f"✅ Saved folder ID: {folder_id[:20]}...")
                if hasattr(self, "_upload_status") and self._upload_status:
                    self._upload_status.text = "✅ Folder ID saved!"
            else:
                self.log("❌ Failed to save folder ID")
                return

            # Update label
            if self._folder_display_box:
                self._folder_id_label.text = (
                    f"📁 {folder_id[:20]}...{folder_id[-10:]}"
                    if len(folder_id) > 35
                    else f"📁 {folder_id}"
                )

                # Switch back to display mode
                try:
                    self._folder_box.remove(self._folder_input_box)
                except ValueError:
                    pass
                self._folder_box.add(self._folder_display_box)
                self._is_editing_folder = False

    async def _start_upload(self, upload_window):
        """Start uploading HTML files to Google Drive as ZIP."""
        folder_id = self._folder_id_input.value.strip()

        if not folder_id:
            self._upload_status.text = "❌ Vui lòng nhập Folder ID"
            return

        # Save folder ID for next time
        save_drive_folder_id(folder_id)

        self._upload_start_btn.enabled = False
        self._upload_progress.value = 5

        # Step 1: Run Convert first to generate fresh HTML files
        self._upload_status.text = "🔄 Đang convert JSONL → HTML..."
        self.log("🔄 Running Convert before Upload...")

        projects_path = Path.home() / ".claude" / "projects"

        try:
            from claudecodelog.claude_code_log.converter import (
                process_projects_hierarchy,
                process_selected_projects,
            )

            # Determine which projects to convert
            selected_projects = None
            mode = self.mode_selection.value
            if self.has_license and mode == "All Projects":
                selected = [cb for cb in self.project_checkboxes if cb.value]
                if selected:
                    selected_projects = [cb.project_data["path"] for cb in selected]
                    self._upload_status.text = (
                        f"🔄 Converting {len(selected_projects)} projects..."
                    )
                    self.log(
                        f"🔄 Converting {len(selected_projects)} selected projects..."
                    )

            # Run conversion in thread to not block UI
            convert_done = False
            convert_error = None

            def do_convert():
                nonlocal convert_done, convert_error
                try:
                    if selected_projects:
                        process_selected_projects(
                            selected_project_dirs=selected_projects,
                            use_cache=True,
                            generate_individual_sessions=True,
                        )
                    else:
                        process_projects_hierarchy(
                            projects_path=projects_path,
                            use_cache=True,
                            generate_individual_sessions=True,
                        )
                except Exception as e:
                    convert_error = str(e)
                convert_done = True

            # Start convert in background
            convert_thread = threading.Thread(target=do_convert, daemon=True)
            convert_thread.start()

            # Animate progress while converting
            progress = 5
            while not convert_done and progress < 25:
                await asyncio.sleep(0.3)
                progress += 1
                self._upload_progress.value = progress

            convert_thread.join(timeout=300)

            if convert_error:
                self._upload_status.text = f"❌ Lỗi convert: {convert_error}"
                self._upload_start_btn.enabled = True
                return

            self.log("✅ Convert complete!")

        except Exception as e:
            self._upload_status.text = f"❌ Lỗi convert: {e}"
            self._upload_start_btn.enabled = True
            return

        self._upload_progress.value = 30

        # Step 2: Collect HTML files
        self._upload_status.text = "📂 Thu thập HTML files..."
        html_files = []

        if self.has_license and mode == "All Projects":
            selected = [cb for cb in self.project_checkboxes if cb.value]
            if selected:
                for cb in selected:
                    project_path = cb.project_data["path"]
                    project_html = list(project_path.glob("*.html"))
                    html_files.extend(project_html)
                self.log(
                    f"📂 Collected {len(html_files)} HTML files from {len(selected)} projects"
                )
            else:
                html_files = list(projects_path.rglob("*.html"))
                self.log(f"📂 Collected all {len(html_files)} HTML files")
        else:
            html_files = list(projects_path.rglob("*.html"))
            self.log(f"📂 Collected all {len(html_files)} HTML files")

        if not html_files:
            self._upload_status.text = "❌ Không tìm thấy file HTML nào"
            self._upload_start_btn.enabled = True
            return

        self._upload_progress.value = 40

        # Create ZIP file
        self._upload_status.text = f"Đang nén {len(html_files)} files thành ZIP..."
        self.log(f"📦 Creating ZIP with {len(html_files)} files...")

        try:
            zip_bytes = create_zip_from_files(html_files, projects_path)
            zip_size_mb = len(zip_bytes) / (1024 * 1024)
            self.log(f"📦 ZIP created: {zip_size_mb:.2f} MB")
        except Exception as e:
            self._upload_status.text = f"❌ Lỗi tạo ZIP: {e}"
            self._upload_start_btn.enabled = True
            return

        self._upload_progress.value = 50

        # Upload ZIP file
        date_folder = datetime.now().strftime("%Y-%m-%d")
        zip_name = f"claude_logs_{date_folder}.zip"

        self._upload_status.text = f"Đang upload {zip_name} ({zip_size_mb:.1f} MB)..."
        self.log(f"📤 Uploading {zip_name} to Drive/{date_folder}/")

        try:
            # Encode ZIP as base64
            zip_base64 = base64.b64encode(zip_bytes).decode("utf-8")

            self._upload_progress.value = 60

            # Start animated progress during upload
            upload_done = False
            upload_result = {"success": False, "error": "Timeout"}

            async def animate_progress():
                """Animate progress bar while uploading."""
                progress = 60
                while not upload_done and progress < 95:
                    await asyncio.sleep(0.3)
                    progress += 1
                    self._upload_progress.value = progress

            def do_upload():
                """Run upload in thread."""
                nonlocal upload_done, upload_result
                upload_result = upload_to_drive(
                    folder_id, zip_name, zip_base64, date_folder, is_base64=True
                )
                upload_done = True

            # Start upload in background thread
            upload_thread = threading.Thread(target=do_upload, daemon=True)
            upload_thread.start()

            # Animate progress while waiting
            await animate_progress()

            # Wait for upload to complete
            upload_thread.join(timeout=120)

            self._upload_progress.value = 100
            result = upload_result

            if result.get("success"):
                self._upload_status.text = f"✅ Upload thành công: {zip_name}"
                self.log(f"✅ Upload complete: {zip_name}")

                # Ask to open folder
                should_open = await self.main_window.dialog(
                    toga.QuestionDialog(
                        "Upload Complete",
                        f"Đã upload {zip_name} vào thư mục {date_folder}.\n\nMở Google Drive?",
                    )
                )
                if should_open:
                    webbrowser.open(
                        f"https://drive.google.com/drive/folders/{folder_id}"
                    )

                upload_window.close()
            else:
                error_msg = result.get("error", "Unknown error")
                self._upload_status.text = f"❌ Lỗi upload: {error_msg}"
                self.log(f"❌ Upload failed: {error_msg}")

        except Exception as e:
            self._upload_status.text = f"❌ Lỗi: {e}"
            self.log(f"❌ Upload error: {e}")

        self._upload_start_btn.enabled = True

    # ===== Team Report Functions =====

    def show_team_report_dialog(self, widget):
        """Show team report dialog with folder tree and checkboxes."""
        if not self.is_admin:
            self.log("❌ Team Report requires admin access")
            return

        # Create team report window
        self._team_window = toga.Window(title="📊 Team Analytics Report", size=(700, 600))

        content = toga.Box(style=Pack(direction=COLUMN, margin=15))

        # Title
        title = toga.Label(
            "Team Analytics Report",
            style=Pack(font_size=16, font_weight="bold", margin_bottom=10),
        )
        content.add(title)

        # Step 1: Select root folder
        step1_box = toga.Box(style=Pack(direction=COLUMN, margin_bottom=10))
        step1_label = toga.Label(
            "1️⃣ Chọn thư mục gốc (chứa các phòng ban):",
            style=Pack(font_weight="bold", margin_bottom=5),
        )
        step1_box.add(step1_label)

        folder_row = toga.Box(style=Pack(direction=ROW, margin_bottom=10))
        self._team_root_path = toga.TextInput(
            placeholder="Chọn thư mục chứa dữ liệu team...",
            style=Pack(flex=1, margin_right=5),
        )
        folder_row.add(self._team_root_path)

        browse_btn = toga.Button(
            "Browse",
            on_press=self._browse_team_root,
            style=Pack(width=80),
        )
        folder_row.add(browse_btn)

        load_btn = toga.Button(
            "Load",
            on_press=self._load_team_folders,
            style=Pack(width=80, margin_left=5),
        )
        folder_row.add(load_btn)

        step1_box.add(folder_row)
        content.add(step1_box)

        # Step 2: Department list (phòng ban)
        step2_box = toga.Box(style=Pack(direction=COLUMN, margin_bottom=10))
        step2_label = toga.Label(
            "2️⃣ Chọn phòng ban:",
            style=Pack(font_weight="bold", margin_bottom=5),
        )
        step2_box.add(step2_label)

        self._dept_selection = toga.Selection(
            items=["-- Chọn phòng ban --"],
            on_change=self._on_dept_selected,
            style=Pack(flex=1, margin_bottom=5),
        )
        step2_box.add(self._dept_selection)
        content.add(step2_box)

        # Step 3: Member list with checkboxes (using Table with selection)
        step3_box = toga.Box(style=Pack(direction=COLUMN, flex=1))
        step3_header = toga.Box(style=Pack(direction=ROW, margin_bottom=5))
        step3_label = toga.Label(
            "3️⃣ Chọn thành viên để phân tích:",
            style=Pack(font_weight="bold", flex=1),
        )
        step3_header.add(step3_label)

        select_all_btn = toga.Button(
            "Chọn tất cả",
            on_press=self._select_all_members,
            style=Pack(width=100, margin_right=5),
        )
        step3_header.add(select_all_btn)

        deselect_all_btn = toga.Button(
            "Bỏ chọn tất cả",
            on_press=self._deselect_all_members,
            style=Pack(width=110),
        )
        step3_header.add(deselect_all_btn)

        step3_box.add(step3_header)

        # Member table with multi-selection
        self._member_table = toga.Table(
            headings=["✓", "Thành viên", "Số project", "Số file"],
            data=[],
            multiple_select=True,
            style=Pack(flex=1),
        )
        step3_box.add(self._member_table)
        content.add(step3_box)

        # Step 4: Output options
        step4_box = toga.Box(style=Pack(direction=COLUMN, margin_top=10))
        step4_label = toga.Label(
            "4️⃣ Thư mục xuất báo cáo:",
            style=Pack(font_weight="bold", margin_bottom=5),
        )
        step4_box.add(step4_label)

        output_row = toga.Box(style=Pack(direction=ROW, margin_bottom=10))
        self._team_output_path = toga.TextInput(
            placeholder="Để trống sẽ lưu vào thư mục gốc",
            style=Pack(flex=1, margin_right=5),
        )
        output_row.add(self._team_output_path)

        output_browse_btn = toga.Button(
            "Browse",
            on_press=self._browse_team_output,
            style=Pack(width=80),
        )
        output_row.add(output_browse_btn)

        step4_box.add(output_row)
        content.add(step4_box)

        # Status and buttons
        status_box = toga.Box(style=Pack(direction=COLUMN, margin_top=10))

        self._team_report_status = toga.Label(
            "Sẵn sàng - Chọn thư mục và thành viên để phân tích",
            style=Pack(margin_bottom=10),
        )
        status_box.add(self._team_report_status)

        button_box = toga.Box(style=Pack(direction=ROW))

        self._generate_report_btn = toga.Button(
            "📊 Phân tích & Tạo báo cáo",
            on_press=self._generate_team_report,
            style=Pack(flex=1, margin_right=10),
        )
        button_box.add(self._generate_report_btn)

        cancel_btn = toga.Button(
            "Đóng",
            on_press=lambda w: self._team_window.close(),
            style=Pack(width=100),
        )
        button_box.add(cancel_btn)

        status_box.add(button_box)
        content.add(status_box)

        # Initialize data storage
        self._team_departments = []  # List of department folders
        self._team_members = []  # List of member data for current dept
        self._selected_members = set()  # Selected member paths

        self._team_window.content = content
        self._team_window.show()

    def _browse_team_root(self, widget):
        """Browse for team root folder."""
        asyncio.create_task(self._browse_team_root_async())

    async def _browse_team_root_async(self):
        """Browse for team root folder asynchronously."""
        try:
            folder = await self._team_window.select_folder_dialog(
                "Chọn thư mục gốc chứa dữ liệu team"
            )
            if folder:
                self._team_root_path.value = str(folder)
        except Exception as e:
            self.log(f"Error selecting folder: {e}")

    def _load_team_folders(self, widget):
        """Load department folders from root path."""
        root_path_str = self._team_root_path.value.strip()
        if not root_path_str:
            self._team_report_status.text = "❌ Vui lòng chọn thư mục gốc"
            return

        root_path = Path(root_path_str)
        if not root_path.exists():
            self._team_report_status.text = f"❌ Thư mục không tồn tại: {root_path}"
            return

        # Scan for department folders (direct subfolders)
        self._team_departments = []
        try:
            for item in sorted(root_path.iterdir()):
                if item.is_dir() and not item.name.startswith('.'):
                    # Count subfolders/files
                    member_count = sum(1 for x in item.iterdir() if x.is_dir() and not x.name.startswith('.'))
                    self._team_departments.append({
                        "name": item.name,
                        "path": item,
                        "member_count": member_count,
                    })
        except Exception as e:
            self._team_report_status.text = f"❌ Lỗi đọc thư mục: {e}"
            return

        if not self._team_departments:
            self._team_report_status.text = "❌ Không tìm thấy phòng ban nào"
            return

        # Update department selection
        dept_items = ["-- Chọn phòng ban --"] + [
            f"{d['name']} ({d['member_count']} thành viên)"
            for d in self._team_departments
        ]
        self._dept_selection.items = dept_items

        self._team_report_status.text = f"✅ Tìm thấy {len(self._team_departments)} phòng ban"
        self.log(f"📁 Loaded {len(self._team_departments)} departments from {root_path}")

    def _on_dept_selected(self, widget):
        """Handle department selection change."""
        selected_idx = self._dept_selection.items.index(self._dept_selection.value) if self._dept_selection.value else 0

        if selected_idx == 0:  # "-- Chọn phòng ban --"
            self._member_table.data = []
            self._team_members = []
            return

        dept = self._team_departments[selected_idx - 1]
        self._load_members_for_dept(dept)

    def _load_members_for_dept(self, dept):
        """Load members for selected department."""
        self._team_members = []
        dept_path = dept["path"]

        try:
            for item in sorted(dept_path.iterdir()):
                if item.is_dir() and not item.name.startswith('.'):
                    # Count projects and files
                    project_count = 0
                    file_count = 0

                    # Look for projects subfolder or direct JSONL files
                    projects_dir = item / "projects"
                    if projects_dir.exists():
                        for proj in projects_dir.iterdir():
                            if proj.is_dir():
                                project_count += 1
                                file_count += sum(1 for f in proj.glob("*.jsonl"))
                    else:
                        # Check for direct JSONL files
                        file_count = sum(1 for f in item.rglob("*.jsonl"))

                    self._team_members.append({
                        "name": item.name,
                        "path": item,
                        "project_count": project_count,
                        "file_count": file_count,
                        "selected": True,  # Selected by default
                    })
        except Exception as e:
            self._team_report_status.text = f"❌ Lỗi đọc thành viên: {e}"
            return

        # Update table
        table_data = []
        for m in self._team_members:
            table_data.append((
                "✓" if m["selected"] else "",
                m["name"],
                str(m["project_count"]),
                str(m["file_count"]),
            ))

        self._member_table.data = table_data
        self._team_report_status.text = f"📋 {len(self._team_members)} thành viên trong phòng {dept['name']}"

    def _select_all_members(self, widget):
        """Select all members."""
        for m in self._team_members:
            m["selected"] = True
        self._refresh_member_table()

    def _deselect_all_members(self, widget):
        """Deselect all members."""
        for m in self._team_members:
            m["selected"] = False
        self._refresh_member_table()

    def _refresh_member_table(self):
        """Refresh member table with current selection state."""
        table_data = []
        for m in self._team_members:
            table_data.append((
                "✓" if m["selected"] else "",
                m["name"],
                str(m["project_count"]),
                str(m["file_count"]),
            ))
        self._member_table.data = table_data

    def _browse_team_output(self, widget):
        """Browse for output folder."""
        asyncio.create_task(self._browse_team_output_async())

    async def _browse_team_output_async(self):
        """Browse for output folder asynchronously."""
        try:
            folder = await self._team_window.select_folder_dialog(
                "Chọn thư mục xuất báo cáo"
            )
            if folder:
                self._team_output_path.value = str(folder)
        except Exception as e:
            self.log(f"Error selecting folder: {e}")

    def _generate_team_report(self, widget):
        """Generate team analytics report for selected members."""
        # Get selected members from table selection
        selected_rows = self._member_table.selection
        if selected_rows:
            # Update selection based on table selection
            selected_names = set()
            for row in selected_rows:
                if len(row) >= 2:
                    selected_names.add(row[1])  # Member name is in column 1

            for m in self._team_members:
                m["selected"] = m["name"] in selected_names
        else:
            # Use all members marked as selected
            pass

        selected_members = [m for m in self._team_members if m["selected"]]

        if not selected_members:
            self._team_report_status.text = "❌ Vui lòng chọn ít nhất 1 thành viên"
            return

        self._team_report_status.text = f"🔄 Đang phân tích {len(selected_members)} thành viên..."
        self._generate_report_btn.enabled = False

        asyncio.create_task(self._generate_team_report_async(selected_members))

    async def _generate_team_report_async(self, selected_members):
        """Generate team report asynchronously."""
        try:
            from .claude_code_log.team_analytics import (
                TeamAnalyticsManager,
                generate_dashboard_html,
                MemberStats,
                TeamAnalytics,
            )

            root_path_str = self._team_root_path.value.strip()
            output_path_str = self._team_output_path.value.strip()

            root_path = Path(root_path_str)

            # Determine output directory
            if output_path_str:
                output_dir = Path(output_path_str)
            else:
                output_dir = root_path

            output_dir.mkdir(parents=True, exist_ok=True)

            self.log(f"📊 Analyzing {len(selected_members)} members...")

            # Create custom analytics by analyzing only selected members
            manager = TeamAnalyticsManager(root_path, role="super_admin")

            # Analyze each selected member
            all_members = {}
            total_projects = 0
            total_sessions = 0
            total_messages = 0
            total_input_tokens = 0
            total_output_tokens = 0
            earliest_ts = None
            latest_ts = None

            for idx, member_info in enumerate(selected_members):
                member_path = member_info["path"]
                member_name = member_info["name"]

                self._team_report_status.text = f"🔄 Phân tích {member_name}... ({idx+1}/{len(selected_members)})"

                # Analyze this member
                stats = manager.analyze_member(member_name)
                if stats:
                    all_members[member_name] = stats
                    total_projects += stats.project_count
                    total_sessions += stats.total_sessions
                    total_messages += stats.total_messages
                    total_input_tokens += stats.total_input_tokens
                    total_output_tokens += stats.total_output_tokens

                    if stats.earliest_activity:
                        if earliest_ts is None or stats.earliest_activity < earliest_ts:
                            earliest_ts = stats.earliest_activity
                    if stats.latest_activity:
                        if latest_ts is None or stats.latest_activity > latest_ts:
                            latest_ts = stats.latest_activity

            if not all_members:
                self._team_report_status.text = "❌ Không có dữ liệu để phân tích"
                self._generate_report_btn.enabled = True
                return

            # Create analytics object
            from datetime import datetime as dt
            analytics = TeamAnalytics(
                generated_at=dt.now().isoformat(),
                data_source=str(root_path),
                total_members=len(all_members),
                total_projects=total_projects,
                total_sessions=total_sessions,
                total_messages=total_messages,
                total_input_tokens=total_input_tokens,
                total_output_tokens=total_output_tokens,
                members=all_members,
                earliest_activity=earliest_ts,
                latest_activity=latest_ts,
            )

            # Calculate rankings
            sorted_by_messages = sorted(
                all_members.items(),
                key=lambda x: x[1].total_messages,
                reverse=True
            )
            analytics.productivity_ranking = [
                (member_id, rank + 1)
                for rank, (member_id, _) in enumerate(sorted_by_messages)
            ]

            sorted_by_tokens = sorted(
                all_members.items(),
                key=lambda x: x[1].total_input_tokens + x[1].total_output_tokens,
                reverse=True
            )
            analytics.token_usage_ranking = [
                (member_id, rank + 1)
                for rank, (member_id, _) in enumerate(sorted_by_tokens)
            ]

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            # Export CSV
            csv_path = output_dir / f"team_analytics_{timestamp}.csv"
            manager.export_to_csv(analytics, csv_path)
            self.log(f"Exported CSV: {csv_path.name}")

            # Export JSON
            json_path = output_dir / f"team_analytics_{timestamp}.json"
            manager.export_to_json(analytics, json_path)
            self.log(f"Exported JSON: {json_path.name}")

            # Generate HTML dashboard
            html_path = output_dir / f"team_dashboard_{timestamp}.html"
            generate_dashboard_html(analytics, html_path, csv_path, json_path)
            self.log(f"Generated dashboard: {html_path.name}")

            # Open in browser
            webbrowser.open(f"file://{html_path}")

            self._team_report_status.text = f"✅ Hoàn thành! Đã phân tích {len(all_members)} thành viên"
            self.log(f"✅ Team analytics complete! {len(all_members)} members analyzed.")

            self._team_window.close()

        except Exception as e:
            self._team_report_status.text = f"❌ Error: {e}"
            self.log(f"❌ Team report error: {e}")

        self._generate_report_btn.enabled = True


def main():
    """Create and return the application."""
    return ClaudeCodeLogApp(
        "Claude Code Log",
        "com.claudecode.log",
    )


if __name__ == "__main__":
    main().main_loop()
