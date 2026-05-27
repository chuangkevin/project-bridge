import { toJson, type IngestionAst, type SemanticUIAst, type ComponentRegistry } from '@designbridge/ast';
import { describeComponentCatalog } from './componentCatalog';

/** Flatten an IngestionAst into the text the AI should interpret. */
export function ingestionToText(ingestion: IngestionAst): string {
  switch (ingestion.type) {
    case 'requirement': return ingestion.paragraphs.join('\n\n');
    case 'pdf': return ingestion.rawText;
    case 'screenshot': return ingestion.ocrText;
    case 'clipboard': return ingestion.payload;
    case 'webpage': return ingestion.dom;
    default: { const _x: never = ingestion; return ''; }
  }
}

const NODE_SHAPE_RULES = [
  'Output a single JSON object: a Semantic UI AST.',
  'Top level: { "schemaVersion": 1, "artifactId": string, "kind": "page"|"element"|"multi-page"|"fragment", "root": ComponentNode }.',
  'Every ComponentNode MUST have ALL of these fields:',
  '  - "id": a unique string matching ^n_[A-Za-z0-9_-]+ (e.g. "n_root", "n_email"). Never reuse an id.',
  '  - "type": one of the available component types below.',
  '  - "props": object (include every REQUIRED prop for that type).',
  '  - "layout": one of { "kind":"stack","direction":"vertical"|"horizontal" } | { "kind":"grid","columns":number } | { "kind":"flow" } | { "kind":"absolute" }.',
  '  - "style": object (may be empty {}).',
  '  - "bindings": [] , "events": [] , "constraints": []  (empty arrays for a visual-only draft).',
  '  - "children": array of ComponentNode (empty [] for leaf types).',
  'Do not invent component types or props. Respond with JSON only — no markdown, no prose.',
].join('\n');

export function buildColdStartPrompt(args: {
  ingestion: IngestionAst; registry: ComponentRegistry; artifactId: string; kind: SemanticUIAst['kind'];
}): { systemInstruction: string; prompt: string } {
  const systemInstruction = [
    'You are a UI compiler. Convert the user requirement into a Semantic UI AST.',
    '', NODE_SHAPE_RULES, '', describeComponentCatalog(args.registry),
  ].join('\n');
  const prompt = [
    `artifactId: ${args.artifactId}`, `kind: ${args.kind}`, '',
    'Requirement / source content:', ingestionToText(args.ingestion),
  ].join('\n');
  return { systemInstruction, prompt };
}

const OP_VOCABULARY = [
  'Respond with JSON: { "ops": MutationOp[] }. Each op edits the AST. Available ops:',
  '  - { "op":"addComponent", "parentId":string, "type":string, "props"?:object, "index"?:number }',
  '  - { "op":"setProp", "nodeId":string, "key":string, "value":any }',
  '  - { "op":"removeComponent", "nodeId":string }',
  '  - { "op":"moveComponent", "nodeId":string, "newParentId":string, "index"?:number }',
  '  - { "op":"addBinding", "nodeId":string, "binding":{ "propKey":string, "source":"state"|"api"|"static"|"computed" } }',
  '  - { "op":"addEvent", "nodeId":string, "event":{ "event":string, "action":{} } }',
  '  - { "op":"addConstraintRef", "nodeId":string, "ruleId":string }',
  'Reference EXISTING node ids from the current AST. A newly added component cannot be referenced by',
  'later ops in the same batch — fully configure new nodes via the addComponent "props".',
  'Emit ONLY the ops needed. Empty list {"ops":[]} if no change is needed. Respond with JSON only.',
].join('\n');

export function buildMutationPrompt(args: {
  ast: SemanticUIAst; instruction: string; registry: ComponentRegistry;
}): { systemInstruction: string; prompt: string } {
  const systemInstruction = [
    'You are a UI compiler editing an existing Semantic UI AST via mutation ops.',
    '', OP_VOCABULARY, '', describeComponentCatalog(args.registry),
  ].join('\n');
  const prompt = [
    'Current Semantic UI AST:', toJson(args.ast, { pretty: true }),
    '', 'User instruction:', args.instruction,
  ].join('\n');
  return { systemInstruction, prompt };
}
