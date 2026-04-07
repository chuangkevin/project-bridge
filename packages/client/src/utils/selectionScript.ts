/**
 * Shared selection script for iframe element picking.
 * Used by both PreviewPanel (component-extract mode) and CrawlPreview (crawl-to-component).
 *
 * The script is injected into an iframe's srcdoc. It handles:
 * - mouseover: blue highlight on hover
 * - click: select element, extract outerHTML + computed CSS, postMessage to parent
 * - Extracted CSS uses camelCase-to-kebab conversion for computed style properties
 */

const CSS_PROPS = [
  'backgroundColor', 'color', 'fontSize', 'fontFamily', 'fontWeight',
  'padding', 'margin', 'borderRadius', 'border', 'display',
  'flexDirection', 'alignItems', 'justifyContent', 'gap',
  'width', 'height', 'maxWidth', 'minHeight', 'lineHeight',
  'letterSpacing', 'textAlign', 'boxShadow', 'opacity', 'overflow',
  'position', 'textDecoration', 'textTransform',
];

const SKIP_VALUES = new Set([
  '', 'none', 'normal', '0px', 'rgba(0, 0, 0, 0)', 'auto', 'visible',
]);

/**
 * Returns a <script> tag that, when injected into an iframe, enables element
 * selection mode immediately. On hover the element gets a blue outline; on
 * click the element's outerHTML and computed CSS are posted to the parent window.
 *
 * Message format sent to parent:
 *   { type: 'component-extracted', html: string, css: string }
 */
export function getSelectionScript(): string {
  return `<script>
(function() {
  var hoveredEl = null;
  var CSS_PROPS = ${JSON.stringify(CSS_PROPS)};
  var SKIP_VALUES = ${JSON.stringify([...SKIP_VALUES])};
  var skipSet = {};
  SKIP_VALUES.forEach(function(v) { skipSet[v] = true; });

  function toKebab(prop) {
    return prop.replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); });
  }

  document.body.style.cursor = 'crosshair';

  document.addEventListener('mouseover', function(e) {
    var target = e.target;
    if (target === document.body || target === document.documentElement) return;
    if (hoveredEl && hoveredEl !== target) {
      hoveredEl.style.outline = '';
      hoveredEl.style.outlineOffset = '';
    }
    target.style.outline = '2px solid #3b82f6';
    target.style.outlineOffset = '2px';
    hoveredEl = target;
  }, true);

  document.addEventListener('mouseout', function(e) {
    var target = e.target;
    if (target === hoveredEl) {
      target.style.outline = '';
      target.style.outlineOffset = '';
      hoveredEl = null;
    }
  }, true);

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var target = e.target;
    if (target === document.body || target === document.documentElement) return;

    // Flash green to confirm selection
    target.style.outline = '3px solid #10b981';
    target.style.outlineOffset = '2px';

    var extractHtml = target.outerHTML;
    var cs = window.getComputedStyle(target);
    var cssLines = [];
    CSS_PROPS.forEach(function(prop) {
      var kebab = toKebab(prop);
      var val = cs.getPropertyValue(kebab);
      if (val && !skipSet[val]) {
        cssLines.push(kebab + ': ' + val + ';');
      }
    });

    // Also extract children's computed styles (one level deep)
    var children = target.querySelectorAll('*');
    var childCssMap = {};
    for (var i = 0; i < children.length && i < 50; i++) {
      var child = children[i];
      var tag = child.tagName.toLowerCase();
      var childCs = window.getComputedStyle(child);
      var childLines = [];
      CSS_PROPS.forEach(function(prop) {
        var kebab = toKebab(prop);
        var val = childCs.getPropertyValue(kebab);
        if (val && !skipSet[val]) {
          childLines.push(kebab + ': ' + val + ';');
        }
      });
      if (childLines.length > 0) {
        var key = tag + (child.className ? '.' + child.className.toString().split(' ').filter(Boolean).join('.') : '');
        if (!childCssMap[key]) {
          childCssMap[key] = childLines.join(' ');
        }
      }
    }

    var extractedCss = cssLines.join(' ');

    window.parent.postMessage({
      type: 'component-extracted',
      html: extractHtml,
      css: extractedCss
    }, '*');
  }, true);
})();
</script>`;
}
