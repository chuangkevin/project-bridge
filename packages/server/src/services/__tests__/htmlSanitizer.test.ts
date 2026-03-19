import { sanitizeGeneratedHtml, injectConventionColors } from '../htmlSanitizer';

// ─── sanitizeGeneratedHtml ──────────────────────────

describe('sanitizeGeneratedHtml', () => {
  test('merges duplicate <style> tags into one', () => {
    const input = `<!DOCTYPE html><html><head><style>:root{--primary:#3b82f6}</style></head><body><style>.btn{color:red}</style><div>hello</div></body></html>`;
    const result = sanitizeGeneratedHtml(input);

    // Should have exactly one <style> block
    const styleCount = (result.match(/<style/g) || []).length;
    expect(styleCount).toBe(1);

    // Should contain both CSS rules
    expect(result).toContain('--primary:#3b82f6');
    expect(result).toContain('.btn{color:red}');

    // The single <style> should be in <head>
    const headContent = result.match(/<head>([\s\S]*?)<\/head>/i)?.[1] || '';
    expect(headContent).toContain('<style>');
  });

  test('leaves single <style> unchanged', () => {
    const input = `<!DOCTYPE html><html><head><style>:root{--primary:#8E6FA7}</style></head><body><div>hi</div></body></html>`;
    const result = sanitizeGeneratedHtml(input);
    expect(result).toBe(input);
  });

  test('fixes truncated HTML — missing </script></body></html>', () => {
    const input = `<!DOCTYPE html><html><head><style>body{}</style></head><body><script>function showPage(n){}`;
    const result = sanitizeGeneratedHtml(input);

    expect(result).toContain('</script>');
    expect(result).toContain('</body>');
    expect(result).toContain('</html>');
  });

  test('does not double-close already complete HTML', () => {
    const input = `<!DOCTYPE html><html><head></head><body></body></html>`;
    const result = sanitizeGeneratedHtml(input);

    const htmlCloseCount = (result.match(/<\/html>/g) || []).length;
    expect(htmlCloseCount).toBe(1);
  });

  test('injects showPage for multi-page prototypes missing it', () => {
    const input = `<!DOCTYPE html><html><head></head><body><div class="page" data-page="home">Home</div><div class="page" data-page="about">About</div></body></html>`;
    const result = sanitizeGeneratedHtml(input, true);

    expect(result).toContain('function showPage');
    expect(result).toContain("showPage('home')");
  });

  test('does not inject showPage if already present', () => {
    const input = `<!DOCTYPE html><html><head></head><body><div data-page="home">Home</div><script>function showPage(n){}</script></body></html>`;
    const result = sanitizeGeneratedHtml(input, true);

    // Should have exactly one showPage
    const count = (result.match(/function showPage/g) || []).length;
    expect(count).toBe(1);
  });
});

// ─── injectConventionColors ─────────────────────────

describe('injectConventionColors', () => {
  const CONVENTION = `| Token | Hex | 用途 |
|---|---|---|
| \`c-purple-600\` | \`#8E6FA7\` | 主要 CTA 按鈕背景 |
| \`c-purple-700\` | \`#8557A8\` | hover |`;

  test('injects --primary from convention', () => {
    const input = `<!DOCTYPE html><html><head><style>:root{--primary:#3b82f6}</style></head><body></body></html>`;
    const result = injectConventionColors(input, CONVENTION);

    expect(result).toContain('--primary: #8E6FA7');
    expect(result).toContain('data-convention-override');
  });

  test('injects --primary-hover from convention', () => {
    const input = `<!DOCTYPE html><html><head></head><body></body></html>`;
    const result = injectConventionColors(input, CONVENTION);

    expect(result).toContain('--primary-hover: #8557A8');
  });

  test('does not inject when no convention provided', () => {
    const input = `<!DOCTYPE html><html><head></head><body></body></html>`;
    const result = injectConventionColors(input, '');
    expect(result).toBe(input);
  });

  test('override block is placed before </head>', () => {
    const input = `<!DOCTYPE html><html><head><style>body{}</style></head><body></body></html>`;
    const result = injectConventionColors(input, CONVENTION);

    const headContent = result.match(/<head>([\s\S]*?)<\/head>/i)?.[1] || '';
    expect(headContent).toContain('data-convention-override');
  });
});
