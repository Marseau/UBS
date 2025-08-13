-- Production-Seeds-Real-Schema.sql
-- Framework de Simulação do App em Produção - WhatsApp Salon UBS
-- Usando schema real de produção com UUIDs e estruturas autênticas
-- Metodologia COLEAM00 para testes enterprise
-- Data: 2025-08-11

-- ========================================
-- CONFIGURAÇÃO DE TESTE PARA PRODUÇÃO
-- ========================================

-- Usar test_execution_id passado pelo script (fallback se não vier)
\if :{?test_exec_id}
  -- Usa o valor recebido do script
\else
  \set test_exec_id '''TEST_' || to_char(now(), 'YYYYMMDD_HH24MISS') || '_' || substr(md5(random()::text), 1, 8) || ''''
\endif

-- Adicionar campos de identificação de teste (não-invasivo)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS test_execution_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS test_execution_id TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS test_execution_id TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS test_execution_id TEXT;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS test_execution_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS test_execution_id TEXT;
ALTER TABLE conversation_history ADD COLUMN IF NOT EXISTS test_execution_id TEXT;
ALTER TABLE usage_costs ADD COLUMN IF NOT EXISTS test_execution_id TEXT;

-- ========================================
-- TENANTS REAIS POR DOMÍNIO DE NEGÓCIO  
-- ========================================

INSERT INTO tenants (
    name, slug, business_name, business_description, domain, email, phone, whatsapp_phone,
    business_address, status, subscription_plan, ai_settings, domain_config, business_rules,
    monthly_subscription_fee, plan_type, subscription_status, test_execution_id
) VALUES
-- 1. BEAUTY - Salão Elegância Premium
(
    'Salão Elegância Premium', 
    'salao-elegancia-premium', 
    'Salão Elegância Premium Ltda',
    'Salão de beleza premium especializado em cortes, coloração e tratamentos capilares de alta qualidade',
    'beauty'::business_domain,
    'contato@salaoelegancia.com.br'::email,
    '+5511987654321',
    '+5511987654321',
    '{"street": "Rua Augusta, 1234", "neighborhood": "Jardins", "city": "São Paulo", "state": "SP", "zip": "01305-001", "country": "Brasil"}'::jsonb,
    'active',
    'profissional',
    '{"upsell_enabled": true, "domain_keywords": ["corte", "coloração", "escova", "tratamento", "manicure"], "greeting_message": "Olá! Bem-vinda ao Salão Elegância! Como posso ajudá-la hoje?", "sensitive_topics": ["alergia", "gravidez", "química"], "escalation_triggers": ["emergência", "reação alérgica", "problema"], "motivational_messages": true}'::jsonb,
    '{"specialties": ["cortes femininos", "coloração premium", "tratamentos capilares"], "peak_hours": ["10:00", "14:00", "18:00"], "preferred_booking_window": 7}'::jsonb,
    '{"working_hours": {"monday": ["08:00-18:00"], "tuesday": ["08:00-18:00"], "wednesday": ["08:00-18:00"], "thursday": ["08:00-18:00"], "friday": ["08:00-18:00"], "saturday": ["08:00-14:00"], "sunday": []}, "cancellation_policy": "12 horas de antecedência", "advance_booking_days": 30, "payment_methods": ["dinheiro", "cartão", "pix"], "loyalty_program": true}'::jsonb,
    129.90,
    'profissional',
    'active',
    :test_exec_id
),

