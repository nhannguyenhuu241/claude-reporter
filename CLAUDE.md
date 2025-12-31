# Claude Code Log

A Python CLI tool that converts Claude transcript JSONL files into readable HTML format.

## Project Overview

This tool processes Claude Code transcript files (stored as JSONL) and generates clean, minimalist HTML pages with comprehensive session navigation and token usage tracking. It's designed to create a readable log of your Claude interactions with rich metadata and easy navigation.

## Key Features

- **Desktop GUI Application**: Cross-platform desktop app (macOS/Windows) built with Toga/Briefcase with real-time conversion progress and browser auto-open
- **Interactive TUI (Terminal User Interface)**: Browse and manage Claude Code sessions with real-time navigation, summaries, and quick actions for HTML export and session resuming
- **Project Hierarchy Processing**: Process entire `~/.claude/projects/` directory with linked index page, with optional custom output directory
- **Individual Session Files**: Generate separate HTML files for each session with navigation links
- **Single File or Directory Processing**: Convert individual JSONL files or specific directories
- **Session Navigation**: Interactive table of contents with session summaries and quick navigation
- **Token Usage Tracking**: Display token consumption for individual messages and session totals
- **Runtime Message Filtering**: JavaScript-powered filtering to show/hide message types (user, assistant, system, tool use, etc.)
- **Chronological Ordering**: All messages sorted by timestamp across sessions
- **Cross-Session Summary Matching**: Properly match async-generated summaries to their original sessions
- **Date Range Filtering**: Filter messages by date range using natural language (e.g., "today", "yesterday", "last week")
- **Rich Message Types**: Support for user/assistant messages, tool use/results, thinking content, images
- **System Command Visibility**: Show system commands (like `init`) in expandable details with structured parsing
- **Markdown Rendering**: Server-side markdown rendering with syntax highlighting using mistune
- **Interactive Timeline**: Optional vis-timeline visualization showing message chronology across all types, with click-to-scroll navigation (implemented in JavaScript within the HTML template)
- **Floating Navigation**: Always-available back-to-top button and filter controls
- **Space-Efficient Layout**: Compact design optimised for content density
- **CLI Interface**: Simple command-line tool using Click

## Usage

### Desktop GUI Application

A cross-platform desktop application is available for macOS and Windows, providing a user-friendly interface for converting Claude Code transcripts without requiring command-line usage.

**Features:**

- **Three Processing Modes**:
  - **All Projects**: Process entire `~/.claude/projects/` directory with optional custom output location
  - **Directory**: Process a specific project directory
  - **Single File**: Process an individual JSONL file
- **Custom Output Directory**: Choose where to save generated HTML files (respects user selection in All Projects mode)
- **Real-time Conversion Progress**: Live log display showing conversion status (newest logs at top)
- **Date Range Filtering**: Natural language date filters (e.g., "yesterday", "last week")
- **Options**:
  - Auto-open in browser after conversion
  - Skip individual session files (only create combined transcripts)
  - Clear cache before processing
- **Queue-based Threading**: Non-blocking UI with background conversion processing

**Building the Desktop App:**

```bash
cd app/

# Development mode (hot reload)
briefcase dev

# Build for distribution
briefcase build

# Create installer/DMG
briefcase package

# Run built app
briefcase run
```

**App Structure:**

- `app/claudecodelog/app.py` - Main Toga GUI application with queue-based threading
- `app/claudecodelog/claude_code_log/` - Bundled converter library (copied from parent project)
- `app/pyproject.toml` - Briefcase configuration with dependencies
- `app/resources/icon.icns` - macOS app icon (converted from PNG)

**Technical Notes:**

- Uses **Toga** for cross-platform GUI framework (BeeWare project)
- Uses **Briefcase** for packaging and distribution
- Implements queue-based threading pattern for real-time log updates without UI freeze
- Redirects stdout/stderr and Click output to queue for live progress display
- Supports ad-hoc signing for macOS development builds

### Interactive TUI (Terminal User Interface)

The TUI provides an interactive interface for browsing and managing Claude Code sessions with real-time navigation, session summaries, and quick actions.

```bash
# Launch TUI for all projects (default behavior)
claude-code-log --tui

# Launch TUI for specific project directory
claude-code-log /path/to/project --tui

# Launch TUI for specific Claude project
claude-code-log my-project --tui  # Automatically converts to ~/.claude/projects/-path-to-my-project
```

