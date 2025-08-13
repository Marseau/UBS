# PostgreSQL Basic Metrics Functions - Deployment Guide

## Overview

This guide covers the deployment and testing of the 4 basic metrics PostgreSQL functions for the WhatsApp Salon system. These functions replace the validated JavaScript metrics with optimized PostgreSQL stored procedures.

## Functions Created

### 1. `calculate_monthly_revenue(tenant_id, start_date, end_date)`
- **Purpose**: Calculate revenue from completed appointments
- **Formula**: `SUM(final_price || quoted_price) WHERE status = 'completed'`
- **Returns**: Current/previous revenue, percentage change, appointment counts
- **Based on**: `test-metric-1-monthly-revenue.js`

### 2. `calculate_new_customers(tenant_id, start_date, end_date)`
- **Purpose**: Identify new customers with historical comparison
- **Formula**: `COUNT(DISTINCT user_id) WHERE user_id not in historical periods`
- **Returns**: New customer counts, service/professional breakdowns
- **Based on**: `test-metric-2-new-customers.js`

### 3. `calculate_appointment_success_rate(tenant_id, start_date, end_date)`
- **Purpose**: Calculate appointment success rate
- **Formula**: `(completed appointments / total appointments) * 100`
- **Returns**: Success rates, status breakdown, service/professional analysis
- **Based on**: `test-metric-3-appointment-success-rate.js`

### 4. `calculate_no_show_impact(tenant_id, start_date, end_date)`
- **Purpose**: Calculate no-show impact with corrected logic
- **Formula**: `(no_show_count / total_appointments) * 100` (CORRECTED)
- **Returns**: Impact percentages, lost revenue, status breakdown
- **Based on**: `test-no-show-impact-metric.js`

### 5. `calculate_all_basic_metrics(tenant_id, start_date, end_date)`
- **Purpose**: Utility function to calculate all 4 metrics in one call
- **Returns**: Comprehensive JSON with all metrics and metadata
- **Use**: Optimized for dashboard and API usage

## Deployment Steps

### Step 1: Execute SQL Functions

You need to execute the SQL file in your Supabase database:

```bash
# Option 1: Via Supabase Dashboard
1. Go to Supabase Dashboard → SQL Editor
2. Copy content from /database/basic-metrics-functions.sql
3. Execute the script

# Option 2: Via CLI (if you have supabase CLI)
supabase db reset --local
supabase db push
```

### Step 2: Verify Functions Installation

```sql
-- Check if functions were created
SELECT 
    routine_name,
    routine_type,
    created
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE 'calculate_%'
ORDER BY routine_name;
```

Expected output should show 5 functions:
- `calculate_monthly_revenue`
- `calculate_new_customers`
- `calculate_appointment_success_rate`
- `calculate_no_show_impact`
- `calculate_all_basic_metrics`

### Step 3: Test Functions

Run the comprehensive test suite:

```bash
# Execute test script
node test-postgresql-metrics-functions.js

# Or make it executable and run directly
chmod +x test-postgresql-metrics-functions.js
./test-postgresql-metrics-functions.js
```

### Step 4: Manual Function Testing

You can manually test individual functions in Supabase SQL Editor:

```sql
-- Test monthly revenue for a tenant (replace with actual tenant_id)
SELECT * FROM calculate_monthly_revenue(
    'your-tenant-id-uuid'::uuid,
    '2024-11-01'::date,
    '2024-11-30'::date
);

-- Test all metrics at once
SELECT calculate_all_basic_metrics(
    'your-tenant-id-uuid'::uuid,
    '2024-11-01'::date,
    '2024-11-30'::date
);
```

## Function Parameters

All functions accept the same 3 parameters:

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `p_tenant_id` | UUID | Tenant identifier | `'12345678-1234-1234-1234-123456789012'` |
| `p_start_date` | DATE | Period start date | `'2024-11-01'` |
| `p_end_date` | DATE | Period end date | `'2024-11-30'` |

## Return Structures

### Monthly Revenue
```sql
current_revenue: DECIMAL(10,2)
previous_revenue: DECIMAL(10,2)
change_percentage: DECIMAL(5,2)
total_appointments_current: INTEGER
total_appointments_previous: INTEGER
completed_appointments_current: INTEGER
completed_appointments_previous: INTEGER
period_days: INTEGER
calculated_at: TIMESTAMPTZ
```

### New Customers
```sql
new_customers_current: INTEGER
new_customers_previous: INTEGER
change_percentage: DECIMAL(5,2)
total_customers_current: INTEGER
total_customers_previous: INTEGER
service_breakdown: JSONB
professional_breakdown: JSONB
period_days: INTEGER
calculated_at: TIMESTAMPTZ
```

### Success Rate
```sql
success_rate_current: DECIMAL(5,2)
success_rate_previous: DECIMAL(5,2)
change_percentage: DECIMAL(5,2)
total_appointments_current: INTEGER
total_appointments_previous: INTEGER
completed_appointments_current: INTEGER
completed_appointments_previous: INTEGER
status_breakdown: JSONB
service_breakdown: JSONB
professional_breakdown: JSONB
period_days: INTEGER
calculated_at: TIMESTAMPTZ
```

