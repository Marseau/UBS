/**
 * CORREÇÃO ESTRUTURAL DOS DADOS
 * 1. Popular preços dos services
 * 2. Popular professional_services
 * 3. Migrar appointments para usar professional_id
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

class CorrecaoEstruturalDados {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );
    }

    async etapa1_CorrigirPrecosServices() {
        console.log('📝 ETAPA 1: Corrigindo preços dos services...');
        console.log('-'.repeat(50));

        // Buscar todos os services sem preço
        const { data: servicesSemPreco } = await this.supabase
            .from('services')
            .select('id, name, tenant_id')
            .is('base_price', null);

        console.log(`Encontrados ${servicesSemPreco?.length || 0} services sem preço`);

        const precosServicos = {
            // Beleza
            'corte': 45.00,
            'coloração': 120.00,
            'escova': 35.00,
            'manicure': 30.00,
            'pedicure': 35.00,
            'limpeza': 80.00,
            'hidratação': 60.00,
            'maquiagem': 50.00,
            'sobrancelha': 25.00,
            'massagem': 90.00,
            'tratamento': 100.00,
            'teste': 50.00,

            // Saúde/Terapia
            'consulta': 150.00,
            'terapia': 120.00,
            'avaliação': 100.00,
            'sessão': 130.00,

            // Jurídico
            'consultoria': 200.00,
            'parecer': 300.00,
            'contrato': 250.00,
            'processo': 500.00,

            // Educação
            'aula': 80.00,
            'curso': 150.00,
            'particular': 100.00,
            'reforço': 70.00,

            // Fitness
            'personal': 90.00,
            'avaliação física': 60.00,
            'treino': 75.00,
            'funcional': 65.00
        };

        let atualizados = 0;
        for (const service of servicesSemPreco || []) {
            let preco = 50.00; // Preço padrão

            // Buscar preço baseado no nome do serviço
            const nomeService = service.name.toLowerCase();
            for (const [palavra, valor] of Object.entries(precosServicos)) {
                if (nomeService.includes(palavra)) {
                    preco = valor;
                    break;
                }
            }

            // Variação por tenant (diferentes mercados)
            const variacao = Math.random() * 0.4 - 0.2; // -20% a +20%
            preco = Math.round(preco * (1 + variacao) * 100) / 100;

            // Atualizar o service
            const { error } = await this.supabase
                .from('services')
                .update({ base_price: preco })
                .eq('id', service.id);

            if (error) {
                console.error(`❌ Erro atualizando ${service.name}:`, error.message);
            } else {
                console.log(`✅ ${service.name}: R$ ${preco}`);
                atualizados++;
            }
        }

        console.log(`\n📊 Etapa 1 concluída: ${atualizados} services atualizados`);
        return atualizados;
    }

    async etapa2_PopularProfessionalServices() {
        console.log('\n📝 ETAPA 2: Populando professional_services...');
        console.log('-'.repeat(50));

        // Buscar todos os professionals
        const { data: professionals } = await this.supabase
            .from('professionals')
            .select('id, name, tenant_id');

        // Buscar todos os services com preço
        const { data: services } = await this.supabase
            .from('services')
            .select('id, name, base_price, tenant_id')
            .not('base_price', 'is', null);

        console.log(`${professionals?.length || 0} professionals encontrados`);
        console.log(`${services?.length || 0} services com preço encontrados`);

        let relacionamentos = 0;

        for (const professional of professionals || []) {
            // Services do mesmo tenant
            const servicesTenant = services?.filter(s => s.tenant_id === professional.tenant_id) || [];
            
            console.log(`\n👤 ${professional.name}: ${servicesTenant.length} services do tenant`);

            for (const service of servicesTenant) {
                // Cada professional oferece entre 60-90% dos services do tenant
                if (Math.random() > 0.25) { // 75% de chance
                    // Preço customizado do professional (±15% do preço base)
                    const variacao = Math.random() * 0.3 - 0.15;
                    const customPrice = Math.round(service.base_price * (1 + variacao) * 100) / 100;

                    const { error } = await this.supabase
                        .from('professional_services')
                        .insert({
                            professional_id: professional.id,
                            service_id: service.id,
                            custom_price: customPrice,
                            is_available: true,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        });

                    if (error) {
                        console.error(`❌ Erro relacionando ${professional.name} com ${service.name}:`, error.message);
                    } else {
                        console.log(`   ✅ ${service.name}: R$ ${customPrice}`);
                        relacionamentos++;
                    }
                }
            }
        }

        console.log(`\n📊 Etapa 2 concluída: ${relacionamentos} relacionamentos criados`);
        return relacionamentos;
    }

    async etapa3_MigrarAppointmentsProfessional() {
        console.log('\n📝 ETAPA 3: Migrando appointments para usar professional_id...');
        console.log('-'.repeat(50));

        // Primeiro, adicionar coluna professional_id se não existir
        console.log('Verificando se coluna professional_id existe...');
        
        const { data: sampleAppointment } = await this.supabase
            .from('appointments')
            .select('*')
            .limit(1);

        const hasColumn = sampleAppointment?.[0] && 'professional_id' in sampleAppointment[0];
        
        if (!hasColumn) {
            console.log('❌ Coluna professional_id não existe. Executar SQL manual:');
            console.log('ALTER TABLE appointments ADD COLUMN professional_id UUID REFERENCES professionals(id);');
            return 0;
        }

        // Buscar appointments com professional_name mas sem professional_id
        const { data: appointments } = await this.supabase
            .from('appointments')
            .select('id, tenant_id, appointment_data, professional_id')
            .is('professional_id', null)
            .not('appointment_data', 'is', null);

        console.log(`${appointments?.length || 0} appointments para migrar`);

        // Buscar todos os professionals para mapeamento
        const { data: professionals } = await this.supabase
            .from('professionals')
            .select('id, name, tenant_id');

        const professionalMap = {};
        professionals?.forEach(prof => {
            const key = `${prof.tenant_id}_${prof.name.toLowerCase()}`;
            professionalMap[key] = prof.id;
        });

        let migrados = 0;
        for (const appointment of appointments || []) {
            const professionalName = appointment.appointment_data?.professional_name;
            
            if (professionalName) {
                const key = `${appointment.tenant_id}_${professionalName.toLowerCase()}`;
                const professionalId = professionalMap[key];

                if (professionalId) {
                    const { error } = await this.supabase
                        .from('appointments')
                        .update({ professional_id: professionalId })
                        .eq('id', appointment.id);

                    if (error) {
                        console.error(`❌ Erro migrando appointment ${appointment.id}:`, error.message);
                    } else {
                        console.log(`✅ Migrado: ${professionalName} → ${professionalId.substring(0, 8)}`);
                        migrados++;
                    }
                } else {
                    console.log(`⚠️ Professional não encontrado: ${professionalName} (tenant: ${appointment.tenant_id.substring(0, 8)})`);
                }
            }
        }

        console.log(`\n📊 Etapa 3 concluída: ${migrados} appointments migrados`);
        return migrados;
    }

    async etapa4_ValidarResultados() {
        console.log('\n📝 ETAPA 4: Validando resultados...');
        console.log('-'.repeat(50));

        // 1. Services com preço
        const { count: servicesComPreco } = await this.supabase
            .from('services')
            .select('*', { count: 'exact', head: true })
            .not('base_price', 'is', null);

        // 2. Professional_services
        const { count: professionalServices } = await this.supabase
            .from('professional_services')
            .select('*', { count: 'exact', head: true });

        // 3. Appointments com professional_id
        const { count: appointmentsComProfessional } = await this.supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .not('professional_id', 'is', null);

        // 4. Calcular receita total possível
        const { data: receitaData } = await this.supabase
            .from('appointments')
            .select(`
                services (
                    base_price
                )
            `)
            .eq('status', 'completed')
            .not('services.base_price', 'is', null);

        const receitaTotal = receitaData?.reduce((sum, apt) => {
            return sum + (parseFloat(apt.services?.base_price) || 0);
        }, 0) || 0;

        console.log('📊 RESULTADOS DA CORREÇÃO:');
        console.log(`✅ Services com preço: ${servicesComPreco}`);
        console.log(`✅ Professional-Services relacionamentos: ${professionalServices}`);
        console.log(`✅ Appointments com professional_id: ${appointmentsComProfessional}`);
        console.log(`💰 Receita total possível: R$ ${receitaTotal.toFixed(2)}`);

        return {
            servicesComPreco,
            professionalServices,
            appointmentsComProfessional,
            receitaTotal
        };
    }

    async executar() {
        console.log('🚀 INICIANDO CORREÇÃO ESTRUTURAL DOS DADOS');
        console.log('='.repeat(60));
        
        try {
            const resultado1 = await this.etapa1_CorrigirPrecosServices();
            const resultado2 = await this.etapa2_PopularProfessionalServices();
            const resultado3 = await this.etapa3_MigrarAppointmentsProfessional();
            const validacao = await this.etapa4_ValidarResultados();

            console.log('\n🎯 CORREÇÃO CONCLUÍDA!');
            console.log('='.repeat(60));
            console.log(`Services atualizados: ${resultado1}`);
            console.log(`Relacionamentos criados: ${resultado2}`);
            console.log(`Appointments migrados: ${resultado3}`);
            console.log(`Receita total: R$ ${validacao.receitaTotal.toFixed(2)}`);

            return validacao;

        } catch (error) {
            console.error('💥 Erro na correção:', error);
            throw error;
        }
    }
}

// Executar
if (require.main === module) {
    const corrector = new CorrecaoEstruturalDados();
    corrector.executar()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('💥 Erro:', error);
            process.exit(1);
        });
}

module.exports = CorrecaoEstruturalDados;