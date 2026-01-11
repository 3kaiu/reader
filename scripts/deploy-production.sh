#!/bin/bash

# Production Deployment Script for Nexus Reader
# This script deploys all components to production environment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="production"
PROJECT_NAME="nexus-reader"
DOMAIN="nexus-reader.com"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if wrangler is installed
    if ! command -v wrangler &> /dev/null; then
        error "Wrangler CLI is not installed. Please install it with: npm install -g wrangler"
    fi
    
    # Check if logged in to Cloudflare
    if ! wrangler whoami &> /dev/null; then
        error "Not logged in to Cloudflare. Please run: wrangler login"
    fi
    
    # Check environment variables
    if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
        warning "CLOUDFLARE_API_TOKEN not set. Using wrangler login instead."
    fi
    
    if [[ -z "$CLOUDFLARE_ACCOUNT_ID" ]]; then
        error "CLOUDFLARE_ACCOUNT_ID environment variable is required"
    fi
    
    if [[ -z "$CLOUDFLARE_ZONE_ID" ]]; then
        error "CLOUDFLARE_ZONE_ID environment variable is required"
    fi
    
    success "Prerequisites check passed"
}

# Build the application
build_application() {
    log "Building application for production..."
    
    # Clean previous builds
    rm -rf dist/
    rm -rf .next/
    
    # Install dependencies
    npm ci --production=false
    
    # Run tests
    log "Running tests..."
    npm run test
    
    # Build the application
    NODE_ENV=production npm run build
    
    # Build workers
    log "Building Cloudflare Workers..."
    npm run build:workers
    
    success "Application built successfully"
}

# Deploy Cloudflare Workers
deploy_workers() {
    log "Deploying Cloudflare Workers..."
    
    # Deploy main API proxy worker
    wrangler publish --env production cloudflare-workers/api-proxy-worker.js
    
    # Deploy sync engine worker
    wrangler publish --env production cloudflare-workers/sync-engine-worker.js
    
    # Deploy analytics worker
    wrangler publish --env production cloudflare-workers/analytics-worker.js
    
    # Deploy health monitoring worker
    wrangler publish --env production cloudflare-workers/health-monitoring-worker.js
    
    # Deploy error logging worker
    wrangler publish --env production cloudflare-workers/error-logging-worker.js
    
    # Deploy content classification worker
    wrangler publish --env production cloudflare-workers/content-classification-worker.js
    
    # Deploy semantic search worker
    wrangler publish --env production cloudflare-workers/semantic-search-worker.js
    
    # Deploy secure API worker
    wrangler publish --env production cloudflare-workers/secure-api-worker.js
    
    # Deploy KV storage worker
    wrangler publish --env production cloudflare-workers/kv-storage-worker.js
    
    success "Cloudflare Workers deployed successfully"
}

# Deploy static assets to Cloudflare Pages
deploy_static_assets() {
    log "Deploying static assets to Cloudflare Pages..."
    
    # Deploy to Cloudflare Pages
    wrangler pages publish dist --project-name $PROJECT_NAME --env production
    
    success "Static assets deployed successfully"
}

# Configure DNS records
configure_dns() {
    log "Configuring DNS records..."
    
    # Main domain
    wrangler dns create $DOMAIN A --content "192.0.2.1" --proxied
    wrangler dns create www.$DOMAIN CNAME --content $DOMAIN --proxied
    
    # API subdomain
    wrangler dns create api.$DOMAIN CNAME --content $DOMAIN --proxied
    
    # CDN subdomain
    wrangler dns create cdn.$DOMAIN CNAME --content $DOMAIN --proxied
    
    # Static assets subdomain
    wrangler dns create static.$DOMAIN CNAME --content $DOMAIN --proxied
    
    success "DNS records configured successfully"
}

# Set up KV namespaces
setup_kv_namespaces() {
    log "Setting up KV namespaces..."
    
    # Create KV namespaces if they don't exist
    wrangler kv:namespace create "NEXUS_READER_KV" --env production || true
    wrangler kv:namespace create "NEXUS_READER_CACHE" --env production || true
    wrangler kv:namespace create "NEXUS_READER_ANALYTICS" --env production || true
    
    success "KV namespaces set up successfully"
}