### No-Show Impact
```sql
impact_percentage: DECIMAL(5,2)
previous_impact_percentage: DECIMAL(5,2)
change_percentage: DECIMAL(5,2)
no_show_count_current: INTEGER
no_show_count_previous: INTEGER
total_appointments_current: INTEGER
total_appointments_previous: INTEGER
lost_revenue_current: DECIMAL(10,2)
lost_revenue_previous: DECIMAL(10,2)
status_breakdown: JSONB
period_days: INTEGER
calculated_at: TIMESTAMPTZ
```

### All Metrics (JSON)
```json
{
  "tenant_id": "uuid",
  "period": {
    "start_date": "date",
    "end_date": "date", 
    "days": "integer"
  },
  "monthly_revenue": { /* full monthly revenue result */ },
  "new_customers": { /* full new customers result */ },
  "appointment_success_rate": { /* full success rate result */ },
  "no_show_impact": { /* full no-show impact result */ },
  "calculated_at": "timestamp"
}
```

## Error Handling

All functions include comprehensive error handling:

- **Input validation**: NULL checks, date range validation, tenant existence
- **Tenant verification**: Ensures tenant exists and is active
- **SQL exceptions**: Catches and reports database errors with context
- **Meaningful messages**: Clear error descriptions with tenant context

Example error messages:
```
ERROR: tenant_id cannot be NULL
ERROR: start_date must be before or equal to end_date
ERROR: Tenant does not exist or is not active: 12345678-1234...
ERROR: Error calculating monthly revenue for tenant 12345678: [SQL error]
```

## Performance Considerations

### Optimizations
- **Efficient queries**: Uses indexed columns (`tenant_id`, `start_time`, `status`)
- **Minimal data transfer**: Returns only necessary fields
- **Date filtering**: Uses date casting for consistent comparisons
- **COALESCE usage**: Handles NULL values gracefully

### Expected Performance
- **Single metric**: < 100ms per function call
- **All metrics**: < 500ms for comprehensive calculation
- **Multiple tenants**: < 5 seconds for 10 tenants (parallel execution)

### Monitoring
Monitor function performance with:
```sql
-- Check function execution times
SELECT 
    schemaname,
    funcname,
    calls,
    total_time,
    mean_time,
    min_time,
    max_time
FROM pg_stat_user_functions 
WHERE funcname LIKE 'calculate_%'
ORDER BY mean_time DESC;
```

## Integration Points

### Cron Jobs
Update existing tenant metrics cron jobs to use these functions:

```typescript
// Example integration in TypeScript
const result = await supabase.rpc('calculate_all_basic_metrics', {
    p_tenant_id: tenantId,
    p_start_date: startDate,
    p_end_date: endDate
});

// Store results in tenant_metrics table
await supabase.from('tenant_metrics').upsert({
    tenant_id: tenantId,
    metric_type: 'basic_metrics',
    metric_data: result.data,
    period: '30d',
    calculated_at: new Date()
});
```

### Dashboard APIs
Use functions in API endpoints:

```typescript
// API endpoint example
app.get('/api/tenant/:id/metrics', async (req, res) => {
    const { data } = await supabase.rpc('calculate_all_basic_metrics', {
        p_tenant_id: req.params.id,
        p_start_date: req.query.start_date,
        p_end_date: req.query.end_date
    });
    
    res.json(data);
});
```

## Security

- **SECURITY DEFINER**: Functions run with elevated privileges
- **RLS Compatible**: Designed to work with Row Level Security
- **Input validation**: Prevents SQL injection and invalid inputs
- **Tenant isolation**: Each function validates tenant access
- **Authenticated access**: Functions granted only to authenticated users

## Troubleshooting

### Common Issues

**1. Function not found**
```sql
ERROR: function calculate_monthly_revenue(uuid, date, date) does not exist
```
**Solution**: Execute the SQL file to create functions

**2. Permission denied**
```sql
ERROR: permission denied for function calculate_monthly_revenue
```
**Solution**: Grant execute permissions or check authentication

**3. Invalid tenant**
```sql
ERROR: Tenant does not exist or is not active
```
**Solution**: Verify tenant ID and status in database

**4. No data returned**
```sql
-- Empty result set
```
**Solution**: Check if tenant has appointments in the specified date range

### Debug Queries

```sql
-- Check tenant exists and is active
SELECT id, name, status FROM tenants WHERE id = 'your-tenant-id'::uuid;

-- Check appointments in date range
SELECT COUNT(*) FROM appointments 
WHERE tenant_id = 'your-tenant-id'::uuid 
  AND start_time::date BETWEEN 'start-date' AND 'end-date';

-- Check function permissions
SELECT has_function_privilege('calculate_monthly_revenue(uuid,date,date)', 'execute');
```

## Next Steps

1. **Execute deployment**: Run the SQL functions in your Supabase database
2. **Test thoroughly**: Use the test script to verify all functions work correctly
3. **Update cron jobs**: Migrate existing metrics calculations to use these functions
4. **Monitor performance**: Track execution times and optimize if needed
5. **Integrate with dashboard**: Update frontend to use these optimized functions

## Files Created

- `📁 /database/basic-metrics-functions.sql` - Complete PostgreSQL functions
- `📁 /test-postgresql-metrics-functions.js` - Comprehensive test suite
- `📁 /DATABASE_FUNCTIONS_DEPLOYMENT_GUIDE.md` - This deployment guide

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review the test script output for specific errors
3. Verify database permissions and tenant data
4. Consult the original JavaScript implementations for validation

These PostgreSQL functions provide a solid foundation for the WhatsApp Salon metrics system with improved performance, proper error handling, and comprehensive testing.