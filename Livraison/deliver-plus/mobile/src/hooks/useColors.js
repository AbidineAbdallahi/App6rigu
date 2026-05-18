import { COLORS, DARK_COLORS } from '../constants';
import useThemeStore from '../stores/themeStore';

export default function useColors() {
  const { isDark } = useThemeStore();
  return isDark ? DARK_COLORS : COLORS;
}
