#!/usr/bin/env python3
"""Interactive Terminal User Interface for Claude Code Log."""

import os
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import ClassVar, Dict, List, Optional, cast

from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import Container, Vertical
from textual.widgets import (
    DataTable,
    Footer,
    Header,
    Label,
    ProgressBar,
    Static,
    TabbedContent,
    TabPane,
)
from textual.reactive import reactive

from .cache import CacheManager, SessionCacheData, get_library_version
from .converter import convert_jsonl_to_html, ensure_fresh_cache
from .renderer import get_project_display_name


def get_default_projects_dir() -> Path:
    """Get the default Claude projects directory path."""
    return Path.home() / ".claude" / "projects"


def discover_projects(projects_dir: Path) -> List[Path]:
    """Discover all projects with JSONL files."""
    if not projects_dir.exists():
        return []
    return [
        d for d in sorted(projects_dir.iterdir())
        if d.is_dir() and list(d.glob("*.jsonl"))
    ]


class ProjectSelector(App[Path]):
    """TUI for selecting a Claude project when multiple are found."""

    CSS = """
    #info-container {
        height: 3;
        border: solid $primary;
        margin-bottom: 1;
    }

    DataTable {
        height: auto;
    }
    """

    TITLE = "Claude Code Log - Project Selector"
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("q", "quit", "Quit"),
        Binding("enter", "select_project", "Select"),
    ]

    selected_project_path: reactive[Optional[Path]] = reactive(
        cast(Optional[Path], None)
    )
    projects: list[Path]
    matching_projects: list[Path]

    def __init__(self, projects: list[Path], matching_projects: list[Path]):
        """Initialize the project selector."""
        super().__init__()
        self.theme = "gruvbox"
        self.projects = projects
        self.matching_projects = matching_projects

    def compose(self) -> ComposeResult:
        """Create the UI layout."""
        yield Header()

        with Container(id="main-container"):
            with Vertical():
                with Container(id="info-container"):
                    info_text = f"Found {len(self.projects)} projects total"
                    if self.matching_projects:
                        info_text += (
                            f", {len(self.matching_projects)} match current directory"
                        )
                    yield Label(info_text, id="info")

                yield DataTable[str](id="projects-table", cursor_type="row")

        yield Footer()

    def on_mount(self) -> None:
        """Initialize the application when mounted."""
        self.populate_table()

    def on_resize(self) -> None:
        """Handle terminal resize events."""
        self.populate_table()

    def populate_table(self) -> None:
        """Populate the projects table."""
        table = cast(DataTable[str], self.query_one("#projects-table", DataTable))
        table.clear(columns=True)

        table.add_column("Project", width=self.size.width - 13)
        table.add_column("Sessions", width=10)

        for project_path in self.projects:
            try:
                cache_manager = CacheManager(project_path, get_library_version())
                project_cache = cache_manager.get_cached_project_data()

                if not project_cache or not project_cache.sessions:
                    try:
                        ensure_fresh_cache(project_path, cache_manager, silent=True)
                        project_cache = cache_manager.get_cached_project_data()
                    except Exception:
                        project_cache = None

                session_count = (
                    len(project_cache.sessions)
                    if project_cache and project_cache.sessions
                    else 0
                )

                project_display = f"  {project_path.name}"

                if project_path in self.matching_projects:
                    project_display = f"→ {project_display[2:]}"

                table.add_row(
                    project_display,
                    str(session_count),
                )
            except Exception:
                project_display = f"  {project_path.name}"
                if project_path in self.matching_projects:
                    project_display = f"→ {project_display[2:]}"

                table.add_row(
                    project_display,
                    "Unknown",
                )

    def on_data_table_row_highlighted(self, _event: DataTable.RowHighlighted) -> None:
        """Handle row highlighting (cursor movement) in the projects table."""
        self._update_selected_project_from_cursor()

    def _update_selected_project_from_cursor(self) -> None:
        """Update the selected project based on the current cursor position."""
        try:
            table = cast(DataTable[str], self.query_one("#projects-table", DataTable))
            row_data = table.get_row_at(table.cursor_row)
            if row_data:
                project_display = str(row_data[0]).strip()

                if project_display.startswith("→"):
                    project_display = project_display[1:].strip()

                for project_path in self.projects:
                    if project_path.name == project_display:
                        self.selected_project_path = project_path
                        break
        except Exception:
            pass

    def action_select_project(self) -> None:
        """Select the highlighted project."""
        if self.selected_project_path:
            self.exit(self.selected_project_path)
        else:
            if self.projects:
                self.exit(self.projects[0])

    async def action_quit(self) -> None:
        """Quit the application with proper cleanup."""
        self.exit(None)


