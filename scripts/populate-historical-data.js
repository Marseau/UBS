#!/usr/bin/env node

/**
 * Script para Popular Dados Históricos Completos
 * 
 * Este script cria um conjunto completo de dados históricos para demonstrar
 * o sistema de analytics, incluindo:
 * - Tenants diversos com diferentes perfis
 * - Agendamentos históricos (90 dias)
 * - Clientes e interações
 * - Conversas de IA
 * - Métricas pré-calculadas
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';
const supabase = createClient(supabaseUrl, supabaseKey);

function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
}

// Dados base para geração
const BUSINESS_TYPES = [
    { domain: 'beleza', names: ['Salão Elegance', 'Beleza Total', 'Studio Hair', 'Glamour Beauty', 'Charme Feminino'] },
    { domain: 'saude', names: ['Clínica Premium', 'Saúde & Vida', 'Centro Médico', 'Wellness Clinic', 'Vida Saudável'] },
    { domain: 'fitness', names: ['Studio Fitness', 'Power Gym', 'Corpo & Mente', 'Fitness Center', 'Academia Forte'] },
    { domain: 'estetica', names: ['Spa Relaxante', 'Estética Avançada', 'Beleza Natural', 'Rejuvenescer', 'Estética Premium'] },
    { domain: 'terapia', names: ['Terapia & Bem-estar', 'Espaço Zen', 'Equilíbrio Total', 'Mente & Corpo', 'Harmonia Terapias'] }
];

const SUBSCRIPTION_PLANS = ['free', 'basic', 'pro', 'professional', 'enterprise'];
const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
const SERVICE_TYPES = {
    beleza: ['Corte de Cabelo', 'Coloração', 'Manicure', 'Pedicure', 'Escova'],
    saude: ['Consulta Médica', 'Exames', 'Fisioterapia', 'Nutrição', 'Psicologia'],
    fitness: ['Personal Training', 'Musculação', 'Pilates', 'Yoga', 'Crossfit'],
    estetica: ['Limpeza de Pele', 'Massagem', 'Drenagem', 'Peeling', 'Hidratação'],
    terapia: ['Massoterapia', 'Acupuntura', 'Reflexologia', 'Aromaterapia', 'Reiki']
};

/**
 * Gerar dados realistas baseados em distribuições
 */
function generateRandomData() {
    return {
        // Distribuição realista de status de agendamentos
        getAppointmentStatus: () => {
            const rand = Math.random();
            if (rand < 0.45) return 'completed';    // 45%
            if (rand < 0.65) return 'confirmed';    // 20%
            if (rand < 0.80) return 'cancelled';    // 15%
            if (rand < 0.95) return 'pending';      // 15%
            return 'no_show';                       // 5%
        },
        
        // Preços baseados no tipo de serviço
        getServicePrice: (domain) => {
            const basePrices = {
                beleza: [50, 80, 120, 150, 200],
                saude: [100, 150, 200, 300, 500],
                fitness: [30, 50, 80, 100, 150],
                estetica: [80, 120, 180, 250, 350],
                terapia: [60, 90, 120, 180, 250]
            };
            const prices = basePrices[domain] || basePrices.beleza;
            return prices[Math.floor(Math.random() * prices.length)];
        },
        
        // Distribuição de atividade por dia da semana
        getWeekdayMultiplier: (date) => {
            const day = date.getDay();
            const multipliers = [0.3, 0.8, 1.0, 1.2, 1.3, 1.5, 0.9]; // Dom-Sab
            return multipliers[day];
        },
        
        // Sazonalidade mensal
        getMonthlyMultiplier: (date) => {
            const month = date.getMonth();
            const multipliers = [0.8, 0.9, 1.1, 1.2, 1.3, 1.1, 0.9, 0.8, 1.0, 1.2, 1.4, 1.5];
            return multipliers[month];
        }
    };
}

/**
 * Criar tenants com perfis diversos
 */
