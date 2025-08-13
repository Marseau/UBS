# Initialize Project (COLEAM00)

You are implementing the native Claude Code slash command `/init-project` using the COLEAM00 methodology and Context Engineering Level 4.

## Command Purpose
Initialize a new project with COLEAM00 methodology, Context Engineering Level 4, and complete development infrastructure.

## Parameters
- `$ARGUMENTS` - Project configuration in format: `<type> <name> [domain]` 
  - `type`: react, node, fullstack, whatsapp-saas, mobile
  - `name`: Project name (kebab-case)
  - `domain`: Optional business domain (beauty, healthcare, legal, education, sports, consulting)

## Implementation Process

### 1. **Parse Arguments and Validate**
- Extract project type, name, and optional domain from `$ARGUMENTS`
- Validate project type against supported frameworks
- Ensure name follows naming conventions (kebab-case)
- Set default domain to 'general' if not specified

### 2. **Project Structure Creation**

#### **Core Directory Structure**
```
[project-name]/
├── .claude/
│   └── commands/           # Native Claude Code commands
├── COLEAM00/
│   ├── templates/          # PRP and feature templates
│   ├── PRPs/              # Product Requirements Prompts
│   ├── validation-gates/   # Quality gates
│   └── knowledge-base/     # Domain-specific knowledge
├── src/
│   ├── services/          # Business logic services
│   ├── types/             # TypeScript definitions
│   ├── utils/             # Utility functions
│   └── config/            # Configuration files
├── tests/
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── e2e/               # End-to-end tests
├── docs/                  # Documentation
├── scripts/               # Build and deployment scripts
└── database/              # Database schemas and migrations
```

#### **Framework-Specific Structure**

**For React Projects:**
```
src/
├── components/            # React components
├── hooks/                 # Custom hooks
├── pages/                 # Page components
├── context/               # React context providers
├── assets/                # Static assets
└── styles/                # CSS/SCSS files
```

**For Node.js Projects:**
```
src/
├── routes/                # API routes
├── middleware/            # Express middleware
├── models/                # Data models
├── controllers/           # Route controllers
└── database/              # Database connection
```

**For WhatsApp SaaS Projects:**
```
src/
├── services/
│   ├── agents/            # AI agents for each domain
│   ├── whatsapp/          # WhatsApp Business API
│   ├── calendar/          # Google Calendar integration
│   └── context-engineering/ # COLEAM00 implementation
├── routes/
│   ├── api/               # REST API endpoints
│   ├── webhooks/          # WhatsApp webhooks
│   └── admin/             # Admin dashboard
└── frontend/              # Dashboard frontend
```

### 3. **Core Configuration Files**

#### **Package.json**
Generate with:
- Project metadata (name, version, description)
- Dependencies based on project type
- Scripts for development, testing, building
- COLEAM00-specific commands

#### **TypeScript Configuration**
- Strict TypeScript setup with path mapping
- ES2020 target with module resolution
- Source maps for development
- Declaration files for libraries

#### **Environment Configuration**
- `.env.example` with all required variables
- `.env` with development defaults
- Environment validation schema

#### **Git Configuration**
- `.gitignore` with framework-specific patterns
- `.gitattributes` for line ending consistency
- Initial commit with project structure

### 4. **COLEAM00 Methodology Setup**

#### **Templates Creation**
- `COLEAM00/templates/prp-template.md` - Product Requirements Prompt template
- `COLEAM00/templates/feature-template.md` - Feature request template
- `COLEAM00/templates/validation-template.md` - Quality validation template

#### **Validation Gates**
- `COLEAM00/validation-gates/quality-gates.md` - Comprehensive quality gates
- Gate 1: Foundation validation
- Gate 2: Core logic validation
- Gate 3: Integration validation
- Gate 4: Production readiness

#### **Knowledge Base**
- Domain-specific guidelines and patterns
- Best practices for the chosen framework
- Security and performance standards
- Testing strategies and patterns

### 5. **Context Engineering Level 4 Integration**

