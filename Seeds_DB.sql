-- Seeds_DB.sql
-- Seeds Multi-tenant para Testes Conversacionais WhatsApp UBS
-- Gerado seguindo metodologia COLEAM00
-- Data: 2025-08-11

-- Limpar dados de teste anteriores (opcional)
-- DELETE FROM appointments WHERE is_test = true;
-- DELETE FROM services WHERE is_test = true;
-- DELETE FROM professionals WHERE is_test = true;
-- DELETE FROM users WHERE is_test = true;
-- DELETE FROM tenants WHERE is_test = true;

-- ====================
-- TENANTS DE TESTE POR DOMÍNIO
-- ====================

INSERT INTO tenants (id, name, domain, phone_number, subscription_plan, status, created_at, is_test, test_run_id) VALUES
-- Beleza
('tenant_1_beleza', 'Salão Elegância', 'beleza', '+5511987654321', 'profissional', 'active', NOW(), true, :'test_run_id'),
-- Saúde  
('tenant_2_saude', 'Clínica Vida Saudável', 'saude', '+5511987654322', 'enterprise', 'active', NOW(), true, :'test_run_id'),
-- Jurídico
('tenant_3_juridico', 'Advocacia Silva & Santos', 'juridico', '+5511987654323', 'profissional', 'active', NOW(), true, :'test_run_id'),
-- Educação
('tenant_4_educacao', 'EduTech Cursos', 'educacao', '+5511987654324', 'basico', 'active', NOW(), true, :'test_run_id'),
-- Esportes
('tenant_5_esportes', 'FitPro Academia', 'esportes', '+5511987654325', 'profissional', 'active', NOW(), true, :'test_run_id'),
-- Consultoria
('tenant_6_consultoria', 'BizConsult Pro', 'consultoria', '+5511987654326', 'enterprise', 'active', NOW(), true, :'test_run_id');

-- ====================
-- PROFISSIONAIS POR TENANT
-- ====================

INSERT INTO professionals (id, tenant_id, name, bio, avatar_url, working_hours, google_calendar_credentials, is_test, test_run_id) VALUES
-- Beleza - Salão Elegância
('prof_maria_beleza', 'tenant_1_beleza', 'Maria Silva', 'Cabeleireira há 10 anos especialista em cortes e coloração', null, 
 '{"Monday": "08:00-18:00", "Tuesday": "08:00-18:00", "Wednesday": "08:00-18:00", "Thursday": "08:00-18:00", "Friday": "08:00-18:00", "Saturday": "08:00-14:00"}', 
 null, true, :'test_run_id'),
('prof_ana_beleza', 'tenant_1_beleza', 'Ana Costa', 'Especialista em manicure, pedicure e design de sobrancelhas', null,
 '{"Tuesday": "09:00-17:00", "Wednesday": "09:00-17:00", "Thursday": "09:00-17:00", "Friday": "09:00-17:00", "Saturday": "09:00-15:00"}',
 null, true, :'test_run_id'),

-- Saúde - Clínica Vida
('prof_joao_saude', 'tenant_2_saude', 'Dr. João Santos', 'Clínico Geral - CRM 12345-SP', null,
 '{"Monday": "08:00-17:00", "Tuesday": "08:00-17:00", "Wednesday": "08:00-17:00", "Thursday": "08:00-17:00", "Friday": "08:00-17:00"}',
 null, true, :'test_run_id'),
('prof_carla_fisio', 'tenant_2_saude', 'Dra. Carla Fisio', 'Fisioterapeuta - CREFITO 54321-SP', null,
 '{"Monday": "07:00-16:00", "Tuesday": "07:00-16:00", "Thursday": "07:00-16:00", "Friday": "07:00-16:00"}',
 null, true, :'test_run_id'),

-- Jurídico - Advocacia Silva
('prof_silva_juridico', 'tenant_3_juridico', 'Dr. Roberto Silva', 'Advogado especialista em Direito do Trabalho - OAB 123456', null,
 '{"Monday": "09:00-18:00", "Tuesday": "09:00-18:00", "Wednesday": "09:00-18:00", "Thursday": "09:00-18:00", "Friday": "09:00-17:00"}',
 null, true, :'test_run_id'),

