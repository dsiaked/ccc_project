import { Cross, Divide, Heart, Sparkles } from 'lucide-react';

export const symbolIcons = {
  heart: Heart,
  divide: Divide,
  cross: Cross,
  question: Sparkles,
};

export function getSymbolIcon(iconKey) {
  return symbolIcons[iconKey] || Sparkles;
}
