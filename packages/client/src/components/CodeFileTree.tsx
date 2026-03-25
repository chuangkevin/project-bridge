import { useState, useMemo } from 'react';

interface CodeFileTreeProps {
  pages: string[];
  activePage: string | null;
  onSelect: (page: string) => void;
  html?: string;
  onScrollToSection?: (section: string) => void;
}

interface TreeNode {
  name: string;
  icon: string;
  type: 'folder' | 'file';
  id: string; // used for selection + scroll
  children?: TreeNode[];
  depth: number;
}

/** Parse HTML to build a virtual VS Code-like file tree */
function buildFileTree(html: string, pages: string[]): TreeNode[] {
  const tree: TreeNode[] = [];

  // Root: project name from <title> or fallback
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const projectName = titleMatch?.[1]?.trim() || 'prototype';

  // src/ folder
  const srcChildren: TreeNode[] = [];

  // Pages as components
  if (pages.length > 0) {
    const pageFiles = pages.map(p => ({
      name: `${p}.html`,
      icon: '📄',
      type: 'file' as const,
      id: `page:${p}`,
      depth: 2,
    }));
    srcChildren.push({
      name: 'pages/',
      icon: '📁',
      type: 'folder',
      id: 'folder:pages',
      depth: 1,
      children: pageFiles,
    });
  }

  // Detect components from HTML (nav, header, footer, sidebar, modal)
  const componentPatterns = [
    { pattern: /<nav\b/i, name: 'Navigation.html' },
    { pattern: /<header\b/i, name: 'Header.html' },
    { pattern: /<footer\b/i, name: 'Footer.html' },
    { pattern: /<aside\b|class=".*sidebar/i, name: 'Sidebar.html' },
    { pattern: /class=".*modal|role="dialog"/i, name: 'Modal.html' },
    { pattern: /<form\b/i, name: 'Form.html' },
    { pattern: /<table\b/i, name: 'DataTable.html' },
  ];
  const components = componentPatterns
    .filter(c => c.pattern.test(html))
    .map(c => ({ name: c.name, icon: '🧩', type: 'file' as const, id: `comp:${c.name}`, depth: 2 }));

  if (components.length > 0) {
    srcChildren.push({
      name: 'components/',
      icon: '📁',
      type: 'folder',
      id: 'folder:components',
      depth: 1,
      children: components,
    });
  }

  if (srcChildren.length > 0) {
    tree.push({
      name: 'src/',
      icon: '📁',
      type: 'folder',
      id: 'folder:src',
      depth: 0,
      children: srcChildren,
    });
  }

  // Styles
  const styleCount = (html.match(/<style\b/gi) || []).length;
  if (styleCount > 0) {
    const styleChildren: TreeNode[] = [];
    // Check for CSS variables / design tokens
    if (/--[a-z]+-[a-z]+\s*:/i.test(html)) {
      styleChildren.push({ name: 'variables.css', icon: '🎨', type: 'file', id: 'style:variables', depth: 2 });
    }
    // Check for media queries (responsive)
    if (/@media/i.test(html)) {
      styleChildren.push({ name: 'responsive.css', icon: '📱', type: 'file', id: 'style:responsive', depth: 2 });
    }
    styleChildren.push({ name: 'main.css', icon: '🎨', type: 'file', id: 'section:style', depth: 2 });

    tree.push({
      name: 'styles/',
      icon: '📁',
      type: 'folder',
      id: 'folder:styles',
      depth: 0,
      children: styleChildren,
    });
  }

  // Scripts
  const scriptCount = (html.match(/<script\b/gi) || []).length;
  if (scriptCount > 0) {
    const scriptChildren: TreeNode[] = [];
    if (/addEventListener|onclick/i.test(html)) {
      scriptChildren.push({ name: 'events.js', icon: '⚡', type: 'file', id: 'script:events', depth: 2 });
    }
    if (/localStorage|sessionStorage/i.test(html)) {
      scriptChildren.push({ name: 'storage.js', icon: '💾', type: 'file', id: 'script:storage', depth: 2 });
    }
    if (/fetch\(|XMLHttpRequest/i.test(html)) {
      scriptChildren.push({ name: 'api.js', icon: '🌐', type: 'file', id: 'script:api', depth: 2 });
    }
    scriptChildren.push({ name: 'main.js', icon: '📜', type: 'file', id: 'section:script', depth: 2 });

    tree.push({
      name: 'scripts/',
      icon: '📁',
      type: 'folder',
      id: 'folder:scripts',
      depth: 0,
      children: scriptChildren,
    });
  }

  // Root files
  tree.push({ name: 'index.html', icon: '🏠', type: 'file', id: 'root:index', depth: 0 });
  tree.push({ name: `${projectName}.json`, icon: '📋', type: 'file', id: 'root:meta', depth: 0 });

  return tree;
}

function TreeItem({ node, activePage, onSelect, onScrollToSection, expandedIds, toggleExpand }: {
  node: TreeNode;
  activePage: string | null;
  onSelect: (page: string) => void;
  onScrollToSection?: (section: string) => void;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isActive = node.id === `page:${activePage}`;
  const indent = node.depth * 12 + 8;

  const handleClick = () => {
    if (node.type === 'folder') {
      toggleExpand(node.id);
    } else if (node.id.startsWith('page:')) {
      onSelect(node.id.replace('page:', ''));
    } else if (node.id.startsWith('section:') || node.id.startsWith('style:') || node.id.startsWith('script:') || node.id.startsWith('comp:')) {
      onScrollToSection?.(node.id);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        style={{
          ...styles.itemBtn,
          paddingLeft: indent,
          backgroundColor: isActive ? '#313244' : 'transparent',
          color: isActive ? '#cba6f7' : node.type === 'folder' ? '#cdd6f4' : '#a6adc8',
          fontWeight: node.type === 'folder' ? 600 : 400,
        }}
        title={node.name}
      >
        {node.type === 'folder' && (
          <span style={{ fontSize: 10, width: 12, textAlign: 'center', flexShrink: 0, color: '#6c7086' }}>
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
        {node.type === 'file' && <span style={{ width: 12, flexShrink: 0 }} />}
        <span style={{ fontSize: 12, lineHeight: 1, flexShrink: 0 }}>{node.icon}</span>
        <span style={styles.itemName}>{node.name}</span>
      </button>
      {node.type === 'folder' && isExpanded && node.children?.map(child => (
        <TreeItem
          key={child.id}
          node={child}
          activePage={activePage}
          onSelect={onSelect}
          onScrollToSection={onScrollToSection}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
        />
      ))}
    </>
  );
}

export default function CodeFileTree({ pages, activePage, onSelect, html, onScrollToSection }: CodeFileTreeProps) {
  const tree = useMemo(() => buildFileTree(html || '', pages), [html, pages]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    new Set(['folder:src', 'folder:pages', 'folder:components', 'folder:styles', 'folder:scripts'])
  );

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={styles.container} data-testid="code-file-tree">
      <div style={styles.header}>EXPLORER</div>
      {tree.map(node => (
        <TreeItem
          key={node.id}
          node={node}
          activePage={activePage}
          onSelect={onSelect}
          onScrollToSection={onScrollToSection}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 220,
    flexShrink: 0,
    backgroundColor: '#1e1e2e',
    borderRight: '1px solid #313244',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    fontFamily: "'Segoe UI', 'Helvetica Neue', sans-serif",
    fontSize: 12,
  },
  header: {
    padding: '8px 12px 6px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: '#6c7086',
    textTransform: 'uppercase' as const,
    borderBottom: '1px solid #313244',
  },
  itemBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    width: '100%',
    padding: '3px 8px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: 12,
    fontFamily: 'inherit',
    borderRadius: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    transition: 'background-color 0.1s',
  },
  itemName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
};