-- Educação - EduTech
('prof_lucia_math', 'tenant_4_educacao', 'Prof. Lúcia Matemática', 'Professora de Matemática - Ensino Fundamental e Médio', null,
 '{"Monday": "15:00-20:00", "Tuesday": "15:00-20:00", "Wednesday": "15:00-20:00", "Thursday": "15:00-20:00", "Saturday": "09:00-12:00"}',
 null, true, :'test_run_id'),

-- Esportes - FitPro
('prof_carlos_personal', 'tenant_5_esportes', 'Carlos Personal', 'Personal Trainer - CREF 98765-SP', null,
 '{"Monday": "06:00-20:00", "Tuesday": "06:00-20:00", "Wednesday": "06:00-20:00", "Thursday": "06:00-20:00", "Friday": "06:00-19:00", "Saturday": "07:00-12:00"}',
 null, true, :'test_run_id'),

-- Consultoria - BizConsult
('prof_patricia_biz', 'tenant_6_consultoria', 'Patricia Consultora', 'Consultora Empresarial - MBA em Gestão Estratégica', null,
 '{"Monday": "09:00-18:00", "Tuesday": "09:00-18:00", "Wednesday": "09:00-18:00", "Thursday": "09:00-18:00", "Friday": "09:00-17:00"}',
 null, true, :'test_run_id');

-- ====================
-- SERVIÇOS POR DOMÍNIO
-- ====================

INSERT INTO services (id, tenant_id, name, description, duration_minutes, price_cents, domain, is_active, is_test, test_run_id) VALUES
-- Beleza - Salão Elegância
('svc_corte_beleza', 'tenant_1_beleza', 'Corte Feminino', 'Corte + lavagem + escova', 60, 5000, 'beleza', true, true, :'test_run_id'),
('svc_coloracao_beleza', 'tenant_1_beleza', 'Coloração Completa', 'Pintura + matização + hidratação', 180, 15000, 'beleza', true, true, :'test_run_id'),
('svc_manicure_beleza', 'tenant_1_beleza', 'Manicure Completa', 'Cutículas + esmaltação + hidratação', 90, 3500, 'beleza', true, true, :'test_run_id'),
('svc_sobrancelha_beleza', 'tenant_1_beleza', 'Design de Sobrancelhas', 'Depilação + design + henna', 45, 2500, 'beleza', true, true, :'test_run_id'),
('svc_escova_beleza', 'tenant_1_beleza', 'Escova Modeladora', 'Lavagem + escova profissional', 45, 3000, 'beleza', true, true, :'test_run_id'),

-- Saúde - Clínica Vida
('svc_consulta_saude', 'tenant_2_saude', 'Consulta Clínico Geral', 'Consulta médica completa', 60, 15000, 'saude', true, true, :'test_run_id'),
('svc_retorno_saude', 'tenant_2_saude', 'Retorno Médico', 'Consulta de retorno/acompanhamento', 30, 8000, 'saude', true, true, :'test_run_id'),
('svc_fisioterapia_saude', 'tenant_2_saude', 'Sessão Fisioterapia', 'Fisioterapia personalizada', 50, 12000, 'saude', true, true, :'test_run_id'),
('svc_dermatologia_saude', 'tenant_2_saude', 'Consulta Dermatológica', 'Avaliação dermatológica', 45, 18000, 'saude', true, true, :'test_run_id'),

-- Jurídico - Advocacia Silva
('svc_consulta_inicial_juridico', 'tenant_3_juridico', 'Consulta Inicial', 'Primeira consulta jurídica', 90, 25000, 'juridico', true, true, :'test_run_id'),
('svc_retorno_juridico', 'tenant_3_juridico', 'Consulta de Retorno', 'Acompanhamento processual', 60, 15000, 'juridico', true, true, :'test_run_id'),
('svc_reuniao_remota_juridico', 'tenant_3_juridico', 'Reunião Online', 'Videoconferência jurídica', 60, 12000, 'juridico', true, true, :'test_run_id'),

-- Educação - EduTech
('svc_aula_matematica_educacao', 'tenant_4_educacao', 'Aula Particular Matemática', 'Reforço escolar matemática', 60, 8000, 'educacao', true, true, :'test_run_id'),
('svc_mentoria_educacao', 'tenant_4_educacao', 'Mentoria Educacional', 'Orientação acadêmica', 90, 12000, 'educacao', true, true, :'test_run_id'),
('svc_preparatorio_educacao', 'tenant_4_educacao', 'Preparatório Vestibular', 'Preparação para vestibular', 120, 15000, 'educacao', true, true, :'test_run_id'),

