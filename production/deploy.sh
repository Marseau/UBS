#!/bin/bash
# Production Deployment Script
# Generated: 2025-07-07T13:56:35.823Z

set -e

echo "🚀 Starting production deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required tools are installed
check_dependencies() {
    echo "📋 Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker is not installed${NC}"
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        echo -e "${RED}Git is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All dependencies are installed${NC}"
}

# Backup current deployment
backup_deployment() {
    echo "💾 Creating backup..."
    
    if [ -d "/app/backup" ]; then
        rm -rf /app/backup
    fi
    
    if [ -d "/app/current" ]; then
        cp -r /app/current /app/backup
        echo -e "${GREEN}✅ Backup created${NC}"
    fi
}

# Pull latest code
update_code() {
    echo "📥 Pulling latest code..."
    
    cd /app/universal-booking-system
    git pull origin main
    
    echo -e "${GREEN}✅ Code updated${NC}"
}

# Build Docker image
build_image() {
    echo "🔨 Building Docker image..."
    
    cd /app/universal-booking-system
    docker build -t universal-booking-system:latest .
    
    echo -e "${GREEN}✅ Docker image built${NC}"
}

# Stop current containers
stop_containers() {
    echo "🛑 Stopping current containers..."
    
    docker-compose down || true
    
    echo -e "${GREEN}✅ Containers stopped${NC}"
}

# Start new containers
start_containers() {
    echo "🚀 Starting new containers..."
    
    cd /app/universal-booking-system
    docker-compose up -d
    
    echo -e "${GREEN}✅ Containers started${NC}"
}

# Health check
health_check() {
    echo "🏥 Performing health check..."
    
    sleep 30
    
    for i in {1..10}; do
        if curl -f http://localhost:3000/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Health check passed${NC}"
            return 0
        fi
        echo "Attempt $i/10 failed, retrying in 10 seconds..."
        sleep 10
    done
    
    echo -e "${RED}❌ Health check failed${NC}"
    return 1
}

# Rollback on failure
rollback() {
    echo -e "${RED}🔄 Rolling back to previous version...${NC}"
    
    if [ -d "/app/backup" ]; then
        docker-compose down
        rm -rf /app/current
        mv /app/backup /app/current
        cd /app/current
        docker-compose up -d
        echo -e "${YELLOW}⚠️ Rollback completed${NC}"
    else
        echo -e "${RED}❌ No backup found for rollback${NC}"
    fi
}

# Main deployment process
main() {
    check_dependencies
    backup_deployment
    update_code
    build_image
    stop_containers
    start_containers
    
    if health_check; then
        echo -e "${GREEN}🎉 Deployment successful!${NC}"
        
        # Clean up old images
        docker system prune -f
        
        echo "📊 Deployment summary:"
        echo "  - Version: $(git rev-parse --short HEAD)"
        echo "  - Deployed at: $(date)"
        echo "  - Status: ✅ Healthy"
    else
        rollback
        exit 1
    fi
}

# Run deployment
main
