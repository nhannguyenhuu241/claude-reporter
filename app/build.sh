#!/bin/bash
# Build script for macOS

set -e

echo "🔨 Building Claude Code Log Desktop App for macOS..."

# Install briefcase if not already installed
if ! command -v briefcase &> /dev/null; then
    echo "📦 Installing Briefcase..."
    uv tool install briefcase
fi

cd "$(dirname "$0")"

# Sync source files from parent directory
echo "🔄 Syncing source files..."
cp -r ../claude_code_log/*.py claudecodelog/claude_code_log/
cp -r ../claude_code_log/templates claudecodelog/claude_code_log/
echo "✅ Source files synced"

# Create the app scaffold (first time only)
if [ ! -d "build" ]; then
    echo "🏗️  Creating app scaffold..."
    briefcase create
    echo "📦 Installing dependencies..."
    briefcase update -r
fi

# Build for current platform
echo "🔧 Building for current platform..."
briefcase build

# Package the app (ad-hoc signing for development)
echo "📦 Packaging app (ad-hoc signing)..."
briefcase package --adhoc-sign

echo ""
echo "✅ Build complete!"
echo ""
echo "macOS app location: $(pwd)/dist/Claude Code Log.app"
echo ""
echo "To run the app:"
echo "  briefcase run"
echo ""
echo "To build for Windows (requires Windows or VM):"
echo "  briefcase build windows"
echo "  briefcase package windows"
