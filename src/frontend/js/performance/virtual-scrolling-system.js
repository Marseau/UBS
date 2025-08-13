/**
 * ADVANCED VIRTUAL SCROLLING SYSTEM
 * Sistema de virtual scrolling inspirado nos princípios MCP de performance
 * 
 * FEATURES:
 * - Virtual scrolling para listas com milhares de itens
 * - Dynamic height calculation para itens variáveis
 * - Intersection Observer para lazy loading
 * - Buffer zones para smooth scrolling
 * - Memory-efficient DOM management
 * - Touch/mobile optimization
 * - Performance monitoring integrado
 * - Auto-scroll e jump-to-item
 * 
 * @fileoverview Virtual scrolling system para performance máxima
 * @author Claude Code Assistant + MCP Optimization Principles
 * @version 2.0.0  
 * @since 2025-07-17
 */

class AdvancedVirtualScrollingSystem {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;
        
        if (!this.container) {
            throw new Error('Container element not found');
        }

        this.config = {
            // Core settings
            itemHeight: 50,              // Default item height (px)
            buffer: 5,                   // Buffer items before/after visible
            threshold: 0.1,              // Intersection observer threshold
            
            // Performance settings
            debounceDelay: 16,           // 60fps debouncing
            maxRenderedItems: 100,       // Max DOM elements
            preloadDistance: 200,        // Preload distance (px)
            
            // Dynamic height settings
            enableDynamicHeight: true,   // Support variable heights
            estimateHeight: true,        // Estimate heights for performance
            heightCache: true,           // Cache measured heights
            
            // Touch optimization
            enableTouch: true,           // Touch gesture support
            touchScrollSpeed: 1.5,       // Touch scroll multiplier
            
            // Visual settings
            showScrollbar: true,         // Custom scrollbar
            smoothScrolling: true,       // Smooth scroll behavior
            
            // Callbacks
            onItemRender: null,          // (item, index) => HTMLElement
            onScroll: null,              // (scrollTop, direction) => void
            onVisibleRangeChange: null,  // (startIndex, endIndex) => void
            
            ...options
        };

        // State
        this.data = [];
        this.renderedItems = new Map();
        this.heightCache = new Map();
        this.visibleRange = { start: 0, end: 0 };
        this.scrollTop = 0;
        this.isScrolling = false;
        this.scrollDirection = 'down';
        
        // Performance tracking
        this.metrics = {
            renderedCount: 0,
            cacheHits: 0,
            renderTime: [],
            scrollEvents: 0,
            averageItemHeight: this.config.itemHeight
        };

        // Elements
        this.viewport = null;
        this.content = null;
        this.scrollbar = null;
        
        // Observers
        this.intersectionObserver = null;
        this.resizeObserver = null;
        
