export interface Patch {
  bridgeId: string;
  property: string;
  value: string;
}

/**
 * Apply visual-editor patches to prototype HTML.
 * For each patch, finds the element with data-bridge-id and adds/updates the
 * inline style property.
 */
export function applyPatches(html: string, patches: Patch[]): string {
  let result = html;

  for (const patch of patches) {
    const bridgeId = patch.bridgeId;
    // Match an element with data-bridge-id="<bridgeId>"
    const tagRe = new RegExp(
      `(<[^>]*data-bridge-id="${escapeRegExp(bridgeId)}"[^>]*?)(/?>)`,
      'g'
    );

    result = result.replace(tagRe, (match, before: string, closing: string) => {
      const styleRe = /style="([^"]*)"/i;
      const styleMatch = before.match(styleRe);
      const cssProp = patch.property;
      const cssVal = patch.value;

      if (styleMatch) {
        // Parse existing inline styles, update or add the property
        let existing = styleMatch[1];
        const propRe = new RegExp(
          `(^|;\\s*)${escapeRegExp(cssProp)}\\s*:[^;]*(;|$)`,
          'i'
        );
        if (propRe.test(existing)) {
          existing = existing.replace(propRe, `$1${cssProp}: ${cssVal};`);
        } else {
          existing = existing.replace(/;?\s*$/, '');
          existing = existing ? `${existing}; ${cssProp}: ${cssVal};` : `${cssProp}: ${cssVal};`;
        }
        const updatedTag = before.replace(styleRe, `style="${existing}"`);
        return updatedTag + closing;
      } else {
        // No style attribute yet — add one
        return `${before} style="${cssProp}: ${cssVal};"${closing}`;
      }
    });
  }

  return result;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
