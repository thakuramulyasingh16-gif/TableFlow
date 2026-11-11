const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

export function stripHtmlTags(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim();
}

export function escapeHtml(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[&<>"'/]/g, (ch) => HTML_ENTITY_MAP[ch] ?? ch);
}

export function sanitizeUserText(input: string, maxLen = 500): string {
  return stripHtmlTags(input).slice(0, maxLen);
}
