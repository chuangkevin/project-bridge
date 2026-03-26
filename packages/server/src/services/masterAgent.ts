import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKey, getGeminiModel, trackUsage } from './geminiKeys';
import { DesignTokens, tokensToCssVariables } from './designTokenCompiler';

export interface PageAssignment {
  name: string;
  viewport: 'mobile' | 'desktop';
  spec: string; // Full spec text for this page
  constraints: string; // Key components and interactions
  navigationOut: string[]; // Pages this page links to
}

export interface GenerationPlan {
  shell: {
    hasNav: boolean;
    navType: 'top-bar' | 'sidebar' | 'bottom-tab' | 'none';
    navItems: string[];
    hasFooter: boolean;
  };
  sharedCss: string; // Shared CSS for nav, layout, utilities
  cssVariables: string; // :root block from design tokens
  pages: PageAssignment[];
}

/**
 * Master Agent: reads analysis result + design tokens, produces a generation plan.
 * Does NOT generate HTML — only plans the work for sub-agents.
 */
export async function planGeneration(
  analysisData: any,
  designTokens: DesignTokens | null,
  architectureBlock: string,
  designConvention: string,
  projectContext: string,
): Promise<GenerationPlan> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('No API key available');

  const cssVariables = designTokens ? tokensToCssVariables(designTokens) : '';

  const prompt = `You are a senior UI architect for HousePrice (好房網), Taiwan's leading real estate platform.
You MUST follow the HousePrice Design System strictly. Every generated prototype must look like it belongs on houseprice.tw.

CRITICAL RULES:
- Include ALL pages from the analysis — missing pages means broken navigation
- Each page spec MUST be comprehensive: layout, components, interactions, data, edge states
- Sub-agents cannot see other pages — they rely ENTIRELY on your spec and sharedCss
- Use realistic placeholder data appropriate to the domain (product names, prices, dates)
- sharedCss must define ALL shared components (nav, footer, cards, buttons, forms, modals)

SPEC QUALITY REQUIREMENTS:
- Each page spec MUST be 200+ words
- Must include: layout description (grid/flex, columns, widths), component list (each with data fields, states, interactions), navigation to other pages, empty/loading states
- Must specify exact CSS classes from sharedCss to use

SHARED CSS REQUIREMENTS (CRITICAL):
- Must be 150+ lines of actual CSS
- Must include: CSS reset, :root with ALL design tokens, .container, .card, .btn-primary, .btn-secondary, .btn-cta, .form-group, .form-input, .form-select, nav/header/footer, .badge, .tag, grid utilities, @media responsive
- Must use HousePrice tokens: --primary: #8E6FA7, --bg: #FAF4EB, --surface: #F8F7F5, --text: #333333, etc.

ANTI-PATTERNS (VIOLATIONS):
- NEVER use #FFFFFF as page background (use #FAF4EB)
- NEVER use large solid color blocks for section backgrounds
- NEVER use gradients on hero sections (only on small CTA buttons)
- NEVER use box-shadow with blur > 4px
- NEVER use border-radius > 8px on buttons
- NEVER use non-system fonts

${designConvention ? `HOUSEPRICE DESIGN SYSTEM (MANDATORY — follow exactly):\n${designConvention.slice(0, 5000)}\n` : ''}

INPUT:
${architectureBlock ? `Architecture:\n${architectureBlock}\n` : ''}
${projectContext ? `Context:\n${projectContext}\n` : ''}

Analysis data:
${JSON.stringify(analysisData, null, 2)}

CSS Variables available:
${cssVariables || '(use defaults)'}

OUTPUT: Return ONLY valid JSON matching this schema:
{
  "shell": {
    "hasNav": true/false,
    "navType": "top-bar" | "sidebar" | "bottom-tab" | "none",
    "navItems": ["page name 1", "page name 2"],
    "hasFooter": true/false
  },
  "sharedCss": "/* CSS for nav, layout grid, utility classes - use var(--primary) etc. */",
  "pages": [
    {
      "name": "exact page name",
      "viewport": "desktop" or "mobile",
      "spec": "full specification text for this page including components, interactions, business rules, data fields",
      "constraints": "key UI components that MUST exist on this page",
      "navigationOut": ["page names this page links to"]
    }
  ]
}

RULES:
1. Every page from the analysis MUST appear in pages array — missing pages = broken app
2. spec field must be 200+ words with: layout description, component list with details,
   interaction flows (click X → happens Y), data fields with sample values, edge states
3. navigationOut must list exact page names this page links to
4. sharedCss MUST be comprehensive (200+ lines):
   - Reset, typography, color variables usage
   - .container (max-width, padding), .card (shadow, radius, padding)
   - .btn-primary (bg primary, hover), .btn-secondary (outline)
   - .form-group, .form-label, .form-input, .form-select
   - nav/header/footer complete styles
   - .badge, .tag, .alert, .modal-overlay
   - Grid/flexbox utility classes
   - Responsive breakpoints (@media)
5. Sub-agents CANNOT see each other's output — your spec is their ONLY reference
6. If pages have mobile viewport, navType should be "bottom-tab"
7. Return ONLY JSON — no markdown, no explanation`;

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json' },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  try { trackUsage(apiKey, getGeminiModel(), 'master-agent-plan', response.usageMetadata); } catch {}

  const text = response.text();

  // Parse JSON (strip markdown fences if present)
  let json: string = text;
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) json = fenceMatch[1];

  const plan: GenerationPlan = JSON.parse(json.trim());

  // Inject cssVariables
  plan.cssVariables = cssVariables;

  // Validate: ensure all analysis pages are present
  if (analysisData?.pages) {
    const planPageNames = new Set(plan.pages.map(p => p.name));
    for (const analysisPage of analysisData.pages) {
      if (!planPageNames.has(analysisPage.name)) {
        // Add missing page
        plan.pages.push({
          name: analysisPage.name,
          viewport: analysisPage.viewport || 'desktop',
          spec: `Components: ${(analysisPage.components || []).join(', ')}\nInteractions: ${(analysisPage.interactions || []).join('; ')}\nBusiness Rules: ${(analysisPage.businessRules || []).join('; ')}`,
          constraints: (analysisPage.components || []).join(', '),
          navigationOut: analysisPage.navigationTo || [],
        });
      }
    }
  }

  return plan;
}

