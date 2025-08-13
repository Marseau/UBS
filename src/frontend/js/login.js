document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const submitButton = document.getElementById('loginBtn');
    const alertBox = document.getElementById('alert-placeholder');

    const hideAlert = () => {
        if (alertBox) {
            alertBox.style.display = 'none';
            alertBox.innerHTML = '';
        }
    };

    const showAlert = (message, type = 'danger') => {
        if (!alertBox) return;
        const alertContent = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        alertBox.innerHTML = alertContent;
        alertBox.style.display = 'block';
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        hideAlert();
        submitButton.disabled = true;
        submitButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Entrando...`;

        const email = emailInput.value;
        const password = passwordInput.value;

        try {
            const response = await fetch('/api/admin/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error('Suas credenciais não são válidas. Tente novamente.');
            }

            // Store token and user data consistently with registration flow
            localStorage.setItem('ubs_token', result.token);
            localStorage.setItem('ubs_user', JSON.stringify(result.user));
            
            // Redirect based on user role
            if (result.user.role === 'super_admin') {
                window.location.href = '/dashboard-standardized';
            } else {
                window.location.href = '/dashboard-tenant-admin';
            }

        } catch (error) {
            showAlert(error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Entrar';
        }
    };

    // CRITICAL FIX: Clear any stale alerts from other pages on load
    localStorage.removeItem('error_message');
    hideAlert();
    
    // Check for registration success message
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('registered')) {
        showAlert('Conta criada com sucesso! Por favor, faça o login.', 'success');
    }
    
    loginForm.addEventListener('submit', handleLogin);
});