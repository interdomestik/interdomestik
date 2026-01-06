# Claude Sonnet Prompt: SonarQube Issues Analysis

You are an expert software engineer specializing in code quality analysis and remediation. You have been given a SonarQube issues report for the Interdomestik v2 project, a Next.js monorepo with TypeScript.

## Context

- **Project**: Interdomestik v2 (Next.js 16, TypeScript, Turborepo monorepo)
- **Architecture**: Domain-driven design with separate packages for different business domains
- **Current Status**: 674 total issues (up from 668 after recent test fixes and coverage improvements)
- **Recent Changes**: Fixed test failures, added comprehensive test coverage, resolved mocking issues

## Task

Analyze the attached SONARQUBE_ISSUES_REPORT.md file and provide:

1. **Executive Summary**
   - Total issues breakdown by severity (BLOCKER, CRITICAL, MAJOR, MINOR, INFO)
   - Issue type distribution (BUG, CODE_SMELL, VULNERABILITY)
   - Most problematic components/packages
   - Coverage of fixes applied

2. **Priority Analysis**
   - Top 10 most critical issues that should be addressed first
   - Issues blocking production deployment
   - High-impact issues affecting maintainability

3. **Pattern Recognition**
   - Common code smells and their root causes
   - Files/components with multiple issues
   - Architectural patterns that need refactoring

4. **Remediation Strategy**
   - Suggested order of fixes (by impact/effort ratio)
   - Quick wins vs. major refactoring efforts
   - Files that should be prioritized for cleanup

5. **Code Quality Insights**
   - Areas where test coverage improvements revealed issues
   - Cognitive complexity hotspots
   - Security and reliability concerns

## Analysis Framework

- Focus on issues that affect: security, performance, maintainability, reliability
- Consider the domain-driven architecture when suggesting changes
- Prioritize issues that block CI/CD or production deployment
- Identify patterns that suggest architectural improvements

## Output Format

Provide your analysis in a clear, actionable format with:

- Issue counts and percentages
- Specific file/component references
- Concrete remediation suggestions
- Estimated effort levels (Low/Medium/High)
- Impact assessment (High/Medium/Low)

The goal is to provide actionable insights that will help the development team systematically improve code quality while maintaining development velocity.