-- 2. HEALTHCARE - Clínica Vida Saudável  
(
    'Clínica Vida Saudável',
    'clinica-vida-saudavel', 
    'Clínica Vida Saudável Ltda',
    'Clínica médica especializada em clínica geral, fisioterapia e consultas especializadas',
    'healthcare'::business_domain,
    'recepcao@clinicavida.com.br'::email,
    '+5511987654322',
    '+5511987654322', 
    '{"street": "Av. Paulista, 1500", "neighborhood": "Bela Vista", "city": "São Paulo", "state": "SP", "zip": "01310-100", "country": "Brasil"}'::jsonb,
    'active',
    'enterprise',
    '{"upsell_enabled": false, "domain_keywords": ["consulta", "médico", "fisioterapia", "retorno", "exame"], "greeting_message": "Olá! Esta é a Clínica Vida Saudável. Como posso ajudá-lo com seu agendamento médico?", "sensitive_topics": ["emergência", "dor forte", "sintomas graves"], "escalation_triggers": ["EMERGÊNCIA", "SAMU", "dor no peito", "falta de ar"], "motivational_messages": false}'::jsonb,
    '{"medical_specialties": ["clínica geral", "fisioterapia", "dermatologia"], "emergency_protocol": true, "insurance_accepted": ["Unimed", "Bradesco", "SulAmérica"]}'::jsonb,
    '{"working_hours": {"monday": ["08:00-17:00"], "tuesday": ["08:00-17:00"], "wednesday": ["08:00-17:00"], "thursday": ["08:00-17:00"], "friday": ["08:00-17:00"], "saturday": [], "sunday": []}, "cancellation_policy": "24 horas de antecedência obrigatória", "advance_booking_days": 60, "payment_methods": ["cartão", "convênio"], "double_booking_buffer": 30}'::jsonb,
    299.90,
    'enterprise', 
    'active',
    :test_exec_id
),

-- 3. LEGAL - Advocacia Silva & Santos
(
    'Advocacia Silva & Santos',
    'advocacia-silva-santos',
    'Silva & Santos Advocacia Ltda', 
    'Escritório de advocacia especializado em direito trabalhista, civil e empresarial',
    'legal'::business_domain,
    'contato@silvasantos.adv.br'::email,
    '+5511987654323',
    '+5511987654323',
    '{"street": "Rua Líbero Badaró, 425", "neighborhood": "Centro", "city": "São Paulo", "state": "SP", "zip": "01009-000", "country": "Brasil"}'::jsonb,
    'active',
    'profissional',
    '{"upsell_enabled": true, "domain_keywords": ["consulta jurídica", "advogado", "processo", "trabalhista", "contrato"], "greeting_message": "Olá! Aqui é a Advocacia Silva & Santos. Como podemos ajudá-lo juridicamente?", "sensitive_topics": ["urgência legal", "prazo processual", "embargo"], "escalation_triggers": ["prazo vencendo", "urgente", "liminar"], "motivational_messages": false}'::jsonb,
    '{"legal_areas": ["trabalhista", "civil", "empresarial"], "consultation_types": ["inicial", "retorno", "online"], "document_review": true}'::jsonb,
    '{"working_hours": {"monday": ["09:00-18:00"], "tuesday": ["09:00-18:00"], "wednesday": ["09:00-18:00"], "thursday": ["09:00-18:00"], "friday": ["09:00-17:00"], "saturday": [], "sunday": []}, "cancellation_policy": "24 horas com taxa de 30%", "advance_booking_days": 45, "payment_methods": ["cartão", "transferência"], "deposit_required": true, "deposit_percentage": 50}'::jsonb,
    199.90,
    'profissional',
    'active',
    :test_exec_id
),

-- 4. EDUCATION - EduTech Cursos Personalizados
(
    'EduTech Cursos Personalizados', 
    'edutech-cursos',
    'EduTech Educação Ltda',
    'Plataforma de ensino personalizado com professores especializados em reforço escolar e preparatórios',
    'education'::business_domain,
    'atendimento@edutech.com.br'::email,
    '+5511987654324',
    '+5511987654324',
    '{"street": "Rua da Consolação, 1000", "neighborhood": "Consolação", "city": "São Paulo", "state": "SP", "zip": "01302-100", "country": "Brasil"}'::jsonb,
    'active',
    'standard',
    '{"upsell_enabled": true, "domain_keywords": ["aula particular", "reforço", "matemática", "vestibular", "enem"], "greeting_message": "Oi! Aqui é a EduTech! Vamos agendar sua aula personalizada?", "sensitive_topics": ["dificuldade aprendizado", "nota baixa", "ansiedade"], "escalation_triggers": ["pais nervosos", "urgência prova", "vestibular próximo"], "motivational_messages": true}'::jsonb,
    '{"subjects": ["matemática", "física", "química", "português"], "student_levels": ["fundamental", "médio", "pré-vestibular"], "online_classes": true}'::jsonb,
    '{"working_hours": {"monday": ["15:00-20:00"], "tuesday": ["15:00-20:00"], "wednesday": ["15:00-20:00"], "thursday": ["15:00-20:00"], "friday": ["15:00-20:00"], "saturday": ["09:00-12:00"], "sunday": []}, "cancellation_policy": "12 horas de antecedência", "advance_booking_days": 21, "payment_methods": ["cartão", "pix"], "package_discounts": true}'::jsonb,
    89.90,
    'standard',
    'active', 
    :test_exec_id
),