async function createTenants() {
    log('🏢 Criando tenants...');
    
    const tenants = [];
    let tenantIndex = 0;
    
    for (const businessType of BUSINESS_TYPES) {
        for (const businessName of businessType.names) {
            const planIndex = tenantIndex % SUBSCRIPTION_PLANS.length;
            const createdDate = new Date();
            createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 365)); // Até 1 ano atrás
            
            const tenant = {
                business_name: businessName,
                domain: businessType.domain,
                status: Math.random() > 0.1 ? 'active' : 'inactive', // 90% ativos
                subscription_plan: SUBSCRIPTION_PLANS[planIndex],
                created_at: createdDate.toISOString(),
                updated_at: createdDate.toISOString()
            };
            
            tenants.push(tenant);
            tenantIndex++;
        }
    }
    
    // Inserir tenants
    const { data: insertedTenants, error } = await supabase
        .from('tenants')
        .upsert(tenants, { onConflict: 'business_name' })
        .select();
        
    if (error) {
        log(`❌ Erro ao criar tenants: ${error.message}`, 'ERROR');
        throw error;
    }
    
    log(`✅ ${insertedTenants.length} tenants criados`);
    return insertedTenants;
}

/**
 * Criar serviços para cada tenant
 */
async function createServices(tenants) {
    log('🛍️ Criando serviços...');
    
    const services = [];
    
    for (const tenant of tenants) {
        const serviceTypes = SERVICE_TYPES[tenant.domain] || SERVICE_TYPES.beleza;
        const randomData = generateRandomData();
        
        for (const serviceName of serviceTypes) {
            const service = {
                tenant_id: tenant.id,
                name: serviceName,
                description: `${serviceName} profissional de alta qualidade`,
                base_price: randomData.getServicePrice(tenant.domain),
                duration: 30 + Math.floor(Math.random() * 90), // 30-120 minutos
                is_active: Math.random() > 0.05, // 95% ativos
                created_at: tenant.created_at,
                updated_at: tenant.created_at
            };
            
            services.push(service);
        }
    }
    
    // Inserir serviços
    const { data: insertedServices, error } = await supabase
        .from('services')
        .upsert(services, { onConflict: 'tenant_id,name' })
        .select();
        
    if (error) {
        log(`❌ Erro ao criar serviços: ${error.message}`, 'ERROR');
        throw error;
    }
    
    log(`✅ ${insertedServices.length} serviços criados`);
    return insertedServices;
}

/**
 * Criar usuários/clientes
 */
async function createUsers(tenants) {
    log('👥 Criando usuários...');
    
    const users = [];
    const userTenants = [];
    
    // Criar pool de usuários
    for (let i = 0; i < 500; i++) {
        const user = {
            phone: `+5511${String(900000000 + i).padStart(9, '0')}`,
            name: `Cliente ${i + 1}`,
            created_at: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
        };
        users.push(user);
    }
    
    // Inserir usuários
    const { data: insertedUsers, error: userError } = await supabase
        .from('users')
        .upsert(users, { onConflict: 'phone' })
        .select();
        
    if (userError) {
        log(`❌ Erro ao criar usuários: ${userError.message}`, 'ERROR');
        throw userError;
    }
    
    // Criar relacionamentos user-tenant
    for (const tenant of tenants) {
        const numCustomers = 10 + Math.floor(Math.random() * 40); // 10-50 clientes por tenant
        const selectedUsers = insertedUsers
            .sort(() => 0.5 - Math.random())
            .slice(0, numCustomers);
            
        for (const user of selectedUsers) {
            const relationship = {
                user_id: user.id,
                tenant_id: tenant.id,
                first_interaction: new Date(
                    Math.max(
                        new Date(user.created_at).getTime(),
                        new Date(tenant.created_at).getTime()
                    ) + Math.random() * 30 * 24 * 60 * 60 * 1000 // Até 30 dias depois
                ).toISOString(),
                total_bookings: 0,
                last_interaction: null
            };
            
            userTenants.push(relationship);
        }
    }
    
    // Inserir relacionamentos
    const { error: relationError } = await supabase
        .from('user_tenants')
        .upsert(userTenants, { onConflict: 'user_id,tenant_id' });
        
    if (relationError) {
        log(`❌ Erro ao criar relacionamentos: ${relationError.message}`, 'ERROR');
        throw relationError;
    }
    
    log(`✅ ${insertedUsers.length} usuários e ${userTenants.length} relacionamentos criados`);
    return { users: insertedUsers, userTenants };
}

/**
 * Criar agendamentos históricos (90 dias)
 */
