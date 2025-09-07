-- Seed: Default Business Policies
-- Date: 2025-09-06
-- Description: Inserts default contextual policies for all tenants

-- Função para inserir políticas padrão para todos os tenants
DO $$
DECLARE
  tenant_record RECORD;
  policy_id UUID;
  condition_id UUID;
  action_id UUID;
BEGIN
  
  -- Iterar sobre todos os tenants existentes
  FOR tenant_record IN SELECT id, name FROM tenants LOOP
    
    RAISE NOTICE 'Creating default policies for tenant: %', tenant_record.name;
    
    -- POLÍTICA 1: Horário Comercial
    INSERT INTO business_policies (tenant_id, name, intent, priority, enabled, tenant_scoped)
    VALUES (tenant_record.id, 'Permitir agendamentos apenas no horário comercial', 'availability', 1, true, true)
    RETURNING id INTO policy_id;
    
    -- Condição: Horário entre 09:00 e 18:00
    INSERT INTO business_policy_conditions (policy_id, type, operator, value_json)
    VALUES (policy_id, 'time', 'in_range', '{"start": "09:00", "end": "18:00"}');
    
    -- Ação: Bloquear com mensagem
    INSERT INTO business_policy_actions (policy_id, type, message)
    VALUES (policy_id, 'block', '🕒 Nossos agendamentos estão disponíveis apenas durante horário comercial (9h às 18h). Tente novamente amanhã!');
    
    -- POLÍTICA 2: Onboarding para Novos Usuários
    INSERT INTO business_policies (tenant_id, name, intent, priority, enabled, tenant_scoped)
    VALUES (tenant_record.id, 'Guiar novos usuários para onboarding completo', 'all', 2, true, false)
    RETURNING id INTO policy_id;
    
    -- Condição: Usuário novo
    INSERT INTO business_policy_conditions (policy_id, type, operator, field, value_json)
    VALUES (policy_id, 'user_type', 'equals', 'is_new_user', 'true');
    
    -- Ação: Melhorar resposta com orientação
    INSERT INTO business_policy_actions (policy_id, type, message, metadata_json)
    VALUES (policy_id, 'enhance', '👋 Olá! Vejo que é sua primeira vez aqui. Que tal conhecer nossos serviços primeiro?', 
            '{"suggest_services": true, "collect_profile": true}');
    
    -- POLÍTICA 3: Tratamento VIP
    INSERT INTO business_policies (tenant_id, name, intent, priority, enabled, tenant_scoped)
    VALUES (tenant_record.id, 'Tratamento especial para clientes VIP', 'all', 1, true, true)
    RETURNING id INTO policy_id;
    
    -- Condição: Status VIP
    INSERT INTO business_policy_conditions (policy_id, type, operator, field, value_json)
    VALUES (policy_id, 'user_type', 'equals', 'vip_status', 'true');
    
    -- Ação: Melhorar com tratamento especial
    INSERT INTO business_policy_actions (policy_id, type, message, metadata_json)
    VALUES (policy_id, 'enhance', '⭐ Olá! Como cliente preferencial, temos prioridade nos melhores horários para você.',
            '{"vip_slots": true, "priority_booking": true}');
    
    -- POLÍTICA 4: Usuários com Muitos Cancelamentos
    INSERT INTO business_policies (tenant_id, name, intent, priority, enabled, tenant_scoped)
    VALUES (tenant_record.id, 'Política para usuários com muitos cancelamentos', 'availability', 2, true, true)
    RETURNING id INTO policy_id;
    
    -- Condição: Mais de 3 cancelamentos
    INSERT INTO business_policy_conditions (policy_id, type, operator, field, value_json)
    VALUES (policy_id, 'appointment_count', 'greater', 'cancelled_count', '3');
    
    -- Ação: Modificar resposta com aviso
    INSERT INTO business_policy_actions (policy_id, type, message)
    VALUES (policy_id, 'modify_response', '⚠️ Observamos alguns cancelamentos recentes. Para garantir sua vaga, pedimos confirmação até 24h antes do horário.');
    
    -- POLÍTICA 5: No-shows Excessivos  
    INSERT INTO business_policies (tenant_id, name, intent, priority, enabled, tenant_scoped)
    VALUES (tenant_record.id, 'Restrições para usuários com no-shows frequentes', 'availability', 1, true, true)
    RETURNING id INTO policy_id;
    
    -- Condição: 3+ no-shows
    INSERT INTO business_policy_conditions (policy_id, type, operator, field, value_json)
    VALUES (policy_id, 'appointment_count', 'greater_equal', 'noshow_count', '3');
    
    -- Ação: Modificar com confirmação obrigatória
    INSERT INTO business_policy_actions (policy_id, type, message, metadata_json)
    VALUES (policy_id, 'modify_response', '⚠️ Para garantir seu horário, pedimos confirmação até 2 horas antes do agendamento devido a ausências anteriores.',
            '{"require_confirmation": true, "confirmation_window": 2}');
    
    -- POLÍTICA 6: Fim de Semana (Exemplo de configuração por tenant)
    INSERT INTO business_policies (tenant_id, name, intent, priority, enabled, tenant_scoped)
    VALUES (tenant_record.id, 'Horários reduzidos nos finais de semana', 'availability', 3, false, true)
    RETURNING id INTO policy_id;
    
    -- Condição: Fim de semana
    INSERT INTO business_policy_conditions (policy_id, type, operator, value_json)
    VALUES (policy_id, 'time', 'day_of_week', '{"days": ["saturday", "sunday"]}');
    
    -- Condição adicional: Horário específico de fim de semana
    INSERT INTO business_policy_conditions (policy_id, type, operator, value_json)
    VALUES (policy_id, 'time', 'in_range', '{"start": "10:00", "end": "16:00"}');
    
    -- Ação: Modificar com aviso de horário reduzido
    INSERT INTO business_policy_actions (policy_id, type, message)
    VALUES (policy_id, 'enhance', '📅 Nos finais de semana funcionamos em horário reduzido (10h às 16h).');
    
  END LOOP;
  
  RAISE NOTICE 'Default policies created for all tenants successfully!';
  
END $$;