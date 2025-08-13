-- Fase 2: Tornar a Lógica de Negócio Centrada no Profissional

-- Passo 1: Adicionar a coluna de horário de funcionamento na tabela de profissionais.
ALTER TABLE public.professionals
ADD COLUMN working_hours JSONB;

COMMENT ON COLUMN public.professionals.working_hours IS 'Horário de funcionamento específico para este profissional. Ex: {"monday": {"start": "09:00", "end": "18:00"}, ...}';


-- Passo 2: Adicionar uma coluna de preço na tabela de junção professional_services.
-- Isso permite que um serviço tenha um preço diferente dependendo do profissional.
ALTER TABLE public.professional_services
ADD COLUMN price NUMERIC(10, 2);

-- Atualiza o comentário da tabela para refletir a nova coluna.
COMMENT ON TABLE public.professional_services IS 'Tabela de junção para associar profissionais a serviços, agora com preço específico por essa associação.';


-- Passo 3 (Opcional, mas recomendado): Migração de dados one-time.
-- Para cada profissional existente, copia o horário de funcionamento do seu tenant para a nova coluna.
-- Isso garante que os profissionais existentes tenham um horário de trabalho padrão.
DO $$
DECLARE
    prof RECORD;
    tenant_hours JSONB;
BEGIN
    FOR prof IN SELECT id, tenant_id FROM public.professionals WHERE working_hours IS NULL LOOP
        -- Busca o horário de funcionamento do tenant correspondente
        SELECT settings -> 'working_hours' INTO tenant_hours
        FROM public.tenants
        WHERE id = prof.tenant_id;
        
        -- Se o tenant tiver um horário definido, atualiza o profissional
        IF tenant_hours IS NOT NULL THEN
            UPDATE public.professionals
            SET working_hours = tenant_hours
            WHERE id = prof.id;
        END IF;
    END LOOP;
END $$;


-- Passo 4 (Opcional, mas recomendado): Atualizar o preço na tabela de junção
-- com o preço base do serviço como ponto de partida.
UPDATE public.professional_services ps
SET price = s.base_price
FROM public.services s
WHERE ps.service_id = s.id AND ps.price IS NULL;


-- Mensagem de log para o final da migração
SELECT 'Migração para lógica centrada no profissional concluída com sucesso.'; 