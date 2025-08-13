# Run Tests (COLEAM00)

You are implementing the native Claude Code slash command `/run-tests` using the COLEAM00 methodology and Context Engineering Level 4.

## Command Purpose
Execute comprehensive testing suite including unit tests, integration tests, AI scenario tests, and Context Engineering validation with detailed reporting.

## Parameters
- `$ARGUMENTS` - Test type: `unit`, `integration`, `e2e`, `ai`, `context-engineering`, `security`, `performance`, `all` (default: all)

## Implementation Process

### 1. **Test Environment Preparation**

#### **Environment Setup**
- Validate test environment configuration
- Initialize test database with clean state
- Set up mock external services
- Configure test-specific environment variables
- Clear previous test artifacts

#### **Test Data Preparation**
- Load test fixtures and mock data
- Create multi-tenant test scenarios
- Set up user profiles for different domains
- Initialize conversation states
- Prepare media files for testing

### 2. **Unit Tests Execution**

#### **Core Service Tests**
```typescript
// Test core business logic services
describe('Business Logic Services', () => {
  test('AppointmentService creation', async () => {
    // Test appointment creation with RLS
  });
  
  test('ContextEngineeringService Level 4', async () => {
    // Test Context Engineering functionality
  });
});
```

#### **AI Agent Tests**
- Test each domain agent (beauty, healthcare, legal, education, sports, consulting)
- Validate intent recognition accuracy
- Test function calling mechanisms
- Verify context awareness
- Validate domain-specific logic

#### **Context Engineering Tests**
- Memory system functionality
- Dynamic context field creation
- Validation gate implementation
- Meta-recursion optimization
- Knowledge base integration

#### **Database Layer Tests**
- Repository pattern implementation
- Row Level Security policies
- Multi-tenant data isolation
- Migration and rollback procedures
- Query optimization validation

### 3. **Integration Tests Execution**

#### **API Endpoint Tests**
```typescript
// Test REST API endpoints
describe('API Integration', () => {
  test('POST /api/appointments', async () => {
    // Test appointment creation endpoint
  });
  
  test('Webhook /api/whatsapp/webhook', async () => {
    // Test WhatsApp webhook processing
  });
});
```

#### **External Service Integration**
- WhatsApp Business API integration
- OpenAI API interaction testing
- Google Calendar synchronization
- Stripe payment processing
- Email service functionality

#### **Database Integration**
- Supabase connection and queries
- Real-time subscription testing
- File storage and retrieval
- Backup and recovery procedures
- Performance under load

### 4. **AI Scenario Tests**

#### **Conversation Flow Tests**
```typescript
// Test complete conversation scenarios
const aiTestScenarios = [
  {
    domain: 'beauty',
    scenario: 'Hair appointment booking',
    messages: [...],
    expectedOutcome: 'appointment_created'
  },
  {
    domain: 'healthcare',
    scenario: 'Crisis detection',
    messages: [...],
    expectedOutcome: 'crisis_protocol_activated'
  }
];
```

#### **Context Engineering AI Tests**
- Dynamic context field adaptation
- Memory system learning patterns
- Validation gate quality scoring
- Meta-recursion optimization cycles
- Knowledge base utilization

#### **Multi-Modal Processing Tests**
- Image analysis with GPT-4 Vision
- Audio transcription with Whisper
- Document processing capabilities
- Media file handling workflows
- Content moderation systems

### 5. **End-to-End Tests**

#### **User Journey Tests**
- Complete booking workflow
- User onboarding process
- Payment and confirmation
- Calendar synchronization
- Email notifications

#### **Admin Dashboard Tests**
- Authentication and authorization
- Multi-tenant switching
- Real-time updates
- Data visualization
- Configuration management

#### **WhatsApp Integration Tests**
- Message reception and processing
- Response generation and sending
- Media file handling
- Template message delivery
- Webhook reliability

### 6. **Context Engineering Level 4 Tests**

#### **Memory System Tests**
```typescript
describe('Context Engineering Level 4', () => {
  test('4-Layer Memory System', async () => {
    // Test working, episodic, semantic, procedural memory
  });
  
  test('Meta-Recursion Optimization', async () => {
    // Test self-optimization cycles
  });
});
```

#### **Dynamic Context Tests**
- Field strength calculation
- Relevance scoring accuracy
- Decay rate management
- Dependency mapping
- Context quality metrics

#### **Validation Gates Tests**
- Gate 1: Foundation validation
- Gate 2: Core logic validation
- Gate 3: Integration validation
- Gate 4: Production readiness
- Quality scoring algorithms

### 7. **Performance Tests**

#### **Load Testing**
- Concurrent user simulation
- API endpoint stress testing
- Database performance under load
- Memory usage patterns
- Response time analysis

#### **Context Engineering Performance**
- Context processing latency
- Memory system efficiency
- Validation gate speed
- Knowledge base query performance
- AI enhancement overhead

### 8. **Security Tests**

#### **Authentication Tests**
- JWT token validation
- Session management
- Password security
- Role-based access control
- Multi-tenant isolation

