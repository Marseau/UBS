-- ================================================================================
-- ENCONTRAR CAMPOS QUE AINDA TÊM DECIMAL(5,2)
-- ================================================================================

SELECT column_name, data_type, numeric_precision, numeric_scale 
FROM information_schema.columns 
WHERE table_name = 'ubs_metric_system' 
  AND data_type = 'numeric'
  AND numeric_precision = 5 
  AND numeric_scale = 2
ORDER BY column_name;