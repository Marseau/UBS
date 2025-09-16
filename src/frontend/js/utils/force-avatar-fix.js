// FORCE AVATAR FIX - Solução definitiva para problema de avatar
console.log('🚀 FORCE AVATAR FIX carregado!');

// Força atualização do avatar de tenant admin
function forceUpdateTenantAvatar() {
    console.log('🔧 Iniciando força atualização do avatar...');

    try {
        const token = localStorage.getItem('ubs_token');
        if (!token) {
            console.warn('⚠️ Token não encontrado');
            return;
        }

        // Decode do token para pegar informações
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('👤 Token payload:', payload);

        if (payload.role === 'tenant_admin') {
            // Buscar dados reais do tenant
            fetch('/api/admin/user-info', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                console.log('📊 Dados recebidos da API:', data);

                if (data.data) {
                    const user = data.data;
                    const businessName = user.business_name || user.name;

                    // Força atualização dos elementos
                    const avatarEl = document.getElementById('userAvatar');
                    const nameEl = document.getElementById('userName');
                    const roleEl = document.getElementById('userRole');

                    if (avatarEl && businessName) {
                        avatarEl.textContent = businessName.substring(0, 2).toUpperCase();
                        avatarEl.style.backgroundColor = '#007bff';
                        avatarEl.style.color = 'white';
                        console.log('✅ Avatar forçado:', businessName.substring(0, 2).toUpperCase());
                    }

                    if (nameEl && businessName) {
                        nameEl.textContent = businessName;
                        console.log('✅ Nome forçado:', businessName);
                    }

                    if (roleEl && user.domain) {
                        const domainLabels = {
                            'beauty': 'Salão de Beleza',
                            'healthcare': 'Clínica de Saúde',
                            'legal': 'Escritório Jurídico',
                            'education': 'Educação',
                            'sports': 'Academia/Esportes',
                            'consulting': 'Consultoria'
                        };
                        roleEl.textContent = domainLabels[user.domain] || 'Administrador do Tenant';
                        console.log('✅ Role forçado:', domainLabels[user.domain] || 'Administrador do Tenant');
                    }

                    // Marcar como fixado para evitar sobrescrita
                    document.body.setAttribute('data-avatar-fixed', 'true');
                    console.log('🎯 Avatar definitivamente fixado!');
                }
            })
            .catch(error => {
                console.error('❌ Erro ao buscar dados:', error);
            });
        }
    } catch (error) {
        console.error('❌ Erro no force avatar fix:', error);
    }
}

// Executar imediatamente
forceUpdateTenantAvatar();

// Executar com delay
setTimeout(forceUpdateTenantAvatar, 1000);
setTimeout(forceUpdateTenantAvatar, 2000);
setTimeout(forceUpdateTenantAvatar, 3000);

// Disponibilizar globalmente
window.forceUpdateTenantAvatar = forceUpdateTenantAvatar;

console.log('🔧 Force Avatar Fix inicializado com execução múltipla');