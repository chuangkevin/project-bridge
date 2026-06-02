export interface PagePlan {
  pages: { name: string; description: string }[];
  siteType: string;
}

// Local fallback — no AI needed
const SITE_TEMPLATES: Record<string, PagePlan> = {
  portfolio: { siteType: 'portfolio', pages: [
    { name: 'home', description: '個人首頁，簡介和技能' },
    { name: 'projects', description: '作品集頁面' },
    { name: 'contact', description: '聯絡頁面' },
  ]},
  restaurant: { siteType: 'restaurant', pages: [
    { name: 'home', description: '餐廳首頁，特色菜' },
    { name: 'menu', description: '菜單頁面' },
    { name: 'about', description: '關於我們' },
    { name: 'contact', description: '預訂和聯絡' },
  ]},
  shopping: { siteType: 'shopping', pages: [
    { name: 'home', description: '電商首頁' },
    { name: 'products', description: '商品列表' },
    { name: 'cart', description: '購物車' },
    { name: 'checkout', description: '結帳' },
  ]},
  saas: { siteType: 'saas', pages: [
    { name: 'home', description: 'Landing page' },
    { name: 'features', description: '功能介紹' },
    { name: 'pricing', description: '方案和定價' },
  ]},
};

export function detectSiteType(userMessage: string): string {
  const msg = userMessage.toLowerCase();
  if (msg.includes('餐廳') || msg.includes('餐飲') || msg.includes('restaurant')) return 'restaurant';
  if (msg.includes('購物') || msg.includes('電商') || msg.includes('shop') || msg.includes('store')) return 'shopping';
  if (msg.includes('saas') || msg.includes('軟體') || msg.includes('服務')) return 'saas';
  if (msg.includes('攝影') || msg.includes('作品') || msg.includes('portfolio')) return 'portfolio';
  return 'portfolio';
}

export function getLocalPlan(siteType: string): PagePlan {
  return SITE_TEMPLATES[siteType] ?? SITE_TEMPLATES.portfolio;
}

export async function planPages(userMessage: string, provider: {
  generateContent: (params: { model: string; prompt: string; systemInstruction: string }) => Promise<{ text: string }>;
}): Promise<PagePlan> {
  try {
    const prompt = `Based on: "${userMessage}"
List the pages needed for this website. Output JSON only:
{"siteType":"...", "pages":[{"name":"kebab-case","description":"brief desc"}]}
Max 5 pages.`;
    const res = await provider.generateContent({
      model: 'gemini-2.5-flash',
      prompt,
      systemInstruction: 'Output only valid JSON, no markdown.',
    });
    const json = JSON.parse(res.text.replace(/```json?|```/g, '').trim()) as Partial<PagePlan>;
    if (Array.isArray(json.pages) && json.pages.length > 0) return json as PagePlan;
    return getLocalPlan(detectSiteType(userMessage));
  } catch {
    return getLocalPlan(detectSiteType(userMessage));
  }
}
