# NexusLite CodeQL Custom Security Queries

This directory contains custom CodeQL queries specifically designed for NexusLite project security analysis.

## Structure

```
.github/codeql-queries/
├── javascript/
│   └── nexus-security.ql    # JavaScript/TypeScript security rules
├── rust/
│   └── nexus-security.ql    # Rust security rules
└── python/
    └── (future Python AI service queries)
```

## Query Categories

### JavaScript/TypeScript (`nexus-security.ql`)

- **API Key Exposure**: Detects potential API keys in client-side code
- **Hardcoded Credentials**: Finds hardcoded passwords, tokens, or secrets
- **Unsafe DOM Manipulation**: Identifies potential XSS vulnerabilities via innerHTML

### Rust (`nexus-security.ql`)

- **Unsafe Code Blocks**: Flags usage of `unsafe` blocks
- **SQL Injection**: Detects potential SQL injection vulnerabilities
- **Unhandled Results**: Finds missing error handling
- **Path Traversal**: Identifies directory traversal vulnerabilities

## Usage

These queries are automatically run as part of the GitHub Actions security workflow:

1. **Weekly Scans**: Automatic weekly security analysis
2. **Push Triggers**: Scans on every push to main branch
3. **PR Triggers**: Analysis on pull requests

## Results

Security findings are reported in:
- GitHub Security tab
- Workflow run artifacts
- PR comments (for pull requests)

## Adding New Queries

To add new custom queries:

1. Create a new `.ql` file in the appropriate language directory
2. Follow the CodeQL query syntax
3. Test locally using CodeQL CLI
4. Commit and push to trigger automatic testing

## Example Query Structure

```ql
/**
 * @name Query Name
 * @description What this query detects
 * @kind problem
 * @problem.severity warning
 * @id nexus/language/rule-name
 */

import language

class MySecurityRule extends SomeAstNode {
  MySecurityRule() {
    // Query logic here
  }
}

from MySecurityRule node
select node, "Security issue description: " + node.toString()
```

## Maintenance

- Review and update queries quarterly
- Monitor false positives and adjust severity levels
- Add new queries for emerging security patterns
- Update queries when CodeQL language support changes