/**
 * Build a local plan WITHOUT calling the AI — used as fallback when master agent fails (429).
 * Creates reasonable specs from page names and user message context.
 */
export function buildLocalPlan(
  pageNames: string[],
  userMessage: string,
  designConvention: string,
): GenerationPlan {
  const cssVariables = `:root {
  --primary: #8E6FA7;
  --primary-hover: #8557A8;
  --accent-cta: #F97D03;
  --accent-cta-hover: #E06C00;
  --bg: #FAF4EB;
  --surface: #F8F7F5;
  --text: #333333;
  --text-secondary: #666666;
  --text-muted: #8C8C8C;
  --placeholder: #B0B0B0;
  --border: #D5D5D5;
  --divider: #EAEAEA;
  --nav-bg: #F1F1F1;
  --nav-text: #434343;
  --nav-active-bg: #434343;
  --nav-active-text: #FFFFFF;
  --header-bg: #8E6FA7;
  --header-text: #FFFFFF;
  --error: #EC3C1F;
  --success: #85BB0E;
  --tag-bg: #EBE3F2;
}`;

  const sharedCss = `/* CSS Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
a { color: var(--primary); text-decoration: none; }
img { max-width: 100%; display: block; }

/* Layout */
.container { max-width: 1200px; margin: 0 auto; padding: 0 16px; }
.grid { display: grid; gap: 20px; }
.grid-2 { grid-template-columns: repeat(2, 1fr); }
.grid-3 { grid-template-columns: repeat(3, 1fr); }
.grid-4 { grid-template-columns: repeat(4, 1fr); }
.flex { display: flex; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }

/* Navigation */
.site-header { background: var(--header-bg); color: var(--header-text); padding: 12px 0; }
.site-header .container { display: flex; justify-content: space-between; align-items: center; }
.site-header .logo { font-size: 20px; font-weight: 700; color: white; }
.site-nav { background: var(--nav-bg); border-bottom: 1px solid var(--divider); }
.site-nav ul { list-style: none; display: flex; gap: 0; }
.site-nav li a { display: block; padding: 14px 20px; color: var(--nav-text); font-weight: 700; font-size: 14px; transition: background 0.2s; cursor: pointer; }
.site-nav li a:hover, .site-nav li a.active { background: var(--nav-active-bg); color: var(--nav-active-text); }

/* Cards */
.card { background: var(--surface); border-radius: 4px; overflow: hidden; transition: transform 0.2s; }
.card:hover { transform: translateY(-2px); }
.card-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; background: var(--divider); }
.card-body { padding: 16px 20px; }
.card-title { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
.card-desc { font-size: 14px; color: var(--text-secondary); }
.card-price { font-size: 18px; font-weight: 700; color: var(--primary); margin-top: 8px; }

/* Buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 20px; border: none; border-radius: 4px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s, opacity 0.2s; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-hover); }
.btn-cta { background: linear-gradient(180deg, #EAAB57, #F97D03); color: white; }
.btn-cta:hover { opacity: 0.9; }
.btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--text); }
.btn-secondary:hover { background: var(--surface); }

/* Forms */
.form-group { margin-bottom: 16px; }
.form-label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; color: var(--text); }
.form-input, .form-select { width: 100%; height: 48px; padding: 8px 16px; border: 1px solid var(--border); border-radius: 4px; font-size: 16px; background: white; color: var(--text); transition: border-color 0.2s; }
.form-input:focus, .form-select:focus { outline: none; border-color: var(--primary); }
.form-input::placeholder { color: var(--placeholder); }

/* Badges & Tags */
.badge { display: inline-block; padding: 2px 8px; font-size: 12px; border-radius: 4px; }
.badge-primary { background: var(--tag-bg); color: var(--primary); }
.badge-error { background: #FEE; color: var(--error); }
.badge-success { background: #EFE; color: var(--success); }
.tag { display: inline-block; padding: 4px 12px; font-size: 13px; border-radius: 4px; background: var(--surface); color: var(--text-secondary); cursor: pointer; }
.tag.active, .tag:hover { background: var(--primary); color: white; }

/* Table */
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--divider); }
.table th { background: var(--surface); font-weight: 600; font-size: 13px; color: var(--text-secondary); }

/* Footer */
.site-footer { background: var(--nav-bg); padding: 32px 0; margin-top: 48px; color: var(--text-secondary); font-size: 13px; text-align: center; }

/* Responsive */
@media (max-width: 992px) { .grid-3, .grid-4 { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; } .site-nav ul { flex-wrap: wrap; } }

/* Section */
.section { padding: 32px 0; }
.section-title { font-size: 24px; font-weight: 700; margin-bottom: 20px; }

/* Search */
.search-bar { display: flex; gap: 8px; }
.search-bar input { flex: 1; }

/* Pagination */
.pagination { display: flex; justify-content: center; gap: 4px; margin-top: 24px; }
.pagination a, .pagination span { padding: 8px 14px; border-radius: 4px; font-size: 14px; }
.pagination .active { background: var(--primary); color: white; }
.pagination a:hover { background: var(--surface); }

/* Extra utilities */
.hero-section { padding: 48px 0; text-align: center; }
.stat-card { padding: 20px; background: var(--surface); border-radius: 4px; text-align: center; }
.stat-card .stat-value { font-size: 28px; font-weight: 700; color: var(--primary); }
.stat-card .stat-label { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.timeline { position: relative; padding-left: 32px; }
.timeline-item { position: relative; padding-bottom: 24px; border-left: 2px solid var(--divider); padding-left: 20px; }
.timeline-item::before { content: ''; position: absolute; left: -7px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); }
.step-indicator { display: flex; gap: 16px; margin-bottom: 24px; }
.step-indicator .step { flex: 1; text-align: center; padding: 12px; border-radius: 4px; background: var(--surface); font-size: 13px; }
.step-indicator .step.active { background: var(--primary); color: white; }
.accordion { border: 1px solid var(--divider); border-radius: 4px; }
.accordion-item { border-bottom: 1px solid var(--divider); }
.accordion-header { padding: 14px 16px; cursor: pointer; font-weight: 600; display: flex; justify-content: space-between; }
.accordion-body { padding: 12px 16px; font-size: 14px; }
.progress-bar { height: 8px; background: var(--divider); border-radius: 4px; overflow: hidden; }
.progress-bar .fill { height: 100%; background: var(--primary); border-radius: 4px; }
.rating { color: #F7991C; }
.layout-sidebar { display: grid; grid-template-columns: 240px 1fr; gap: 24px; }
@media (max-width: 768px) { .layout-sidebar { grid-template-columns: 1fr; } }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; }
.calendar-grid .day { padding: 8px; border-radius: 4px; cursor: pointer; }
.calendar-grid .day:hover, .calendar-grid .day.selected { background: var(--primary); color: white; }
.toggle { width: 44px; height: 24px; border-radius: 12px; background: var(--divider); position: relative; cursor: pointer; }
.toggle.on { background: var(--primary); }
.toggle::after { content: ''; width: 20px; height: 20px; border-radius: 50%; background: white; position: absolute; top: 2px; left: 2px; transition: transform 0.2s; }
.toggle.on::after { transform: translateX(20px); }`;

  // Detect website type from user message for template selection
  const msg = userMessage.toLowerCase();
  type SiteType = 'shopping' | 'travel' | 'education' | 'medical' | 'saas' | 'news' | 'generic';
  let siteType: SiteType = 'generic';
  if (/購物|商城|電商|shop|store|ecommerce/i.test(msg)) siteType = 'shopping';
  else if (/旅遊|旅行|travel|tour|訂房|住宿|hotel/i.test(msg)) siteType = 'travel';
  else if (/教育|課程|course|learn|學習/i.test(msg)) siteType = 'education';
  else if (/醫療|診所|clinic|hospital|預約|掛號/i.test(msg)) siteType = 'medical';
  else if (/後台|admin|dashboard|管理|CMS/i.test(msg)) siteType = 'saas';
  else if (/新聞|news|部落格|blog|文章/i.test(msg)) siteType = 'news';

  const pages: PageAssignment[] = pageNames.map((name, i) => {
    const otherPages = pageNames.filter(p => p !== name);
    let spec = `頁面「${name}」使用 HousePrice 設計規範。

佈局：使用 .container 包裹，max-width: 1200px。頂部有 .site-header（紫色 #8E6FA7）和 .site-nav（灰色 #F1F1F1 導覽列）。

導覽列項目：${pageNames.join('、')}，點擊切換頁面。當前頁面的 nav item 加上 .active class。

頁面背景：#FAF4EB（暖米色），卡片背景 #F8F7F5，絕不使用純白。

`;
    // Add page-specific content based on site type + page name
    const templateSpecs: Record<string, Record<string, string>> = {
      shopping: {
        '首頁': '- Hero：搜尋框 + 一行標語（絕不用大面積純色背景）\n- 分類 .tag 按鈕（全部、電子產品、服飾、家居、美妝）\n- 熱門商品 .grid-4，每個 .card 含 .card-img、名稱、NT$ 價格、加入購物車按鈕\n- 點「查看」跳轉商品詳情：onclick="showPage(\'商品詳情\')"',
        '商品列表': '- .layout-sidebar（左 240px 篩選 + 右 .grid-3 商品）\n- 篩選：分類 checkbox、價格範圍、品牌\n- 排序下拉（最新/價格/熱門）\n- 分頁 .pagination\n- 每卡：圖+名+價+星+加入購物車按鈕',
        '商品詳情': '- 左：大圖+縮圖列表\n- 右：名稱(24px)、價格(.card-price)、描述、規格 .table\n- 數量選擇器(-/+)、加入購物車 .btn-primary、立即購買 .btn-cta onclick="showPage(\'購物車\')"\n- Tabs：描述/規格/評價\n- 推薦商品 .grid-4',
        '購物車': '- .table：商品圖+名+單價+數量+小計+刪除\n- 右側摘要：小計+運費+折扣碼+總金額\n- 繼續購物 .btn-secondary onclick="showPage(\'商品列表\')"\n- 前往結帳 .btn-cta onclick="showPage(\'結帳\')"\n- 空狀態：icon+"購物車是空的"',
        '結帳': '- .step-indicator（1.配送 2.付款 3.確認）\n- 配送 .form-group：姓名/電話/地址(縣市/區/路)/備註\n- 付款 radio：信用卡/ATM/超商取貨\n- 右側摘要\n- 確認下單 .btn-cta',
      },
      travel: {
        '首頁': '- Hero：搜尋列（目的地+日期+人數+搜尋 .btn-cta）\n- 熱門目的地 .grid-3：.card 有目的地照片+名稱+「X天Y夜」badge+價格\n- 季節推薦 .grid-4\n- 點卡片 onclick="showPage(\'行程詳情\')"',
        '行程列表': '- .layout-sidebar（篩選：目的地/天數/價格範圍/主題 tag）\n- .grid-3 行程卡：目的地圖+標題+天數+價格+.rating 星+出發日期 badge\n- 排序+分頁\n- 點卡 onclick="showPage(\'行程詳情\')"',
        '行程詳情': '- Hero 大圖+行程名稱+價格+報名 .btn-cta onclick="showPage(\'訂購確認\')"\n- .timeline 行程表（Day 1/2/3 各有景點+餐食+住宿）\n- 包含項目列表（交通/住宿/餐食/門票）\n- 注意事項 .accordion\n- 相關行程 .grid-3',
        '訂購確認': '- .step-indicator（1.選擇 2.旅客資料 3.付款）\n- 旅客 .form-group：姓名/護照號/生日/電話/Email/特殊需求\n- 付款方式 radio\n- 右側行程摘要+總金額\n- 確認 .btn-cta',
        '我的訂單': '- .table 訂單列表：訂單號/行程名/出發日/金額/狀態 .badge（已確認/進行中/已完成）\n- 點訂單展開詳情\n- 空狀態："尚無訂單，去探索世界吧！" + 按鈕 onclick="showPage(\'首頁\')"',
      },
      education: {
        '首頁': '- Hero：搜尋+標語「開啟學習之旅」\n- 分類 .tag（程式/設計/語言/商業/資料科學）\n- 精選課程 .grid-4：.card 有課程圖+標題+講師+價格+.rating\n- 點卡 onclick="showPage(\'課程詳情\')"',
        '課程列表': '- .layout-sidebar（分類/價格/程度/語言 篩選）\n- .grid-3 課程卡：縮圖+標題+講師名+NT$價格+.rating 星+學生數 badge\n- 排序+分頁\n- 點卡 onclick="showPage(\'課程詳情\')"',
        '課程詳情': '- 課程影片預覽區（灰色佔位）+標題+講師\n- 側邊購買卡：價格+加入購物車+立即開始\n- .accordion 課程大綱（第1章/第2章...每章有多個課堂）\n- 講師介紹\n- 學生評價列表',
        '我的學習': '- 學習中課程 .grid-2：.card 有課程圖+標題+.progress-bar 進度+繼續學習 .btn-primary\n- 已完成課程+證書下載\n- 空狀態 onclick="showPage(\'課程列表\')"',
        '個人設定': '- .form-group：頭像上傳+姓名+Email+密碼\n- 通知偏好 .toggle\n- 付款方式管理\n- 學習目標設定',
      },
      medical: {
        '首頁': '- 科別 .grid-3：.card icon+科別名（內科/外科/牙科/眼科/兒科/皮膚科）\n- 快速預約 .btn-cta onclick="showPage(\'預約掛號\')"\n- 醫師推薦 .grid-4：照片+姓名+專長\n- 最新公告列表',
        '醫師列表': '- .layout-sidebar（科別篩選+星期選擇）\n- .grid-3 醫師卡：照片+姓名+科別 .badge+專長+可約時段\n- 點「預約」onclick="showPage(\'預約掛號\')"',
        '預約掛號': '- .step-indicator（1.選科別 2.選醫師 3.選時段 4.確認）\n- 科別 .tag 選擇\n- 醫師卡片+看診時間 .calendar-grid\n- 時段選擇（上午/下午/晚上各 3-4 個時段 .tag）\n- 確認 .form-group（姓名/身分證/電話/症狀描述）',
        '看診紀錄': '- .table：日期/醫師/科別/診斷/狀態 .badge（已完成/已取消）\n- 展開看詳情+下載報告 .btn-secondary\n- 空狀態 onclick="showPage(\'預約掛號\')"',
      },
      saas: {
        '儀表板': '- .grid-4 .stat-card（營收/用戶/訂單/轉換率 .stat-value + .stat-label）\n- 折線圖區域（用 div 佔位 300px 高 + 標題）\n- 最近活動 .table（5 筆：時間+操作+用戶+狀態）',
        '列表管理': '- 頂部：搜尋框+篩選下拉+新增 .btn-primary\n- .table：checkbox+ID+名稱+狀態 .badge+建立日期+操作（編輯/刪除）\n- 批次操作列\n- .pagination\n- 點「編輯」onclick="showPage(\'詳情編輯\')"',
        '詳情編輯': '- 頂部 breadcrumb（列表 > 編輯 #123）\n- Tabs（基本資料/進階設定/操作記錄）\n- .form-group 欄位：名稱/描述/分類/狀態/標籤\n- 儲存 .btn-primary + 取消 .btn-secondary\n- 操作記錄 .timeline',
        '設定': '- 一般設定：網站名稱/Logo/語言 .form-group\n- 通知設定：Email/.toggle 開關\n- 安全設定：密碼變更/兩步驟驗證 .toggle\n- API 設定：API Key 顯示+重新生成',
      },
      news: {
        '首頁': '- 頭條新聞 Hero .card（大圖+標題+摘要+時間）\n- 分類 .tag（政治/財經/科技/娛樂/生活/國際）\n- 最新文章 .grid-3：.card 圖+標題+摘要+日期+作者\n- 點卡 onclick="showPage(\'文章內容\')"',
        '文章列表': '- 分類 .tag 切換\n- 文章列表（圖左+文右）：標題+摘要(2行)+日期+作者+分類 .badge\n- 側邊欄：熱門文章排行+標籤雲\n- .pagination\n- 點文章 onclick="showPage(\'文章內容\')"',
        '文章內容': '- 文章標題(24px)+作者+日期+分類 .badge\n- 正文內容（3-4 段落+引用區塊+圖片）\n- 標籤 .tag 列表\n- 分享按鈕列\n- 相關文章 .grid-3',
        '關於我們': '- 媒體介紹段落\n- 團隊成員 .grid-4：照片+姓名+職稱\n- 聯絡 .form-group：姓名/Email/主題/訊息/送出 .btn-primary',
      },
    };

    // Get spec from type-specific templates, fallback to generic
    const typeTemplates = templateSpecs[siteType] || {};
    const matchedSpec = typeTemplates[name];
    if (matchedSpec) {
      spec += matchedSpec;
    } else {
      // Try generic patterns
      spec += getGenericPageSpec(name, otherPages);
    }

    return {
      name,
      viewport: 'desktop' as const,
      spec,
      constraints: `必須包含 .site-header + .site-nav 導覽列，頁面背景 #FAF4EB`,
      navigationOut: otherPages,
    };
  });

  return {
    shell: {
      hasNav: true,
      navType: 'top-bar',
      navItems: pageNames,
      hasFooter: true,
    },
    sharedCss,
    cssVariables,
    pages,
  };
}

