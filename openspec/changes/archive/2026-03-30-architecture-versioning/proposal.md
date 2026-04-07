# Proposal: Architecture Versioning

## Why

Architecture data (`arch_data`) is stored as a single JSON blob on the `projects` table. Every save overwrites the previous state. Users who accidentally delete pages, edges, or make unwanted bulk changes have no way to recover prior work. This is a significant data-loss risk, especially as architecture diagrams grow in complexity.

## What

Introduce automatic version control for architecture data:

- **Auto-save versions** on significant structural changes (page add/delete, edge add/delete, manual save).
- **Version history panel** in the ArchFlowchart UI so users can browse past versions with timestamps.
- **Restore capability** to roll back to any previous version with a single click.

## New Capabilities

| Capability ID | Description |
|---|---|
| `arch-version-storage` | Backend storage and lifecycle management for architecture versions |
| `arch-version-history-ui` | UI panel displaying version history with timestamps and descriptions |
| `arch-version-restore` | Restore a previous version, replacing current `arch_data` safely |

## Impact

- **Database**: New `architecture_versions` table storing versioned snapshots of `arch_data`.
- **API**: Three new endpoints on the architecture router (`GET /versions`, `POST /versions`, `POST /versions/:versionId/restore`).
- **Client**: Changes to `ArchFlowchart.tsx` to trigger version saves on structural changes (debounced), plus a new version history panel component.
- **Data retention**: Auto-prune to keep the last 50 versions per project, preventing unbounded storage growth.
