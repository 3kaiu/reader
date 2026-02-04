/**
 * @name Nexus Core Security Rules
 * @description Custom security rules for Nexus Core Rust backend
 * @kind problem
 * @problem.severity warning
 * @id nexus/rust/security-rules
 */

import rust

/**
 * Detects potential unsafe code usage
 */
class UnsafeBlock extends BlockExpr {
  UnsafeBlock() {
    getKeyword() = "unsafe"
  }
}

/**
 * Detects potential SQL injection vulnerabilities
 */
class SqlInjection extends CallExpr {
  SqlInjection() {
    exists(string sqlMethod |
      sqlMethod = getCallee().getName() and
      (sqlMethod = "execute" or sqlMethod = "query" or sqlMethod = "prepare") and
      exists(Expr arg | arg = getArg(_) |
        arg instanceof StringLiteral and
        arg.getStringValue().matches("%" + getParameter(_) + "%")
      )
    )
  }

  private string getParameter(int index) {
    exists(Expr arg | arg = getArg(index) |
      if arg instanceof Identifier then
        result = arg.(Identifier).getName()
      else
        result = "?"
    )
  }
}

/**
 * Detects missing error handling
 */
class UnhandledResult extends CallExpr {
  UnhandledResult() {
    getCallee().getName().endsWith("Result") and
    not exists(Stmt parent |
      parent = getParent*() and
      (parent instanceof LetStmt or
       parent instanceof ExprStmt and
       parent.(ExprStmt).getExpr() instanceof MatchExpr)
    )
  }
}

/**
 * Detects potential path traversal vulnerabilities
 */
class PathTraversal extends CallExpr {
  PathTraversal() {
    exists(string pathMethod |
      pathMethod = getCallee().getName() and
      (pathMethod = "read_to_string" or
       pathMethod = "write" or
       pathMethod = "create" or
       pathMethod = "open") and
      exists(Expr arg | arg = getArg(0) |
        arg.getStringValue().matches("%../%") or
        arg.getStringValue().matches("%..\\\\%")
      )
    )
  }
}

from UnsafeBlock block
select block, "Usage of unsafe block in Rust code"

from SqlInjection injection
select injection, "Potential SQL injection vulnerability"

from UnhandledResult result
select result, "Unhandled Result type that may cause panics"

from PathTraversal traversal
select traversal, "Potential path traversal vulnerability"