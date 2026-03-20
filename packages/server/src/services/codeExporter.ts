/**
 * Code Exporter Service
 *
 * Converts HTML prototypes into framework-specific project code
 * using Gemini AI for per-page conversion.
 */

import { getGeminiApiKey, getGeminiApiKeyExcluding, getGeminiModel, trackUsage } from './geminiKeys';

export type Framework = 'react' | 'vue3' | 'nextjs' | 'nuxt3' | 'html';

export interface ExportedFile {
  path: string;
  content: string;
}

export interface ExportResult {
  files: ExportedFile[];
}

// ─── Page Splitting ─────────────────────────────────

interface PageInfo {
  name: string;
  html: string;
}

export function extractPages(html: string): PageInfo[] {
  const pages: PageInfo[] = [];
  const pageRegex = /<div[^>]*data-page="([^"]+)"[^>]*>([\s\S]*?)(?=<div[^>]*data-page="|<\/body>|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = pageRegex.exec(html)) !== null) {
    pages.push({ name: match[1], html: match[0] });
  }

  // If no data-page found, treat the whole body as a single page
  if (pages.length === 0) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    pages.push({ name: 'index', html: bodyMatch ? bodyMatch[1] : html });
  }

  return pages;
}

// ─── Design Token Extraction ────────────────────────

export function extractDesignTokens(html: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const styleContents: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html)) !== null) {
    styleContents.push(m[1]);
  }

  const combined = styleContents.join('\n');
  const tokenRe = /(--[\w-]+)\s*:\s*([^;}{]+)/g;
  while ((m = tokenRe.exec(combined)) !== null) {
    tokens[m[1].trim()] = m[2].trim();
  }
  return tokens;
}

// ─── Navigation Map ─────────────────────────────────

function extractNavigationMap(html: string): Record<string, string[]> {
  const navMap: Record<string, string[]> = {};
  const pages = extractPages(html);

  for (const page of pages) {
    const targets: string[] = [];
    const showPageRe = /showPage\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = showPageRe.exec(page.html)) !== null) {
      if (!targets.includes(m[1])) targets.push(m[1]);
    }
    navMap[page.name] = targets;
  }
  return navMap;
}

// ─── Extract CSS from HTML ──────────────────────────

function extractCss(html: string): string {
  const styles: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(html)) !== null) {
    styles.push(m[1].trim());
  }
  return styles.join('\n\n');
}

// ─── Framework Templates ────────────────────────────

function getReactTemplate(pages: PageInfo[], tokens: Record<string, string>): ExportedFile[] {
  const pageNames = pages.map(p => p.name);
  const files: ExportedFile[] = [];

  files.push({
    path: 'package.json',
    content: JSON.stringify({
      name: 'prototype-react',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        'react-router-dom': '^6.20.0',
      },
      devDependencies: {
        '@vitejs/plugin-react': '^4.2.0',
        vite: '^5.0.0',
      },
    }, null, 2),
  });

  files.push({
    path: 'vite.config.js',
    content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
  });

  files.push({
    path: 'index.html',
    content: `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prototype</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
`,
  });

  files.push({
    path: 'src/main.jsx',
    content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/tokens.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
`,
  });

  const imports = pageNames.map(name => {
    const componentName = toComponentName(name);
    return `import ${componentName} from './pages/${componentName}';`;
  }).join('\n');

  const routes = pageNames.map(name => {
    const componentName = toComponentName(name);
    const routePath = name === pageNames[0] ? '/' : `/${name}`;
    return `      <Route path="${routePath}" element={<${componentName} />} />`;
  }).join('\n');

  files.push({
    path: 'src/App.jsx',
    content: `import { Routes, Route } from 'react-router-dom';
${imports}

export default function App() {
  return (
    <Routes>
${routes}
    </Routes>
  );
}
`,
  });

  // CSS tokens file
  files.push({
    path: 'src/styles/tokens.css',
    content: generateTokensCss(tokens),
  });

  return files;
}

function getVue3Template(pages: PageInfo[], tokens: Record<string, string>): ExportedFile[] {
  const pageNames = pages.map(p => p.name);
  const files: ExportedFile[] = [];

  files.push({
    path: 'package.json',
    content: JSON.stringify({
      name: 'prototype-vue3',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        vue: '^3.4.0',
        'vue-router': '^4.2.0',
      },
      devDependencies: {
        '@vitejs/plugin-vue': '^5.0.0',
        vite: '^5.0.0',
      },
    }, null, 2),
  });

  files.push({
    path: 'vite.config.js',
    content: `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
});
`,
  });

  files.push({
    path: 'index.html',
    content: `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prototype</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
