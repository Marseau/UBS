# Performance Audit (COLEAM00)

You are implementing the native Claude Code slash command `/performance-audit` using the COLEAM00 methodology and Context Engineering Level 4.

## Command Purpose
Perform comprehensive performance analysis including application performance, Context Engineering efficiency, database optimization, and scalability assessment with actionable optimization recommendations.

## Parameters
- `$ARGUMENTS` - Audit scope: `full`, `application`, `database`, `context-engineering`, `memory`, `api`, `frontend`, `scalability` (default: full)

## Implementation Process

### 1. **Application Performance Analysis**

#### **Response Time Metrics**
```typescript
// Measure API response times
const performanceMetrics = {
  endpoints: await measureEndpointPerformance(),
  database: await analyzeDatabasePerformance(),
  ai: await measureAIResponseTimes(),
  contextEngineering: await analyzeContextProcessing()
};
```

#### **Memory Usage Analysis**
- Heap memory utilization patterns
- Memory leak detection
- Garbage collection efficiency
- Object allocation profiling
- Context Engineering memory overhead

#### **CPU Utilization Assessment**
- CPU usage during peak loads
- Event loop monitoring
- Blocking operation detection
- Async operation efficiency
- Process resource consumption

### 2. **Context Engineering Level 4 Performance**

#### **Memory System Performance**
```typescript
// Analyze 4-layer memory system efficiency
const memoryPerformance = {
  working: analyzeWorkingMemoryAccess(),
  episodic: analyzeEpisodicMemoryQueries(),
  semantic: analyzeSemanticSearchSpeed(),
  procedural: analyzeOptimizationPatterns()
};
```

#### **Dynamic Context Processing**
- Context field creation latency
- Field strength calculation speed
- Relevance scoring performance
- Dependency mapping efficiency
- Context quality computation time

#### **Validation Gate Performance**
- Gate execution time analysis
- Quality scoring computational overhead
- Validation logic efficiency
- Meta-recursion cycle duration
- Optimization pattern application speed

#### **Knowledge Base Performance**
- Semantic search query speed
- Knowledge retrieval efficiency
- Crawled content indexing performance
- Real-time knowledge updates
- Context-aware knowledge filtering

### 3. **Database Performance Analysis**

#### **Query Performance Assessment**
```sql
-- Analyze slow queries
SELECT query, calls, total_time, mean_time, rows
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC;
```

#### **Connection Pool Optimization**
- Connection pool utilization
- Connection lifecycle analysis
- Pool exhaustion prevention
- Connection timeout optimization
- Idle connection management

#### **Index Performance Review**
- Index usage statistics
- Missing index identification
- Index fragmentation analysis
- Query plan optimization
- B-tree index efficiency

#### **Row Level Security (RLS) Impact**
- RLS policy execution overhead
- Multi-tenant query performance
- Policy compilation efficiency
- Index utilization with RLS
- Tenant isolation performance cost

### 4. **API Performance Optimization**

#### **Endpoint Performance Profiling**
```typescript
// Profile API endpoint performance
const apiMetrics = {
  '/api/appointments': {
    averageResponseTime: 120, // ms
    p95ResponseTime: 250,     // ms
    throughput: 100,          // req/sec
    errorRate: 0.1           // %
  }
};
```

#### **Rate Limiting Impact**
- Rate limiting algorithm efficiency
- Throttling overhead measurement
- Cache hit/miss ratios
- Request queuing performance
- Burst handling capabilities

#### **Middleware Performance**
- Authentication middleware overhead
- Logging middleware impact
- Compression middleware efficiency
- CORS handling performance
- Security middleware latency

### 5. **AI Services Performance**

#### **OpenAI API Integration**
- Request/response latency analysis
- Token usage optimization
- Rate limiting compliance impact
- Context Engineering enhancement overhead
- Multi-modal processing performance

#### **Context-Aware Processing**
- Intent recognition speed
- Function calling latency
- Context building overhead
- Response generation time
- Multi-domain agent switching

#### **Memory and Learning Performance**
- Conversation context loading speed
- Historical data retrieval efficiency
- Learning algorithm performance
- Pattern recognition speed
- Adaptation cycle timing

### 6. **Frontend Performance Analysis**

#### **Dashboard Performance**
```javascript
// Measure frontend performance metrics
const frontendMetrics = {
  firstContentfulPaint: performance.getEntriesByType('paint')[0].startTime,
  largestContentfulPaint: getLCP(),
  cumulativeLayoutShift: getCLS(),
  firstInputDelay: getFID()
};
```