-- Esportes - FitPro
('svc_personal_esportes', 'tenant_5_esportes', 'Personal Training', 'Treino personalizado', 60, 10000, 'esportes', true, true, :'test_run_id'),
('svc_avaliacao_esportes', 'tenant_5_esportes', 'Avaliação Física', 'Avaliação física completa', 90, 15000, 'esportes', true, true, :'test_run_id'),
('svc_quadra_esportes', 'tenant_5_esportes', 'Reserva Quadra', 'Quadra de tênis/futsal', 60, 5000, 'esportes', true, true, :'test_run_id'),

-- Consultoria - BizConsult
('svc_diagnostico_consultoria', 'tenant_6_consultoria', 'Diagnóstico Empresarial', 'Análise completa do negócio', 120, 35000, 'consultoria', true, true, :'test_run_id'),
('svc_workshop_consultoria', 'tenant_6_consultoria', 'Workshop Empresarial', 'Treinamento para equipes', 180, 50000, 'consultoria', true, true, :'test_run_id'),
('svc_sprint_consultoria', 'tenant_6_consultoria', 'Sprint Review', 'Acompanhamento de projetos', 90, 25000, 'consultoria', true, true, :'test_run_id');

-- ====================
-- USUÁRIOS (CLIENTES SINTÉTICOS)
-- ====================

INSERT INTO users (id, tenant_id, phone_number, name, email, created_at, is_test, test_run_id) VALUES
-- Clientes Beleza
('user_ana_beleza', 'tenant_1_beleza', '+5511900000001', 'Ana Silva', 'ana.silva.test@example.com', NOW(), true, :'test_run_id'),
('user_beatriz_beleza', 'tenant_1_beleza', '+5511900000002', 'Beatriz Santos', 'beatriz.santos.test@example.com', NOW(), true, :'test_run_id'),
('user_carla_beleza', 'tenant_1_beleza', '+5511900000003', 'Carla Oliveira', 'carla.oliveira.test@example.com', NOW(), true, :'test_run_id'),

-- Clientes Saúde
('user_diego_saude', 'tenant_2_saude', '+5511900000004', 'Diego Costa', 'diego.costa.test@example.com', NOW(), true, :'test_run_id'),
('user_elena_saude', 'tenant_2_saude', '+5511900000005', 'Elena Rodrigues', 'elena.rodrigues.test@example.com', NOW(), true, :'test_run_id'),
('user_fabio_saude', 'tenant_2_saude', '+5511900000006', 'Fábio Lima', 'fabio.lima.test@example.com', NOW(), true, :'test_run_id'),

-- Clientes Jurídico
('user_gabriela_juridico', 'tenant_3_juridico', '+5511900000007', 'Gabriela Ferreira', 'gabriela.ferreira.test@example.com', NOW(), true, :'test_run_id'),
('user_henrique_juridico', 'tenant_3_juridico', '+5511900000008', 'Henrique Alves', 'henrique.alves.test@example.com', NOW(), true, :'test_run_id'),

-- Clientes Educação (Responsáveis)
('user_isabel_educacao', 'tenant_4_educacao', '+5511900000009', 'Isabel Mãe', 'isabel.mae.test@example.com', NOW(), true, :'test_run_id'),
('user_joao_educacao', 'tenant_4_educacao', '+5511900000010', 'João Pai', 'joao.pai.test@example.com', NOW(), true, :'test_run_id'),

-- Clientes Esportes
('user_karla_esportes', 'tenant_5_esportes', '+5511900000011', 'Karla Fitness', 'karla.fitness.test@example.com', NOW(), true, :'test_run_id'),
('user_lucas_esportes', 'tenant_5_esportes', '+5511900000012', 'Lucas Atleta', 'lucas.atleta.test@example.com', NOW(), true, :'test_run_id'),

-- Clientes Consultoria
('user_mariana_consultoria', 'tenant_6_consultoria', '+5511900000013', 'Mariana Empresária', 'mariana.empresaria.test@example.com', NOW(), true, :'test_run_id'),
('user_nelson_consultoria', 'tenant_6_consultoria', '+5511900000014', 'Nelson CEO', 'nelson.ceo.test@example.com', NOW(), true, :'test_run_id');

