import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';
import { requireAdmin } from '../middleware/auth';

const router = Router();

// ── Seed system templates on first load ──────────────────────────
function seedSystemTemplates() {
  const count = db.prepare('SELECT COUNT(*) as c FROM prompt_templates WHERE is_system = 1').get() as any;
  if (count.c > 0) return; // already seeded

  const templates = [
    { name: '表單頁面', category: 'form', content: '請生成一個表單頁面，包含以下欄位：\n- \n\n要求：\n- 表單驗證\n- 送出按鈕\n- 清楚的標籤和提示文字' },
    { name: '數據儀表板', category: 'dashboard', content: '請生成一個數據儀表板，包含：\n- 頂部統計摘要卡片\n- 圖表區域（折線圖/長條圖）\n- 數據表格\n- 篩選器' },
    { name: '電商首頁', category: 'landing', content: '請生成一個電商首頁，包含：\n- Hero banner\n- 熱門商品展示\n- 分類導覽\n- 促銷活動區\n- Footer 聯絡資訊' },
    { name: '清單頁面', category: 'list', content: '請生成一個清單頁面，包含：\n- 搜尋列\n- 篩選/排序功能\n- 卡片或表格式清單\n- 分頁導覽' },
    { name: '詳情頁面', category: 'detail', content: '請生成一個詳情頁面，包含：\n- 主要內容區\n- 側邊欄資訊\n- 圖片/媒體展示\n- 相關項目推薦\n- 返回按鈕' },
  ];

  const stmt = db.prepare('INSERT INTO prompt_templates (id, name, category, content, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)');
  for (const t of templates) {
    const now = new Date().toISOString();
    stmt.run(uuidv4(), t.name, t.category, t.content, now, now);
  }
}

// Try seeding — table may not exist yet if migration hasn't run
try { seedSystemTemplates(); } catch { /* migration pending */ }

// ── GET /api/prompt-templates — list all, optional ?category=X ───
router.get('/', (_req: Request, res: Response) => {
  try {
    const { category } = _req.query;
    let rows;
    if (category && typeof category === 'string') {
      rows = db.prepare('SELECT * FROM prompt_templates WHERE category = ? ORDER BY is_system DESC, created_at ASC').all(category);
    } else {
      rows = db.prepare('SELECT * FROM prompt_templates ORDER BY is_system DESC, created_at ASC').all();
    }
    return res.json(rows);
  } catch (err: any) {
    console.error('Error listing prompt templates:', err);
    return res.status(500).json({ error: 'Failed to list prompt templates' });
  }
});

// ── POST /api/prompt-templates — create (admin only) ─────────────
router.post('/', requireAdmin, (req: Request, res: Response) => {
  try {
    const { name, category, content } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO prompt_templates (id, name, category, content, is_system, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)'
    ).run(id, name.trim(), (category || 'general').toString().trim(), content.trim(), req.user?.id ?? null, now, now);
    const row = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(id);
    return res.status(201).json(row);
  } catch (err: any) {
    console.error('Error creating prompt template:', err);
    return res.status(500).json({ error: 'Failed to create prompt template' });
  }
});

// ── PUT /api/prompt-templates/:id — update (admin only, not system) ─
router.put('/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    if (existing.is_system === 1) return res.status(403).json({ error: 'Cannot modify system templates' });

    const { name, category, content } = req.body;
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE prompt_templates SET name = ?, category = ?, content = ?, updated_at = ? WHERE id = ?'
    ).run(
      (name ?? existing.name).toString().trim(),
      (category ?? existing.category).toString().trim(),
      (content ?? existing.content).toString().trim(),
      now,
      req.params.id,
    );
    const row = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(req.params.id);
    return res.json(row);
  } catch (err: any) {
    console.error('Error updating prompt template:', err);
    return res.status(500).json({ error: 'Failed to update prompt template' });
  }
});

// ── DELETE /api/prompt-templates/:id — delete (admin only, not system) ─
router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    if (existing.is_system === 1) return res.status(403).json({ error: 'Cannot delete system templates' });

    db.prepare('DELETE FROM prompt_templates WHERE id = ?').run(req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting prompt template:', err);
    return res.status(500).json({ error: 'Failed to delete prompt template' });
  }
});

export default router;
