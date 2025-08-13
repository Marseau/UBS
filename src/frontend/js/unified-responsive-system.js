/**
 * UNIFIED RESPONSIVE SYSTEM
 * Ensures mobile compatibility across all dashboards
 */

(function() {
    'use strict';

    // Breakpoints configuration
    const BREAKPOINTS = {
        xs: 0,
        sm: 576,
        md: 768,
        lg: 992,
        xl: 1200,
        xxl: 1400
    };

    // Responsive configuration
    const RESPONSIVE_CONFIG = {
        // Auto-hide elements on mobile
        hideOnMobile: [
            '.d-none.d-md-block',
            '.breadcrumb-nav',
            '.chart-actions'
        ],
        
        // Elements that need mobile optimization
        optimizeForMobile: [
            '.metric-card',
            '.chart-widget',
            '.table-widget',
            '.action-buttons',
            '.fab-container'
        ],

        // Touch-friendly targets
        touchTargets: [
            'button',
            '.nav-link',
            '.dropdown-toggle',
            '.fab',
            '.btn'
        ]
    };

    // Unified Responsive System
    class UnifiedResponsiveSystem {
        constructor() {
            this.currentBreakpoint = this.getCurrentBreakpoint();
            this.touchDevice = this.isTouchDevice();
            this.initializeCSS();
            this.setupEventListeners();
        }

        // Initialize responsive CSS
        initializeCSS() {
            if (document.getElementById('unified-responsive-styles')) return;

            const style = document.createElement('style');
            style.id = 'unified-responsive-styles';
            style.textContent = `
                /* Unified Responsive Styles */
                
                /* Touch-friendly targets */
                @media (hover: none) and (pointer: coarse) {
                    .btn, button, .nav-link, .dropdown-toggle {
                        min-height: 44px;
                        min-width: 44px;
                        padding: 0.75rem 1rem;
                    }
                    
                    .fab, .fab-secondary {
                        min-height: 48px;
                        min-width: 48px;
                    }
                    
                    .metric-card {
                        margin-bottom: 1rem;
                    }
                }

                /* Mobile Optimizations */
                @media (max-width: 767.98px) {
                    /* Container adjustments */
                    .container-fluid {
                        padding-left: 1rem;
                        padding-right: 1rem;
                    }
                    
                    /* Typography scaling */
                    h1 { font-size: 1.75rem; }
                    h2 { font-size: 1.5rem; }
                    h3 { font-size: 1.25rem; }
                    h4 { font-size: 1.125rem; }
                    h5 { font-size: 1rem; }
                    
                    /* Card optimizations */
                    .metric-card {
                        margin-bottom: 1rem;
                    }
                    
                    .metric-card-body {
                        padding: 1rem;
                    }
                    
                    .metric-value {
                        font-size: 1.5rem !important;
                    }
                    
                    .metric-icon {
                        width: 40px;
                        height: 40px;
                        font-size: 1.25rem;
                    }
                    
                    /* Chart optimizations */
                    .chart-widget {
                        margin-bottom: 1.5rem;
                    }
                    
                    .chart-body {
                        min-height: 250px;
                        height: 250px;
                    }
                    
                    .chart-header {
                        padding: 0.75rem 1rem;
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 0.5rem;
                    }
                    
                    .chart-title {
                        font-size: 1rem;
                        margin-bottom: 0;
                    }
                    
                    .chart-actions {
                        align-self: stretch;
                    }
                    
                    /* Table optimizations */
                    .table-widget {
                        margin-bottom: 1.5rem;
                    }
                    
                    .table-responsive {
                        font-size: 0.875rem;
                    }
                    
                    .table td, .table th {
                        padding: 0.5rem;
                        white-space: nowrap;
                    }
                    
                    /* Button optimizations */
                    .action-buttons {
                        flex-direction: column;
                        gap: 0.75rem;
                        align-items: stretch;
                    }
                    
                    .btn-action {
                        justify-content: center;
                        min-height: 44px;
                    }
                    
                    /* Form optimizations */
                    .form-select, .form-control {
                        min-height: 44px;
                        font-size: 1rem;
                    }
                    
                    .compact-select {
                        min-height: 38px;
                    }
                    
                    /* Modal optimizations */
                    .modal-dialog {
                        margin: 0.5rem;
                        max-width: calc(100% - 1rem);
                    }
                    
                    .modal-content {
                        min-height: auto;
                    }
                    
                    .modal-body {
                        padding: 1rem;
                    }
                    
                    /* FAB optimizations */
                    .floating-actions {
                        bottom: 20px;
                        right: 20px;
                    }
                    
                    .fab {
                        width: 56px;
                        height: 56px;
                    }
                    
                    .fab-secondary {
                        width: 48px;
                        height: 48px;
                    }
                    
                    /* Navigation optimizations */
                    .top-navbar {
                        padding: 0.5rem 0;
                    }
                    
                    .user-avatar {
                        width: 32px;
                        height: 32px;
                        font-size: 0.8rem;
                    }
                    
                    /* Content spacing */
                    .content-section {
                        margin-bottom: 2rem;
                    }
                    
                    .content-section h3 {
                        margin-bottom: 1rem;
                        font-size: 1.125rem;
                    }
                    
                    /* Grid adjustments */
                    .row.g-3 {
                        --bs-gutter-x: 1rem;
                        --bs-gutter-y: 1rem;
                    }
                    
                    .row.g-4 {
                        --bs-gutter-x: 1.25rem;
                        --bs-gutter-y: 1.25rem;
                    }
                }

                /* Tablet optimizations */
                @media (min-width: 768px) and (max-width: 991.98px) {
                    .metric-value {
                        font-size: 1.75rem;
                    }
                    
                    .chart-body {
                        min-height: 300px;
                        height: 300px;
                    }
                    
                    .action-buttons {
                        flex-wrap: wrap;
                        gap: 0.5rem;
                    }
                }

                /* Large screen optimizations */
                @media (min-width: 1200px) {
                    .chart-body {
                        min-height: 400px;
                        height: 400px;
                    }
                    
                    .metric-value {
                        font-size: 2.25rem;
                    }
                    
                    .content-wrapper {
                        padding: 1.5rem;
                    }
                }

                /* Print optimizations */
                @media print {
                    .sidebar,
                    .floating-actions,
                    .action-buttons,
                    .fab-container,
                    .quick-nav {
                        display: none !important;
                    }
                    
                    .main-content {
                        margin-left: 0 !important;
                    }
                    
                    .chart-widget,
                    .metric-card,
                    .table-widget {
                        break-inside: avoid;
                        margin-bottom: 1rem;
                    }
                }

                /* High contrast mode */
                @media (prefers-contrast: high) {
                    .metric-card,
                    .chart-widget,
                    .table-widget {
                        border: 2px solid;
                    }
                    
                    .btn {
                        border-width: 2px;
                    }
                }

                /* Reduced motion */
                @media (prefers-reduced-motion: reduce) {
                    *,
                    *::before,
                    *::after {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.01ms !important;
                    }
                }

                /* Dark mode support */
                @media (prefers-color-scheme: dark) {
                    .metric-card,
                    .chart-widget,
                    .table-widget {
                        background: #1a1a1a;
                        border-color: #333;
                        color: #e0e0e0;
                    }
                    
                    .main-content {
                        background: #121212;
                    }
                }

                /* Focus improvements for accessibility */
                .btn:focus,
                .nav-link:focus,
                .form-select:focus,
                .form-control:focus {
                    outline: 2px solid var(--ubs-primary, #2d5a9b);
                    outline-offset: 2px;
                }

                /* Loading states responsive */
                @media (max-width: 767.98px) {
                    .loading-container {
                        min-height: 60px;
                        font-size: 0.9rem;
                    }
                    
                    .loading-overlay {
                        border-radius: 0.5rem;
                    }
                }

                /* Error states responsive */
                @media (max-width: 767.98px) {
                    .error-toast {
                        left: 1rem;
                        right: 1rem;
                        min-width: auto;
                    }
                    
                    .error-card {
                        margin: 0.5rem 0;
                        padding: 0.75rem;
                    }
                    
                    .error-actions {
                        flex-direction: column;
                        gap: 0.5rem;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Setup event listeners
        setupEventListeners() {
            // Viewport resize handler
            window.addEventListener('resize', this.debounce(() => {
                this.handleResize();
            }, 250));

            // Orientation change handler
            window.addEventListener('orientationchange', () => {
                setTimeout(() => this.handleOrientationChange(), 100);
            });

            // Viewport meta tag optimization
            this.optimizeViewport();

            // Touch event optimization
            if (this.touchDevice) {
                this.optimizeForTouch();
            }
        }

        // Handle viewport resize
        handleResize() {
            const newBreakpoint = this.getCurrentBreakpoint();
            if (newBreakpoint !== this.currentBreakpoint) {
                console.log(`📱 Breakpoint changed: ${this.currentBreakpoint} → ${newBreakpoint}`);
                this.currentBreakpoint = newBreakpoint;
                this.onBreakpointChange(newBreakpoint);
            }

            // Update chart sizes
            this.updateChartSizes();
            
            // Update table responsiveness
            this.updateTableResponsiveness();
        }

        // Handle orientation change
        handleOrientationChange() {
            console.log('📱 Orientation changed');
            
            // Fix iOS viewport height issue
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
            
            // Update layouts
            this.updateChartSizes();
            this.optimizeModalSizes();
        }

        // Get current breakpoint
        getCurrentBreakpoint() {
            const width = window.innerWidth;
            
            if (width >= BREAKPOINTS.xxl) return 'xxl';
            if (width >= BREAKPOINTS.xl) return 'xl';
            if (width >= BREAKPOINTS.lg) return 'lg';
            if (width >= BREAKPOINTS.md) return 'md';
            if (width >= BREAKPOINTS.sm) return 'sm';
            return 'xs';
        }

        // Check if device supports touch
        isTouchDevice() {
            return 'ontouchstart' in window || 
                   navigator.maxTouchPoints > 0 || 
                   navigator.msMaxTouchPoints > 0;
        }

        // Optimize viewport meta tag
        optimizeViewport() {
            let viewport = document.querySelector('meta[name="viewport"]');
            if (!viewport) {
                viewport = document.createElement('meta');
                viewport.name = 'viewport';
                document.head.appendChild(viewport);
            }
            
            viewport.content = 'width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover';
        }

        // Optimize for touch devices
        optimizeForTouch() {
            document.body.classList.add('touch-device');
            
            // Add touch feedback
            document.addEventListener('touchstart', (e) => {
                if (e.target.matches('button, .btn, .nav-link, .fab')) {
                    e.target.classList.add('touch-active');
                }
            }, { passive: true });
            
            document.addEventListener('touchend', (e) => {
                if (e.target.matches('button, .btn, .nav-link, .fab')) {
                    setTimeout(() => {
                        e.target.classList.remove('touch-active');
                    }, 150);
                }
            }, { passive: true });
        }

        // Update chart sizes for current breakpoint
        updateChartSizes() {
            const charts = document.querySelectorAll('canvas');
            charts.forEach(canvas => {
                if (canvas.chart) {
                    canvas.chart.resize();
                }
            });
        }

        // Update table responsiveness
        updateTableResponsiveness() {
            const tables = document.querySelectorAll('.table');
            tables.forEach(table => {
                if (!table.closest('.table-responsive')) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'table-responsive';
                    table.parentNode.insertBefore(wrapper, table);
                    wrapper.appendChild(table);
                }
            });
        }

        // Optimize modal sizes
        optimizeModalSizes() {
            const modals = document.querySelectorAll('.modal-dialog');
            modals.forEach(modal => {
                if (this.currentBreakpoint === 'xs' || this.currentBreakpoint === 'sm') {
                    modal.classList.add('modal-fullscreen-sm-down');
                } else {
                    modal.classList.remove('modal-fullscreen-sm-down');
                }
            });
        }

        // Handle breakpoint change
        onBreakpointChange(newBreakpoint) {
            // Update charts
            this.updateChartSizes();
            
            // Update modals
            this.optimizeModalSizes();
            
            // Update navigation
            if (window.unifiedNavigationSystem) {
                if (newBreakpoint === 'xs' || newBreakpoint === 'sm') {
                    // Mobile mode
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar && !sidebar.classList.contains('mobile-open')) {
                        sidebar.classList.remove('collapsed');
                    }
                } else {
                    // Desktop mode
                    const sidebar = document.getElementById('sidebar');
                    const overlay = document.getElementById('sidebarOverlay');
                    if (sidebar) {
                        sidebar.classList.remove('mobile-open');
                    }
                    if (overlay) {
                        overlay.classList.remove('show');
                    }
                }
            }
            
            // Trigger custom event
            window.dispatchEvent(new CustomEvent('breakpointChange', {
                detail: { 
                    oldBreakpoint: this.currentBreakpoint,
                    newBreakpoint: newBreakpoint,
                    isMobile: newBreakpoint === 'xs' || newBreakpoint === 'sm'
                }
            }));
        }

        // Debounce function
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        // Get responsive state
        getResponsiveState() {
            return {
                breakpoint: this.currentBreakpoint,
                isMobile: this.currentBreakpoint === 'xs' || this.currentBreakpoint === 'sm',
                isTablet: this.currentBreakpoint === 'md',
                isDesktop: this.currentBreakpoint === 'lg' || this.currentBreakpoint === 'xl' || this.currentBreakpoint === 'xxl',
                touchDevice: this.touchDevice,
                screenSize: {
                    width: window.innerWidth,
                    height: window.innerHeight
                }
            };
        }

        // Force mobile mode for testing
        forceMobileMode() {
            document.body.classList.add('force-mobile');
            this.currentBreakpoint = 'xs';
            this.onBreakpointChange('xs');
        }

        // Force desktop mode
        forceDesktopMode() {
            document.body.classList.remove('force-mobile');
            this.currentBreakpoint = 'lg';
            this.onBreakpointChange('lg');
        }

        // Optimize images for current viewport
        optimizeImages() {
            const images = document.querySelectorAll('img[data-src-mobile], img[data-src-desktop]');
            images.forEach(img => {
                const isMobile = this.currentBreakpoint === 'xs' || this.currentBreakpoint === 'sm';
                const mobileSrc = img.dataset.srcMobile;
                const desktopSrc = img.dataset.srcDesktop;
                
                if (isMobile && mobileSrc) {
                    img.src = mobileSrc;
                } else if (!isMobile && desktopSrc) {
                    img.src = desktopSrc;
                }
            });
        }

        // Add responsive utilities
        addResponsiveUtils() {
            // Add to window for global access
            window.isMobile = () => this.currentBreakpoint === 'xs' || this.currentBreakpoint === 'sm';
            window.isTablet = () => this.currentBreakpoint === 'md';
            window.isDesktop = () => ['lg', 'xl', 'xxl'].includes(this.currentBreakpoint);
            window.getCurrentBreakpoint = () => this.currentBreakpoint;
        }
    }

    // Create global instance
    window.unifiedResponsiveSystem = new UnifiedResponsiveSystem();

    // Add responsive utilities to window
    window.unifiedResponsiveSystem.addResponsiveUtils();

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ Unified Responsive System initialized');
        });
    } else {
        console.log('✅ Unified Responsive System initialized');
    }

    // Expose for external use
    window.responsiveSystem = window.unifiedResponsiveSystem;

})();