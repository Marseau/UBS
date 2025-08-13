# Analyze Project Health (COLEAM00)

You are implementing the native Claude Code slash command `/analyze-project` using the COLEAM00 methodology and Context Engineering Level 4.

## Command Purpose
Perform comprehensive project health analysis including code quality, architecture, performance, security, and Context Engineering effectiveness.

## Parameters
- `$ARGUMENTS` - Optional analysis scope: `full`, `code`, `architecture`, `performance`, `security`, `context-engineering` (default: full)

## Implementation Process

### 1. **Project Structure Analysis**

#### **Codebase Metrics**
- Total lines of code by language
- File count and organization
- Directory structure adherence to conventions
- Dependency count and health
- Code duplication analysis

#### **Architecture Assessment**
- Design pattern compliance
- SOLID principles adherence
- Multi-tenant architecture validation
- Service layer organization
- API design quality

#### **COLEAM00 Methodology Compliance**
- PRP templates presence and quality
- Validation gates implementation
- Context Engineering Level 4 integration
- Knowledge base completeness
- Command system functionality

### 2. **Code Quality Analysis**

#### **TypeScript Quality**
```typescript
// Analyze TypeScript configuration
const tsConfig = await analyzeTypeScriptConfig();
const typeErrors = await checkTypeErrors();
const strictModeCompliance = checkStrictMode();
```

#### **ESLint Analysis**
- Rule compliance scoring
- Warning and error counts
- Code style consistency
- Best practices adherence
- Custom rule effectiveness

#### **Code Complexity**
- Cyclomatic complexity per function
- Cognitive complexity analysis
- Technical debt assessment
- Maintainability index
- Code smell detection

#### **Test Coverage Analysis**
- Unit test coverage percentage
- Integration test coverage
- E2E test coverage
- AI scenario test coverage
- Critical path coverage

### 3. **Context Engineering Level 4 Assessment**

#### **Memory System Health**
```typescript
// Analyze memory system performance
const memoryMetrics = {
  working: analyzeWorkingMemory(),
  episodic: analyzeEpisodicMemory(),
  semantic: analyzeSemanticMemory(),
  procedural: analyzeProceduralMemory()
};
```

#### **Dynamic Context Fields**
- Field strength distribution
- Relevance scoring accuracy
- Decay rate optimization
- Dependency mapping effectiveness
- Context quality metrics

#### **Validation Gates Performance**
- Gate 1 (Foundation) success rate
- Gate 2 (Core Logic) effectiveness
- Gate 3 (Integration) quality
- Gate 4 (Production) readiness
- Overall quality scoring

#### **Meta-Recursion Optimization**
- Optimization cycle frequency
- Learning rate effectiveness
- Performance improvement metrics
- Adaptation success rate
- Resource utilization efficiency

### 4. **Performance Analysis**

#### **Application Performance**
- Response time analysis
- Memory usage patterns
- CPU utilization metrics
- Database query performance
- API endpoint efficiency

#### **Context Engineering Performance**
- Context processing latency
- Memory system access times
- Validation gate execution time
- Knowledge base query speed
- AI enhancement overhead

#### **Scalability Assessment**
- Multi-tenant performance isolation
- Load handling capacity
- Resource scaling patterns
- Bottleneck identification
- Optimization opportunities

### 5. **Security Analysis**

#### **Code Security**
- Vulnerability scan results
- Dependency security audit
- Input validation coverage
- Output sanitization verification
- Authentication/authorization review

#### **API Security**
- Endpoint security analysis
- Rate limiting effectiveness
- CORS configuration review
- JWT implementation audit
- SQL injection prevention

#### **Multi-Tenant Security**
- Row Level Security (RLS) validation
- Tenant isolation verification
- Data leakage prevention
- Access control effectiveness
- Audit logging compliance

### 6. **External Integration Health**

#### **WhatsApp Business API**
- Webhook endpoint reliability
- Message delivery rates
- Error handling effectiveness
- Media processing performance
- Template message compliance

#### **AI Services Integration**
- OpenAI API reliability
- Rate limiting compliance
- Error handling robustness
- Response quality metrics
- Cost optimization effectiveness

#### **Database Integration**
- Supabase connection health
- Query performance optimization
- Migration status verification
- Backup and recovery readiness
- Data consistency validation

### 7. **Business Logic Analysis**

#### **Domain-Specific Implementation**
For each business domain (beauty, healthcare, legal, education, sports, consulting):
- Agent specialization quality
- Context adaptation effectiveness
- Business rule compliance
- User experience optimization
- Conversion rate analysis

#### **Booking System Health**
- Appointment creation success rate
- Calendar synchronization accuracy
- Conflict detection effectiveness
- Notification delivery rates
- Payment processing reliability