-- 5. SPORTS - FitPro Academia & Personal
(
    'FitPro Academia & Personal',
    'fitpro-academia',
    'FitPro Fitness Ltda',
    'Academia completa com personal trainers, avaliação física e modalidades esportivas',
    'sports'::business_domain,
    'contato@fitpro.com.br'::email,
    '+5511987654325',
    '+5511987654325',
    '{"street": "Av. Faria Lima, 2000", "neighborhood": "Itaim Bibi", "city": "São Paulo", "state": "SP", "zip": "01452-000", "country": "Brasil"}'::jsonb,
    'active',
    'profissional',
    '{"upsell_enabled": true, "domain_keywords": ["personal trainer", "treino", "avaliação física", "quadra", "musculação"], "greeting_message": "E aí! Bem-vindo à FitPro! Vamos agendar seu treino?", "sensitive_topics": ["lesão", "problema cardíaco", "limitação física"], "escalation_triggers": ["dor durante exercício", "problema saúde", "lesão"], "motivational_messages": true}'::jsonb,
    '{"modalities": ["musculação", "funcional", "pilates", "tênis"], "fitness_levels": ["iniciante", "intermediário", "avançado"], "group_classes": true}'::jsonb,
    '{"working_hours": {"monday": ["06:00-22:00"], "tuesday": ["06:00-22:00"], "wednesday": ["06:00-22:00"], "thursday": ["06:00-22:00"], "friday": ["06:00-20:00"], "saturday": ["07:00-14:00"], "sunday": ["08:00-12:00"]}, "cancellation_policy": "12 horas para personal, 2 horas para quadra", "advance_booking_days": 14, "payment_methods": ["cartão", "débito", "dinheiro"], "peak_hours_surcharge": 20}'::jsonb,
    159.90,
    'profissional',
    'active',
    :test_exec_id
),

-- 6. CONSULTING - BizConsult Estratégia Empresarial
(
    'BizConsult Estratégia Empresarial',
    'bizconsult-estrategia', 
    'BizConsult Consultoria Ltda',
    'Consultoria empresarial especializada em diagnósticos, workshops e acompanhamento estratégico',
    'consulting'::business_domain,
    'patricia@bizconsult.com.br'::email,
    '+5511987654326',
    '+5511987654326',
    '{"street": "Av. Brigadeiro Faria Lima, 3000", "neighborhood": "Itaim Bibi", "city": "São Paulo", "state": "SP", "zip": "01451-000", "country": "Brasil"}'::jsonb,
    'active',
    'enterprise',
    '{"upsell_enabled": true, "domain_keywords": ["diagnóstico empresarial", "consultoria", "workshop", "estratégia", "gestão"], "greeting_message": "Olá! Aqui é a Patricia da BizConsult. Como posso ajudar sua empresa a crescer?", "sensitive_topics": ["crise financeira", "demissões", "falência"], "escalation_triggers": ["urgência estratégica", "crise", "deadline projeto"], "motivational_messages": false}'::jsonb,
    '{"consulting_areas": ["estratégia", "operações", "recursos humanos", "financeiro"], "project_types": ["diagnóstico", "implementação", "treinamento"], "industry_expertise": ["tecnologia", "varejo", "serviços"]}'::jsonb,
    '{"working_hours": {"monday": ["09:00-18:00"], "tuesday": ["09:00-18:00"], "wednesday": ["09:00-18:00"], "thursday": ["09:00-18:00"], "friday": ["09:00-17:00"], "saturday": [], "sunday": []}, "cancellation_policy": "48 horas com taxa de 50%", "advance_booking_days": 30, "payment_methods": ["cartão", "transferência", "boleto"], "deposit_required": true, "deposit_percentage": 30}'::jsonb,
    599.90,
    'enterprise',
    'active',
    :test_exec_id
);

