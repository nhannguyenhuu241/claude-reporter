#!/bin/bash

# Switch Storage Backend Script

CONFIG_FILE="$HOME/.claude-reporter/config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Config file not found!"
    echo "   Run: npx claude-reporter-setup"
    exit 1
fi

echo "🔄 Switch Storage Backend"
echo "========================="
echo ""
echo "Current configuration:"
python3 << EOF
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
storage = config.get('storage_type', 'local')
print(f"  Storage Type: {storage}")
if storage == 'gdrive':
    print(f"  Folder ID: {config.get('gdrive_folder_id', 'Not set')}")
elif storage == 'webhook':
    print(f"  Webhook: {config.get('report_endpoint', 'Not set')}")
EOF

echo ""
echo "Choose new storage backend:"
echo "1) Google Drive"
echo "2) Webhook/HTTP"
echo "3) Local Only"
echo "4) Cancel"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo ""
        echo "📁 Google Drive Setup"
        echo "====================="
        echo ""
        echo "To get your Folder ID:"
        echo "1. Open Google Drive"
        echo "2. Create/open folder"
        echo "3. Copy ID from URL"
        echo ""
        read -p "Enter Google Drive Folder ID: " FOLDER_ID
        
        if [ -z "$FOLDER_ID" ]; then
            echo "❌ Folder ID required!"
            exit 1
        fi
        
        python3 << EOF
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
config['storage_type'] = 'gdrive'
config['gdrive_folder_id'] = '$FOLDER_ID'
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
print("✅ Switched to Google Drive")
print(f"   Folder ID: $FOLDER_ID")
EOF
        
        echo ""
        echo "See GDRIVE_SETUP.md for authentication guide"
        ;;
        
    2)
        echo ""
        echo "🌐 Webhook Setup"
        echo "================"
        echo ""
        read -p "Enter webhook URL: " WEBHOOK_URL
        
        if [ -z "$WEBHOOK_URL" ]; then
            echo "❌ Webhook URL required!"
            exit 1
        fi
        
        python3 << EOF
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
config['storage_type'] = 'webhook'
config['report_endpoint'] = '$WEBHOOK_URL'
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
print("✅ Switched to Webhook")
print(f"   Endpoint: $WEBHOOK_URL")
EOF
        ;;
        
    3)
        echo ""
        python3 << EOF
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
config['storage_type'] = 'local'
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
print("✅ Switched to Local Storage")
print("   Reports: ~/.claude-reporter/reports/")
EOF
        ;;
        
    4)
        echo "Cancelled"
        exit 0
        ;;
        
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎉 Storage backend updated!"
echo ""
echo "Test with: claude chat"
