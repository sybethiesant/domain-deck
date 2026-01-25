import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadGoogleFontsUrl } from '../utils/fontLoader';
import { API_URL } from '../config/api';

const ThemeConfigContext = createContext();

export function useThemeConfig() {
  return useContext(ThemeConfigContext);
}

/**
 * Apply CSS variables to the document root
 * @param {object} cssVariables - Object of CSS variable name/value pairs
 */
function applyCssVariables(cssVariables) {
  if (!cssVariables || typeof cssVariables !== 'object') return;

  const root = document.documentElement;

  // Apply each CSS variable
  Object.entries(cssVariables).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
}

/**
 * Remove CSS variables from document root (for cleanup)
 * @param {object} cssVariables - Object of CSS variable name/value pairs
 */
function removeCssVariables(cssVariables) {
  if (!cssVariables || typeof cssVariables !== 'object') return;

  const root = document.documentElement;

  Object.keys(cssVariables).forEach((name) => {
    root.style.removeProperty(name);
  });
}

/**
 * ThemeConfigProvider
 * Manages theme CSS variables and font loading from site configuration
 */
export function ThemeConfigProvider({ children }) {
  const [themeConfig, setThemeConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch and apply theme on mount
  useEffect(() => {
    const fetchTheme = async () => {
      try {
        const res = await fetch(`${API_URL}/site-config`);
        if (!res.ok) {
          throw new Error('Failed to fetch site config');
        }

        const config = await res.json();

        if (config.theme) {
          // Apply CSS variables
          if (config.theme.cssVariables) {
            applyCssVariables(config.theme.cssVariables);
          }

          // Load Google Fonts
          if (config.theme.googleFontsUrl) {
            try {
              await loadGoogleFontsUrl(config.theme.googleFontsUrl);
            } catch (fontError) {
              console.warn('Failed to load custom fonts:', fontError);
              // Non-fatal - fallback fonts will be used
            }
          }

          setThemeConfig(config.theme);
        }
      } catch (err) {
        console.error('Failed to fetch theme config:', err);
        setError(err.message);
        // Non-fatal - Tailwind fallbacks will be used
      } finally {
        setIsLoading(false);
      }
    };

    fetchTheme();
  }, []);

  /**
   * Update theme (for admin live preview)
   * Applies new CSS variables and loads fonts without saving to database
   */
  const previewTheme = useCallback((newCssVariables, googleFontsUrl) => {
    if (newCssVariables) {
      applyCssVariables(newCssVariables);
    }

    if (googleFontsUrl) {
      loadGoogleFontsUrl(googleFontsUrl).catch(err => {
        console.warn('Failed to load preview fonts:', err);
      });
    }
  }, []);

  /**
   * Refresh theme from server (after saving)
   */
  const refreshTheme = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/site-config`);
      if (!res.ok) throw new Error('Failed to fetch site config');

      const config = await res.json();

      if (config.theme) {
        if (config.theme.cssVariables) {
          applyCssVariables(config.theme.cssVariables);
        }

        if (config.theme.googleFontsUrl) {
          await loadGoogleFontsUrl(config.theme.googleFontsUrl);
        }

        setThemeConfig(config.theme);
      }
    } catch (err) {
      console.error('Failed to refresh theme:', err);
    }
  }, []);

  /**
   * Reset theme to defaults (for admin)
   */
  const resetToDefaults = useCallback(() => {
    // Remove all custom CSS variables - Tailwind fallbacks will take over
    if (themeConfig?.cssVariables) {
      removeCssVariables(themeConfig.cssVariables);
    }
    setThemeConfig(null);
  }, [themeConfig]);

  const value = {
    themeConfig,
    isLoading,
    error,
    previewTheme,
    refreshTheme,
    resetToDefaults,
  };

  return (
    <ThemeConfigContext.Provider value={value}>
      {children}
    </ThemeConfigContext.Provider>
  );
}

export default ThemeConfigContext;