async function createAppointments(tenants, services, userTenants) {
    log('📅 Criando agendamentos históricos...');
    
    const appointments = [];
    const randomData = generateRandomData();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90); // 90 dias atrás
    
    // Agrupar serviços por tenant
    const servicesByTenant = {};
    services.forEach(service => {
        if (!servicesByTenant[service.tenant_id]) {
            servicesByTenant[service.tenant_id] = [];
        }
        servicesByTenant[service.tenant_id].push(service);
    });
    
    // Agrupar relacionamentos por tenant
    const usersByTenant = {};
    userTenants.userTenants.forEach(ut => {
        if (!usersByTenant[ut.tenant_id]) {
            usersByTenant[ut.tenant_id] = [];
        }
        usersByTenant[ut.tenant_id].push(ut);
    });
    
    // Criar agendamentos para cada dia dos últimos 90 dias
    for (let day = 0; day < 90; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + day);
        
        for (const tenant of tenants) {
            if (tenant.status !== 'active') continue;
            
            const tenantServices = servicesByTenant[tenant.id] || [];
            const tenantUsers = usersByTenant[tenant.id] || [];
            
            if (tenantServices.length === 0 || tenantUsers.length === 0) continue;
            
            // Calcular número de agendamentos baseado em sazonalidade
            const baseAppointments = 2 + Math.floor(Math.random() * 8); // 2-10 por dia
            const weekdayMultiplier = randomData.getWeekdayMultiplier(currentDate);
            const monthlyMultiplier = randomData.getMonthlyMultiplier(currentDate);
            const numAppointments = Math.round(baseAppointments * weekdayMultiplier * monthlyMultiplier);
            
            for (let i = 0; i < numAppointments; i++) {
                const service = tenantServices[Math.floor(Math.random() * tenantServices.length)];
                const userTenant = tenantUsers[Math.floor(Math.random() * tenantUsers.length)];
                
                // Horário do agendamento
                const appointmentTime = new Date(currentDate);
                appointmentTime.setHours(8 + Math.floor(Math.random() * 10)); // 8h-18h
                appointmentTime.setMinutes(Math.floor(Math.random() * 4) * 15); // 0, 15, 30, 45
                
                const status = randomData.getAppointmentStatus();
                const basePrice = service.base_price;
                const finalPrice = status === 'completed' ? basePrice + (Math.random() - 0.5) * basePrice * 0.2 : null;
                
                const appointment = {
                    tenant_id: tenant.id,
                    user_id: userTenant.user_id,
                    service_id: service.id,
                    start_time: appointmentTime.toISOString(),
                    end_time: new Date(appointmentTime.getTime() + service.duration * 60000).toISOString(),
                    status: status,
                    quoted_price: basePrice,
                    final_price: finalPrice,
                    created_at: new Date(appointmentTime.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(), // Criado até 7 dias antes
                    updated_at: appointmentTime.toISOString(),
                    appointment_data: {
                        source: Math.random() > 0.7 ? 'ai' : 'manual', // 30% via IA
                        notes: `Agendamento ${status} para ${service.name}`
                    }
                };
                
                appointments.push(appointment);
            }
        }
        
        // Log de progresso
        if ((day + 1) % 10 === 0) {
            log(`📅 Processados ${day + 1}/90 dias - ${appointments.length} agendamentos criados`);
        }
    }
    
    // Inserir agendamentos em lotes
    const batchSize = 1000;
    let insertedCount = 0;
    
    for (let i = 0; i < appointments.length; i += batchSize) {
        const batch = appointments.slice(i, i + batchSize);
        
        const { error } = await supabase
            .from('appointments')
            .insert(batch);
            
        if (error) {
            log(`❌ Erro ao inserir lote ${i}-${i + batchSize}: ${error.message}`, 'ERROR');
            throw error;
        }
        
        insertedCount += batch.length;
        log(`📊 Inseridos ${insertedCount}/${appointments.length} agendamentos`);
    }
    
    log(`✅ ${appointments.length} agendamentos históricos criados`);
    return appointments;
}

/**
 * Criar conversas de IA
 */