function getGenericPageSpec(name: string, otherPages: string[]): string {
  if (/首頁|home|index/i.test(name)) {
    return '- Hero：搜尋框+標語（小型 banner，絕不用大面積純色）\n- 精選內容 .grid-4：.card 有圖+標題+描述\n- 分類導覽 .tag 按鈕\n- 頁尾 .site-footer';
  }
  if (/列表|list|catalog|搜尋|search/i.test(name)) {
    return '- .layout-sidebar（左篩選+右 .grid-3 卡片）\n- 排序下拉+分頁 .pagination\n- 每卡：圖+標題+描述+操作按鈕';
  }
  if (/詳情|detail|內容|content/i.test(name)) {
    return '- 頂部大圖/Banner\n- 主要資訊區（標題+描述+屬性 .table）\n- 操作按鈕 .btn-primary + .btn-cta\n- 相關推薦 .grid-3';
  }
  if (/設定|settings|profile|個人/i.test(name)) {
    return '- .form-group 欄位：名稱/Email/密碼\n- .toggle 開關設定\n- 儲存 .btn-primary + 取消 .btn-secondary';
  }
  if (/儀表|dashboard|總覽|overview/i.test(name)) {
    return '- .grid-4 .stat-card（4 個數據指標）\n- 圖表區（div 佔位 300px）\n- 最近活動 .table';
  }
  return `- 標題區 + .container 內容\n- .grid 佈局展示主要資訊\n- .card 組件 + .btn-primary 操作按鈕\n- 導航：${otherPages.map(p => `onclick="showPage('${p}')"`).join(', ')}`;
}
