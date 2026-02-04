#!/bin/bash

echo "🛡️  NexusLite Security Monitor"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for required tools
echo "🔍 Checking security tools..."

if command_exists npm; then
    echo -e "${GREEN}✅ npm available${NC}"

    # Check for vulnerabilities in frontend
    echo ""
    echo "📦 Checking frontend dependencies..."
    cd nexus-reader
    if [ -f "package-lock.json" ] || [ -f "bun.lock" ]; then
        npm audit --audit-level moderate --json > ../audit-frontend.json 2>/dev/null || echo -e "${YELLOW}⚠️  Unable to run npm audit${NC}"
    else
        echo -e "${YELLOW}⚠️  No lockfile found for frontend${NC}"
    fi
    cd ..
else
    echo -e "${RED}❌ npm not available${NC}"
fi

if command_exists cargo; then
    echo -e "${GREEN}✅ cargo available${NC}"

    # Check for vulnerabilities in Rust code
    echo ""
    echo "🦀 Checking Rust dependencies..."
    cd nexus-lite
    cargo audit > ../audit-rust.txt 2>/dev/null || echo -e "${YELLOW}⚠️  Unable to run cargo audit (may need: cargo install cargo-audit)${NC}"
    cd ..
else
    echo -e "${RED}❌ cargo not available${NC}"
fi

# Check for common security issues
echo ""
echo "🔒 Checking for common security issues..."

# Check for exposed secrets
echo "🔑 Checking for exposed secrets..."
if grep -r "password\|secret\|token\|key" --include="*.js" --include="*.ts" --include="*.rs" --include="*.py" . \
    --exclude-dir=node_modules --exclude-dir=target --exclude-dir=.git | grep -v "password.*=.*process\|secret.*=.*process\|token.*=.*process\|key.*=.*process" > secrets-found.txt; then
    echo -e "${RED}❌ Potential exposed secrets found!${NC}"
    echo "Check secrets-found.txt for details"
else
    echo -e "${GREEN}✅ No obvious exposed secrets found${NC}"
fi

# Check for insecure configurations
echo "⚙️  Checking configurations..."
if grep -r "http://" --include="*.js" --include="*.ts" --include="*.rs" . \
    --exclude-dir=node_modules --exclude-dir=target --exclude-dir=.git | grep -v "https://" > insecure-urls.txt; then
    echo -e "${YELLOW}⚠️  Found HTTP URLs (should be HTTPS in production)${NC}"
    echo "Check insecure-urls.txt for details"
else
    echo -e "${GREEN}✅ No HTTP URLs found in production code${NC}"
fi

# Generate security report
echo ""
echo "📋 Security Report Generated:"
echo "============================"
echo "• Frontend audit: audit-frontend.json"
echo "• Rust audit: audit-rust.txt"
echo "• Secrets check: secrets-found.txt"
echo "• URL security: insecure-urls.txt"
echo ""

# Recommendations
echo "💡 Security Recommendations:"
echo "==========================="
echo "1. 🔄 Run Dependabot weekly to keep dependencies updated"
echo "2. 🛡️  Enable CodeQL security scanning on GitHub"
echo "3. 🔍 Review audit reports regularly"
echo "4. 🚨 Address high-priority vulnerabilities immediately"
echo "5. 🔐 Never commit secrets or credentials"
echo "6. 🔒 Use HTTPS for all production URLs"
echo ""

echo "✅ Security monitoring completed!"
echo ""
echo "To run this script regularly:"
echo "  chmod +x scripts/security-monitor.sh"
echo "  ./scripts/security-monitor.sh"