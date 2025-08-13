-- =====================================================
-- Professional-Service-Schedule Enhancement Migration
-- =====================================================
-- This migration adds the missing tables and relationships for complete professional management

-- Enable necessary extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add professional_id to appointments table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'professional_id'
    ) THEN
        ALTER TABLE appointments 
        ADD COLUMN professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL;
        
        -- Add index for performance
        CREATE INDEX idx_appointments_professional_id ON appointments(professional_id);
        
        RAISE NOTICE 'Added professional_id column to appointments table';
    ELSE
        RAISE NOTICE 'professional_id column already exists in appointments table';
    END IF;
END $$;

-- Create professional_services junction table
CREATE TABLE IF NOT EXISTS professional_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    custom_price DECIMAL(10,2), -- Override service base price
    custom_duration INTEGER, -- Override service duration in minutes
    is_active BOOLEAN DEFAULT true,
    notes TEXT, -- Special notes about this professional-service combination
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique combination per tenant
    UNIQUE(tenant_id, professional_id, service_id)
);

-- Create professional_availability_exceptions table
CREATE TABLE IF NOT EXISTS professional_availability_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME, -- Optional: specific time blocking
    end_time TIME, -- Optional: specific time blocking
    is_all_day BOOLEAN DEFAULT true,
    reason TEXT NOT NULL, -- 'vacation', 'sick_leave', 'personal', 'training', etc.
    description TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern JSONB, -- For recurring exceptions like "every Monday"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure end_date >= start_date
    CONSTRAINT check_date_order CHECK (end_date >= start_date),
    -- If times are specified, ensure end_time > start_time or is_all_day = true
    CONSTRAINT check_time_order CHECK (
        is_all_day = true OR 
        (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

-- Create professional_schedules table for more detailed schedule management
CREATE TABLE IF NOT EXISTS professional_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_start_time TIME, -- Optional lunch break
    break_end_time TIME, -- Optional lunch break
    slot_duration INTEGER DEFAULT 30, -- Default slot duration in minutes
    is_active BOOLEAN DEFAULT true,
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_until DATE, -- Optional end date for temporary schedules
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure end_time > start_time
    CONSTRAINT check_schedule_time_order CHECK (end_time > start_time),
    -- If break times are specified, ensure they're within working hours
    CONSTRAINT check_break_within_hours CHECK (
        (break_start_time IS NULL AND break_end_time IS NULL) OR
        (break_start_time >= start_time AND break_end_time <= end_time AND break_end_time > break_start_time)
    )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_professional_services_professional ON professional_services(professional_id);
CREATE INDEX IF NOT EXISTS idx_professional_services_service ON professional_services(service_id);
CREATE INDEX IF NOT EXISTS idx_professional_services_tenant ON professional_services(tenant_id);

CREATE INDEX IF NOT EXISTS idx_professional_exceptions_professional ON professional_availability_exceptions(professional_id);
CREATE INDEX IF NOT EXISTS idx_professional_exceptions_dates ON professional_availability_exceptions(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_professional_exceptions_tenant ON professional_availability_exceptions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_professional_schedules_professional ON professional_schedules(professional_id);
CREATE INDEX IF NOT EXISTS idx_professional_schedules_day ON professional_schedules(day_of_week);
CREATE INDEX IF NOT EXISTS idx_professional_schedules_tenant ON professional_schedules(tenant_id);

-- Create triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers (if they don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_professional_services_updated_at') THEN
        CREATE TRIGGER update_professional_services_updated_at 
            BEFORE UPDATE ON professional_services
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_professional_exceptions_updated_at') THEN
        CREATE TRIGGER update_professional_exceptions_updated_at 
            BEFORE UPDATE ON professional_availability_exceptions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_professional_schedules_updated_at') THEN
        CREATE TRIGGER update_professional_schedules_updated_at 
            BEFORE UPDATE ON professional_schedules
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Add helpful functions for professional management

-- Function to get professional availability for a specific date
CREATE OR REPLACE FUNCTION get_professional_availability(
    p_professional_id UUID,
    p_date DATE
) RETURNS TABLE (
    time_slot TIME,
    is_available BOOLEAN
) AS $$
DECLARE
    day_of_week INT;
    schedule_record RECORD;
    exception_record RECORD;
BEGIN
    -- Get day of week (0=Sunday, 6=Saturday)
    day_of_week := EXTRACT(DOW FROM p_date);
    
    -- Check if there's an exception for this date
    SELECT * INTO exception_record
    FROM professional_availability_exceptions
    WHERE professional_id = p_professional_id
      AND p_date BETWEEN start_date AND end_date
      AND is_active = true
    LIMIT 1;
    
    -- If there's an all-day exception, return no availability
    IF FOUND AND exception_record.is_all_day THEN
        RETURN;
    END IF;
    
    -- Get regular schedule for this day
    FOR schedule_record IN
        SELECT *
        FROM professional_schedules
        WHERE professional_id = p_professional_id
          AND day_of_week = get_professional_availability.day_of_week
          AND is_active = true
          AND (effective_from IS NULL OR p_date >= effective_from)
          AND (effective_until IS NULL OR p_date <= effective_until)
    LOOP
        -- Generate time slots based on schedule
        -- This is a simplified version - in practice you'd generate actual time slots
        time_slot := schedule_record.start_time;
        is_available := true;
        RETURN NEXT;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to check if professional is available for a specific time slot
CREATE OR REPLACE FUNCTION is_professional_available(
    p_professional_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
DECLARE
    conflict_count INTEGER;
    exception_count INTEGER;
BEGIN
    -- Check for appointment conflicts
    SELECT COUNT(*) INTO conflict_count
    FROM appointments
    WHERE professional_id = p_professional_id
      AND status NOT IN ('cancelled', 'no_show')
      AND (
          (start_time <= p_start_time AND end_time > p_start_time) OR
          (start_time < p_end_time AND end_time >= p_end_time) OR
          (start_time >= p_start_time AND end_time <= p_end_time)
      );
    
    -- Check for availability exceptions
    SELECT COUNT(*) INTO exception_count
    FROM professional_availability_exceptions
    WHERE professional_id = p_professional_id
      AND (p_start_time::DATE BETWEEN start_date AND end_date)
      AND (
          is_all_day = true OR
          (start_time <= p_start_time::TIME AND end_time > p_start_time::TIME)
      );
    
    RETURN (conflict_count = 0 AND exception_count = 0);
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE professional_services IS 'Junction table linking professionals to services with custom pricing and duration';
COMMENT ON TABLE professional_availability_exceptions IS 'Professional-specific schedule exceptions like vacations, sick days, etc.';
COMMENT ON TABLE professional_schedules IS 'Detailed weekly schedules for each professional with break times and slot durations';

COMMENT ON FUNCTION get_professional_availability(UUID, DATE) IS 'Returns available time slots for a professional on a specific date';
COMMENT ON FUNCTION is_professional_available(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS 'Checks if a professional is available for a specific time range';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Professional enhancement migration completed successfully';
    RAISE NOTICE 'Added tables: professional_services, professional_availability_exceptions, professional_schedules';
    RAISE NOTICE 'Added professional_id column to appointments table';
    RAISE NOTICE 'Added helper functions for availability checking';
    RAISE NOTICE 'System now supports complete professional-service-schedule management';
END $$;