-- ========================================
-- SERVICE CATEGORIES POR DOMÍNIO
-- ========================================

-- Inserir categorias filtradas por domínio de negócio
WITH categories_by_domain (domain, name, description, display_order) AS (
    VALUES
        ('beauty', 'Cabelos', 'Serviços para cabelos: cortes, coloração, tratamentos', 1),
        ('beauty', 'Unhas & Estética', 'Manicure, pedicure e cuidados estéticos', 2),
        
        ('healthcare', 'Consultas Médicas', 'Consultas e retornos médicos', 1),
        ('healthcare', 'Fisioterapia', 'Sessões de fisioterapia e reabilitação', 2),
        
        ('legal', 'Consultas Jurídicas', 'Consultas e acompanhamento legal', 1),
        ('legal', 'Processos', 'Acompanhamento processual e documentos', 2),
        
        ('education', 'Aulas Particulares', 'Reforço escolar personalizado', 1),
        ('education', 'Preparatórios', 'Preparação para vestibulares e concursos', 2),
        
        ('sports', 'Personal Training', 'Treinos personalizados', 1), 
        ('sports', 'Modalidades', 'Aulas e reservas de espaços', 2),
        
        ('consulting', 'Diagnósticos', 'Análises e diagnósticos empresariais', 1),
        ('consulting', 'Implementação', 'Workshops e implementações', 2)
)
INSERT INTO service_categories (tenant_id, name, description, display_order, test_execution_id)
SELECT 
    t.id as tenant_id,
    c.name,
    c.description, 
    c.display_order,
    :test_exec_id
FROM tenants t
JOIN categories_by_domain c ON c.domain = t.domain::text
WHERE t.test_execution_id = :test_exec_id;

-- ========================================
-- PROFESSIONALS ESPECIALIZADOS POR TENANT
-- ========================================

