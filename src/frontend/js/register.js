document.addEventListener('DOMContentLoaded', () => {
    // --- URL PARAMETERS & CONTEXT DETECTION ---
    const urlParams = new URLSearchParams(window.location.search);
    const referrer = document.referrer;
    
    // Detect entry context
    const detectedContext = {
        plan: urlParams.get('plan') || 'trial',
        domain: urlParams.get('domain') || null,
        source: urlParams.get('source') || 'direct',
        hasContext: urlParams.has('plan') || urlParams.has('domain') || referrer.includes('domain-details')
    };
    
    // --- STATE MANAGEMENT ---
    let currentStep = 1;
    const formData = {
        plan: detectedContext.plan
    };
    
    // Pre-fill domain if provided
    if (detectedContext.domain) {
        formData.domain = detectedContext.domain;
    }

    // --- DOM ELEMENTS ---
    const steps = document.querySelectorAll('.step');
    const formSteps = document.querySelectorAll('.form-step');
    const alertBox = document.getElementById('alert-box');

    // Step 1: Account
    const accountForm = document.getElementById('accountForm');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const documentInput = document.getElementById('document');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const continueToBusinessBtn = document.getElementById('continue-to-business');

    // Step 2: Business
    const businessForm = document.getElementById('businessForm');
    const businessNameInput = document.getElementById('businessName');
    const businessDescriptionInput = document.getElementById('businessDescription');
    const domainGrid = document.getElementById('domainGrid');
    const continueToPlanBtn = document.getElementById('continue-to-plan');
    const backToAccountBtn = document.getElementById('back-to-account');

    // Step 3: Plan
    const startTrialBtn = document.getElementById('start-trial-btn');
    const backToBusinessBtn = document.getElementById('back-to-business');

    // --- UTILITY FUNCTIONS ---
    
    const hideAlert = () => {
        if (alertBox) {
            alertBox.style.display = 'none';
            alertBox.innerHTML = '';
        }
    };
    
    const showAlert = (message, type = 'danger') => {
        const alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) return;
        
        const alertContent = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        alertContainer.innerHTML = alertContent;
    };

    const updateStepIndicator = (stepNumber) => {
        steps.forEach((step, index) => {
            const circle = step.querySelector('.step-circle');
            step.classList.remove('active', 'completed');
            if (index < stepNumber - 1) {
                step.classList.add('completed');
                circle.innerHTML = '<i class="fas fa-check"></i>';
            } else if (index === stepNumber - 1) {
                step.classList.add('active');
                circle.textContent = index + 1;
            } else {
                circle.textContent = index + 1;
            }
        });
    };
    
    const goToStep = (stepNumber) => {
        hideAlert();
        currentStep = stepNumber;
        formSteps.forEach(formStep => formStep.classList.remove('active'));
        document.getElementById(`step-${stepNumber}`).classList.add('active');
        updateStepIndicator(stepNumber);
    };

    // --- INPUT MASKING ---
    let phoneMask, documentMask;
    
    if (phoneInput) {
        phoneMask = IMask(phoneInput, {
            mask: [
                { mask: '(00) 0000-0000' },
                { mask: '(00) 00000-0000' }
            ]
        });
    }
    
    if (documentInput) {
        documentMask = IMask(documentInput, {
            mask: [
                { mask: '000.000.000-00' }, // CPF
                { mask: '00.000.000/0000-00' } // CNPJ
            ]
        });
    }

    // --- EVENT HANDLERS ---
    
    const handleStep1Submit = (e) => {
        e.preventDefault();
        if (passwordInput.value !== confirmPasswordInput.value) {
            showAlert('As senhas não conferem.');
            return;
        }
        if (passwordInput.value.length < 8) {
             showAlert('A senha deve ter pelo menos 8 caracteres.');
            return;
        }

        Object.assign(formData, {
            firstName: firstNameInput.value,
            lastName: lastNameInput.value,
            email: emailInput.value,
            phone: phoneMask ? phoneMask.unmaskedValue : phoneInput.value,
            document: documentMask ? documentMask.unmaskedValue : documentInput.value,
            password: passwordInput.value
        });
        
        goToStep(2);
    };
    
    const handleStep2Submit = (e) => {
        e.preventDefault();
        // Get selected domain
        const selectedDomain = document.querySelector('.domain-option.selected');
        if (!selectedDomain) {
            showAlert('Por favor, selecione o segmento do seu negócio.');
            return;
        }
        
        Object.assign(formData, {
            businessName: businessNameInput.value,
            businessDescription: businessDescriptionInput.value,
            domain: selectedDomain.dataset.domain
        });
        goToStep(3);
    };

    const handleFinalSubmit = async () => {
        hideAlert();
        startTrialBtn.disabled = true;
        startTrialBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Criando sua conta...';

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Ocorreu um erro desconhecido.');
            }
            
            // Mock successful registration and simulate login
            logger?.log('Registration completed successfully!');
            showAlert('Conta criada com sucesso! Redirecionando para seu dashboard...', 'success');
            
            // Simulate login token for new user
            const mockToken = 'mock_jwt_token_' + Date.now();
            const mockUser = {
                id: result.user?.id || 'user_' + Date.now(),
                email: result.user?.email || formData.email,
                firstName: formData.firstName,
                lastName: formData.lastName,
                role: 'tenant_admin', // New user is tenant admin
                tenantId: result.user?.tenantId || 'tenant_' + Date.now()
            };
            
            // Store auth data in localStorage
            localStorage.setItem('ubs_token', mockToken);
            localStorage.setItem('ubs_user', JSON.stringify(mockUser));
            
            // Redirect to tenant dashboard after 2 seconds
            setTimeout(() => {
                window.location.href = '/admin?newUser=true&setup=true';
            }, 2000);

        } catch (error) {
            showAlert(error.message || 'Erro de conexão. Tente novamente.');
        } finally {
            startTrialBtn.disabled = false;
            startTrialBtn.textContent = 'Começar Teste Grátis';
        }
    };

    // --- DOMAIN SELECTION ---
    const handleDomainSelection = () => {
        const domainOptions = document.querySelectorAll('.domain-option');
        
        // Pre-select domain if coming with context
        if (detectedContext.domain) {
            const preSelectedDomain = document.querySelector(`[data-domain="${detectedContext.domain}"]`);
            if (preSelectedDomain) {
                preSelectedDomain.classList.add('selected');
                // If domain is pre-selected and we have full context, consider skipping to step 3
                if (detectedContext.hasContext && detectedContext.plan) {
                    // Mark step 2 as completed in UI
                    updateStepIndicator(3);
                }
            }
        }
        
        domainOptions.forEach(option => {
            option.addEventListener('click', () => {
                domainOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });
        });
    };

    // --- ATTACH EVENT LISTENERS ---
    if (accountForm) accountForm.addEventListener('submit', handleStep1Submit);
    if (businessForm) businessForm.addEventListener('submit', handleStep2Submit);
    
    if (continueToBusinessBtn) continueToBusinessBtn.addEventListener('click', () => accountForm.requestSubmit());
    if (continueToPlanBtn) continueToPlanBtn.addEventListener('click', () => businessForm.requestSubmit());

    if (backToAccountBtn) backToAccountBtn.addEventListener('click', () => goToStep(1));
    if (backToBusinessBtn) backToBusinessBtn.addEventListener('click', () => goToStep(2));
    
    if (startTrialBtn) startTrialBtn.addEventListener('click', handleFinalSubmit);
    
    handleDomainSelection();

    // --- GLOBAL FUNCTIONS ---
    window.nextStep = (step) => {
        if (step === 2) {
            accountForm.requestSubmit();
        } else if (step === 3) {
            businessForm.requestSubmit();
        }
    };
    
    window.previousStep = (step) => {
        goToStep(step);
    };
    
    window.togglePassword = (inputId) => {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(inputId + 'ToggleIcon');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    };

    // --- CONTEXT-AWARE INITIALIZATION ---
    const initializeWithContext = () => {
        // Clear any existing error messages when starting fresh
        hideAlert();
        
        // Show welcome message based on context
        if (detectedContext.hasContext && detectedContext.domain) {
            const domainNames = {
                'beauty': 'Beleza & Estética',
                'healthcare': 'Saúde & Bem-estar', 
                'legal': 'Jurídico & Advocacia',
                'education': 'Educação & Ensino',
                'sports': 'Esportes & Fitness',
                'consulting': 'Consultoria & Negócios'
            };
            
            showAlert(`
                <i class="fas fa-check-circle me-2 text-success"></i>
                Ótima escolha! Vamos configurar sua conta para <strong>${domainNames[detectedContext.domain]}</strong>
            `, 'success');
        } else {
            // Coming from "criar conta grátis" - show simple welcome
            logger?.log('Starting fresh registration without context');
        }
    };

    // --- INITIALIZATION ---
    localStorage.removeItem('error_message');
    goToStep(1);
    initializeWithContext();
});