`,
  });

  const routeEntries = pageNames.map(name => {
    const componentName = toComponentName(name);
    const routePath = name === pageNames[0] ? '/' : `/${name}`;
    return `  { path: '${routePath}', component: () => import('./pages/${componentName}.vue') }`;
  }).join(',\n');

  files.push({
    path: 'src/router/index.js',
    content: `import { createRouter, createWebHistory } from 'vue-router';

const routes = [
${routeEntries}
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
`,
  });

  files.push({
    path: 'src/main.js',
    content: `import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles/tokens.css';

createApp(App).use(router).mount('#app');
`,
  });

  files.push({
    path: 'src/App.vue',
    content: `<template>
  <router-view />
</template>

<script setup>
</script>
`,
  });

  files.push({
    path: 'src/styles/tokens.css',
    content: generateTokensCss(tokens),
  });

  return files;
}

function getNextjsTemplate(pages: PageInfo[], tokens: Record<string, string>): ExportedFile[] {
  const files: ExportedFile[] = [];

  files.push({
    path: 'package.json',
    content: JSON.stringify({
      name: 'prototype-nextjs',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
      },
      dependencies: {
        next: '^14.0.0',
        react: '^18.2.0',
        'react-dom': '^18.2.0',
      },
    }, null, 2),
  });

  files.push({
    path: 'next.config.js',
    content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
`,
  });

  files.push({
    path: 'pages/_app.jsx',
    content: `import '../styles/tokens.css';

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
`,
  });

  files.push({
    path: 'styles/tokens.css',
    content: generateTokensCss(tokens),
  });

  return files;
}

function getNuxt3Template(pages: PageInfo[], tokens: Record<string, string>): ExportedFile[] {
  const files: ExportedFile[] = [];

  files.push({
    path: 'package.json',
    content: JSON.stringify({
      name: 'prototype-nuxt3',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'nuxt dev',
        build: 'nuxt build',
        generate: 'nuxt generate',
        preview: 'nuxt preview',
      },
      dependencies: {
        nuxt: '^3.9.0',
      },
    }, null, 2),
  });

  files.push({
    path: 'nuxt.config.ts',
    content: `export default defineNuxtConfig({
  devtools: { enabled: true },
  css: ['~/assets/css/tokens.css'],
});
`,
  });

  files.push({
    path: 'app.vue',
    content: `<template>
  <NuxtPage />
</template>
`,
  });

  files.push({
    path: 'assets/css/tokens.css',
    content: generateTokensCss(tokens),
  });

  return files;
}

function getHtmlTemplate(tokens: Record<string, string>): ExportedFile[] {
  return [
    {
      path: 'styles.css',
      content: generateTokensCss(tokens),
    },
  ];
}

// ─── AI Conversion ──────────────────────────────────

