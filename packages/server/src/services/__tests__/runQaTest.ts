/**
 * Standalone QA test runner — run with: npx ts-node src/services/__tests__/runQaTest.ts
 */
import { validatePrototypeHtml, formatQaReport } from '../htmlQaValidator';
import { assemblePrototype, fixNavigation } from '../htmlAssembler';
import { buildLocalPlan } from '../masterAgent';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    failed++;
  }
}

// ── Test 1: Failed pages get fallback divs ────────────────
console.log('\n🧪 Test 1: Failed pages get fallback divs');
{
  const plan = buildLocalPlan(['首頁', '詳情', '聯絡'], '豪華汽車展示網站', '');
  const fragments = [
    { name: '首頁', html: '<div class="page" id="page-首頁" data-page="首頁" style="display:none"><div class="container"><h1>歡迎來到豪華汽車展示中心</h1><p>我們提供各種頂級豪華汽車的展示與試駕服務，從勞斯萊斯到法拉利，從藍寶堅尼到保時捷，每一款車都代表著工藝的極致。歡迎您預約賞車，體驗頂級駕馭感受。</p></div></div>', success: true },
    { name: '詳情', html: '', success: false },
    { name: '聯絡', html: '', success: false },
  ];

  const html = assemblePrototype(plan, fragments);

  assert(html.includes('id="page-首頁"'), 'Has 首頁 page div');
  assert(html.includes('id="page-詳情"'), 'Has 詳情 fallback div');
  assert(html.includes('id="page-聯絡"'), 'Has 聯絡 fallback div');
  assert(html.includes('此頁面生成失敗'), 'Fallback has visible message');

  const report = validatePrototypeHtml(html);
  assert(report.issues.filter(i => i.rule === 'missing-page-div').length === 0, 'No missing-page-div issues');
}

// ── Test 2: Nav/header/footer stripped from fragments ─────
console.log('\n🧪 Test 2: Nav/header/footer stripped from fragments');
{
  const plan = buildLocalPlan(['首頁'], '測試', '');
  const fragments = [
    {
      name: '首頁',
      html: `<div class="page" id="page-首頁" data-page="首頁" style="display:none">
        <header class="site-header"><div class="logo">Logo</div></header>
        <nav><ul><li>首頁</li></ul></nav>
        <div class="container"><h1>真正的內容在這裡很多很多文字描述</h1><p>更多正文內容讓頁面不空白，這裡有足夠多的文字來確保不會被誤判為空頁面，包含商品列表和詳細的描述資訊</p></div>
        <footer>Footer content</footer>
      </div>`,
      success: true,
    },
  ];

  const html = assemblePrototype(plan, fragments);

  assert(!html.includes('class="site-header"'), 'site-header stripped');
  assert(html.includes('class="top-nav"'), 'Assembler top-nav present');
  assert(html.includes('真正的內容'), 'Real content survived');
}

// ── Test 3: Excess </div> doesn't break other pages ──────
console.log('\n🧪 Test 3: Excess </div> fixed — both pages visible');
{
  const plan = buildLocalPlan(['頁面A', '頁面B'], '測試', '');
  const fragments = [
    {
      name: '頁面A',
      html: `<div class="page" id="page-頁面A" data-page="頁面A" style="display:none">
        <div class="container"><h1>頁面A內容展示</h1><p>更多A的描述文字讓這個頁面不空白足夠長，包含各種商品資訊和詳細介紹，讓使用者可以瀏覽豐富的內容</p></div>
      </div></div></div>`,
      success: true,
    },
    {
      name: '頁面B',
      html: `<div class="page" id="page-頁面B" data-page="頁面B" style="display:none">
        <div class="container"><h1>頁面B內容展示</h1><p>更多B的描述文字在這裡，包含了各種產品和服務的詳細介紹，讓使用者可以看到豐富的頁面</p></div>
      </div>`,
      success: true,
    },
  ];

  const html = assemblePrototype(plan, fragments);
  assert(html.includes('id="page-頁面A"'), 'Page A exists');
  assert(html.includes('id="page-頁面B"'), 'Page B exists');
  assert(html.includes('頁面B內容'), 'Page B content survived');

  const report = validatePrototypeHtml(html);
  assert(report.issues.filter(i => i.rule === 'missing-page-div').length === 0, 'No missing pages');
}

// ── Test 4: Design tokens from convention ─────────────────
console.log('\n🧪 Test 4: Design tokens extracted from convention');
{
  const convention = `PROJECT DESIGN (override global):
Design Direction: Apple Style
Primary Color: #000000
Secondary Color: #86868b
Background Color: #ffffff
Border Radius: 12px`;

  const plan = buildLocalPlan(['首頁'], '蘋果風格', convention);

  assert(plan.cssVariables.includes('--primary: #000000'), 'Primary from convention');
  assert(!plan.cssVariables.includes('#8E6FA7'), 'No HousePrice purple');
  assert(!plan.cssVariables.includes('#FAF4EB'), 'No HousePrice beige');
  assert(!plan.sharedCss.includes('.site-header {'), 'No .site-header in sharedCss');
  assert(!plan.sharedCss.includes('.site-nav {'), 'No .site-nav in sharedCss');
}

