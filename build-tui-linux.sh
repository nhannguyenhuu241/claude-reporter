#!/bin/bash
# Build standalone TUI binary for Linux using Docker

set -e

echo "🐳 Building Linux TUI binary..."

if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Build Docker image
echo "📦 Building Docker image..."
docker build -f Dockerfile.tui -t claude-code-log-tui-builder .

# Extract binary
mkdir -p dist
CONTAINER_ID=$(docker create claude-code-log-tui-builder)
docker cp "$CONTAINER_ID:/build/dist/claude-code-log" dist/claude-code-log-linux
docker rm "$CONTAINER_ID" > /dev/null

echo ""
echo "✅ Build complete!"
echo ""
echo "📁 Binary: dist/claude-code-log-linux"
ls -lh dist/claude-code-log-linux
echo ""
echo "Usage on Linux:"
echo "  chmod +x claude-code-log-linux"
echo "  ./claude-code-log-linux --tui"
