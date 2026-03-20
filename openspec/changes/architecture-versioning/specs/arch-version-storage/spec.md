# Spec: arch-version-storage

Backend storage and lifecycle management for architecture versions.

## Requirements

### R1: Save version on page add

- **WHEN** a user adds a new page node in the architecture flowchart
- **THEN** a new version is saved with the full `arch_data` snapshot
- **AND** the description is set to `"Added page: <page_name>"`
- **AND** the version number increments by 1 from the previous highest version for this project

### R2: Save version on page delete

- **WHEN** a user deletes a page node from the architecture flowchart
- **THEN** a new version is saved with the `arch_data` snapshot **before** the deletion is applied
- **AND** the description is set to `"Deleted page: <page_name>"`

### R3: Save version on edge add

- **WHEN** a user connects two nodes (adds an edge) in the architecture flowchart
- **THEN** a new version is saved with the full `arch_data` snapshot
- **AND** the description is set to `"Added edge"`

### R4: Save version on edge delete

- **WHEN** a user removes an edge from the architecture flowchart
- **THEN** a new version is saved with the `arch_data` snapshot **before** the deletion is applied
- **AND** the description is set to `"Deleted edge"`

### R5: Save version on manual save

- **WHEN** a user clicks the "Save Version" button in the toolbar
- **THEN** a new version is saved with the current `arch_data` snapshot
- **AND** the description is set to `"Manual save"`

### R6: Debounce version saves

- **WHEN** multiple qualifying changes occur within a 5-second window
- **THEN** only a single version is saved after the 5-second debounce period elapses
- **AND** the description reflects the most recent change type

### R7: Auto-prune old versions

- **WHEN** a new version is saved and the total version count for the project exceeds 50
- **THEN** the oldest versions beyond the 50 most recent are automatically deleted
- **AND** the 50 most recent versions remain intact

### R8: Version data integrity

- **WHEN** a version is saved
- **THEN** the `arch_data` field contains a complete, valid JSON snapshot of the architecture
- **AND** the `created_at` timestamp reflects the actual save time
- **AND** the `project_id` correctly references the owning project

### R9: First version

- **WHEN** a project has no existing versions and a qualifying change occurs
- **THEN** the first version is saved with `version = 1`