-- Inserir profissionais filtrados por domínio de negócio
WITH professionals_by_domain (domain, name, bio, email, phone, specialties, working_hours) AS (
    VALUES
        -- Beauty Professionals
        ('beauty', 'Maria Silva Cabeleireira', 'Cabeleireira há 12 anos, especialista em cortes femininos e coloração premium', 'maria@salaoelegancia.com.br', '+5511999001001', '{"cortes femininos", "coloração", "escova"}', '{"monday": ["08:00-18:00"], "tuesday": ["08:00-18:00"], "wednesday": ["08:00-18:00"], "thursday": ["08:00-18:00"], "friday": ["08:00-18:00"], "saturday": ["08:00-14:00"]}'),
        ('beauty', 'Ana Costa Esteticista', 'Especialista em manicure artística, pedicure e design de sobrancelhas', 'ana@salaoelegancia.com.br', '+5511999001002', '{"manicure", "pedicure", "sobrancelhas"}', '{"tuesday": ["09:00-17:00"], "wednesday": ["09:00-17:00"], "thursday": ["09:00-17:00"], "friday": ["09:00-17:00"], "saturday": ["09:00-15:00"]}'),
        
        -- Healthcare Professionals
        ('healthcare', 'Dr. João Santos', 'Médico Clínico Geral - CRM 123456-SP, 15 anos de experiência', 'dr.joao@clinicavida.com.br', '+5511999002001', '{"clínica geral", "medicina preventiva"}', '{"monday": ["08:00-17:00"], "tuesday": ["08:00-17:00"], "wednesday": ["08:00-17:00"], "thursday": ["08:00-17:00"], "friday": ["08:00-17:00"]}'),
        ('healthcare', 'Dra. Carla Fisioterapeuta', 'Fisioterapeuta especialista em reabilitação - CREFITO 98765-SP', 'dra.carla@clinicavida.com.br', '+5511999002002', '{"fisioterapia ortopédica", "reabilitação"}', '{"monday": ["07:00-16:00"], "tuesday": ["07:00-16:00"], "thursday": ["07:00-16:00"], "friday": ["07:00-16:00"]}'),
        
        -- Legal Professionals  
        ('legal', 'Dr. Roberto Silva', 'Advogado especialista em Direito Trabalhista - OAB 123456-SP', 'roberto@silvasantos.adv.br', '+5511999003001', '{"direito trabalhista", "processos"}', '{"monday": ["09:00-18:00"], "tuesday": ["09:00-18:00"], "wednesday": ["09:00-18:00"], "thursday": ["09:00-18:00"], "friday": ["09:00-17:00"]}'),
        ('legal', 'Dra. Santos Advocacia', 'Advogada especialista em Direito Civil e Empresarial - OAB 789012-SP', 'santos@silvasantos.adv.br', '+5511999003002', '{"direito civil", "empresarial"}', '{"monday": ["09:00-18:00"], "tuesday": ["09:00-18:00"], "wednesday": ["09:00-18:00"], "thursday": ["09:00-18:00"], "friday": ["09:00-17:00"]}'),
        
        -- Education Professionals
        ('education', 'Prof. Lúcia Matemática', 'Professora de Matemática - Licenciatura USP, especialista em reforço escolar', 'lucia@edutech.com.br', '+5511999004001', '{"matemática", "física", "ensino médio"}', '{"monday": ["15:00-20:00"], "tuesday": ["15:00-20:00"], "wednesday": ["15:00-20:00"], "thursday": ["15:00-20:00"], "saturday": ["09:00-12:00"]}'),
        ('education', 'Prof. Carlos Química', 'Professor de Química e Física - Mestrado em Educação', 'carlos@edutech.com.br', '+5511999004002', '{"química", "física", "vestibular"}', '{"tuesday": ["15:00-20:00"], "wednesday": ["15:00-20:00"], "thursday": ["15:00-20:00"], "friday": ["15:00-20:00"], "saturday": ["09:00-12:00"]}'),
        
        -- Sports Professionals
        ('sports', 'Carlos Personal Trainer', 'Personal Trainer certificado - CREF 98765-SP, especialista em hipertrofia', 'carlos@fitpro.com.br', '+5511999005001', '{"personal training", "musculação", "hipertrofia"}', '{"monday": ["06:00-20:00"], "tuesday": ["06:00-20:00"], "wednesday": ["06:00-20:00"], "thursday": ["06:00-20:00"], "friday": ["06:00-19:00"], "saturday": ["07:00-12:00"]}'),
        ('sports', 'Marina Pilates', 'Instrutora de Pilates e Funcional certificada', 'marina@fitpro.com.br', '+5511999005002', '{"pilates", "funcional", "reabilitação"}', '{"monday": ["07:00-19:00"], "tuesday": ["07:00-19:00"], "wednesday": ["07:00-19:00"], "thursday": ["07:00-19:00"], "friday": ["07:00-18:00"]}'),
        
        -- Consulting Professionals
        ('consulting', 'Patricia Consultora', 'Consultora Empresarial - MBA FGV, 20 anos experiência em estratégia', 'patricia@bizconsult.com.br', '+5511999006001', '{"estratégia empresarial", "diagnóstico", "gestão"}', '{"monday": ["09:00-18:00"], "tuesday": ["09:00-18:00"], "wednesday": ["09:00-18:00"], "thursday": ["09:00-18:00"], "friday": ["09:00-17:00"]}'),
        ('consulting', 'Fernando Operações', 'Consultor em Processos e Operações - Eng. Produção', 'fernando@bizconsult.com.br', '+5511999006002', '{"processos", "operações", "lean"}', '{"monday": ["09:00-18:00"], "tuesday": ["09:00-18:00"], "wednesday": ["09:00-18:00"], "thursday": ["09:00-18:00"], "friday": ["09:00-17:00"]}')
)
INSERT INTO professionals (
    tenant_id, name, bio, email, phone, specialties, 
    working_hours, google_calendar_id, is_active, test_execution_id
)
SELECT 
    t.id as tenant_id,
    p.name,
    p.bio,
    p.email,
    p.phone,
    p.specialties,
    p.working_hours::jsonb,
    'primary',
    true,
    :test_exec_id