async function convertPageWithGemini(
  pageHtml: string,
  pageName: string,
  framework: Framework,
  tokens: Record<string, string>,
  navMap: Record<string, string[]>,
  allPageNames: string[],
  apiBindings: any[],
  projectId?: string,
): Promise<ExportedFile[]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('Gemini API key not configured');

  const tokensCssSnippet = Object.entries(tokens).map(([k, v]) => `${k}: ${v}`).join('; ');
  const navTargets = navMap[pageName] || [];
  const componentName = toComponentName(pageName);

  const frameworkInstructions: Record<Framework, string> = {
    react: `Convert to a React functional component (JSX).
- Export default function ${componentName}().
- Use react-router-dom useNavigate() for navigation: navigate('/${navTargets[0] || ''}').
- Replace showPage('x') calls with navigate('/x').
- Use CSS Modules: import styles from './${componentName}.module.css' and apply as className={styles.xxx}.
- Return the component JSX and a separate CSS module file.
- Output format: first the JSX file content, then after a line "---CSS_MODULE---" the CSS module content.`,

    vue3: `Convert to a Vue 3 Single File Component (.vue).
- Use <script setup> with Composition API.
- Use useRouter() from vue-router for navigation: router.push('/${navTargets[0] || ''}').
- Replace showPage('x') calls with router.push('/x').
- Use <style scoped> for styles.
- Output the complete .vue file.`,

    nextjs: `Convert to a Next.js page component (JSX).
- Export default function ${componentName}Page().
- Use next/link for navigation links: <Link href="/${navTargets[0] || ''}">...</Link>.
- Use next/router useRouter() for programmatic navigation.
- Replace showPage('x') calls with router.push('/x').
- Use CSS Modules: import styles from './${pageName}.module.css'.
- Output format: first the JSX file content, then after a line "---CSS_MODULE---" the CSS module content.`,

    nuxt3: `Convert to a Nuxt 3 page component (.vue).
- Use <script setup> with Composition API.
- Use <NuxtLink to="/${navTargets[0] || ''}"> for navigation links.
- Use navigateTo('/${navTargets[0] || ''}') for programmatic navigation.
- Replace showPage('x') calls with navigateTo('/x').
- Use <style scoped> for styles.
- Output the complete .vue file.`,

    html: `Convert to a clean standalone HTML file.
- Link to styles.css for shared styles: <link rel="stylesheet" href="styles.css">
- Replace showPage('x') calls with <a href="x.html"> links or window.location.href = 'x.html'.
- Remove data-page, data-bridge-id, and other framework attributes.
- Clean up the HTML structure.
- Output the complete HTML file.`,
  };

  const routeMapping = allPageNames.map(n => {
    const path = n === allPageNames[0] ? '/' : `/${n}`;
    return `  "${n}" -> "${path}"`;
  }).join('\n');

  const bindingsContext = apiBindings.length > 0
    ? `\n\nAPI Bindings (generate fetch() calls for these):\n${JSON.stringify(apiBindings.slice(0, 10), null, 2)}`
    : '';

  const prompt = `You are a frontend code converter. Convert this HTML prototype page into framework code.

FRAMEWORK: ${framework}
PAGE NAME: ${pageName}
COMPONENT NAME: ${componentName}

${frameworkInstructions[framework]}

DESIGN TOKENS (CSS variables available):
${tokensCssSnippet || 'None'}

NAVIGATION MAP (page routes):
${routeMapping}

NAVIGATION TARGETS FROM THIS PAGE: ${navTargets.join(', ') || 'None'}
${bindingsContext}

RULES:
- Output ONLY the code. No markdown fences, no explanation.
- Preserve the visual design exactly.
- Convert inline styles to proper CSS classes/modules.
- Use semantic HTML elements.
- Keep all text content in its original language.
- Use CSS variables (var(--xxx)) from the tokens where possible.

HTML TO CONVERT:
${pageHtml}`;

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: { maxOutputTokens: 8192 },
  });

  let result;
  try {
    result = await model.generateContent(prompt);
  } catch (err: any) {
    // Try fallback key on 429
    if (err?.status === 429 || err?.message?.includes('429')) {
      const fallbackKey = getGeminiApiKeyExcluding(apiKey);
      if (fallbackKey) {
        const genai2 = new GoogleGenerativeAI(fallbackKey);
        const model2 = genai2.getGenerativeModel({
          model: getGeminiModel(),
          generationConfig: { maxOutputTokens: 8192 },
        });
        result = await model2.generateContent(prompt);
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const response = result.response;
  try {
    trackUsage(apiKey, getGeminiModel(), 'code-export', response.usageMetadata, projectId);
  } catch {}

  let text = response.text().trim();

  // Strip markdown fences
  const fenceMatch = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  const files: ExportedFile[] = [];

  if (framework === 'react') {
    const parts = text.split('---CSS_MODULE---');
    const jsx = stripFences(parts[0]);
    const css = parts[1] ? stripFences(parts[1]) : '';
    files.push({ path: `src/pages/${componentName}.jsx`, content: jsx });
    if (css) files.push({ path: `src/pages/${componentName}.module.css`, content: css });
  } else if (framework === 'vue3') {
    files.push({ path: `src/pages/${componentName}.vue`, content: text });
  } else if (framework === 'nextjs') {
    const parts = text.split('---CSS_MODULE---');
    const jsx = stripFences(parts[0]);
    const css = parts[1] ? stripFences(parts[1]) : '';
    const fileName = pageName === allPageNames[0] ? 'index' : pageName;
    files.push({ path: `pages/${fileName}.jsx`, content: jsx });
    if (css) files.push({ path: `pages/${fileName}.module.css`, content: css });
  } else if (framework === 'nuxt3') {
    const fileName = pageName === allPageNames[0] ? 'index' : pageName;
    files.push({ path: `pages/${fileName}.vue`, content: text });
  } else if (framework === 'html') {
    const fileName = pageName === allPageNames[0] ? 'index' : pageName;
    files.push({ path: `${fileName}.html`, content: text });
  }

  return files;
}

// ─── Main Export Function ───────────────────────────

export async function exportToFramework(
  html: string,
  framework: Framework,
  designTokens: any,
  apiBindings: any[],
  projectId?: string,
): Promise<ExportResult> {
  const pages = extractPages(html);
  const tokens = extractDesignTokens(html);
  const navMap = extractNavigationMap(html);
  const allPageNames = pages.map(p => p.name);

  // Get framework template (skeleton files)
  let templateFiles: ExportedFile[];
  switch (framework) {
    case 'react':
      templateFiles = getReactTemplate(pages, tokens);
      break;
    case 'vue3':
      templateFiles = getVue3Template(pages, tokens);
      break;
    case 'nextjs':
      templateFiles = getNextjsTemplate(pages, tokens);
      break;
    case 'nuxt3':
      templateFiles = getNuxt3Template(pages, tokens);
      break;
    case 'html':
      templateFiles = getHtmlTemplate(tokens);
      break;
    default:
      throw new Error(`Unsupported framework: ${framework}`);
  }

  // Convert each page via Gemini AI
  const pageFiles: ExportedFile[] = [];
  for (const page of pages) {
    const converted = await convertPageWithGemini(
      page.html,
      page.name,
      framework,
      tokens,
      navMap,
      allPageNames,
      apiBindings,
      projectId,
    );
    pageFiles.push(...converted);
  }

  // Generate API utility if bindings exist
  if (apiBindings.length > 0) {
    const apiUtil = generateApiUtility(framework, apiBindings);
    if (apiUtil) pageFiles.push(apiUtil);
  }

  // Generate README
  const readme = generateReadme(framework, allPageNames);
  pageFiles.push(readme);

  return { files: [...templateFiles, ...pageFiles] };
}

// ─── Helpers ────────────────────────────────────────

function toComponentName(pageName: string): string {
  return pageName
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

function generateTokensCss(tokens: Record<string, string>): string {
  if (Object.keys(tokens).length === 0) return ':root {}\n';
  const vars = Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `:root {\n${vars}\n}\n`;
}

function stripFences(text: string): string {
  let t = text.trim();
  const m = t.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (m) t = m[1].trim();
  return t;
}

function generateApiUtility(framework: Framework, bindings: any[]): ExportedFile | null {
  const fetches = bindings.map(b => {
    const fnName = `fetch${toComponentName(b.bridge_id || b.bridgeId || 'data')}`;
    return `export async function ${fnName}() {
  const res = await fetch('${b.url || '/api/data'}', {
    method: '${b.method || 'GET'}',
  });
  if (!res.ok) throw new Error(\`API error: \${res.status}\`);
  return res.json();
}`;
  }).join('\n\n');

  const content = `/**
 * Auto-generated API utility functions
 * These were derived from the prototype's API bindings.
 */

${fetches}
`;

  switch (framework) {
    case 'react': return { path: 'src/api/index.js', content };
    case 'vue3': return { path: 'src/api/index.js', content };
    case 'nextjs': return { path: 'lib/api.js', content };
    case 'nuxt3': return { path: 'utils/api.ts', content };
    case 'html': return { path: 'api.js', content };
    default: return null;
  }
}

function generateReadme(framework: Framework, pageNames: string[]): ExportedFile {
  const frameworkLabels: Record<Framework, string> = {
    react: 'React + Vite',
    vue3: 'Vue 3 + Vite',
    nextjs: 'Next.js',
    nuxt3: 'Nuxt 3',
    html: 'Plain HTML',
  };

  const installCmd: Record<Framework, string> = {
    react: 'npm install\nnpm run dev',
    vue3: 'npm install\nnpm run dev',
    nextjs: 'npm install\nnpm run dev',
    nuxt3: 'npm install\nnpm run dev',
    html: '# Open index.html in your browser',
  };

  return {
    path: 'README.md',
    content: `# Prototype Export — ${frameworkLabels[framework]}

This project was exported from Project Bridge.

## Getting Started

\`\`\`bash
${installCmd[framework]}
\`\`\`

## Pages

${pageNames.map(n => `- ${n}`).join('\n')}

## Notes

- Design tokens are in the CSS variables file
- Navigation has been converted to framework router
- API bindings have been converted to fetch() utility functions
- This is a starting point — review and adjust as needed
`,
  };
}
