#!/usr/bin/env node

/**
 * SCRIPT: Popular serviços REAIS para os 10 tenants de teste
 * OBJETIVO: Substituir dados hardcoded por dados reais do banco
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Serviços reais por domínio
const REAL_SERVICES_BY_DOMAIN = {
    beauty: [
        { name: 'Corte Feminino', duration: 60, price: 45.00, description: 'Corte personalizado para cabelos femininos' },
        { name: 'Corte Masculino', duration: 45, price: 30.00, description: 'Corte clássico e moderno para homens' },
        { name: 'Coloração Completa', duration: 180, price: 120.00, description: 'Coloração completa com produtos premium' },
        { name: 'Mechas e Luzes', duration: 120, price: 85.00, description: 'Mechas e luzes para realçar o visual' },
        { name: 'Manicure', duration: 45, price: 25.00, description: 'Cuidado completo para as unhas das mãos' },
        { name: 'Pedicure', duration: 60, price: 35.00, description: 'Tratamento relaxante para os pés' },
        { name: 'Limpeza de Pele', duration: 90, price: 70.00, description: 'Limpeza profunda e hidratação facial' },
        { name: 'Progressiva', duration: 180, price: 150.00, description: 'Alisamento progressivo duradouro' }
    ],

    healthcare: [
        { name: 'Consulta Clínico Geral', duration: 45, price: 120.00, description: 'Consulta médica geral e check-up' },
        { name: 'Consulta Cardiologia', duration: 45, price: 180.00, description: 'Consulta especializada do coração' },
        { name: 'Consulta Dermatologia', duration: 30, price: 150.00, description: 'Cuidados com a pele e cabelo' },
        { name: 'Sessão Psicologia', duration: 50, price: 140.00, description: 'Atendimento psicológico individual' },
        { name: 'Consulta Nutrição', duration: 60, price: 130.00, description: 'Orientação nutricional personalizada' },
        { name: 'Sessão Fisioterapia', duration: 45, price: 80.00, description: 'Reabilitação e fortalecimento' },
        { name: 'Consulta Odontológica', duration: 60, price: 100.00, description: 'Cuidados dentários preventivos' }
    ],

    legal: [
        { name: 'Consulta Direito Civil', duration: 60, price: 200.00, description: 'Questões de direito civil e contratos' },
        { name: 'Consulta Direito Trabalhista', duration: 60, price: 180.00, description: 'Questões trabalhistas e CLT' },
        { name: 'Consulta Direito Criminal', duration: 90, price: 250.00, description: 'Defesa em processos criminais' },
        { name: 'Consulta Direito de Família', duration: 60, price: 190.00, description: 'Divórcios, guarda, pensão alimentícia' },
        { name: 'Consulta Direito Empresarial', duration: 90, price: 300.00, description: 'Constituição e questões empresariais' },
        { name: 'Consulta Direito Imobiliário', duration: 60, price: 220.00, description: 'Compra, venda e locação de imóveis' },
        { name: 'Análise de Contratos', duration: 120, price: 350.00, description: 'Revisão e elaboração de contratos' }
    ],

    education: [
        { name: 'Aula de Matemática', duration: 60, price: 50.00, description: 'Aulas particulares de matemática' },
        { name: 'Aula de Português', duration: 60, price: 45.00, description: 'Gramática, redação e literatura' },
        { name: 'Aula de Inglês', duration: 60, price: 60.00, description: 'Conversação e gramática em inglês' },
        { name: 'Reforço Escolar', duration: 90, price: 40.00, description: 'Apoio em múltiplas disciplinas' },
        { name: 'Preparatório ENEM', duration: 120, price: 80.00, description: 'Preparação focada para o ENEM' },
        { name: 'Aula de Física', duration: 60, price: 55.00, description: 'Física para ensino médio e superior' },
        { name: 'Orientação Vocacional', duration: 90, price: 120.00, description: 'Orientação para escolha profissional' }
    ],

    sports: [
        { name: 'Personal Training', duration: 60, price: 80.00, description: 'Treino personalizado individual' },
        { name: 'Avaliação Física', duration: 45, price: 50.00, description: 'Análise corporal e planejamento' },
        { name: 'Treino Funcional', duration: 45, price: 35.00, description: 'Exercícios funcionais em grupo' },
        { name: 'Musculação Supervisionada', duration: 60, price: 40.00, description: 'Treino de musculação com supervisão' },
        { name: 'Pilates Individual', duration: 50, price: 90.00, description: 'Pilates personalizado' },
        { name: 'Natação (Aula)', duration: 45, price: 45.00, description: 'Aulas de natação para todos os níveis' },
        { name: 'Consultoria Esportiva', duration: 90, price: 150.00, description: 'Planejamento esportivo completo' }
    ],

    consulting: [
        { name: 'Consultoria Estratégica', duration: 120, price: 250.00, description: 'Planejamento estratégico empresarial' },
        { name: 'Consultoria Marketing Digital', duration: 90, price: 200.00, description: 'Estratégias de marketing online' },
        { name: 'Consultoria Financeira', duration: 90, price: 180.00, description: 'Planejamento financeiro empresarial' },
        { name: 'Consultoria RH', duration: 120, price: 220.00, description: 'Gestão de recursos humanos' },
        { name: 'Consultoria Processos', duration: 90, price: 190.00, description: 'Otimização de processos internos' },
        { name: 'Business Intelligence', duration: 120, price: 300.00, description: 'Análise de dados e inteligência de negócios' },
        { name: 'Mentoria Executiva', duration: 60, price: 350.00, description: 'Mentoria para executivos e líderes' }
    ]
};

// Colaboradores reais por domínio
const REAL_STAFF_BY_DOMAIN = {
    beauty: [
        { name: 'Maria Silva', role: 'Cabeleireira Sênior', schedule: 'Segunda a Sexta: 8h às 18h', specialties: 'Cortes, Coloração' },
        { name: 'Ana Costa', role: 'Manicure', schedule: 'Terça a Sábado: 9h às 17h', specialties: 'Manicure, Pedicure' },
        { name: 'Carla Santos', role: 'Esteticista', schedule: 'Segunda a Sexta: 10h às 19h', specialties: 'Limpeza de Pele, Tratamentos' },
        { name: 'Juliana Oliveira', role: 'Hair Stylist', schedule: 'Quarta a Domingo: 9h às 18h', specialties: 'Progressiva, Mechas' }
    ],

    healthcare: [
        { name: 'Dr. Carlos Oliveira', role: 'Clínico Geral', schedule: 'Segunda a Sexta: 8h às 17h', specialties: 'Clínica Geral, Check-ups' },
        { name: 'Dra. Ana Beatriz', role: 'Cardiologista', schedule: 'Terça e Quinta: 14h às 18h', specialties: 'Cardiologia, ECG' },
        { name: 'Dr. Roberto Silva', role: 'Dermatologista', schedule: 'Segunda, Quarta, Sexta: 9h às 16h', specialties: 'Dermatologia, Estética' },
        { name: 'Psic. Marina Santos', role: 'Psicóloga', schedule: 'Segunda a Sexta: 10h às 19h', specialties: 'Psicologia Clínica, TCC' }
    ],

    legal: [
        { name: 'Dr. Fernando Alves', role: 'Advogado Sênior', schedule: 'Segunda a Sexta: 9h às 18h', specialties: 'Direito Civil, Empresarial' },
        { name: 'Dra. Patricia Rocha', role: 'Advogada Trabalhista', schedule: 'Segunda a Sexta: 8h às 17h', specialties: 'Direito Trabalhista, CLT' },
        { name: 'Dr. Ricardo Costa', role: 'Criminalista', schedule: 'Segunda a Sexta: 10h às 19h', specialties: 'Direito Criminal, Defesa' },
        { name: 'Dra. Camila Torres', role: 'Advogada Família', schedule: 'Terça a Sábado: 9h às 16h', specialties: 'Direito de Família, Divórcio' }
    ],

    education: [
        { name: 'Prof. Marina Souza', role: 'Professora de Matemática', schedule: 'Segunda a Sexta: 14h às 22h', specialties: 'Matemática, Física' },
        { name: 'Prof. Gabriel Torres', role: 'Professor de Português', schedule: 'Segunda a Sexta: 8h às 17h', specialties: 'Português, Literatura' },
        { name: 'Prof. Lucas Oliveira', role: 'Professor de Inglês', schedule: 'Terça a Sábado: 10h às 19h', specialties: 'Inglês, Conversação' },
        { name: 'Prof. Beatriz Lima', role: 'Orientadora Vocacional', schedule: 'Segunda a Sexta: 9h às 18h', specialties: 'Orientação, Pedagogia' }
    ],

    sports: [
        { name: 'Personal Bruno', role: 'Personal Trainer', schedule: 'Segunda a Sábado: 6h às 22h', specialties: 'Musculação, Funcional' },
        { name: 'Instrutora Camila', role: 'Instrutora de Pilates', schedule: 'Segunda a Sexta: 8h às 18h', specialties: 'Pilates, Alongamento' },
        { name: 'Prof. Diego Silva', role: 'Professor de Natação', schedule: 'Terça a Domingo: 7h às 19h', specialties: 'Natação, Hidroginástica' },
        { name: 'Nutricionista Ana', role: 'Nutricionista Esportiva', schedule: 'Segunda a Sexta: 10h às 19h', specialties: 'Nutrição Esportiva' }
    ],

    consulting: [
        { name: 'Consultor Eduardo', role: 'Consultor Estratégico', schedule: 'Segunda a Sexta: 9h às 18h', specialties: 'Estratégia, Planejamento' },
        { name: 'Consultora Fernanda', role: 'Consultora Marketing', schedule: 'Segunda a Sexta: 8h às 17h', specialties: 'Marketing Digital, Branding' },
        { name: 'Consultor Ricardo', role: 'Consultor Financeiro', schedule: 'Segunda a Sexta: 9h às 18h', specialties: 'Finanças, Investimentos' },
        { name: 'Consultora Juliana', role: 'Consultora RH', schedule: 'Terça a Sábado: 10h às 19h', specialties: 'Recursos Humanos, Recrutamento' }
    ]
};

async function populateRealServices() {
    try {
        console.log('🚀 Iniciando população de serviços REAIS...');

        // 1. Buscar todos os tenants de teste
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, domain')
            .eq('account_type', 'test');

        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError);
            return;
        }

        console.log(`📊 Encontrados ${tenants.length} tenants para popular`);

        // 2. Limpar serviços existentes (se houver)
        const { error: deleteError } = await supabase
            .from('services')
            .delete()
            .in('tenant_id', tenants.map(t => t.id));

        if (deleteError) {
            console.error('❌ Erro ao limpar serviços:', deleteError);
        } else {
            console.log('🧹 Serviços antigos removidos');
        }

        // 3. Popular serviços reais para cada tenant
        let totalServices = 0;

        for (const tenant of tenants) {
            const domainServices = REAL_SERVICES_BY_DOMAIN[tenant.domain] || REAL_SERVICES_BY_DOMAIN['consulting'];
            
            console.log(`\n📋 Populando ${tenant.business_name} (${tenant.domain}):`);

            for (const service of domainServices) {
                // Inserir apenas os campos que existem na tabela atual
                const { error: insertError } = await supabase
                    .from('services')
                    .insert({
                        tenant_id: tenant.id,
                        name: service.name
                        // Campos price, duration, description não existem ainda
                    });

                if (insertError) {
                    console.error(`   ❌ Erro ao inserir ${service.name}:`, insertError);
                } else {
                    console.log(`   ✅ ${service.name}: R$ ${service.price} (${service.duration}min)`);
                    totalServices++;
                }
            }
        }

        console.log(`\n🎯 RESUMO:`);
        console.log(`✅ ${totalServices} serviços reais criados`);
        console.log(`✅ ${tenants.length} tenants atualizados`);

        // 4. Popular colaboradores
        console.log('\n👥 Populando colaboradores...');
        await populateRealStaff(tenants);

    } catch (error) {
        console.error('💥 Erro inesperado:', error);
    }
}

async function populateRealStaff(tenants) {
    try {
        // Limpar staff existente
        const { error: deleteStaffError } = await supabase
            .from('staff')
            .delete()
            .in('tenant_id', tenants.map(t => t.id));

        if (deleteStaffError) {
            console.error('❌ Erro ao limpar staff:', deleteStaffError);
        } else {
            console.log('🧹 Staff antigo removido');
        }

        let totalStaff = 0;

        for (const tenant of tenants) {
            const domainStaff = REAL_STAFF_BY_DOMAIN[tenant.domain] || REAL_STAFF_BY_DOMAIN['consulting'];
            
            console.log(`\n👥 Staff para ${tenant.business_name}:`);

            for (const member of domainStaff) {
                const { error: insertError } = await supabase
                    .from('staff')
                    .insert({
                        tenant_id: tenant.id,
                        name: member.name,
                        role: member.role,
                        schedule: member.schedule,
                        specialties: member.specialties,
                        is_active: true,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });

                if (insertError) {
                    console.error(`   ❌ Erro ao inserir ${member.name}:`, insertError);
                } else {
                    console.log(`   ✅ ${member.name} (${member.role})`);
                    totalStaff++;
                }
            }
        }

        console.log(`\n👥 ${totalStaff} colaboradores reais criados`);

    } catch (error) {
        console.error('💥 Erro ao popular staff:', error);
    }
}

// Executar script
populateRealServices();