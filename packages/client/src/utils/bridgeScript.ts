export const BRIDGE_SCRIPT = `
<script>
(function() {
  var annotationMode = false;
  var apiBindingMode = false;
  var visualEditMode = false;
  var pageMappingMode = false;
  var pageMappingHoveredEl = null;
  var visualHoveredEl = null;
  var indicators = [];
  var apiIndicators = [];

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
    if (!annotationMode && !apiBindingMode && !visualEditMode && !pageMappingMode) return;
    var target = findBridgeId(e.target);
    if (pageMappingMode) {
      if (pageMappingHoveredEl && pageMappingHoveredEl !== target) {
        pageMappingHoveredEl.style.outline = '';
        pageMappingHoveredEl.style.outlineOffset = '';
        pageMappingHoveredEl = null;
      }
      if (target) {
        target.style.outline = '2px solid #8b5cf6';
        target.style.outlineOffset = '2px';
        pageMappingHoveredEl = target;
      }
      return;
    }
    if (visualEditMode) {
      if (visualHoveredEl && visualHoveredEl !== target) {
        visualHoveredEl.style.outline = '';
        visualHoveredEl.style.outlineOffset = '';
        visualHoveredEl = null;
      }
      if (target) {
        target.style.outline = '2px solid #3b82f6';
        target.style.outlineOffset = '2px';
        visualHoveredEl = target;
      }
      return;
    }
    if (hoveredEl && hoveredEl !== target) {
      hoveredEl.style.outline = '';
      hoveredEl.style.outlineOffset = '';
      hoveredEl = null;
    }
    if (target) {
      if (apiBindingMode) {
        target.style.outline = '2px solid #2563eb';
        target.style.outlineOffset = '2px';
      } else {
        target.style.outline = '2px dashed #3b82f6';
        target.style.outlineOffset = '2px';
      }
      hoveredEl = target;
    }
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (!annotationMode && !apiBindingMode && !visualEditMode && !pageMappingMode) return;
    if (pageMappingMode) {
      var pmTarget = findBridgeId(e.target);
      if (pmTarget && pmTarget === pageMappingHoveredEl) {
        pmTarget.style.outline = '';
        pmTarget.style.outlineOffset = '';
        pageMappingHoveredEl = null;
      }
      return;
    }
    if (visualEditMode) {
      var vTarget = findBridgeId(e.target);
      if (vTarget && vTarget === visualHoveredEl) {
        vTarget.style.outline = '';
        vTarget.style.outlineOffset = '';
        visualHoveredEl = null;
      }
      return;
    }
    var target = findBridgeId(e.target);
    if (target && target === hoveredEl) {
      target.style.outline = '';
      target.style.outlineOffset = '';
      hoveredEl = null;
    }
  }, true);

  document.addEventListener('click', function(e) {
    if (!annotationMode && !apiBindingMode && !visualEditMode && !pageMappingMode) return;
    e.preventDefault();
    e.stopPropagation();
    var target = findBridgeId(e.target);
    if (!target) return;
    var bridgeId = target.getAttribute('data-bridge-id');
    var rect = target.getBoundingClientRect();
    if (pageMappingMode) {
      // Find which data-page this element belongs to
      var pageEl = target.closest('[data-page]');
      var pageName = pageEl ? pageEl.getAttribute('data-page') : '';
      window.parent.postMessage({
        type: 'page-mapping-element-selected',
        bridgeId: bridgeId,
        tag: target.tagName.toLowerCase(),
        textContent: (target.textContent || '').trim().substring(0, 100),
        pageName: pageName,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }, '*');
      return;
    }
    if (visualEditMode) {
      var cs = window.getComputedStyle(target);
      window.parent.postMessage({
        type: 'element-selected',
        bridgeId: bridgeId,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        computedStyles: {
          backgroundColor: cs.backgroundColor,
          color: cs.color,
          fontSize: cs.fontSize,
          fontFamily: cs.fontFamily,
          fontWeight: cs.fontWeight,
          padding: cs.padding,
          margin: cs.margin,
          borderRadius: cs.borderRadius,
          opacity: cs.opacity,
          width: cs.width,
          height: cs.height
        }
      }, '*');
      return;
    }
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
    } else if (e.data.type === 'navigate-page') {
      var npName = e.data.page;
      var npAll = document.querySelectorAll('[data-page]');
      if (npAll.length > 0) {
        npAll.forEach(function(p) { p.style.display = 'none'; });
        var npTarget = document.querySelector('[data-page="' + npName + '"]');
        if (npTarget) { npTarget.style.display = ''; }
      } else {
        var npEl = document.getElementById(npName);
        if (npEl) { npEl.scrollIntoView(); }
      }
    } else if (e.data.type === 'set-api-binding-mode') {
      apiBindingMode = !!e.data.enabled;
      if (apiBindingMode) {
        annotationMode = false;
        document.body.style.cursor = 'pointer';
      } else {
        document.body.style.cursor = '';
        if (hoveredEl) {
          hoveredEl.style.outline = '';
          hoveredEl.style.outlineOffset = '';
          hoveredEl = null;
        }
      }
    } else if (e.data.type === 'show-api-indicators') {
      clearApiIndicators();
      var bindings = e.data.bindings || [];
      bindings.forEach(function(b) {
        var el = document.querySelector('[data-bridge-id="' + b.bridgeId + '"]');
        if (!el) return;
        var rect = el.getBoundingClientRect();
        var badge = document.createElement('div');
        badge.className = 'bridge-api-indicator';
        badge.textContent = 'API';
        badge.style.cssText = 'position:fixed;top:' + (rect.top - 6) + 'px;left:' + (rect.left - 6) + 'px;padding:1px 4px;border-radius:3px;background:#2563eb;color:#fff;font-size:9px;font-weight:700;z-index:99999;pointer-events:none;font-family:sans-serif;line-height:1.2;';
        document.body.appendChild(badge);
        apiIndicators.push(badge);
      });
    } else if (e.data.type === 'swap-component') {
      var el = document.querySelector('[data-bridge-id="' + e.data.bridgeId + '"]');
      if (el) {
        el.outerHTML = e.data.html;
      }
    } else if (e.data.type === 'set-visual-edit-mode') {
      visualEditMode = !!e.data.enabled;
      if (visualEditMode) {
        annotationMode = false;
        apiBindingMode = false;
        document.body.style.cursor = 'default';
      } else {
        document.body.style.cursor = '';
        if (visualHoveredEl) {
          visualHoveredEl.style.outline = '';
          visualHoveredEl.style.outlineOffset = '';
          visualHoveredEl = null;
        }
      }
    } else if (e.data.type === 'apply-style-change') {
      var scEl = document.querySelector('[data-bridge-id="' + e.data.bridgeId + '"]');
      if (scEl) {
        scEl.style[e.data.property] = e.data.value;
      }
    } else if (e.data.type === 'apply-position-change') {
      var posEl = document.querySelector('[data-bridge-id="' + e.data.bridgeId + '"]');
      if (posEl) {
        posEl.style.transform = 'translate(' + e.data.deltaX + 'px, ' + e.data.deltaY + 'px)';
      }
    } else if (e.data.type === 'apply-resize') {
      var rsEl = document.querySelector('[data-bridge-id="' + e.data.bridgeId + '"]');
      if (rsEl) {
        rsEl.style.width = e.data.width + 'px';
        rsEl.style.height = e.data.height + 'px';
      }
    } else if (e.data.type === 'get-element-rect') {
      var rectEl = document.querySelector('[data-bridge-id="' + e.data.bridgeId + '"]');
      if (rectEl) {
        var elRect = rectEl.getBoundingClientRect();
        window.parent.postMessage({
          type: 'element-rect',
          bridgeId: e.data.bridgeId,
          rect: { x: elRect.x, y: elRect.y, width: elRect.width, height: elRect.height },
          scrollX: window.scrollX,
          scrollY: window.scrollY
        }, '*');
      }
    } else if (e.data.type === 'apply-patches') {
      var patches = e.data.patches || [];
      patches.forEach(function(p) {
        var pEl = document.querySelector('[data-bridge-id="' + p.bridgeId + '"]');
        if (pEl) {
          pEl.style[p.property] = p.value;
        }
      });
    } else if (e.data.type === 'set-page-mapping-mode') {
      pageMappingMode = !!e.data.enabled;
      if (pageMappingMode) {
        annotationMode = false;
        apiBindingMode = false;
        visualEditMode = false;
        document.body.style.cursor = 'pointer';
      } else {
        document.body.style.cursor = '';
        if (pageMappingHoveredEl) {
          pageMappingHoveredEl.style.outline = '';
          pageMappingHoveredEl.style.outlineOffset = '';
          pageMappingHoveredEl = null;
        }
      }
    }
  });

  function clearApiIndicators() {
    apiIndicators.forEach(function(el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    apiIndicators = [];
  }
})();
</script>
`;
