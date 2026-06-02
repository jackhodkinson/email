/**
 * Deterministic avatar color from a sender identifier (typically email).
 * Returns a CSS color triple suitable for inline style.
 */
export function avatarColors(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  // Keep saturation/lightness in a tasteful, accessible range.
  return {
    bg: `oklch(0.78 0.08 ${hue})`,
    fg: `oklch(0.32 0.10 ${hue})`,
  };
}
