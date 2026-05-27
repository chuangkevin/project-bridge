#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateAst } from '../schema/validate';
import { BASE_COMPONENTS } from '../registry/baseComponents';

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: verify-ast <file.ast.json> [<file.ast.json> ...]');
    process.exit(2);
  }

  let allOk = true;
  for (const fileArg of args) {
    const filePath = resolve(process.cwd(), fileArg);
    const text = readFileSync(filePath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error(`FAIL ${fileArg} — invalid JSON: ${(err as Error).message}`);
      allOk = false;
      continue;
    }
    const result = validateAst(parsed, { registry: BASE_COMPONENTS });
    if (result.valid) {
      console.log(`OK   ${fileArg}`);
    } else {
      allOk = false;
      console.error(`FAIL ${fileArg}`);
      for (const e of result.errors) console.error(`     ${e.path}: ${e.message}`);
    }
  }

  process.exit(allOk ? 0 : 1);
}

main();
