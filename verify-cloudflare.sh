#!/bin/bash

echo "🔍 Cloudflare Credentials Verification"
echo "====================================="
echo ""

# Check if credentials are provided as arguments
if [ $# -eq 2 ]; then
    CF_ACCOUNT_ID="$1"
    CF_API_TOKEN="$2"
else
    echo "Usage: $0 <CLOUDFLARE_ACCOUNT_ID> <CLOUDFLARE_API_TOKEN>"
    echo "Or run without arguments to be prompted"
    echo ""

    read -p "Enter CLOUDFLARE_ACCOUNT_ID: " CF_ACCOUNT_ID
    read -p "Enter CLOUDFLARE_API_TOKEN: " CF_API_TOKEN
fi

echo ""
echo "🔍 Verifying credentials..."
echo ""

# Test API token
echo "Testing API Token..."
TOKEN_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json")

if echo "$TOKEN_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    echo "✅ API Token is valid"
else
    echo "❌ API Token is invalid or expired"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

# Test account access
echo "Testing Account Access..."
ACCOUNT_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json")

if echo "$ACCOUNT_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    ACCOUNT_NAME=$(echo "$ACCOUNT_RESPONSE" | jq -r '.result.name')
    ACCOUNT_STATUS=$(echo "$ACCOUNT_RESPONSE" | jq -r '.result.status')
    echo "✅ Account access verified: $ACCOUNT_NAME (Status: $ACCOUNT_STATUS)"
else
    echo "❌ Cannot access account or invalid Account ID"
    echo "Response: $ACCOUNT_RESPONSE"
    exit 1
fi

# Check Pages access
echo "Testing Pages Access..."
PAGES_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pages/projects" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json")

if echo "$PAGES_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    PROJECTS_COUNT=$(echo "$PAGES_RESPONSE" | jq '.result | length')
    echo "✅ Pages API access verified ($PROJECTS_COUNT projects found)"
else
    echo "❌ Pages API access failed - check token permissions"
    echo "Response: $PAGES_RESPONSE"
    exit 1
fi

echo ""
echo "🎉 All credentials verified successfully!"
echo ""
echo "📝 GitHub Secrets Setup Instructions:"
echo "====================================="
echo ""
echo "1. Go to: https://github.com/YOUR_USERNAME/reader/settings/secrets/actions"
echo ""
echo "2. Click 'New repository secret' and add:"
echo ""
echo "   Name: CLOUDFLARE_API_TOKEN"
echo "   Value: $CF_API_TOKEN"
echo ""
echo "3. Click 'New repository secret' again and add:"
echo ""
echo "   Name: CLOUDFLARE_ACCOUNT_ID"
echo "   Value: $CF_ACCOUNT_ID"
echo ""
echo "4. Push to main branch to trigger deployment"
echo ""
echo "🚀 Your app will be available at:"
echo "   • Frontend: https://nexus-reader.pages.dev"
echo "   • API: https://api.nexus-reader.pages.dev"
echo ""
echo "💡 Note: First deployment may take 2-3 minutes"