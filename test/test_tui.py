#!/usr/bin/env python3
"""Tests for the TUI module - Desktop App Style Converter."""

import json
import sys
import tempfile
from pathlib import Path
from typing import cast
from unittest.mock import Mock, patch

import pytest
from textual.widgets import Button, Checkbox, Input, Label, Static, Switch

from claude_code_log.cache import CacheManager, SessionCacheData
from claude_code_log.tui import ClaudeCodeLogTUI, SessionBrowser, run_session_browser, run_tui


@pytest.fixture
def temp_project_dir():
    """Create a temporary project directory with test JSONL files."""
    with tempfile.TemporaryDirectory() as temp_dir:
        project_path = Path(temp_dir)

        # Create sample JSONL files with test data
        test_data = [
            {
                "type": "user",
                "sessionId": "session-123",
                "timestamp": "2025-01-01T10:00:00Z",
                "uuid": "user-uuid-1",
                "message": {
                    "role": "user",
                    "content": "Hello, this is my first message",
                },
                "parentUuid": None,
                "isSidechain": False,
                "userType": "human",
                "cwd": "/test",
                "version": "1.0.0",
                "isMeta": False,
            },
            {
                "type": "assistant",
                "sessionId": "session-123",
                "timestamp": "2025-01-01T10:01:00Z",
                "uuid": "assistant-uuid-1",
                "message": {
                    "id": "msg-123",
                    "type": "message",
                    "role": "assistant",
                    "model": "claude-3-sonnet",
                    "content": [
                        {"type": "text", "text": "Hello! How can I help you today?"}
                    ],
                    "usage": {
                        "input_tokens": 10,
                        "output_tokens": 15,
                        "cache_creation_input_tokens": 0,
                        "cache_read_input_tokens": 0,
                    },
                },
                "parentUuid": "user-uuid-1",
                "isSidechain": False,
                "userType": "human",
                "cwd": "/test",
                "version": "1.0.0",
                "requestId": "req-123",
            },
        ]

        # Write test data to JSONL file
        jsonl_file = project_path / "test-transcript.jsonl"
        with open(jsonl_file, "w") as f:
            for entry in test_data:
                f.write(json.dumps(entry) + "\n")

        yield project_path


