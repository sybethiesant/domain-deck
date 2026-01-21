import React, { useState, useEffect } from 'react';
import { ExternalLink, Loader2, AlertCircle, Save, Trash2, Info, RotateCcw } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';

// eNom default nameservers (required for URL forwarding to work)
const DEFAULT_NAMESERVERS = [
  'dns1.name-services.com',
  'dns2.name-services.com',
  'dns3.name-services.com',
  'dns4.name-services.com'
];

function UrlForwardingPanel({ domainId, domainName, tld, nameservers, isAdmin = false, onNameserversUpdated }) {
  const { token } = useAuth();
  const basePath = isAdmin ? `${API_URL}/admin/domains` : `${API_URL}/domains`;
  const [forwarding, setForwarding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoringNS, setRestoringNS] = useState(false);

  // Form state
  const [forwardUrl, setForwardUrl] = useState('');
  const [forwardType, setForwardType] = useState('temporary');
  const [cloak, setCloak] = useState(false);
  const [cloakTitle, setCloakTitle] = useState('');
  const [cloakDescription, setCloakDescription] = useState('');

  // Check if using eNom nameservers (required for URL forwarding)
  const isUsingEnomNS = React.useMemo(() => {
    if (!nameservers || nameservers.length === 0) {
      return true;
    }
    const nsLowerList = nameservers.map(ns => ns.toLowerCase().trim());
    return nsLowerList.some(ns =>
      ns.includes('name-services') ||
      ns.includes('enom') ||
      ns.includes('registrar-servers')
    );
  }, [nameservers]);

  useEffect(() => {
    if (isUsingEnomNS) {
      fetchForwarding();
    } else {
      setLoading(false);
    }
  }, [domainId, isUsingEnomNS]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestoreDefaultNS = async () => {
    if (!window.confirm(`This will change nameservers to eNom's default DNS servers (dns1.name-services.com, dns2.name-services.com, etc). Continue?`)) {
      return;
    }

    setRestoringNS(true);
    try {
      const res = await fetch(`${basePath}/${domainId}/nameservers`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nameservers: DEFAULT_NAMESERVERS
        })
      });

      if (res.ok) {
        toast.success('Nameservers restored to eNom defaults');
        if (onNameserversUpdated) {
          onNameserversUpdated(DEFAULT_NAMESERVERS);
        }
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to restore nameservers');
      }
    } catch (err) {
      toast.error('Connection error');
    }
    setRestoringNS(false);
  };

  const fetchForwarding = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/domains/${domainId}/url-forwarding`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setForwarding(data);
        if (data.enabled && data.forwardUrl) {
          setForwardUrl(data.forwardUrl);
          setForwardType(data.forwardType || 'temporary');
          setCloak(data.cloak || false);
          setCloakTitle(data.cloakTitle || '');
          setCloakDescription(data.cloakDescription || '');
        }
      } else if (res.status === 404) {
        // Not configured - this is fine
        setForwarding({ enabled: false });
      } else {
        const data = await res.json();
        // Check if it's just "not configured" vs actual error
        if (data.error?.toLowerCase().includes('not found') ||
            data.error?.toLowerCase().includes('not enabled') ||
            data.error?.toLowerCase().includes('no forwarding')) {
          setForwarding({ enabled: false });
        } else {
          setError(data.error || 'Failed to load URL forwarding');
        }
      }
    } catch (err) {
      setError('Connection error');
    }
    setLoading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!forwardUrl.trim()) {
      toast.error('Please enter a URL to forward to');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/domains/${domainId}/url-forwarding`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          forwardUrl: forwardUrl.trim(),
          forwardType,
          cloak,
          cloakTitle: cloak ? cloakTitle : undefined,
          cloakDescription: cloak ? cloakDescription : undefined
        })
      });

      if (res.ok) {
        toast.success('URL forwarding saved');
        fetchForwarding();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save URL forwarding');
      }
    } catch (err) {
      toast.error('Connection error');
    }
    setSaving(false);
  };

  const handleDisable = async () => {
    if (!window.confirm('Are you sure you want to disable URL forwarding?')) return;

    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/domains/${domainId}/url-forwarding`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('URL forwarding disabled');
        setForwardUrl('');
        setForwardType('temporary');
        setCloak(false);
        setCloakTitle('');
        setCloakDescription('');
        fetchForwarding();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to disable URL forwarding');
      }
    } catch (err) {
      toast.error('Connection error');
    }
    setDeleting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Block URL forwarding when using custom nameservers
  if (!isUsingEnomNS) {
    return (
      <div className="space-y-4">
        <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-base font-semibold text-amber-800 dark:text-amber-300">Custom Nameservers Detected</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-2">
                URL forwarding is only available when using eNom's default nameservers.
                Your domain is currently using custom nameservers:
              </p>
              <ul className="mt-2 space-y-1">
                {nameservers.map((ns, idx) => (
                  <li key={idx} className="text-sm font-mono text-amber-800 dark:text-amber-300 pl-4">
                    {ns}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-3">
                To use URL forwarding, restore the default eNom nameservers below. Otherwise,
                configure redirects at your current DNS provider.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-700">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              <strong>eNom Default Nameservers:</strong>
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {DEFAULT_NAMESERVERS.map((ns, idx) => (
                <span key={idx} className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-mono text-sm">
                  {ns}
                </span>
              ))}
            </div>
            <button
              onClick={handleRestoreDefaultNS}
              disabled={restoringNS}
              className="btn-primary"
            >
              {restoringNS ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restore Default Nameservers
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 dark:text-blue-400">
          Redirect visitors from <span className="font-mono">{domainName}.{tld}</span> to another website.
          Useful for redirecting to your main site or a landing page.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Current Status */}
      {forwarding?.enabled && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              URL Forwarding is Active
            </span>
          </div>
          <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1 font-mono">
            {domainName}.{tld} → {forwarding.forwardUrl}
          </p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Forward To URL
          </label>
          <input
            type="url"
            value={forwardUrl}
            onChange={(e) => setForwardUrl(e.target.value)}
            placeholder="https://www.example.com"
            className="input w-full font-mono"
          />
          <p className="text-xs text-slate-500 mt-1">
            Enter the full URL including https://
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Redirect Type
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="forwardType"
                value="temporary"
                checked={forwardType === 'temporary'}
                onChange={(e) => setForwardType(e.target.value)}
                className="text-indigo-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Temporary (302)
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="forwardType"
                value="permanent"
                checked={forwardType === 'permanent'}
                onChange={(e) => setForwardType(e.target.value)}
                className="text-indigo-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Permanent (301)
              </span>
            </label>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Use permanent for SEO benefits if this is a long-term redirect
          </p>
        </div>

        {/* Cloaking Option */}
        <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cloak}
              onChange={(e) => setCloak(e.target.checked)}
              className="rounded text-indigo-600"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Enable URL Cloaking (Masking)
            </span>
          </label>
          <p className="text-xs text-slate-500">
            Cloaking keeps your domain in the browser's address bar while displaying the target site's content.
          </p>

          {cloak && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Page Title
                </label>
                <input
                  type="text"
                  value={cloakTitle}
                  onChange={(e) => setCloakTitle(e.target.value)}
                  placeholder={domainName}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Meta Description
                </label>
                <textarea
                  value={cloakDescription}
                  onChange={(e) => setCloakDescription(e.target.value)}
                  placeholder="Description for search engines"
                  rows={2}
                  className="input w-full"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Forwarding
              </>
            )}
          </button>

          {forwarding?.enabled && (
            <button
              type="button"
              onClick={handleDisable}
              disabled={deleting}
              className="btn-secondary text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default UrlForwardingPanel;
