#!/bin/bash

# Script để init Git repo và push lên GitHub

set -e

echo "🚀 Git Setup & Push to GitHub"
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "📦 Initializing Git repository..."
    git init
    git branch -M main
else
    echo "✅ Git already initialized"
fi

# Add all files
echo "📝 Adding files..."
git add .

# Commit
echo "💾 Committing..."
read -p "Commit message (default: 'Initial commit'): " COMMIT_MSG
COMMIT_MSG=${COMMIT_MSG:-"Initial commit"}
git commit -m "$COMMIT_MSG" || echo "No changes to commit"

# Get GitHub username
echo ""
read -p "GitHub username: " GH_USER
read -p "Repository name (default: claude-reporter-setup): " REPO_NAME
REPO_NAME=${REPO_NAME:-"claude-reporter-setup"}

# Update package.json with correct repo URL
echo "🔧 Updating package.json..."
sed -i.bak "s|yourusername|$GH_USER|g" package.json
rm package.json.bak 2>/dev/null || true

# Add remote
echo "🔗 Adding remote..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$GH_USER/$REPO_NAME.git"

echo ""
echo "📋 Next steps:"
echo ""
echo "1. Create GitHub repository:"
echo "   https://github.com/new"
echo "   Repository name: $REPO_NAME"
echo ""
echo "2. Push to GitHub:"
echo "   git push -u origin main"
echo ""
echo "3. Setup NPM:"
echo "   - Login: npm login"
echo "   - Update package.json with your info"
echo "   - Publish: npm publish --access public"
echo ""
echo "4. (Optional) Setup GitHub Actions:"
echo "   - Go to: https://github.com/$GH_USER/$REPO_NAME/settings/secrets"
echo "   - Add NPM_TOKEN secret"
echo ""
echo "✅ Git setup complete!"
echo ""
echo "Quick publish command:"
echo "  npm login && npm publish --access public"