@pytest.mark.tui
class TestClaudeCodeLogTUI:
    """Test cases for the ClaudeCodeLogTUI application."""

    def test_init(self, temp_project_dir):
        """Test ClaudeCodeLogTUI initialization."""
        app = ClaudeCodeLogTUI(temp_project_dir)
        assert app.project_path == temp_project_dir
        assert app.sessions == {}
        assert app.selected_session_id is None
        assert app.projects == []
        assert app.project_checkboxes == []
        assert app.log_messages == []

    def test_init_no_project_path(self):
        """Test ClaudeCodeLogTUI initialization without project path."""
        app = ClaudeCodeLogTUI()
        assert app.project_path is None
        assert app.sessions == {}

    @pytest.mark.asyncio
    async def test_app_startup(self, temp_project_dir):
        """Test that the app starts up correctly."""
        app = ClaudeCodeLogTUI(temp_project_dir)

        async with app.run_test() as pilot:
            await pilot.pause(0.1)

            # Check that main UI elements exist
            assert app.query_one("#title-label", Label)
            assert app.query_one("#projects-section")  # Projects section always visible
            assert app.query_one("#convert-btn", Button)
            assert app.query_one("#upload-btn", Button)  # Upload to Google button
            assert app.query_one("#status-log", Static)

    @pytest.mark.asyncio
    async def test_upload_button_exists(self, temp_project_dir):
        """Test that upload button exists and has correct label."""
        app = ClaudeCodeLogTUI(temp_project_dir)

        async with app.run_test(size=(120, 80)) as pilot:
            await pilot.pause(0.1)

            upload_btn = app.query_one("#upload-btn", Button)
            assert upload_btn is not None
            assert "Upload" in str(upload_btn.label)

    @pytest.mark.asyncio
    async def test_projects_section_visible(self, temp_project_dir):
        """Test that projects section is visible by default."""
        app = ClaudeCodeLogTUI(temp_project_dir)

        async with app.run_test() as pilot:
            await pilot.pause(0.1)

            # Projects section should be visible
            projects_section = app.query_one("#projects-section")
            assert projects_section.display

    @pytest.mark.asyncio
    async def test_options_switches(self, temp_project_dir):
        """Test options switches."""
        app = ClaudeCodeLogTUI(temp_project_dir)

        async with app.run_test() as pilot:
            await pilot.pause(0.1)

            # Get options switches
            browser_switch = app.query_one("#opt-browser", Switch)
            skip_switch = app.query_one("#opt-skip", Switch)
            cache_switch = app.query_one("#opt-cache", Switch)

            # Check default values
            assert browser_switch.value is True
            assert skip_switch.value is False
            assert cache_switch.value is False

            # Toggle switches
            browser_switch.value = False
            skip_switch.value = True
            cache_switch.value = True

            assert browser_switch.value is False
            assert skip_switch.value is True
            assert cache_switch.value is True

    @pytest.mark.asyncio
    async def test_date_inputs(self, temp_project_dir):
        """Test date input fields."""
        app = ClaudeCodeLogTUI(temp_project_dir)

        async with app.run_test() as pilot:
            await pilot.pause(0.1)

            # Get date inputs
            from_date = app.query_one("#from-date", Input)
            to_date = app.query_one("#to-date", Input)

            # From date should be empty by default
            assert from_date.value == ""

            # To date should have today's date
            assert to_date.value != ""

            # Test setting values
            from_date.value = "01/01/2025"
            assert from_date.value == "01/01/2025"

    @pytest.mark.asyncio
    async def test_clear_date_buttons(self, temp_project_dir):
        """Test clear date buttons."""
        app = ClaudeCodeLogTUI(temp_project_dir)

        async with app.run_test(size=(120, 80)) as pilot:
            await pilot.pause(0.1)

            # Set a from date
            from_date = app.query_one("#from-date", Input)
            from_date.value = "01/01/2025"

            # Click clear button
            await pilot.click("#clear-from")
            await pilot.pause(0.1)

            # Date should be cleared
            assert from_date.value == ""

    @pytest.mark.asyncio
    async def test_output_path_input(self, temp_project_dir):
        """Test output path input."""
        app = ClaudeCodeLogTUI(temp_project_dir)

        async with app.run_test() as pilot:
            await pilot.pause(0.1)

            output_path = app.query_one("#output-path", Input)
            assert output_path.value == ""

            output_path.value = "/custom/output/path"
            assert output_path.value == "/custom/output/path"

    @pytest.mark.asyncio
    async def test_log_function(self, temp_project_dir):
        """Test the add_log function."""
        app = ClaudeCodeLogTUI(temp_project_dir)

        async with app.run_test(size=(120, 80)) as pilot:
            await pilot.pause(0.1)

            # Log a message
            app.add_log("Test message 1")
            app.add_log("Test message 2")

            # Check log messages list
            assert len(app.log_messages) >= 2
            assert any("Test message 2" in msg for msg in app.log_messages)
            assert any("Test message 1" in msg for msg in app.log_messages)

    @pytest.mark.asyncio
    async def test_clear_log_button(self, temp_project_dir):
        """Test clear log button."""
        app = ClaudeCodeLogTUI(temp_project_dir)

        async with app.run_test(size=(120, 80)) as pilot:
            await pilot.pause(0.1)

            # Add some log messages
            app.add_log("Test message")
            initial_count = len(app.log_messages)
            assert initial_count > 0

            # Click clear button
            await pilot.click("#clear-btn")
            await pilot.pause(0.1)

            # Log should be cleared
            assert len(app.log_messages) == 0

    @pytest.mark.asyncio
    async def test_refresh_button(self, temp_project_dir):
        """Test refresh button."""
        mock_projects = [
            {
                "path": temp_project_dir,
                "name": temp_project_dir.name,
                "session_count": 1,
                "message_count": 2,
                "last_modified": "2025-01-01 10:00",
            }
        ]

        with patch(
            "claude_code_log.tui.discover_projects_with_sessions",
            return_value=mock_projects,
        ):
            app = ClaudeCodeLogTUI(temp_project_dir)

            async with app.run_test() as pilot:
                await pilot.pause(0.1)

                # Click refresh button
                await pilot.click("#refresh-btn")
                await pilot.pause(0.1)

                # Projects should be refreshed
                assert len(app.projects) == 1

    @pytest.mark.asyncio
    async def test_select_all_deselect_all(self, temp_project_dir):
        """Test select all and deselect all buttons."""
        mock_projects = [
            {
                "path": temp_project_dir / "project1",
                "name": "project1",
                "session_count": 1,
                "message_count": 2,
                "last_modified": "2025-01-01 10:00",
            },
            {
                "path": temp_project_dir / "project2",
                "name": "project2",
                "session_count": 2,
                "message_count": 5,
                "last_modified": "2025-01-02 10:00",
            },
        ]

        with patch(
            "claude_code_log.tui.discover_projects_with_sessions",
            return_value=mock_projects,
        ):
            app = ClaudeCodeLogTUI(temp_project_dir)

            async with app.run_test() as pilot:
                await pilot.pause(0.2)

                # Select all
                await pilot.click("#select-all-btn")
                await pilot.pause(0.1)

                for cb in app.project_checkboxes:
                    assert cb.value is True

                # Deselect all
                await pilot.click("#deselect-btn")
                await pilot.pause(0.1)

                for cb in app.project_checkboxes:
                    assert cb.value is False

    @pytest.mark.asyncio
    async def test_convert_no_projects_selected(self, temp_project_dir):
        """Test convert with no projects selected shows error."""
        with patch(
            "claude_code_log.tui.discover_projects_with_sessions",
            return_value=[],
        ):
            app = ClaudeCodeLogTUI(temp_project_dir)

            async with app.run_test(size=(120, 80)) as pilot:
                await pilot.pause(0.2)

                # Clear log messages before test
                app.log_messages = []

                # Try to convert directly (Enter key may be captured by Input widgets)
                app._do_convert()
                await pilot.pause(1.0)  # Wait for async worker

                # Should have logged an error (with "Error:" prefix)
                assert any("No projects selected" in msg for msg in app.log_messages), \
                    f"Expected error message not found. Log messages: {app.log_messages}"

    @pytest.mark.asyncio
    async def test_keyboard_shortcuts(self, temp_project_dir):
        """Test keyboard shortcuts."""
        app = ClaudeCodeLogTUI(temp_project_dir)

        async with app.run_test() as pilot:
            await pilot.pause(0.1)

            # Test help shortcut
            await pilot.press("?")
            await pilot.pause(0.1)

            # Should show help notification (handled by app)

    @pytest.mark.asyncio
    async def test_action_select_all(self, temp_project_dir):
        """Test action_select_all method."""
        mock_projects = [
            {
                "path": temp_project_dir / "project1",
                "name": "project1",
                "session_count": 1,
                "message_count": 2,
                "last_modified": "2025-01-01 10:00",
            },
        ]

        with patch(
            "claude_code_log.tui.discover_projects_with_sessions",
            return_value=mock_projects,
        ):
            app = ClaudeCodeLogTUI(temp_project_dir)

            async with app.run_test() as pilot:
                await pilot.pause(0.2)

                # Use keyboard shortcut for select all
                await pilot.press("a")
                await pilot.pause(0.1)

                for cb in app.project_checkboxes:
                    assert cb.value is True

    @pytest.mark.asyncio
    async def test_action_deselect_all(self, temp_project_dir):
        """Test action_deselect_all method."""
        mock_projects = [
            {
                "path": temp_project_dir / "project1",
                "name": "project1",
                "session_count": 1,
                "message_count": 2,
                "last_modified": "2025-01-01 10:00",
            },
        ]

        with patch(
            "claude_code_log.tui.discover_projects_with_sessions",
            return_value=mock_projects,
        ):
            app = ClaudeCodeLogTUI(temp_project_dir)

            async with app.run_test() as pilot:
                await pilot.pause(0.2)

                # First select all
                await pilot.press("a")
                await pilot.pause(0.1)

                # Then deselect all
                await pilot.press("d")
                await pilot.pause(0.1)

                for cb in app.project_checkboxes:
                    assert cb.value is False


