export interface DesignViolation {
  rule: string;
  severity: 'error' | 'warning';
  detail: string;
}

export interface DesignValidationResult {
  passed: boolean;
  violations: DesignViolation[];
  score: number; // 0-100
  autoFixed: string[]; // list of auto-fixes applied
}

export function validateDesignSystem(html: string): DesignValidationResult {
  const violations: DesignViolation[] = [];

  // 1. Check for pure white backgrounds
  const whiteBgPattern = /background(-color)?\s*:\s*#fff(fff)?\s*[;}"']/gi;
  const whiteBgMatches = html.match(whiteBgPattern);
  if (whiteBgMatches && whiteBgMatches.length > 0) {
    violations.push({
      rule: 'no-white-bg',
      severity: 'warning',
      detail: `Found ${whiteBgMatches.length} instance(s) of #FFFFFF background — should use #FAF4EB or #F8F7F5`,
    });
  }

  // 2. Check for heavy drop shadows (blur > 8px)
  const shadowPattern = /box-shadow\s*:[^;]*/gi;
  const shadowMatches = html.match(shadowPattern) || [];
  for (const shadow of shadowMatches) {
    const blurMatch = shadow.match(/(\d+)px\s+(\d+)px\s+(\d+)px/);
    if (blurMatch && parseInt(blurMatch[3]) > 8) {
      violations.push({
        rule: 'light-shadow',
        severity: 'warning',
        detail: `Heavy shadow detected: blur ${blurMatch[3]}px — max should be 4px`,
      });
    }
  }

  // 3. Check for non-system fonts
  const fontPattern = /font-family\s*:[^;]*/gi;
  const fontMatches = html.match(fontPattern) || [];
  const nonSystemFonts = ['Roboto', 'Open Sans', 'Poppins', 'Montserrat', 'Lato', 'Inter', 'Nunito', 'Raleway', 'Playfair'];
  for (const font of fontMatches) {
    for (const nsf of nonSystemFonts) {
      if (font.includes(nsf)) {
        violations.push({
          rule: 'system-font',
          severity: 'warning',
          detail: `Non-system font "${nsf}" detected — use system sans-serif stack`,
        });
        break;
      }
    }
  }

  // 4. Check for rounded-full / pill buttons
  const pillPattern = /border-radius\s*:\s*(9999|50%|999|100)px/gi;
  if (pillPattern.test(html)) {
    violations.push({
      rule: 'no-pill-radius',
      severity: 'warning',
      detail: 'Found rounded-full/pill border-radius — max should be 8px',
    });
  }

  // 5. CSS variable usage rate
  const hexColorPattern = /#[0-9a-fA-F]{3,8}/g;
  const hexColors = html.match(hexColorPattern) || [];
  const varUsagePattern = /var\(--[a-z-]+\)/g;
  const varUsages = html.match(varUsagePattern) || [];
  const totalColorRefs = hexColors.length + varUsages.length;
  const varRate = totalColorRefs > 0 ? Math.round((varUsages.length / totalColorRefs) * 100) : 100;
  if (varRate < 50) {
    violations.push({
      rule: 'css-var-usage',
      severity: 'warning',
      detail: `CSS variable usage: ${varRate}% — should be >50% (found ${varUsages.length} var() vs ${hexColors.length} hardcoded hex)`,
    });
  }

  // 6. Check for large gradient sections (background with gradient spanning large area)
  const gradientPattern = /linear-gradient\s*\([^)]*\)/gi;
  const gradientCount = (html.match(gradientPattern) || []).length;
  if (gradientCount > 3) {
    violations.push({
      rule: 'minimal-gradients',
      severity: 'warning',
      detail: `Found ${gradientCount} gradient usages — gradients should be rare (only CTA buttons)`,
    });
  }

  // Calculate score
  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  const score = Math.max(0, 100 - (errorCount * 20) - (warningCount * 10));

  return {
    passed: errorCount === 0,
    violations,
    score,
    autoFixed: [],
  };
}

/**
 * Auto-fix common design system violations in generated HTML.
 */
export function autoFixDesignViolations(html: string): { html: string; fixes: string[] } {
  const fixes: string[] = [];
  let fixed = html;

  // 1. Replace white backgrounds on body/main containers
  // Only replace background-color: #ffffff or #fff (not in :root or small elements)
  const whiteBgCount = (fixed.match(/background(-color)?\s*:\s*#fff(fff)?\s*;/gi) || []).length;
  if (whiteBgCount > 0) {
    fixed = fixed.replace(/background(-color)?\s*:\s*#fff(fff)?\s*;/gi, (match) => {
      return match.replace(/#fff(fff)?/i, '#FAF4EB');
    });
    fixes.push(`Replaced ${whiteBgCount} white backgrounds → #FAF4EB`);
  }

  // 2. Cap shadow blur at 4px
  fixed = fixed.replace(/box-shadow\s*:\s*([^;]*);/gi, (match, value) => {
    const newValue = value.replace(/(\d+)px\s+(\d+)px\s+(\d+)px/g, (m: string, x: string, y: string, blur: string) => {
      const b = parseInt(blur);
      if (b > 8) {
        fixes.push(`Capped shadow blur ${b}px → 4px`);
        return `${x}px ${y}px 4px`;
      }
      return m;
    });
    return `box-shadow: ${newValue};`;
  });

  // 3. Fix non-system font stacks
  const nonSystemFonts = ['Roboto', 'Open Sans', 'Poppins', 'Montserrat', 'Lato', 'Inter', 'Nunito', 'Raleway', 'Playfair'];
  const systemStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  for (const nsf of nonSystemFonts) {
    if (fixed.includes(`font-family`) && fixed.includes(nsf)) {
      // Replace entire font-family declaration
      const fontRegex = new RegExp(`font-family\\s*:[^;]*${nsf}[^;]*;`, 'gi');
      const fontMatches = fixed.match(fontRegex);
      if (fontMatches) {
        fixed = fixed.replace(fontRegex, `font-family: ${systemStack};`);
        fixes.push(`Replaced ${nsf} font → system sans-serif`);
      }
    }
  }

  // 4. Fix pill border-radius on buttons
  fixed = fixed.replace(/border-radius\s*:\s*(9999|999)px/gi, () => {
    fixes.push('Fixed pill border-radius → 4px');
    return 'border-radius: 4px';
  });

  return { html: fixed, fixes };
}
