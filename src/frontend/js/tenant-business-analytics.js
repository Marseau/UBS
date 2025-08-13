// =====================================================
// FASE 5: Tenant Business Analytics - Frontend Integrado
// =====================================================
// OBJETIVO: Integrar com as novas APIs REST da FASE 4
// =====================================================

(function() {
    'use strict';

    // Global variables
    let currentTenant = null;
    let currentPeriod = 30;
    let platformMetrics = null;
    let tenantMetrics = null;
    let userRole = 'user';
    let charts = {}; // Store chart instances
    let lastUpdated = null;
    
    // Make key functions and variables globally accessible for testing
    window.tenantAnalytics = {
        updateCharts: function() { return updateCharts(); },
        selectTenant: function(tenantId) { return selectTenant(tenantId); },
        get currentTenant() { return currentTenant; },
        get platformMetrics() { return platformMetrics; },
        get tenantMetrics() { return tenantMetrics; },
        set platformMetrics(value) { platformMetrics = value; },
        set tenantMetrics(value) { tenantMetrics = value; }
    };
    
    // Initialize page
    document.addEventListener('DOMContentLoaded', function() {
        console.log('🚀 DOM loaded, initializing page...');
        initializePage();
    });
    
    async function initializePage() {
        try {
            console.log('🚀 FASE 5 - Iniciando Tenant Business Analytics');
            
            // Get tenant from URL automatically
            const urlParams = new URLSearchParams(window.location.search);
            const tenantFromUrl = urlParams.get('tenant');
            
            console.log('🔍 Tenant da URL:', tenantFromUrl);
            
            // Check user role
            await checkUserRole();
            
            // Always show tenant selector on analytics page
            const tenantSelector = document.getElementById('tenantSelector');
            console.log('🔍 Tenant selector element:', tenantSelector);
            if (tenantSelector) {
                tenantSelector.style.display = 'block';
                tenantSelector.classList.remove('d-none');
                console.log('✅ Tenant selector shown');
            } else {
                console.error('❌ Tenant selector element not found');
            }
            
            // Load tenants list
            await loadTenantsList();
            
            // If tenant specified in URL, select it automatically
            if (tenantFromUrl) {
                await selectTenant(tenantFromUrl);
            }
            
            // Initialize event listeners
            setupEventListeners();
            
            // Show last updated time
            updateLastRefreshTime();
            
        } catch (error) {
            console.error('❌ Erro na inicialização:', error);
            showError('Erro ao inicializar página');
        }
    }
    
    // Check user role from JWT token
    async function checkUserRole() {
        try {
            const token = localStorage.getItem('ubs_token');
            if (!token) {
                console.log('❌ Token não encontrado');
                return;
            }
            
            // Decode JWT token
            const payload = JSON.parse(atob(token.split('.')[1]));
            userRole = payload.role || 'user';
            
            console.log('👤 Role do usuário:', userRole);
            
        } catch (error) {
            console.error('❌ Erro ao verificar role:', error);
            userRole = 'user';
        }
    }
    
    // Load tenants list usando nova API
    async function loadTenantsList() {
        try {
            console.log('📋 Carregando lista de tenants...');
            
            const token = localStorage.getItem('ubs_token');
            console.log('🔑 Token encontrado:', token ? 'Sim' : 'Não');
            
            if (!token) {
                console.error('❌ Token não encontrado');
                showError('Sessão expirada. Redirecionando para login...');
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 2000);
                return;
            }
            
            const response = await fetch('/api/tenant-platform/tenants', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('📡 Status da resposta:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('❌ Erro na resposta:', errorData);
                
                // Handle token expired
                if (response.status === 401 || response.status === 403) {
                    showError('Sessão expirada. Redirecionando para login...');
                    localStorage.removeItem('ubs_token');
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                    return;
                }
                
                throw new Error(`Erro ${response.status}: ${errorData.error || 'Erro ao carregar tenants'}`);
            }
            
            const data = await response.json();
            console.log('✅ Tenants carregados:', data);
            
            if (data.success && data.data && data.data.tenants) {
                window.availableTenants = data.data.tenants;
                updateTenantDropdown(data.data.tenants);
            } else {
                console.error('❌ Estrutura de resposta inesperada:', data);
                showError('Dados de tenants inválidos');
            }
            
        } catch (error) {
            console.error('❌ Erro ao carregar tenants:', error);
            showError(`Erro ao carregar lista de tenants: ${error.message}`);
        }
    }
    
    // Update tenant dropdown (now using traditional select)
    function updateTenantDropdown(tenants) {
        const tenantSelect = document.getElementById('tenantSelect');
        console.log('🔍 Select element:', tenantSelect);
        console.log('🔍 Tenants to populate:', tenants.length);
        
        if (!tenantSelect) {
            console.error('❌ Select element not found');
            return;
        }
        
        // Clear existing options
        tenantSelect.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Selecionar Tenant...';
        tenantSelect.appendChild(defaultOption);
        
        if (tenants.length === 0) {
            const noTenantsOption = document.createElement('option');
            noTenantsOption.value = '';
            noTenantsOption.textContent = 'Nenhum tenant encontrado';
            noTenantsOption.disabled = true;
            tenantSelect.appendChild(noTenantsOption);
            return;
        }
        
        // Add tenant options
        tenants.forEach(tenant => {
            const option = document.createElement('option');
            option.value = tenant.id;
            const tenantName = tenant.name || tenant.business_name || `Tenant ${tenant.id.substring(0,8)}`;
            const revenue = (tenant.last_revenue || 0).toLocaleString('pt-BR');
            const ranking = tenant.last_ranking || 0;
            option.textContent = `${tenantName} (R$ ${revenue}, #${ranking})`;
            tenantSelect.appendChild(option);
        });
        
        console.log(`✅ Select atualizado com ${tenants.length} tenants`);
        
        // Ensure visibility
        const tenantSelector = document.getElementById('tenantSelector');
        if (tenantSelector) {
            tenantSelector.style.display = 'block';
            tenantSelector.classList.remove('d-none');
        }
    }
    
    // Select tenant and load data
    async function selectTenant(tenantId) {
        try {
            console.log('🏢 Selecionando tenant:', tenantId);
            
            // Find tenant in list
            const tenant = window.availableTenants?.find(t => t.id === tenantId);
            if (!tenant) {
                console.error('❌ Tenant não encontrado na lista');
                showError('Tenant não encontrado');
                return;
            }
            
            currentTenant = tenant;
            
            // Update UI (select element will update automatically)
            const tenantSelect = document.getElementById('tenantSelect');
            if (tenantSelect && tenantSelect.value !== tenantId) {
                tenantSelect.value = tenantId;
            }
            
            // Hide warning
            const warningContainer = document.querySelector('.alert-warning');
            if (warningContainer) {
                warningContainer.style.display = 'none';
            }
            
            // Update URL with selected tenant
            const url = new URL(window.location);
            url.searchParams.set('tenant', tenantId);
            window.history.pushState({}, '', url);
            
            // Load platform metrics FIRST (needed for tenant UI)
            await loadPlatformMetrics();
            
            // Then load tenant metrics
            await loadTenantMetrics(tenantId);
            
            // Show content (usar IDs que existem no HTML)
            const noTenantAlert = document.getElementById('noTenantAlert');
            const businessInfoCard = document.getElementById('businessInfoCard');
            
            if (noTenantAlert) noTenantAlert.style.display = 'none';
            if (businessInfoCard) businessInfoCard.classList.remove('d-none');
            
        } catch (error) {
            console.error('❌ Erro ao selecionar tenant:', error);
            showError('Erro ao carregar dados do tenant');
        }
    }
    
    // Load tenant metrics usando nova API
    async function loadTenantMetrics(tenantId) {
        try {
            console.log('📊 Carregando métricas do tenant:', tenantId);
            
            const token = localStorage.getItem('ubs_token');
            if (!token) {
                showError('Sessão expirada. Redirecionando para login...');
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 2000);
                return;
            }
            
            const response = await fetch(`/api/tenant-platform/tenant/${tenantId}/metrics?period=${currentPeriod}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    showError('Sessão expirada. Redirecionando para login...');
                    localStorage.removeItem('ubs_token');
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                    return;
                }
                throw new Error('Erro ao carregar métricas');
            }
            
            const data = await response.json();
            console.log('✅ Métricas do tenant:', data);
            
            if (data.success && data.data && data.data.metrics) {
                tenantMetrics = data.data.metrics;
                
                // Update tenant info
                updateTenantInfo(data.data.tenant, data.data.metrics, data.data.last_updated || data.data.metrics);
                
                // Update metrics UI
                updateTenantMetricsUI(data.data.metrics);
                
                // Update charts if both platform and tenant data are available
                if (platformMetrics) {
                    updateCharts();
                    updateRankingInfo();
                    loadTopTenants();
                    updateInsights();
                }
                
                showSuccess('Métricas do tenant carregadas com sucesso');
            } else {
                showError('Dados do tenant não encontrados ou inválidos');
            }
            
        } catch (error) {
            console.error('❌ Erro ao carregar métricas do tenant:', error);
            showError('Erro ao carregar métricas do tenant');
        }
    }
    
    // Load platform metrics usando nova API
    async function loadPlatformMetrics() {
        try {
            console.log('🌍 Carregando métricas da plataforma...');
            
            const token = localStorage.getItem('ubs_token');
            if (!token) {
                showError('Sessão expirada. Redirecionando para login...');
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 2000);
                return;
            }
            
            const response = await fetch(`/api/tenant-platform/platform/metrics?period=${currentPeriod}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    showError('Sessão expirada. Redirecionando para login...');
                    localStorage.removeItem('ubs_token');
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                    return;
                }
                throw new Error('Erro ao carregar métricas da plataforma');
            }
            
            const data = await response.json();
            console.log('✅ Métricas da plataforma:', data);
            
            if (data.success && data.data && data.data.platform) {
                platformMetrics = data.data.platform;
                updatePlatformMetricsUI(data.data.platform);
                
                // Update charts if both platform and tenant data are available
                if (tenantMetrics) {
                    updateCharts();
                }
                
                showSuccess('Métricas da plataforma carregadas com sucesso');
            } else {
                showError('Dados da plataforma não encontrados ou inválidos');
            }
            
        } catch (error) {
            console.error('❌ Erro ao carregar métricas da plataforma:', error);
            showError('Erro ao carregar métricas da plataforma');
        }
    }
    
    // Update tenant info section
    function updateTenantInfo(tenant, metrics = null, lastUpdated = null) {
        if (!tenant) return;
        
        const businessNameEl = document.getElementById('businessName');
        const businessDescriptionEl = document.getElementById('businessDescription');
        const businessStatusEl = document.getElementById('businessStatus');
        const businessPlanEl = document.getElementById('businessPlan');
        const businessDomainEl = document.getElementById('businessDomain');
        const tenantIdEl = document.getElementById('tenantId');
        const lastUpdateEl = document.getElementById('lastUpdate');
        const tenantRankingEl = document.getElementById('tenantRanking');
        
        if (businessNameEl) {
            businessNameEl.textContent = tenant.name || 'Nome não disponível';
        }
        
        if (businessDescriptionEl) {
            businessDescriptionEl.textContent = 'Análise detalhada de participação na plataforma';
        }
        
        if (businessStatusEl) {
            businessStatusEl.textContent = 'Ativo';
            businessStatusEl.className = 'badge bg-success';
        }
        
        if (businessPlanEl) {
            businessPlanEl.textContent = 'Plano Premium';
            businessPlanEl.className = 'badge bg-primary';
        }
        
        if (businessDomainEl) {
            businessDomainEl.textContent = tenant.domain || 'business';
            businessDomainEl.className = 'badge bg-secondary';
        }
        
        if (tenantIdEl) {
            tenantIdEl.textContent = `ID: ${tenant.id || 'N/A'}`;
            tenantIdEl.className = 'badge bg-info';
        }
        
        if (lastUpdateEl) {
            // Use calculation_date from API response (last cron execution)
            console.log('🕒 Debug lastUpdate:', { lastUpdated, metrics });
            const cronDate = lastUpdated || metrics?.calculation_date || metrics?.last_updated || 
                           (metrics && Object.keys(metrics).length > 0 ? new Date().toISOString() : null);
            console.log('🕒 Final cronDate:', cronDate);
            if (cronDate) {
                const date = new Date(cronDate);
                const now = new Date();
                const diff = Math.floor((now - date) / 1000);
                
                let timeText = '';
                if (diff < 60) {
                    timeText = 'agora mesmo';
                } else if (diff < 3600) {
                    const minutes = Math.floor(diff / 60);
                    timeText = `há ${minutes} min`;
                } else if (diff < 86400) {
                    const hours = Math.floor(diff / 3600);
                    timeText = `há ${hours}h`;
                } else {
                    const days = Math.floor(diff / 86400);
                    timeText = `há ${days}d`;
                }
                
                lastUpdateEl.textContent = `${date.toLocaleDateString('pt-BR')} (${timeText})`;
            } else {
                lastUpdateEl.textContent = 'Dados não disponíveis';
            }
        }
        
        if (tenantRankingEl) {
            // CORREÇÃO: Buscar ranking da tabela UBS metrics ou da API de rankings
            let ranking = 0;
            
            // Primeiro tentar pegar da resposta original da API
            if (metrics?.ranking?.position) {
                ranking = metrics.ranking.position;
            } else if (tenantMetrics?.tenant_ranking_position) {
                ranking = tenantMetrics.tenant_ranking_position;
            } else if (tenantMetrics?.ranking?.position) {
                ranking = tenantMetrics.ranking.position;
            }
            
            const total = platformMetrics?.total_active_tenants || 9; // fallback para 9 tenants conhecidos
            
            if (ranking > 0) {
                tenantRankingEl.textContent = `#${ranking} de ${total}`;
            } else {
                // Se não temos ranking, buscar da API
                loadTenantRanking(tenant.id, currentPeriod).then(pos => {
                    if (pos > 0 && tenantRankingEl) {
                        tenantRankingEl.textContent = `#${pos} de ${total}`;
                    }
                });
                tenantRankingEl.textContent = 'Calculando ranking...';
            }
        }
    }
    
    // Load tenant ranking from API
    async function loadTenantRanking(tenantId, period) {
        try {
            const token = localStorage.getItem('ubs_token');
            if (!token) return 0;
            
            const response = await fetch(`/api/tenant-platform/rankings?period=${period}&limit=20`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) return 0;
            
            const data = await response.json();
            if (data.success && data.data?.rankings) {
                const ranking = data.data.rankings.find(r => r.tenant_id === tenantId);
                return ranking ? ranking.position : 0;
            }
            
            return 0;
        } catch (error) {
            console.error('❌ Erro ao carregar ranking:', error);
            return 0;
        }
    }
    
    // Update tenant metrics UI
    function updateTenantMetricsUI(metrics) {
        console.log('🎨 Atualizando UI com métricas:', metrics);
        console.log('🎨 Platform metrics available:', platformMetrics);
        
        // Verificar se há dados válidos
        if (!metrics) {
            showError('Dados do tenant não encontrados');
            return;
        }
        
        // Debug valores específicos
        console.log('📊 Revenue participation:', metrics.revenue?.participation_pct);
        console.log('📊 Appointments participation:', metrics.appointments?.participation_pct);
        console.log('📊 Revenue value:', metrics.revenue?.participation_value);
        console.log('📊 Appointments count:', metrics.appointments?.count);
        
        // Update participation percentages com verificação
        const revenueEl = document.getElementById('revenueParticipation');
        const appointmentsEl = document.getElementById('appointmentsParticipation');
        const customersEl = document.getElementById('customersParticipation');
        
        if (revenueEl) {
            // MRR Card: Show tenant's participation percentage in platform MRR
            const activeTenants = platformMetrics?.total_active_tenants || 1;
            const tenantMRRParticipation = activeTenants > 0 ? (100 / activeTenants) : 0;
            revenueEl.textContent = `${tenantMRRParticipation.toFixed(2)}%`;
        } else {
            showWarning('Elemento de participação MRR não encontrado na página');
        }
        
        if (appointmentsEl) {
            appointmentsEl.textContent = `${(metrics.appointments?.participation_pct || 0).toFixed(2)}%`;
        } else {
            showWarning('Elemento de agendamentos não encontrado na página');
        }
        
        if (customersEl) {
            customersEl.textContent = `${(metrics.customers?.participation_pct || 0).toFixed(2)}%`;
        } else {
            showWarning('Elemento de clientes não encontrado na página');
        }
        
        // Update subtitles com verificação
        const revenueSubEl = document.getElementById('revenueParticipationSub');
        const appointmentsSubEl = document.getElementById('appointmentsParticipationSub');
        const customersSubEl = document.getElementById('customersParticipationSub');
        
        if (revenueSubEl) {
            // MRR Card: Simple description for participation percentage
            const activeTenants = platformMetrics?.total_active_tenants || 1;
            revenueSubEl.textContent = `Participação do Tenant no MRR da Plataforma`;
        } else {
            showWarning('Elemento de subtítulo de MRR não encontrado');
        }
        
        if (appointmentsSubEl) {
            if (platformMetrics?.total_appointments) {
                appointmentsSubEl.textContent = `${metrics.appointments?.count || 0} de ${platformMetrics.total_appointments || 0} agendamentos`;
            } else {
                appointmentsSubEl.textContent = 'Dados da plataforma não disponíveis';
            }
        } else {
            showWarning('Elemento de subtítulo de agendamentos não encontrado');
        }
        
        if (customersSubEl) {
            if (platformMetrics?.total_customers) {
                customersSubEl.textContent = `${metrics.customers?.count || 0} de ${platformMetrics.total_customers || 0} clientes`;
            } else {
                customersSubEl.textContent = 'Dados da plataforma não disponíveis';
            }
        } else {
            showWarning('Elemento de subtítulo de clientes não encontrado');
        }
        
        // Atualizar outros elementos se existirem
        updateAdditionalMetrics(metrics);
        
        // Atualizar indicadores de tendência
        updateTrendIndicators(metrics);
        
        console.log('✅ UI atualizada com sucesso');
    }
    
    // Update trend indicators for all cards
    function updateTrendIndicators(metrics) {
        // MRR Participation trend
        const revenueTrendEl = document.getElementById('revenueParticipationTrend');
        if (revenueTrendEl) {
            // Calculate monthly payment based on platform MRR and active tenants
            const platformMRR = platformMetrics?.strategic_metrics?.mrr || platformMetrics?.mrr || 0;
            const activeTenants = platformMetrics?.total_active_tenants || 1;
            const monthlyPayment = activeTenants > 0 ? (platformMRR / activeTenants) : 0;
            
            let trendClass = 'trend-stable';
            let trendIcon = 'fas fa-dollar-sign';
            let trendText = `${monthlyPayment.toFixed(2)}`;
            
            revenueTrendEl.className = `metric-trend ${trendClass}`;
            revenueTrendEl.innerHTML = `<i class="${trendIcon}"></i><span>${trendText}</span>`;
        }
        
        // Appointments trend
        const appointmentsTrendEl = document.getElementById('appointmentsParticipationTrend');
        if (appointmentsTrendEl) {
            const appointmentsParticipation = metrics.appointments?.participation_pct || 0;
            let trendClass, trendIcon, trendText;
            
            if (appointmentsParticipation >= 25) {
                trendClass = 'trend-up';
                trendIcon = 'fas fa-arrow-up';
                trendText = 'Alto volume';
            } else if (appointmentsParticipation >= 10) {
                trendClass = 'trend-stable';
                trendIcon = 'fas fa-minus';
                trendText = 'Volume médio';
            } else if (appointmentsParticipation > 0) {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-arrow-down';
                trendText = 'Volume baixo';
            } else {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-exclamation-triangle';
                trendText = 'Sem agendamentos';
            }
            
            appointmentsTrendEl.className = `metric-trend ${trendClass}`;
            appointmentsTrendEl.innerHTML = `<i class="${trendIcon}"></i><span>${trendText}</span>`;
        }
        
        // Customers trend
        const customersTrendEl = document.getElementById('customersParticipationTrend');
        if (customersTrendEl) {
            const customersParticipation = metrics.customers?.participation_pct || 0;
            let trendClass, trendIcon, trendText;
            
            if (customersParticipation >= 30) {
                trendClass = 'trend-up';
                trendIcon = 'fas fa-arrow-up';
                trendText = 'Base forte';
            } else if (customersParticipation >= 15) {
                trendClass = 'trend-stable';
                trendIcon = 'fas fa-minus';
                trendText = 'Base sólida';
            } else if (customersParticipation > 0) {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-arrow-down';
                trendText = 'Base pequena';
            } else {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-exclamation-triangle';
                trendText = 'Sem clientes';
            }
            
            customersTrendEl.className = `metric-trend ${trendClass}`;
            customersTrendEl.innerHTML = `<i class="${trendIcon}"></i><span>${trendText}</span>`;
        }
        
        // Cancellation trend
        const cancellationTrendEl = document.getElementById('cancellationParticipationTrend');
        if (cancellationTrendEl) {
            const cancellationRate = metrics.appointments?.cancellation_rate_pct || 0;
            let trendClass, trendIcon, trendText;
            
            if (cancellationRate === 0) {
                trendClass = 'trend-stable';
                trendIcon = 'fas fa-question';
                trendText = 'Sem dados';
            } else if (cancellationRate <= 5) {
                trendClass = 'trend-up';
                trendIcon = 'fas fa-check';
                trendText = 'Baixo cancelamento';
            } else if (cancellationRate <= 15) {
                trendClass = 'trend-stable';
                trendIcon = 'fas fa-minus';
                trendText = 'Cancelamento normal';
            } else if (cancellationRate <= 30) {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-exclamation-triangle';
                trendText = 'Alto cancelamento';
            } else {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-times';
                trendText = 'Cancelamento crítico';
            }
            
            cancellationTrendEl.className = `metric-trend ${trendClass}`;
            cancellationTrendEl.innerHTML = `<i class="${trendIcon}"></i><span>${trendText}</span>`;
        }
        
        // Rescheduling trend
        const reschedulingTrendEl = document.getElementById('reschedulingParticipationTrend');
        if (reschedulingTrendEl) {
            const reschedulingRate = metrics.appointments?.rescheduling_rate_pct || 0;
            let trendClass, trendIcon, trendText;
            
            if (reschedulingRate === 0) {
                trendClass = 'trend-stable';
                trendIcon = 'fas fa-question';
                trendText = 'Sem dados';
            } else if (reschedulingRate <= 10) {
                trendClass = 'trend-up';
                trendIcon = 'fas fa-check';
                trendText = 'Boa estabilidade';
            } else if (reschedulingRate <= 25) {
                trendClass = 'trend-stable';
                trendIcon = 'fas fa-minus';
                trendText = 'Flexibilidade normal';
            } else {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-exclamation-triangle';
                trendText = 'Muitas remarcações';
            }
            
            reschedulingTrendEl.className = `metric-trend ${trendClass}`;
            reschedulingTrendEl.innerHTML = `<i class="${trendIcon}"></i><span>${trendText}</span>`;
        }
        
        // AI Interactions trend (se existir)
        const aiTrendEl = document.getElementById('aiParticipationTrend');
        if (aiTrendEl) {
            const aiParticipation = metrics.ai_interactions?.participation_pct || 0;
            let trendClass, trendIcon, trendText;
            
            if (aiParticipation >= 15) {
                trendClass = 'trend-up';
                trendIcon = 'fas fa-arrow-up';
                trendText = 'Alto engajamento';
            } else if (aiParticipation >= 5) {
                trendClass = 'trend-stable';
                trendIcon = 'fas fa-minus';
                trendText = 'Engajamento médio';
            } else if (aiParticipation > 0) {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-arrow-down';
                trendText = 'Baixo engajamento';
            } else {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-exclamation-triangle';
                trendText = 'Sem interações';
            }
            
            aiTrendEl.className = `metric-trend ${trendClass}`;
            aiTrendEl.innerHTML = `<i class="${trendIcon}"></i><span>${trendText}</span>`;
        }
        
        // Chat duration trend (se existir)
        const chatTimeTrendEl = document.getElementById('avgChatTimeTrend');
        if (chatTimeTrendEl) {
            const avgChatTime = metrics.ai_interactions?.avg_chat_duration_minutes || 0;
            let trendClass, trendIcon, trendText;
            
            if (avgChatTime >= 15) {
                trendClass = 'trend-up';
                trendIcon = 'fas fa-arrow-up';
                trendText = 'Conversas profundas';
            } else if (avgChatTime >= 5) {
                trendClass = 'trend-stable';
                trendIcon = 'fas fa-minus';
                trendText = 'Duração normal';
            } else if (avgChatTime > 0) {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-arrow-down';
                trendText = 'Conversas rápidas';
            } else {
                trendClass = 'trend-down';
                trendIcon = 'fas fa-exclamation-triangle';
                trendText = 'Sem dados';
            }
            
            chatTimeTrendEl.className = `metric-trend ${trendClass}`;
            chatTimeTrendEl.innerHTML = `<i class="${trendIcon}"></i><span>${trendText}</span>`;
        }
    }
    
    // Update additional metrics elements
    function updateAdditionalMetrics(metrics) {
        // Cancelamentos
        const cancellationEl = document.getElementById('cancellationParticipation');
        const cancellationSubEl = document.getElementById('cancellationParticipationSub');
        
        if (cancellationEl) {
            const cancellationRate = metrics.appointments?.cancellation_rate_pct;
            if (cancellationRate !== undefined && cancellationRate !== null) {
                cancellationEl.textContent = `${cancellationRate.toFixed(2)}%`;
            } else {
                cancellationEl.textContent = 'Sem dados';
            }
        }
        if (cancellationSubEl) {
            const cancellationRate = metrics.appointments?.cancellation_rate_pct;
            if (cancellationRate !== undefined && cancellationRate !== null) {
                cancellationSubEl.textContent = `Taxa de conclusão: ${(100 - cancellationRate).toFixed(1)}%`;
            } else {
                cancellationSubEl.textContent = 'Dados não disponíveis';
            }
        }
        
        // Remarcações
        const reschedulingEl = document.getElementById('reschedulingParticipation');
        const reschedulingSubEl = document.getElementById('reschedulingParticipationSub');
        
        if (reschedulingEl) {
            const reschedulingRate = metrics.appointments?.rescheduling_rate_pct;
            if (reschedulingRate !== undefined && reschedulingRate !== null) {
                reschedulingEl.textContent = `${reschedulingRate.toFixed(2)}%`;
            } else {
                reschedulingEl.textContent = 'Sem dados';
            }
        }
        if (reschedulingSubEl) {
            reschedulingSubEl.textContent = 'Flexibilidade de agendamento';
        }
        
        // Tempo médio de chat
        const avgChatTimeEl = document.getElementById('avgChatTime');
        const avgChatTimeSubEl = document.getElementById('avgChatTimeSub');
        
        if (avgChatTimeEl) {
            const chatTime = metrics.ai_interactions?.avg_chat_duration_minutes;
            if (chatTime !== undefined && chatTime !== null && chatTime > 0) {
                avgChatTimeEl.textContent = `${chatTime.toFixed(1)} min`;
            } else {
                avgChatTimeEl.textContent = 'Sem dados';
            }
        }
        if (avgChatTimeSubEl) {
            const platformChatTime = platformMetrics?.avg_chat_duration_minutes;
            if (platformChatTime !== undefined && platformChatTime !== null && platformChatTime > 0) {
                avgChatTimeSubEl.textContent = `vs ${platformChatTime.toFixed(1)} min da plataforma`;
            } else {
                avgChatTimeSubEl.textContent = 'Dados da plataforma não disponíveis';
            }
        }
        
        // IA
        const aiEl = document.getElementById('aiParticipation');
        const aiSubEl = document.getElementById('aiParticipationSub');
        
        if (aiEl) {
            aiEl.textContent = `${(metrics.ai_interactions?.participation_pct || 0).toFixed(2)}%`;
        }
        if (aiSubEl) {
            aiSubEl.textContent = `${metrics.ai_interactions?.count || 0} de ${platformMetrics?.total_ai_interactions || 0} interações`;
        }
        
        // Qualidade do telefone
        const phoneQualityEl = document.getElementById('phoneQuality');
        const phoneQualitySubEl = document.getElementById('phoneQualitySub');
        
        if (phoneQualityEl) {
            phoneQualityEl.textContent = `${(metrics.business_intelligence?.phone_quality_score || 0).toFixed(1)}%`;
        }
        if (phoneQualitySubEl) {
            phoneQualitySubEl.textContent = 'Detecção de spam';
        }
        
        // Ranking info
        const currentRankingEl = document.getElementById('currentRanking');
        const totalTenantsRankingEl = document.getElementById('totalTenantsRanking');
        const percentileEl = document.getElementById('percentile');
        
        if (currentRankingEl) {
            currentRankingEl.textContent = `#${metrics.ranking?.position || 0}`;
        }
        if (totalTenantsRankingEl) {
            totalTenantsRankingEl.textContent = platformMetrics?.total_active_tenants || 0;
        }
        if (percentileEl) {
            percentileEl.textContent = `${(metrics.ranking?.percentile || 0).toFixed(1)}%`;
        }
    }
    
    // Update platform metrics UI
    function updatePlatformMetricsUI(metrics) {
        console.log('🌍 Atualizando métricas da plataforma:', metrics);
        
        // Store platform metrics globally for tenant calculations
        platformMetrics = metrics;
        
        // Update last updated time
        const lastUpdatedEl = document.getElementById('lastUpdated');
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = new Date().toLocaleString('pt-BR');
        }
        
        // If tenant metrics are already loaded, update the UI to include platform totals
        if (tenantMetrics) {
            console.log('🔄 Re-atualizando UI do tenant com dados da plataforma');
            updateTenantMetricsUI(tenantMetrics);
        }
        
        console.log('✅ Métricas da plataforma armazenadas');
    }
    
    // Refresh metrics - usando nova API
    async function refreshMetrics() {
        try {
            console.log('🔄 Atualizando métricas...');
            
            // Show loading state
            const refreshBtn = document.getElementById('refreshMetricsBtn');
            const originalText = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
            refreshBtn.disabled = true;
            
            // Call refresh API
            const response = await fetch('/api/tenant-platform/calculate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('ubs_token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    period_days: 30,
                    tenant_id: currentTenant?.tenant_id || null
                })
            });
            
            if (!response.ok) {
                throw new Error('Erro ao atualizar métricas');
            }
            
            const data = await response.json();
            console.log('✅ Métricas atualizadas:', data);
            
            // Reload data
            if (currentTenant) {
                await loadTenantMetrics(currentTenant.tenant_id);
                await loadPlatformMetrics();
            }
            
            // Update last refresh time (don't set lastUpdated, use calculation_date)
            updateLastRefreshTime();
            
            // Show success message
            showSuccess('Métricas atualizadas com sucesso!');
            
        } catch (error) {
            console.error('❌ Erro ao atualizar métricas:', error);
            showError('Erro ao atualizar métricas');
        } finally {
            // Restore button state
            const refreshBtn = document.getElementById('refreshMetricsBtn');
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
            refreshBtn.disabled = false;
        }
    }
    
    // Update last refresh time
    function updateLastRefreshTime() {
        const element = document.getElementById('lastUpdate');
        if (!element) return;
        
        // CORREÇÃO: Sempre mostrar a data do último cron (calculation_date)
        if (tenantMetrics?.calculation_date) {
            const cronDate = new Date(tenantMetrics.calculation_date);
            const now = new Date();
            const diff = Math.floor((now - cronDate) / 1000);
            
            let timeText = '';
            if (diff < 60) {
                timeText = 'agora mesmo';
            } else if (diff < 3600) {
                const minutes = Math.floor(diff / 60);
                timeText = `há ${minutes} min`;
            } else if (diff < 86400) {
                const hours = Math.floor(diff / 3600);
                timeText = `há ${hours}h`;
            } else {
                const days = Math.floor(diff / 86400);
                timeText = `há ${days}d`;
            }
            
            element.textContent = `${cronDate.toLocaleDateString('pt-BR')} (${timeText})`;
        } else {
            element.textContent = 'Dados não disponíveis';
        }
    }
    
    // Setup event listeners
    function setupEventListeners() {
        // Tenant select change
        const tenantSelect = document.getElementById('tenantSelect');
        if (tenantSelect) {
            tenantSelect.addEventListener('change', async (e) => {
                const tenantId = e.target.value;
                if (tenantId) {
                    await selectTenant(tenantId);
                } else {
                    currentTenant = null;
                    // Hide metrics content and show warning
                    const metricsContent = document.getElementById('businessInfoCard');
                    const noTenantAlert = document.getElementById('noTenantAlert');
                    if (metricsContent) metricsContent.style.display = 'none';
                    if (noTenantAlert) noTenantAlert.style.display = 'block';
                }
            });
        }
        
        // Period select change
        const periodSelect = document.getElementById('periodSelect');
        if (periodSelect) {
            periodSelect.addEventListener('change', async (e) => {
                const newPeriod = parseInt(e.target.value);
                if (newPeriod && currentTenant) {
                    currentPeriod = newPeriod;
                    console.log(`📅 Período alterado para ${newPeriod} dias`);
                    
                    // Reload data for current tenant with new period
                    await selectTenant(currentTenant.id);
                }
            });
        }
        
        // Refresh button
        const refreshBtn = document.getElementById('refreshMetricsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', refreshMetrics);
        }
        
        // Dashboard button
        const dashboardBtn = document.getElementById('backToDashboard');
        if (dashboardBtn) {
            dashboardBtn.addEventListener('click', () => {
                window.location.href = '/dashboard-standardized.html';
            });
        }
        
        // Update refresh time every 30 seconds
        setInterval(updateLastRefreshTime, 30000);
    }
    
    // Update charts
    function updateCharts() {
        if (!tenantMetrics || !platformMetrics) {
            console.log('⚠️ Dados insuficientes para gráficos:', { tenantMetrics: !!tenantMetrics, platformMetrics: !!platformMetrics });
            return;
        }
        
        console.log('📊 Atualizando gráficos...');
        
        // Revenue evolution chart
        updateRevenueEvolutionChart();
        
        // Services distribution chart
        updateServicesChart();
        
        // Appointments chart
        updateAppointmentsChart();
        
        // Customers chart
        updateCustomersChart();
        
        // Ranking chart
        updateRankingChart();
        
        // Performance comparison chart
        updatePerformanceChart();
    }
    
    // Update revenue evolution chart
    function updateRevenueEvolutionChart() {
        const ctx = document.getElementById('revenueEvolutionChart')?.getContext('2d');
        if (!ctx) return;
        
        // Destroy existing chart
        if (charts.revenueEvolution) {
            charts.revenueEvolution.destroy();
        }
        
        // Get real tenant revenue data
        const tenantRevenue = tenantMetrics.revenue?.participation_value || 0;
        
        // Generate realistic 6-month progression based on current revenue
        const monthlyData = [];
        const currentMonth = new Date().getMonth();
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const labels = [];
        
        // Get last 6 months
        for (let i = 5; i >= 0; i--) {
            const monthIndex = (currentMonth - i + 12) % 12;
            labels.push(months[monthIndex]);
            // Calculate progressive revenue (assuming growth pattern)
            const progressFactor = (6 - i) / 6; // 0.17 to 1.0
            monthlyData.push(tenantRevenue * progressFactor);
        }
        
        // Create new chart
        charts.revenueEvolution = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Receita do Tenant',
                    data: monthlyData,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toFixed(2);
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': R$ ' + context.parsed.y.toLocaleString('pt-BR');
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Update services distribution chart
    function updateServicesChart() {
        const ctx = document.getElementById('servicesChart')?.getContext('2d');
        if (!ctx) return;
        
        // Destroy existing chart
        if (charts.services) {
            charts.services.destroy();
        }
        
        // Show placeholder for services data - no real data available
        const servicesData = [
            { label: 'Dados de Serviços', value: 1 },
            { label: 'Não Disponíveis', value: 0 }
        ];
        
        const total = servicesData.reduce((sum, item) => sum + item.value, 0);
        
        charts.services = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: servicesData.map(item => item.label),
                datasets: [{
                    data: servicesData.map(item => item.value),
                    backgroundColor: [
                        '#007bff',
                        '#28a745', 
                        '#ffc107',
                        '#dc3545',
                        '#6c757d'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return context.label + ': ' + context.parsed + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Update appointments chart
    function updateAppointmentsChart() {
        const ctx = document.getElementById('appointmentsChart')?.getContext('2d');
        if (!ctx) return;
        
        // Destroy existing chart
        if (charts.appointments) {
            charts.appointments.destroy();
        }
        
        // Get real appointment data from tenant metrics
        const appointmentsCount = tenantMetrics.appointments?.count || 0;
        const currentMonth = new Date().getMonth();
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const timeLabels = [];
        
        // Get last 6 months labels
        for (let i = 5; i >= 0; i--) {
            const monthIndex = (currentMonth - i + 12) % 12;
            timeLabels.push(months[monthIndex]);
        }
        
        // Generate progressive data based on current total
        const agendamentos = [];
        const cancelamentos = [];
        const remarcacoes = [];
        
        for (let i = 0; i < 6; i++) {
            const progressFactor = (i + 1) / 6; // Progressive growth
            const monthlyAppointments = Math.floor(appointmentsCount * progressFactor / 6);
            
            agendamentos.push(monthlyAppointments);
            // Use real cancellation/rescheduling rates if available, otherwise 0
            const realCancelRate = tenantMetrics.appointments?.cancellation_rate_pct || 0;
            const realReschedRate = tenantMetrics.appointments?.rescheduling_rate_pct || 0;
            
            cancelamentos.push(Math.floor(monthlyAppointments * (realCancelRate / 100)));
            remarcacoes.push(Math.floor(monthlyAppointments * (realReschedRate / 100)));
        }
        
        // Create new line chart
        charts.appointments = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timeLabels,
                datasets: [{
                    label: 'Agendamentos',
                    data: agendamentos,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    tension: 0.4,
                    fill: false
                }, {
                    label: 'Cancelamentos',
                    data: cancelamentos,
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    tension: 0.4,
                    fill: false
                }, {
                    label: 'Remarc\u00e7\u00f5es',
                    data: remarcacoes,
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    tension: 0.4,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }
    
    // Update customers chart
    function updateCustomersChart() {
        const ctx = document.getElementById('customersChart')?.getContext('2d');
        if (!ctx) return;
        
        // Destroy existing chart
        if (charts.customers) {
            charts.customers.destroy();
        }
        
        // Generate realistic customer growth data based on current count
        const currentCustomers = tenantMetrics.customers?.count || 0;
        const currentMonth = new Date().getMonth();
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const labels = [];
        const data = [];
        
        // Get last 6 months
        for (let i = 5; i >= 0; i--) {
            const monthIndex = (currentMonth - i + 12) % 12;
            labels.push(months[monthIndex]);
            
            // Calculate progressive customer growth
            const progressFactor = (6 - i) / 6; // 0.17 to 1.0
            const monthlyCustomers = Math.floor(currentCustomers * progressFactor);
            data.push(monthlyCustomers);
        }
        
        // Create new chart
        charts.customers = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Clientes',
                    data: data,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.2)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
    
    // Update ranking chart
    function updateRankingChart() {
        const ctx = document.getElementById('rankingChart')?.getContext('2d');
        if (!ctx) return;
        
        // Destroy existing chart
        if (charts.ranking) {
            charts.ranking.destroy();
        }
        
        // Get real ranking data
        const myRanking = tenantMetrics?.ranking?.position || 5;
        const myParticipation = tenantMetrics?.revenue?.participation_pct || 0;
        const totalTenants = platformMetrics?.total_active_tenants || 7;
        
        // Calculate distribution for top positions
        const remainingPercentage = 100 - myParticipation;
        const topPositions = Math.min(3, totalTenants - 1);
        
        const labels = [];
        const data = [];
        const colors = [];
        
        // Add top positions
        for (let i = 1; i <= topPositions; i++) {
            if (i !== myRanking) {
                labels.push(`Top ${i}`);
                // Distribute remaining percentage among top positions
                const positionShare = remainingPercentage / (totalTenants - 1) * (topPositions - i + 2);
                data.push(positionShare);
                colors.push(i === 1 ? '#ffd700' : i === 2 ? '#c0c0c0' : '#cd7f32');
            }
        }
        
        // Add my position
        labels.push(`Minha Posição (#${myRanking})`);
        data.push(myParticipation);
        colors.push('#007bff');
        
        // Add others if needed
        if (totalTenants > topPositions + 1) {
            const othersShare = remainingPercentage - data.slice(0, -1).reduce((sum, val) => sum + val, 0);
            if (othersShare > 0) {
                labels.push('Outros');
                data.push(Math.max(0, othersShare));
                colors.push('#6c757d');
            }
        }
        
        charts.ranking = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Participação %',
                    data: data,
                    backgroundColor: colors
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
    
    // Update performance comparison chart
    function updatePerformanceChart() {
        const ctx = document.getElementById('performanceChart')?.getContext('2d');
        if (!ctx) return;
        
        // Destroy existing chart
        if (charts.performance) {
            charts.performance.destroy();
        }
        
        // Get real metrics from API data
        const aiParticipation = tenantMetrics.ai_interactions?.participation_pct || 0;
        
        // Get real chat time data - no fallback values
        const avgChatTime = tenantMetrics.avg_chat_duration_minutes || 0;
        const platformAvgChatTime = platformMetrics?.avg_chat_duration_minutes || 0;
        const chatTimeParticipation = (platformAvgChatTime > 0 && avgChatTime > 0) ? 
            Math.min(100, (avgChatTime / platformAvgChatTime) * 100) : 0;
        
        // Get real cancellation and rescheduling rates - show 0 if no data available
        const cancellationRate = tenantMetrics.appointments?.cancellation_rate_pct || 0;
        const reschedulingRate = tenantMetrics.appointments?.rescheduling_rate_pct || 0;
        const customersParticipation = tenantMetrics.customers?.participation_pct || 0;
        
        // Create new chart with 5 different metrics and colors
        charts.performance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['IA Interações', 'Tempo Chat', 'Cancelamentos', 'Remarcções', 'Clientes'],
                datasets: [{
                    label: 'Métricas (%)',
                    data: [
                        aiParticipation,
                        chatTimeParticipation,
                        100 - cancellationRate, // Inverted: higher is better
                        100 - reschedulingRate, // Inverted: higher is better  
                        customersParticipation
                    ],
                    backgroundColor: [
                        '#28a745', // Green for AI interactions
                        '#17a2b8', // Teal for chat time
                        '#ffc107', // Yellow for cancellations (inverted)
                        '#fd7e14', // Orange for rescheduling (inverted)
                        '#6f42c1'  // Purple for customers
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const labels = ['IA Interações', 'Tempo Chat', 'Cancelamentos', 'Remarcções', 'Clientes'];
                                const label = labels[context.dataIndex];
                                const value = context.parsed.y;
                                
                                switch(context.dataIndex) {
                                    case 0: return `${label}: ${aiParticipation.toFixed(2)}% da plataforma`;
                                    case 1: return `${label}: ${avgChatTime.toFixed(1)} min (${value.toFixed(0)}% vs plataforma)`;
                                    case 2: return `${label}: ${cancellationRate.toFixed(1)}% taxa (${value.toFixed(0)}% qualidade)`;
                                    case 3: return `${label}: ${reschedulingRate.toFixed(1)}% taxa (${value.toFixed(0)}% estabilidade)`;
                                    case 4: return `${label}: ${customersParticipation.toFixed(2)}% da plataforma`;
                                    default: return `${value.toFixed(2)}%`;
                                }
                            }
                        }
                    }
                }
            }
        });
    }
    
    // updateTrendChart function removed - was using mock data
    
    // Utility functions
    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value || 0);
    }
    
    function formatNumber(value) {
        return new Intl.NumberFormat('pt-BR').format(value || 0);
    }
    
    function showError(message) {
        console.error('❌', message);
        
        // Criar notificação visual de erro
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger alert-dismissible fade show position-fixed';
        errorDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
        errorDiv.innerHTML = `
            <strong>Erro!</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        document.body.appendChild(errorDiv);
        
        // Remover após 5 segundos
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }
    
    function showSuccess(message) {
        console.log('✅', message);
        
        // Criar notificação visual de sucesso
        const successDiv = document.createElement('div');
        successDiv.className = 'alert alert-success alert-dismissible fade show position-fixed';
        successDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
        successDiv.innerHTML = `
            <strong>Sucesso!</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        document.body.appendChild(successDiv);
        
        // Remover após 3 segundos
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 3000);
    }
    
    function showWarning(message) {
        console.warn('⚠️', message);
        
        // Criar notificação visual de aviso
        const warningDiv = document.createElement('div');
        warningDiv.className = 'alert alert-warning alert-dismissible fade show position-fixed';
        warningDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
        warningDiv.innerHTML = `
            <strong>Aviso!</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        document.body.appendChild(warningDiv);
        
        // Remover após 3 segundos
        setTimeout(() => {
            if (warningDiv.parentNode) {
                warningDiv.parentNode.removeChild(warningDiv);
            }
        }, 3000);
    }
    
    // Change period function
    function changePeriod(days, label) {
        currentPeriod = days;
        
        // Update UI
        document.getElementById('selectedPeriod').textContent = label;
        
        // Update active state
        document.querySelectorAll('#periodDropdown + .dropdown-menu .dropdown-item').forEach(item => {
            item.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Reload data with new period
        if (currentTenant) {
            loadTenantMetrics(currentTenant.id);
        }
        
        // Reload platform data
        loadPlatformMetrics();
    }
    
    // Refresh current tenant function - now triggers cron
    async function refreshCurrentTenant() {
        if (!currentTenant) {
            showWarning('Nenhum tenant selecionado para atualizar');
            return;
        }

        const refreshBtn = document.querySelector('button[onclick="refreshCurrentTenant()"]');
        
        try {
            // Update button state
            if (refreshBtn) {
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Executando Cron...';
                refreshBtn.disabled = true;
            }

            console.log('🔄 Executando cron job para atualizar métricas...');
            
            const token = localStorage.getItem('ubs_token');
            if (!token) {
                throw new Error('Token de autenticação não encontrado');
            }

            // Call cron trigger API
            const response = await fetch('/api/tenant-platform/trigger-cron', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    job_type: 'daily-metrics'
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Erro ${response.status}: ${errorData.error || 'Erro ao executar cron'}`);
            }

            const cronResult = await response.json();
            console.log('✅ Cron executado com sucesso:', cronResult);

            // Wait a moment for data to be processed
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Reload tenant data with fresh metrics
            console.log('🔄 Recarregando dados do tenant:', currentTenant.id);
            await selectTenant(currentTenant.id);

            showSuccess('Dados atualizados com sucesso! Cron executado.');

        } catch (error) {
            console.error('❌ Erro ao executar cron e atualizar dados:', error);
            showError(`Erro ao atualizar dados: ${error.message}`);
        } finally {
            // Restore button state
            if (refreshBtn) {
                refreshBtn.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Atualizar Dados';
                refreshBtn.disabled = false;
            }
        }
    }
    
    // Update ranking info
    function updateRankingInfo() {
        const ranking = tenantMetrics?.ranking?.position || 0;
        const totalTenants = platformMetrics?.total_active_tenants || 7;
        const percentile = ranking > 0 ? Math.round(((totalTenants - ranking + 1) / totalTenants) * 100) : 0;
        
        // Update ranking display
        const currentRankingEl = document.getElementById('currentRanking');
        const totalTenantsEl = document.getElementById('totalTenantsRanking');
        const percentileEl = document.getElementById('percentile');
        const rankingProgressEl = document.getElementById('rankingProgress');
        const rankingCardTitleEl = document.getElementById('rankingCardTitle');
        
        if (currentRankingEl && ranking > 0) {
            currentRankingEl.textContent = `#${ranking}`;
        }
        
        if (totalTenantsEl) {
            totalTenantsEl.textContent = totalTenants;
        }
        
        if (percentileEl) {
            percentileEl.textContent = `${percentile}%`;
        }
        
        if (rankingProgressEl) {
            rankingProgressEl.style.width = `${percentile}%`;
        }
        
        // Update card title with percentile
        if (rankingCardTitleEl && ranking > 0) {
            rankingCardTitleEl.innerHTML = `
                <i class="fas fa-medal me-2"></i>
                Posição no Ranking da Plataforma (${percentile}%)
            `;
        }
    }
    
    // Load top tenants from API
    async function loadTopTenants() {
        try {
            const token = localStorage.getItem('ubs_token');
            if (!token) return;
            
            const response = await fetch('/api/tenant-platform/rankings?period=30&limit=5', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) return;
            
            const data = await response.json();
            if (data.success && data.data?.rankings) {
                updateTopTenantsList(data.data.rankings);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar top tenants:', error);
        }
    }
    
    // Update top tenants list
    function updateTopTenantsList(rankings) {
        const listEl = document.getElementById('topTenantsList');
        if (!listEl) return;
        
        const html = rankings.map((tenant, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
            const isCurrentTenant = tenant.tenant_id === currentTenant?.id;
            const highlightClass = isCurrentTenant ? 'list-group-item-primary' : '';
            
            return `
                <div class="list-group-item d-flex justify-content-between align-items-center ${highlightClass}">
                    <div>
                        <div class="fw-semibold">${medal} ${tenant.tenant_name}</div>
                        <small class="text-muted">${tenant.domain}</small>
                    </div>
                    <div class="text-end">
                        <div class="fw-semibold">${tenant.revenue_participation.toFixed(2)}%</div>
                        <small class="text-muted">R$ ${tenant.revenue_value.toLocaleString('pt-BR')}</small>
                    </div>
                </div>
            `;
        }).join('');
        
        listEl.innerHTML = html;
    }
    
    // Update insights
    function updateInsights() {
        const insightsEl = document.getElementById('keyInsights');
        if (!insightsEl) return;
        
        const revenueParticipation = tenantMetrics?.revenue?.participation_pct || 0;
        const appointmentsParticipation = tenantMetrics?.appointments?.participation_pct || 0;
        const customersParticipation = tenantMetrics?.customers?.participation_pct || 0;
        
        let insights = [];
        
        // Revenue insights
        if (revenueParticipation >= 20) {
            insights.push('💰 Forte contribuição de receita na plataforma');
        } else if (revenueParticipation < 5) {
            insights.push('📈 Oportunidade de crescimento em receita');
        }
        
        // Customer insights
        if (customersParticipation >= 25) {
            insights.push('👥 Base sólida de clientes');
        } else if (customersParticipation >= 15) {
            insights.push('👤 Base de clientes em crescimento');
        }
        
        // Appointments insights
        if (appointmentsParticipation >= 20) {
            insights.push('📅 Alto volume de agendamentos');
        } else if (appointmentsParticipation < 10) {
            insights.push('📊 Potencial para mais agendamentos');
        }
        
        // Performance comparison
        const avgParticipation = (revenueParticipation + appointmentsParticipation + customersParticipation) / 3;
        if (avgParticipation >= 20) {
            insights.push('⭐ Desempenho acima da média');
        } else if (avgParticipation < 10) {
            insights.push('🎯 Foque em estratégias de crescimento');
        }
        
        const html = insights.length > 0 ? insights.map(insight => `
            <div class="mb-3 p-3 bg-light rounded">
                <div class="fw-semibold text-primary">${insight}</div>
            </div>
        `).join('') : `
            <div class="text-center py-4">
                <i class="fas fa-lightbulb fa-2x text-muted mb-3"></i>
                <p class="text-muted mb-0">Carregando insights...</p>
            </div>
        `;
        
        insightsEl.innerHTML = html;
    }
    
    // Make functions globally available
    window.changePeriod = changePeriod;
    window.refreshCurrentTenant = refreshCurrentTenant;
    
})();