#### **Real-time Updates Performance**
- WebSocket connection efficiency
- Server-sent events performance
- Data synchronization speed
- Chart rendering performance
- Mobile responsiveness metrics

#### **Bundle Optimization**
- JavaScript bundle size analysis
- CSS optimization opportunities
- Image optimization effectiveness
- Lazy loading implementation
- Code splitting efficiency

### 7. **Multi-Tenant Performance**

#### **Tenant Isolation Overhead**
```typescript
// Measure multi-tenant performance impact
const tenantMetrics = {
  isolationOverhead: measureRLSOverhead(),
  contextSwitching: measureTenantSwitching(),
  resourceSharing: analyzeResourceUtilization(),
  scaling: assessTenantScaling()
};
```

#### **Resource Utilization**
- Per-tenant resource consumption
- Shared resource efficiency
- Tenant scaling patterns
- Resource limit enforcement
- Performance isolation validation

### 8. **Scalability Assessment**

#### **Load Testing Results**
- Concurrent user capacity
- Throughput under load
- Response time degradation
- Error rate escalation
- Resource exhaustion points

#### **Horizontal Scaling Analysis**
- Load balancer performance
- Session affinity impact
- Database connection scaling
- Cache distribution efficiency
- Microservice communication overhead

#### **Vertical Scaling Opportunities**
- CPU scaling effectiveness
- Memory scaling benefits
- Storage I/O optimization
- Network bandwidth utilization
- Context Engineering scaling patterns

### 9. **External Service Performance**

#### **WhatsApp Business API**
- Webhook processing latency
- Message delivery performance
- Media upload/download speed
- Template message sending efficiency
- Error handling overhead

#### **Payment Processing**
- Stripe API response times
- Payment verification speed
- Webhook processing performance
- Subscription management efficiency
- Fraud detection impact

#### **Calendar Integration**
- Google Calendar API latency
- Sync operation performance
- Conflict detection speed
- Availability checking efficiency
- Event creation/update performance

### 10. **Caching Strategy Analysis**

#### **Cache Performance Metrics**
```typescript
// Analyze caching effectiveness
const cacheMetrics = {
  hitRate: calculateCacheHitRate(),
  missRate: calculateCacheMissRate(),
  evictionRate: calculateEvictionRate(),
  memoryUsage: getCacheMemoryUsage(),
  accessPatterns: analyzeCacheAccessPatterns()
};
```

#### **Context Engineering Caching**
- Context field caching efficiency
- Memory system cache performance
- Knowledge base caching effectiveness
- Validation result caching
- Optimization pattern caching

## Expected Output Format

