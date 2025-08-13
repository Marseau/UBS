#!/bin/bash

# =====================================================
# Universal Booking System - Database Setup Script
# =====================================================
# Automated database setup for development and production

set -e  # Exit on any error

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

# Check if required environment variables are set
check_env_vars() {
    print_status "Checking environment variables..."
    
    if [ -z "$SUPABASE_URL" ]; then
        print_error "SUPABASE_URL environment variable is not set"
        exit 1
    fi
    
    if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        print_error "SUPABASE_SERVICE_ROLE_KEY environment variable is not set"
        exit 1
    fi
    
    print_success "Environment variables are properly set"
}

# Function to extract database connection details from Supabase URL
get_db_connection() {
    # Extract database connection details from SUPABASE_URL
    # Format: postgresql://postgres:[password]@[host]:[port]/postgres
    
    # Parse the URL to extract components
    if [[ $SUPABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+) ]]; then
        DB_USER="${BASH_REMATCH[1]}"
        DB_PASSWORD="${BASH_REMATCH[2]}"
        DB_HOST="${BASH_REMATCH[3]}"
        DB_PORT="${BASH_REMATCH[4]}"
        DB_NAME="${BASH_REMATCH[5]}"
    else
        # Alternative format for Supabase
        print_warning "Could not parse SUPABASE_URL. Using default connection method..."
        DB_HOST=$(echo $SUPABASE_URL | sed 's|.*://||' | sed 's|/.*||' | sed 's|:.*||')
        DB_USER="postgres"
        DB_NAME="postgres"
        DB_PORT="5432"
    fi
}

# Function to run SQL files using psql
run_sql_with_psql() {
    local sql_file=$1
    print_status "Running $sql_file using psql..."
    
    if [ ! -f "$sql_file" ]; then
        print_error "SQL file not found: $sql_file"
        exit 1
    fi
    
    # Use psql to run the SQL file
    PGPASSWORD="$SUPABASE_SERVICE_ROLE_KEY" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -f "$sql_file" \
        --set ON_ERROR_STOP=1
}

# Function to run SQL files using Supabase API
run_sql_with_api() {
    local sql_file=$1
    print_status "Running $sql_file using Supabase API..."
    
    if [ ! -f "$sql_file" ]; then
        print_error "SQL file not found: $sql_file"
        exit 1
    fi
    
    # Read SQL file content
    local sql_content=$(cat "$sql_file")
    
    # Use curl to execute SQL via Supabase REST API
    local response=$(curl -s -X POST \
        "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=minimal" \
        -d "{\"sql\": $(echo "$sql_content" | jq -Rs .)}")
    
    if [ $? -eq 0 ]; then
        print_success "SQL executed successfully"
    else
        print_error "Failed to execute SQL: $response"
        exit 1
    fi
}