FROM tenants t
JOIN professionals_by_domain p ON p.domain = t.domain::text
WHERE t.test_execution_id = :test_exec_id;

-- ========================================
-- SERVICES REALISTAS POR DOMÍNIO 
-- ========================================

INSERT INTO services (
    tenant_id, category_id, name, description, duration_type, duration_minutes,
    price_model, base_price, currency, advance_booking_days, is_active, test_execution_id
)
SELECT 
    t.id as tenant_id,
    sc.id as category_id,
    svc_data.name,
    svc_data.description,
    svc_data.duration_type::duration_type,
    svc_data.duration_minutes,
    svc_data.price_model::price_model,
    svc_data.base_price,
    'BRL',
    svc_data.advance_booking_days,
    true,
    :test_exec_id
FROM tenants t 
JOIN service_categories sc ON t.id = sc.tenant_id AND sc.test_execution_id = :test_exec_id,
LATERAL (
    VALUES
        -- Beauty Services
        ('Corte Feminino Premium', 'Corte + lavagem + finalização com escova modeladora', 'fixed', 90, 'fixed', 85.00, 14),
        ('Coloração Completa', 'Coloração global + matização + tratamento hidratante', 'variable', 180, 'fixed', 250.00, 21),
        ('Manicure Completa', 'Manicure com esmaltação + hidratação das mãos', 'fixed', 60, 'fixed', 45.00, 7),
        ('Design de Sobrancelhas', 'Depilação + design + aplicação de henna', 'fixed', 45, 'fixed', 35.00, 7),
        ('Escova Modeladora', 'Lavagem + escova profissional com produtos premium', 'fixed', 60, 'fixed', 50.00, 3),
        
        -- Healthcare Services
        ('Consulta Clínico Geral', 'Consulta médica completa com anamnese e exame físico', 'fixed', 60, 'fixed', 200.00, 30),
        ('Retorno Médico', 'Consulta de retorno/acompanhamento clínico', 'fixed', 30, 'fixed', 120.00, 14),
        ('Sessão Fisioterapia', 'Sessão de fisioterapia personalizada com exercícios', 'fixed', 50, 'fixed', 150.00, 14),
        ('Consulta Dermatológica', 'Avaliação dermatológica especializada', 'fixed', 45, 'fixed', 250.00, 21),
        
        -- Legal Services
        ('Consulta Inicial Jurídica', 'Primeira consulta jurídica com análise do caso', 'fixed', 90, 'consultation', 350.00, 14),
        ('Consulta de Retorno', 'Acompanhamento processual e orientações', 'fixed', 60, 'fixed', 200.00, 7),
        ('Reunião Online', 'Videoconferência para consulta jurídica', 'fixed', 60, 'hourly', 180.00, 7),
        ('Análise Documental', 'Revisão e análise de contratos/documentos', 'variable', 120, 'hourly', 300.00, 14),
        
        -- Education Services
        ('Aula Particular Matemática', 'Reforço escolar personalizado em matemática', 'fixed', 60, 'fixed', 80.00, 7),
        ('Mentoria Educacional', 'Orientação acadêmica e planejamento de estudos', 'fixed', 90, 'fixed', 120.00, 14),
        ('Preparatório Vestibular', 'Aula preparatória para vestibulares/ENEM', 'fixed', 120, 'fixed', 150.00, 14),
        ('Aula Online', 'Aula particular via videoconferência', 'fixed', 60, 'fixed', 70.00, 3),
        
        -- Sports Services
        ('Personal Training', 'Treino personalizado com personal trainer', 'fixed', 60, 'fixed', 120.00, 7),
        ('Avaliação Física', 'Avaliação física completa + planejamento', 'fixed', 90, 'fixed', 180.00, 14),
        ('Reserva Quadra Tênis', 'Reserva de quadra de tênis por 1 hora', 'fixed', 60, 'fixed', 80.00, 14),
        ('Aula Pilates', 'Aula de Pilates em equipamentos', 'fixed', 50, 'fixed', 90.00, 7),
        
        -- Consulting Services  
        ('Diagnóstico Empresarial', 'Análise completa da empresa + relatório', 'variable', 240, 'project', 2500.00, 21),
        ('Workshop Empresarial', 'Treinamento para equipes (até 20 pessoas)', 'fixed', 480, 'fixed', 3500.00, 30),
        ('Sprint Review', 'Acompanhamento de projetos estratégicos', 'fixed', 120, 'hourly', 450.00, 14),
        ('Consultoria Online', 'Consultoria via videoconferência', 'fixed', 90, 'hourly', 350.00, 7)
) AS svc_data(name, description, duration_type, duration_minutes, price_model, base_price, advance_booking_days)
WHERE t.test_execution_id = :test_exec_id;

