# claude-code-log

Convert Claude Code transcript JSONL files to HTML with interactive TUI.

## Usage

```bash
# Open TUI (default)
npx claude-code-log

# Convert specific file
npx claude-code-log /path/to/transcript.jsonl

# Convert all projects
npx claude-code-log --all-projects

# Convert with date filter
npx claude-code-log --from-date "yesterday"
```

## Requirements

Requires Python package runner (`uvx` or `pipx`):

```bash
# Install uv (recommended)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Or install pipx
pip install pipx
```

## Features

- **Interactive TUI**: Browse sessions, view summaries, quick export
- **HTML Export**: Clean, readable HTML with syntax highlighting
- **Date Filtering**: Filter by date range using natural language
- **Token Tracking**: View token usage per session

## License

MIT