-- ====================
-- FERIADOS BRASILEIROS 2025 (Para validação de regras)
-- ====================

INSERT INTO holidays (date, name, is_national, created_at, is_test, test_run_id) VALUES
('2025-01-01', 'Confraternização Universal', true, NOW(), true, :'test_run_id'),
('2025-02-17', 'Carnaval', true, NOW(), true, :'test_run_id'),
('2025-02-18', 'Carnaval', true, NOW(), true, :'test_run_id'),
('2025-04-18', 'Sexta-feira Santa', true, NOW(), true, :'test_run_id'),
('2025-04-21', 'Tiradentes', true, NOW(), true, :'test_run_id'),
('2025-05-01', 'Dia do Trabalhador', true, NOW(), true, :'test_run_id'),
('2025-09-07', 'Independência do Brasil', true, NOW(), true, :'test_run_id'),
('2025-10-12', 'Nossa Senhora Aparecida', true, NOW(), true, :'test_run_id'),
('2025-11-02', 'Finados', true, NOW(), true, :'test_run_id'),
('2025-11-15', 'Proclamação da República', true, NOW(), true, :'test_run_id'),
('2025-12-25', 'Natal', true, NOW(), true, :'test_run_id');

-- ====================
-- CONFIGURAÇÕES DE HORÁRIO DE FUNCIONAMENTO
-- ====================

INSERT INTO business_hours (tenant_id, day_of_week, opening_time, closing_time, is_active, created_at, is_test, test_run_id) VALUES
-- Beleza - Seg a Sex 8h-18h, Sab 8h-14h
('tenant_1_beleza', 'monday', '08:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_1_beleza', 'tuesday', '08:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_1_beleza', 'wednesday', '08:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_1_beleza', 'thursday', '08:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_1_beleza', 'friday', '08:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_1_beleza', 'saturday', '08:00', '14:00', true, NOW(), true, :'test_run_id'),

-- Saúde - Seg a Sex 8h-17h
('tenant_2_saude', 'monday', '08:00', '17:00', true, NOW(), true, :'test_run_id'),
('tenant_2_saude', 'tuesday', '08:00', '17:00', true, NOW(), true, :'test_run_id'),
('tenant_2_saude', 'wednesday', '08:00', '17:00', true, NOW(), true, :'test_run_id'),
('tenant_2_saude', 'thursday', '08:00', '17:00', true, NOW(), true, :'test_run_id'),
('tenant_2_saude', 'friday', '08:00', '17:00', true, NOW(), true, :'test_run_id'),

-- Jurídico - Seg a Sex 9h-18h
('tenant_3_juridico', 'monday', '09:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_3_juridico', 'tuesday', '09:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_3_juridico', 'wednesday', '09:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_3_juridico', 'thursday', '09:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_3_juridico', 'friday', '09:00', '17:00', true, NOW(), true, :'test_run_id'),

-- Educação - Seg a Qui 15h-20h, Sab 9h-12h (pós-escola)
('tenant_4_educacao', 'monday', '15:00', '20:00', true, NOW(), true, :'test_run_id'),
('tenant_4_educacao', 'tuesday', '15:00', '20:00', true, NOW(), true, :'test_run_id'),
('tenant_4_educacao', 'wednesday', '15:00', '20:00', true, NOW(), true, :'test_run_id'),
('tenant_4_educacao', 'thursday', '15:00', '20:00', true, NOW(), true, :'test_run_id'),
('tenant_4_educacao', 'saturday', '09:00', '12:00', true, NOW(), true, :'test_run_id'),

-- Esportes - Seg a Sex 6h-20h, Sab 7h-12h
('tenant_5_esportes', 'monday', '06:00', '20:00', true, NOW(), true, :'test_run_id'),
('tenant_5_esportes', 'tuesday', '06:00', '20:00', true, NOW(), true, :'test_run_id'),
('tenant_5_esportes', 'wednesday', '06:00', '20:00', true, NOW(), true, :'test_run_id'),
('tenant_5_esportes', 'thursday', '06:00', '20:00', true, NOW(), true, :'test_run_id'),
('tenant_5_esportes', 'friday', '06:00', '19:00', true, NOW(), true, :'test_run_id'),
('tenant_5_esportes', 'saturday', '07:00', '12:00', true, NOW(), true, :'test_run_id'),

