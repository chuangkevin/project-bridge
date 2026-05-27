import type {
  IngestionAst, RequirementIngestion, PdfIngestion,
  ScreenshotIngestion, ClipboardIngestion, WebpageIngestion,
} from './ingestionAst';

export function isRequirementIngestion(a: IngestionAst): a is RequirementIngestion {
  return a.type === 'requirement';
}
export function isPdfIngestion(a: IngestionAst): a is PdfIngestion {
  return a.type === 'pdf';
}
export function isScreenshotIngestion(a: IngestionAst): a is ScreenshotIngestion {
  return a.type === 'screenshot';
}
export function isClipboardIngestion(a: IngestionAst): a is ClipboardIngestion {
  return a.type === 'clipboard';
}
export function isWebpageIngestion(a: IngestionAst): a is WebpageIngestion {
  return a.type === 'webpage';
}
