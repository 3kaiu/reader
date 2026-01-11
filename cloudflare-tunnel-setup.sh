#!/bin/bash

# Cloudflare Tunnel Setup Script for FnOS
# This script helps configure Cloudflare Tunnel for secure external access

set -e

echo "🌐 Cloudflare Tunnel Setup for Nexus Reader"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TUNNEL_NAME="nexus-reader-tunnel"
CONFIG_DIR="/opt/cloudflared"
SERVICE_NAME="cloudflared"

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

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Install cloudflared if not present
install_cloudflared() {
    print_status "Checking cloudflared installation..."
    
    if command -v cloudflared &> /dev/null; then
        print_success "cloudflared is already installed"
        cloudflared version
        return 0
    fi
    
    print_status "Installing cloudflared..."
    
    # Detect architecture
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            CLOUDFLARED_ARCH="amd64"
            ;;
        aarch64|arm64)
            CLOUDFLARED_ARCH="arm64"
            ;;
        armv7l)
            CLOUDFLARED_ARCH="arm"
            ;;
        *)
            print_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
    
    # Download and install cloudflared
    DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CLOUDFLARED_ARCH}"
    
    print_status "Downloading cloudflared for $CLOUDFLARED_ARCH..."
    curl -L "$DOWNLOAD_URL" -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
    
    print_success "cloudflared installed successfully"
    cloudflared version
}

# Create configuration directory
setup_config_dir() {
    print_status "Setting up configuration directory..."
    
    mkdir -p "$CONFIG_DIR"
    chmod 700 "$CONFIG_DIR"
    
    print_success "Configuration directory created: $CONFIG_DIR"
}