-- Consultoria - Seg a Sex 9h-18h
('tenant_6_consultoria', 'monday', '09:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_6_consultoria', 'tuesday', '09:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_6_consultoria', 'wednesday', '09:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_6_consultoria', 'thursday', '09:00', '18:00', true, NOW(), true, :'test_run_id'),
('tenant_6_consultoria', 'friday', '09:00', '17:00', true, NOW(), true, :'test_run_id');

-- ====================
-- POLÍTICAS DE CANCELAMENTO E REAGENDAMENTO (JSON)
-- ====================

INSERT INTO tenant_policies (tenant_id, policy_type, policy_data, is_active, created_at, is_test, test_run_id) VALUES
('tenant_1_beleza', 'cancellation', '{"min_hours_before": 12, "penalty_percentage": 0, "no_show_penalty": 0.5}', true, NOW(), true, :'test_run_id'),
('tenant_1_beleza', 'rescheduling', '{"min_hours_before": 24, "max_reschedules": 2, "same_day_allowed": false}', true, NOW(), true, :'test_run_id'),

('tenant_2_saude', 'cancellation', '{"min_hours_before": 24, "penalty_percentage": 0, "no_show_penalty": 1.0}', true, NOW(), true, :'test_run_id'),
('tenant_2_saude', 'rescheduling', '{"min_hours_before": 24, "max_reschedules": 1, "same_day_allowed": false}', true, NOW(), true, :'test_run_id'),
('tenant_2_saude', 'double_booking', '{"allowed": false, "buffer_minutes": 30}', true, NOW(), true, :'test_run_id'),

('tenant_3_juridico', 'cancellation', '{"min_hours_before": 24, "penalty_percentage": 0.3, "no_show_penalty": 1.0}', true, NOW(), true, :'test_run_id'),
('tenant_3_juridico', 'deposit', '{"required_services": ["svc_consulta_inicial_juridico"], "percentage": 0.5}', true, NOW(), true, :'test_run_id'),

('tenant_4_educacao', 'cancellation', '{"min_hours_before": 12, "penalty_percentage": 0, "no_show_penalty": 0.5}', true, NOW(), true, :'test_run_id'),

('tenant_5_esportes', 'cancellation', '{"min_hours_before": 12, "penalty_percentage": 0, "no_show_penalty": 0.3}', true, NOW(), true, :'test_run_id'),

('tenant_6_consultoria', 'cancellation', '{"min_hours_before": 48, "penalty_percentage": 0.5, "no_show_penalty": 1.0}', true, NOW(), true, :'test_run_id'),
('tenant_6_consultoria', 'deposit', '{"required_services": ["svc_diagnostico_consultoria", "svc_workshop_consultoria"], "percentage": 0.3}', true, NOW(), true, :'test_run_id');

-- ====================
-- TEST RUN TRACKING
-- ====================

INSERT INTO test_runs (test_run_id, started_at, status, total_scenarios, domains_tested, created_by, notes, is_test) VALUES
(:'test_run_id', NOW(), 'prepared', 130, '["beleza","saude","juridico","educacao","esportes","consultoria"]', 'system', 'Seeds aplicados - sistema pronto para execução de testes', true);

-- ====================
-- COMMIT TRANSACTION
-- ====================

COMMIT;

-- Mostrar resumo dos dados inseridos
SELECT 
    'RESUMO SEEDS APLICADOS:' as info,
    (SELECT COUNT(*) FROM tenants WHERE test_run_id = :'test_run_id') as tenants_criados,
    (SELECT COUNT(*) FROM professionals WHERE test_run_id = :'test_run_id') as profissionais_criados,
    (SELECT COUNT(*) FROM services WHERE test_run_id = :'test_run_id') as servicos_criados,
    (SELECT COUNT(*) FROM users WHERE test_run_id = :'test_run_id') as usuarios_criados,
    (SELECT COUNT(*) FROM holidays WHERE test_run_id = :'test_run_id') as feriados_criados,
    (SELECT COUNT(*) FROM business_hours WHERE test_run_id = :'test_run_id') as horarios_definidos,
    (SELECT COUNT(*) FROM tenant_policies WHERE test_run_id = :'test_run_id') as politicas_definidas;