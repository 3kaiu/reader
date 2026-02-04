#!/bin/bash

echo "🚀 Cloudflare Free Tier Setup Guide"
echo "===================================="
echo ""

# Check if required tools are installed
command -v curl >/dev/null 2>&1 || { echo "❌ curl is required but not installed. Please install curl."; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "❌ jq is required but not installed. Please install jq."; exit 1; }

echo "📋 Step 1: Get your Cloudflare Account ID"
echo "----------------------------------------"
echo "1. Go to: https://dash.cloudflare.com/"
echo "2. Click on your account name in the top right"
echo "3. Copy the Account ID from the bottom of the page"
echo ""
read -p "Enter your Cloudflare Account ID: " CF_ACCOUNT_ID
echo ""

echo "🔑 Step 2: Create Cloudflare API Token"
echo "-------------------------------------"
echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
echo "2. Click 'Create Token'"
echo "3. Choose 'Edit Cloudflare Workers' template"
echo "4. Or create custom token with these permissions:"
echo "   - Account: Cloudflare Pages:Edit"
echo "   - Account: Cloudflare Workers:Edit"
echo "   - Account: Account Settings:Read"
echo "   - Zone: Page Rules:Edit (if you have domains)"
echo "   - Zone: Zone:Read (if you have domains)"
echo ""
read -p "Enter your Cloudflare API Token: " CF_API_TOKEN
echo ""

echo "⚙️ Step 3: Set up GitHub Secrets"
echo "------------------------------"
echo "Go to: https://github.com/YOUR_USERNAME/reader/settings/secrets/actions"
echo ""
echo "Create these secrets:"
echo "• CLOUDFLARE_API_TOKEN = $CF_API_TOKEN"
echo "• CLOUDFLARE_ACCOUNT_ID = $CF_ACCOUNT_ID"
echo ""

echo "🔍 Step 4: Verify Configuration"
echo "------------------------------"

# Test the API token
echo "Testing Cloudflare API Token..."
RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json")

if echo "$RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
    echo "✅ API Token is valid"
else
    echo "❌ API Token is invalid"
    echo "Response: $RESPONSE"
    exit 1
fi

# Get account details
echo "Getting account information..."
ACCOUNT_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json")

if echo "$ACCOUNT_RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
    ACCOUNT_NAME=$(echo "$ACCOUNT_RESPONSE" | jq -r '.result.name')
    echo "✅ Account verified: $ACCOUNT_NAME"
else
    echo "❌ Could not verify account"
    echo "Response: $ACCOUNT_RESPONSE"
    exit 1
fi

echo ""
echo "🎯 Step 5: Create Cloudflare Resources"
echo "-------------------------------------"

echo "Creating Cloudflare Pages project..."
PAGES_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "nexus-reader",
    "production_branch": "main",
    "build_config": {
      "build_command": "npm run build",
      "destination_dir": "dist",
      "root_dir": "nexus-reader",
      "web_analytics_tag": "'$CF_ACCOUNT_ID'",
      "web_analytics_token": "your_analytics_token"
    }
  }')

if echo "$PAGES_RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
    echo "✅ Cloudflare Pages project created"
else
    echo "⚠️ Cloudflare Pages project may already exist or creation failed"
    echo "Response: $PAGES_RESPONSE"
fi

echo ""
echo "📝 Step 6: GitHub Secrets Setup"
echo "------------------------------"
echo "Add these to your GitHub repository secrets:"
echo ""
echo "CLOUDFLARE_API_TOKEN=$CF_API_TOKEN"
echo "CLOUDFLARE_ACCOUNT_ID=$CF_ACCOUNT_ID"
echo ""

echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "Your NexusLite app will now automatically deploy to:"
echo "• Frontend: https://nexus-reader.pages.dev"
echo "• API: https://api.nexus-reader.pages.dev"
echo ""
echo "Push to main branch to trigger deployment!"
echo ""
echo "Free tier limits:"
echo "• Pages: Unlimited static sites"
echo "• Workers: 100K requests/day"
echo "• KV: 1GB storage"
echo "• Analytics: Real-time dashboards"