```
⚡ Performance Audit Report

📊 Overall Performance Score: [X]/100

🏃‍♂️ Application Performance: [Score]/100
├── Response Time: [X]ms average (target <200ms)
├── Memory Usage: [X]MB peak (target <512MB)
├── CPU Utilization: [X]% average (target <70%)
└── Throughput: [X] req/sec (target >100 req/sec)

🧠 Context Engineering L4 Performance: [Score]/100
├── Memory System: [X]ms access time
├── Context Processing: [X]ms average
├── Validation Gates: [X]ms execution
└── Knowledge Base: [X]ms query time

🗄️  Database Performance: [Score]/100
├── Query Time: [X]ms average (target <50ms)
├── Connection Pool: [X]% utilization
├── Index Usage: [X]% efficiency
└── RLS Overhead: [X]ms additional

🔗 API Performance: [Score]/100
├── Endpoint Response: [X]ms average
├── Rate Limiting: [X]ms overhead
├── Middleware: [X]ms total overhead
└── Error Rate: [X]% (target <1%)

🤖 AI Services Performance: [Score]/100
├── OpenAI API: [X]ms response time
├── Intent Recognition: [X]ms processing
├── Context Building: [X]ms overhead
└── Function Calls: [X]ms execution

🎨 Frontend Performance: [Score]/100
├── First Contentful Paint: [X]ms
├── Largest Contentful Paint: [X]ms
├── Cumulative Layout Shift: [X]
└── Bundle Size: [X]MB

🏢 Multi-Tenant Performance: [Score]/100
├── Isolation Overhead: [X]ms
├── Context Switching: [X]ms
├── Resource Sharing: [X]% efficiency
└── Tenant Scaling: Linear ✅

📈 Scalability Assessment: [Score]/100
├── Concurrent Users: [X] supported
├── Load Testing: [X]% performance drop
├── Horizontal Scaling: Ready ✅
└── Vertical Scaling: [X]x improvement

🔌 External Services: [Score]/100
├── WhatsApp API: [X]ms average
├── Payment Processing: [X]ms
├── Calendar Sync: [X]ms
└── Email Service: [X]ms

💾 Caching Performance: [Score]/100
├── Cache Hit Rate: [X]%
├── Memory Usage: [X]MB
├── Eviction Rate: [X]%
└── Access Patterns: Optimized ✅

🚨 Performance Bottlenecks:
❌ Database query optimization needed (users table)
❌ Context Engineering memory usage high
❌ Frontend bundle size exceeds target

⚠️  Performance Issues:
⚠️  API endpoint /api/appointments slow ([X]ms)
⚠️  Memory leak in AI conversation service
⚠️  Cache hit rate below target ([X]%)

💡 Optimization Opportunities:
💡 Add database indexes for frequent queries
💡 Implement Redis caching for API responses
💡 Optimize Context Engineering field storage
💡 Enable frontend code splitting

📊 Performance Trends:
├── Response Time: ↗️ Increasing (investigate)
├── Memory Usage: ↔️ Stable
├── Throughput: ↗️ Improving
├── Error Rate: ↘️ Decreasing ✅
└── Cache Efficiency: ↗️ Improving

🔧 Optimization Recommendations:

🚀 High Impact (Immediate):
   1. Add composite index on appointments (tenant_id, created_at)
   2. Implement Redis caching for user sessions
   3. Optimize Context Engineering memory cleanup
   4. Bundle size reduction through tree shaking

📈 Medium Impact (This Week):
   1. Database connection pool optimization
   2. API response compression implementation
   3. Frontend image optimization
   4. Context field pruning algorithm

🔄 Long Term (This Month):
   1. Implement horizontal scaling strategy
   2. Advanced caching layer architecture
   3. Context Engineering performance monitoring
   4. AI response caching system

📊 Performance Benchmarks:
├── Target Response Time: <200ms (Current: [X]ms)
├── Target Memory Usage: <512MB (Current: [X]MB)
├── Target Throughput: >100 req/sec (Current: [X])
├── Target Error Rate: <1% (Current: [X]%)
└── Target Cache Hit Rate: >80% (Current: [X]%)

🧠 Context Engineering Metrics:
├── Field Creation: [X]ms average
├── Memory Access: [X]ms per layer
├── Validation Speed: [X]ms per gate
├── Optimization Cycles: [X]/hour
└── Knowledge Queries: [X]ms average

🔗 Next Steps:
   - Implement high-impact optimizations
   - Set up performance monitoring alerts
   - Schedule regular performance reviews
   - Use `/analyze-project` for overall health check
```

## Audit Scope Options

### Full Performance Audit
- Complete performance assessment
- All components analyzed
- Scalability testing included
- Optimization roadmap provided

### Application Performance
- Core application metrics only
- Response time analysis
- Memory and CPU profiling
- Throughput measurement

### Database Performance
- Query optimization analysis
- Index usage review
- Connection pool assessment
- RLS performance impact

### Context Engineering Performance
- Memory system efficiency
- Context processing speed
- Validation gate performance
- Knowledge base optimization

### API Performance
- Endpoint response times
- Middleware overhead
- Rate limiting impact
- Error rate analysis

### Frontend Performance
- Web vitals measurement
- Bundle size analysis
- Rendering performance
- Mobile optimization

### Scalability Assessment
- Load testing results
- Scaling strategy validation
- Resource utilization analysis
- Performance under stress

## Error Handling

- If performance tools missing: "❌ Performance monitoring tools not available."
- If load testing fails: "❌ Load testing failed. Check system resources."
- If database unreachable: "❌ Cannot analyze database performance. Check connection."
- If external services down: "⚠️ Some external services unavailable. Partial audit completed."

## Integration Notes

- Integrates with APM (Application Performance Monitoring) tools
- Supports continuous performance monitoring
- Provides automated optimization suggestions
- Compatible with CI/CD performance gates
- Generates performance regression reports

Execute this command by performing comprehensive performance analysis with detailed metrics and actionable optimization recommendations for maintaining optimal system performance.