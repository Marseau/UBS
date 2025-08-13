// Fix Token Compatibility - Ensure dashboard can access correct token
console.log('🔧 Checking token compatibility...');

// Check all possible token storage locations
const tokenSources = ['token', 'adminToken', 'ubs_token'];
let foundToken = null;
let tokenSource = null;

for (const source of tokenSources) {
    const token = localStorage.getItem(source);
    if (token) {
        foundToken = token;
        tokenSource = source;
        console.log(`✅ Found token in: ${source}`);
        break;
    }
}

if (foundToken) {
    // Ensure token is available in all expected locations
    localStorage.setItem('adminToken', foundToken);
    localStorage.setItem('ubs_token', foundToken);
    localStorage.setItem('token', foundToken);
    
    console.log('✅ Token synchronized across all storage keys');
    
    // Test API access
    fetch('/api/admin/user-info', {
        headers: { 'Authorization': `Bearer ${foundToken}` }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('✅ Token is valid, API access working');
            console.log('👤 User:', data.data.email, '- Role:', data.data.role);
            
            // Force dashboard refresh
            if (window.refreshDashboardData) {
                console.log('🔄 Refreshing dashboard with valid token...');
                window.refreshDashboardData();
            }
        } else {
            console.error('❌ Token validation failed:', data);
        }
    })
    .catch(error => {
        console.error('❌ API test failed:', error);
    });
    
} else {
    console.error('❌ No valid token found in any storage location');
    console.log('📍 Available localStorage keys:', Object.keys(localStorage));
    
    // Redirect to login if no token
    if (window.location.pathname.includes('dashboard')) {
        console.log('🔄 Redirecting to login...');
        window.location.href = '/login.html';
    }
}