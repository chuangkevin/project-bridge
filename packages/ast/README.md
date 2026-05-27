# @designbridge/ast

Semantic UI AST — single source of truth for the DesignBridge AI UI Compiler.

See `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md` §2-§4 for system context.

This package exports:
- TypeScript types (`SemanticUIAst`, `ComponentNode`, ...)
- ajv JSON Schema validator (`validateAst`)
- Base component registry (20 components)
- Pure AST mutation primitives (= the AI tool-call surface)
- AST query / diff / serialization helpers
- `verify-ast` CLI for CI

The AST is immutable. All mutations return a new AST.
