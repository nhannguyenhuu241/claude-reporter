#!/bin/bash
# Build Linux app using Docker (works on macOS/Windows)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🐳 Building Linux app using Docker..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

cd "$PROJECT_ROOT"

# Build Docker image
echo "📦 Building Docker image (this may take a few minutes first time)..."
docker build -f app/Dockerfile.linux -t claude-code-log-linux-builder .

# Create dist directory if not exists
mkdir -p "$SCRIPT_DIR/dist"

# Run container and copy output
echo "🔧 Running build..."
CONTAINER_ID=$(docker create claude-code-log-linux-builder)

# Copy the built files from container
echo "📂 Extracting build artifacts..."
docker cp "$CONTAINER_ID:/build/app/dist/." "$SCRIPT_DIR/dist/"

# Cleanup container
docker rm "$CONTAINER_ID" > /dev/null

echo ""
echo "✅ Build complete!"
echo ""
echo "📁 Output location: $SCRIPT_DIR/dist/"
ls -la "$SCRIPT_DIR/dist/"*.deb 2>/dev/null || echo "No .deb files found"
echo ""
echo "To install on Ubuntu/Debian:"
echo "  sudo dpkg -i dist/*.deb"
