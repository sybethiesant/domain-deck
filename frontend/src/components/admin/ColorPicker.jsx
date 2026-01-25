import React, { useState, useEffect, useCallback } from 'react';

/**
 * Convert hex color to HSL
 */
function hexToHsl(hex) {
  hex = hex.replace(/^#/, '');

  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
      default: h = 0;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Convert HSL to hex
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
 * Clamp value between min and max
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a palette from a base color
 */
function generatePalette(baseHex) {
  const base = hexToHsl(baseHex);

  const adjustments = {
    50: [+45, -20],
    100: [+40, -15],
    200: [+30, -10],
    300: [+20, -5],
    400: [+10, 0],
    500: [0, 0],
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
 * Validate hex color
 */
function isValidHex(hex) {
  if (typeof hex !== 'string') return false;
  return /^#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(hex);
}

/**
 * Normalize hex (add # if missing, expand 3-char to 6-char)
 */
function normalizeHex(hex) {
  if (!isValidHex(hex)) return null;
  hex = hex.replace(/^#/, '').toUpperCase();
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  return `#${hex}`;
}

/**
 * ColorPicker Component
 * Displays a color picker with hex input and palette preview
 */
export default function ColorPicker({
  label,
  value,
  onChange,
  showPalette = true,
  quickColors = null
}) {
  const [inputValue, setInputValue] = useState(value || '#4F46E5');
  const [palette, setPalette] = useState({});

  // Default quick colors if not provided
  const defaultQuickColors = [
    { name: 'Indigo', value: '#4F46E5' },
    { name: 'Blue', value: '#2563EB' },
    { name: 'Emerald', value: '#10B981' },
    { name: 'Violet', value: '#7C3AED' },
    { name: 'Rose', value: '#F43F5E' },
    { name: 'Orange', value: '#EA580C' },
    { name: 'Cyan', value: '#06B6D4' },
    { name: 'Amber', value: '#F59E0B' },
  ];

  const colors = quickColors || defaultQuickColors;

  // Update palette when value changes
  useEffect(() => {
    const normalized = normalizeHex(value);
    if (normalized) {
      setInputValue(normalized);
      setPalette(generatePalette(normalized));
    }
  }, [value]);

  // Handle color input change
  const handleColorInput = useCallback((e) => {
    const newColor = e.target.value;
    setInputValue(newColor);

    const normalized = normalizeHex(newColor);
    if (normalized) {
      setPalette(generatePalette(normalized));
      onChange(normalized);
    }
  }, [onChange]);

  // Handle hex text input change
  const handleHexInput = useCallback((e) => {
    const val = e.target.value;
    setInputValue(val);

    const normalized = normalizeHex(val);
    if (normalized) {
      setPalette(generatePalette(normalized));
      onChange(normalized);
    }
  }, [onChange]);

  // Handle quick color selection
  const handleQuickColor = useCallback((color) => {
    const normalized = normalizeHex(color);
    if (normalized) {
      setInputValue(normalized);
      setPalette(generatePalette(normalized));
      onChange(normalized);
    }
  }, [onChange]);

  return (
    <div className="space-y-3">
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}

      {/* Color Input Row */}
      <div className="flex items-center gap-3">
        {/* Native Color Picker */}
        <div className="relative">
          <input
            type="color"
            value={inputValue}
            onChange={handleColorInput}
            className="w-12 h-12 rounded-lg cursor-pointer border-2 border-slate-200 dark:border-slate-600 overflow-hidden"
            style={{ padding: 0 }}
          />
        </div>

        {/* Hex Input */}
        <input
          type="text"
          value={inputValue}
          onChange={handleHexInput}
          placeholder="#000000"
          className="w-28 px-3 py-2 text-sm font-mono border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />

        {/* Current Color Swatch */}
        <div
          className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-600 shadow-inner"
          style={{ backgroundColor: inputValue }}
        />
      </div>

      {/* Quick Colors */}
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => (
          <button
            key={color.value}
            onClick={() => handleQuickColor(color.value)}
            className={`
              w-8 h-8 rounded-lg border-2 transition-all
              ${value === color.value
                ? 'border-primary-500 ring-2 ring-primary-500/30'
                : 'border-transparent hover:border-slate-300 dark:hover:border-slate-500'
              }
            `}
            style={{ backgroundColor: color.value }}
            title={color.name}
          />
        ))}
      </div>

      {/* Palette Preview */}
      {showPalette && Object.keys(palette).length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Generated Palette</p>
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
            {['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map((shade) => (
              <div
                key={shade}
                className="flex-1 h-8 relative group"
                style={{ backgroundColor: palette[shade] }}
                title={`${shade}: ${palette[shade]}`}
              >
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 text-white">
                  {shade}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