-- ========================================
-- USUÁRIOS SINTÉTICOS REALISTAS
-- ========================================

INSERT INTO users (
    phone, name, email, birth_date, gender, address, preferences, test_execution_id
) VALUES
-- Perfis diversificados de clientes brasileiros
('+5511900001001', 'Ana Paula Silva', 'ana.paula.silva@gmail.com', '1985-03-15', 'feminino', '{"city": "São Paulo", "neighborhood": "Vila Madalena"}', '{"preferred_time": "morning", "communication": "whatsapp"}', :test_exec_id),
('+5511900001002', 'Beatriz Santos Costa', 'bia.santos@hotmail.com', '1992-07-22', 'feminino', '{"city": "São Paulo", "neighborhood": "Jardins"}', '{"preferred_time": "afternoon", "services": ["beauty"], "budget": "premium"}', :test_exec_id),
('+5511900001003', 'Carla Oliveira Lima', 'carla.oliveira@outlook.com', '1978-11-08', 'feminino', '{"city": "São Paulo", "neighborhood": "Moema"}', '{"preferred_time": "evening", "loyalty_member": true}', :test_exec_id),

('+5511900002004', 'Diego Costa Ferreira', 'diego.ferreira@gmail.com', '1980-05-12', 'masculino', '{"city": "São Paulo", "neighborhood": "Pinheiros"}', '{"health_conditions": ["hipertensão"], "insurance": "Unimed"}', :test_exec_id),
('+5511900002005', 'Elena Rodrigues', 'elena.rodrigues@yahoo.com.br', '1975-09-30', 'feminino', '{"city": "São Paulo", "neighborhood": "Vila Olímpia"}', '{"preferred_time": "morning", "emergency_contact": "+5511999999999"}', :test_exec_id),
('+5511900002006', 'Fábio Lima Santos', 'fabio.lima@terra.com.br', '1988-12-03', 'masculino', '{"city": "São Paulo", "neighborhood": "Itaim Bibi"}', '{"insurance": "Bradesco", "preferred_professional": "Dr. João"}', :test_exec_id),

('+5511900003007', 'Gabriela Ferreira', 'gabi.ferreira@gmail.com', '1983-04-18', 'feminino', '{"city": "São Paulo", "neighborhood": "Centro"}', '{"legal_area": "trabalhista", "urgency": "medium"}', :test_exec_id),
('+5511900003008', 'Henrique Alves', 'henrique.alves@uol.com.br', '1979-08-25', 'masculino', '{"city": "São Paulo", "neighborhood": "Liberdade"}', '{"company": "Tech Startup", "legal_area": "empresarial"}', :test_exec_id),

('+5511900004009', 'Isabel Mãe da Silva', 'isabel.mae@gmail.com', '1975-06-10', 'feminino', '{"city": "São Paulo", "neighborhood": "Vila Mariana"}', '{"student": "filho 15 anos", "subjects": ["matemática", "física"]}', :test_exec_id),
('+5511900004010', 'João Pai dos Santos', 'joao.pai@hotmail.com', '1972-02-28', 'masculino', '{"city": "São Paulo", "neighborhood": "Santana"}', '{"student": "filha 17 anos", "goal": "vestibular medicina"}', :test_exec_id),

