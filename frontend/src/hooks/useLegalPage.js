import { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

/**
 * Hook to fetch legal page content and site config
 * @param {string} pageKey - The legal page key (terms, privacy, refund)
 * @returns {object} - Loading state, custom content, and site config
 */
export function useLegalPage(pageKey) {
  const [loading, setLoading] = useState(true);
  const [customContent, setCustomContent] = useState(null);
  const [siteConfig, setSiteConfig] = useState({
    site_name: 'WorxTech',
    company_name: 'WorxTech Internet Services LLC',
    support_email: 'support@worxtech.biz',
    site_url: 'https://worxtech.biz'
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch site config and legal content in parallel
        const [configRes, contentRes] = await Promise.all([
          fetch(`${API_URL}/site-config`),
          fetch(`${API_URL}/legal/${pageKey}`)
        ]);

        if (configRes.ok) {
          const config = await configRes.json();
          setSiteConfig(prev => ({ ...prev, ...config }));
        }

        if (contentRes.ok) {
          const content = await contentRes.json();
          if (content.has_custom_content && content.content) {
            setCustomContent(content.content);
          }
        }
      } catch (err) {
        console.error(`Error fetching ${pageKey} page:`, err);
      }
      setLoading(false);
    };
    fetchData();
  }, [pageKey]);

  return { loading, customContent, siteConfig };
}

export default useLegalPage;
