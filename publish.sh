#!/bin/bash

# Auto-publish to NPM script

set -e

echo "================================================"
echo "🚀 NPM PUBLISH WIZARD"
echo "================================================"
echo ""

# Check if logged in
if ! npm whoami &> /dev/null; then
    echo "❌ Not logged in to NPM"
    echo ""
    echo "Please login first:"
    echo "  npm login"
    echo ""
    exit 1
fi

NPM_USER=$(npm whoami)
echo "✅ Logged in as: $NPM_USER"
echo ""

# Check package.json
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found!"
    exit 1
fi

# Get current package info
PKG_NAME=$(node -p "require('./package.json').name")
PKG_VERSION=$(node -p "require('./package.json').version")

echo "📦 Package: $PKG_NAME"
echo "📌 Version: $PKG_VERSION"
echo ""

# Check if package name contains username
if [[ ! $PKG_NAME == *"$NPM_USER"* ]]; then
    echo "⚠️  Warning: Package name doesn't contain your username"
    echo "   Current: $PKG_NAME"
    echo "   Suggested: @$NPM_USER/claude-reporter-setup"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run tests
echo "🧪 Running tests..."
if npm test; then
    echo "✅ Tests passed"
else
    echo "❌ Tests failed"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# Check if version already published
echo "🔍 Checking if version already exists..."
if npm view "$PKG_NAME@$PKG_VERSION" &> /dev/null; then
    echo "❌ Version $PKG_VERSION already published!"
    echo ""
    echo "You need to bump the version:"
    echo "  npm version patch   # 1.0.0 → 1.0.1"
    echo "  npm version minor   # 1.0.0 → 1.1.0"
    echo "  npm version major   # 1.0.0 → 2.0.0"
    echo ""
    exit 1
fi
echo "✅ Version is new"
echo ""

# Dry run
echo "🔍 Running dry-run..."
npm publish --dry-run --access public

echo ""
echo "================================================"
echo "📋 SUMMARY"
echo "================================================"
echo "Package:  $PKG_NAME"
echo "Version:  $PKG_VERSION"
echo "Author:   $NPM_USER"
echo ""
echo "After publishing, users can install with:"
echo "  npx $PKG_NAME"
echo ""
echo "================================================"
echo ""

read -p "Publish to NPM? (y/n) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Publish!
echo ""
echo "🚀 Publishing to NPM..."
npm publish --access public

echo ""
echo "================================================"
echo "🎉 SUCCESS!"
echo "================================================"
echo ""
echo "✅ Published: $PKG_NAME@$PKG_VERSION"
echo ""
echo "📦 View on NPM:"
echo "   https://www.npmjs.com/package/$PKG_NAME"
echo ""
echo "🧪 Test install:"
echo "   npx $PKG_NAME"
echo ""
echo "📊 Track stats:"
echo "   https://www.npmjs.com/settings/$NPM_USER/packages"
echo ""
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Test: npx $PKG_NAME"
echo "2. Share on social media"
echo "3. Update GitHub README"
echo "4. Celebrate! 🎊"
echo ""