**TUI Features:**

- **Session Listing**: Interactive table showing session IDs, summaries, timestamps, message counts, and token usage
- **Smart Summaries**: Prioritizes Claude-generated summaries over first user messages for better session identification
- **Working Directory Matching**: Automatically finds and opens projects matching your current working directory
- **Quick Actions**:
  - `h` or "Export to HTML" button: Generate and open session HTML in browser
  - `c` or "Resume in Claude Code" button: Continue session with `claude -r <sessionId>`
  - `r` or "Refresh" button: Reload session data from files
  - `p` or "Projects View" button: Switch to project selector view
- **Project Statistics**: Real-time display of total sessions, messages, tokens, and date range
- **Cache Integration**: Leverages existing cache system for fast loading with automatic cache validation
- **Keyboard Navigation**: Arrow keys to navigate, Enter to expand row details, `q` to quit
- **Row Expansion**: Press Enter to expand selected row showing full summary, first user message, working directory, and detailed token usage

**Working Directory Matching:**

The TUI automatically identifies Claude projects that match your current working directory by:

1. **Cache-based Matching**: Uses stored working directories from session messages (`cwd` field)
2. **Path-based Matching**: Falls back to Claude's project naming convention (replacing `/` with `-`)
3. **Smart Prioritization**: When multiple projects are found, prioritizes those matching your current directory
4. **Subdirectory Support**: Matches parent directories, so you can run the TUI from anywhere within a project

### Default Behavior (Process All Projects)

```bash
# Process all projects in ~/.claude/projects/ (default behavior)
claude-code-log

# Explicitly process all projects
claude-code-log --all-projects

# Process all projects with custom output directory
claude-code-log --all-projects -o /path/to/output

# Process all projects and open in browser
claude-code-log --open-browser

# Process all projects with date filtering
claude-code-log --from-date "yesterday" --to-date "today"
claude-code-log --from-date "last week"

# Skip individual session files (only create combined transcripts)
claude-code-log --no-individual-sessions
```

**Default output locations:**

- `~/.claude/projects/index.html` - Master index with project cards and statistics
- `~/.claude/projects/project-name/combined_transcripts.html` - Individual project pages
- `~/.claude/projects/project-name/session-{session-id}.html` - Individual session pages

**With custom output directory (`-o /path/to/output`):**

- `/path/to/output/index.html` - Master index
- `/path/to/output/project-name/combined_transcripts.html` - Individual project pages
- `/path/to/output/project-name/session-{session-id}.html` - Individual session pages

### Single File or Directory Processing

```bash
# Single file
claude-code-log transcript.jsonl

# Specific directory
claude-code-log /path/to/transcript/directory

# Custom output location
claude-code-log /path/to/directory -o combined_transcripts.html

# Open in browser after conversion
claude-code-log /path/to/directory --open-browser

# Filter by date range (supports natural language)
claude-code-log /path/to/directory --from-date "yesterday" --to-date "today"
claude-code-log /path/to/directory --from-date "3 days ago" --to-date "yesterday"
```

## File Structure

### Core Library

- `claude_code_log/parser.py` - Data extraction and parsing from JSONL files
- `claude_code_log/renderer.py` - HTML generation and template rendering
- `claude_code_log/renderer_timings.py` - Performance timing instrumentation
- `claude_code_log/converter.py` - High-level conversion orchestration with output_dir support
- `claude_code_log/cli.py` - Command-line interface with project discovery
- `claude_code_log/models.py` - Pydantic models for transcript data structures
- `claude_code_log/tui.py` - Interactive Terminal User Interface using Textual
- `claude_code_log/cache.py` - Cache management for performance optimization
- `claude_code_log/templates/` - Jinja2 HTML templates
  - `transcript.html` - Main transcript viewer template
  - `index.html` - Project directory index template
  - `vendor/vis-timeline.min.js` - Inlined timeline visualization library
  - `vendor/vis-timeline.min.css` - Timeline styles
- `pyproject.toml` - Project configuration with dependencies

### Desktop Application

- `app/claudecodelog/app.py` - Main Toga GUI application
- `app/claudecodelog/claude_code_log/` - Bundled copy of core library
- `app/pyproject.toml` - Briefcase packaging configuration
- `app/resources/icon.icns` - macOS application icon
- `app/resources/icon.png` - Source icon image

