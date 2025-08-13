// Keyboard navigation enhancements
class KeyboardNavigation {
    constructor() {
        this.focusableElements = [
            'a[href]',
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
            '[contenteditable="true"]'
        ].join(',');
        
        this.init();
    }

    init() {
        this.addSkipLink();
        this.enhanceFocusManagement();
        this.addKeyboardShortcuts();
        this.improveModalFocus();
    }

    // Add skip link for screen readers
    addSkipLink() {
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.className = 'skip-link';
        skipLink.textContent = 'Pular para o conteúdo principal';
        skipLink.setAttribute('tabindex', '0');
        
        document.body.insertBefore(skipLink, document.body.firstChild);
        
        // Add main content landmark if it doesn't exist
        const mainContent = document.getElementById('main-content') || 
                          document.querySelector('main') ||
                          document.querySelector('.main-content');
        
        if (mainContent) {
            mainContent.setAttribute('id', 'main-content');
            mainContent.setAttribute('role', 'main');
        }
    }

    // Enhance focus management
    enhanceFocusManagement() {
        // Track focus for debugging
        document.addEventListener('focusin', (e) => {
            logger?.log('Focus moved to:', e.target.tagName, e.target.className || e.target.id || '');
        });

        // Ensure focus is visible
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                document.body.classList.add('keyboard-navigation');
            }
        });

        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-navigation');
        });

        // Add focus styles for keyboard navigation
        const style = document.createElement('style');
        style.textContent = `
            .keyboard-navigation *:focus {
                outline: 2px solid var(--focus-color, #0066FF) !important;
                outline-offset: 2px !important;
                box-shadow: 0 0 0 3px rgba(0, 102, 255, 0.3) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Add keyboard shortcuts
    addKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Alt + D: Go to dashboard
            if (e.altKey && e.key === 'd') {
                e.preventDefault();
                const dashboardLink = document.querySelector('[data-page="dashboard"]');
                if (dashboardLink) {
                    dashboardLink.click();
                    dashboardLink.focus();
                }
            }

            // Alt + S: Go to settings
            if (e.altKey && e.key === 's') {
                e.preventDefault();
                const settingsLink = document.querySelector('[href*="settings"]');
                if (settingsLink) {
                    settingsLink.click();
                    settingsLink.focus();
                }
            }

            // Alt + A: Go to appointments
            if (e.altKey && e.key === 'a') {
                e.preventDefault();
                const appointmentsLink = document.querySelector('[data-page="appointments"]');
                if (appointmentsLink) {
                    appointmentsLink.click();
                    appointmentsLink.focus();
                }
            }

            // Escape: Close modals or return to main content
            if (e.key === 'Escape') {
                const modal = document.querySelector('.modal.show');
                if (modal) {
                    const closeButton = modal.querySelector('[data-bs-dismiss="modal"]');
                    if (closeButton) {
                        closeButton.click();
                    }
                } else {
                    // Return focus to main content
                    const mainContent = document.getElementById('main-content');
                    if (mainContent) {
                        mainContent.focus();
                    }
                }
            }

            // Arrow keys for sidebar navigation
            if (e.target.closest('.sidebar')) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateSidebar(e.key === 'ArrowDown' ? 1 : -1);
                }
            }
        });
    }

    // Navigate sidebar with arrow keys
    navigateSidebar(direction) {
        const sidebarLinks = Array.from(document.querySelectorAll('.sidebar .nav-link'));
        const currentIndex = sidebarLinks.findIndex(link => link === document.activeElement);
        
        if (currentIndex !== -1) {
            const nextIndex = currentIndex + direction;
            if (nextIndex >= 0 && nextIndex < sidebarLinks.length) {
                sidebarLinks[nextIndex].focus();
            }
        } else if (sidebarLinks.length > 0) {
            sidebarLinks[0].focus();
        }
    }

    // Improve modal focus management
    improveModalFocus() {
        // Store the element that was focused before opening modal
        let lastFocusedElement = null;

        // When modal is shown
        document.addEventListener('shown.bs.modal', (e) => {
            lastFocusedElement = document.activeElement;
            
            // Focus first focusable element in modal
            const modal = e.target;
            const focusableElements = modal.querySelectorAll(this.focusableElements);
            if (focusableElements.length > 0) {
                focusableElements[0].focus();
            }

            // Trap focus within modal
            this.trapFocus(modal);
        });

        // When modal is hidden
        document.addEventListener('hidden.bs.modal', () => {
            // Return focus to previously focused element
            if (lastFocusedElement) {
                lastFocusedElement.focus();
                lastFocusedElement = null;
            }
        });
    }

    // Trap focus within an element
    trapFocus(element) {
        const focusableElements = Array.from(element.querySelectorAll(this.focusableElements));
        
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const trapFocusHandler = (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    // Shift + Tab
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    // Tab
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        };

        element.addEventListener('keydown', trapFocusHandler);

        // Remove event listener when modal is hidden
        const removeHandler = () => {
            element.removeEventListener('keydown', trapFocusHandler);
            element.removeEventListener('hidden.bs.modal', removeHandler);
        };

        element.addEventListener('hidden.bs.modal', removeHandler);
    }

    // Announce page changes to screen readers
    announcePageChange(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        
        document.body.appendChild(announcement);
        
        // Remove after announcement
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    // Add ARIA labels to elements that need them
    addAriaLabels() {
        // Add labels to buttons without text
        document.querySelectorAll('button:not([aria-label])').forEach(button => {
            const icon = button.querySelector('i[class*="fa-"]');
            if (icon && !button.textContent.trim()) {
                const iconClass = Array.from(icon.classList).find(cls => cls.startsWith('fa-'));
                if (iconClass) {
                    const action = iconClass.replace('fa-', '').replace('-', ' ');
                    button.setAttribute('aria-label', action);
                }
            }
        });

        // Add labels to form controls without labels
        document.querySelectorAll('input:not([aria-label]):not([aria-labelledby])').forEach(input => {
            const placeholder = input.getAttribute('placeholder');
            if (placeholder && !input.labels?.length) {
                input.setAttribute('aria-label', placeholder);
            }
        });
    }

    // Initialize when DOM is ready
    static init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                new KeyboardNavigation();
            });
        } else {
            new KeyboardNavigation();
        }
    }
}

// Auto-initialize
KeyboardNavigation.init();

// Global instance
window.keyboardNavigation = KeyboardNavigation;