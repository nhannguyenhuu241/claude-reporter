"""Main GUI application using Toga."""

import webbrowser
import asyncio
from pathlib import Path
from datetime import datetime
import toga
from toga.style import Pack
from toga.style.pack import COLUMN, ROW

# Import from bundled claude_code_log package


class ClaudeCodeLogApp(toga.App):
    """Main application class."""

    def startup(self):
        """Construct and show the Toga application."""
        # Main window container
        main_box = toga.Box(style=Pack(direction=COLUMN, padding=20))

        # Title
        title = toga.Label(
            "Claude Code Log",
            style=Pack(padding=(0, 5), font_size=18, font_weight="bold"),
        )
        main_box.add(title)

        # Description
        description = toga.Label(
            "Convert Claude Code transcript JSONL files to HTML",
            style=Pack(padding=(0, 5, 20, 5)),
        )
        main_box.add(description)

        # Mode selection
        mode_box = toga.Box(style=Pack(direction=ROW, padding=5))
        mode_label = toga.Label("Mode:", style=Pack(padding_right=10, width=100))
        mode_box.add(mode_label)

        self.mode_selection = toga.Selection(
            items=["All Projects", "Directory", "Single File"],
            style=Pack(flex=1),
        )
        mode_box.add(self.mode_selection)
        main_box.add(mode_box)

        # Input path selection
        input_box = toga.Box(style=Pack(direction=ROW, padding=5))
        input_label = toga.Label("Input:", style=Pack(padding_right=10, width=100))
        input_box.add(input_label)

        self.input_path = toga.TextInput(
            placeholder="Select file or directory...",
            readonly=True,
            style=Pack(flex=1, padding_right=5),
        )
        input_box.add(self.input_path)

        select_btn = toga.Button(
            "Browse",
            on_press=self.select_input,
            style=Pack(width=80),
        )
        input_box.add(select_btn)
        main_box.add(input_box)

        # Output path selection
        output_box = toga.Box(style=Pack(direction=ROW, padding=5))
        output_label = toga.Label("Output:", style=Pack(padding_right=10, width=100))
        output_box.add(output_label)

        self.output_path = toga.TextInput(
            placeholder="Optional output path...",
            style=Pack(flex=1, padding_right=5),
        )
        output_box.add(self.output_path)

        select_output_btn = toga.Button(
            "Browse",
            on_press=self.select_output,
            style=Pack(width=80),
        )
        output_box.add(select_output_btn)
        main_box.add(output_box)

        # Date filters
        date_box = toga.Box(style=Pack(direction=ROW, padding=5))
        from_label = toga.Label("From:", style=Pack(padding_right=10, width=100))
        date_box.add(from_label)

        self.from_date = toga.TextInput(
            placeholder='e.g., "yesterday", "2025-12-01"',
            style=Pack(flex=1, padding_right=10),
        )
        date_box.add(self.from_date)

        to_label = toga.Label("To:", style=Pack(padding_right=10))
        date_box.add(to_label)

        self.to_date = toga.TextInput(
            placeholder='e.g., "today", "2025-12-05"',
            style=Pack(flex=1),
        )
        date_box.add(self.to_date)
        main_box.add(date_box)

        # Options
        options_box = toga.Box(style=Pack(direction=COLUMN, padding=5))

        self.open_browser = toga.Switch(
            "Open in browser after conversion",
            value=True,
            style=Pack(padding=2),
        )
        options_box.add(self.open_browser)

        self.no_individual = toga.Switch(
            "Skip individual session files",
            value=False,
            style=Pack(padding=2),
        )
        options_box.add(self.no_individual)

        self.clear_cache = toga.Switch(
            "Clear cache before processing",
            value=False,
            style=Pack(padding=2),
        )
        options_box.add(self.clear_cache)

        main_box.add(options_box)

        # Status/Log area
        status_label = toga.Label(
            "Status:",
            style=Pack(padding=(20, 5, 5, 5), font_weight="bold"),
        )
        main_box.add(status_label)

        self.status_text = toga.MultilineTextInput(
            readonly=True,
            style=Pack(flex=1, padding=5, height=200),
        )
        main_box.add(self.status_text)

        # Action buttons
        button_box = toga.Box(style=Pack(direction=ROW, padding=10))

        self.convert_btn = toga.Button(
            "Convert",
            on_press=self.convert_files,
            style=Pack(flex=1, padding=5),
        )
        button_box.add(self.convert_btn)

        clear_btn = toga.Button(
            "Clear Log",
            on_press=self.clear_log,
            style=Pack(width=100, padding=5),
        )
        button_box.add(clear_btn)

        main_box.add(button_box)

        # Create and show main window
        self.main_window = toga.MainWindow(title=self.formal_name)
        self.main_window.content = main_box
        self.main_window.show()

        # Set default path to Claude projects
        default_path = Path.home() / ".claude" / "projects"
        if default_path.exists():
            self.input_path.value = str(default_path)

    def log(self, message):
        """Add message to status log."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        current = self.status_text.value or ""
        self.status_text.value = f"{current}[{timestamp}] {message}\n"

    def clear_log(self, widget):
        """Clear the status log."""
        self.status_text.value = ""

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
                path = await self.main_window.select_folder_dialog(
                    title="Select directory",
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
                path = await self.main_window.select_folder_dialog(
                    title="Select output directory",
                )

            if path:
                self.output_path.value = str(path)
                self.log(f"Output: {path}")
        except Exception as e:
            self.log(f"Error selecting output: {e}")

    async def run_conversion_async(self, cmd_args, open_in_browser):
        """Run conversion asynchronously by calling converter directly."""
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
            )
            from pathlib import Path
            import click

            # Custom echo function that logs to UI
            original_echo = click.echo

            def custom_echo(message=None, **kwargs):
                if message:
                    self.log(str(message))
                original_echo(message, **kwargs)

            # Monkey patch click.echo temporarily
            click.echo = custom_echo

            try:
                # Run conversion in thread executor to avoid blocking UI
                result_path = None

                if all_projects:
                    self.log("Processing all projects...")
                    projects_dir = Path.home() / ".claude" / "projects"

                    # Run in executor to avoid blocking
                    loop = asyncio.get_event_loop()
                    result_path = await loop.run_in_executor(
                        None,
                        lambda: process_projects_hierarchy(
                            projects_dir=projects_dir,
                            output_dir=Path(output_path) if output_path else None,
                            from_date=from_date,
                            to_date=to_date,
                            generate_individual_sessions=not no_individual,
                            clear_cache=clear_cache,
                        ),
                    )
                    self.log(f"Generated index at: {result_path}")
                else:
                    self.log(f"Converting: {input_path}")
                    input_file = Path(input_path)

                    # Run in executor to avoid blocking
                    loop = asyncio.get_event_loop()
                    result_path = await loop.run_in_executor(
                        None,
                        lambda: convert_jsonl_to_html(
                            input_file,
                            output_path=Path(output_path) if output_path else None,
                            from_date=from_date,
                            to_date=to_date,
                            generate_individual_sessions=not no_individual,
                            clear_cache=clear_cache,
                        ),
                    )
                    self.log(f"Successfully converted to: {result_path}")
            finally:
                # Restore original click.echo
                click.echo = original_echo

            self.log("✅ Conversion completed successfully!")

            if result_path and open_in_browser:
                self.log(f"Opening in browser: {result_path}")
                webbrowser.open(f"file://{result_path}")

        except Exception as e:
            self.log(f"❌ Fatal error: {e}")
            import traceback

            self.log(traceback.format_exc())
        finally:
            # Re-enable convert button
            self.convert_btn.enabled = True
            self.convert_btn.text = "Convert"

    async def convert_files(self, widget):
        """Convert files based on settings."""
        try:
            mode = self.mode_selection.value
            input_val = self.input_path.value

            if not input_val and mode != "All Projects":
                await self.main_window.info_dialog(
                    "Input Required",
                    "Please select an input file or directory.",
                )
                return

            self.log("Starting conversion...")

            # Prepare parameters
            output = self.output_path.value if self.output_path.value else None
            from_date = self.from_date.value if self.from_date.value else None
            to_date = self.to_date.value if self.to_date.value else None

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
            self.add_background_task(
                self.run_conversion_async(cmd_args, self.open_browser.value)
            )

        except Exception as e:
            self.log(f"❌ Error: {e}")
            # Re-enable button on error
            self.convert_btn.enabled = True
            self.convert_btn.text = "Convert"
            await self.main_window.error_dialog(
                "Conversion Failed",
                f"An error occurred:\n\n{e}",
            )


def main():
    """Create and return the application."""
    return ClaudeCodeLogApp(
        "Claude Code Log",
        "com.claudecode.log",
    )


if __name__ == "__main__":
    main().main_loop()
