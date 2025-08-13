# Security Audit (COLEAM00)

You are implementing the native Claude Code slash command `/security-audit` using the COLEAM00 methodology and Context Engineering Level 4.

## Command Purpose
Perform comprehensive security assessment including vulnerability scanning, penetration testing, compliance validation, and Context Engineering security analysis.

## Parameters
- `$ARGUMENTS` - Audit scope: `full`, `dependencies`, `api`, `database`, `authentication`, `multi-tenant`, `context-engineering` (default: full)

## Implementation Process

### 1. **Dependency Security Audit**

#### **Vulnerability Scanning**
```bash
# Run comprehensive dependency audit
npm audit --audit-level=moderate
npm audit fix --dry-run

# Advanced vulnerability scanning
npx audit-ci --moderate
npx better-npm-audit audit
```

#### **License Compliance**
- Check license compatibility for all dependencies
- Identify potential legal issues
- Validate open source license compliance
- Generate license attribution report

#### **Outdated Package Analysis**
- Identify packages with known vulnerabilities
- Check for available security patches
- Analyze breaking changes in updates
- Generate update recommendations

### 2. **API Security Assessment**

#### **Authentication & Authorization**
```typescript
// Test JWT implementation security
describe('Authentication Security', () => {
  test('JWT token validation', () => {
    // Test token expiration, signature validation
  });
  
  test('Role-based access control', () => {
    // Test RBAC implementation
  });
});
```

#### **Input Validation Testing**
- SQL injection vulnerability testing
- XSS (Cross-Site Scripting) protection validation
- Command injection prevention
- Path traversal vulnerability testing
- Input sanitization effectiveness

#### **API Endpoint Security**
- Rate limiting implementation validation
- CORS configuration review
- HTTP security headers verification
- SSL/TLS configuration assessment
- API versioning security implications

### 3. **Database Security Analysis**

#### **Row Level Security (RLS) Validation**
```sql
-- Test RLS policies for multi-tenant isolation
SELECT * FROM test_tenant_isolation();
SELECT * FROM validate_rls_policies();
```

#### **Data Protection Assessment**
- Encryption at rest validation
- Encryption in transit verification
- PII (Personally Identifiable Information) protection
- Data anonymization implementation
- Backup security validation

#### **Access Control Review**
- Database user permissions audit
- Service account security validation
- Connection string security
- Database firewall configuration
- Audit logging effectiveness

### 4. **Multi-Tenant Security Audit**

#### **Tenant Isolation Validation**
```typescript
// Test tenant data isolation
describe('Multi-Tenant Security', () => {
  test('Data isolation between tenants', async () => {
    // Verify no cross-tenant data access
  });
  
  test('Context Engineering isolation', async () => {
    // Test Context Engineering memory isolation
  });
});
```

#### **Cross-Tenant Attack Prevention**
- Tenant ID manipulation testing
- Resource sharing vulnerability assessment
- Context bleeding prevention validation
- Session isolation verification
- Cache isolation testing

### 5. **Context Engineering Security Analysis**

#### **Memory System Security**
```typescript
// Test Context Engineering security
describe('Context Engineering Security', () => {
  test('Memory isolation', () => {
    // Test 4-layer memory system isolation
  });
  
  test('Context field encryption', () => {
    // Test dynamic context field protection
  });
});
```

#### **AI Processing Security**
- Prompt injection vulnerability testing
- Context manipulation prevention
- AI model output sanitization
- Knowledge base access control
- Meta-recursion security boundaries

#### **Validation Gate Security**
- Quality gate bypass prevention
- Validation logic security
- Meta-recursion tampering protection
- Optimization cycle security
- Field strength manipulation prevention

### 6. **WhatsApp Integration Security**

#### **Webhook Security**
- Webhook signature verification
- Message replay attack prevention
- Rate limiting on webhook endpoints
- Input validation for incoming messages
- Media file security scanning

#### **Business API Security**
- Access token security validation
- Phone number verification security
- Template message security
- Media upload security
- Compliance with WhatsApp policies

### 7. **External Service Security**

#### **OpenAI API Security**
- API key security validation
- Rate limiting compliance
- Data privacy in AI requests
- Response sanitization
- Audit logging for AI interactions

#### **Payment Processing Security**
- Stripe webhook signature validation
- PCI DSS compliance assessment
- Payment data encryption
- Fraud detection implementation
- Subscription security validation

#### **Google Calendar Security**
- OAuth 2.0 implementation security
- Token refresh security
- Calendar data protection
- Access scope validation
- Audit logging for calendar operations

### 8. **Infrastructure Security**

#### **Environment Security**
- Environment variable protection
- Secret management validation
- Configuration security assessment
- Deployment security review
- Container security (if applicable)

#### **Network Security**
- HTTPS enforcement validation
- Security header implementation
- Content Security Policy (CSP) review
- Firewall configuration assessment
- DDoS protection evaluation

### 9. **Compliance Assessment**

#### **Data Protection Regulations**
- GDPR compliance validation
- CCPA compliance assessment
- HIPAA compliance (for healthcare domain)
- Data retention policy validation
- Right to deletion implementation

#### **Industry Standards**
- OWASP Top 10 vulnerability assessment
- NIST Cybersecurity Framework alignment
- ISO 27001 security controls review
- SOC 2 compliance readiness
- Context Engineering security standards

