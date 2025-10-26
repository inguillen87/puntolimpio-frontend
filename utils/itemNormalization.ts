const collapseWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ');
const removeDiacritics = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const sanitizeAlphaNumeric = (value: string) => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

const TOKEN_CORRECTIONS: Record<string, string> = {
  LM200: 'LM200',
  CM200: 'LM200',
  IM200: 'LM200',
};

const correctAlphaNumericToken = (token: string): string => {
  const sanitized = sanitizeAlphaNumeric(token);
  const correction = TOKEN_CORRECTIONS[sanitized];
  if (correction) {
    return correction;
  }
  return token;
};

const formatToken = (token: string) => {
  if (!token) return token;
  const hasDigits = /\d/.test(token);
  if (hasDigits) {
    return correctAlphaNumericToken(token.replace(/[\s_-]+/g, '').toUpperCase());
  }
  if (token.length <= 3) {
    return token.toUpperCase();
  }
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
};

export const normalizeItemName = (raw: string): string => {
  const trimmed = collapseWhitespace(raw);
  const tokens = trimmed
    .split(' ')
    .filter(Boolean)
    .map(token => formatToken(token))
    .map(token => correctAlphaNumericToken(token));
  return tokens.join(' ');
};

export const canonicalItemKey = (raw: string): string => {
  const normalized = removeDiacritics(raw).replace(/[^a-zA-Z0-9]/g, '');
  return normalized.toUpperCase();
};

export const areItemNamesEquivalent = (a: string, b: string): boolean => {
  return canonicalItemKey(a) === canonicalItemKey(b);
};

export const normalizePartnerName = (raw: string): string => {
  return collapseWhitespace(raw).replace(/\s+/g, ' ');
};
