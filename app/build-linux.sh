#!/bin/bash
# Build script for Linux

set -e

echo "🔨 Building Claude Code Log Desktop App for Linux..."

# Check for required system dependencies
check_dependencies() {
    echo "🔍 Checking system dependencies..."

    # Detect distro
    if [ -f /etc/debian_version ]; then
        DISTRO="debian"
        MISSING_DEPS=""

        # Check for required packages
        for pkg in python3-dev libgirepository1.0-dev libcairo2-dev pkg-config gir1.2-gtk-3.0; do
            if ! dpkg -s "$pkg" &> /dev/null; then
                MISSING_DEPS="$MISSING_DEPS $pkg"
            fi
        done

        if [ -n "$MISSING_DEPS" ]; then
            echo "⚠️  Missing dependencies:$MISSING_DEPS"
            echo "📦 Installing dependencies (requires sudo)..."
            sudo apt update
            sudo apt install -y $MISSING_DEPS
        fi

    elif [ -f /etc/fedora-release ] || [ -f /etc/redhat-release ]; then
        DISTRO="fedora"
        MISSING_DEPS=""

        for pkg in python3-devel gobject-introspection-devel cairo-gobject-devel pkgconf gtk3; do
            if ! rpm -q "$pkg" &> /dev/null; then
                MISSING_DEPS="$MISSING_DEPS $pkg"
            fi
        done

        if [ -n "$MISSING_DEPS" ]; then
            echo "⚠️  Missing dependencies:$MISSING_DEPS"
            echo "📦 Installing dependencies (requires sudo)..."
            sudo dnf install -y $MISSING_DEPS
        fi

    elif [ -f /etc/arch-release ]; then
        DISTRO="arch"
        MISSING_DEPS=""

        for pkg in python gobject-introspection cairo pkgconf gtk3; do
            if ! pacman -Qs "$pkg" &> /dev/null; then
                MISSING_DEPS="$MISSING_DEPS $pkg"
            fi
        done

        if [ -n "$MISSING_DEPS" ]; then
            echo "⚠️  Missing dependencies:$MISSING_DEPS"
            echo "📦 Installing dependencies (requires sudo)..."
            sudo pacman -S --noconfirm $MISSING_DEPS
        fi
    else
        echo "⚠️  Unknown Linux distribution. Please install GTK3 development packages manually."
        DISTRO="unknown"
    fi

    echo "✅ System dependencies OK"
}

# Install uv if not present
install_uv() {
    if ! command -v uv &> /dev/null; then
        echo "📦 Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
    fi
}

# Install briefcase if not present
install_briefcase() {
    if ! command -v briefcase &> /dev/null; then
        echo "📦 Installing Briefcase..."
        uv tool install briefcase
    fi
}

# Sync source files
sync_source() {
    echo "🔄 Syncing source files..."
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    cp -r "$SCRIPT_DIR/../claude_code_log/"*.py "$SCRIPT_DIR/claudecodelog/claude_code_log/"
    cp -r "$SCRIPT_DIR/../claude_code_log/templates" "$SCRIPT_DIR/claudecodelog/claude_code_log/"
    echo "✅ Source files synced"
}

# Main build process
main() {
    cd "$(dirname "$0")"

    # Parse arguments
    PACKAGING_FORMAT="system"  # Default: system package (deb/rpm)
    while [[ $# -gt 0 ]]; do
        case $1 in
            --appimage)
                PACKAGING_FORMAT="appimage"
                shift
                ;;
            --flatpak)
                PACKAGING_FORMAT="flatpak"
                shift
                ;;
            --system)
                PACKAGING_FORMAT="system"
                shift
                ;;
            *)
                echo "Unknown option: $1"
                echo "Usage: $0 [--system|--appimage|--flatpak]"
                exit 1
                ;;
        esac
    done

    check_dependencies
    install_uv
    install_briefcase
    sync_source

    # Create the app scaffold (first time only)
    if [ ! -d "build/claudecodelog/linux" ]; then
        echo "🏗️  Creating app scaffold..."
        uv run briefcase create linux
        echo "📦 Installing dependencies..."
        uv run briefcase update linux -r
    fi

    # Build for Linux
    echo "🔧 Building for Linux..."
    uv run briefcase build linux

    # Package the app
    echo "📦 Packaging app ($PACKAGING_FORMAT)..."
    uv run briefcase package linux --packaging-format "$PACKAGING_FORMAT"

    echo ""
    echo "✅ Build complete!"
    echo ""
    echo "📁 Output location: $(pwd)/dist/"
    echo ""

    # Show installation instructions based on format
    case $PACKAGING_FORMAT in
        system)
            if [ "$DISTRO" = "debian" ]; then
                echo "To install (Debian/Ubuntu):"
                echo "  sudo dpkg -i dist/*.deb"
            elif [ "$DISTRO" = "fedora" ]; then
                echo "To install (Fedora/RHEL):"
                echo "  sudo rpm -i dist/*.rpm"
            elif [ "$DISTRO" = "arch" ]; then
                echo "To install (Arch):"
                echo "  sudo pacman -U dist/*.pkg.tar.zst"
            fi
            ;;
        appimage)
            echo "To run (AppImage - no installation needed):"
            echo "  chmod +x dist/*.AppImage"
            echo "  ./dist/*.AppImage"
            ;;
        flatpak)
            echo "To install (Flatpak):"
            echo "  flatpak install dist/*.flatpak"
            ;;
    esac

    echo ""
    echo "To run in development mode:"
    echo "  uv run briefcase run linux"
}

main "$@"
