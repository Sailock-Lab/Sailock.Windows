import { TextSize } from "./appSettings";

const FONT_SIZES: Record<TextSize, string> = {
  small: "14px",
  normal: "16px",
  large: "19px",
};

export function applyTextSize(size: TextSize) {
  document.documentElement.style.fontSize = FONT_SIZES[size];
}