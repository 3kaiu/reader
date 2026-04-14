/**
 * @name Nexus Web Security Rules
 * @description Custom security rules for the Nexus web frontend
 * @kind problem
 * @problem.severity warning
 * @id nexus/javascript/security-rules
 */

import javascript

/**
 * Detects potential API key exposure in client-side code
 */
class ApiKeyExposure extends Expr {
  ApiKeyExposure() {
    exists(string apiKeyPattern |
      apiKeyPattern = "(?i)(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token)" and
      this.getStringValue().regexpMatch(".*" + apiKeyPattern + ".*")
    )
  }
}

/**
 * Detects hardcoded credentials
 */
class HardcodedCredential extends StringLiteral {
  HardcodedCredential() {
    // Skip test files and config files
    not getFile().getRelativePath().matches("%test%") and
    not getFile().getRelativePath().matches("%.config.%") and
    not getFile().getRelativePath().matches("%config%") and

    // Look for potential credential patterns
    getValue().regexpMatch("(?i).*(password|passwd|pwd|secret|token|key).*") and
    getValue().length() > 10 and

    // Exclude common safe patterns
    not getValue().regexpMatch("(?i).*(example|placeholder|your_|test_|demo_).*") and
    not getValue().regexpMatch("(?i).*(password.*required|enter.*password).*")
  }
}

/**
 * Detects unsafe DOM manipulation
 */
class UnsafeDomManipulation extends MethodCallExpr {
  UnsafeDomManipulation() {
    getMethodName() = "innerHTML" and
    exists(Expr source | source = getArgument(0) |
      // Check if the source could be user-controlled
      source instanceof Identifier or
      source instanceof PropAccess or
      source instanceof CallExpr
    )
  }
}

from ApiKeyExposure exposure
select exposure, "Potential API key exposure in client-side code"

from HardcodedCredential credential
select credential, "Potential hardcoded credential detected"

from UnsafeDomManipulation manipulation
select manipulation, "Unsafe DOM manipulation with innerHTML"