@pytest.mark.tui
class TestRunSessionBrowser:
    """Test cases for the run_session_browser function."""

    def test_run_session_browser_nonexistent_path(self, capsys):
        """Test run_session_browser with non-existent path."""
        result = run_session_browser(Path("/nonexistent/path"))
        assert result is None

        captured = capsys.readouterr()
        assert "does not exist" in captured.out

    def test_run_session_browser_not_directory(self, capsys):
        """Test run_session_browser with a file instead of directory."""
        with tempfile.NamedTemporaryFile(suffix=".txt") as tmp_file:
            result = run_session_browser(Path(tmp_file.name))
            assert result is None

            captured = capsys.readouterr()
            assert "not a directory" in captured.out

    def test_run_session_browser_no_jsonl_files(self, capsys):
        """Test run_session_browser with directory without JSONL files."""
        with tempfile.TemporaryDirectory() as temp_dir:
            result = run_session_browser(Path(temp_dir))
            assert result is None

            captured = capsys.readouterr()
            assert "No JSONL" in captured.out

    def test_run_session_browser_success(self, temp_project_dir):
        """Test run_session_browser creates app with correct path."""
        with patch.object(ClaudeCodeLogTUI, "run", return_value="test_result"):
            result = run_session_browser(temp_project_dir)
            assert result == "test_result"


@pytest.mark.tui
class TestRunTUI:
    """Test cases for the run_tui function."""

    def test_run_tui_no_path(self):
        """Test run_tui without path."""
        with patch.object(ClaudeCodeLogTUI, "run", return_value=None):
            result = run_tui()
            assert result is None

    def test_run_tui_with_path(self, temp_project_dir):
        """Test run_tui with project path."""
        with patch.object(ClaudeCodeLogTUI, "run", return_value="test_result"):
            result = run_tui(temp_project_dir)
            assert result == "test_result"