// ── Test 5: QA validator catches empty page ───────────────
console.log('\n🧪 Test 5: QA validator catches empty page');
{
  const html = `<!DOCTYPE html><html><head><style>:root{--primary:#3b82f6}</style></head><body>
    <nav><a data-nav="首頁">首頁</a><a data-nav="空頁">空頁</a></nav>
    <main>
      <div class="page" id="page-首頁" data-page="首頁" style="display:block">
        <div class="container"><h1>歡迎</h1><p>這是首頁內容，有充足的文字</p></div>
      </div>
      <div class="page" id="page-空頁" data-page="空頁" style="display:none">
        <div class="container"></div>
      </div>
    </main>
    <script>function showPage(n){}</script>
  </body></html>`;

  const report = validatePrototypeHtml(html);
  assert(report.issues.some(i => i.rule === 'empty-page' && i.page === '空頁'), 'Detects empty page');
  assert(!report.passed, 'Report fails when empty page exists');
}

// ── Test 6: QA validator passes for good prototype ────────
console.log('\n🧪 Test 6: QA validator passes for well-formed prototype');
{
  const html = `<!DOCTYPE html><html><head><style>:root{--primary:#3b82f6}</style></head><body>
    <nav><a data-nav="首頁">首頁</a><a data-nav="列表">列表</a></nav>
    <main>
      <div class="page" id="page-首頁" data-page="首頁" style="display:block">
        <div class="container"><h1>歡迎來到我們的網站</h1><p>這裡有豐富的內容和資訊可以瀏覽更多內容</p>
        <div class="card" onclick="showPage('列表')"><h3>商品卡片</h3><p>點擊查看更多商品</p></div></div>
      </div>
      <div class="page" id="page-列表" data-page="列表" style="display:none">
        <div class="container"><h1>商品列表</h1><p>這裡有很多商品可以選擇，每個都有詳細的描述和價格資訊讓人滿意</p></div>
      </div>
    </main>
    <script>function showPage(n){}</script>
  </body></html>`;

  const report = validatePrototypeHtml(html);
  if (!report.passed) {
    console.log('    DEBUG: issues =', JSON.stringify(report.issues, null, 2));
    console.log('    DEBUG: pageStats =', JSON.stringify(report.pageStats, null, 2));
  }
  assert(report.passed, 'Report passes');
  assert(report.issues.filter(i => i.severity === 'critical').length === 0, 'No critical issues');
}

// ── Test 7: Full pipeline — buildLocalPlan + assemble + QA ─
console.log('\n🧪 Test 7: Full pipeline — 5 page luxury car site');
{
  const convention = `PROJECT DESIGN (override global):
Design Direction: APPLE 風格豪華車展示
Primary Color: #1d1d1f
Secondary Color: #86868b
Background Color: #fbfbfd
Border Radius: 12px`;

  const pageNames = ['豪車鑑賞', '車款總覽', '車款詳細頁', '聯絡預約', '預約成功'];
  const plan = buildLocalPlan(pageNames, '我要做一個apple風格的豪華汽車展示網站', convention);

  // Simulate sub-agent results — some succeed, some fail
  const fragments = pageNames.map((name, i) => {
    if (i < 3) {
      // Success
      return {
        name,
        html: `<div class="page" id="page-${name}" data-page="${name}" style="display:none">
          <div class="container">
            <h1>${name}</h1>
            <p>這是「${name}」頁面的豐富內容。有很多真實的描述和資訊讓使用者可以瀏覽。</p>
            <div class="grid grid-3">
              <div class="card" onclick="showPage('${pageNames[(i+1) % pageNames.length]}');return false;">
                <div class="card-img" style="background:var(--divider);height:180px;"></div>
                <div class="card-body">
                  <h3 class="card-title">Rolls-Royce Phantom</h3>
                  <p class="card-desc">極致奢華的象徵</p>
                  <p class="card-price">NT$ 25,800,000</p>
                  <a class="btn btn-primary" onclick="showPage('車款詳細頁');return false;">查看詳情</a>
                </div>
              </div>
              <div class="card">
                <div class="card-body">
                  <h3>Ferrari 296 GTB</h3>
                  <p>躍馬品牌的新世代</p>
                  <p class="card-price">NT$ 18,800,000</p>
                </div>
              </div>
              <div class="card">
                <div class="card-body">
                  <h3>Lamborghini Aventador</h3>
                  <p>蠻牛家族的旗艦車型</p>
                  <p class="card-price">NT$ 22,500,000</p>
                </div>
              </div>
            </div>
          </div>
        </div>`,
        success: true,
      };
    } else {
      // Simulate failure
      return { name, html: '', success: false };
    }
  });

  const html = assemblePrototype(plan, fragments);
  const fixed = fixNavigation(html);

  const report = validatePrototypeHtml(fixed.html);
  console.log(formatQaReport(report));

  // All 5 pages must have divs (3 success + 2 fallback)
  for (const name of pageNames) {
    assert(fixed.html.includes(`id="page-${name}"`), `Page "${name}" has div`);
  }

  // No missing page divs
  assert(report.issues.filter(i => i.rule === 'missing-page-div').length === 0, 'No missing page divs');

  // No HousePrice colors
  assert(!plan.cssVariables.includes('#8E6FA7'), 'No HousePrice purple in CSS vars');

  // CSS should have extracted Apple colors
  assert(plan.cssVariables.includes('--primary: #1d1d1f'), 'Correct primary color');

  // showPage function exists
  assert(fixed.html.includes('function showPage'), 'showPage function present');

  // First page visible
  assert(fixed.html.includes('style="display:block"'), 'First page visible');
}

// ── Summary ──────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED');
}
