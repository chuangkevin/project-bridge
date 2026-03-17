export const BRIDGE_SCRIPT = `
<script>
(function() {
  var annotationMode = false;
  var indicators = [];

  function findBridgeId(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.getAttribute && el.getAttribute('data-bridge-id')) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  var hoveredEl = null;

  document.addEventListener('mouseover', function(e) {
    if (!annotationMode) return;
    var target = findBridgeId(e.target);
    if (hoveredEl && hoveredEl !== target) {
      hoveredEl.style.outline = '';
      hoveredEl.style.outlineOffset = '';
      hoveredEl = null;
    }
    if (target) {
      target.style.outline = '2px dashed #3b82f6';
      target.style.outlineOffset = '2px';
      hoveredEl = target;
    }
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (!annotationMode) return;
    var target = findBridgeId(e.target);
    if (target && target === hoveredEl) {
      target.style.outline = '';
      target.style.outlineOffset = '';
      hoveredEl = null;
    }
  }, true);

  document.addEventListener('click', function(e) {
    if (!annotationMode) return;
    e.preventDefault();
    e.stopPropagation();
    var target = findBridgeId(e.target);
    if (!target) return;
    var bridgeId = target.getAttribute('data-bridge-id');
    var rect = target.getBoundingClientRect();
    window.parent.postMessage({
      type: 'element-click',
      bridgeId: bridgeId,
      tagName: target.tagName,
      textContent: (target.textContent || '').substring(0, 50),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }, '*');
  }, true);

  function clearIndicators() {
    indicators.forEach(function(el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    indicators = [];
  }

  function showIndicators(annotations) {
    clearIndicators();
    annotations.forEach(function(ann) {
      var el = document.querySelector('[data-bridge-id="' + ann.bridgeId + '"]');
      if (!el) return;
      var rect = el.getBoundingClientRect();
      var badge = document.createElement('div');
      badge.className = 'bridge-indicator';
      badge.textContent = ann.number;
      badge.style.cssText = 'position:fixed;top:' + (rect.top - 8) + 'px;left:' + (rect.right - 8) + 'px;width:20px;height:20px;border-radius:50%;background:#3b82f6;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;font-weight:700;z-index:99999;pointer-events:auto;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.2);font-family:sans-serif;';
      badge.setAttribute('data-annotation-bridge-id', ann.bridgeId);
      badge.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage({ type: 'indicator-click', bridgeId: ann.bridgeId }, '*');
      });
      document.body.appendChild(badge);
      indicators.push(badge);
    });
  }

  function highlightElement(bridgeId) {
    var el = document.querySelector('[data-bridge-id="' + bridgeId + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.outline = '2px solid #3b82f6';
    el.style.outlineOffset = '2px';
    setTimeout(function() {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }, 2000);
  }

  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'show-indicators') {
      showIndicators(e.data.annotations || []);
    } else if (e.data.type === 'highlight-element') {
      highlightElement(e.data.bridgeId);
    } else if (e.data.type === 'set-annotation-mode') {
      annotationMode = !!e.data.enabled;
      document.body.style.cursor = annotationMode ? 'crosshair' : '';
      if (!annotationMode && hoveredEl) {
        hoveredEl.style.outline = '';
        hoveredEl.style.outlineOffset = '';
        hoveredEl = null;
      }
    } else if (e.data.type === 'inject-styles') {
      var css = e.data.css || '';
      var existing = document.getElementById('__tweaker__');
      if (existing) {
        existing.textContent = css;
      } else {
        var styleEl = document.createElement('style');
        styleEl.id = '__tweaker__';
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
      }
    } else if (e.data.type === 'navigate') {
      var pageName = e.data.page;
      var allPages = document.querySelectorAll('.page[data-page]');
      allPages.forEach(function(p) {
        p.style.display = 'none';
      });
      var target = document.querySelector('.page[data-page="' + pageName + '"]');
      if (target) {
        target.style.display = '';
      }
    } else if (e.data.type === 'swap-component') {
      var el = document.querySelector('[data-bridge-id="' + e.data.bridgeId + '"]');
      if (el) {
        el.outerHTML = e.data.html;
      }
    }
  });
})();
</script>
`;
