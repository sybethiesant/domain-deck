/**
 * Font Loader Utility
 * Dynamically loads Google Fonts and manages font link elements
 */

const FONT_LINK_ID = 'dynamic-google-fonts';

/**
 * Load Google Fonts dynamically by injecting a link element
 * @param {string} url - Google Fonts URL to load
 * @returns {Promise<void>} - Resolves when fonts are loaded
 */
export function loadGoogleFontsUrl(url) {
  return new Promise((resolve, reject) => {
    // Remove existing font link if present
    const existingLink = document.getElementById(FONT_LINK_ID);
    if (existingLink) {
      existingLink.remove();
    }

    // Create new link element
    const link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    link.href = url;

    // Handle load and error events
    link.onload = () => {
      resolve();
    };

    link.onerror = () => {
      reject(new Error(`Failed to load fonts from: ${url}`));
    };

    // Append to head
    document.head.appendChild(link);
  });
}

/**
 * Generate Google Fonts URL from font names
 * @param {string} heading - Heading font name
 * @param {string} body - Body font name
 * @param {string} mono - Monospace font name
 * @returns {string} - Google Fonts URL
 */
export function generateGoogleFontsUrl(heading, body, mono) {
  const fonts = new Set();

  // Add fonts to set (avoids duplicates)
  if (heading) fonts.add(heading);
  if (body) fonts.add(body);
  if (mono) fonts.add(mono);

  if (fonts.size === 0) {
    return null;
  }

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

/**
 * Load Google Fonts from individual font names
 * @param {string} heading - Heading font name
 * @param {string} body - Body font name
 * @param {string} mono - Monospace font name
 * @returns {Promise<void>}
 */
export function loadGoogleFonts(heading, body, mono) {
  const url = generateGoogleFontsUrl(heading, body, mono);
  if (!url) {
    return Promise.resolve();
  }
  return loadGoogleFontsUrl(url);
}

/**
 * Remove dynamically loaded fonts
 */
export function unloadGoogleFonts() {
  const existingLink = document.getElementById(FONT_LINK_ID);
  if (existingLink) {
    existingLink.remove();
  }
}

/**
 * Preload a font for faster loading (optional optimization)
 * @param {string} fontName - Font name to preload
 */
export function preloadFont(fontName) {
  const encoded = fontName.replace(/\s+/g, '+');
  const url = `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'style';
  link.href = url;
  document.head.appendChild(link);
}

const fontLoader = {
  loadGoogleFontsUrl,
  loadGoogleFonts,
  generateGoogleFontsUrl,
  unloadGoogleFonts,
  preloadFont,
};

export default fontLoader;
