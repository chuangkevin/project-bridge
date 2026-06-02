/**
 * qualityScorer.ts — AI-based quality scoring for Vue SFC design artifacts.
 *
 * Evaluates a Vue SFC on 5 dimensions (design, responsive, consistency,
 * accessibility, overall) using the MultiProviderClient. Gracefully falls back
 * to default scores on AI failure.
 */

import { generateJson } from './provider.js';

export interface QualityScore {
  overall: number;         // 0-100
  design: number;          // visual design quality
  responsive: number;      // responsiveness / mobile-friendliness
  consistency: number;     // style / component consistency
  accessibility: number;   // semantic HTML, contrast, ARIA basics
  summary: string;         // 1-sentence Chinese summary
}

const FALLBACK_SCORE: QualityScore = {
  overall: 75,
  design: 75,
  responsive: 70,
  consistency: 75,
  accessibility: 70,
  summary: '品質評估暫時無法使用',
};

const SYSTEM_PROMPT = `你是一位 Vue 3 + Tailwind CSS UI 設計品質評審。
請評估提供的 Vue SFC 在以下五個面向，每項給 0-100 的整數分數：
- design: 視覺設計品質（色彩、排版、間距、美觀）
- responsive: 響應式設計（是否適配不同螢幕寬度）
- consistency: 一致性（元件樣式、spacing、顏色是否統一）
- accessibility: 無障礙基礎（語意 HTML、顏色對比、ARIA）
- overall: 綜合分數（四項的加權平均）

還需提供一句繁體中文摘要（summary）描述整體設計品質與主要建議。`;

export async function scoreArtifact(sfcSource: string): Promise<QualityScore> {
  try {
    const { data } = await generateJson<QualityScore>({
      model: 'gemini-2.5-flash',
      prompt: `請評估以下 Vue SFC 的品質：\n\n${sfcSource.slice(0, 8000)}`,
      systemInstruction: SYSTEM_PROMPT,
    });

    // Validate and clamp all numeric fields
    const clamp = (v: unknown): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 75;
      return Math.max(0, Math.min(100, Math.round(n)));
    };

    return {
      overall: clamp(data.overall),
      design: clamp(data.design),
      responsive: clamp(data.responsive),
      consistency: clamp(data.consistency),
      accessibility: clamp(data.accessibility),
      summary: typeof data.summary === 'string' && data.summary.trim()
        ? data.summary.trim()
        : FALLBACK_SCORE.summary,
    };
  } catch (err) {
    console.warn('[qualityScorer] AI evaluation failed, using fallback:', (err as Error)?.message?.slice(0, 120));
    return { ...FALLBACK_SCORE };
  }
}
