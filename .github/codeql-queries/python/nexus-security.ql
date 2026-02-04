/**
 * @name Nexus Python Security Rules
 * @description Custom security rules for Nexus Python services
 * @kind problem
 * @problem.severity warning
 * @id nexus/python/security-rules
 */

import python

/**
 * Detects potential command injection vulnerabilities
 */
class CommandInjection extends Call {
  CommandInjection() {
    exists(string dangerousFunction |
      dangerousFunction = getFunc().(Name).getId() and
      (dangerousFunction = "system" or
       dangerousFunction = "popen" or
       dangerousFunction = "call" or
       dangerousFunction = "run") and
      getFunc().getEnclosingModule().getName() = "os" and
      exists(Expr arg | arg = getAnArg() |
        arg instanceof BinaryExpr and
        arg.(BinaryExpr).getOp() instanceof Add
      )
    )
  }
}

/**
 * Detects potential SQL injection vulnerabilities
 */
class SqlInjectionPython extends Call {
  SqlInjectionPython() {
    exists(string sqlMethod |
      sqlMethod = getFunc().(Attribute).getName() and
      (sqlMethod = "execute" or sqlMethod = "executemany") and
      exists(Expr arg | arg = getAnArg() |
        arg instanceof BinaryExpr or
        arg instanceof FormattedValue
      )
    )
  }
}

/**
 * Detects use of eval() or exec()
 */
class DangerousEval extends Call {
  DangerousEval() {
    getFunc().(Name).getId() = "eval" or
    getFunc().(Name).getId() = "exec"
  }
}

/**
 * Detects potential path traversal
 */
class PathTraversalPython extends Call {
  PathTraversalPython() {
    exists(string fileFunction |
      fileFunction = getFunc().(Name).getId() and
      (fileFunction = "open" or fileFunction = "file") and
      exists(Expr arg | arg = getAnArg() |
        arg.(Str).getText().matches("%../%") or
        arg.(Str).getText().matches("%..\\\\%")
      )
    )
  }
}

from CommandInjection injection
select injection, "Potential command injection vulnerability"

from SqlInjectionPython sqlInjection
select sqlInjection, "Potential SQL injection vulnerability"

from DangerousEval evalCall
select evalCall, "Use of eval() or exec() which can execute arbitrary code"

from PathTraversalPython traversal
select traversal, "Potential path traversal vulnerability"