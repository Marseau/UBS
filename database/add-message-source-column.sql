-- Migration: Add message_source column to conversation_history table
-- This column is needed to track the source of messages (whatsapp, whatsapp_demo, web, api)

-- Add message_source column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversation_history'
        AND column_name = 'message_source'
    ) THEN
        ALTER TABLE conversation_history
        ADD COLUMN message_source TEXT CHECK (message_source IN ('whatsapp', 'whatsapp_demo', 'web', 'api'));

        -- Set default value for existing records
        UPDATE conversation_history
        SET message_source = 'whatsapp'
        WHERE message_source IS NULL;

        RAISE NOTICE 'Added message_source column to conversation_history table';
    ELSE
        RAISE NOTICE 'message_source column already exists in conversation_history table';
    END IF;
END $$;