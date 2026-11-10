const HTML_ENTITY_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

export function stripHtmlTags(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim();
}

export function escapeHtml(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[&<>"'/]/g, (ch) => HTML_ENTITY_MAP[ch]);
}

export function sanitizeUserText(input, maxLen = 500) {
  const stripped = stripHtmlTags(input);
  return stripped.slice(0, maxLen);
}