class ClaudeCodeLogTUI(App[Optional[str]]):
    """Main TUI application with Converter and Session browser."""

    CSS = """
    /* Converter Tab Styles */
    #converter-container {
        height: 100%;
        padding: 1;
    }

    #info-box {
        height: auto;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    #options-box {
        height: auto;
        border: solid $secondary;
        padding: 1;
        margin-bottom: 1;
    }

    #projects-list {
        height: 1fr;
        min-height: 8;
        border: solid $primary;
        margin-bottom: 1;
    }

    #status-box {
        height: 5;
        border: solid $surface;
        padding: 1;
    }

    /* Sessions Tab Styles */
    #sessions-container {
        height: 100%;
    }

    #stats-container {
        height: auto;
        min-height: 3;
        max-height: 5;
        border: solid $primary;
        padding: 0 1;
    }

    #sessions-table {
        height: 1fr;
    }

    #expanded-content {
        display: none;
        height: auto;
        max-height: 10;
        border: solid $secondary;
        padding: 1;
        overflow-y: auto;
    }
    """

    TITLE = "Claude Code Log"
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("q", "quit", "Quit"),
        # Converter bindings
        Binding("1", "toggle_browser", "[1]Browser"),
        Binding("2", "toggle_skip", "[2]Skip"),
        Binding("3", "toggle_cache", "[3]Cache"),
        Binding("enter", "convert_or_select", "Convert"),
        Binding("r", "refresh", "Refresh"),
        # Sessions bindings
        Binding("h", "export_selected", "HTML"),
        Binding("c", "resume_selected", "Claude"),
        Binding("e", "toggle_expanded", "Expand"),
        Binding("p", "back_to_projects", "Projects"),
        Binding("?", "toggle_help", "Help"),
    ]

    # Reactive state
    selected_project: reactive[Optional[Path]] = reactive(cast(Optional[Path], None))
    opt_open_browser: reactive[bool] = reactive(True)
    opt_skip_sessions: reactive[bool] = reactive(False)
    opt_clear_cache: reactive[bool] = reactive(False)
    is_converting: reactive[bool] = reactive(False)
    status_message: reactive[str] = reactive("Select a project and press Enter to convert")

    # Sessions state
    selected_session_id: reactive[Optional[str]] = reactive(cast(Optional[str], None))
    is_expanded: reactive[bool] = reactive(False)

    def __init__(self, project_path: Optional[Path] = None):
        """Initialize the TUI."""
        super().__init__()
        self.theme = "gruvbox"
        self.project_path = project_path
        self.sessions: Dict[str, SessionCacheData] = {}
        self.projects: List[Path] = []
        self.projects_dir = get_default_projects_dir()

    def compose(self) -> ComposeResult:
        """Create the UI layout."""
        yield Header()

        with TabbedContent():
            with TabPane("Converter", id="converter-tab"):
                with Vertical(id="converter-container"):
                    # Info section
                    with Container(id="info-box"):
                        yield Label(
                            "[bold]Claude Code Log Converter[/bold]\n"
                            "Select a project from the list below and press Enter to convert.",
                            id="info-label"
                        )

                    # Options section
                    with Container(id="options-box"):
                        yield Label(self._get_options_text(), id="options-label")

                    # Projects list
                    with Container(id="projects-list"):
                        yield DataTable[str](id="projects-table", cursor_type="row")

                    # Status section
                    with Container(id="status-box"):
                        yield ProgressBar(id="progress-bar", total=100, show_eta=False)
                        yield Label(self.status_message, id="status-label")

            with TabPane("Sessions", id="sessions-tab"):
                with Vertical(id="sessions-container"):
                    with Container(id="stats-container"):
                        yield Label("Convert a project first to view sessions", id="stats")

                    yield DataTable[str](id="sessions-table", cursor_type="row")
                    yield Static("", id="expanded-content")

        yield Footer()

    def _get_options_text(self) -> str:
        """Get options display text."""
        b = "[green]ON[/green]" if self.opt_open_browser else "[dim]OFF[/dim]"
        s = "[green]ON[/green]" if self.opt_skip_sessions else "[dim]OFF[/dim]"
        c = "[green]ON[/green]" if self.opt_clear_cache else "[dim]OFF[/dim]"
        return f"[bold]Options:[/bold]  [1] Open Browser: {b}   [2] Skip Sessions: {s}   [3] Clear Cache: {c}"

    def on_mount(self) -> None:
        """Initialize the application when mounted."""
        self._load_projects()
        if self.project_path:
            self.selected_project = self.project_path
            self.load_sessions()

    def _load_projects(self) -> None:
        """Load list of projects."""
        self.projects = discover_projects(self.projects_dir)
        self._populate_projects_table()

    def _populate_projects_table(self) -> None:
        """Populate the projects table."""
        try:
            table = cast(DataTable[str], self.query_one("#projects-table", DataTable))
            table.clear(columns=True)

            table.add_column("Project", width=50)
            table.add_column("Sessions", width=10)
            table.add_column("Files", width=8)

            if not self.projects:
                table.add_row("No projects found", "-", "-")
                return

            for project_path in self.projects:
                try:
                    jsonl_count = len(list(project_path.glob("*.jsonl")))
                    cache_manager = CacheManager(project_path, get_library_version())
                    project_cache = cache_manager.get_cached_project_data()

                    session_count = 0
                    if project_cache and project_cache.sessions:
                        session_count = len(project_cache.sessions)

                    # Get display name
                    working_dirs = None
                    if project_cache and project_cache.working_directories:
                        working_dirs = project_cache.working_directories
                    display_name = get_project_display_name(project_path.name, working_dirs)

                    table.add_row(
                        display_name[:48],
                        str(session_count) if session_count else "-",
                        str(jsonl_count),
                    )
                except Exception:
                    table.add_row(project_path.name[:48], "?", "?")
        except Exception:
            pass

    def _update_options_display(self) -> None:
        """Update options label."""
        try:
            self.query_one("#options-label", Label).update(self._get_options_text())
        except Exception:
            pass

    def _update_status(self, message: str) -> None:
        """Update status message."""
        self.status_message = message
        try:
            self.query_one("#status-label", Label).update(message)
        except Exception:
            pass

    # Option toggles
    def action_toggle_browser(self) -> None:
        """Toggle open browser option."""
        self.opt_open_browser = not self.opt_open_browser
        self._update_options_display()
        self.notify(f"Open Browser: {'ON' if self.opt_open_browser else 'OFF'}")

    def action_toggle_skip(self) -> None:
        """Toggle skip sessions option."""
        self.opt_skip_sessions = not self.opt_skip_sessions
        self._update_options_display()
        self.notify(f"Skip Sessions: {'ON' if self.opt_skip_sessions else 'OFF'}")

    def action_toggle_cache(self) -> None:
        """Toggle clear cache option."""
        self.opt_clear_cache = not self.opt_clear_cache
        self._update_options_display()
        self.notify(f"Clear Cache: {'ON' if self.opt_clear_cache else 'OFF'}")

    def action_refresh(self) -> None:
        """Refresh projects list."""
        self._load_projects()
        if self.project_path:
            self.load_sessions()
        self.notify("Refreshed")

    # Project selection
    def on_data_table_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        """Handle row highlighting."""
        table_id = event.data_table.id
        if table_id == "projects-table":
            self._update_selected_project()
        elif table_id == "sessions-table":
            self._update_selected_session_from_cursor()
            if self.is_expanded:
                self._update_expanded_content()

    def _update_selected_project(self) -> None:
        """Update selected project from cursor."""
        try:
            table = cast(DataTable[str], self.query_one("#projects-table", DataTable))
            cursor_row = table.cursor_row
            if cursor_row < len(self.projects):
                self.selected_project = self.projects[cursor_row]
        except Exception:
            pass

    def action_convert_or_select(self) -> None:
        """Convert selected project or select in sessions."""
        # Check if we're in converter tab
        try:
            tabbed = self.query_one(TabbedContent)
            if tabbed.active == "converter-tab":
                self._do_convert()
            else:
                # In sessions tab, Enter does nothing special
                pass
        except Exception:
            self._do_convert()

    def _do_convert(self) -> None:
        """Start conversion."""
        if self.is_converting:
            self.notify("Conversion in progress...", severity="warning")
            return

        if not self.selected_project:
            self.notify("No project selected!", severity="error")
            return

        self.is_converting = True
        self._update_status("Converting...")
        self.run_worker(self._convert_project(), exclusive=True)

    async def _convert_project(self) -> None:
        """Perform conversion in background."""
        try:
            progress = self.query_one("#progress-bar", ProgressBar)
            progress.update(progress=10)

            project = self.selected_project
            if not project:
                return

            if self.opt_clear_cache:
                cache_manager = CacheManager(project, get_library_version())
                cache_manager.clear_cache()
                self._update_status("Cache cleared...")
                progress.update(progress=20)

            self._update_status(f"Processing: {project.name}")
            progress.update(progress=30)

            result = convert_jsonl_to_html(
                input_path=project,
                output_path=None,
                from_date=None,
                to_date=None,
                generate_individual_sessions=not self.opt_skip_sessions,
            )

            progress.update(progress=90)

            if result:
                self._update_status(f"Done! Output: {result.name}")
                progress.update(progress=100)

                if self.opt_open_browser:
                    webbrowser.open(f"file://{result}")

                # Update sessions
                self.project_path = project
                self.load_sessions()

                self.notify("Conversion complete!")
            else:
                self._update_status("Conversion failed")
                self.notify("Conversion failed", severity="error")

        except Exception as e:
            self._update_status(f"Error: {e}")
            self.notify(f"Error: {e}", severity="error")
        finally:
            self.is_converting = False

    # Session Browser Methods
    def load_sessions(self) -> None:
        """Load session information from cache."""
        if not self.project_path:
            return

        cache_manager = CacheManager(self.project_path, get_library_version())
        jsonl_files = list(self.project_path.glob("*.jsonl"))
        modified_files = cache_manager.get_modified_files(jsonl_files)
        project_cache = cache_manager.get_cached_project_data()

        if project_cache and project_cache.sessions and not modified_files:
            self.sessions = project_cache.sessions
        else:
            try:
                ensure_fresh_cache(self.project_path, cache_manager, silent=True)
                project_cache = cache_manager.get_cached_project_data()
                if project_cache and project_cache.sessions:
                    self.sessions = project_cache.sessions
                else:
                    self.sessions = {}
            except Exception:
                return

        try:
            self.populate_sessions_table()
            self.update_stats()
        except Exception:
            pass

    def populate_sessions_table(self) -> None:
        """Populate the sessions table with session data."""
        table = cast(DataTable[str], self.query_one("#sessions-table", DataTable))
        table.clear(columns=True)

        terminal_width = self.size.width
        session_id_width = 10
        messages_width = 10
        tokens_width = 14
        time_width = 12
        fixed_width = session_id_width + messages_width + tokens_width + (time_width * 2)
        title_width = max(30, terminal_width - fixed_width - 10)

        table.add_column("Session", width=session_id_width)
        table.add_column("Summary", width=title_width)
        table.add_column("Start", width=time_width)
        table.add_column("End", width=time_width)
        table.add_column("Msgs", width=messages_width)
        table.add_column("Tokens", width=tokens_width)

        sorted_sessions = sorted(
            self.sessions.items(), key=lambda x: x[1].first_timestamp, reverse=True
        )

        for session_id, session_data in sorted_sessions:
            start_time = self.format_timestamp(session_data.first_timestamp)
            end_time = self.format_timestamp(session_data.last_timestamp)

            total_tokens = session_data.total_input_tokens + session_data.total_output_tokens
            token_display = f"{total_tokens:,}" if total_tokens > 0 else "-"

            preview = (
                session_data.summary
                or session_data.first_user_message
                or "No preview"
            )

            table.add_row(
                session_id[:8],
                preview[:title_width-2],
                start_time,
                end_time,
                str(session_data.message_count),
                token_display,
            )

    def update_stats(self) -> None:
        """Update the project statistics display."""
        if not self.project_path:
            return

        total_sessions = len(self.sessions)
        total_messages = sum(s.message_count for s in self.sessions.values())
        total_tokens = sum(
            s.total_input_tokens + s.total_output_tokens for s in self.sessions.values()
        )

        cache_manager = CacheManager(self.project_path, get_library_version())
        working_directories = None
        try:
            project_cache = cache_manager.get_cached_project_data()
            if project_cache and project_cache.working_directories:
                working_directories = project_cache.working_directories
        except Exception:
            pass

        project_name = get_project_display_name(
            self.project_path.name, working_directories
        )

        stats_text = (
            f"[bold]{project_name}[/bold]  |  "
            f"Sessions: {total_sessions}  |  "
            f"Messages: {total_messages:,}  |  "
            f"Tokens: {total_tokens:,}"
        )

        try:
            self.query_one("#stats", Label).update(stats_text)
        except Exception:
            pass

    def format_timestamp(self, timestamp: str) -> str:
        """Format timestamp for display."""
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            return dt.strftime("%m-%d %H:%M")
        except (ValueError, AttributeError):
            return "Unknown"

    def _update_selected_session_from_cursor(self) -> None:
        """Update the selected session based on the current cursor position."""
        try:
            table = cast(DataTable[str], self.query_one("#sessions-table", DataTable))
            row_data = table.get_row_at(table.cursor_row)
            if row_data:
                session_id_display = str(row_data[0])
                for full_session_id in self.sessions.keys():
                    if full_session_id.startswith(session_id_display):
                        self.selected_session_id = full_session_id
                        break
        except Exception:
            pass

    def action_export_selected(self) -> None:
        """Export the selected session to HTML."""
        if not self.selected_session_id or not self.project_path:
            self.notify("No session selected", severity="warning")
            return

        try:
            session_file = self.project_path / f"session-{self.selected_session_id}.html"
            webbrowser.open(f"file://{session_file}")
            self.notify(f"Opened: {session_file.name}")
        except Exception as e:
            self.notify(f"Error: {e}", severity="error")

    def action_resume_selected(self) -> None:
        """Resume the selected session in Claude Code."""
        if not self.selected_session_id:
            self.notify("No session selected", severity="warning")
            return

        try:
            session_data = self.sessions.get(self.selected_session_id)
            if session_data and session_data.cwd:
                target_dir = Path(session_data.cwd)
                if target_dir.exists() and target_dir.is_dir():
                    os.chdir(target_dir)

            with self.suspend():
                os.execvp("claude", ["claude", "-r", self.selected_session_id])
        except FileNotFoundError:
            self.notify("Claude CLI not found", severity="error")
        except Exception as e:
            self.notify(f"Error: {e}", severity="error")

    def _escape_rich_markup(self, text: str) -> str:
        """Escape Rich markup characters in text."""
        if not text:
            return text
        return text.replace("[", "\\[").replace("]", "\\]")

    def _update_expanded_content(self) -> None:
        """Update the expanded content for the currently selected session."""
        if not self.selected_session_id or self.selected_session_id not in self.sessions:
            return

        expanded_content = self.query_one("#expanded-content", Static)
        session_data = self.sessions[self.selected_session_id]

        parts: list[str] = []
        parts.append(f"[bold]ID:[/bold] {self.selected_session_id}")

        if session_data.summary:
            parts.append(f"[bold]Summary:[/bold] {self._escape_rich_markup(session_data.summary)}")

        if session_data.first_user_message:
            parts.append(f"[bold]First Message:[/bold] {self._escape_rich_markup(session_data.first_user_message)}")

        if session_data.cwd:
            parts.append(f"[bold]Directory:[/bold] {self._escape_rich_markup(session_data.cwd)}")

        expanded_content.update("\n".join(parts))

    def action_toggle_expanded(self) -> None:
        """Toggle the expanded view for the selected session."""
        if not self.selected_session_id:
            return

        expanded_content = self.query_one("#expanded-content", Static)

        if self.is_expanded:
            self.is_expanded = False
            expanded_content.set_styles("display: none;")
            expanded_content.update("")
        else:
            self.is_expanded = True
            expanded_content.set_styles("display: block;")
            self._update_expanded_content()

    def action_toggle_help(self) -> None:
        """Show help information."""
        help_text = (
            "Converter: 1/2/3=Options, Enter=Convert, r=Refresh\n"
            "Sessions: h=HTML, c=Claude, e=Expand, p=Projects, q=Quit"
        )
        self.notify(help_text, timeout=8)

    def action_back_to_projects(self) -> None:
        """Navigate to the project selector."""
        self.exit(result="back_to_projects")

    async def action_quit(self) -> None:
        """Quit the application."""
        self.exit()


# Legacy alias for backward compatibility
SessionBrowser = ClaudeCodeLogTUI


def run_project_selector(
    projects: list[Path], matching_projects: list[Path]
) -> Optional[Path]:
    """Run the project selector TUI and return the selected project path."""
    if not projects:
        print("Error: No projects provided")
        return None

    app = ProjectSelector(projects, matching_projects)
    try:
        return app.run()
    except KeyboardInterrupt:
        print("\nInterrupted")
        return None


def run_session_browser(project_path: Path) -> Optional[str]:
    """Run the session browser TUI for the given project path."""
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


def run_tui(project_path: Optional[Path] = None) -> Optional[str]:
    """Run the main TUI application."""
    app = ClaudeCodeLogTUI(project_path)
    try:
        return app.run()
    except KeyboardInterrupt:
        print("\nInterrupted")
        return None
