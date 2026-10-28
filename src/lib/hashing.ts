import crypto from 'crypto';

/**
 * Normalizes text for duplicate detection by:
 * - Lowercasing
 * - Normalizing Unicode (NFKC)
 * - Replacing typographic quotes/dashes with standard ASCII
 * - Collapsing whitespace sequences
 */
export function normalizeEvidenceText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates a SHA-256 hash of the normalized evidence text
 */
export function computeContentHash(text: string): string {
  const normalized = normalizeEvidenceText(text);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}