### 10. **Penetration Testing**

#### **Automated Security Testing**
```bash
# Run automated security tests
npx zap-cli quick-scan http://localhost:3000
npm run test:security-automated
```

#### **Manual Security Testing**
- Session management testing
- Business logic vulnerability testing
- Race condition vulnerability assessment
- Time-based attack prevention
- Social engineering vulnerability assessment

## Expected Output Format

```
🔒 Security Audit Report

📊 Overall Security Score: [X]/100

🔍 Vulnerability Summary:
├── Critical: [X] vulnerabilities
├── High: [X] vulnerabilities  
├── Medium: [X] vulnerabilities
└── Low: [X] vulnerabilities

📦 Dependency Security: [Score]/100
├── Vulnerable Packages: [X] found
├── Outdated Packages: [X] requiring updates
├── License Issues: [X] compatibility issues
└── Security Patches: [X] available

🔗 API Security: [Score]/100
├── Authentication: JWT secure ✅
├── Input Validation: [X] vulnerabilities
├── Rate Limiting: Configured ✅
└── HTTPS: Enforced ✅

🗄️  Database Security: [Score]/100
├── RLS Policies: [X] validated ✅
├── Encryption: At rest & transit ✅
├── Access Control: Restricted ✅
└── Audit Logging: Active ✅

🏢 Multi-Tenant Security: [Score]/100
├── Data Isolation: [X] tests passed ✅
├── Context Isolation: Validated ✅
├── Session Management: Secure ✅
└── Resource Sharing: Controlled ✅

🧠 Context Engineering Security: [Score]/100
├── Memory Isolation: [X] layers secure ✅
├── Context Protection: Encrypted ✅
├── Validation Gates: Bypass-proof ✅
└── Meta-Recursion: Secured ✅

📱 WhatsApp Integration: [Score]/100
├── Webhook Security: Signature verified ✅
├── Message Validation: Input sanitized ✅
├── Media Security: Scanned ✅
└── Rate Limiting: Applied ✅

🔌 External Services: [Score]/100
├── OpenAI API: [X] security measures ✅
├── Stripe Payment: PCI compliant ✅
├── Google Calendar: OAuth secure ✅
└── Email Service: Encrypted ✅

⚖️  Compliance: [Score]/100
├── GDPR: [X]% compliant
├── OWASP Top 10: [X] addressed
├── Data Retention: Policies defined ✅
└── Audit Logging: Comprehensive ✅

🚨 Critical Issues:
❌ CVE-2023-XXXX: SQL injection in user input
❌ Weak JWT secret configuration
❌ Missing rate limiting on sensitive endpoints

⚠️  High Priority Issues:
⚠️  Outdated dependency with known vulnerability
⚠️  Insufficient input validation in API endpoint
⚠️  Missing security headers in responses

💡 Medium Priority Issues:
💡 Context Engineering field encryption could be stronger
💡 Audit logging missing for some admin actions
💡 Session timeout could be more restrictive

✅ Security Strengths:
✅ Multi-tenant isolation properly implemented
✅ Context Engineering security measures effective
✅ External API integrations properly secured
✅ Encryption properly implemented

📋 Remediation Plan:
🔧 Immediate Actions (24 hours):
   1. Update vulnerable dependencies
   2. Fix SQL injection vulnerability
   3. Strengthen JWT secret configuration

🔧 Short Term (1 week):
   1. Implement missing rate limiting
   2. Add security headers
   3. Enhance input validation

🔧 Medium Term (1 month):
   1. Strengthen Context Engineering encryption
   2. Implement comprehensive audit logging
   3. Security training for development team

📊 Security Metrics:
├── Vulnerability Density: [X] per 1000 LOC
├── Mean Time to Fix: [X] days
├── Security Test Coverage: [X]%
├── Compliance Score: [X]%
└── Context Engineering Security: [X]%

🔗 Next Steps:
   - Review and implement immediate fixes
   - Schedule penetration testing
   - Update security documentation
   - Use `/performance-audit` for performance security
```

## Audit Scope Options

### Full Security Audit
- Complete security assessment
- All components analyzed
- Comprehensive penetration testing
- Compliance validation

### Dependencies Only
- Package vulnerability scanning
- License compliance check
- Update recommendations
- Security patch analysis

### API Security
- Authentication testing
- Input validation assessment
- Rate limiting validation
- Security header review

### Database Security
- RLS policy validation
- Encryption verification
- Access control review
- Data protection assessment

### Multi-Tenant Security
- Tenant isolation testing
- Cross-tenant attack prevention
- Context isolation validation
- Resource sharing security

### Context Engineering Security
- Memory system isolation
- Context field protection
- Validation gate security
- Meta-recursion boundaries

## Error Handling

- If dependencies not installed: "❌ Dependencies missing. Run `npm install` first."
- If database unavailable: "❌ Database connection failed. Cannot audit database security."
- If external services down: "⚠️ Some external services unavailable. Partial audit completed."
- If security tools missing: "❌ Security scanning tools not available. Install security dependencies."

## Integration Notes

- Integrates with existing CI/CD pipelines
- Supports automated security testing
- Generates compliance reports
- Provides actionable remediation guidance
- Compatible with security monitoring tools

Execute this command by performing comprehensive security assessment with detailed vulnerability analysis and remediation recommendations for maintaining robust security posture.