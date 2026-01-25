import React, { useState, useEffect, useCallback } from 'react';

/**
 * Popular Google Fonts for quick selection
 */
const POPULAR_FONTS = {
  display: [
    'Inter',
    'Poppins',
    'Montserrat',
    'Playfair Display',
    'Raleway',
    'Roboto Slab',
    'Oswald',
    'Lora',
  ],
  body: [
    'Inter',
    'Roboto',
    'Open Sans',
    'Lato',
    'Source Sans 3',
    'Nunito',
    'Work Sans',
    'DM Sans',
  ],
  mono: [
    'JetBrains Mono',
    'Fira Code',
    'Source Code Pro',
    'IBM Plex Mono',
    'Roboto Mono',
    'Ubuntu Mono',
    'Inconsolata',
    'Monaco',
  ],
};

/**
 * FontSelector Component
 * Allows selection of a Google Font with preview
 */
export default function FontSelector({
  label,
  value,
  onChange,
  type = 'body', // 'display', 'body', or 'mono'
  previewText = null,
}) {
  const [inputValue, setInputValue] = useState(value || 'Inter');
  const [fontLoaded, setFontLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Get popular fonts for this type
  const popularFonts = POPULAR_FONTS[type] || POPULAR_FONTS.body;

  // Default preview text based on type
  const defaultPreview = type === 'mono'
    ? 'const greeting = "Hello, World!";'
    : type === 'display'
    ? 'The Quick Brown Fox'
    : 'The quick brown fox jumps over the lazy dog.';

  const preview = previewText || defaultPreview;

  // Load font for preview
  useEffect(() => {
    if (!inputValue) return;

    setFontLoaded(false);
    setLoadError(false);

    // Create font link for preview
    const fontId = `preview-font-${type}`;
    const existingLink = document.getElementById(fontId);
    if (existingLink) {
      existingLink.remove();
    }

    const link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${inputValue.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap`;

    link.onload = () => {
      setFontLoaded(true);
    };

    link.onerror = () => {
      setLoadError(true);
    };

    document.head.appendChild(link);

    return () => {
      // Cleanup preview font on unmount
      const el = document.getElementById(fontId);
      if (el) el.remove();
    };
  }, [inputValue, type]);

  // Handle input change
  const handleInputChange = useCallback((e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  }, [onChange]);

  // Handle quick font selection
  const handleQuickFont = useCallback((font) => {
    setInputValue(font);
    onChange(font);
  }, [onChange]);

  return (
    <div className="space-y-3">
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}

      {/* Font Input */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Enter Google Font name"
          className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />

        {/* Status Indicator */}
        {inputValue && (
          <div className="flex items-center gap-1">
            {fontLoaded && !loadError && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Loaded
              </span>
            )}
            {loadError && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Not Found
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quick Font Selection */}
      <div className="flex flex-wrap gap-2">
        {popularFonts.map((font) => (
          <button
            key={font}
            onClick={() => handleQuickFont(font)}
            className={`
              px-3 py-1 text-xs rounded-lg border transition-all
              ${value === font
                ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-500 text-primary-700 dark:text-primary-300'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-primary-300 dark:hover:border-primary-600'
              }
            `}
          >
            {font}
          </button>
        ))}
      </div>

      {/* Font Preview */}
      <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Preview</p>
        <p
          className={`
            text-slate-900 dark:text-slate-100
            ${type === 'display' ? 'text-2xl font-semibold' : ''}
            ${type === 'body' ? 'text-base' : ''}
            ${type === 'mono' ? 'text-sm' : ''}
          `}
          style={{
            fontFamily: fontLoaded ? `"${inputValue}", sans-serif` : 'inherit',
          }}
        >
          {preview}
        </p>
        {type !== 'mono' && (
          <p
            className="mt-2 text-sm text-slate-600 dark:text-slate-400"
            style={{
              fontFamily: fontLoaded ? `"${inputValue}", sans-serif` : 'inherit',
            }}
          >
            ABCDEFGHIJKLMNOPQRSTUVWXYZ
            <br />
            abcdefghijklmnopqrstuvwxyz
            <br />
            0123456789
          </p>
        )}
      </div>
    </div>
  );
}
