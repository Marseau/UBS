#!/bin/bash

# Memory-Optimized Node.js Startup Script
# Target: <50MB RSS with aggressive V8 optimization
# Usage: ./scripts/memory-optimized-start.sh

echo "🚀 Starting Node.js with aggressive memory optimization..."
echo "📊 Target: <50MB RSS (Current: 90MB → 45% reduction needed)"

# V8 Memory Optimization Flags
NODE_OPTIONS="
--max-old-space-size=128
--max-new-space-size=32
--optimize-for-size
--gc-interval=100
--harmony
--expose-gc
--trace-gc-nvp
--trace-gc-verbose
--use-idle-notification
--max-inlined-source-size=600
--max-inlined-bytecode-size=600
--stress-compaction
--enable-precise-memory-info
--turbo-inline-size-threshold=5
--turbo-max-inlined-bytecode-size=500
--concurrent-marking
--concurrent-sweeping
--parallel-compaction
--memory-reducer
"

export NODE_OPTIONS

# Additional aggressive settings
export V8_FLAGS="
--max-old-space-size=128
--optimize-for-size
--always-compact
--trace-gc
--trace-gc-object-stats
--gc-global
--expose-gc
"

# Memory monitoring
echo "📊 V8 Flags Applied:"
echo "   - Max old space: 128MB"
echo "   - Max new space: 32MB" 
echo "   - Optimize for size: enabled"
echo "   - GC interval: 100ms"
echo "   - Expose GC: enabled"
echo "   - Concurrent marking: enabled"
echo "   - Memory reducer: enabled"

# Start with memory profiling
if [ "$1" = "dev" ]; then
    echo "🔧 Development mode with memory monitoring"
    node --inspect=9229 src/index.ts
elif [ "$1" = "production" ]; then
    echo "🏭 Production mode with memory optimization"
    node src/index.js
elif [ "$1" = "test" ]; then
    echo "🧪 Test mode with memory analysis"
    node --trace-uncaught test-memory-optimization.js
else
    echo "🎯 Standard mode with memory optimization"
    node src/index.ts
fi

echo "✅ Memory-optimized startup completed"