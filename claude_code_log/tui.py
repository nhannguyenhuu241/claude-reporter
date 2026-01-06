#!/usr/bin/env python3
"""Interactive Terminal User Interface for Claude Code Log."""

import os
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import ClassVar, Dict, Optional, cast

from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import Container, Horizontal, Vertical, VerticalScroll
from textual.widgets import (
    DataTable,
    DirectoryTree,
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
    #main-container {
        padding: 0;
        height: 100%;
    }

    /* Converter Tab Styles */
    #converter-container {
        height: 100%;
    }

    #mode-display {
        height: 3;
        border: solid $primary;
        margin-bottom: 1;
        padding: 0 1;
    }

    #path-display {
        height: 3;
        border: solid $secondary;
        margin-bottom: 1;
        padding: 0 1;
    }

    #options-display {
        height: 3;
        border: solid $surface;
        margin-bottom: 1;
        padding: 0 1;
    }

    #file-browser {
        height: 1fr;
        min-height: 10;
        border: solid $primary;
        margin-bottom: 1;
    }

    #progress-container {
        height: 4;
        border: solid $secondary;
        padding: 0 1;
    }

    #status-text {
        height: 2;
    }

    /* Sessions Tab Styles */
    #stats-container {
        height: auto;
        min-height: 3;
        max-height: 5;
        border: solid $primary;
    }

    #sessions-table {
        height: 1fr;
    }

    #expanded-content {
        display: none;
        height: 1fr;
        border: solid $secondary;
        overflow-y: auto;
    }

    /* Highlight selected options */
    .option-on {
        color: $success;
    }

    .option-off {
        color: $text-muted;
    }
    """

    TITLE = "Claude Code Log"
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("q", "quit", "Quit"),
        # Converter bindings
        Binding("d", "mode_directory", "Directory"),
        Binding("f", "mode_file", "Single File"),
        Binding("1", "toggle_browser", "Browser"),
        Binding("2", "toggle_skip", "Skip"),
        Binding("3", "toggle_cache", "Cache"),
        Binding("enter", "convert", "Convert"),
        # Sessions bindings
        Binding("h", "export_selected", "HTML"),
        Binding("c", "resume_selected", "Claude"),
        Binding("r", "refresh", "Refresh"),
        Binding("e", "toggle_expanded", "Expand"),
        Binding("p", "back_to_projects", "Projects"),
        Binding("?", "toggle_help", "Help"),
    ]

    # Reactive state
    mode: reactive[str] = reactive("directory")  # "directory" or "file"
    selected_path: reactive[Optional[Path]] = reactive(cast(Optional[Path], None))
    opt_open_browser: reactive[bool] = reactive(True)
    opt_skip_sessions: reactive[bool] = reactive(False)
    opt_clear_cache: reactive[bool] = reactive(False)
    is_converting: reactive[bool] = reactive(False)
    status_message: reactive[str] = reactive("Ready. Select a path and press Enter to convert.")

    # Sessions state
    selected_session_id: reactive[Optional[str]] = reactive(cast(Optional[str], None))
    is_expanded: reactive[bool] = reactive(False)

    def __init__(self, project_path: Optional[Path] = None):
        """Initialize the TUI."""
        super().__init__()
        self.theme = "gruvbox"
        self.project_path = project_path
        self.sessions: Dict[str, SessionCacheData] = {}
        # Default to home directory for browsing
        self.browse_path = Path.home()

    def compose(self) -> ComposeResult:
        """Create the UI layout."""
        yield Header()

        with TabbedContent():
            with TabPane("Converter", id="converter-tab"):
                yield from self._compose_converter_tab()

            with TabPane("Sessions", id="sessions-tab"):
                yield from self._compose_sessions_tab()

        yield Footer()

    def _compose_converter_tab(self) -> ComposeResult:
        """Compose the converter tab UI."""
        with Vertical(id="converter-container"):
            # Mode display
            with Container(id="mode-display"):
                yield Label(self._get_mode_text(), id="mode-label")

            # Selected path display
            with Container(id="path-display"):
                yield Label(self._get_path_text(), id="path-label")

            # Options display
            with Container(id="options-display"):
                yield Label(self._get_options_text(), id="options-label")

            # File browser
            with Container(id="file-browser"):
                yield DirectoryTree(str(self.browse_path), id="dir-tree")

            # Progress and status
            with Container(id="progress-container"):
                yield ProgressBar(id="progress-bar", total=100, show_eta=False)
                yield Label(self.status_message, id="status-text")

    def _compose_sessions_tab(self) -> ComposeResult:
        """Compose the sessions browser tab UI."""
        with Vertical():
            with Container(id="stats-container"):
                yield Label("Select a project to view sessions", id="stats")

            yield DataTable[str](id="sessions-table", cursor_type="row")
            yield Static("", id="expanded-content")

    def _get_mode_text(self) -> str:
        """Get mode display text."""
        mode_name = "Directory" if self.mode == "directory" else "Single File"
        return f"[bold]Mode:[/bold] {mode_name}  [dim](d=Directory, f=File)[/dim]"

    def _get_path_text(self) -> str:
        """Get path display text."""
        if self.selected_path:
            return f"[bold]Selected:[/bold] {self.selected_path}"
        return "[bold]Selected:[/bold] [dim]None - Navigate and press Enter to select[/dim]"

    def _get_options_text(self) -> str:
        """Get options display text."""
        browser_status = "[green]ON[/green]" if self.opt_open_browser else "[dim]OFF[/dim]"
        skip_status = "[green]ON[/green]" if self.opt_skip_sessions else "[dim]OFF[/dim]"
        cache_status = "[green]ON[/green]" if self.opt_clear_cache else "[dim]OFF[/dim]"

        return (
            f"[bold]Options:[/bold] "
            f"[1] Browser: {browser_status}  "
            f"[2] Skip Sessions: {skip_status}  "
            f"[3] Clear Cache: {cache_status}"
        )

    def _update_displays(self) -> None:
        """Update all display labels."""
        try:
            self.query_one("#mode-label", Label).update(self._get_mode_text())
            self.query_one("#path-label", Label).update(self._get_path_text())
            self.query_one("#options-label", Label).update(self._get_options_text())
            self.query_one("#status-text", Label).update(self.status_message)
        except Exception:
            pass

    def on_mount(self) -> None:
        """Initialize the application when mounted."""
        if self.project_path:
            self.selected_path = self.project_path
            self.load_sessions()
            self._update_displays()

    def watch_mode(self, new_mode: str) -> None:
        """React to mode changes."""
        self._update_displays()

    def watch_selected_path(self, new_path: Optional[Path]) -> None:
        """React to selected path changes."""
        self._update_displays()

    def watch_opt_open_browser(self, value: bool) -> None:
        """React to option changes."""
        self._update_displays()

    def watch_opt_skip_sessions(self, value: bool) -> None:
        """React to option changes."""
        self._update_displays()

    def watch_opt_clear_cache(self, value: bool) -> None:
        """React to option changes."""
        self._update_displays()

    def watch_status_message(self, message: str) -> None:
        """React to status message changes."""
        try:
            self.query_one("#status-text", Label).update(message)
        except Exception:
            pass

    # Directory Tree handlers
    def on_directory_tree_file_selected(self, event: DirectoryTree.FileSelected) -> None:
        """Handle file selection in directory tree."""
        if self.mode == "file":
            selected = Path(event.path)
            if selected.suffix == ".jsonl":
                self.selected_path = selected
                self.status_message = f"Selected file: {selected.name}"
            else:
                self.status_message = "Please select a .jsonl file"
        else:
            self.status_message = "In Directory mode - select a folder instead"

    def on_directory_tree_directory_selected(self, event: DirectoryTree.DirectorySelected) -> None:
        """Handle directory selection in directory tree."""
        if self.mode == "directory":
            selected = Path(event.path)
            # Check if it has .jsonl files
            jsonl_files = list(selected.glob("*.jsonl"))
            if jsonl_files:
                self.selected_path = selected
                self.status_message = f"Selected directory: {selected.name} ({len(jsonl_files)} JSONL files)"
            else:
                self.status_message = f"No JSONL files in {selected.name}"
        else:
            self.status_message = "In File mode - select a .jsonl file instead"

    # Mode actions
    def action_mode_directory(self) -> None:
        """Switch to directory mode."""
        self.mode = "directory"
        self.status_message = "Mode: Directory - Select a folder with JSONL files"
        self.notify("Mode: Directory")

    def action_mode_file(self) -> None:
        """Switch to single file mode."""
        self.mode = "file"
        self.status_message = "Mode: Single File - Select a .jsonl file"
        self.notify("Mode: Single File")

    # Option toggles
    def action_toggle_browser(self) -> None:
        """Toggle open browser option."""
        self.opt_open_browser = not self.opt_open_browser
        status = "ON" if self.opt_open_browser else "OFF"
        self.notify(f"Open Browser: {status}")

    def action_toggle_skip(self) -> None:
        """Toggle skip sessions option."""
        self.opt_skip_sessions = not self.opt_skip_sessions
        status = "ON" if self.opt_skip_sessions else "OFF"
        self.notify(f"Skip Sessions: {status}")

    def action_toggle_cache(self) -> None:
        """Toggle clear cache option."""
        self.opt_clear_cache = not self.opt_clear_cache
        status = "ON" if self.opt_clear_cache else "OFF"
        self.notify(f"Clear Cache: {status}")

    # Convert action
    def action_convert(self) -> None:
        """Start conversion."""
        if self.is_converting:
            self.notify("Conversion in progress...", severity="warning")
            return

        if not self.selected_path:
            self.notify("No path selected!", severity="error")
            return

        if not self.selected_path.exists():
            self.notify(f"Path does not exist: {self.selected_path}", severity="error")
            return

        self.is_converting = True
        self.status_message = "Converting..."
        self.run_worker(self._do_convert(), exclusive=True)

    async def _do_convert(self) -> None:
        """Perform conversion in background."""
        try:
            progress = self.query_one("#progress-bar", ProgressBar)
            progress.update(progress=10)

            if self.opt_clear_cache and self.selected_path and self.selected_path.is_dir():
                cache_manager = CacheManager(self.selected_path, get_library_version())
                cache_manager.clear_cache()
                self.status_message = "Cache cleared..."
                progress.update(progress=20)

            self.status_message = f"Processing: {self.selected_path}"
            progress.update(progress=30)

            result = convert_jsonl_to_html(
                input_path=self.selected_path,
                output_path=None,
                from_date=None,
                to_date=None,
                generate_individual_sessions=not self.opt_skip_sessions,
            )

            progress.update(progress=90)

            if result:
                self.status_message = f"Done! Output: {result}"
                progress.update(progress=100)

                if self.opt_open_browser:
                    webbrowser.open(f"file://{result}")
                    self.status_message += " (Opened in browser)"

                # Update sessions if we converted the current project
                if self.selected_path and self.selected_path.is_dir():
                    self.project_path = self.selected_path
                    self.load_sessions()

                self.notify("Conversion complete!", severity="information")
            else:
                self.status_message = "Conversion failed - no output generated"
                self.notify("Conversion failed", severity="error")

        except Exception as e:
            self.status_message = f"Error: {e}"
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
        time_width = 16 if terminal_width >= 120 else 12
        fixed_width = session_id_width + messages_width + tokens_width + (time_width * 2)
        title_width = max(30, terminal_width - fixed_width - 8)

        table.add_column("Session ID", width=session_id_width)
        table.add_column("Title or First Message", width=title_width)
        table.add_column("Start Time", width=time_width)
        table.add_column("End Time", width=time_width)
        table.add_column("Messages", width=messages_width)
        table.add_column("Tokens", width=tokens_width)

        sorted_sessions = sorted(
            self.sessions.items(), key=lambda x: x[1].first_timestamp, reverse=True
        )

        for session_id, session_data in sorted_sessions:
            use_short_format = terminal_width < 120
            start_time = self.format_timestamp(
                session_data.first_timestamp, short_format=use_short_format
            )
            end_time = self.format_timestamp(
                session_data.last_timestamp, short_format=use_short_format
            )

            total_tokens = (
                session_data.total_input_tokens + session_data.total_output_tokens
            )
            token_display = f"{total_tokens:,}" if total_tokens > 0 else "-"

            preview = (
                session_data.summary
                or session_data.first_user_message
                or "No preview available"
            )

            table.add_row(
                session_id[:8],
                preview,
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

        if self.sessions:
            timestamps = [
                s.first_timestamp for s in self.sessions.values() if s.first_timestamp
            ]
            earliest = min(timestamps) if timestamps else ""
            latest = max(
                s.last_timestamp for s in self.sessions.values() if s.last_timestamp
            ) if self.sessions else ""

            date_range = ""
            if earliest and latest:
                earliest_date = self.format_timestamp(earliest, date_only=True)
                latest_date = self.format_timestamp(latest, date_only=True)
                if earliest_date == latest_date:
                    date_range = earliest_date
                else:
                    date_range = f"{earliest_date} to {latest_date}"
        else:
            date_range = "No sessions found"

        terminal_width = self.size.width
        project_section = f"[bold]Project:[/bold] {project_name}"
        sessions_section = f"[bold]Sessions:[/bold] {total_sessions:,} | [bold]Messages:[/bold] {total_messages:,} | [bold]Tokens:[/bold] {total_tokens:,}"
        date_section = f"[bold]Date Range:[/bold] {date_range}"

        if terminal_width >= 120:
            stats_text = f"{project_section}  {sessions_section}  {date_section}"
        else:
            stats_text = f"{project_section}\n{sessions_section}\n{date_section}"

        stats_label = self.query_one("#stats", Label)
        stats_label.update(stats_text)

    def format_timestamp(
        self, timestamp: str, date_only: bool = False, short_format: bool = False
    ) -> str:
        """Format timestamp for display."""
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            if date_only:
                return dt.strftime("%Y-%m-%d")
            elif short_format:
                return dt.strftime("%m-%d %H:%M")
            else:
                return dt.strftime("%m-%d %H:%M")
        except (ValueError, AttributeError):
            return "Unknown"

    def on_data_table_row_highlighted(self, event: DataTable.RowHighlighted) -> None:
        """Handle row highlighting in the sessions table."""
        self._update_selected_session_from_cursor()
        if self.is_expanded:
            self._update_expanded_content()

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
            self.notify(f"Opened session HTML: {session_file}")
        except Exception as e:
            self.notify(f"Error opening session HTML: {e}", severity="error")

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
            self.notify(
                "Claude Code CLI not found. Make sure 'claude' is in your PATH.",
                severity="error",
            )
        except Exception as e:
            self.notify(f"Error resuming session: {e}", severity="error")

    def action_refresh(self) -> None:
        """Refresh sessions."""
        if self.project_path:
            self.load_sessions()
        self.notify("Refreshed")

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

        content_parts: list[str] = []
        content_parts.append(f"[bold]Session ID:[/bold] {self.selected_session_id}")

        if session_data.summary:
            escaped_summary = self._escape_rich_markup(session_data.summary)
            content_parts.append(f"\n[bold]Summary:[/bold] {escaped_summary}")

        if session_data.first_user_message:
            escaped_message = self._escape_rich_markup(session_data.first_user_message)
            content_parts.append(f"\n[bold]First User Message:[/bold] {escaped_message}")

        if session_data.cwd:
            escaped_cwd = self._escape_rich_markup(session_data.cwd)
            content_parts.append(f"\n[bold]Working Directory:[/bold] {escaped_cwd}")

        total_tokens = (
            session_data.total_input_tokens + session_data.total_output_tokens
        )
        if total_tokens > 0:
            token_details = f"Input: {session_data.total_input_tokens:,} | Output: {session_data.total_output_tokens:,}"
            if session_data.total_cache_creation_tokens > 0:
                token_details += f" | Cache Creation: {session_data.total_cache_creation_tokens:,}"
            if session_data.total_cache_read_tokens > 0:
                token_details += f" | Cache Read: {session_data.total_cache_read_tokens:,}"
            content_parts.append(f"\n[bold]Token Usage:[/bold] {token_details}")

        expanded_content.update("\n".join(content_parts))

    def action_toggle_expanded(self) -> None:
        """Toggle the expanded view for the selected session."""
        if not self.selected_session_id or self.selected_session_id not in self.sessions:
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
            "Claude Code Log TUI\n\n"
            "Converter Tab:\n"
            "- d/f: Switch mode (Directory/File)\n"
            "- 1/2/3: Toggle options\n"
            "- Enter: Start conversion\n"
            "- Navigate with arrows\n\n"
            "Sessions Tab:\n"
            "- h: Open HTML\n"
            "- c: Resume Claude\n"
            "- e: Expand view\n"
            "- r: Refresh\n"
            "- p: Projects\n"
            "- q: Quit"
        )
        self.notify(help_text, timeout=10)

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
