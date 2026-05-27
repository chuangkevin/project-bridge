#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateRuleShape, detectRuleConflicts, detectDeadRules } from '../skill/ruleChecks';
import { BASE_COMPONENTS } from '../registry/baseComponents';
import type { SkillRule } from '../skill/rule';

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) { console.error('Usage: verify-rules <file.rules.json> [...]'); process.exit(2); }
  let allOk = true;
  for (const fileArg of args) {
    let rules: SkillRule[];
    try { rules = JSON.parse(readFileSync(resolve(process.cwd(), fileArg), 'utf8')); }
    catch (err) { console.error(`FAIL ${fileArg} — invalid JSON: ${(err as Error).message}`); allOk = false; continue; }
    if (!Array.isArray(rules)) { console.error(`FAIL ${fileArg} — expected an array of rules`); allOk = false; continue; }
    const problems: string[] = [];
    rules.forEach((r, i) => validateRuleShape(r).forEach(p => problems.push(`rule[${i}]: ${p}`)));
    problems.push(...detectRuleConflicts(rules));
    problems.push(...detectDeadRules(rules, BASE_COMPONENTS));
    if (problems.length === 0) console.log(`OK   ${fileArg} (${rules.length} rules)`);
    else { allOk = false; console.error(`FAIL ${fileArg}`); problems.forEach(p => console.error(`     ${p}`)); }
  }
  process.exit(allOk ? 0 : 1);
}
main();
