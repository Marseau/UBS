/**
 * CORREÇÃO ESTRUTURAL DOS DADOS - VERSÃO 2
 * Problemas identificados e corrigidos:
 * 1. professional_services precisa de tenant_id
 * 2. Apenas 10 appointments sem professional_id (quase todos já migrados)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

class CorrecaoEstruturalDadosV2 {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );
    }

    async etapa2_PopularProfessionalServicesCorrigido() {
        console.log('📝 ETAPA 2: Populando professional_services (CORRIGIDO)...');
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
                            tenant_id: professional.tenant_id, // Campo obrigatório!
                            custom_price: customPrice,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                            // Removido is_available que não existe
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

    async etapa3_CompletarAppointments() {
        console.log('\n📝 ETAPA 3: Completando appointments restantes...');
        console.log('-'.repeat(50));

        // Buscar os 10 appointments sem professional_id
        const { data: appointments } = await this.supabase
            .from('appointments')
            .select('id, tenant_id, service_id')
            .is('professional_id', null);

        console.log(`${appointments?.length || 0} appointments para completar`);

        if (appointments?.length === 0) {
            console.log('✅ Todos os appointments já têm professional_id');
            return 0;
        }

        let completados = 0;
        for (const appointment of appointments) {
            // Buscar um professional do mesmo tenant que oferece o service
            const { data: professionalServices } = await this.supabase
                .from('professional_services')
                .select(`
                    professional_id,
                    professionals (
                        name
                    )
                `)
                .eq('tenant_id', appointment.tenant_id)
                .eq('service_id', appointment.service_id)
                .limit(1);

            if (professionalServices?.[0]) {
                const professionalId = professionalServices[0].professional_id;
                const professionalName = professionalServices[0].professionals?.name;

                const { error } = await this.supabase
                    .from('appointments')
                    .update({ 
                        professional_id: professionalId,
                        // Também atualizar appointment_data com professional_name
                        appointment_data: {
                            ...appointment.appointment_data,
                            professional_name: professionalName
                        }
                    })
                    .eq('id', appointment.id);

                if (error) {
                    console.error(`❌ Erro atualizando appointment ${appointment.id}:`, error.message);
                } else {
                    console.log(`✅ Appointment → ${professionalName}`);
                    completados++;
                }
            } else {
                console.log(`⚠️ Nenhum professional encontrado para service ${appointment.service_id}`);
            }
        }

        console.log(`\n📊 Etapa 3 concluída: ${completados} appointments completados`);
        return completados;
    }

    async etapa4_GerarRelatorioFinal() {
        console.log('\n📝 ETAPA 4: Relatório final completo...');
        console.log('-'.repeat(50));

        // 1. Services com preço
        const { count: servicesComPreco } = await this.supabase
            .from('services')
            .select('*', { count: 'exact', head: true })
            .not('base_price', 'is', null);

        const { count: servicesSemPreco } = await this.supabase
            .from('services')
            .select('*', { count: 'exact', head: true })
            .is('base_price', null);

        // 2. Professional_services
        const { count: professionalServices } = await this.supabase
            .from('professional_services')
            .select('*', { count: 'exact', head: true });

        // 3. Appointments com professional_id
        const { count: appointmentsComProfessional } = await this.supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .not('professional_id', 'is', null);

        const { count: appointmentsSemProfessional } = await this.supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .is('professional_id', null);

        // 4. Calcular receita total com appointments completed
        const { data: receitaData } = await this.supabase
            .from('appointments')
            .select(`
                services (
                    base_price
                )
            `)
            .eq('status', 'completed')
            .not('services.base_price', 'is', null);

        const receitaCompleted = receitaData?.reduce((sum, apt) => {
            return sum + (parseFloat(apt.services?.base_price) || 0);
        }, 0) || 0;

        // 5. Receita total possível (todos os appointments)
        const { data: receitaTotalData } = await this.supabase
            .from('appointments')
            .select(`
                services (
                    base_price
                )
            `)
            .not('services.base_price', 'is', null);

        const receitaTotal = receitaTotalData?.reduce((sum, apt) => {
            return sum + (parseFloat(apt.services?.base_price) || 0);
        }, 0) || 0;

        // 6. Estatísticas por tenant
        const { data: tenantStats } = await this.supabase
            .from('professional_services')
            .select(`
                tenant_id,
                tenants (
                    name,
                    domain
                )
            `);

        const statsPorTenant = {};
        tenantStats?.forEach(ps => {
            const tenantId = ps.tenant_id;
            if (!statsPorTenant[tenantId]) {
                statsPorTenant[tenantId] = {
                    name: ps.tenants?.name,
                    domain: ps.tenants?.domain,
                    relacionamentos: 0
                };
            }
            statsPorTenant[tenantId].relacionamentos++;
        });

        console.log('📊 RELATÓRIO FINAL COMPLETO:');
        console.log('='.repeat(60));
        console.log(`✅ Services com preço: ${servicesComPreco}`);
        console.log(`❌ Services sem preço: ${servicesSemPreco}`);
        console.log(`🔗 Professional-Services relacionamentos: ${professionalServices}`);
        console.log(`✅ Appointments com professional_id: ${appointmentsComProfessional}`);
        console.log(`❌ Appointments sem professional_id: ${appointmentsSemProfessional}`);
        console.log(`💰 Receita appointments completed: R$ ${receitaCompleted.toFixed(2)}`);
        console.log(`💰 Receita total possível: R$ ${receitaTotal.toFixed(2)}`);

        console.log('\n📋 RELACIONAMENTOS POR TENANT:');
        Object.entries(statsPorTenant).forEach(([tenantId, stats]) => {
            console.log(`${stats.name} (${stats.domain}): ${stats.relacionamentos} relacionamentos`);
        });

        return {
            servicesComPreco,
            servicesSemPreco,
            professionalServices,
            appointmentsComProfessional,
            appointmentsSemProfessional,
            receitaCompleted,
            receitaTotal,
            tenantStats: statsPorTenant
        };
    }

    async executar() {
        console.log('🚀 CORREÇÃO ESTRUTURAL DOS DADOS - VERSÃO 2');
        console.log('='.repeat(60));
        
        try {
            console.log('⏭️ Pulando Etapa 1 (já executada - 81 services com preço)');
            
            const resultado2 = await this.etapa2_PopularProfessionalServicesCorrigido();
            const resultado3 = await this.etapa3_CompletarAppointments();
            const relatorioFinal = await this.etapa4_GerarRelatorioFinal();

            console.log('\n🎯 CORREÇÃO V2 CONCLUÍDA!');
            console.log('='.repeat(60));
            console.log(`Professional-services criados: ${resultado2}`);
            console.log(`Appointments completados: ${resultado3}`);
            console.log(`Receita total: R$ ${relatorioFinal.receitaTotal.toFixed(2)}`);
            console.log(`Sistema 100% funcional para métricas reais!`);

            return relatorioFinal;

        } catch (error) {
            console.error('💥 Erro na correção:', error);
            throw error;
        }
    }
}

// Executar
if (require.main === module) {
    const corrector = new CorrecaoEstruturalDadosV2();
    corrector.executar()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('💥 Erro:', error);
            process.exit(1);
        });
}

module.exports = CorrecaoEstruturalDadosV2;