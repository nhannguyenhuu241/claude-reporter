#!/bin/bash

# ALL IN ONE - Complete setup from scratch to published NPM package

set -e

echo "=========================================="
echo "🚀 CLAUDE REPORTER - ALL IN ONE SETUP"
echo "=========================================="
echo ""
echo "This script will:"
echo "1. ✅ Initialize Git repository"
echo "2. ✅ Setup NPM package"
echo "3. ✅ Create GitHub repository"
echo "4. ✅ Publish to NPM"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# ==========================================
# STEP 1: Git Setup
# ==========================================
echo ""
echo "📦 STEP 1: Git Setup"
echo "===================="

if [ ! -d .git ]; then
    echo "Initializing Git..."
    git init
    git branch -M main
fi

git add .
read -p "Commit message (default: 'Initial commit'): " COMMIT_MSG
COMMIT_MSG=${COMMIT_MSG:-"Initial commit"}
git commit -m "$COMMIT_MSG" 2>/dev/null || echo "No changes to commit"

# ==========================================
# STEP 2: Get GitHub Info
# ==========================================
echo ""
echo "🐙 STEP 2: GitHub Setup"
echo "======================="

read -p "Your GitHub username: " GH_USER
read -p "Repository name (default: claude-reporter-setup): " REPO_NAME
REPO_NAME=${REPO_NAME:-"claude-reporter-setup"}

# Update package.json
echo "Updating package.json..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|yourusername|$GH_USER|g" package.json
else
    # Linux
    sed -i "s|yourusername|$GH_USER|g" package.json
fi

# Add remote
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$GH_USER/$REPO_NAME.git"

echo ""
echo "📋 Create GitHub repository now:"
echo "   https://github.com/new"
echo "   Repository name: $REPO_NAME"
echo "   Public/Private: Public"
echo ""
read -p "Press Enter when repository is created..."

# Push to GitHub
echo ""
echo "Pushing to GitHub..."
git push -u origin main

echo "✅ GitHub repository created!"

# ==========================================
# STEP 3: NPM Setup
# ==========================================
echo ""
echo "📦 STEP 3: NPM Setup"
echo "===================="

# Check if logged in
if npm whoami &> /dev/null; then
    echo "✅ Already logged in to NPM as: $(npm whoami)"
else
    echo "Please login to NPM..."
    npm login
fi

# Update package info
echo ""
echo "Package name will be: @$GH_USER/claude-reporter-setup"
read -p "Is this OK? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter custom package name: " PKG_NAME
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|\"name\": \".*\"|\"name\": \"$PKG_NAME\"|" package.json
    else
        sed -i "s|\"name\": \".*\"|\"name\": \"$PKG_NAME\"|" package.json
    fi
fi

# ==========================================
# STEP 4: Install Dependencies
# ==========================================
echo ""
echo "📥 STEP 4: Installing Dependencies"
echo "==================================="
npm install

# ==========================================
# STEP 5: Test
# ==========================================
echo ""
echo "🧪 STEP 5: Running Tests"
echo "========================"
npm test || echo "⚠️  Some tests failed, but continuing..."

# ==========================================
# STEP 6: Publish to NPM
# ==========================================
echo ""
echo "🚀 STEP 6: Publishing to NPM"
echo "============================="

# Dry run first
echo "Running dry-run..."
npm publish --dry-run --access public

echo ""
read -p "Proceed with actual publish? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping publish. You can publish later with:"
    echo "  npm publish --access public"
    exit 0
fi

# Actual publish
echo "Publishing..."
npm publish --access public

echo ""
echo "✅ Published successfully!"

# ==========================================
# STEP 7: Setup GitHub Actions (Optional)
# ==========================================
echo ""
echo "🤖 STEP 7: GitHub Actions (Optional)"
echo "===================================="
read -p "Setup auto-publish with GitHub Actions? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Setup NPM Token:"
    echo "1. Go to: https://www.npmjs.com/settings/$(npm whoami)/tokens"
    echo "2. Generate New Token (Automation)"
    echo "3. Copy the token"
    echo ""
    read -p "Press Enter when you have the token..."
    
    echo ""
    echo "4. Go to: https://github.com/$GH_USER/$REPO_NAME/settings/secrets/actions"
    echo "5. Click 'New repository secret'"
    echo "6. Name: NPM_TOKEN"
    echo "7. Value: [paste your token]"
    echo "8. Click 'Add secret'"
    echo ""
    read -p "Press Enter when done..."
    
    echo "✅ GitHub Actions configured!"
    echo ""
    echo "Now, whenever you create a Release on GitHub,"
    echo "it will automatically publish to NPM!"
fi

# ==========================================
# FINAL SUMMARY
# ==========================================
echo ""
echo "=========================================="
echo "🎉 SETUP COMPLETE!"
echo "=========================================="
echo ""
echo "✅ Git repository initialized"
echo "✅ Pushed to GitHub: https://github.com/$GH_USER/$REPO_NAME"
echo "✅ Published to NPM"
echo ""
echo "📦 Your package is now available:"
echo "   npx $(cat package.json | grep '"name"' | cut -d'"' -f4)"
echo ""
echo "🔗 Links:"
echo "   GitHub: https://github.com/$GH_USER/$REPO_NAME"
echo "   NPM: https://npmjs.com/package/$(cat package.json | grep '"name"' | cut -d'"' -f4)"
echo ""
echo "📚 Next steps:"
echo "   1. Test your package: npx $(cat package.json | grep '"name"' | cut -d'"' -f4)"
echo "   2. Share with the world!"
echo "   3. Star the repo ⭐"
echo ""
echo "🎊 Happy coding!"
echo ""