# Generate tunnel configuration
generate_tunnel_config() {
    print_status "Generating tunnel configuration..."
    
    cat > "$CONFIG_DIR/config.yml" << EOF
# Cloudflare Tunnel Configuration for Nexus Reader
tunnel: $TUNNEL_NAME
credentials-file: $CONFIG_DIR/credentials.json

# Ingress rules - route traffic to local services
ingress:
  # Main Nexus Reader application
  - hostname: nexus-reader.yourdomain.com
    service: http://localhost:8080
    originRequest:
      httpHostHeader: nexus-reader.yourdomain.com
      connectTimeout: 30s
      tlsTimeout: 10s
      tcpKeepAlive: 30s
      keepAliveConnections: 10
      keepAliveTimeout: 90s

  # CF Bypass service
  - hostname: cf-bypass.yourdomain.com
    service: http://localhost:8001
    originRequest:
      httpHostHeader: cf-bypass.yourdomain.com
      connectTimeout: 30s

  # API endpoints
  - hostname: api.nexus-reader.yourdomain.com
    service: http://localhost:8080
    path: /api/*
    originRequest:
      httpHostHeader: api.nexus-reader.yourdomain.com

  # WebSocket connections for real-time sync
  - hostname: ws.nexus-reader.yourdomain.com
    service: http://localhost:8080
    path: /ws/*
    originRequest:
      httpHostHeader: ws.nexus-reader.yourdomain.com
      noTLSVerify: false

  # Health check endpoint
  - hostname: health.nexus-reader.yourdomain.com
    service: http://localhost:8080
    path: /health
    originRequest:
      httpHostHeader: health.nexus-reader.yourdomain.com

  # Catch-all rule (required)
  - service: http_status:404

# Logging configuration
loglevel: info
logfile: /var/log/cloudflared.log

# Metrics and monitoring
metrics: 0.0.0.0:8082

# Auto-update configuration
autoupdate-freq: 24h

# Connection settings
protocol: quic
retries: 3
grace-period: 30s

# Edge locations (optional - let Cloudflare choose optimal)
# region: auto
EOF

    print_success "Tunnel configuration generated: $CONFIG_DIR/config.yml"
}

# Create systemd service
create_systemd_service() {
    print_status "Creating systemd service..."
    
    cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Cloudflare Tunnel for Nexus Reader
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/local/bin/cloudflared tunnel --config $CONFIG_DIR/config.yml run
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cloudflared
KillMode=mixed
KillSignal=SIGTERM

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$CONFIG_DIR /var/log
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    print_success "Systemd service created: ${SERVICE_NAME}.service"
}

# Create helper scripts
create_helper_scripts() {
    print_status "Creating helper scripts..."
    
    # Tunnel management script
    cat > "/usr/local/bin/nexus-tunnel" << 'EOF'
#!/bin/bash

TUNNEL_NAME="nexus-reader-tunnel"
CONFIG_DIR="/opt/cloudflared"
SERVICE_NAME="cloudflared"

case "$1" in
    start)
        echo "Starting Cloudflare Tunnel..."
        systemctl start $SERVICE_NAME
        systemctl enable $SERVICE_NAME
        echo "Tunnel started and enabled"
        ;;
    stop)
        echo "Stopping Cloudflare Tunnel..."
        systemctl stop $SERVICE_NAME
        echo "Tunnel stopped"
        ;;
    restart)
        echo "Restarting Cloudflare Tunnel..."
        systemctl restart $SERVICE_NAME
        echo "Tunnel restarted"
        ;;
    status)
        systemctl status $SERVICE_NAME
        ;;
    logs)
        journalctl -u $SERVICE_NAME -f
        ;;
    config)
        echo "Tunnel configuration:"
        cat $CONFIG_DIR/config.yml
        ;;
    test)
        echo "Testing tunnel connectivity..."
        cloudflared tunnel --config $CONFIG_DIR/config.yml info
        ;;
    update)
        echo "Updating cloudflared..."
        systemctl stop $SERVICE_NAME
        # Re-download latest version
        ARCH=$(uname -m)
        case $ARCH in
            x86_64) CLOUDFLARED_ARCH="amd64" ;;
            aarch64|arm64) CLOUDFLARED_ARCH="arm64" ;;
            armv7l) CLOUDFLARED_ARCH="arm" ;;
        esac
        curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CLOUDFLARED_ARCH}" -o /usr/local/bin/cloudflared
        chmod +x /usr/local/bin/cloudflared
        systemctl start $SERVICE_NAME
        echo "cloudflared updated and restarted"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|config|test|update}"
        echo ""
        echo "Commands:"
        echo "  start   - Start and enable the tunnel service"
        echo "  stop    - Stop the tunnel service"
        echo "  restart - Restart the tunnel service"
        echo "  status  - Show tunnel service status"
        echo "  logs    - Show tunnel logs (follow mode)"
        echo "  config  - Display current tunnel configuration"
        echo "  test    - Test tunnel connectivity"
        echo "  update  - Update cloudflared to latest version"
        exit 1
        ;;
esac
EOF

    chmod +x "/usr/local/bin/nexus-tunnel"
    
    # DNS update script
    cat > "/usr/local/bin/nexus-dns-update" << 'EOF'
#!/bin/bash

# DNS Update Script for Nexus Reader Cloudflare Tunnel
# This script helps update DNS records to point to the tunnel

echo "🌐 Nexus Reader DNS Update Helper"
echo "================================="

if [ -z "$1" ]; then
    echo "Usage: $0 <your-domain.com>"
    echo ""
    echo "This script will show you the DNS records you need to create"
    echo "in your Cloudflare dashboard to connect your domain to the tunnel."
    echo ""
    echo "Example: $0 mydomain.com"
    exit 1
fi

DOMAIN="$1"
TUNNEL_ID=$(cloudflared tunnel list | grep nexus-reader-tunnel | awk '{print $1}' 2>/dev/null || echo "TUNNEL_ID_HERE")

echo ""
echo "📋 DNS Records to Create in Cloudflare Dashboard:"
echo "================================================="
echo ""
echo "1. Main Application:"
echo "   Type: CNAME"
echo "   Name: nexus-reader"
echo "   Target: ${TUNNEL_ID}.cfargotunnel.com"
echo "   Proxy: ✅ Proxied"
echo ""
echo "2. CF Bypass Service:"
echo "   Type: CNAME"
echo "   Name: cf-bypass"
echo "   Target: ${TUNNEL_ID}.cfargotunnel.com"
echo "   Proxy: ✅ Proxied"
echo ""
echo "3. API Endpoints:"
echo "   Type: CNAME"
echo "   Name: api.nexus-reader"
echo "   Target: ${TUNNEL_ID}.cfargotunnel.com"
echo "   Proxy: ✅ Proxied"
echo ""
echo "4. WebSocket Connections:"
echo "   Type: CNAME"
echo "   Name: ws.nexus-reader"
echo "   Target: ${TUNNEL_ID}.cfargotunnel.com"
echo "   Proxy: ✅ Proxied"
echo ""
echo "5. Health Check:"
echo "   Type: CNAME"
echo "   Name: health.nexus-reader"
echo "   Target: ${TUNNEL_ID}.cfargotunnel.com"
echo "   Proxy: ✅ Proxied"
echo ""
echo "🔗 Your URLs will be:"
echo "   Main App: https://nexus-reader.${DOMAIN}"
echo "   CF Bypass: https://cf-bypass.${DOMAIN}"
echo "   API: https://api.nexus-reader.${DOMAIN}"
echo "   WebSocket: wss://ws.nexus-reader.${DOMAIN}"
echo "   Health: https://health.nexus-reader.${DOMAIN}"
echo ""
echo "⚠️  Remember to update the hostnames in $CONFIG_DIR/config.yml"
echo "   after creating the DNS records!"
EOF

    chmod +x "/usr/local/bin/nexus-dns-update"
    
    print_success "Helper scripts created:"
    print_success "  - nexus-tunnel (tunnel management)"
    print_success "  - nexus-dns-update (DNS configuration helper)"
}

# Main setup function
main() {
    print_status "Starting Cloudflare Tunnel setup for Nexus Reader..."
    
    check_root
    install_cloudflared
    setup_config_dir
    generate_tunnel_config
    create_systemd_service
    create_helper_scripts
    
    echo ""
    print_success "🎉 Cloudflare Tunnel setup completed!"
    echo ""
    echo "📋 Next Steps:"
    echo "=============="
    echo ""
    echo "1. 🔐 Authenticate with Cloudflare:"
    echo "   cloudflared tunnel login"
    echo ""
    echo "2. 🚇 Create the tunnel:"
    echo "   cloudflared tunnel create $TUNNEL_NAME"
    echo ""
    echo "3. 📝 Update configuration with your domain:"
    echo "   Edit $CONFIG_DIR/config.yml and replace 'yourdomain.com' with your actual domain"
    echo ""
    echo "4. 🌐 Create DNS records:"
    echo "   nexus-dns-update yourdomain.com"
    echo ""
    echo "5. ▶️  Start the tunnel:"
    echo "   nexus-tunnel start"
    echo ""
    echo "6. 📊 Check status:"
    echo "   nexus-tunnel status"
    echo ""
    echo "🔧 Management Commands:"
    echo "   nexus-tunnel {start|stop|restart|status|logs|config|test|update}"
    echo ""
    print_warning "Don't forget to update your domain in the configuration file!"
}

# Run main function
main "$@"