#!/bin/bash

# Demo script - Test the package locally

echo "🎬 Claude Reporter - Demo Mode"
echo "==============================="
echo ""

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this from the project root"
    exit 1
fi

echo "This demo will:"
echo "1. Install dependencies"
echo "2. Link package locally"
echo "3. Run setup wizard"
echo "4. Show you what users will see"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install --quiet

# Link locally
echo "🔗 Linking package..."
npm link --quiet

# Show package info
echo ""
echo "✅ Package linked!"
echo ""
echo "📋 Package info:"
node -e "console.log(JSON.stringify(require('./package.json'), null, 2))" | grep -E '(name|version|description)'

echo ""
echo "🎯 Now you can run:"
echo "   claude-reporter-setup"
echo ""
echo "Or test the help:"
echo "   claude-reporter-setup --help"
echo ""
read -p "Run setup wizard now? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 Starting setup wizard..."
    echo "   (You can press Ctrl+C to cancel at any time)"
    echo ""
    sleep 2
    claude-reporter-setup
fi

echo ""
echo "🧹 Cleanup"
read -p "Unlink package? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm unlink --quiet
    echo "✅ Package unlinked"
fi

echo ""
echo "🎉 Demo complete!"
echo ""
echo "Next steps:"
echo "1. Review the files"
echo "2. Customize as needed"
echo "3. Run ./ALL_IN_ONE.sh to publish"
echo ""
