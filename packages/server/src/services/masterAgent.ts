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
.pagination a:hover { background: var(--surface); }`;

  const pages: PageAssignment[] = pageNames.map((name, i) => {
    const otherPages = pageNames.filter(p => p !== name);
    let spec = `頁面「${name}」使用 HousePrice 設計規範。

佈局：使用 .container 包裹，max-width: 1200px。頂部有 .site-header（紫色 #8E6FA7）和 .site-nav（灰色 #F1F1F1 導覽列）。

導覽列項目：${pageNames.join('、')}，點擊切換頁面。當前頁面的 nav item 加上 .active class。

頁面背景：#FAF4EB（暖米色），卡片背景 #F8F7F5，絕不使用純白。

`;
    // Add page-specific content based on common patterns
    if (/首頁|home|index/i.test(name)) {
      spec += `首頁包含：
- Hero 區塊：小型文字 banner（絕不用大面積純色/漸層），搜尋框
- 商品分類：使用 .tag 按鈕（全部、電子產品、服飾、家居...），可切換
- 熱門商品 grid：.grid-4，每個 .card 含商品圖（.card-img）、名稱、價格（NT$ 格式）、分類 badge
- 促銷區塊：2-3 個橫幅 .card，文字+小 CTA 按鈕
- 頁尾 .site-footer`;
    } else if (/商品列表|products?.*list|catalog/i.test(name)) {
      spec += `商品列表頁：
- 左側篩選欄（寬 240px）：分類 checkbox、價格範圍 slider、品牌篩選
- 右側商品 grid：.grid-3
- 排序下拉選單（最新、價格低到高、熱門）
- 分頁 .pagination
- 每張商品卡：圖片、名稱、價格 NT$、評分星星、加入購物車 .btn-primary`;
    } else if (/商品詳情|product.*detail|item/i.test(name)) {
      spec += `商品詳情頁：
- 左：大圖展示（主圖 + 縮圖列表）
- 右：商品名稱（24px bold）、價格（.card-price）、描述、規格表 .table
- 數量選擇器（-/+按鈕）、加入購物車 .btn-primary、立即購買 .btn-cta
- 分頁 tabs：商品描述、規格、評價
- 相關商品推薦 .grid-4`;
    } else if (/購物車|cart/i.test(name)) {
      spec += `購物車頁：
- 商品清單 .table：圖片、名稱、單價、數量（可調整）、小計、刪除按鈕
- 右側訂單摘要卡片：商品總計、運費、折扣碼輸入、總金額
- 底部：繼續購物 .btn-secondary、前往結帳 .btn-cta
- 空購物車狀態：icon + "購物車是空的" + 去逛逛按鈕`;
    } else if (/結帳|checkout/i.test(name)) {
      spec += `結帳頁：
- 步驟指示器（1.配送資訊 2.付款方式 3.訂單確認）
- 配送表單：姓名、電話、地址（縣市/區/路）、備註 — 全部用 .form-group
- 付款方式：信用卡/ATM/超商取貨 radio
- 訂單摘要（右側）：商品列表簡要、金額
- 確認下單 .btn-cta`;
    } else {
      spec += `此頁面包含標題區、主要內容區（使用 .grid 佈局）、互動元件。
使用 .card 組件展示資訊，.btn-primary 和 .btn-secondary 按鈕。
包含表單元素 .form-group 或資料表格 .table。`;
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