# Function to test database connection
test_connection() {
    print_status "Testing database connection..."
    
    # Try to connect and run a simple query
    if command -v psql &> /dev/null; then
        get_db_connection
        if PGPASSWORD="$SUPABASE_SERVICE_ROLE_KEY" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -c "SELECT 1;" &> /dev/null; then
            print_success "Database connection successful using psql"
            return 0
        fi
    fi
    
    # Fallback to API test
    local response=$(curl -s -X GET \
        "$SUPABASE_URL/rest/v1/" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
    
    if [ $? -eq 0 ]; then
        print_success "Database connection successful using API"
        return 0
    else
        print_error "Failed to connect to database"
        exit 1
    fi
}

# Main setup function
setup_database() {
    print_status "Starting Universal Booking System database setup..."
    echo
    
    # Change to project root directory
    cd "$(dirname "$0")/.."
    
    # Check environment
    check_env_vars
    
    # Test connection
    test_connection
    
    # Create database directory if it doesn't exist
    mkdir -p database
    
    # Determine which method to use for SQL execution
    local use_psql=false
    if command -v psql &> /dev/null; then
        get_db_connection
        if PGPASSWORD="$SUPABASE_SERVICE_ROLE_KEY" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -c "SELECT 1;" &> /dev/null 2>&1; then
            use_psql=true
            print_status "Using psql for database setup"
        fi
    fi
    
    if [ "$use_psql" = false ]; then
        print_status "Using Supabase API for database setup"
    fi
    
    # Run database setup
    print_status "Setting up database schema and security..."
    
    if [ "$use_psql" = true ]; then
        # Run setup using psql
        PGPASSWORD="$SUPABASE_SERVICE_ROLE_KEY" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -f "database/setup-database.sql" \
            --set ON_ERROR_STOP=1
    else
        # Run individual SQL files using API or Node.js script
        print_warning "API-based setup not yet implemented. Please use psql or run SQL files manually."
        print_status "To setup manually:"
        print_status "1. Run: database/00-schema-migration.sql"
        print_status "2. Run: database/01-rls-policies.sql"
        exit 1
    fi
    
    print_success "Database setup completed successfully!"
    echo
    print_status "Next steps:"
    print_status "1. Start the application: npm run dev"
    print_status "2. Access admin dashboard: http://localhost:3000/admin"
    print_status "3. Login with: admin@universalbooking.com / admin123"
    echo
}

# Function to reset database (for development)
reset_database() {
    print_warning "This will delete ALL data in the database!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Operation cancelled."
        exit 0
    fi
    
    print_status "Resetting database..."
    
    # Create reset SQL
    cat > /tmp/reset_db.sql << EOF
-- Drop all tables in the correct order to avoid FK constraint issues
DROP TABLE IF EXISTS system_health_logs CASCADE;
DROP TABLE IF EXISTS calendar_sync_tokens CASCADE;
DROP TABLE IF EXISTS stripe_customers CASCADE;
DROP TABLE IF EXISTS function_executions CASCADE;
DROP TABLE IF EXISTS email_logs CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS rules CASCADE;
DROP TABLE IF EXISTS whatsapp_media CASCADE;
DROP TABLE IF EXISTS conversation_states CASCADE;
DROP TABLE IF EXISTS conversation_history CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS availability_templates CASCADE;
DROP TABLE IF EXISTS professionals CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS service_categories CASCADE;
DROP TABLE IF EXISTS user_tenants CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Drop custom types
DROP TYPE IF EXISTS business_domain CASCADE;
DROP TYPE IF EXISTS appointment_status CASCADE;
DROP TYPE IF EXISTS duration_type CASCADE;
DROP TYPE IF EXISTS price_model CASCADE;

-- Drop views
DROP VIEW IF EXISTS tenant_performance_summary CASCADE;
DROP VIEW IF EXISTS system_health_overview CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS create_tenant_with_defaults(TEXT, TEXT, TEXT, business_domain, TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_tenant_stats(UUID) CASCADE;
DROP FUNCTION IF EXISTS delete_tenant_cascade(UUID) CASCADE;
DROP FUNCTION IF EXISTS backup_tenant_data(UUID) CASCADE;
DROP FUNCTION IF EXISTS validate_tenant_integrity(UUID) CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_conversations() CASCADE;
DROP FUNCTION IF EXISTS refresh_user_booking_counts() CASCADE;

-- RLS functions
DROP FUNCTION IF EXISTS get_current_tenant_id() CASCADE;
DROP FUNCTION IF EXISTS is_admin_user() CASCADE;
DROP FUNCTION IF EXISTS is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS set_tenant_context(UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS set_super_admin_context() CASCADE;
DROP FUNCTION IF EXISTS clear_tenant_context() CASCADE;
DROP FUNCTION IF EXISTS log_rls_violation(TEXT, TEXT, UUID, JSONB) CASCADE;

-- Drop audit table
DROP TABLE IF EXISTS rls_audit_log CASCADE;

SELECT 'Database reset completed successfully' as result;
EOF
    
    if command -v psql &> /dev/null; then
        get_db_connection
        PGPASSWORD="$SUPABASE_SERVICE_ROLE_KEY" psql \
            -h "$DB_HOST" \
            -p "$DB_PORT" \
            -U "$DB_USER" \
            -d "$DB_NAME" \
            -f "/tmp/reset_db.sql"
    else
        print_error "psql not available. Cannot reset database via API."
        exit 1
    fi
    
    rm /tmp/reset_db.sql
    print_success "Database reset completed!"
}

# Function to show help
show_help() {
    echo "Universal Booking System - Database Setup Script"
    echo
    echo "Usage: $0 [OPTION]"
    echo
    echo "Options:"
    echo "  setup     Setup the database schema and RLS policies (default)"
    echo "  reset     Reset the database (DELETE ALL DATA)"
    echo "  test      Test database connection"
    echo "  help      Show this help message"
    echo
    echo "Environment variables required:"
    echo "  SUPABASE_URL                - Your Supabase project URL"
    echo "  SUPABASE_SERVICE_ROLE_KEY   - Your Supabase service role key"
    echo
    echo "Examples:"
    echo "  $0 setup                    # Setup database"
    echo "  $0 reset                    # Reset database (careful!)"
    echo "  $0 test                     # Test connection"
    echo
}

# Main script logic
case "${1:-setup}" in
    "setup")
        setup_database
        ;;
    "reset")
        reset_database
        ;;
    "test")
        check_env_vars
        test_connection
        print_success "Connection test completed successfully!"
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        print_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac