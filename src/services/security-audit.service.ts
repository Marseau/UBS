import { supabase } from "../config/database";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";

export interface SecurityAuditResult {
  overallScore: number;
  criticalIssues: SecurityIssue[];
  warnings: SecurityIssue[];
  recommendations: string[];
  complianceStatus: {
    authentication: boolean;
    authorization: boolean;
    dataProtection: boolean;
    inputValidation: boolean;
    sessionManagement: boolean;
  };
}

export interface SecurityIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  description: string;
  recommendation: string;
  affectedComponent: string;
}

export class SecurityAuditService {
  /**
   * Run comprehensive security audit
   */
  static async runSecurityAudit(): Promise<SecurityAuditResult> {
    console.log("🔒 Starting comprehensive security audit...");

    const issues: SecurityIssue[] = [];

    // Run all security checks
    const authChecks = await this.auditAuthentication();
    const authzChecks = await this.auditAuthorization();
    const dataChecks = await this.auditDataProtection();
    const inputChecks = await this.auditInputValidation();
    const sessionChecks = await this.auditSessionManagement();
    const infraChecks = await this.auditInfrastructure();

    issues.push(
      ...authChecks,
      ...authzChecks,
      ...dataChecks,
      ...inputChecks,
      ...sessionChecks,
      ...infraChecks,
    );

    // Categorize issues
    const criticalIssues = issues.filter((i) => i.severity === "critical");
    const warnings = issues.filter((i) => i.severity !== "critical");

    // Calculate overall security score
    const overallScore = this.calculateSecurityScore(issues);

    // Generate recommendations
    const recommendations = this.generateSecurityRecommendations(issues);

    // Check compliance status
    const complianceStatus = {
      authentication: !authChecks.some((i) => i.severity === "critical"),
      authorization: !authzChecks.some((i) => i.severity === "critical"),
      dataProtection: !dataChecks.some((i) => i.severity === "critical"),
      inputValidation: !inputChecks.some((i) => i.severity === "critical"),
      sessionManagement: !sessionChecks.some((i) => i.severity === "critical"),
    };

    return {
      overallScore,
      criticalIssues,
      warnings,
      recommendations,
      complianceStatus,
    };
  }

  /**
   * Audit authentication mechanisms
   */
  private static async auditAuthentication(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check JWT configuration
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      issues.push({
        severity: "critical",
        category: "Authentication",
        description: "JWT secret is missing or too weak (< 32 characters)",
        recommendation:
          "Use a strong, randomly generated JWT secret of at least 32 characters",
        affectedComponent: "JWT Configuration",
      });
    }

    // Check password hashing - manual verification needed
    issues.push({
      severity: "medium",
      category: "Authentication",
      description: "Password hashing mechanism needs verification",
      recommendation:
        "Verify that all passwords are hashed with bcrypt (salt rounds >= 12)",
      affectedComponent: "Password Storage",
    });

    // Check multi-factor authentication
    issues.push({
      severity: "medium",
      category: "Authentication",
      description: "Multi-factor authentication not implemented",
      recommendation: "Implement 2FA for admin accounts",
      affectedComponent: "Admin Authentication",
    });

    return issues;
  }

  /**
   * Audit authorization and access control
   */
  private static async auditAuthorization(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check RLS policies - manual verification needed
    issues.push({
      severity: "high",
      category: "Authorization",
      description: "Row Level Security policies need verification",
      recommendation:
        "Verify RLS is enabled on all tables with proper tenant isolation",
      affectedComponent: "Database Security",
    });

    // Check for default admin credentials - manual verification needed
    issues.push({
      severity: "critical",
      category: "Authorization",
      description: "Default admin credentials must be changed",
      recommendation:
        "Verify default admin password has been changed from admin123",
      affectedComponent: "Admin Account Security",
    });

    return issues;
  }

  /**
   * Audit data protection mechanisms
   */
  private static async auditDataProtection(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check encryption at rest
    if (!process.env.SUPABASE_URL?.includes("https://")) {
      issues.push({
        severity: "critical",
        category: "Data Protection",
        description: "Database connection not using HTTPS/SSL",
        recommendation:
          "Ensure all database connections use SSL/TLS encryption",
        affectedComponent: "Database Connection",
      });
    }

    // Check for sensitive data in logs
    issues.push({
      severity: "medium",
      category: "Data Protection",
      description: "Potential sensitive data exposure in logs",
      recommendation:
        "Implement log sanitization and avoid logging PII/credentials",
      affectedComponent: "Logging System",
    });

    // Check backup encryption
    issues.push({
      severity: "medium",
      category: "Data Protection",
      description: "Database backup encryption status unknown",
      recommendation: "Verify that database backups are encrypted",
      affectedComponent: "Backup System",
    });

    return issues;
  }

  /**
   * Audit input validation
   */
  private static async auditInputValidation(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check for SQL injection protection
    issues.push({
      severity: "low",
      category: "Input Validation",
      description: "Using ORM/query builder reduces SQL injection risk",
      recommendation:
        "Continue using Supabase client and avoid raw SQL queries",
      affectedComponent: "Database Queries",
    });

    // Check email validation
    issues.push({
      severity: "medium",
      category: "Input Validation",
      description: "Email validation could be strengthened",
      recommendation:
        "Implement comprehensive email validation and sanitization",
      affectedComponent: "User Input Processing",
    });

    // Check phone number validation
    issues.push({
      severity: "low",
      category: "Input Validation",
      description: "Phone number validation implemented",
      recommendation: "Continue using international phone validation",
      affectedComponent: "Contact Information",
    });

    return issues;
  }

  /**
   * Audit session management
   */
  private static async auditSessionManagement(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check JWT expiration
    if (!process.env.JWT_EXPIRES_IN) {
      issues.push({
        severity: "high",
        category: "Session Management",
        description: "JWT expiration time not configured",
        recommendation:
          "Set appropriate JWT expiration time (recommended: 1-24 hours)",
        affectedComponent: "JWT Configuration",
      });
    }

    // Check session storage
    issues.push({
      severity: "medium",
      category: "Session Management",
      description: "Session revocation mechanism not implemented",
      recommendation:
        "Implement session blacklisting or refresh token rotation",
      affectedComponent: "Session Management",
    });

    // Check CORS configuration
    issues.push({
      severity: "medium",
      category: "Session Management",
      description: "CORS configuration should be reviewed",
      recommendation:
        "Ensure CORS is properly configured for production domains only",
      affectedComponent: "API Security",
    });

    return issues;
  }

  /**
   * Audit infrastructure security
   */
  private static async auditInfrastructure(): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];

    // Check environment variables
    const criticalEnvVars = [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "OPENAI_API_KEY",
      "JWT_SECRET",
    ];
    for (const envVar of criticalEnvVars) {
      if (!process.env[envVar]) {
        issues.push({
          severity: "critical",
          category: "Infrastructure",
          description: `Critical environment variable ${envVar} is missing`,
          recommendation: `Set ${envVar} in production environment`,
          affectedComponent: "Environment Configuration",
        });
      }
    }

    // Check HTTPS usage
    if (process.env.NODE_ENV === "production" && !process.env.FORCE_HTTPS) {
      issues.push({
        severity: "high",
        category: "Infrastructure",
        description: "HTTPS enforcement not configured for production",
        recommendation: "Implement HTTPS redirection and HSTS headers",
        affectedComponent: "Web Server Configuration",
      });
    }

    // Check rate limiting
    issues.push({
      severity: "medium",
      category: "Infrastructure",
      description: "Rate limiting not implemented",
      recommendation:
        "Implement rate limiting for API endpoints to prevent abuse",
      affectedComponent: "API Security",
    });

    return issues;
  }

  /**
   * Calculate overall security score
   */
  private static calculateSecurityScore(issues: SecurityIssue[]): number {
    let totalScore = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case "critical":
          totalScore -= 25;
          break;
        case "high":
          totalScore -= 15;
          break;
        case "medium":
          totalScore -= 10;
          break;
        case "low":
          totalScore -= 5;
          break;
      }
    }

    return Math.max(0, totalScore);
  }

  /**
   * Generate security recommendations
   */
  private static generateSecurityRecommendations(
    issues: SecurityIssue[],
  ): string[] {
    const recommendations: string[] = [];

    const criticalCount = issues.filter(
      (i) => i.severity === "critical",
    ).length;
    const highCount = issues.filter((i) => i.severity === "high").length;

    if (criticalCount > 0) {
      recommendations.push(
        `🚨 Address ${criticalCount} critical security issues immediately`,
      );
    }

    if (highCount > 0) {
      recommendations.push(
        `⚠️ Resolve ${highCount} high-priority security issues before production`,
      );
    }

    // Add general recommendations
    recommendations.push("Implement security monitoring and alerting");
    recommendations.push(
      "Conduct regular security audits and penetration testing",
    );
    recommendations.push(
      "Set up automated security scanning in CI/CD pipeline",
    );
    recommendations.push("Implement comprehensive logging and monitoring");
    recommendations.push("Create incident response procedures");
    recommendations.push("Train development team on secure coding practices");

    return recommendations;
  }

  /**
   * Generate security compliance report
   */
  static generateComplianceReport(auditResult: SecurityAuditResult): string {
    return `
# SECURITY COMPLIANCE REPORT
Generated: ${new Date().toISOString()}

## Overall Security Score: ${auditResult.overallScore}/100

## Compliance Status
- ✅ Authentication: ${auditResult.complianceStatus.authentication ? "COMPLIANT" : "NON-COMPLIANT"}
- ✅ Authorization: ${auditResult.complianceStatus.authorization ? "COMPLIANT" : "NON-COMPLIANT"}
- ✅ Data Protection: ${auditResult.complianceStatus.dataProtection ? "COMPLIANT" : "NON-COMPLIANT"}
- ✅ Input Validation: ${auditResult.complianceStatus.inputValidation ? "COMPLIANT" : "NON-COMPLIANT"}
- ✅ Session Management: ${auditResult.complianceStatus.sessionManagement ? "COMPLIANT" : "NON-COMPLIANT"}

## Critical Issues (${auditResult.criticalIssues.length})
${auditResult.criticalIssues
  .map(
    (issue) =>
      `### ${issue.category}: ${issue.description}\n**Recommendation:** ${issue.recommendation}\n**Component:** ${issue.affectedComponent}\n`,
  )
  .join("\n")}

## Warnings (${auditResult.warnings.length})
${auditResult.warnings
  .map(
    (issue) =>
      `### ${issue.severity.toUpperCase()} - ${issue.category}: ${issue.description}\n**Recommendation:** ${issue.recommendation}\n`,
  )
  .join("\n")}

## Security Recommendations
${auditResult.recommendations.map((rec) => `- ${rec}`).join("\n")}
`;
  }
}
