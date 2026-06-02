import { symbolData } from '../data/symbolData';

export const INITIAL_SYMBOLS = Object.keys(symbolData).reduce((acc, id) => {
  acc[id] = false;
  return acc;
}, {});

export const UNLOCKED_SYMBOLS = Object.keys(symbolData).reduce((acc, id) => {
  acc[id] = id !== 'question';
  return acc;
}, {});

export const ADMIN_UNLOCK_CATEGORIES = {
  heart: ['heart_kymin', 'heart_yewon', 'heart_eunhye', 'heart_jihoon', 'heart_eunchae'],
  divide: ['divide_kyeomjun', 'divide_yewon'],
  cross: ['cross', 'cross_jihoon'],
};

export const BASIC_UNLOCK_SYMBOLS = ['heart_kymin', 'divide_kyeomjun', 'cross'];

export const ADMIN_UNLOCK_LABELS = {
  heart: '하트',
  divide: '나누기',
  cross: '십자가',
};

const QR_SYMBOL_ALIASES = {
  heart: 'heart_kymin',
  kymin: 'heart_kymin',
  kim_kyumin: 'heart_kymin',
  gyumin: 'heart_kymin',
  heart_kim: 'heart_kymin',
  yewon_heart: 'heart_yewon',
  heart_son: 'heart_yewon',
  eunhye: 'heart_eunhye',
  eunhye_heart: 'heart_eunhye',
  heart_kim_eunhye: 'heart_eunhye',
  jihoon_heart: 'heart_jihoon',
  heart_hong: 'heart_jihoon',
  divide: 'divide_kyeomjun',
  divide_kyeom: 'divide_kyeomjun',
  kyeomjun: 'divide_kyeomjun',
  divide_seo: 'divide_kyeomjun',
  yewon_divide: 'divide_yewon',
  divide_son: 'divide_yewon',
  cross_kyeomjun: 'cross',
  kyeomjun_cross: 'cross',
  cross_seo: 'cross',
  jihoon_cross: 'cross_jihoon',
  cross_hong: 'cross_jihoon',
  question_mark: 'question',
  reward: 'question',
  booth: 'question',
};

export const normalizeSymbols = symbols => ({
  ...INITIAL_SYMBOLS,
  ...symbols,
});

export const hasQuestionPrerequisites = symbols => {
  const normalizedSymbols = normalizeSymbols(symbols);
  const hasHeart =
    normalizedSymbols.heart_kymin ||
    normalizedSymbols.heart_yewon ||
    normalizedSymbols.heart_eunhye ||
    normalizedSymbols.heart_jihoon ||
    normalizedSymbols.heart_eunchae;
  const hasDivide = normalizedSymbols.divide_kyeomjun || normalizedSymbols.divide_yewon;
  const hasCross = normalizedSymbols.cross || normalizedSymbols.cross_jihoon;

  return hasHeart && hasDivide && hasCross;
};

const normalizeQrValue = value => {
  if (!value) return '';
  return decodeURIComponent(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
};

export const resolveQrSymbol = value => {
  const normalizedValue = normalizeQrValue(value);
  if (!normalizedValue) return '';
  if (Object.prototype.hasOwnProperty.call(INITIAL_SYMBOLS, normalizedValue)) {
    return normalizedValue;
  }
  return QR_SYMBOL_ALIASES[normalizedValue] || '';
};

export const getSymbolsSignature = symbols => JSON.stringify(normalizeSymbols(symbols));
