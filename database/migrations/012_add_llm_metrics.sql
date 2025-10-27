-- Migration: Add LLM metrics to editorial_content table
-- Created: 2025-10-04
-- Purpose: Track OpenAI usage, costs, and performance metrics

ALTER TABLE editorial_content
ADD COLUMN llm_model VARCHAR(50),
ADD COLUMN llm_prompt_tokens INTEGER DEFAULT 0,
ADD COLUMN llm_completion_tokens INTEGER DEFAULT 0,
ADD COLUMN llm_total_tokens INTEGER DEFAULT 0,
ADD COLUMN llm_cost_usd DECIMAL(10,6) DEFAULT 0,
ADD COLUMN llm_generation_time_ms INTEGER DEFAULT 0,
ADD COLUMN llm_temperature DECIMAL(3,2) DEFAULT 0.7;

-- Add comment for documentation
COMMENT ON COLUMN editorial_content.llm_model IS 'OpenAI model used (ex: gpt-4o, gpt-4-turbo)';
COMMENT ON COLUMN editorial_content.llm_prompt_tokens IS 'Number of tokens in the prompt';
COMMENT ON COLUMN editorial_content.llm_completion_tokens IS 'Number of tokens in the completion';
COMMENT ON COLUMN editorial_content.llm_total_tokens IS 'Total tokens used (prompt + completion)';
COMMENT ON COLUMN editorial_content.llm_cost_usd IS 'Estimated cost in USD based on token usage';
COMMENT ON COLUMN editorial_content.llm_generation_time_ms IS 'Time taken to generate content in milliseconds';
COMMENT ON COLUMN editorial_content.llm_temperature IS 'Temperature parameter used for generation';

-- Create index for cost analysis queries
CREATE INDEX idx_editorial_llm_cost ON editorial_content(llm_cost_usd, created_at);
CREATE INDEX idx_editorial_llm_model ON editorial_content(llm_model);
