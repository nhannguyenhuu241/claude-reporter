#!/usr/bin/env python3
"""Interactive Terminal User Interface for Claude Code Log - Desktop App Style."""

import os
import shutil
import tempfile
import webbrowser
import zipfile
from datetime import datetime
from pathlib import Path
from typing import ClassVar, Dict, List, Optional, cast

from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import Container, Horizontal, ScrollableContainer, Vertical, VerticalScroll
from textual.widgets import (
    Button,
    Checkbox,
    Footer,
    Header,
    Input,
    Label,
    ProgressBar,
    Static,
    Switch,
)
from textual.reactive import reactive

from .cache import CacheManager, SessionCacheData, get_library_version
from .converter import convert_jsonl_to_html, process_projects_hierarchy, process_selected_projects, ensure_fresh_cache
from .renderer import get_project_display_name


def get_default_projects_dir() -> Path:
    """Get the default Claude projects directory path."""
    return Path.home() / ".claude" / "projects"


def discover_projects_with_sessions(projects_dir: Path) -> List[dict]:
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

    for project_dir in sorted(projects_dir.iterdir()):
        if not project_dir.is_dir():
            continue

        if project_dir.name.startswith("."):
            continue

        jsonl_files = list(project_dir.glob("*.jsonl"))
        non_empty_files = [f for f in jsonl_files if f.stat().st_size > 0]

        if not non_empty_files:
            continue

        session_count = len(non_empty_files)
        message_count = 0
        last_modified = None

        try:
            cache_manager = CacheManager(project_dir, get_library_version())
            project_cache = cache_manager.get_cached_project_data()

            if project_cache and project_cache.sessions:
                non_empty_sessions = [
                    s for s in project_cache.sessions.values() if s.message_count > 0
                ]
                session_count = len(non_empty_sessions)
                message_count = sum(s.message_count for s in non_empty_sessions)

                if project_cache.latest_timestamp:
                    try:
                        dt = datetime.fromisoformat(
                            project_cache.latest_timestamp.replace("Z", "+00:00")
                        )
                        last_modified = dt.strftime("%Y-%m-%d %H:%M")
                    except Exception:
                        pass
        except Exception:
            pass

        if not last_modified and non_empty_files:
            latest_mtime = max(f.stat().st_mtime for f in non_empty_files)
            last_modified = datetime.fromtimestamp(latest_mtime).strftime("%Y-%m-%d %H:%M")

        projects.append({
            "path": project_dir,
            "name": project_dir.name,
            "session_count": session_count,
            "message_count": message_count,
            "last_modified": last_modified or "Unknown",
        })

    projects.sort(key=lambda p: p["last_modified"], reverse=True)
    return projects


