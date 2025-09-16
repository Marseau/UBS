// Universal tenant avatar loader - V2 (FIXED)
// Carrega dados reais do tenant para o avatar em todas as páginas
console.log('🔄 Tenant Avatar Loader V2 carregado!');

async function loadTenantAvatar() {
    try {
        const token = localStorage.getItem('ubs_token');
        if (!token) {
            console.warn('⚠️ Token não encontrado para carregar avatar');
            return;
        }

        const response = await fetch('/api/admin/user-info', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const userInfo = await response.json();
            const user = userInfo.data;

            if (user) {
                // Atualizar avatar com dados do usuário (super admin ou tenant admin)
                const avatarElement = document.getElementById('userAvatar');
                const nameElement = document.getElementById('userName');
                const roleElement = document.getElementById('userRole');

                const displayName = user.name || user.business_name;
                const userRole = user.role;

                if (avatarElement && displayName) {
                    avatarElement.textContent = displayName.substring(0, 2).toUpperCase();
                }

                if (nameElement && displayName) {
                    nameElement.textContent = displayName;
                }

                if (roleElement) {
                    if (userRole === 'super_admin') {
                        roleElement.textContent = 'Super Administrador';
                    } else if (userRole === 'tenant_admin') {
                        if (user.domain) {
                            const domainLabels = {
                                'beauty': 'Salão de Beleza',
                                'healthcare': 'Clínica de Saúde',
                                'legal': 'Escritório Jurídico',
                                'education': 'Educação',
                                'sports': 'Academia/Esportes',
                                'consulting': 'Consultoria'
                            };
                            roleElement.textContent = domainLabels[user.domain] || 'Administrador do Tenant';
                        } else {
                            roleElement.textContent = 'Administrador do Tenant';
                        }
                    } else {
                        roleElement.textContent = 'Administrador';
                    }
                }

                console.log('✅ Avatar carregado:', displayName, 'Role:', userRole);
                console.log('🎯 Avatar element:', avatarElement);
                console.log('🎯 Name element:', nameElement);
                console.log('🎯 Role element:', roleElement);
            } else {
                console.warn('⚠️ Dados do usuário não encontrados na resposta');
            }
        } else {
            console.error('❌ Erro ao carregar dados do tenant:', response.status);
        }
    } catch (error) {
        console.error('❌ Erro na API call para dados do tenant:', error);
    }
}

// Carregar avatar quando a página carrega
document.addEventListener('DOMContentLoaded', function() {
    // Aguardar um pouco para garantir que secure-auth.js carregou
    setTimeout(loadTenantAvatar, 100);
});

// Também disponibilizar a função globalmente
window.loadTenantAvatar = loadTenantAvatar;