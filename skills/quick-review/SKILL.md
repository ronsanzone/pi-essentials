---
name: quick-review
description: Use when you need fast, interactive code review of a PR with detailed explanations. Triggers on exploratory reviews, learning-focused feedback, or when you want to discuss findings before any action.
---

# Quick Review

Single-pass expert code review for fast, interactive feedback with detailed explanations of every issue found.

## Overview

A direct, conversational code review that explains the reasoning behind every finding. 

## Usage

```
/quick-review <owner/repo> <pr-number>
```

Examples:
- `/quick-review anthropics/claude-code 123`
- `/quick-review myorg/myrepo 456`

## Review Priorities (in order)

1. **Correctness** - Does it work as specified?
2. **Security** - Are there vulnerabilities?
3. **Performance** - Are there obvious bottlenecks?
4. **Maintainability** - Will future developers understand it?
5. **Style** - Does it follow conventions?

## Analysis Framework

Apply these in priority order:

| Priority | Focus | What to Look For |
|----------|-------|------------------|
| 0 | **Correctness** | Bugs, spec violations, logic errors, edge cases |
| 1 | **Security** | Injection, auth flaws, data exposure, insecure defaults |
| 2 | **Performance** | Algorithmic complexity, memory, queries, bottlenecks |
| 3 | **Code Quality** | Readability, naming, structure, organization |
| 4 | **Best Practices** | Language idioms, design patterns, standards |
| 5 | **Error Handling** | Exceptions, validation, failure recovery |
| 6 | **Testing** | Testability, missing test cases, test strategies |

## Implementation

### Step 1: Get the PR

```bash
gh pr view -R <owner/repo> <pr-number>
gh pr diff -R <owner/repo> <pr-number>
```

### Step 2: Review
Once you have consumed the diff, performing the code review using the following guidance:

REVIEW PRIORITIES (in order):
1. Correctness: Does it work as specified?
2. Security: Are there vulnerabilities?
3. Performance: Are there obvious bottlenecks?
4. Maintainability: Will future developers understand it?
5. Style: Does it follow conventions?

When reviewing code, you will:

**Analysis Framework in priority order:**
0. **Correctness** - Evaluate code behavior for inconsistencies with requirements/specifications and comments; look for obvious bugs
1. **Security Assessment** - Identify vulnerabilities, injection risks, authentication/authorization flaws, and data exposure issues
2. **Performance Evaluation** - Analyze algorithmic complexity, memory usage, database queries, and potential bottlenecks
3. **Code Quality Review** - Examine readability, maintainability, naming conventions, and structural organization
4. **Best Practices Compliance** - Verify adherence to language-specific idioms, design patterns, and industry standards
5. **Error Handling & Resilience** - Assess exception handling, input validation, and failure recovery mechanisms
6. **Testing Considerations** - Evaluate testability and suggest testing strategies

**Review Process:**
- Provide specific, actionable feedback with clear explanations of why changes are recommended
- Prioritize issues by severity (Critical, High, Medium, Low)
- Offer concrete code examples for suggested improvements
- Explain the reasoning behind each recommendation, including potential consequences of not addressing issues
- Consider the broader system context and architectural implications
- Balance perfectionism with pragmatism - focus on changes that provide meaningful value

**Communication Style:**
- Be direct and constructive, avoiding unnecessary praise or criticism
- Use technical precision while remaining accessible
- Highlight both strengths and areas for improvement
- Provide alternative approaches when applicable
- Ask clarifying questions when context is needed

**Output Structure:**
1. **Executive Summary** - Brief overview of overall code quality and key concerns
2. **Critical Issues** - Security vulnerabilities and major problems requiring immediate attention
3. **Significant Improvements** - Important but non-critical enhancements
4. **Minor Suggestions** - Style, readability, and optimization opportunities
5. **Positive Observations** - Well-implemented patterns and good practices worth noting

Always consider the project's specific context, coding standards, and constraints. If you need additional context about the codebase, requirements, or constraints, ask specific questions to provide more targeted feedback.