async function createConversations(tenants, userTenants) {
    log('🤖 Criando conversas de IA...');
    
    const conversations = [];
    const aiResponses = [
        'Olá! Como posso ajudá-lo hoje?',
        'Gostaria de agendar um horário?',
        'Temos disponibilidade para amanhã às 14h.',
        'Seu agendamento foi confirmado!',
        'Obrigado por escolher nossos serviços!'
    ];
    
    const userMessages = [
        'Oi, gostaria de agendar',
        'Que horários vocês têm?',
        'Pode ser amanhã?',
        'Perfeito, obrigado!',
        'Até logo!'
    ];
    
    // Criar conversas para cada tenant
    for (const tenant of tenants) {
        if (tenant.status !== 'active') continue;
        
        const tenantUsers = userTenants.userTenants.filter(ut => ut.tenant_id === tenant.id);
        const numConversations = 5 + Math.floor(Math.random() * 20); // 5-25 conversas
        
        for (let i = 0; i < numConversations; i++) {
            const user = tenantUsers[Math.floor(Math.random() * tenantUsers.length)];
            const conversationDate = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000);
            
            // Criar sequência de mensagens
            const numMessages = 2 + Math.floor(Math.random() * 6); // 2-8 mensagens
            
            for (let j = 0; j < numMessages; j++) {
                const isFromUser = j % 2 === 0;
                const messageTime = new Date(conversationDate.getTime() + j * 60000); // 1 minuto entre mensagens
                
                const conversation = {
                    tenant_id: tenant.id,
                    user_id: user.user_id,
                    message: isFromUser 
                        ? userMessages[Math.floor(Math.random() * userMessages.length)]
                        : aiResponses[Math.floor(Math.random() * aiResponses.length)],
                    is_from_user: isFromUser,
                    confidence_score: isFromUser ? null : 75 + Math.random() * 25, // IA: 75-100%
                    intent_detected: isFromUser ? null : ['booking', 'greeting', 'information'][Math.floor(Math.random() * 3)],
                    created_at: messageTime.toISOString(),
                    updated_at: messageTime.toISOString()
                };
                
                conversations.push(conversation);
            }
        }
    }
    
    // Inserir conversas em lotes
    const batchSize = 500;
    let insertedCount = 0;
    
    for (let i = 0; i < conversations.length; i += batchSize) {
        const batch = conversations.slice(i, i + batchSize);
        
        const { error } = await supabase
            .from('conversation_history')
            .insert(batch);
            
        if (error) {
            log(`❌ Erro ao inserir conversas: ${error.message}`, 'ERROR');
            throw error;
        }
        
        insertedCount += batch.length;
    }
    
    log(`✅ ${conversations.length} conversas de IA criadas`);
    return conversations;
}

/**
 * Executar cron job para calcular métricas históricas
 */
