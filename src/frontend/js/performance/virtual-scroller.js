/**
 * VIRTUAL SCROLLING SYSTEM
 * High-performance rendering for large lists
 * Target: 60fps with 10000+ items
 */

class VirtualScroller {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? 
            document.querySelector(container) : container;
        
        this.options = {
            itemHeight: options.itemHeight || 50,
            bufferSize: options.bufferSize || 5,
            estimatedItemCount: options.estimatedItemCount || 1000,
            renderItem: options.renderItem || this.defaultRenderItem,
            getItemData: options.getItemData || (() => ({})),
            onScroll: options.onScroll || (() => {}),
            recycleNodes: options.recycleNodes !== false,
            ...options
        };
        
        this.data = [];
        this.startIndex = 0;
        this.endIndex = 0;
        this.scrollTop = 0;
        this.viewportHeight = 0;
        this.totalHeight = 0;
        this.visibleItemCount = 0;
        
        // Node recycling
        this.nodePool = [];
        this.activeNodes = [];
        
        // Performance tracking
        this.performanceMetrics = {
            renderTime: 0,
            scrollEvents: 0,
            nodeRecycles: 0,
            fps: 0,
            lastFrameTime: 0
        };
        
        this.init();
    }

    /**
     * Initialize virtual scroller
     */
    init() {
        console.log('📜 Initializing Virtual Scroller...');
        
        this.setupContainer();
        this.setupScrolling();
        this.setupResizeObserver();
        this.setupPerformanceMonitoring();
        
        console.log('✅ Virtual Scroller initialized');
        console.log(`   Buffer Size: ${this.options.bufferSize}`);
        console.log(`   Item Height: ${this.options.itemHeight}px`);
        console.log(`   Node Recycling: ${this.options.recycleNodes ? 'Enabled' : 'Disabled'}`);
    }

    /**
     * Setup container structure
     */
    setupContainer() {
        this.container.style.cssText += `
            position: relative;
            overflow-y: auto;
            height: 100%;
        `;
        
        // Create viewport
        this.viewport = document.createElement('div');
        this.viewport.className = 'virtual-scroll-viewport';
        this.viewport.style.cssText = `
            position: relative;
            will-change: transform;
        `;
        
        // Create spacer for total height
        this.spacer = document.createElement('div');
        this.spacer.className = 'virtual-scroll-spacer';
        this.spacer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            pointer-events: none;
        `;
        
        this.container.appendChild(this.spacer);
        this.container.appendChild(this.viewport);
        
        this.updateViewportHeight();
    }

    /**
     * Setup scroll handling
     */
    setupScrolling() {
        // Use passive listeners for better performance
        this.container.addEventListener('scroll', this.handleScroll.bind(this), {
            passive: true
        });
        
        // Throttled scroll handler for expensive operations
        this.throttledScroll = this.throttle(this.handleExpensiveScroll.bind(this), 16); // 60fps
    }

    /**
     * Handle scroll events
     */
    handleScroll(event) {
        const startTime = performance.now();
        
        this.scrollTop = this.container.scrollTop;
        this.performanceMetrics.scrollEvents++;
        
        // Calculate visible range
        this.calculateVisibleRange();
        
        // Update viewport
        this.updateViewport();
        
        // Call throttled handler for expensive operations
        this.throttledScroll();
        
        // Track performance
        this.performanceMetrics.renderTime = performance.now() - startTime;
        this.updateFPS();
        
        // Call user scroll handler
        this.options.onScroll({
            scrollTop: this.scrollTop,
            startIndex: this.startIndex,
            endIndex: this.endIndex
        });
    }

    /**
     * Handle expensive scroll operations (throttled)
     */
    handleExpensiveScroll() {
        // Preload data for upcoming items
        this.preloadData();
        
        // Recycle nodes if needed
        if (this.options.recycleNodes) {
            this.recycleNodes();
        }
    }

    /**
     * Calculate visible range
     */
    calculateVisibleRange() {
        const itemHeight = this.options.itemHeight;
        const bufferSize = this.options.bufferSize;
        
        this.startIndex = Math.max(0, 
            Math.floor(this.scrollTop / itemHeight) - bufferSize
        );
        
        this.endIndex = Math.min(this.data.length - 1,
            Math.floor((this.scrollTop + this.viewportHeight) / itemHeight) + bufferSize
        );
        
        this.visibleItemCount = this.endIndex - this.startIndex + 1;
    }

    /**
     * Update viewport with visible items
     */
    updateViewport() {
        const fragment = document.createDocumentFragment();
        const itemHeight = this.options.itemHeight;
        
        // Clear existing nodes or recycle them
        if (this.options.recycleNodes) {
            this.recycleCurrentNodes();
        } else {
            this.viewport.innerHTML = '';
        }
        
        // Render visible items
        for (let i = this.startIndex; i <= this.endIndex; i++) {
            if (i >= 0 && i < this.data.length) {
                const item = this.getOrCreateNode(i);
                item.style.transform = `translateY(${i * itemHeight}px)`;
                fragment.appendChild(item);
            }
        }
        
        this.viewport.appendChild(fragment);
        
        // Update spacer height
        this.updateSpacerHeight();
    }

    /**
     * Get or create node for item
     */
    getOrCreateNode(index) {
        let node;
        
        if (this.options.recycleNodes && this.nodePool.length > 0) {
            node = this.nodePool.pop();
            this.performanceMetrics.nodeRecycles++;
        } else {
            node = document.createElement('div');
            node.className = 'virtual-scroll-item';
            node.style.cssText = `
                position: absolute;
                left: 0;
                right: 0;
                height: ${this.options.itemHeight}px;
                will-change: transform;
            `;
        }
        
        // Render item content
        const itemData = this.options.getItemData(this.data[index], index);
        node.innerHTML = this.options.renderItem(itemData, index);
        node.dataset.index = index;
        
        this.activeNodes.push(node);
        return node;
    }

    /**
     * Recycle current nodes
     */
    recycleCurrentNodes() {
        this.activeNodes.forEach(node => {
            node.remove();
            this.nodePool.push(node);
        });
        this.activeNodes = [];
    }

    /**
     * Recycle nodes outside visible range
     */
    recycleNodes() {
        const nodesToRecycle = this.activeNodes.filter(node => {
            const index = parseInt(node.dataset.index);
            return index < this.startIndex || index > this.endIndex;
        });
        
        nodesToRecycle.forEach(node => {
            node.remove();
            this.nodePool.push(node);
            const nodeIndex = this.activeNodes.indexOf(node);
            if (nodeIndex > -1) {
                this.activeNodes.splice(nodeIndex, 1);
            }
        });
    }

    /**
     * Update spacer height
     */
    updateSpacerHeight() {
        this.totalHeight = this.data.length * this.options.itemHeight;
        this.spacer.style.height = `${this.totalHeight}px`;
    }

    /**
     * Update viewport height
     */
    updateViewportHeight() {
        this.viewportHeight = this.container.clientHeight;
        this.calculateVisibleRange();
    }

    /**
     * Setup resize observer
     */
    setupResizeObserver() {
        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    if (entry.target === this.container) {
                        this.updateViewportHeight();
                        this.updateViewport();
                    }
                }
            });
            
            this.resizeObserver.observe(this.container);
        } else {
            // Fallback for browsers without ResizeObserver
            window.addEventListener('resize', this.throttle(() => {
                this.updateViewportHeight();
                this.updateViewport();
            }, 100));
        }
    }

    /**
     * Preload data for upcoming items
     */
    preloadData() {
        const preloadBuffer = 20;
        const preloadStart = Math.max(0, this.endIndex + 1);
        const preloadEnd = Math.min(this.data.length, preloadStart + preloadBuffer);
        
        // Simulate data preloading (customize based on your data source)
        for (let i = preloadStart; i < preloadEnd; i++) {
            if (!this.data[i]) {
                // Load data asynchronously
                this.loadItemData(i);
            }
        }
    }

    /**
     * Load item data asynchronously
     */
    async loadItemData(index) {
        // Override this method based on your data loading needs
        try {
            // Simulate async data loading
            const data = await this.fetchItemData(index);
            this.data[index] = data;
        } catch (error) {
            console.warn(`⚠️ Failed to load data for item ${index}:`, error);
        }
    }

    /**
     * Fetch item data (override this method)
     */
    async fetchItemData(index) {
        // Default implementation - override in your application
        return { id: index, title: `Item ${index}`, content: `Content for item ${index}` };
    }

    /**
     * Default render item function
     */
    defaultRenderItem(data, index) {
        return `
            <div class="virtual-item-content">
                <h5>${data.title || `Item ${index}`}</h5>
                <p>${data.content || `Content for item ${index}`}</p>
            </div>
        `;
    }

    /**
     * Set data
     */
    setData(data) {
        this.data = Array.isArray(data) ? data : [];
        this.scrollTop = 0;
        this.container.scrollTop = 0;
        
        this.calculateVisibleRange();
        this.updateSpacerHeight();
        this.updateViewport();
        
        console.log(`📜 Virtual Scroller loaded ${this.data.length} items`);
    }

    /**
     * Add items to data
     */
    addItems(items, position = 'end') {
        if (position === 'start') {
            this.data.unshift(...items);
        } else {
            this.data.push(...items);
        }
        
        this.updateSpacerHeight();
        this.updateViewport();
    }

    /**
     * Remove item
     */
    removeItem(index) {
        if (index >= 0 && index < this.data.length) {
            this.data.splice(index, 1);
            this.updateSpacerHeight();
            this.updateViewport();
        }
    }

    /**
     * Scroll to item
     */
    scrollToItem(index, alignment = 'start') {
        if (index < 0 || index >= this.data.length) return;
        
        const itemHeight = this.options.itemHeight;
        let scrollTop;
        
        switch (alignment) {
            case 'center':
                scrollTop = (index * itemHeight) - (this.viewportHeight / 2) + (itemHeight / 2);
                break;
            case 'end':
                scrollTop = (index * itemHeight) - this.viewportHeight + itemHeight;
                break;
            default: // 'start'
                scrollTop = index * itemHeight;
        }
        
        scrollTop = Math.max(0, Math.min(scrollTop, this.totalHeight - this.viewportHeight));
        this.container.scrollTop = scrollTop;
    }

    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        this.performanceMetrics.lastFrameTime = performance.now();
        
        // Monitor FPS
        const fpsMeter = () => {
            this.updateFPS();
            requestAnimationFrame(fpsMeter);
        };
        requestAnimationFrame(fpsMeter);
        
        // Log performance periodically
        setInterval(() => {
            const metrics = this.getPerformanceMetrics();
            if (metrics.scrollEvents > 0) {
                console.log('📜 Virtual Scroller Performance:', metrics);
            }
        }, 10000); // Every 10 seconds
    }

    /**
     * Update FPS calculation
     */
    updateFPS() {
        const now = performance.now();
        const delta = now - this.performanceMetrics.lastFrameTime;
        this.performanceMetrics.fps = 1000 / delta;
        this.performanceMetrics.lastFrameTime = now;
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            visibleItems: this.visibleItemCount,
            totalItems: this.data.length,
            nodePoolSize: this.nodePool.length,
            activeNodes: this.activeNodes.length,
            memoryEfficient: this.performanceMetrics.nodeRecycles > 0
        };
    }

    /**
     * Throttle function
     */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Destroy virtual scroller
     */
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        this.container.removeEventListener('scroll', this.handleScroll);
        this.container.innerHTML = '';
        
        this.nodePool = [];
        this.activeNodes = [];
        this.data = [];
        
        console.log('🗑️ Virtual Scroller destroyed');
    }
}

// Export para uso global
window.VirtualScroller = VirtualScroller;

/**
 * Helper function para criar virtual scroller
 */
window.createVirtualScroller = function(container, options) {
    return new VirtualScroller(container, options);
};

console.log('📜 Virtual Scroller module loaded');