@pytest.mark.tui
class TestLegacyAlias:
    """Test that legacy SessionBrowser alias works."""

    def test_session_browser_alias(self):
        """Test that SessionBrowser is an alias for ClaudeCodeLogTUI."""
        assert SessionBrowser is ClaudeCodeLogTUI

    def test_session_browser_init(self, temp_project_dir):
        """Test SessionBrowser initialization."""
        app = SessionBrowser(temp_project_dir)
        assert isinstance(app, ClaudeCodeLogTUI)
        assert app.project_path == temp_project_dir


@pytest.mark.tui
class TestDiscoverProjectsWithSessions:
    """Test cases for discover_projects_with_sessions function."""

    def test_discover_empty_directory(self):
        """Test discover with empty directory."""
        with tempfile.TemporaryDirectory() as temp_dir:
            from claude_code_log.tui import discover_projects_with_sessions

            result = discover_projects_with_sessions(Path(temp_dir))
            assert result == []

    def test_discover_nonexistent_directory(self):
        """Test discover with non-existent directory."""
        from claude_code_log.tui import discover_projects_with_sessions

        result = discover_projects_with_sessions(Path("/nonexistent/path"))
        assert result == []

    def test_discover_with_projects(self, temp_project_dir):
        """Test discover with projects."""
        from claude_code_log.tui import discover_projects_with_sessions

        # Create a projects directory structure
        projects_dir = temp_project_dir / "projects"
        projects_dir.mkdir()

        # Create a project with JSONL file
        project1 = projects_dir / "project1"
        project1.mkdir()
        jsonl_file = project1 / "test.jsonl"
        jsonl_file.write_text('{"type": "user", "message": "test"}\n')

        result = discover_projects_with_sessions(projects_dir)
        assert len(result) == 1
        assert result[0]["name"] == "project1"

    def test_discover_skips_hidden_directories(self, temp_project_dir):
        """Test that hidden directories are skipped."""
        from claude_code_log.tui import discover_projects_with_sessions

        projects_dir = temp_project_dir / "projects"
        projects_dir.mkdir()

        # Create a hidden directory with JSONL file
        hidden_project = projects_dir / ".hidden_project"
        hidden_project.mkdir()
        jsonl_file = hidden_project / "test.jsonl"
        jsonl_file.write_text('{"type": "user", "message": "test"}\n')

        result = discover_projects_with_sessions(projects_dir)
        assert len(result) == 0

    def test_discover_skips_empty_projects(self, temp_project_dir):
        """Test that projects without JSONL files are skipped."""
        from claude_code_log.tui import discover_projects_with_sessions

        projects_dir = temp_project_dir / "projects"
        projects_dir.mkdir()

        # Create a project without JSONL files
        project1 = projects_dir / "empty_project"
        project1.mkdir()
        (project1 / "readme.txt").write_text("This is not a JSONL file")

        result = discover_projects_with_sessions(projects_dir)
        assert len(result) == 0


@pytest.mark.tui
class TestIntegration:
    """Integration tests for TUI functionality."""

    @pytest.mark.asyncio
    async def test_full_app_lifecycle(self, temp_project_dir):
        """Test complete app lifecycle."""
        mock_projects = [
            {
                "path": temp_project_dir,
                "name": temp_project_dir.name,
                "session_count": 1,
                "message_count": 2,
                "last_modified": "2025-01-01 10:00",
            }
        ]

        with patch(
            "claude_code_log.tui.discover_projects_with_sessions",
            return_value=mock_projects,
        ):
            app = ClaudeCodeLogTUI(temp_project_dir)

            async with app.run_test() as pilot:
                await pilot.pause(0.2)

                # Check projects loaded
                assert len(app.projects) == 1

                # Check UI elements
                assert app.query_one("#title-label", Label)
                assert app.query_one("#projects-section")  # Projects always visible
                assert app.query_one("#convert-btn", Button)

                # Toggle options
                browser_switch = app.query_one("#opt-browser", Switch)
                browser_switch.value = False
                await pilot.pause(0.1)

                assert browser_switch.value is False

    @pytest.mark.asyncio
    async def test_empty_projects_handling(self):
        """Test handling when no projects found."""
        with (
            tempfile.TemporaryDirectory() as temp_dir,
            patch(
                "claude_code_log.tui.discover_projects_with_sessions",
                return_value=[],
            ),
        ):
            app = ClaudeCodeLogTUI(Path(temp_dir))

            async with app.run_test() as pilot:
                await pilot.pause(0.2)

                # Should handle empty projects gracefully
                assert len(app.projects) == 0
                assert len(app.project_checkboxes) == 0