#### **API Security Tests**
- Input validation
- SQL injection prevention
- XSS protection
- Rate limiting effectiveness
- CORS configuration

#### **Data Protection Tests**
- Encryption verification
- Secure data transmission
- PII protection
- Audit logging
- Backup security

## Expected Output Format

```
🧪 Running Test Suite

📋 Test Configuration:
✅ Environment: test
✅ Database: clean state initialized
✅ Mock services: configured
✅ Test data: loaded

🔬 Unit Tests: [X]/[Y] passed ([Z]% coverage)
├── Services: [X]/[Y] ✅
├── AI Agents: [X]/[Y] ✅
├── Context Engineering: [X]/[Y] ✅
└── Database: [X]/[Y] ✅

🔗 Integration Tests: [X]/[Y] passed
├── API Endpoints: [X]/[Y] ✅
├── External Services: [X]/[Y] ✅
├── Database Integration: [X]/[Y] ✅
└── Real-time Features: [X]/[Y] ✅

🤖 AI Scenario Tests: [X]/[Y] passed
├── Beauty Domain: [X]/[Y] ✅
├── Healthcare Domain: [X]/[Y] ✅
├── Legal Domain: [X]/[Y] ✅
├── Education Domain: [X]/[Y] ✅
├── Sports Domain: [X]/[Y] ✅
└── Consulting Domain: [X]/[Y] ✅

🧠 Context Engineering L4 Tests: [X]/[Y] passed
├── Memory System: [X]/[Y] ✅
├── Dynamic Fields: [X]/[Y] ✅
├── Validation Gates: [X]/[Y] ✅
└── Meta-Recursion: [X]/[Y] ✅

🎭 End-to-End Tests: [X]/[Y] passed
├── User Journeys: [X]/[Y] ✅
├── Admin Dashboard: [X]/[Y] ✅
├── WhatsApp Integration: [X]/[Y] ✅
└── Payment Processing: [X]/[Y] ✅

⚡ Performance Tests: [X]/[Y] passed
├── Load Testing: [X]/[Y] ✅
├── Response Times: Avg [X]ms ✅
├── Memory Usage: [X]MB peak ✅
└── Context Processing: [X]ms ✅

🔒 Security Tests: [X]/[Y] passed
├── Authentication: [X]/[Y] ✅
├── API Security: [X]/[Y] ✅
├── Data Protection: [X]/[Y] ✅
└── Multi-Tenant Isolation: [X]/[Y] ✅

📊 Test Coverage Summary:
├── Overall Coverage: [X]%
├── Statements: [X]%
├── Branches: [X]%
├── Functions: [X]%
└── Lines: [X]%

🎯 Test Results:
✅ Passed: [X] tests
❌ Failed: [Y] tests
⏭️  Skipped: [Z] tests
⏱️  Duration: [X]s

❌ Failed Tests:
├── test/unit/service.test.ts:45 - Context field validation
├── test/integration/api.test.ts:123 - Rate limiting
└── test/e2e/booking.test.ts:67 - Payment processing

📈 Performance Metrics:
├── Average Response Time: [X]ms
├── Memory Peak Usage: [X]MB
├── Database Query Time: [X]ms
├── Context Processing: [X]ms
└── AI Response Time: [X]ms

🧠 Context Engineering Metrics:
├── Field Strength: [X]/100 average
├── Memory Utilization: [X]%
├── Validation Success: [X]%
├── Optimization Cycles: [X]
└── Knowledge Base Hits: [X]%

🔗 Next Steps:
   - Fix [X] failing tests
   - Improve coverage for [modules]
   - Optimize performance for [components]
   - Use `/security-audit` for detailed security review
```

## Test Type Options

### Unit Tests Only
```bash
npm run test:unit
# OR using native command
/run-tests unit
```

### Integration Tests Only
```bash
npm run test:integration
# OR using native command
/run-tests integration
```

### AI Scenario Tests
```bash
npm run test:ai
# OR using native command
/run-tests ai
```

### Context Engineering Tests
```bash
npm run test:context-engineering
# OR using native command
/run-tests context-engineering
```

### Performance Tests
```bash
npm run test:performance
# OR using native command
/run-tests performance
```

### Security Tests
```bash
npm run test:security
# OR using native command
/run-tests security
```

### All Tests
```bash
npm run test:all
# OR using native command
/run-tests all
```

## Error Handling

- If test environment not configured: "❌ Test environment not set up. Run `/setup-environment` first."
- If dependencies missing: "❌ Test dependencies not installed. Run `npm install`."
- If database connection fails: "❌ Test database connection failed. Check configuration."
- If tests fail: "❌ [X] tests failed. See output above for details."

## Integration with CI/CD

### GitHub Actions Integration
```yaml
- name: Run Tests
  run: npm run test:all
  
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

### Quality Gates Integration
- Minimum test coverage threshold (80%)
- Maximum acceptable failed tests (0)
- Performance benchmark requirements
- Security test compliance
- Context Engineering validation requirements

Execute this command by running comprehensive tests with detailed reporting and actionable insights for maintaining code quality and system reliability.