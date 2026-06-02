/**
 * uploadAnalysis.ts — fire-and-forget visual analysis of ingested image attachments.
 *
 * Called after a successful image ingest. Reads the image bytes, calls
 * analyzeDesignImage(), and stores the result in the attachments table.
 *
 * Per MEMORY.md multimodal limitation: Codex and OpenCode adapters may throw on
 * images. analyzeDesignImage() already wraps vision calls in try/catch and
 * returns a fallback — so this service always stores something (even if it's
 * just the defaults). Failures are logged but do not propagate.
 */
import type Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Attachment } from './ingestionService.js';
import { analyzeDesignImage } from './designExtractor.js';

export async function analyzeAndSaveVisualSpec(
  db: Database.Database,
  attachment: Attachment,
  dataDir: string,
): Promise<void> {
  try {
    // Mark as in-progress
    db.prepare("UPDATE attachments SET analysis_status = 'running' WHERE id = ?")
      .run(attachment.id);

    // Read image bytes from disk
    const absPath = join(dataDir, attachment.storedPath);
    let imageBytes: Buffer;
    try {
      imageBytes = readFileSync(absPath);
    } catch (readErr: any) {
      console.warn(`[uploadAnalysis] Could not read attachment ${attachment.id}: ${readErr.message}`);
      db.prepare("UPDATE attachments SET analysis_status = 'error' WHERE id = ?")
        .run(attachment.id);
      return;
    }

    const imageBase64 = imageBytes.toString('base64');

    // Call vision analysis (wraps multimodal limitation — returns fallback on failure)
    const analysis = await analyzeDesignImage(imageBase64);

    // Store as JSON so designTokenCompiler can parse it
    const stored = JSON.stringify({
      globalStyles: {
        primaryColor: analysis.primaryColor,
        secondaryColor: analysis.secondaryColor,
        backgroundColor: analysis.backgroundColor,
        textColor: analysis.textColor,
        fontFamily: analysis.fontFamily,
        borderRadius: analysis.borderRadius,
      },
      rawAnalysis: analysis.rawAnalysis,
    });

    db.prepare(
      "UPDATE attachments SET visual_analysis = ?, analysis_status = 'done' WHERE id = ?"
    ).run(stored, attachment.id);

    console.log(`[uploadAnalysis] Analysis done for attachment ${attachment.id}`);
  } catch (err: any) {
    // Non-fatal: log and mark as error so it can be retried manually
    console.warn(`[uploadAnalysis] Analysis failed for attachment ${attachment.id}: ${err.message?.slice(0, 120)}`);
    try {
      db.prepare("UPDATE attachments SET analysis_status = 'error' WHERE id = ?")
        .run(attachment.id);
    } catch { /* DB write failure is also non-fatal here */ }
  }
}
