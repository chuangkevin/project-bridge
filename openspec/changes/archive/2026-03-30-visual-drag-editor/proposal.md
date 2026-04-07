## Why

The current prototype editing workflow is entirely prompt-driven — users must describe every visual change in words, wait for AI generation, and hope the result matches their intent. For spatial and styling tasks (repositioning elements, resizing components, changing colors and fonts), this text-to-UI loop is painfully slow and imprecise. The existing drag-edit mode only supports repositioning via CSS transform. Users need a visual editing layer similar to a simplified Figma where they can directly select, drag, resize, and style elements in the prototype preview.

## What Changes

- **Visual editing overlay**: A transparent interaction layer rendered on top of the prototype iframe. When activated, it intercepts mouse events and renders selection handles, resize grips, and a property panel for the selected element
- **Element selection**: Clicking an element with `data-bridge-id` selects it, showing a selection box with 8 resize handles (corners + edges) and a drag handle. The property panel opens showing the element's current styles
- **Drag to reposition**: Selected elements can be dragged to a new position within their parent container. Repositioning uses CSS properties (margin, position, or flexbox order) appropriate to the layout context
- **Resize**: Dragging resize handles changes the element's width/height. Aspect ratio lock is available via Shift key
- **Property panel**: A floating panel shows editable properties for the selected element — colors (background, text, border), fonts (family, size, weight), spacing (padding, margin), border radius, and opacity. Changes apply immediately to the live preview
- **CSS/HTML patch persistence**: All visual edits are captured as CSS overrides and HTML attribute changes, stored as a patch layer on top of the generated prototype. The patch is preserved across chat interactions and only cleared on explicit regeneration
- **Integration with GrapesJS or custom overlay**: Evaluate GrapesJS as the editing engine; if too heavy, build a lightweight custom overlay system using DOM measurement APIs and PostMessage communication with the iframe

## Capabilities

### New Capabilities
- `visual-element-selector`: Click-to-select interaction layer over the prototype iframe; renders selection box with resize handles and drag affordance on the selected `data-bridge-id` element; supports multi-select via Shift+click
- `element-resize`: Drag resize handles on selected elements to change width/height; supports aspect ratio lock (Shift key); applies changes as inline CSS on the element
- `style-property-panel`: Floating panel displaying editable CSS properties (colors, fonts, spacing, borders, opacity) for the selected element; changes apply immediately via PostMessage to the iframe and are captured as CSS patches
- `edit-patch-persistence`: Visual edits stored as a CSS/HTML patch layer (JSON diff format) associated with the current prototype version; patches survive chat micro-adjustments but are cleared on full regeneration; patches are applied on top of generated HTML when rendering

### Modified Capabilities
- `prototype-preview`: Preview panel gains a "Visual Edit" mode toggle alongside existing annotation and drag-edit modes; iframe communication extended with select/resize/style-change message types
- `prototype-drag-edit`: Subsumed into the visual editor as the drag-to-reposition feature; existing transform-based repositioning logic is preserved but integrated into the new selection-based interaction model

## Impact

- **Client**: New `VisualEditor` component managing the overlay layer, selection state, resize handles, and property panel; new `StylePropertyPanel` component with color pickers, font selectors, and spacing inputs; PreviewPanel updated with Visual Edit mode toggle; bridge script extended with selection, resize, and style-change message handlers
- **Server**: New `PATCH /api/projects/:id/prototype/patches` route for storing edit patches; patches table or JSON column in `prototype_versions`; patch application utility that merges patches into base HTML for rendering and export
- **DB schema**: New `prototype_patches` table (project_id, version_id, patches JSON, created_at) or `patches` JSON column added to `prototype_versions`
- **Dependencies**: Evaluate GrapesJS (~800KB gzipped) vs custom overlay; if custom, no new dependencies; DOM measurement via iframe.contentDocument.getBoundingClientRect()
- **Performance**: Overlay rendering must stay under 16ms per frame for smooth drag/resize; use requestAnimationFrame for position updates; debounce property panel changes (100ms)