### 8. **Documentation Quality**

#### **Code Documentation**
- JSDoc coverage percentage
- API documentation completeness
- Architecture decision records
- Setup and deployment guides
- Troubleshooting documentation

#### **COLEAM00 Documentation**
- PRP template quality
- Validation gate documentation
- Context Engineering guides
- Command reference completeness
- Best practices documentation

### 9. **Dependency Analysis**

#### **Package Health**
- Outdated dependency detection
- Security vulnerability assessment
- License compatibility review
- Bundle size optimization
- Tree shaking effectiveness

#### **Context Engineering Dependencies**
- AI service dependency health
- Knowledge base integration status
- Memory system dependencies
- Validation framework status
- Optimization tool effectiveness

## Expected Output Format

```
🔍 Project Health Analysis

📊 Overall Health Score: [X]/100

📁 Project Structure: [Score]/100
├── Files: [X] ([X] LOC)
├── Architecture: COLEAM00 compliant ✅
├── Organization: Well-structured ✅
└── Dependencies: [X] packages ([X] outdated)

💻 Code Quality: [Score]/100
├── TypeScript: [X]/100 (strict mode ✅)
├── ESLint: [X] errors, [X] warnings
├── Complexity: Average [X] (target <10)
└── Test Coverage: [X]% (target >80%)

🧠 Context Engineering Level 4: [Score]/100
├── Memory System: [X]% utilization ✅
├── Dynamic Fields: [X] active fields
├── Validation Gates: [X]% success rate
└── Meta-Recursion: [X] optimization cycles

⚡ Performance: [Score]/100
├── Response Time: [X]ms average
├── Memory Usage: [X]MB peak
├── Database: [X]ms avg query time
└── Context Processing: [X]ms overhead

🔒 Security: [Score]/100
├── Vulnerabilities: [X] found ([X] critical)
├── API Security: Rate limiting ✅
├── Multi-Tenant: RLS policies ✅
└── Authentication: JWT secure ✅

🔗 Integrations: [Score]/100
├── WhatsApp API: [X]% uptime
├── OpenAI API: [X]% success rate
├── Supabase: Connection healthy ✅
└── Google Calendar: Sync active ✅

📚 Documentation: [Score]/100
├── Code Comments: [X]% coverage
├── API Docs: Complete ✅
├── COLEAM00: Templates ready ✅
└── Setup Guides: Up-to-date ✅

📦 Dependencies: [Score]/100
├── Security: [X] vulnerabilities
├── Outdated: [X] packages
├── Bundle Size: [X]MB (optimized)
└── Licenses: Compatible ✅

🎯 Recommendations:
⚠️  High Priority:
   - Fix [X] critical security vulnerabilities
   - Update [X] outdated dependencies
   - Improve test coverage in [modules]

💡 Medium Priority:
   - Optimize [X] slow database queries
   - Reduce cognitive complexity in [functions]
   - Enhance Context Engineering field strength

✨ Low Priority:
   - Update documentation for [features]
   - Optimize bundle size
   - Improve memory usage patterns

📈 Trend Analysis:
   - Code quality: ↗️ Improving
   - Performance: ↔️ Stable
   - Security: ↗️ Improving
   - Context Engineering: ↗️ Optimizing

🔗 Next Steps:
   - Use `/security-audit` for detailed security analysis
   - Use `/performance-audit` for performance optimization
   - Use `/run-tests` to validate current functionality
```

## Analysis Scope Options

### Full Analysis
- Complete project assessment
- All categories analyzed
- Comprehensive recommendations
- Trend analysis included

### Code Analysis
- Code quality metrics only
- TypeScript and ESLint analysis
- Test coverage assessment
- Complexity measurements

### Architecture Analysis
- Design pattern compliance
- Multi-tenant architecture
- Service organization
- API design quality

### Performance Analysis
- Application performance metrics
- Context Engineering overhead
- Database query optimization
- Scalability assessment

### Security Analysis
- Vulnerability scanning
- API security review
- Multi-tenant isolation
- Authentication audit

### Context Engineering Analysis
- Memory system health
- Dynamic field effectiveness
- Validation gate performance
- Meta-recursion optimization

## Error Handling

- If project not initialized: "❌ Project not initialized. Run `/init-project` first."
- If dependencies missing: "❌ Dependencies not installed. Run `/setup-environment` first."
- If analysis fails: "❌ Analysis failed for [component]. Check logs for details."

## Integration Notes

- Uses existing project structure and conventions
- Integrates with Context Engineering Level 4 metrics
- Provides actionable recommendations
- Supports continuous improvement workflows
- Compatible with CI/CD pipeline integration

Execute this command by performing comprehensive project analysis and providing detailed health metrics with actionable recommendations for improvement.