## Development

The project uses:

- Python 3.10+ with uv package management
- Click for CLI interface and argument parsing
- Textual for interactive Terminal User Interface
- Toga for cross-platform desktop GUI (desktop app only)
- Briefcase for application packaging and distribution (desktop app only)
- Pydantic for robust data modelling and validation
- Jinja2 for HTML template rendering
- dateparser for natural language date parsing
- Standard library for JSON/HTML processing
- Minimal dependencies for portability (core library)
- mistune for quick Markdown rendering

## Development Commands

### Testing

The project uses a categorized test system to avoid async event loop conflicts between different testing frameworks:

#### Test Categories

- **Unit Tests** (no mark): Fast, standalone tests with no external dependencies
- **TUI Tests** (`@pytest.mark.tui`): Tests for the Textual-based Terminal User Interface
- **Browser Tests** (`@pytest.mark.browser`): Playwright-based tests that run in real browsers
- **Snapshot Tests**: HTML regression tests using syrupy (runs with unit tests)

#### Snapshot Testing

Snapshot tests detect unintended HTML output changes using [syrupy](https://github.com/syrupy-project/syrupy):

```bash
# Run snapshot tests
uv run pytest -n auto test/test_snapshot_html.py -v

# Update snapshots after intentional HTML changes
uv run pytest -n auto test/test_snapshot_html.py --snapshot-update
```

#### Running Tests

```bash
# Run only unit tests (fast, recommended for development)
just test
# or: uv run pytest -n auto -m "not (tui or browser)" -v

# Run TUI tests (isolated event loop)
just test-tui
# or: uv run pytest -n auto -m tui

# Run browser tests (requires Chromium)
just test-browser
# or: uv run pytest -n auto -m browser

# Run all tests in sequence (separated to avoid conflicts)
just test-all

# Run tests with coverage (all categories)
just test-cov
```

#### Prerequisites

Browser tests require Chromium to be installed:

```bash
uv run playwright install chromium
```

#### Why Test Categories?

The test suite is categorized because:

- **TUI tests** use Textual's async event loop (`run_test()`)
- **Browser tests** use Playwright's internal asyncio
- **pytest-asyncio** manages async test execution

Running all tests together can cause "RuntimeError: This event loop is already running" conflicts. The categorization ensures reliable test execution by isolating different async frameworks.

### Test Coverage

Generate test coverage reports:

```bash
# Run all tests with coverage (recommended)
just test-cov

# Or run coverage manually
uv run pytest -n auto --cov=claude_code_log --cov-report=html --cov-report=term

# Generate HTML coverage report only
uv run pytest -n auto --cov=claude_code_log --cov-report=html

# View coverage in terminal
uv run pytest -n auto --cov=claude_code_log --cov-report=term-missing
```

HTML coverage reports are generated in `htmlcov/index.html`.

### Code Quality

- **Format code**: `ruff format`
- **Lint and fix**: `ruff check --fix`
- **Type checking**: `uv run pyright` and `uv run ty check`

### Performance Profiling

Enable timing instrumentation to identify performance bottlenecks:

```bash
# Enable timing output
CLAUDE_CODE_LOG_DEBUG_TIMING=1 claude-code-log path/to/file.jsonl

# Or export for a session
export CLAUDE_CODE_LOG_DEBUG_TIMING=1
claude-code-log path/to/file.jsonl
```

This outputs detailed timing for each rendering phase:

```
[TIMING] Initialization                      0.001s (total:    0.001s)
[TIMING] Deduplication (1234 messages)       0.050s (total:    0.051s)
[TIMING] Session summary processing          0.012s (total:    0.063s)
[TIMING] Main message processing loop        5.234s (total:    5.297s)
[TIMING] Template rendering (30MB chars)    15.432s (total:   20.729s)

[TIMING] Loop statistics:
[TIMING]   Total messages: 1234
[TIMING]   Average time per message: 4.2ms
[TIMING]   Slowest 10 messages:
[TIMING]     Message abc-123 (#42, assistant): 245.3ms
[TIMING]     ...

[TIMING] Pygments highlighting:
[TIMING]   Total operations: 89
[TIMING]   Total time: 1.234s
[TIMING]   Slowest 10 operations:
[TIMING]     def-456: 50.2ms
[TIMING]     ...
```

The timing module is in `claude_code_log/renderer_timings.py`.

### Testing & Style Guide

- **Unit and Integration Tests**: See [test/README.md](test/README.md) for comprehensive testing documentation
- **Visual Style Guide**: `uv run python scripts/generate_style_guide.py`
- **Manual Testing**: Use representative test data in `test/test_data/`

Test with Claude transcript JSONL files typically found in `~/.claude/projects/` directories.

### Dependency management

The project uses `uv` so:

```sh
# Add a new dep
uv add textual

# Remove a dep
uv remove textual
```

## Architecture Notes

### Data Models

The application uses Pydantic models to parse and validate transcript JSON data:

- **TranscriptEntry**: Union of UserTranscriptEntry, AssistantTranscriptEntry, SummaryTranscriptEntry
- **UsageInfo**: Token usage tracking (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)
- **ContentItem**: Union of TextContent, ToolUseContent, ToolResultContent, ThinkingContent, ImageContent

### Output Directory Support

The `process_projects_hierarchy()` function now supports an optional `output_dir` parameter:

- **Default behavior**: Saves HTML files to `~/.claude/projects/` (co-located with JSONL files)
- **Custom output directory**: When `output_dir` is provided, creates project subdirectories in the output location
- **Structure preservation**: Maintains the same directory structure (`project-name/combined_transcripts.html`, `project-name/session-{id}.html`)
- **Used by**: Desktop GUI app when user selects a custom output location

### Template System

Uses Jinja2 templates for HTML generation:

- **Session Navigation**: Generates table of contents with timestamp ranges and token summaries
- **Message Rendering**: Handles different content types with appropriate formatting
- **Token Display**: Shows usage for individual assistant messages and session totals

### Token Usage Features

- **Individual Messages**: Assistant messages display token usage in header
- **Session Aggregation**: ToC shows total tokens consumed per session
- **Format**: "Input: X | Output: Y | Cache Creation: Z | Cache Read: W"
- **Data Source**: Extracted from AssistantMessage.usage field in JSONL

### Session Management

- **Session Detection**: Groups messages by sessionId field
- **Summary Attachment**: Links session summaries via leafUuid -> message UUID -> session ID mapping
- **Timestamp Tracking**: Records first and last timestamp for each session
- **Navigation**: Generates clickable ToC with session previews and metadata

### Timeline Component

The interactive timeline is implemented in JavaScript within `claude_code_log/templates/components/timeline.html`. It parses message types from CSS classes generated by the Python renderer. **Important**: When adding new message types or modifying CSS class generation in `renderer.py`, ensure the timeline's message type detection logic is updated accordingly to maintain feature parity. Also, make sure that the filter is still applied consistently to the messages both in the main transcript and in the timeline. You can use Playwright to test browser runtime features.

### Desktop Application Architecture

The desktop GUI application uses a queue-based threading pattern to ensure responsive UI during long-running conversions:

**Threading Pattern:**

- **Main Thread**: Toga UI event loop, handles user interactions and UI updates
- **Worker Thread**: Runs conversion processing in background (calls `convert_jsonl_to_html()` or `process_projects_hierarchy()`)
- **Queue**: Communication channel from worker thread to main thread for log messages

**Log Redirection:**

- Custom `QueueWriter` class redirects Python's `stdout` and `stderr` to queue
- Monkey-patches `click.echo()` to send output to queue instead of stdout
- Main thread polls queue asynchronously with `await asyncio.sleep(0.1)` between checks
- Logs displayed in UI with newest at top (prepend instead of append) for better visibility

**UI Components:**

- **Mode Selection**: Dropdown for All Projects, Directory, or Single File mode
- **Input/Output Paths**: TextInput with Browse buttons using Toga file dialogs
- **Date Filters**: TextInput fields accepting natural language dates
- **Options**: Switch widgets for browser auto-open, skip sessions, clear cache
- **Status Log**: MultilineTextInput with 500-line limit and auto-scroll to top
- **Convert Button**: Disabled during processing, text changes to "Converting..."

**Key Implementation Details:**

- Uses `asyncio.create_task()` instead of deprecated `add_background_task()`
- Uses `toga.SelectFolderDialog()` instead of deprecated `select_folder_dialog()`
- Uses `Pack.margin=` instead of deprecated `Pack.padding=`
- Ad-hoc signing for macOS development builds (production would need proper signing)
