# 🔧 Supabase Admin Dashboard Setup Guide

This guide will help you set up all necessary Supabase connections for the admin dashboard to work properly.

## 📋 Prerequisites

- Supabase project created and configured
- Environment variables set in `.env` file
- Node.js and npm installed

## 🗃️ Database Schema Setup

### Step 1: Execute Database Migration

**IMPORTANT**: You must execute the database migration SQL manually in your Supabase dashboard.

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy and paste the entire contents of `database/admin-dashboard-migration.sql`
4. Click **Run** to execute the migration

This will add all missing columns and indexes needed for the admin dashboard.

### Step 2: Verify Environment Variables

Ensure your `.env` file contains these required variables:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# WhatsApp Business API
WHATSAPP_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token

# AI Services  
OPENAI_API_KEY=your_openai_api_key

# Application
NODE_ENV=development
PORT=3000
```

## 🧪 Testing Database Connections

### Test Supabase Connectivity

```bash
npm run db:test-connections
```

This will test all database tables and API endpoints to ensure they're working correctly.

### Create Sample Data (Optional)

```bash
npm run db:create-sample-data
```

This creates realistic sample data including:
- Demo beauty salon tenant
- Sample users and appointments  
- Service offerings
- WhatsApp conversation history

## 🚀 Starting the Admin Dashboard

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

## 🌐 Accessing the Dashboard

1. **Navigate to**: `http://localhost:3000/admin`

2. **Login with default credentials**:
   - **Super Admin**: `admin@universalbooking.com` / `admin123`
   - **Tenant Admin**: `admin@salonbellavista.com` / `admin123`

3. **Change passwords immediately** after first login for security

## 📊 Dashboard Features

### ✅ Implemented Pages

All dashboard pages are fully functional with Supabase integration:

#### 🗓️ Appointments Page
- View all tenant appointments with filters
- Real-time status updates
- Cancel appointments
- Search and filter functionality

#### 👥 Users Page  
- Client management with activity tracking
- Block/unblock users
- View appointment history and spending
- Search by name, phone, or email

#### ⚙️ Services Page
- Service catalog management
- Activate/deactivate services
- Duplicate services
- Category-based filtering

#### 💬 Conversations Page
- WhatsApp conversation history
- AI intent recognition
- Conversation status management
- Search and filter capabilities

### 🔐 Role-Based Access

- **Super Admin**: Full system access, manage all tenants
- **Tenant Admin**: Access only to their tenant's data
- **Support**: Limited access for customer support

## 🗃️ Database Tables Used

The dashboard integrates with these Supabase tables:

- `tenants` - Business configuration
- `users` - Customer profiles  
- `user_tenants` - User-tenant relationships
- `appointments` - Booking records
- `services` - Service offerings
- `conversation_history` - WhatsApp messages
- `admin_users` - Admin accounts
- `admin_permissions` - Role permissions

## 🔧 API Endpoints

All dashboard pages use these REST API endpoints:

```
GET  /api/admin/appointments/:tenantId
PUT  /api/admin/appointments/:appointmentId
GET  /api/admin/users/:tenantId  
PUT  /api/admin/users/:userId/block
PUT  /api/admin/users/:userId/unblock
GET  /api/admin/services/:tenantId
PUT  /api/admin/services/:serviceId/activate
PUT  /api/admin/services/:serviceId/deactivate
POST /api/admin/services/:serviceId/duplicate
GET  /api/admin/conversations/:tenantId
GET  /api/admin/dashboard
```

## 🚨 Troubleshooting

### Database Connection Issues

1. **Check environment variables** are correctly set
2. **Verify Supabase service role key** has proper permissions
3. **Run connection test**: `npm run db:test-connections`

### Missing Columns Errors

1. **Execute the migration**: Copy `database/admin-dashboard-migration.sql` to Supabase SQL Editor
2. **Check migration status**: Run connection test again
3. **Verify table structure** in Supabase Table Editor

### Authentication Problems

1. **Check admin users exist**: Query `admin_users` table in Supabase
2. **Reset passwords**: Use the password reset scripts in `/scripts/`
3. **Verify permissions**: Check `admin_permissions` table

### Empty Dashboard Data

1. **Create sample data**: `npm run db:create-sample-data`
2. **Check RLS policies**: Ensure they allow admin access
3. **Verify tenant configuration**: Check `tenants` table

## 📈 Performance Optimization

The migration script creates these indexes for optimal performance:

- `idx_appointments_tenant_status` - Fast appointment queries
- `idx_services_tenant_active` - Quick service lookups  
- `idx_user_tenants_tenant_status` - Efficient user filtering
- `idx_conversation_history_tenant_phone` - Conversation searches

## 🔒 Security Features

- **Row Level Security (RLS)** - Tenant data isolation
- **JWT Authentication** - Secure admin sessions
- **Permission-based access** - Granular role controls
- **SQL injection protection** - Parameterized queries
- **Input validation** - Client and server-side validation

## ✅ Next Steps

1. **Execute the database migration SQL**
2. **Test database connections**
3. **Create sample data (optional)**
4. **Start the development server**
5. **Access the admin dashboard**
6. **Change default passwords**

🎉 **Your admin dashboard is now ready for multi-tenant WhatsApp booking management!**