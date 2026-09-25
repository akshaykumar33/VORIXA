---
name: token-optimizer
description: AI agent token reduction techniques, CodeGraph symbol exploration, AST interface extraction, context pruning, surgical diff editing, and 80%+ context efficiency.
---

# Token Optimizer Skill

Use this skill when navigating, modifying, or reasoning about complex codebases to **minimize token consumption by 75–85%**, prevent context window exhaustion, eliminate hallucinations, and keep LLM context pristine.

---

## 1. The Context Compiler Philosophy

Standard naive agents waste tens of thousands of tokens dumping 500–1,000 line source files into context to answer trivial questions or make 2-line edits. The **Context Compiler** pattern enforces three strict rules:
1. **Retrieve Symbols, Never Raw Dumps**: Query targeted symbols, types, and caller/callee call paths.
2. **Read Interfaces First, Implementations Second**: Resolve contracts from type definitions before inspecting function bodies.
3. **Surgical Diffs Over File Rewrites**: Modify only the necessary lines with precise target ranges.

---

## 2. CodeGraph-First Navigation (Sub-Second AST Retrieval)

In repositories indexed by CodeGraph (`.codegraph/`):
- **DO NOT** run broad `grep` searches or dump whole files using `view_file`.
- **DO USE** `codegraph_explore` (MCP) or `codegraph explore "<symbol>"` (CLI).

### Example: Finding a Function & Its Callers in One Trip
```bash
# Naive (Costs 8,000+ tokens):
view_file src/game/PlayerController.ts (reads 450 lines)
view_file src/game/Collision.ts (reads 260 lines)
view_file src/game/Game.ts (reads 330 lines)

# Optimized with CodeGraph (Costs ~400 tokens):
codegraph explore "PlayerController.update"
# -> Returns exact line-numbered implementation + all callers in Game.ts and tests!
```

---

## 3. Surgical Diff Modification Rules

When editing existing code:
- **Avoid Full File Rewrites**: Rewriting an entire file burns massive output tokens and risks wiping unrelated comments and logic.
- **Use Targeted Replacement Chunks**:
  - Always locate the exact 5–15 line block that needs changing.
  - Specify tight `StartLine` and `EndLine` ranges with verbatim matching `TargetContent`.
- **Batch Non-Contiguous Changes**: When modifying multiple separate locations in a single file, execute them in a single multi-chunk pass rather than serial tool roundtrips.

---

## 4. Context Pruning Checklist

Before calling any research or edit tool, check:
- [ ] **Is the whole file needed, or just the type export?** If you only need `interface RigInput`, read lines 30–55 rather than lines 1–150.
- [ ] **Did a terminal tool output a 500-line stack trace?** Pipe through filters or grep error summaries (`vitest run | grep -E "FAIL|Error"`).
- [ ] **Has a conversation turn accumulated stale state?** Externalize decisions into persistent artifacts (`implementation_plan.md`, ADRs) so earlier conversational churn does not need re-reading.
- [ ] **Are comments clean and dense?** Avoid repetitive explanatory fluff in generated code; write self-documenting code with precise types.

---

## 5. Summary of Token Savings

| Operation | Naive Agent | Token-Optimized Agent | Token Savings |
| :--- | :--- | :--- | :--- |
| **Locating a symbol & callers** | Multiple greps + 3 file dumps (~12k tokens) | Single `codegraph_explore` (~600 tokens) | **~95%** |
| **Editing a 5-line bug** | Full file write (~4k output tokens) | Surgical chunk replace (~150 output tokens) | **~96%** |
| **Verifying types/APIs** | Reading implementation code (~6k tokens) | Reading AST interfaces only (~500 tokens) | **~91%** |