        this.init();
    }

    /**
     * INICIALIZAÇÃO DO SISTEMA
     */
    init() {
        console.log('🚀 [VIRTUAL-SCROLL] Inicializando Virtual Scrolling System...');
        
        this.setupDOM();
        this.setupObservers();
        this.setupEventListeners();
        
        if (this.config.showScrollbar) {
            this.setupCustomScrollbar();
        }
        
        console.log('✅ [VIRTUAL-SCROLL] Sistema inicializado');
    }

    /**
     * SETUP DOM STRUCTURE
     */
    setupDOM() {
        this.container.className = 'virtual-scroll-container';
        this.container.innerHTML = `
            <div class="virtual-scroll-viewport">
                <div class="virtual-scroll-content"></div>
            </div>
            ${this.config.showScrollbar ? '<div class="virtual-scroll-scrollbar"><div class="virtual-scroll-thumb"></div></div>' : ''}
        `;

        this.viewport = this.container.querySelector('.virtual-scroll-viewport');
        this.content = this.container.querySelector('.virtual-scroll-content');
        this.scrollbar = this.container.querySelector('.virtual-scroll-scrollbar');
        
        // Apply styles
        this.applyStyles();
    }

    /**
     * APPLY STYLES
     */
    applyStyles() {
        const containerStyle = `
            position: relative;
            height: 100%;
            overflow: hidden;
        `;
        
        const viewportStyle = `
            height: 100%;
            overflow-y: auto;
            overflow-x: hidden;
            scroll-behavior: ${this.config.smoothScrolling ? 'smooth' : 'auto'};
        `;
        
        const contentStyle = `
            position: relative;
            min-height: 100%;
        `;
        
        const scrollbarStyle = `
            position: absolute;
            right: 0;
            top: 0;
            width: 8px;
            height: 100%;
            background: rgba(0,0,0,0.1);
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: none;
        `;
        
        const thumbStyle = `
            position: absolute;
            right: 0;
            width: 8px;
            background: rgba(0,0,0,0.5);
            border-radius: 4px;
            min-height: 20px;
        `;

        this.container.style.cssText = containerStyle;
        this.viewport.style.cssText = viewportStyle;
        this.content.style.cssText = contentStyle;
        
        if (this.scrollbar) {
            this.scrollbar.style.cssText = scrollbarStyle;
            const thumb = this.scrollbar.querySelector('.virtual-scroll-thumb');
            if (thumb) {
                thumb.style.cssText = thumbStyle;
            }
        }
    }

    /**
     * SETUP OBSERVERS
     */
    setupObservers() {
        // Intersection Observer for lazy loading
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.handleItemVisible(entry.target);
                }
            });
        }, {
            root: this.viewport,
            threshold: this.config.threshold
        });

        // Resize Observer for dynamic height updates
        if (this.config.enableDynamicHeight) {
            this.resizeObserver = new ResizeObserver((entries) => {
                entries.forEach(entry => {
                    this.handleItemResize(entry.target);
                });
            });
        }
    }

    /**
     * SETUP EVENT LISTENERS
     */
    setupEventListeners() {
        let scrollTimer = null;
        let lastScrollTop = 0;

        this.viewport.addEventListener('scroll', (e) => {
            const currentScrollTop = this.viewport.scrollTop;
            
            // Determine scroll direction
            this.scrollDirection = currentScrollTop > lastScrollTop ? 'down' : 'up';
            lastScrollTop = currentScrollTop;
            
            this.scrollTop = currentScrollTop;
            this.isScrolling = true;
            this.metrics.scrollEvents++;

            // Debounced scroll handling
            if (scrollTimer) {
                clearTimeout(scrollTimer);
            }

            scrollTimer = setTimeout(() => {
                this.isScrolling = false;
                this.handleScroll();
            }, this.config.debounceDelay);

            // Immediate updates for responsiveness
            this.updateScrollbar();
            
            // Callback
            if (this.config.onScroll) {
                this.config.onScroll(currentScrollTop, this.scrollDirection);
            }
        }, { passive: true });

        // Touch optimization
        if (this.config.enableTouch) {
            this.setupTouchEvents();
        }

        // Window resize
        window.addEventListener('resize', () => {
            this.recalculate();
        });
    }

    /**
     * SETUP TOUCH EVENTS
     */
    setupTouchEvents() {
        let startY = 0;
        let startScrollTop = 0;

        this.viewport.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            startScrollTop = this.viewport.scrollTop;
        }, { passive: true });

        this.viewport.addEventListener('touchmove', (e) => {
            if (e.touches.length !== 1) return;
            
            const deltaY = (startY - e.touches[0].clientY) * this.config.touchScrollSpeed;
            const newScrollTop = startScrollTop + deltaY;
            
            this.viewport.scrollTop = Math.max(0, Math.min(newScrollTop, this.getMaxScrollTop()));
        }, { passive: true });
    }

    /**
     * SETUP CUSTOM SCROLLBAR
     */
    setupCustomScrollbar() {
        if (!this.scrollbar) return;

        this.container.addEventListener('mouseenter', () => {
            this.scrollbar.style.opacity = '1';
        });

        this.container.addEventListener('mouseleave', () => {
            this.scrollbar.style.opacity = '0';
        });

        this.viewport.addEventListener('scroll', () => {
            this.updateScrollbar();
        });
    }

    /**
     * UPDATE SCROLLBAR
     */
    updateScrollbar() {
        if (!this.scrollbar) return;

        const thumb = this.scrollbar.querySelector('.virtual-scroll-thumb');
        if (!thumb) return;

        const scrollHeight = this.getTotalHeight();
        const viewportHeight = this.viewport.clientHeight;
        const scrollTop = this.viewport.scrollTop;

        if (scrollHeight <= viewportHeight) {
            this.scrollbar.style.display = 'none';
            return;
        }

        this.scrollbar.style.display = 'block';

        const thumbHeight = Math.max(20, (viewportHeight / scrollHeight) * viewportHeight);
        const thumbTop = (scrollTop / (scrollHeight - viewportHeight)) * (viewportHeight - thumbHeight);

        thumb.style.height = thumbHeight + 'px';
        thumb.style.top = thumbTop + 'px';
    }

    /**
     * SET DATA
     */
    setData(data) {
        this.data = data;
        this.heightCache.clear();
        this.renderedItems.clear();
        
        // Calculate total height
        this.updateContentHeight();
        
        // Initial render
        this.render();
        
        console.log(`📊 [VIRTUAL-SCROLL] Data set: ${data.length} items`);
    }

    /**
     * ADD ITEM
     */
    addItem(item, index = -1) {
        if (index === -1) {
            this.data.push(item);
        } else {
            this.data.splice(index, 0, item);
        }
        
        this.updateContentHeight();
        this.render();
    }

    /**
     * REMOVE ITEM
     */
    removeItem(index) {
        if (index >= 0 && index < this.data.length) {
            this.data.splice(index, 1);
            this.heightCache.delete(index);
            
            // Shift height cache
            const newCache = new Map();
            for (const [key, value] of this.heightCache.entries()) {
                if (key > index) {
                    newCache.set(key - 1, value);
                } else {
                    newCache.set(key, value);
                }
            }
            this.heightCache = newCache;
            
            this.updateContentHeight();
            this.render();
        }
    }

    /**
     * UPDATE CONTENT HEIGHT
     */
    updateContentHeight() {
        const totalHeight = this.getTotalHeight();
        this.content.style.height = totalHeight + 'px';
    }

    /**
     * GET TOTAL HEIGHT
     */
    getTotalHeight() {
        if (!this.config.enableDynamicHeight) {
            return this.data.length * this.config.itemHeight;
        }

        let totalHeight = 0;
        for (let i = 0; i < this.data.length; i++) {
            totalHeight += this.getItemHeight(i);
        }
        return totalHeight;
    }

    /**
     * GET ITEM HEIGHT
     */
    getItemHeight(index) {
        if (this.heightCache.has(index)) {
            return this.heightCache.get(index);
        }
        
        if (this.config.estimateHeight) {
            return this.metrics.averageItemHeight;
        }
        
        return this.config.itemHeight;
    }

    /**
     * SET ITEM HEIGHT
     */
    setItemHeight(index, height) {
        this.heightCache.set(index, height);
        
        // Update average
        const heights = Array.from(this.heightCache.values());
        this.metrics.averageItemHeight = heights.reduce((a, b) => a + b, 0) / heights.length;
        this.metrics.cacheHits++;
    }

    /**
     * GET VISIBLE RANGE
     */
    getVisibleRange() {
        const scrollTop = this.viewport.scrollTop;
        const viewportHeight = this.viewport.clientHeight;
        const scrollBottom = scrollTop + viewportHeight;

        let startIndex = 0;
        let endIndex = this.data.length - 1;

        if (this.config.enableDynamicHeight) {
            // Calculate with dynamic heights
            let currentTop = 0;
            
            for (let i = 0; i < this.data.length; i++) {
                const itemHeight = this.getItemHeight(i);
                const itemBottom = currentTop + itemHeight;
                
                if (startIndex === 0 && itemBottom > scrollTop) {
                    startIndex = Math.max(0, i - this.config.buffer);
                }
                
                if (currentTop > scrollBottom) {
                    endIndex = Math.min(this.data.length - 1, i + this.config.buffer);
                    break;
                }
                
                currentTop = itemBottom;
            }
        } else {
            // Calculate with fixed heights
            startIndex = Math.max(0, Math.floor(scrollTop / this.config.itemHeight) - this.config.buffer);
            endIndex = Math.min(
                this.data.length - 1,
                Math.ceil(scrollBottom / this.config.itemHeight) + this.config.buffer
            );
        }

        return { start: startIndex, end: endIndex };
    }

    /**
     * HANDLE SCROLL
     */
    handleScroll() {
        const newRange = this.getVisibleRange();
        
        if (newRange.start !== this.visibleRange.start || newRange.end !== this.visibleRange.end) {
            this.visibleRange = newRange;
            this.render();
            
            // Callback
            if (this.config.onVisibleRangeChange) {
                this.config.onVisibleRangeChange(newRange.start, newRange.end);
            }
        }
    }

    /**
     * RENDER ITEMS
     */
    render() {
        const startTime = performance.now();
        
        // Clear items outside visible range
        this.cleanupRenderedItems();
        
        // Render visible items
        for (let i = this.visibleRange.start; i <= this.visibleRange.end; i++) {
            if (!this.renderedItems.has(i)) {
                this.renderItem(i);
            }
        }
        
        // Update metrics
        const renderTime = performance.now() - startTime;
        this.metrics.renderTime.push(renderTime);
        if (this.metrics.renderTime.length > 100) {
            this.metrics.renderTime.shift();
        }
        
        this.metrics.renderedCount = this.renderedItems.size;
    }

    /**
     * RENDER ITEM
     */
    renderItem(index) {
        if (index < 0 || index >= this.data.length) return;

        const item = this.data[index];
        let element;

        // Use custom render function or default
        if (this.config.onItemRender) {
            element = this.config.onItemRender(item, index);
        } else {
            element = this.createDefaultElement(item, index);
        }

        if (!element) return;

        // Position element
        const top = this.getItemTop(index);
        element.style.position = 'absolute';
        element.style.top = top + 'px';
        element.style.left = '0';
        element.style.right = '0';
        
        // Add to DOM
        this.content.appendChild(element);
        this.renderedItems.set(index, element);

        // Observe for dynamic height
        if (this.config.enableDynamicHeight && this.resizeObserver) {
            this.resizeObserver.observe(element);
        }

        // Observe for intersection
        this.intersectionObserver.observe(element);
    }

    /**
     * CREATE DEFAULT ELEMENT
     */
    createDefaultElement(item, index) {
        const element = document.createElement('div');
        element.className = 'virtual-scroll-item';
        element.style.height = this.config.itemHeight + 'px';
        element.style.display = 'flex';
        element.style.alignItems = 'center';
        element.style.padding = '0 16px';
        element.style.borderBottom = '1px solid #eee';
        element.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f9f9f9';
        
        // Default content
        if (typeof item === 'string') {
            element.textContent = item;
        } else if (typeof item === 'object') {
            element.textContent = JSON.stringify(item);
        } else {
            element.textContent = String(item);
        }
        
        return element;
    }

    /**
     * GET ITEM TOP POSITION
     */
    getItemTop(index) {
        if (!this.config.enableDynamicHeight) {
            return index * this.config.itemHeight;
        }

        let top = 0;
        for (let i = 0; i < index; i++) {
            top += this.getItemHeight(i);
        }
        return top;
    }

    /**
     * CLEANUP RENDERED ITEMS
     */
    cleanupRenderedItems() {
        for (const [index, element] of this.renderedItems.entries()) {
            if (index < this.visibleRange.start || index > this.visibleRange.end) {
                // Remove from DOM
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
                
                // Remove from observers
                this.intersectionObserver.unobserve(element);
                if (this.resizeObserver) {
                    this.resizeObserver.unobserve(element);
                }
                
                // Remove from map
                this.renderedItems.delete(index);
            }
        }
    }

    /**
     * HANDLE ITEM VISIBLE
     */
    handleItemVisible(element) {
        // Trigger lazy loading or other actions
        const index = this.getElementIndex(element);
        if (index !== -1) {
            // Could trigger data loading, image loading, etc.
        }
    }

    /**
     * HANDLE ITEM RESIZE
     */
    handleItemResize(element) {
        const index = this.getElementIndex(element);
        if (index !== -1) {
            const newHeight = element.offsetHeight;
            const oldHeight = this.getItemHeight(index);
            
            if (Math.abs(newHeight - oldHeight) > 1) { // Threshold to avoid micro-adjustments
                this.setItemHeight(index, newHeight);
                this.updateContentHeight();
                this.updateItemPositions();
            }
        }
    }

    /**
     * GET ELEMENT INDEX
     */
    getElementIndex(element) {
        for (const [index, el] of this.renderedItems.entries()) {
            if (el === element) {
                return index;
            }
        }
        return -1;
    }

    /**
     * UPDATE ITEM POSITIONS
     */
    updateItemPositions() {
        for (const [index, element] of this.renderedItems.entries()) {
            const top = this.getItemTop(index);
            element.style.top = top + 'px';
        }
    }

    /**
     * RECALCULATE
     */
    recalculate() {
        this.updateContentHeight();
        this.updateItemPositions();
        this.handleScroll();
    }

    /**
     * SCROLL TO INDEX
     */
    scrollToIndex(index, behavior = 'smooth') {
        if (index < 0 || index >= this.data.length) return;

        const top = this.getItemTop(index);
        this.viewport.scrollTo({
            top,
            behavior
        });
    }

    /**
     * SCROLL TO TOP
     */
    scrollToTop(behavior = 'smooth') {
        this.viewport.scrollTo({
            top: 0,
            behavior
        });
    }

    /**
     * SCROLL TO BOTTOM
     */
    scrollToBottom(behavior = 'smooth') {
        this.viewport.scrollTo({
            top: this.getTotalHeight(),
            behavior
        });
    }

    /**
     * GET MAX SCROLL TOP
     */
    getMaxScrollTop() {
        return Math.max(0, this.getTotalHeight() - this.viewport.clientHeight);
    }

    /**
     * GET METRICS
     */
    getMetrics() {
        const avgRenderTime = this.metrics.renderTime.length > 0
            ? this.metrics.renderTime.reduce((a, b) => a + b, 0) / this.metrics.renderTime.length
            : 0;

        return {
            ...this.metrics,
            totalItems: this.data.length,
            visibleItems: this.visibleRange.end - this.visibleRange.start + 1,
            avgRenderTime: Math.round(avgRenderTime * 100) / 100,
            memoryEfficiency: this.data.length > 0 
                ? ((this.data.length - this.renderedItems.size) / this.data.length * 100).toFixed(1)
                : 0
        };
    }

    /**
     * DESTROY
     */
    destroy() {
        // Clear observers
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        // Clear DOM
        this.container.innerHTML = '';

        // Clear references
        this.data = [];
        this.renderedItems.clear();
        this.heightCache.clear();

        console.log('🛑 [VIRTUAL-SCROLL] Sistema destruído');
    }
}

// Export for use
window.AdvancedVirtualScrollingSystem = AdvancedVirtualScrollingSystem;

console.log('🚀 [VIRTUAL-SCROLL] Advanced Virtual Scrolling System pronto!');