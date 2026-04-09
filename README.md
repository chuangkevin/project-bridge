# Design Bridge

AI 驅動的原型生成器 — 一句話，從想法到可互動原型。

## 這是什麼？

Design Bridge 是一個 AI 原型生成平台，讓你用自然語言描述 UI，幾秒內就能得到完整可互動的 HTML 原型。它是設計想法和可用原型之間的「橋樑」。

**線上版：** [designbridge.housefun.com.tw](https://designbridge.housefun.com.tw)

## 功能列表

### 核心生成

- **AI 原型生成** — 用中文描述你的 UI，AI 生成多頁面可互動 HTML 原型（含真實內容、圖片、導航）
- **多頁面支援** — AI 自動分析需求，產生互連頁面（如：商品列表 → 詳情 → 購物車 → 結帳）
- **4-Agent 討論** — Echo(PM) → Lisa(UX) → David(QA) → Bob(Tech) + Echo 確認輪，結構化 chain-of-thought 推理
- **11 種場景模板** — 購物/旅遊/教育/醫療/SaaS/新聞/圖書館/餐廳/作品集/活動/房屋
- **Plan 自我驗證** — 生成計畫後自動檢查孤島頁面、導航死角
- **AI 思考透明化** — 即時看到 AI 的分析過程、偵測到的頁面、生成步驟
- **生成 Checklist** — 設計模式顯示執行清單（需求確認、規則檢查、逐頁生成、驗證）

### 對話 & 微調

- **💬 對話模式** — 不生成 UI，純對話討論業務邏輯、系統架構（帶 Skills + 文件知識庫）
- **顧問子模式** — 自動切換 spec review / architecture review / UX review，先保留 source of truth 再下結論
- **Smart Intent** — 有原型時，修改動詞（加上/改成/刪掉）自動走微調，不重新生成
- **🎯 元件選取微調** — 點選 iframe 裡的元件，AI 只修改那個元件的 HTML（省 90% token）
- **Markdown 渲染** — 對話回覆支援 GFM 表格、程式碼、列表
- **微調模式** — 對生成的原型用後續訊息微調，不需從頭重新生成

### 品質保障

- **HTML QA Validator** — 每次生成後自動檢查空頁面、div 平衡、缺失導航
- **Auto-retry** — 失敗/內容不足的頁面自動重試 2 次（間隔 429 cooldown）
- **Skill 衝突檢測** — AI 比對使用者需求 vs 業務規則，發現矛盾即時提醒
- **外部圖片替換** — 自動將 `<img src="https://...">` 替換為 CSS placeholder

### 設計工具

- **架構圖** — 視覺化頁面流程編輯器，拖曳節點和連線
- **設計檔案** — 上傳參考設計（PDF/圖片），AI 自動提取色彩、字型、版型模式
- **全域設計系統** — 定義設計規範（色彩、字型），套用到所有專案
- **美術風格偵測** — 上傳參考圖，AI 偵測並套用視覺風格
- **Agent Skills** — 20+ 業務知識庫，注入到 agent 討論和 sub-agent 生成（按頁面相關性選 top 3）
- **提示詞模板** — 預設常見 UI 模式的提示詞（表單、儀表板、電商等）

### 開發工具

- **程式碼檢視器** — 語法高亮的 HTML 原始碼，含檔案樹、搜尋（Ctrl+F）、一鍵複製
- **API 綁定** — 定義元素層級或頁面層級的 API 端點，匯出 JSON
- **標註系統** — 在元素上標記設計規格和備註
- **匯出** — 下載 HTML、匯出 API 綁定、公開分享連結

### 使用者體驗

- **深色模式** — 偵測系統偏好 + 手動切換
- **拖曳排序** — 首頁專案卡片支援拖曳排序
- **面板大小調整** — 拖曳調整對話面板和預覽面板
- **裝置預覽** — 桌面版、平板、手機版切換
- **版本歷史** — 瀏覽和還原先前的原型版本

### 平台功能

- **多使用者** — 使用者管理，admin/user 角色
- **認證系統** — Bearer token session + 管理員密碼
- **多 API Key** — Gemini API Key 輪替，429 時自動換 key 重試
- **外部 Skills 同步** — 自動匯入外部目錄的 SKILL.md 檔案（SKILLS_DIR 環境變數）

## 技術架構

| 層級 | 技術 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite |
| 後端 | Express + TypeScript + ts-node-dev |
| 資料庫 | SQLite (better-sqlite3) + WAL 模式 |
| AI | Google Gemini 2.5 Flash（SSE 串流） |
| 樣式 | Inline CSS-in-JS + CSS 自訂屬性（深色模式） |
| 程式碼高亮 | prism-react-renderer |
| 拖曳 | @dnd-kit/core + @dnd-kit/sortable |
| 架構圖 | @xyflow/react (React Flow) |
| 測試 | Playwright E2E |
| CI/CD | GitHub Actions (Docker Hub) + Gitea Actions (ArgoCD + K8s) |
| 容器 | Docker (node:22-alpine) |
| 部署 | K8s (ArgoCD) + Docker Compose (Tailscale SSH) |

## 專案結構

```text
project-bridge/
  packages/
    client/          # React 前端 (Vite, port 5191)
    server/          # Express API 伺服器 (port 3003)
    e2e/             # Playwright E2E 測試
  openspec/          # 功能規格與任務追蹤
  .github/workflows/ # GitHub CI/CD (Docker Hub + Tailscale 部署)
  .gitea/workflows/  # Gitea CI/CD (內部 registry + ArgoCD)
```

## 快速開始

```bash
# 安裝依賴
pnpm install

# 啟動開發環境
pnpm --filter server dev   # http://localhost:3003
pnpm --filter client dev   # http://localhost:5191

# 環境變數 (packages/server/.env)
PORT=3003
SKILLS_DIR=path/to/skills  # 選填：自動匯入 SKILL.md 檔案
```

## 部署

### Docker Compose（GitHub CD）

```bash
docker compose up -d
# 服務在 port 5123 -> 3001
```

### K8s / ArgoCD（Gitea CD）

推送到 `main` 觸發：build image → push 到內部 registry → 更新 ArgoCD app → sync

## 授權

內部使用。