('+5511900005011', 'Karla Fitness', 'karla.fitness@gmail.com', '1990-10-14', 'feminino', '{"city": "São Paulo", "neighborhood": "Brooklin"}', '{"fitness_goal": "hipertrofia", "level": "intermediário"}', :test_exec_id),
('+5511900005012', 'Lucas Atleta', 'lucas.atleta@gmail.com', '1995-01-20', 'masculino', '{"city": "São Paulo", "neighborhood": "Vila Olímpia"}', '{"sport": "tênis", "level": "avançado"}', :test_exec_id),

('+5511900006013', 'Mariana Empresária', 'mariana.ceo@empresa.com.br', '1982-11-05', 'feminino', '{"city": "São Paulo", "neighborhood": "Faria Lima"}', '{"company_size": "50 funcionários", "industry": "tecnologia"}', :test_exec_id),
('+5511900006014', 'Nelson CEO', 'nelson.ceo@startup.com.br', '1978-07-17', 'masculino', '{"city": "São Paulo", "neighborhood": "Berrini"}', '{"company_stage": "scale-up", "focus": "operações"}', :test_exec_id);

-- ========================================
-- RELACIONAMENTOS USER-TENANT  
-- ========================================

-- Relacionamentos usuário-tenant mais realistas (2-3 usuários por tenant)
INSERT INTO user_tenants (user_id, tenant_id, role, total_bookings, test_execution_id)
SELECT 
    u.id as user_id,
    t.id as tenant_id,
    'customer' as role,
    0 as total_bookings,
    :test_exec_id
FROM users u 
JOIN tenants t ON (
    -- Distribui usuários por tenant de forma mais realística
    (u.phone LIKE '%1' AND t.domain = 'beauty') OR
    (u.phone LIKE '%2' AND t.domain = 'beauty') OR  
    (u.phone LIKE '%3' AND t.domain = 'beauty') OR
    (u.phone LIKE '%4' AND t.domain = 'healthcare') OR
    (u.phone LIKE '%5' AND t.domain = 'healthcare') OR
    (u.phone LIKE '%6' AND t.domain = 'healthcare') OR
    (u.phone LIKE '%7' AND t.domain = 'legal') OR
    (u.phone LIKE '%8' AND t.domain = 'legal') OR
    (u.phone LIKE '%9' AND t.domain = 'education') OR
    (u.phone LIKE '%0' AND t.domain = 'education') OR
    (u.phone LIKE '%1' AND t.domain = 'sports') OR
    (u.phone LIKE '%2' AND t.domain = 'sports') OR
    (u.phone LIKE '%3' AND t.domain = 'consulting') OR
    (u.phone LIKE '%4' AND t.domain = 'consulting')
)
WHERE u.test_execution_id = :test_exec_id 
AND t.test_execution_id = :test_exec_id;

-- ========================================
-- RESUMO DOS DADOS INSERIDOS
-- ========================================

SELECT 
    'PRODUÇÃO SIMULADA - DADOS INSERIDOS' as status,
    (SELECT COUNT(*) FROM tenants WHERE test_execution_id = :test_exec_id) as tenants_criados,
    (SELECT COUNT(*) FROM service_categories WHERE test_execution_id = :test_exec_id) as categorias_criadas, 
    (SELECT COUNT(*) FROM professionals WHERE test_execution_id = :test_exec_id) as profissionais_criados,
    (SELECT COUNT(*) FROM services WHERE test_execution_id = :test_exec_id) as servicos_criados,
    (SELECT COUNT(*) FROM users WHERE test_execution_id = :test_exec_id) as usuarios_criados,
    (SELECT COUNT(*) FROM user_tenants WHERE test_execution_id = :test_exec_id) as relacionamentos_criados,
    :test_exec_id as test_execution_id;

COMMIT;