/**
 * Element matcher: find and replace elements by data-bridge-id in HTML strings.
 * Uses regex-based matching (no DOM parser dependency).
 */

export function findElementByBridgeId(html: string, bridgeId: string): { found: boolean; outerHtml?: string } {
  // Find the element with this data-bridge-id
  const escapedId = bridgeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<(\\w+)[^>]*data-bridge-id="${escapedId}"[^>]*>`, 'i');
  const match = regex.exec(html);
  if (!match) return { found: false };

  // Extract the full element (find matching closing tag)
  const tag = match[1];
  const startIdx = match.index;
  let depth = 1;
  let searchFrom = startIdx + match[0].length;

  // Self-closing tags
  if (match[0].endsWith('/>')) {
    return { found: true, outerHtml: match[0] };
  }

  const openRe = new RegExp(`<${tag}[\\s>]`, 'gi');
  const closeRe = new RegExp(`</${tag}>`, 'gi');

  // Simple approach: find the matching closing tag
  let endIdx = html.length;
  let pos = searchFrom;
  while (depth > 0 && pos < html.length) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        endIdx = nextClose.index + nextClose[0].length;
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }

  return { found: true, outerHtml: html.slice(startIdx, endIdx) };
}

export function replaceElementByBridgeId(html: string, bridgeId: string, newHtml: string): string {
  const result = findElementByBridgeId(html, bridgeId);
  if (!result.found || !result.outerHtml) return html;
  return html.replace(result.outerHtml, newHtml);
}

/**
 * Fuzzy match: find the best matching data-bridge-id element based on hints.
 */
export function fuzzyMatchElement(
  html: string,
  hints: { tag?: string; textContent?: string; classes?: string[] }
): string | null {
  const bridgeIdRegex = /data-bridge-id="([^"]+)"/g;
  let match;
  let bestId: string | null = null;
  let bestScore = 0;

  while ((match = bridgeIdRegex.exec(html)) !== null) {
    const id = match[1];
    const elem = findElementByBridgeId(html, id);
    if (!elem.found || !elem.outerHtml) continue;

    let score = 0;

    // Tag match
    if (hints.tag) {
      const tagMatch = elem.outerHtml.match(/^<(\w+)/);
      if (tagMatch && tagMatch[1].toLowerCase() === hints.tag.toLowerCase()) score += 2;
    }

    // Text content match
    if (hints.textContent) {
      const text = elem.outerHtml.replace(/<[^>]+>/g, '').trim();
      const needle = hints.textContent.toLowerCase();
      if (text.toLowerCase().includes(needle)) score += 3;
      else if (needle.split('').filter(c => text.toLowerCase().includes(c)).length > needle.length * 0.5) score += 1;
    }

    // Class match
    if (hints.classes && hints.classes.length > 0) {
      const classMatch = elem.outerHtml.match(/class="([^"]+)"/);
      if (classMatch) {
        const classes = classMatch[1].split(/\s+/);
        const overlap = hints.classes.filter(c => classes.includes(c)).length;
        score += overlap * 2;
      }
    }

    // Bridge-id text match (id might contain hint text)
    if (hints.textContent && id.toLowerCase().includes(hints.textContent.toLowerCase().slice(0, 10))) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  return bestScore >= 2 ? bestId : null;
}