#### **Context Engineering Service**
```typescript
// src/services/context-engineering.service.ts
class ContextEngineeringService {
  // Level 1: Atomic Context
  // Level 2: Field Theory (Dynamic)
  // Level 3: Protocol System (Validation Gates)
  // Level 4: Meta-Recursion (Self-Optimization)
}
```

#### **Memory System**
- Working Memory: Active session context
- Episodic Memory: Event history and patterns
- Semantic Memory: Learned concepts and relationships
- Procedural Memory: Optimization patterns and workflows

#### **Dynamic Context Fields**
- Real-time context adaptation
- Field strength calculation
- Dependency mapping
- Decay rate management

### 6. **Domain-Specific Initialization**

For each business domain, add specialized components:

#### **Beauty Domain**
- Service categories (hair, nails, skincare, makeup)
- Professional profiles and specializations
- Photo analysis capabilities
- Trend tracking and recommendations

#### **Healthcare Domain**
- Crisis detection protocols
- HIPAA compliance measures
- Therapy session management
- Mental health assessment tools

#### **Legal Domain**
- Case urgency classification
- Attorney specialization matching
- Confidentiality protocols
- Document management systems

#### **Education Domain**
- Subject categorization
- Learning level assessment
- Progress tracking systems
- Adaptive learning algorithms

#### **Sports Domain**
- Activity classification
- Skill level assessment
- Performance tracking
- Workout planning systems

#### **Consulting Domain**
- Business stage assessment
- Industry categorization
- Strategic planning tools
- Growth tracking systems

### 7. **Development Infrastructure**

#### **Testing Setup**
- Jest configuration for unit testing
- Cypress setup for e2e testing
- Testing utilities and helpers
- Mock data and fixtures

#### **Code Quality**
- ESLint configuration with strict rules
- Prettier formatting setup
- Husky pre-commit hooks
- Automated code review tools

#### **CI/CD Pipeline**
- GitHub Actions workflows
- Automated testing on PR
- Build and deployment automation
- Security scanning integration

### 8. **Documentation Generation**

#### **Project Documentation**
- README.md with setup instructions
- CLAUDE.md with development guidelines
- API documentation structure
- Architecture decision records

#### **Development Guides**
- Contributing guidelines
- Code style guide
- Testing strategies
- Deployment procedures

## Expected Output Format

```
🚀 Initializing Project: [project-name]

📋 Configuration:
✅ Type: [project-type]
✅ Name: [project-name]
✅ Domain: [business-domain]
✅ Context Engineering Level: 4

📁 Creating Structure:
✅ Core directories created
✅ Framework-specific structure added
✅ COLEAM00 methodology integrated
✅ Context Engineering Level 4 configured

📦 Installing Dependencies:
✅ Core dependencies installed
✅ Development tools configured
✅ Testing framework setup
✅ Code quality tools configured

🔧 Configuration Files:
✅ package.json generated
✅ TypeScript configuration added
✅ Environment variables setup
✅ Git repository initialized

📚 COLEAM00 Setup:
✅ Templates created
✅ Validation gates configured
✅ Knowledge base initialized
✅ Native slash commands added

🎯 Context Engineering Level 4:
✅ Dynamic context fields enabled
✅ Memory system integrated
✅ Validation gates activated
✅ Meta-recursion optimization ready

💻 Generated Files: [X] files created
📊 Project Health: 100% Ready
🔗 Next Steps: 
   - Run `npm install` to install dependencies
   - Use `/generate-prp [feature]` to plan first feature
   - Use `/setup-environment` to configure development environment
```

## Error Handling

- If project already exists: "❌ Project '[name]' already exists. Choose a different name."
- If invalid type: "❌ Invalid project type. Supported: react, node, fullstack, whatsapp-saas, mobile"
- If invalid domain: "❌ Invalid domain. Supported: beauty, healthcare, legal, education, sports, consulting, general"

## Integration Notes

- Creates project compatible with existing WhatsApp Booking System patterns
- Implements multi-tenant architecture from the start
- Includes Row Level Security setup for database
- Provides Context Engineering Level 4 out of the box
- Sets up all native Claude Code slash commands

Execute this command by creating a complete, production-ready project structure with COLEAM00 methodology and Context Engineering Level 4 fully integrated.