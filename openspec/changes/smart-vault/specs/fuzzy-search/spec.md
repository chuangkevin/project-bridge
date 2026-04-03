## ADDED Requirements

### Requirement: Full-text fuzzy search across all content
The system SHALL provide a unified search API that searches across file contents, file summaries, diary entries, and diary titles using SQLite FTS5.

#### Scenario: Search matching files and diary
- **WHEN** user searches for "旅行計畫"
- **THEN** system returns matching results from both files and diary entries, ranked by relevance, with highlighted snippets

#### Scenario: Search with no results
- **WHEN** user searches for a term with no matches
- **THEN** system returns an empty result set with count 0

#### Scenario: Search with pagination
- **WHEN** user searches with page=2&limit=10
- **THEN** system returns the second page of results with total count

### Requirement: Chinese text support
The system SHALL support Chinese text search using appropriate FTS5 tokenizer configuration.

#### Scenario: Chinese character search
- **WHEN** user searches for Chinese characters like "會議記錄"
- **THEN** system returns results containing those characters, including partial matches

### Requirement: Search result highlighting
The system SHALL return search results with matched terms highlighted using snippet markers.

#### Scenario: Highlighted snippets
- **WHEN** search returns results
- **THEN** each result includes a snippet with matched terms wrapped in `<mark>` tags

### Requirement: Search filters
The system SHALL support filtering search results by content type (files only, diary only, or all).

#### Scenario: Filter by files only
- **WHEN** user searches with filter=files
- **THEN** system returns only file-based results

#### Scenario: Filter by diary only
- **WHEN** user searches with filter=diary
- **THEN** system returns only diary-based results
