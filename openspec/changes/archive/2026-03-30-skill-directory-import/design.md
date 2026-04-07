## Architecture

### DB Schema Changes

```sql
ALTER TABLE agent_skills ADD COLUMN source_path TEXT;     -- 匯入來源路徑（用於 re-sync）
ALTER TABLE agent_skills ADD COLUMN depends_on TEXT;       -- JSON array of skill names this skill references
```

### API Endpoints

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/skills/batch` | 批量 upsert skills（已實作，需擴充） |
| `POST` | `/api/skills/batch-action` | 批量啟用/停用/刪除 |
| `GET` | `/api/skills/:id/references` | 查詢 skill 的引用和被引用關係 |
| `GET` | `/api/skills/graph` | 所有 skill 的引用圖（adjacency list） |

### Reference Detection Algorithm

從 skill content 中解析引用：
1. **Explicit**: frontmatter `depends` 欄位（YAML array）
2. **Implicit**: content 中提到其他 skill 的 `name`（exact match, case-insensitive）
3. 引用關係存入 `depends_on` 欄位（JSON array）
4. 每次 batch import 後自動重新計算引用

```typescript
function detectReferences(skillName: string, content: string, allSkillNames: string[]): string[] {
  const refs: string[] = [];
  for (const name of allSkillNames) {
    if (name !== skillName && content.includes(name)) {
      refs.push(name);
    }
  }
  return refs;
}
```

### Client UI

#### 目錄匯入 Button
- 使用 `showDirectoryPicker()` (File System Access API)
- 遞迴掃描 `SKILL.md`，解析 frontmatter
- 顯示預覽列表（name, description, 新增/更新 badge）
- 確認後呼叫 `POST /api/skills/batch`

#### 關聯顯示
- 每個 skill card 下方顯示 tags：`引用: skill-a, skill-b` 和 `被引用: skill-c`
- 點擊 tag 跳轉到對應 skill
- 無需完整 graph 視覺化（太複雜）

#### 批量操作
- table header 新增全選 checkbox
- 選中後底部浮出操作列：「啟用 (N)」「停用 (N)」「刪除 (N)」
- 刪除需確認對話框

## Constraints

- File System Access API 只在 HTTPS + 現代 Chrome/Edge 可用（Safari/Firefox 不支援）
- fallback: 提供 `<input type="file" webkitdirectory>` 作為備用
- skill 引用是軟連結（不阻止刪除被引用的 skill，只顯示警告）