async function calculateHistoricalMetrics() {
    log('📊 Calculando métricas históricas...');
    
    try {
        // Executar o cron job para os últimos 30 dias
        for (let day = 30; day >= 0; day--) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() - day);
            const dateString = targetDate.toISOString().split('T')[0];
            
            log(`📅 Calculando métricas para ${dateString}...`);
            
            // Simular execução do cron job para esta data
            const { runDailyCron } = require('./daily-analytics-cron');
            
            // Executar com data específica (modificar temporariamente)
            process.env.CRON_TARGET_DATE = dateString;
            await runDailyCron();
            delete process.env.CRON_TARGET_DATE;
            
            if (day % 5 === 0) {
                log(`📊 Processados ${30 - day + 1}/31 dias de métricas`);
            }
        }
        
        log('✅ Métricas históricas calculadas');
        
    } catch (error) {
        log(`❌ Erro ao calcular métricas: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Gerar relatório final
 */
async function generateFinalReport() {
    log('📋 Gerando relatório final...');
    
    try {
        // Buscar estatísticas finais
        const { data: tenants } = await supabase.from('tenants').select('*');
        const { data: appointments } = await supabase.from('appointments').select('*');
        const { data: users } = await supabase.from('users').select('*');
        const { data: services } = await supabase.from('services').select('*');
        const { data: conversations } = await supabase.from('conversation_history').select('*');
        const { data: systemMetrics } = await supabase.from('analytics_system_metrics').select('*');
        const { data: tenantMetrics } = await supabase.from('analytics_tenant_metrics').select('*');
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                tenants: tenants?.length || 0,
                activeTenants: tenants?.filter(t => t.status === 'active').length || 0,
                appointments: appointments?.length || 0,
                completedAppointments: appointments?.filter(a => a.status === 'completed').length || 0,
                users: users?.length || 0,
                services: services?.length || 0,
                conversations: conversations?.length || 0,
                systemMetricsRecords: systemMetrics?.length || 0,
                tenantMetricsRecords: tenantMetrics?.length || 0
            },
            businessDistribution: {},
            revenueByDomain: {},
            appointmentsByStatus: {},
            subscriptionDistribution: {}
        };
        
        // Distribuição por domínio
        if (tenants) {
            tenants.forEach(tenant => {
                const domain = tenant.domain || 'outros';
                report.businessDistribution[domain] = (report.businessDistribution[domain] || 0) + 1;
                report.subscriptionDistribution[tenant.subscription_plan] = (report.subscriptionDistribution[tenant.subscription_plan] || 0) + 1;
            });
        }
        
        // Distribuição por status
        if (appointments) {
            appointments.forEach(appointment => {
                const status = appointment.status;
                report.appointmentsByStatus[status] = (report.appointmentsByStatus[status] || 0) + 1;
            });
        }
        
        // Calcular receita total
        const totalRevenue = appointments
            ?.filter(a => a.status === 'completed')
            .reduce((sum, a) => sum + (parseFloat(a.final_price) || 0), 0) || 0;
            
        report.summary.totalRevenue = totalRevenue;
        report.summary.averageTicket = report.summary.completedAppointments > 0 
            ? (totalRevenue / report.summary.completedAppointments).toFixed(2)
            : 0;
        
        // Salvar relatório
        const reportPath = path.join(__dirname, '../historical-data-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Mostrar resumo
        console.log('\n' + '='.repeat(60));
        console.log('📊 RELATÓRIO DE DADOS HISTÓRICOS POPULADOS');
        console.log('='.repeat(60));
        console.log(`🏢 Tenants criados: ${report.summary.tenants} (${report.summary.activeTenants} ativos)`);
        console.log(`👥 Usuários criados: ${report.summary.users}`);
        console.log(`🛍️ Serviços criados: ${report.summary.services}`);
        console.log(`📅 Agendamentos criados: ${report.summary.appointments}`);
        console.log(`✅ Agendamentos concluídos: ${report.summary.completedAppointments}`);
        console.log(`🤖 Conversas de IA: ${report.summary.conversations}`);
        console.log(`💰 Receita total: R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        console.log(`🎫 Ticket médio: R$ ${report.summary.averageTicket}`);
        console.log(`📊 Métricas do sistema: ${report.summary.systemMetricsRecords} registros`);
        console.log(`🏢 Métricas por tenant: ${report.summary.tenantMetricsRecords} registros`);
        
        console.log('\n🏆 DISTRIBUIÇÃO POR DOMÍNIO:');
        Object.entries(report.businessDistribution).forEach(([domain, count]) => {
            console.log(`  ${domain}: ${count} tenants`);
        });
        
        console.log('\n📋 DISTRIBUIÇÃO POR STATUS:');
        Object.entries(report.appointmentsByStatus).forEach(([status, count]) => {
            const percentage = ((count / report.summary.appointments) * 100).toFixed(1);
            console.log(`  ${status}: ${count} (${percentage}%)`);
        });
        
        console.log('\n💳 DISTRIBUIÇÃO POR PLANO:');
        Object.entries(report.subscriptionDistribution).forEach(([plan, count]) => {
            console.log(`  ${plan}: ${count} tenants`);
        });
        
        console.log('\n🎉 DADOS HISTÓRICOS POPULADOS COM SUCESSO!');
        console.log('📄 Relatório salvo em: historical-data-report.json');
        console.log('='.repeat(60) + '\n');
        
        return report;
        
    } catch (error) {
        log(`❌ Erro ao gerar relatório: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Função principal
 */
async function populateHistoricalData() {
    const startTime = Date.now();
    
    log('🚀 Iniciando população de dados históricos completos');
    
    try {
        // 1. Criar tenants
        const tenants = await createTenants();
        
        // 2. Criar serviços
        const services = await createServices(tenants);
        
        // 3. Criar usuários
        const userData = await createUsers(tenants);
        
        // 4. Criar agendamentos históricos
        await createAppointments(tenants, services, userData);
        
        // 5. Criar conversas de IA
        await createConversations(tenants, userData);
        
        // 6. Calcular métricas históricas
        await calculateHistoricalMetrics();
        
        // 7. Gerar relatório final
        const report = await generateFinalReport();
        
        const duration = Date.now() - startTime;
        log(`✅ População concluída com sucesso em ${Math.round(duration / 1000)}s`);
        
        return report;
        
    } catch (error) {
        const duration = Date.now() - startTime;
        log(`❌ Erro na população: ${error.message} (${Math.round(duration / 1000)}s)`, 'ERROR');
        throw error;
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    populateHistoricalData()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { populateHistoricalData }; 