class ClaudeCodeLogTUI(App[Optional[str]]):
    """Main TUI application styled like Desktop App."""

    CSS = """
    /* Main container */
    #main-container {
        padding: 1;
    }

    /* Title section */
    #title-section {
        height: auto;
        margin-bottom: 1;
    }

    #title-label {
        text-style: bold;
        color: $primary;
    }

    #subtitle-label {
        color: $text-muted;
    }

    /* Project selection */
    #projects-section {
        height: auto;
        max-height: 15;
        border: solid $primary;
        margin-bottom: 1;
        padding: 1;
    }

    #projects-header {
        height: auto;
        layout: horizontal;
        margin-bottom: 1;
    }

    #projects-label {
        width: 1fr;
        text-style: bold;
    }

    .header-button {
        width: auto;
        min-width: 12;
        margin-left: 1;
    }

    #projects-scroll {
        height: auto;
        max-height: 10;
    }

    .project-checkbox {
        margin: 0;
        padding: 0;
    }

    /* Output section */
    #output-section {
        height: auto;
        layout: horizontal;
        margin-bottom: 1;
    }

    #output-label {
        width: 12;
        margin-right: 1;
    }

    #output-path {
        width: 1fr;
        margin-right: 1;
    }

    #output-browse {
        width: 12;
    }

    /* Date filters section */
    #date-section {
        height: auto;
        layout: horizontal;
        margin-bottom: 1;
    }

    .date-label {
        width: 6;
        margin-right: 1;
    }

    .date-input {
        width: 14;
        margin-right: 2;
    }

    .date-clear {
        width: 3;
        margin-right: 2;
    }

    /* Options section */
    #options-section {
        height: auto;
        border: solid $secondary;
        padding: 1;
        margin-bottom: 1;
    }

    #options-label {
        text-style: bold;
        margin-bottom: 1;
    }

    .option-switch {
        margin: 0;
        padding: 0;
    }

    /* Status section */
    #status-section {
        height: auto;
        min-height: 8;
        border: solid $surface;
        padding: 1;
        margin-bottom: 1;
    }

    #status-label {
        text-style: bold;
        margin-bottom: 1;
    }

    #status-log {
        height: auto;
        min-height: 5;
        max-height: 10;
        overflow-y: auto;
        color: $text-muted;
    }

    #progress-bar {
        margin-top: 1;
    }

    /* Action buttons section */
    #action-section {
        height: auto;
        layout: horizontal;
        margin-top: 1;
    }

    #convert-btn {
        width: 1fr;
        margin-right: 1;
        min-width: 20;
    }

    #upload-btn {
        width: 1fr;
        margin-right: 1;
        min-width: 20;
    }

    #clear-btn {
        width: 15;
        min-width: 12;
    }
    """

    TITLE = "Claude Code Log"
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("q", "quit", "Quit"),
        Binding("enter", "convert", "Convert"),
        Binding("r", "refresh", "Refresh"),
        Binding("a", "select_all", "All"),
        Binding("d", "deselect_all", "None"),
        Binding("?", "toggle_help", "Help"),
    ]

    # Reactive state
    is_converting: reactive[bool] = reactive(False)

    def __init__(self, project_path: Optional[Path] = None):
        """Initialize the TUI."""
        super().__init__()
        self.theme = "gruvbox"
        self.project_path = project_path
        self.projects_dir = get_default_projects_dir()
        self.projects: List[dict] = []
        self.project_checkboxes: List[Checkbox] = []
        self.sessions: Dict[str, SessionCacheData] = {}
        self.selected_session_id: Optional[str] = None
        self.is_expanded: bool = False
        self.log_messages: List[str] = []

    def compose(self) -> ComposeResult:
        """Create the UI layout."""
        yield Header()

        with Vertical(id="main-container"):
            # Title section
            with Vertical(id="title-section"):
                yield Label("Claude Code Log Converter", id="title-label")
                yield Label("Convert Claude Code transcript JSONL files to HTML", id="subtitle-label")

            # Project selection (all projects selected by default)
            with Vertical(id="projects-section"):
                with Horizontal(id="projects-header"):
                    yield Label("Projects:", id="projects-label")
                    yield Button("Refresh", id="refresh-btn", classes="header-button")
                    yield Button("Select All", id="select-all-btn", classes="header-button")
                    yield Button("Deselect", id="deselect-btn", classes="header-button")

                with VerticalScroll(id="projects-scroll"):
                    yield Static("Loading projects...", id="projects-loading")

            # Output section
            with Horizontal(id="output-section"):
                yield Label("Output:", id="output-label")
                yield Input(placeholder="Optional output path (leave empty for default)", id="output-path")
                yield Button("Browse", id="output-browse")

            # Date filters section
            with Horizontal(id="date-section"):
                yield Label("From:", classes="date-label")
                yield Input(placeholder="dd/mm/yyyy", id="from-date", classes="date-input")
                yield Button("×", id="clear-from", classes="date-clear")
                yield Label("To:", classes="date-label")
                # Default to today
                today = datetime.now().strftime("%d/%m/%Y")
                yield Input(value=today, placeholder="dd/mm/yyyy", id="to-date", classes="date-input")
                yield Button("×", id="clear-to", classes="date-clear")

            # Options section
            with Vertical(id="options-section"):
                yield Label("Options:", id="options-label")
                yield Switch(value=True, id="opt-browser", classes="option-switch")
                yield Label("  Open in browser after conversion", id="opt-browser-label")
                yield Switch(value=False, id="opt-skip", classes="option-switch")
                yield Label("  Skip individual session files", id="opt-skip-label")
                yield Switch(value=False, id="opt-cache", classes="option-switch")
                yield Label("  Clear cache before processing", id="opt-cache-label")

            # Status section
            with Vertical(id="status-section"):
                yield Label("Status:", id="status-label")
                yield Static("Ready to convert", id="status-log")
                yield ProgressBar(id="progress-bar", total=100, show_eta=False)

            # Action buttons section
            with Horizontal(id="action-section"):
                yield Button("Convert", id="convert-btn", variant="primary")
                yield Button("Upload to Google", id="upload-btn", variant="success")
                yield Button("Clear Log", id="clear-btn")

        yield Footer()

    def on_mount(self) -> None:
        """Initialize the application when mounted."""
        # Delay loading to ensure screen is ready
        self.call_later(self._delayed_init)

    def _delayed_init(self) -> None:
        """Delayed initialization after screen is ready."""
        self._load_projects()

        # Set default input path
        if self.projects_dir.exists():
            try:
                self.query_one("#input-path", Input).value = str(self.projects_dir)
            except Exception:
                pass

    def _load_projects(self) -> None:
        """Load list of projects with sessions."""
        self.add_log("Discovering projects...")
        self.projects = discover_projects_with_sessions(self.projects_dir)
        self._populate_project_checkboxes()

    def _populate_project_checkboxes(self) -> None:
        """Populate the project checkboxes."""
        scroll = self.query_one("#projects-scroll", VerticalScroll)

        # Remove existing content
        try:
            loading = self.query_one("#projects-loading", Static)
            loading.remove()
        except Exception:
            pass

        # Remove old checkboxes
        for checkbox in self.project_checkboxes:
            try:
                checkbox.remove()
            except Exception:
                pass
        self.project_checkboxes = []

        if not self.projects:
            scroll.mount(Static("No projects with sessions found in ~/.claude/projects/", id="no-projects"))
            self.add_log("No projects with sessions found.")
            return

        # Create checkbox for each project (all selected by default)
        for project in self.projects:
            info_text = f"{project['name'][:40]} ({project['session_count']} sessions, {project['message_count']} msgs)"
            checkbox = Checkbox(info_text, value=True, classes="project-checkbox")  # Selected by default
            checkbox.project_data = project  # Store project data
            self.project_checkboxes.append(checkbox)
            scroll.mount(checkbox)

        self.add_log(f"Found {len(self.projects)} projects. All selected.")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        button_id = event.button.id

        if button_id == "convert-btn":
            self._do_convert()
        elif button_id == "clear-btn":
            self._clear_log()
        elif button_id == "refresh-btn":
            self.action_refresh()
        elif button_id == "select-all-btn":
            self.action_select_all()
        elif button_id == "deselect-btn":
            self.action_deselect_all()
        elif button_id == "clear-from":
            self.query_one("#from-date", Input).value = ""
        elif button_id == "clear-to":
            self.query_one("#to-date", Input).value = ""
        elif button_id == "output-browse":
            self.notify("Browse: Enter path manually or use Tab to navigate", timeout=3)
        elif button_id == "upload-btn":
            self._do_upload_to_google()

    def action_select_all(self) -> None:
        """Select all project checkboxes."""
        for checkbox in self.project_checkboxes:
            checkbox.value = True
        self.add_log(f"Selected all {len(self.project_checkboxes)} projects.")
        self.notify(f"Selected {len(self.project_checkboxes)} projects")

    def action_deselect_all(self) -> None:
        """Deselect all project checkboxes."""
        for checkbox in self.project_checkboxes:
            checkbox.value = False
        self.add_log("Deselected all projects.")
        self.notify("Deselected all projects")

    def action_refresh(self) -> None:
        """Refresh projects list."""
        self._load_projects()
        self.notify("Refreshed")

    def action_convert(self) -> None:
        """Start conversion (keyboard shortcut)."""
        self._do_convert()

    def _do_convert(self) -> None:
        """Start conversion."""
        if self.is_converting:
            self.notify("Conversion in progress...", severity="warning")
            return

        self.is_converting = True
        self._update_convert_button("Converting...")
        self.run_worker(self._convert_async(), exclusive=True)

    async def _convert_async(self) -> None:
        """Perform conversion in background."""
        try:
            progress = self.query_one("#progress-bar", ProgressBar)
            progress.update(progress=0)

            # Get options
            open_browser = self.query_one("#opt-browser", Switch).value
            skip_sessions = self.query_one("#opt-skip", Switch).value
            clear_cache = self.query_one("#opt-cache", Switch).value

            # Get date filters
            from_date = self.query_one("#from-date", Input).value.strip() or None
            to_date = self.query_one("#to-date", Input).value.strip() or None

            # Get output path
            output_path_str = self.query_one("#output-path", Input).value.strip()
            output_path = Path(output_path_str) if output_path_str else None

            # Get selected projects
            selected_projects = [
                cb.project_data["path"]
                for cb in self.project_checkboxes
                if cb.value and hasattr(cb, "project_data")
            ]

            if not selected_projects:
                self.add_log("Error: No projects selected!")
                self.notify("No projects selected!", severity="error")
                return

            self.add_log(f"Processing {len(selected_projects)} projects...")
            progress.update(progress=10)

            if clear_cache:
                self.add_log("Clearing cache...")
                for project in selected_projects:
                    try:
                        cache_manager = CacheManager(project, get_library_version())
                        cache_manager.clear_cache()
                    except Exception:
                        pass
                progress.update(progress=20)

            # Use process_selected_projects to create linked index.html
            self.add_log("Generating HTML files with index...")
            progress.update(progress=40)

            try:
                result_path = process_selected_projects(
                    selected_project_dirs=selected_projects,
                    from_date=from_date,
                    to_date=to_date,
                    use_cache=not clear_cache,
                    generate_individual_sessions=not skip_sessions,
                    output_dir=output_path,
                )
                progress.update(progress=90)

                if result_path:
                    self.add_log(f"Done! Output: {result_path}")
                    progress.update(progress=100)

                    if open_browser and result_path.exists():
                        webbrowser.open(f"file://{result_path}")

                    self.notify("Conversion complete!")
                else:
                    self.add_log("No output generated")
                    self.notify("No output generated", severity="warning")

            except Exception as e:
                self.add_log(f"Error: {e}")
                self.notify(f"Error: {e}", severity="error")

        except Exception as e:
            self.add_log(f"Error: {e}")
            self.notify(f"Error: {e}", severity="error")

        finally:
            self.is_converting = False
            self._update_convert_button("Convert")

    def _update_convert_button(self, text: str) -> None:
        """Update convert button text."""
        try:
            btn = self.query_one("#convert-btn", Button)
            btn.label = text
        except Exception:
            pass

    def add_log(self, message: str) -> None:
        """Add a message to the status log."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_line = f"[{timestamp}] {message}"
        self.log_messages.insert(0, log_line)  # Newest at top

        # Keep only last 100 messages
        self.log_messages = self.log_messages[:100]

        # Update display
        try:
            status_log = self.query_one("#status-log", Static)
            display_text = "\n".join(self.log_messages[:20])  # Show last 20
            status_log.update(display_text)
        except Exception:
            pass

    def _clear_log(self) -> None:
        """Clear the status log."""
        self.log_messages = []
        try:
            self.query_one("#status-log", Static).update("Log cleared")
        except Exception:
            pass
        self.notify("Log cleared")

    def _do_upload_to_google(self) -> None:
        """Create zip file and upload to Google Drive."""
        self.run_worker(self._upload_to_google_async(), exclusive=True)

    async def _upload_to_google_async(self) -> None:
        """Create zip and open Google Drive upload page."""
        try:
            progress = self.query_one("#progress-bar", ProgressBar)
            progress.update(progress=0)

            self.add_log("Preparing files for upload...")

            # Get the output path or default to ~/.claude/projects/
            output_path_str = self.query_one("#output-path", Input).value.strip()
            if output_path_str:
                source_dir = Path(output_path_str)
            else:
                source_dir = self.projects_dir

            if not source_dir.exists():
                self.add_log(f"Error: Directory does not exist: {source_dir}")
                self.notify("Directory does not exist!", severity="error")
                return

            # Find HTML files to zip
            html_files = list(source_dir.rglob("*.html"))
            if not html_files:
                self.add_log("Error: No HTML files found to upload!")
                self.notify("No HTML files found! Run Convert first.", severity="error")
                return

            progress.update(progress=20)
            self.add_log(f"Found {len(html_files)} HTML files...")

            # Create zip file in temp directory
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            zip_filename = f"claude_code_log_{timestamp}.zip"

            # Save zip to Downloads folder or home directory
            downloads_dir = Path.home() / "Downloads"
            if downloads_dir.exists():
                zip_path = downloads_dir / zip_filename
            else:
                zip_path = Path.home() / zip_filename

            self.add_log(f"Creating zip file: {zip_path}")
            progress.update(progress=40)

            # Create the zip file
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for i, html_file in enumerate(html_files):
                    # Calculate relative path from source_dir
                    try:
                        rel_path = html_file.relative_to(source_dir)
                    except ValueError:
                        rel_path = html_file.name

                    zf.write(html_file, rel_path)

                    # Update progress
                    pct = 40 + int(40 * (i + 1) / len(html_files))
                    progress.update(progress=pct)

            progress.update(progress=85)

            # Get file size
            zip_size = zip_path.stat().st_size
            size_mb = zip_size / (1024 * 1024)
            self.add_log(f"Zip created: {zip_filename} ({size_mb:.2f} MB)")

            progress.update(progress=90)

            # Open Google Drive upload page
            self.add_log("Opening Google Drive...")
            google_drive_url = "https://drive.google.com/drive/my-drive"
            webbrowser.open(google_drive_url)

            progress.update(progress=95)

            # Also open the folder containing the zip
            if os.name == 'nt':  # Windows
                os.startfile(zip_path.parent)
            elif os.name == 'posix':
                if os.uname().sysname == 'Darwin':  # macOS
                    os.system(f'open "{zip_path.parent}"')
                else:  # Linux
                    os.system(f'xdg-open "{zip_path.parent}"')

            progress.update(progress=100)
            self.add_log(f"Done! Drag {zip_filename} to Google Drive")
            self.notify(f"Zip created! Drag to Google Drive to upload.", timeout=8)

        except Exception as e:
            self.add_log(f"Error: {e}")
            self.notify(f"Error: {e}", severity="error")

    def action_toggle_help(self) -> None:
        """Show help information."""
        help_text = (
            "Shortcuts: Enter=Convert, r=Refresh, a=Select All, d=Deselect All, q=Quit"
        )
        self.notify(help_text, timeout=8)

    async def action_quit(self) -> None:
        """Quit the application."""
        self.exit()


# Legacy alias for backward compatibility
SessionBrowser = ClaudeCodeLogTUI


def run_tui(project_path: Optional[Path] = None) -> Optional[str]:
    """Run the main TUI application."""
    app = ClaudeCodeLogTUI(project_path)
    try:
        return app.run()
    except KeyboardInterrupt:
        print("\nInterrupted")
        return None


def run_session_browser(project_path: Path) -> Optional[str]:
    """Run the session browser TUI for the given project path (legacy)."""
    if not project_path.exists():
        print(f"Error: Project path {project_path} does not exist")
        return None

    if not project_path.is_dir():
        print(f"Error: {project_path} is not a directory")
        return None

    jsonl_files = list(project_path.glob("*.jsonl"))
    if not jsonl_files:
        print(f"Error: No JSONL transcript files found in {project_path}")
        return None

    app = ClaudeCodeLogTUI(project_path)
    try:
        return app.run()
    except KeyboardInterrupt:
        print("\nInterrupted")
        return None
