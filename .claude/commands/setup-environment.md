# Setup Development Environment (COLEAM00)

You are implementing the native Claude Code slash command `/setup-environment` using the COLEAM00 methodology and Context Engineering Level 4.

## Command Purpose
Configure complete development environment with dependencies, tools, services, and Context Engineering Level 4 integration.

## Parameters
- `$ARGUMENTS` - Optional environment type: `development`, `staging`, `production`, or `local` (default: development)

## Implementation Process

### 1. **Environment Detection and Validation**
- Detect current operating system (macOS, Linux, Windows)
- Check Node.js version (minimum v18.0.0)
- Verify npm/yarn availability
- Validate git installation and configuration
- Check for Docker if required

### 2. **Project Dependencies Installation**

#### **Core Dependencies**
```bash
# Install project dependencies
npm install

# Install development dependencies
npm install --only=dev

# Global tool installation
npm install -g typescript@latest
npm install -g @types/node@latest
```

#### **Framework-Specific Dependencies**

**For React Projects:**
- React 18+ with TypeScript
- Vite or Create React App
- Testing Library suite
- Storybook for component development

**For Node.js Projects:**
- Express.js with TypeScript
- Helmet for security
- Morgan for logging
- Jest for testing

**For WhatsApp SaaS Projects:**
- WhatsApp Business API SDK
- Supabase client
- OpenAI API client
- Google Calendar API
- Stripe SDK

### 3. **Development Tools Configuration**

#### **Code Editor Setup**
Configure VS Code with essential extensions:
- TypeScript support
- ESLint integration
- Prettier formatting
- GitLens for git integration
- Thunder Client for API testing
- Context Engineering syntax highlighting

#### **Git Configuration**
```bash
# Set up git hooks
npx husky install
npx husky add .husky/pre-commit "npm run lint && npm run test"
npx husky add .husky/commit-msg "npm run validate-commit"

# Configure git aliases
git config alias.co checkout
git config alias.br branch
git config alias.ci commit
git config alias.st status
```

#### **Environment Variables Setup**
- Copy `.env.example` to `.env`
- Generate secure values for secrets
- Configure API keys (OpenAI, Supabase, etc.)
- Set up Context Engineering parameters

### 4. **Database Configuration**

#### **Local Database Setup**
For projects requiring database:
- Install PostgreSQL locally or configure Docker
- Create development database
- Run initial migrations
- Seed with sample data

#### **Supabase Integration**
For SaaS projects:
- Configure Supabase connection
- Set up Row Level Security policies
- Initialize authentication
- Create multi-tenant schema

#### **Context Engineering Database**
- Create `crawled_pages` table for knowledge base
- Initialize `context_fields` for dynamic context
- Set up `memory_states` for 4-layer memory system
- Configure `validation_logs` for quality tracking

### 5. **Context Engineering Level 4 Configuration**

#### **Memory System Initialization**
```typescript
// Initialize 4-layer memory system
const memorySystem = {
  working: new Map(),      // Active session context
  episodic: [],           // Event history
  semantic: new Map(),    // Learned concepts
  procedural: new Map()   // Optimization patterns
};
```

#### **Dynamic Context Fields Setup**
- Configure field strength calculation
- Set up relevance scoring algorithms
- Initialize decay rate management
- Enable dependency mapping

#### **Validation Gates Configuration**
- Set up 4-tier quality gates
- Configure validation thresholds
- Enable automatic quality scoring
- Initialize meta-recursion optimization

#### **Knowledge Base Population**
- Crawl and index domain-specific documentation
- Import competitive intelligence data
- Set up semantic search capabilities
- Configure real-time knowledge updates

### 6. **External Services Integration**

#### **AI Services**
- Configure OpenAI API with proper rate limiting
- Set up Anthropic Claude integration
- Initialize multi-modal processing (GPT-4 Vision, Whisper)
- Configure Context Engineering AI enhancement

#### **Communication Services**
- WhatsApp Business API setup and verification
- Webhook endpoint configuration
- Template message approval
- Media handling setup

#### **Calendar Integration**
- Google Calendar API authentication
- OAuth 2.0 flow configuration
- Calendar sync token setup
- Conflict detection algorithms

#### **Payment Processing**
- Stripe API configuration
- Webhook endpoint setup
- Subscription management
- Invoice automation

### 7. **Development Server Configuration**

#### **Local Development**
```bash
# Start development server with hot reload
npm run dev

# Alternative port configuration
npm run dev:alt

# Watch mode for TypeScript compilation
npm run build:watch
```

