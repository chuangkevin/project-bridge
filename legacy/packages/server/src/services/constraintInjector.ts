/**
 * Inject data-constraint-* attributes into HTML elements based on element constraints.
 * Finds elements by data-bridge-id and adds/updates constraint attributes.
 */
export function injectConstraintAttributes(html: string, constraints: any[]): string {
  if (!constraints || constraints.length === 0) {
    // Remove any existing data-constraint-* attributes
    return html.replace(/\s+data-constraint-[\w-]+="[^"]*"/g, '');
  }

  let result = html;

  // First, remove all existing data-constraint-* attributes to avoid stale data
  result = result.replace(/\s+data-constraint-[\w-]+="[^"]*"/g, '');

  // Build a map of bridge_id -> constraint
  const constraintMap = new Map<string, any>();
  for (const c of constraints) {
    constraintMap.set(c.bridge_id, c);
  }

  // For each element with data-bridge-id, inject constraint attributes if a constraint exists
  result = result.replace(
    /(<[^>]*\s)data-bridge-id="([^"]*)"([^>]*>)/g,
    (match, before, bridgeId, after) => {
      const constraint = constraintMap.get(bridgeId);
      if (!constraint) return match;

      let attrs = '';
      if (constraint.constraint_type) {
        attrs += ` data-constraint-type="${escapeAttr(constraint.constraint_type)}"`;
      }
      if (constraint.min !== null && constraint.min !== undefined) {
        attrs += ` data-constraint-min="${escapeAttr(String(constraint.min))}"`;
      }
      if (constraint.max !== null && constraint.max !== undefined) {
        attrs += ` data-constraint-max="${escapeAttr(String(constraint.max))}"`;
      }
      if (constraint.pattern) {
        attrs += ` data-constraint-pattern="${escapeAttr(constraint.pattern)}"`;
      }
      if (constraint.required) {
        attrs += ` data-constraint-required="true"`;
      }

      return `${before}data-bridge-id="${bridgeId}"${attrs}${after}`;
    }
  );

  return result;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
