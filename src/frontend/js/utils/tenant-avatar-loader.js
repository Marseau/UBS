// Universal tenant avatar loader
// Carrega dados reais do tenant para o avatar em todas as páginas

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
            const tenant = userInfo.data;

            if (tenant) {
                // Atualizar avatar com dados reais do tenant
                const avatarElement = document.getElementById('userAvatar');
                const nameElement = document.getElementById('userName');
                const roleElement = document.getElementById('userRole');

                const businessName = tenant.business_name || tenant.name;

                if (avatarElement && businessName) {
                    avatarElement.textContent = businessName.substring(0, 2).toUpperCase();
                }

                if (nameElement && businessName) {
                    nameElement.textContent = businessName;
                }

                if (roleElement && tenant.domain) {
                    const domainLabels = {
                        'beauty': 'Salão de Beleza',
                        'healthcare': 'Clínica de Saúde',
                        'legal': 'Escritório Jurídico',
                        'education': 'Educação',
                        'sports': 'Academia/Esportes',
                        'consulting': 'Consultoria'
                    };
                    roleElement.textContent = domainLabels[tenant.domain] || 'Administrador';
                }

                console.log('✅ Avatar carregado:', businessName);
            } else {
                console.warn('⚠️ Dados do tenant não encontrados na resposta');
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