#### **Environment-Specific Configuration**
- Development: Hot reload, detailed logging, debug mode
- Staging: Production-like, limited logging, testing data
- Production: Optimized, minimal logging, real data
- Local: Offline-first, mock services, sample data

### 8. **Testing Infrastructure Setup**

#### **Testing Framework Configuration**
- Jest for unit testing with TypeScript support
- Supertest for API endpoint testing
- Cypress for end-to-end testing
- Testing utilities and helpers

#### **AI Testing Setup**
- Context Engineering test scenarios
- AI agent conversation flows
- Intent recognition accuracy tests
- Function calling validation
- Performance benchmarking

#### **Coverage and Quality**
- Code coverage reporting with Istanbul
- Quality gates integration
- Automated testing on file changes
- CI/CD pipeline triggers

### 9. **Monitoring and Analytics Setup**

#### **Application Monitoring**
- Error tracking with structured logging
- Performance monitoring
- Health check endpoints
- Resource usage tracking

#### **Context Engineering Metrics**
- Field strength monitoring
- Memory utilization tracking
- Validation gate success rates
- Meta-recursion optimization metrics

#### **Business Metrics**
- User engagement tracking
- Conversion rate monitoring
- Revenue and subscription metrics
- Domain-specific KPIs

### 10. **Security Configuration**

#### **API Security**
- Rate limiting configuration
- CORS policy setup
- Authentication middleware
- Input validation schemas

#### **Data Protection**
- Encryption key generation
- Secure environment variable storage
- Database connection security
- Multi-tenant data isolation

#### **Context Engineering Security**
- Memory isolation between tenants
- Context data encryption
- Validation gate bypass prevention
- Audit logging for optimization cycles

## Expected Output Format

```
🔧 Setting up Development Environment

📋 Environment: [environment-type]
🖥️  Platform: [OS] ([architecture])
📦 Node.js: [version] ✅

🔧 Core Installation:
✅ Dependencies installed ([X] packages)
✅ Development tools configured
✅ Git hooks activated
✅ VS Code extensions configured

🗄️  Database Setup:
✅ PostgreSQL configured
✅ Supabase connection established
✅ Migrations executed
✅ Sample data seeded

🧠 Context Engineering Level 4:
✅ Memory system initialized
✅ Dynamic context fields configured
✅ Validation gates activated
✅ Knowledge base populated ([X] sources)

🔗 External Services:
✅ OpenAI API configured
✅ WhatsApp Business API connected
✅ Google Calendar integrated
✅ Stripe payment processing ready

🧪 Testing Infrastructure:
✅ Jest unit testing configured
✅ Cypress e2e testing setup
✅ AI scenario testing ready
✅ Coverage reporting enabled

📊 Monitoring Setup:
✅ Error tracking configured
✅ Performance monitoring active
✅ Context Engineering metrics enabled
✅ Business analytics ready

🔒 Security Configuration:
✅ API security measures active
✅ Data encryption configured
✅ Multi-tenant isolation verified
✅ Audit logging enabled

🎯 Environment Status: 100% Ready
🚀 Development server: http://localhost:3000
📱 WhatsApp webhook: [webhook-url]
📊 Dashboard: http://localhost:3000/admin

🔗 Next Steps:
   - Run `npm run dev` to start development
   - Use `/analyze-project` to check project health
   - Use `/generate-prp [feature]` to plan first feature
```

## Error Handling

- If Node.js version insufficient: "❌ Node.js v18+ required. Current: [version]"
- If dependencies fail: "❌ Dependency installation failed. Check network connection."
- If database connection fails: "❌ Database connection failed. Check configuration."
- If API keys missing: "⚠️ API keys not configured. Some features will be limited."

## Environment-Specific Configurations

### Development Environment
- Hot reload enabled
- Detailed error logging
- Debug mode active
- Mock data for testing
- Local database instance

### Staging Environment
- Production-like configuration
- Limited logging for performance
- Test data with realistic scenarios
- External service integration testing
- Performance monitoring active

### Production Environment
- Optimized build configuration
- Minimal logging for security
- Real data and live integrations
- Full monitoring and alerting
- Backup and disaster recovery

### Local Environment
- Offline-first development
- Mock external services
- Sample data for development
- Fast startup and rebuild
- Development-friendly defaults

Execute this command by configuring a complete development environment with all necessary tools, services, and Context Engineering Level 4 integration for productive development.