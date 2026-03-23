import db from '../db/connection';

interface ArchNode {
  id: string;
  nodeType: 'page' | 'component';
  name: string;
  position: { x: number; y: number };
  referenceFileId: string | null;
  referenceFileUrl: string | null;
  interactions?: Array<{ label: string; outcome: string }>;
  states?: string[];
  viewport?: 'mobile' | 'desktop' | null;
  components?: any[];
}

interface ArchEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  triggerBridgeId?: string | null;
  triggerLabel?: string | null;
}

interface ArchData {
  type: 'page' | 'component';
  subtype?: string;
  aiDecidePages?: boolean;
  nodes: ArchNode[];
  edges: ArchEdge[];
}

/**
 * Sync architecture data from page_element_mappings.
 * - If no arch_data exists, create ArchNodes from data-page + ArchEdges from mappings
 * - If arch_data exists, update/add/remove ArchEdges based on mappings
 */
export function syncArchFromMappings(projectId: string): void {
  const project = db.prepare('SELECT arch_data FROM projects WHERE id = ?').get(projectId) as { arch_data: string | null } | undefined;
  if (!project) return;

  const mappings = db.prepare(
    'SELECT * FROM page_element_mappings WHERE project_id = ? AND navigation_target IS NOT NULL'
  ).all(projectId) as Array<{
    bridge_id: string;
    page_name: string;
    navigation_target: string;
  }>;

  // Get pages from current prototype HTML
  const version = db.prepare(
    'SELECT html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
  ).get(projectId) as { html: string } | undefined;

  const pageNames: string[] = [];
  if (version) {
    const pageRegex = /data-page="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = pageRegex.exec(version.html)) !== null) {
      if (!pageNames.includes(m[1])) pageNames.push(m[1]);
    }
  }

  let archData: ArchData | null = null;
  try {
    archData = project.arch_data ? JSON.parse(project.arch_data) : null;
  } catch { /* ignore */ }

  if (!archData || !archData.nodes || archData.nodes.length === 0) {
    // Create arch_data from scratch
    archData = createArchFromPages(pageNames, mappings);
  } else {
    // Update edges in existing arch_data
    updateArchEdges(archData, mappings, pageNames);
  }

  db.prepare('UPDATE projects SET arch_data = ? WHERE id = ?').run(
    JSON.stringify(archData),
    projectId
  );
}

/**
 * Create ArchData from page names and mappings (for projects without architecture).
 */
function createArchFromPages(
  pageNames: string[],
  mappings: Array<{ bridge_id: string; page_name: string; navigation_target: string }>
): ArchData {
  const nodes: ArchNode[] = pageNames.map((name, i) => ({
    id: `page-${name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${i}`,
    nodeType: 'page' as const,
    name,
    position: { x: 100 + (i % 4) * 300, y: 100 + Math.floor(i / 4) * 200 },
    referenceFileId: null,
    referenceFileUrl: null,
  }));

  const edges: ArchEdge[] = [];
  for (const mapping of mappings) {
    const sourceNode = nodes.find(n => n.name === mapping.page_name);
    const targetNode = nodes.find(n => n.name === mapping.navigation_target);
    if (sourceNode && targetNode) {
      edges.push({
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: sourceNode.id,
        target: targetNode.id,
        triggerBridgeId: mapping.bridge_id,
        triggerLabel: null,
      });
    }
  }

  return { type: 'page', nodes, edges };
}

/**
 * Update ArchEdges in existing ArchData based on mappings.
 */
function updateArchEdges(
  archData: ArchData,
  mappings: Array<{ bridge_id: string; page_name: string; navigation_target: string }>,
  pageNames: string[]
): void {
  // Ensure all pages have nodes (add missing ones)
  for (const pageName of pageNames) {
    if (!archData.nodes.find(n => n.name === pageName)) {
      archData.nodes.push({
        id: `page-${pageName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`,
        nodeType: 'page',
        name: pageName,
        position: { x: 100 + archData.nodes.length * 300, y: 100 },
        referenceFileId: null,
        referenceFileUrl: null,
      });
    }
  }

  // Remove edges that have triggerBridgeId but are no longer in mappings
  const mappingBridgeIds = new Set(mappings.map(m => m.bridge_id));
  archData.edges = archData.edges.filter(e =>
    !e.triggerBridgeId || mappingBridgeIds.has(e.triggerBridgeId)
  );

  // Add or update edges from mappings
  for (const mapping of mappings) {
    const sourceNode = archData.nodes.find(n => n.name === mapping.page_name);
    const targetNode = archData.nodes.find(n => n.name === mapping.navigation_target);
    if (!sourceNode || !targetNode) continue;

    const existingEdge = archData.edges.find(e => e.triggerBridgeId === mapping.bridge_id);
    if (existingEdge) {
      existingEdge.source = sourceNode.id;
      existingEdge.target = targetNode.id;
    } else {
      archData.edges.push({
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: sourceNode.id,
        target: targetNode.id,
        triggerBridgeId: mapping.bridge_id,
        triggerLabel: null,
      });
    }
  }
}

/**
 * Clean up mappings after prototype regeneration.
 * Removes mappings whose bridge_id no longer exists in the new HTML.
 * Re-applies onclick for surviving mappings.
 */
export function cleanupMappingsAfterRegeneration(projectId: string, newHtml: string): string {
  // Extract all bridge_ids from new HTML
  const bridgeIdRegex = /data-bridge-id="([^"]+)"/g;
  const newBridgeIds = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = bridgeIdRegex.exec(newHtml)) !== null) {
    newBridgeIds.add(m[1]);
  }

  // Get existing mappings
  const mappings = db.prepare(
    'SELECT * FROM page_element_mappings WHERE project_id = ?'
  ).all(projectId) as Array<{
    id: string;
    bridge_id: string;
    page_name: string;
    navigation_target: string | null;
  }>;

  if (mappings.length === 0) return newHtml;

  const toDelete: string[] = [];
  let html = newHtml;

  for (const mapping of mappings) {
    if (!newBridgeIds.has(mapping.bridge_id)) {
      // Bridge ID no longer exists — delete mapping
      toDelete.push(mapping.id);
    } else if (mapping.navigation_target) {
      // Bridge ID still exists — re-apply onclick
      html = setOnclick(html, mapping.bridge_id, mapping.navigation_target);
    }
  }

  // Delete stale mappings
  if (toDelete.length > 0) {
    const placeholders = toDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM page_element_mappings WHERE id IN (${placeholders})`).run(...toDelete);
  }

  // Sync architecture (remove stale edges)
  syncArchFromMappings(projectId);

  return html;
}

function setOnclick(html: string, bridgeId: string, target: string): string {
  const escapedId = bridgeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(<[^>]*data-bridge-id="${escapedId}"[^>]*)>`, 'g');
  return html.replace(regex, (match, tagContent) => {
    let cleaned = tagContent.replace(/\s*onclick\s*=\s*"[^"]*showPage\([^)]*\)[^"]*"/gi, '');
    cleaned = cleaned.replace(/\s*onclick\s*=\s*'[^']*showPage\([^)]*\)[^']*'/gi, '');
    return `${cleaned} onclick="showPage('${target}')">`;
  });
}
