#!/bin/bash

# =============================================================================
# Nexus Reader - Project Cleanup Script
# =============================================================================
# This script cleans up temporary files, build artifacts, and other clutter

set -e

echo "🧹 Starting Nexus Reader project cleanup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] && [ ! -f "Cargo.toml" ] && [ ! -f ".gitignore" ]; then
    print_error "This doesn't appear to be the Nexus Reader project root directory"
    exit 1
fi

print_status "Cleaning up temporary files..."

# Remove temporary files
find . -name "*.tmp" -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true
find . -name "*.temp" -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true
find . -name "*~" -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true
find . -name "*.bak" -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true
find . -name "*.backup" -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true
find . -name "*.old" -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true

print_success "Temporary files cleaned"

# Clean Python cache files
print_status "Cleaning Python cache files..."
find . -name "*.pyc" -not -path "./node_modules/*" -delete 2>/dev/null || true
find . -name "__pycache__" -type d -not -path "./node_modules/*" -exec rm -rf {} + 2>/dev/null || true
find . -name "*.pyo" -not -path "./node_modules/*" -delete 2>/dev/null || true

print_success "Python cache files cleaned"

# Clean Rust build artifacts
if [ -d "nexus-lite" ]; then
    print_status "Cleaning Rust build artifacts..."
    if command -v cargo &> /dev/null; then
        (cd nexus-lite && cargo clean) || print_warning "Failed to run cargo clean"
    else
        rm -rf nexus-lite/target/ 2>/dev/null || true
        print_warning "Cargo not found, manually removed target directory"
    fi
    print_success "Rust build artifacts cleaned"
fi

# Clean Node.js artifacts (but preserve node_modules)
print_status "Cleaning Node.js artifacts..."
find . -name "npm-debug.log*" -not -path "./node_modules/*" -delete 2>/dev/null || true
find . -name "yarn-debug.log*" -not -path "./node_modules/*" -delete 2>/dev/null || true
find . -name "yarn-error.log*" -not -path "./node_modules/*" -delete 2>/dev/null || true

print_success "Node.js artifacts cleaned"

# Clean test artifacts
print_status "Cleaning test artifacts..."
find . -name "junit.xml" -not -path "./node_modules/*" -delete 2>/dev/null || true
find . -name "test-report.xml" -not -path "./node_modules/*" -delete 2>/dev/null || true
rm -rf ./nexus-reader/test-results/ 2>/dev/null || true
rm -rf ./nexus-reader/coverage/ 2>/dev/null || true

print_success "Test artifacts cleaned"

# Clean system files
print_status "Cleaning system files..."
find . -name ".DS_Store" -delete 2>/dev/null || true
find . -name ".DS_Store?" -delete 2>/dev/null || true
find . -name "._*" -delete 2>/dev/null || true
find . -name "Thumbs.db" -delete 2>/dev/null || true
find . -name "ehthumbs.db" -delete 2>/dev/null || true

print_success "System files cleaned"

# Remove empty directories (but be careful not to remove important ones)
print_status "Removing empty directories..."
find . -type d -empty -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./.venv/*" | while read -r dir; do
    # Skip important directories that might be empty but should exist
    if [[ "$dir" != *"/.kiro"* ]] && [[ "$dir" != *"/public"* ]] && [[ "$dir" != *"/src"* ]]; then
        rmdir "$dir" 2>/dev/null || true
    fi
done

print_success "Empty directories cleaned"

# Show disk space saved
print_status "Cleanup completed! 🎉"

# Optional: Show git status to see what changed
if command -v git &> /dev/null && [ -d ".git" ]; then
    print_status "Git status after cleanup:"
    git status --porcelain | head -10
    if [ $(git status --porcelain | wc -l) -gt 10 ]; then
        echo "... and $(( $(git status --porcelain | wc -l) - 10 )) more files"
    fi
fi

print_success "Project cleanup completed successfully!"
echo ""
echo "💡 Tips:"
echo "   - Run 'git status' to see what files were affected"
echo "   - Consider running 'npm ci' or 'bun install' to reinstall dependencies if needed"
echo "   - Run 'cargo build' in nexus-lite/ to rebuild Rust components if needed"