# Configure secrets
configure_secrets() {
    log "Configuring secrets..."
    
    # Check if secrets are provided via environment variables
    if [[ -n "$OPENAI_API_KEY" ]]; then
        echo "$OPENAI_API_KEY" | wrangler secret put OPENAI_API_KEY --env production
    fi
    
    if [[ -n "$DATABASE_URL" ]]; then
        echo "$DATABASE_URL" | wrangler secret put DATABASE_URL --env production
    fi
    
    if [[ -n "$REDIS_URL" ]]; then
        echo "$REDIS_URL" | wrangler secret put REDIS_URL --env production
    fi
    
    if [[ -n "$JWT_SECRET" ]]; then
        echo "$JWT_SECRET" | wrangler secret put JWT_SECRET --env production
    fi
    
    if [[ -n "$ENCRYPTION_KEY" ]]; then
        echo "$ENCRYPTION_KEY" | wrangler secret put ENCRYPTION_KEY --env production
    fi
    
    if [[ -n "$WEBHOOK_SECRET" ]]; then
        echo "$WEBHOOK_SECRET" | wrangler secret put WEBHOOK_SECRET --env production
    fi
    
    success "Secrets configured successfully"
}

# Configure CDN and caching rules
configure_cdn() {
    log "Configuring CDN and caching rules..."
    
    # Apply CDN configuration
    node cloudflare-cdn-config.js
    
    # Apply image optimization configuration
    node cloudflare-images-config.js
    
    success "CDN and caching rules configured successfully"
}

# Run health checks
run_health_checks() {
    log "Running health checks..."
    
    # Wait for deployment to propagate
    sleep 30
    
    # Check main site
    if curl -f -s "https://$DOMAIN" > /dev/null; then
        success "Main site is accessible"
    else
        error "Main site health check failed"
    fi
    
    # Check API endpoint
    if curl -f -s "https://api.$DOMAIN/health" > /dev/null; then
        success "API endpoint is accessible"
    else
        error "API endpoint health check failed"
    fi
    
    # Check PWA manifest
    if curl -f -s "https://$DOMAIN/manifest.json" > /dev/null; then
        success "PWA manifest is accessible"
    else
        warning "PWA manifest check failed"
    fi
    
    # Check service worker
    if curl -f -s "https://$DOMAIN/sw.js" > /dev/null; then
        success "Service worker is accessible"
    else
        warning "Service worker check failed"
    fi
    
    success "Health checks completed"
}

# Setup monitoring and alerting
setup_monitoring() {
    log "Setting up monitoring and alerting..."
    
    # Deploy monitoring configuration
    if [[ -f "monitoring/cloudflare-alerts.json" ]]; then
        # Apply Cloudflare alerting rules
        curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/alerting/policies" \
             -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
             -H "Content-Type: application/json" \
             -d @monitoring/cloudflare-alerts.json
    fi
    
    success "Monitoring and alerting configured"
}

# Cleanup function
cleanup() {
    log "Cleaning up temporary files..."
    rm -rf .temp/
    rm -rf node_modules/.cache/
}

# Main deployment function
main() {
    log "🚀 Starting production deployment for Nexus Reader..."
    
    # Trap cleanup on exit
    trap cleanup EXIT
    
    # Run deployment steps
    check_prerequisites
    build_application
    setup_kv_namespaces
    configure_secrets
    deploy_workers
    deploy_static_assets
    configure_dns
    configure_cdn
    run_health_checks
    setup_monitoring
    
    success "🎉 Production deployment completed successfully!"
    log "🌐 Your application is now live at: https://$DOMAIN"
    log "📊 API endpoint: https://api.$DOMAIN"
    log "📚 Documentation: https://docs.$DOMAIN"
    
    # Display deployment summary
    echo ""
    echo "📋 Deployment Summary:"
    echo "  • Environment: $ENVIRONMENT"
    echo "  • Domain: $DOMAIN"
    echo "  • Workers deployed: 9"
    echo "  • KV namespaces: 3"
    echo "  • CDN configured: ✅"
    echo "  • Health checks: ✅"
    echo "  • Monitoring: ✅"
    echo ""
    echo "🔗 Useful links:"
    echo "  • Main site: https://$DOMAIN"
    echo "  • API docs: https://api.$DOMAIN/docs"
    echo "  • Health status: https://api.$DOMAIN/health"
    echo "  • Analytics: https://dash.cloudflare.com"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi