import React, { useState, useEffect, useCallback } from 'react';
import { Globe, RefreshCw, Settings, AlertTriangle, Check, Clock, Loader2, X, Server, Shield, Lock, Unlock, Key, ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth, useCart } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';

function Dashboard() {
  const { token } = useAuth();
  const { addToCart } = useCart();
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDomain, setExpandedDomain] = useState(null);
  const [managementData, setManagementData] = useState({});
  const [savingNS, setSavingNS] = useState(false);
  const [nsInputs, setNsInputs] = useState(['', '', '', '']);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(null);
  const [togglingPrivacy, setTogglingPrivacy] = useState(null);
  const [togglingLock, setTogglingLock] = useState(null);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/domains`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setDomains(data);
      } else {
        setError('Failed to load domains');
      }
    } catch (err) {
      setError('Connection error');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const fetchDomainDetails = async (domain) => {
    try {
      const [sld, tld] = domain.domain_name.split('.');

      // Fetch nameservers
      const nsRes = await fetch(`${API_URL}/domains/${domain.id}/nameservers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const nsData = nsRes.ok ? await nsRes.json() : { nameservers: [] };

      setManagementData(prev => ({
        ...prev,
        [domain.id]: {
          ...prev[domain.id],
          nameservers: nsData.nameservers || [],
          loading: false
        }
      }));

      // Initialize NS inputs
      const ns = nsData.nameservers || [];
      setNsInputs([ns[0] || '', ns[1] || '', ns[2] || '', ns[3] || '']);

    } catch (err) {
      console.error('Error fetching domain details:', err);
    }
  };

  const toggleExpand = (domain) => {
    if (expandedDomain === domain.id) {
      setExpandedDomain(null);
    } else {
      setExpandedDomain(domain.id);
      if (!managementData[domain.id]) {
        setManagementData(prev => ({
          ...prev,
          [domain.id]: { loading: true }
        }));
        fetchDomainDetails(domain);
      } else {
        const ns = managementData[domain.id]?.nameservers || [];
        setNsInputs([ns[0] || '', ns[1] || '', ns[2] || '', ns[3] || '']);
      }
    }
  };

  const handleSaveNameservers = async (domain) => {
    setSavingNS(true);
    try {
      const nameservers = nsInputs.filter(ns => ns.trim());

      if (nameservers.length < 2) {
        toast.error('At least 2 nameservers required');
        setSavingNS(false);
        return;
      }

      const res = await fetch(`${API_URL}/domains/${domain.id}/nameservers`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nameservers })
      });

      if (res.ok) {
        toast.success('Nameservers updated');
        setManagementData(prev => ({
          ...prev,
          [domain.id]: { ...prev[domain.id], nameservers }
        }));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update nameservers');
      }
    } catch (err) {
      toast.error("Connection error");
    }
    setSavingNS(false);
  };

  const handleToggleAutoRenew = async (domain) => {
    if (togglingAutoRenew === domain.id) return; // Prevent double-click
    setTogglingAutoRenew(domain.id);
    try {
      const newValue = !domain.auto_renew;
      const res = await fetch(`${API_URL}/domains/${domain.id}/autorenew`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ auto_renew: newValue })
      });

      if (res.ok) {
        toast.success(`Auto-renew ${newValue ? 'enabled' : 'disabled'}`);
        setDomains(prev => prev.map(d =>
          d.id === domain.id ? { ...d, auto_renew: newValue } : d
        ));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
      }
    } catch (err) {
      toast.error("Connection error");
    } finally {
      setTogglingAutoRenew(null);
    }
  };

  const handleTogglePrivacy = async (domain) => {
    if (togglingPrivacy === domain.id) return; // Prevent double-click
    setTogglingPrivacy(domain.id);
    try {
      const newValue = !domain.privacy_enabled;
      const res = await fetch(`${API_URL}/domains/${domain.id}/privacy`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ privacy: newValue })
      });

      if (res.ok) {
        toast.success(`WHOIS privacy ${newValue ? 'enabled' : 'disabled'}`);
        setDomains(prev => prev.map(d =>
          d.id === domain.id ? { ...d, privacy_enabled: newValue } : d
        ));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
      }
    } catch (err) {
      toast.error("Connection error");
    } finally {
      setTogglingPrivacy(null);
    }
  };

  const handleAddRenewalToCart = (domain) => {
    const [sld, tld] = domain.domain_name.split('.');
    addToCart({
      item_type: 'renew',
      domain_name: sld,
      tld: tld,
      years: 1,
      options: {}
    });
    toast.success('Renewal added to cart');
  };

  const handleToggleLock = async (domain) => {
    if (togglingLock === domain.id) return; // Prevent double-click
    setTogglingLock(domain.id);
    try {
      const newValue = !domain.lock_status;
      const res = await fetch(`${API_URL}/domains/${domain.id}/lock`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ locked: newValue })
      });

      if (res.ok) {
        toast.success(`Domain ${newValue ? 'locked' : 'unlocked'}`);
        setDomains(prev => prev.map(d =>
          d.id === domain.id ? { ...d, lock_status: newValue } : d
        ));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update lock status');
      }
    } catch (err) {
      toast.error("Connection error");
    } finally {
      setTogglingLock(null);
    }
  };

  const handleGetAuthCode = async (domain) => {
    try {
      const res = await fetch(`${API_URL}/domains/${domain.id}/authcode`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setManagementData(prev => ({
          ...prev,
          [domain.id]: { ...prev[domain.id], authCode: data.authCode }
        }));
        // Also update lock status since getting auth code unlocks domain
        setDomains(prev => prev.map(d =>
          d.id === domain.id ? { ...d, lock_status: false } : d
        ));
        toast.success('Auth code retrieved. Domain has been unlocked.');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to get auth code');
      }
    } catch (err) {
      toast.error("Connection error");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium rounded-full">
            <Check className="w-3 h-3" />
            Active
          </span>
        );
      case 'pending':
      case 'transfer_pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded-full">
            <Clock className="w-3 h-3" />
            {status === 'transfer_pending' ? 'Transfer Pending' : 'Pending'}
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium rounded-full">
            <AlertTriangle className="w-3 h-3" />
            Expired
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium rounded-full">
            {status}
          </span>
        );
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDaysUntilExpiry = (expirationDate) => {
    if (!expirationDate) return null;
    const days = Math.ceil((new Date(expirationDate) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            My Domains
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Manage your registered domains
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchDomains(); }}
          className="btn-secondary"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {domains.length === 0 ? (
        <div className="card p-12 text-center">
          <Globe className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            No Domains Yet
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Register your first domain to get started
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {domains.map((domain) => {
            const daysUntil = getDaysUntilExpiry(domain.expiration_date);
            const isExpiringSoon = daysUntil !== null && daysUntil <= 30 && daysUntil > 0;
            const isExpanded = expandedDomain === domain.id;
            const details = managementData[domain.id];

            return (
              <div key={domain.id} className="card overflow-hidden">
                {/* Main Row */}
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => toggleExpand(domain)}
                >
                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                      <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {domain.domain_name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        {getStatusBadge(domain.status)}
                        {domain.privacy_enabled && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> Privacy
                          </span>
                        )}
                        {domain.lock_status && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Locked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        Expires: {formatDate(domain.expiration_date)}
                      </p>
                      {isExpiringSoon && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {daysUntil} days remaining
                        </p>
                      )}
                    </div>
                    <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Management Panel */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6">
                    {details?.loading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Nameservers */}
                        <div>
                          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                            <Server className="w-4 h-4" />
                            Nameservers
                          </h4>
                          <div className="space-y-2">
                            {nsInputs.map((ns, idx) => (
                              <input
                                key={idx}
                                type="text"
                                value={ns}
                                onChange={(e) => {
                                  const newNs = [...nsInputs];
                                  newNs[idx] = e.target.value;
                                  setNsInputs(newNs);
                                }}
                                placeholder={`NS${idx + 1} (e.g., ns${idx + 1}.example.com)`}
                                className="input text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ))}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSaveNameservers(domain); }}
                            disabled={savingNS}
                            className="btn-primary mt-3 text-sm py-2"
                          >
                            {savingNS ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Nameservers'}
                          </button>
                        </div>

                        {/* Quick Actions */}
                        <div>
                          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                            <Settings className="w-4 h-4" />
                            Settings
                          </h4>
                          <div className="space-y-3">
                            {/* Auto-Renew Toggle */}
                            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <RefreshCw className="w-4 h-4 text-slate-500" />
                                <span className="text-sm text-slate-700 dark:text-slate-300">Auto-Renew</span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleAutoRenew(domain); }}
                                className={`relative w-11 h-6 rounded-full transition-colors ${
                                  domain.auto_renew ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                              >
                                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                  domain.auto_renew ? 'left-6' : 'left-1'
                                }`} />
                              </button>
                            </div>

                            {/* Privacy Toggle */}
                            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-slate-500" />
                                <span className="text-sm text-slate-700 dark:text-slate-300">WHOIS Privacy</span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleTogglePrivacy(domain); }}
                                className={`relative w-11 h-6 rounded-full transition-colors ${
                                  domain.privacy_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                              >
                                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                  domain.privacy_enabled ? 'left-6' : 'left-1'
                                }`} />
                              </button>
                            </div>

                            {/* Domain Lock Toggle */}
                            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                              <div className="flex items-center gap-2">
                                {domain.lock_status ? (
                                  <Lock className="w-4 h-4 text-slate-500" />
                                ) : (
                                  <Unlock className="w-4 h-4 text-slate-500" />
                                )}
                                <span className="text-sm text-slate-700 dark:text-slate-300">Transfer Lock</span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleLock(domain); }}
                                className={`relative w-11 h-6 rounded-full transition-colors ${
                                  domain.lock_status ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                              >
                                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                  domain.lock_status ? 'left-6' : 'left-1'
                                }`} />
                              </button>
                            </div>

                            {/* Auth Code / Transfer Out */}
                            <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Key className="w-4 h-4 text-slate-500" />
                                  <span className="text-sm text-slate-700 dark:text-slate-300">Auth Code (EPP)</span>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleGetAuthCode(domain); }}
                                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  Get Code
                                </button>
                              </div>
                              {details?.authCode && (
                                <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-800 rounded font-mono text-sm text-slate-900 dark:text-slate-100 break-all">
                                  {details.authCode}
                                </div>
                              )}
                            </div>

                            {/* Renew Button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddRenewalToCart(domain); }}
                              className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-lg border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
                            >
                              <ShoppingCart className="w-4 h-4" />
                              <span className="text-sm font-medium">Renew Domain</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
