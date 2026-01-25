/**
 * Color Utilities for Theme System
 * Generates color palettes from base colors using HSL manipulation
 * No external dependencies required
 */

/**
 * Convert hex color to HSL
 * @param {string} hex - Hex color (e.g., "#4F46E5")
 * @returns {object} { h, s, l } - Hue (0-360), Saturation (0-100), Lightness (0-100)
 */
function hexToHsl(hex) {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse hex to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Convert HSL to hex color
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} Hex color (e.g., "#4F46E5")
 */
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Clamp a value between min and max
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a 10-shade color palette from a base color
 * Uses the base color as shade 500/600 and generates lighter/darker variants
 *
 * @param {string} baseHex - Base hex color (e.g., "#4F46E5")
 * @returns {object} Palette with shades 50-900
 */
function generatePalette(baseHex) {
  const base = hexToHsl(baseHex);

  // Shade adjustments: [lightness delta, saturation delta]
  // Lighter shades decrease saturation slightly, darker increase it
  const adjustments = {
    50:  [+45, -20],
    100: [+40, -15],
    200: [+30, -10],
    300: [+20, -5],
    400: [+10, 0],
    500: [0, 0],        // Base color
    600: [-10, 0],
    700: [-20, +5],
    800: [-30, +10],
    900: [-40, +10],
  };

  const palette = {};

  for (const [shade, [lDelta, sDelta]] of Object.entries(adjustments)) {
    const newL = clamp(base.l + lDelta, 5, 98);
    const newS = clamp(base.s + sDelta, 5, 100);
    palette[shade] = hslToHex(base.h, newS, newL);
  }

  return palette;
}

/**
 * Validate a hex color string
 * @param {string} hex - Color to validate
 * @returns {boolean} True if valid hex color
 */
function isValidHex(hex) {
  if (typeof hex !== 'string') return false;
  return /^#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(hex);
}

/**
 * Normalize hex color (add # if missing, expand 3-char to 6-char)
 * @param {string} hex - Hex color
 * @returns {string} Normalized hex color
 */
function normalizeHex(hex) {
  if (!isValidHex(hex)) return null;

  hex = hex.replace(/^#/, '').toUpperCase();

  // Expand 3-char hex to 6-char
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }

  return `#${hex}`;
}

/**
 * Theme presets with primary and accent colors
 */
const THEME_PRESETS = {
  default: {
    name: 'Default',
    description: 'Professional indigo and emerald',
    primary: '#4F46E5',
    accent: '#10B981',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },
  ocean: {
    name: 'Ocean',
    description: 'Cool blues and cyans',
    primary: '#0284C7',
    accent: '#06B6D4',
    success: '#14B8A6',
    warning: '#F59E0B',
    error: '#EF4444',
  },
  forest: {
    name: 'Forest',
    description: 'Natural greens',
    primary: '#059669',
    accent: '#84CC16',
    success: '#22C55E',
    warning: '#EAB308',
    error: '#DC2626',
  },
  sunset: {
    name: 'Sunset',
    description: 'Warm oranges and roses',
    primary: '#EA580C',
    accent: '#F43F5E',
    success: '#22C55E',
    warning: '#FBBF24',
    error: '#DC2626',
  },
  midnight: {
    name: 'Midnight',
    description: 'Deep purples and pinks',
    primary: '#7C3AED',
    accent: '#EC4899',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
  },
};

/**
 * Default font settings
 */
const DEFAULT_FONTS = {
  heading: 'Inter',
  body: 'Inter',
  mono: 'JetBrains Mono',
};

/**
 * Generate complete theme CSS variables from settings
 * @param {object} settings - Theme settings from database
 * @returns {object} CSS variables object
 */
function generateThemeCssVariables(settings) {
  // Get base colors (use defaults if not set)
  const primaryBase = normalizeHex(settings.theme_primary_base) || THEME_PRESETS.default.primary;
  const accentBase = normalizeHex(settings.theme_accent_base) || THEME_PRESETS.default.accent;
  const successBase = normalizeHex(settings.theme_success_base) || THEME_PRESETS.default.success;
  const warningBase = normalizeHex(settings.theme_warning_base) || THEME_PRESETS.default.warning;
  const errorBase = normalizeHex(settings.theme_error_base) || THEME_PRESETS.default.error;

  // Generate palettes
  const primary = generatePalette(primaryBase);
  const accent = generatePalette(accentBase);
  const success = generatePalette(successBase);
  const warning = generatePalette(warningBase);
  const error = generatePalette(errorBase);

  // Build CSS variables object
  const cssVars = {};

  // Primary palette
  for (const [shade, color] of Object.entries(primary)) {
    cssVars[`--color-primary-${shade}`] = color;
  }

  // Accent palette
  for (const [shade, color] of Object.entries(accent)) {
    cssVars[`--color-accent-${shade}`] = color;
  }

  // Success palette (only need a few shades)
  cssVars['--color-success-50'] = success['50'];
  cssVars['--color-success-100'] = success['100'];
  cssVars['--color-success-500'] = success['500'];
  cssVars['--color-success-600'] = success['600'];
  cssVars['--color-success-700'] = success['700'];

  // Warning palette
  cssVars['--color-warning-50'] = warning['50'];
  cssVars['--color-warning-100'] = warning['100'];
  cssVars['--color-warning-500'] = warning['500'];
  cssVars['--color-warning-600'] = warning['600'];
  cssVars['--color-warning-700'] = warning['700'];

  // Error palette
  cssVars['--color-error-50'] = error['50'];
  cssVars['--color-error-100'] = error['100'];
  cssVars['--color-error-500'] = error['500'];
  cssVars['--color-error-600'] = error['600'];
  cssVars['--color-error-700'] = error['700'];

  // Font families
  cssVars['--font-heading'] = settings.theme_font_heading || DEFAULT_FONTS.heading;
  cssVars['--font-body'] = settings.theme_font_body || DEFAULT_FONTS.body;
  cssVars['--font-mono'] = settings.theme_font_mono || DEFAULT_FONTS.mono;

  return cssVars;
}

/**
 * Generate Google Fonts URL from font settings
 * @param {object} settings - Theme settings
 * @returns {string|null} Google Fonts URL or null if using defaults
 */
function generateGoogleFontsUrl(settings) {
  const fonts = new Set();

  const heading = settings.theme_font_heading || DEFAULT_FONTS.heading;
  const body = settings.theme_font_body || DEFAULT_FONTS.body;
  const mono = settings.theme_font_mono || DEFAULT_FONTS.mono;

  // Add fonts to set (avoids duplicates)
  fonts.add(heading);
  fonts.add(body);
  fonts.add(mono);

  // Build Google Fonts URL
  const fontFamilies = Array.from(fonts)
    .map(font => {
      // Replace spaces with + for URL
      const encoded = font.replace(/\s+/g, '+');
      // Request multiple weights
      return `family=${encoded}:wght@400;500;600;700`;
    })
    .join('&');

  return `https://fonts.googleapis.com/css2?${fontFamilies}&display=swap`;
}

module.exports = {
  hexToHsl,
  hslToHex,
  generatePalette,
  isValidHex,
  normalizeHex,
  generateThemeCssVariables,
  generateGoogleFontsUrl,
  THEME_PRESETS,
  DEFAULT_FONTS,
};
