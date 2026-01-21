import React, { useState, useEffect, useCallback } from 'react';
import { Globe, RefreshCw, Settings, AlertTriangle, Check, Clock, Loader2, X, Server, Shield, Lock, Unlock, Key, ShoppingCart, Users, Search, ChevronLeft, ChevronRight, Eye, CreditCard, Trash2, Plus, Mail, ExternalLink } from 'lucide-react';
import { useAuth, useCart } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';
import DomainContactsPanel from './DomainContactsPanel';
import PrivacyPurchaseModal from './PrivacyPurchaseModal';
import AutoRenewSetupModal from './AutoRenewSetupModal';
import EmailForwardingPanel from './EmailForwardingPanel';
import UrlForwardingPanel from './UrlForwardingPanel';

function Dashboard() {
  const { token } = useAuth();
  const { addToCart } = useCart();

  // Domain list state
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expiringFilter, setExpiringFilter] = useState('');

  // Selected domain modal
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [activeTab, setActiveTab] = useState('details');

  // Domain management state
  const [managementData, setManagementData] = useState({});
  const [nsInputs, setNsInputs] = useState(['', '', '', '']);
  const [savingNS, setSavingNS] = useState(false);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);
  const [togglingLock, setTogglingLock] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [privacyPurchaseDomain, setPrivacyPurchaseDomain] = useState(null);
  const [autoRenewSetupDomain, setAutoRenewSetupDomain] = useState(null);
  const [renewalYears, setRenewalYears] = useState(1);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });

      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (expiringFilter) params.append('expiring', expiringFilter);

      const res = await fetch(`${API_URL}/domains?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        // Handle both array response and paginated response
        if (Array.isArray(data)) {
          setDomains(data);
          setTotal(data.length);
          setTotalPages(1);
        } else {
          setDomains(data.domains || []);
          setTotal(data.total || data.domains?.length || 0);
          setTotalPages(data.totalPages || 1);
        }
      } else {
        setError('Failed to load domains');
      }
    } catch (err) {
      setError('Connection error');
    }
    setLoading(false);
  }, [token, page, search, statusFilter, expiringFilter]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const fetchDomainDetails = async (domain) => {
    try {
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

  const openDomainModal = (domain) => {
    setSelectedDomain(domain);
    setActiveTab('details');
    setShowContacts(false);

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
  };

  const handleSaveNameservers = async () => {
    if (!selectedDomain) return;
    setSavingNS(true);
    try {
      const nameservers = nsInputs.filter(ns => ns.trim());

      if (nameservers.length < 2) {
        toast.error('At least 2 nameservers required');
        setSavingNS(false);
        return;
      }

      const res = await fetch(`${API_URL}/domains/${selectedDomain.id}/nameservers`, {
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
          [selectedDomain.id]: { ...prev[selectedDomain.id], nameservers }
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

  const handleToggleAutoRenew = async () => {
    if (!selectedDomain || togglingAutoRenew) return;

    const newValue = !selectedDomain.auto_renew;

    // If turning ON, show setup modal to collect payment method
    if (newValue && !selectedDomain.auto_renew_payment_method_id) {
      setAutoRenewSetupDomain(selectedDomain);
      return;
    }

    setTogglingAutoRenew(true);
    try {
      const res = await fetch(`${API_URL}/domains/${selectedDomain.id}/autorenew`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ auto_renew: newValue })
      });

      if (res.ok) {
        toast.success(`Auto-renew ${newValue ? 'enabled' : 'disabled'}`);
        setSelectedDomain(prev => ({ ...prev, auto_renew: newValue }));
        setDomains(prev => prev.map(d =>
          d.id === selectedDomain.id ? { ...d, auto_renew: newValue } : d
        ));
      } else {
        const data = await res.json();
        // If payment method required, show the setup modal
        if (res.status === 402 && data.code === 'PAYMENT_METHOD_REQUIRED') {
          setAutoRenewSetupDomain(selectedDomain);
        } else {
          toast.error(data.error || 'Failed to update');
        }
      }
    } catch (err) {
      toast.error("Connection error");
    } finally {
      setTogglingAutoRenew(false);
    }
  };

  const handleAutoRenewSetupSuccess = (data) => {
    if (autoRenewSetupDomain) {
      // Update local state
      setSelectedDomain(prev =>
        prev?.id === autoRenewSetupDomain.id
          ? { ...prev, auto_renew: true, auto_renew_payment_method_id: data.paymentMethod?.id }
          : prev
      );
      setDomains(prev => prev.map(d =>
        d.id === autoRenewSetupDomain.id
          ? { ...d, auto_renew: true, auto_renew_payment_method_id: data.paymentMethod?.id }
          : d
      ));
      toast.success(`Auto-renew enabled for ${autoRenewSetupDomain.domain_name}.${autoRenewSetupDomain.tld}`);
    }
    setAutoRenewSetupDomain(null);
  };

  const handleTogglePrivacy = async () => {
    if (!selectedDomain || togglingPrivacy) return;

    const newValue = !selectedDomain.privacy_enabled;

    // If trying to enable privacy, check if payment is required
    if (newValue) {
      setTogglingPrivacy(true);
      try {
        const statusRes = await fetch(`${API_URL}/domains/${selectedDomain.id}/privacy`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (statusRes.ok) {
          const status = await statusRes.json();
          if (status.willCharge) {
            setTogglingPrivacy(false);
            setPrivacyPurchaseDomain(selectedDomain);
            return;
          }
        }
      } catch (err) {
        console.error('Error checking privacy status:', err);
      }
    }

    setTogglingPrivacy(true);
    try {
      const res = await fetch(`${API_URL}/domains/${selectedDomain.id}/privacy`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ privacy: newValue })
      });

      if (res.ok) {
        toast.success(`WHOIS privacy ${newValue ? 'enabled' : 'disabled'}`);
        setSelectedDomain(prev => ({ ...prev, privacy_enabled: newValue }));
        setDomains(prev => prev.map(d =>
          d.id === selectedDomain.id ? { ...d, privacy_enabled: newValue } : d
        ));
      } else {
        const data = await res.json();
        if (res.status === 402) {
          setPrivacyPurchaseDomain(selectedDomain);
        } else {
          toast.error(data.error || 'Failed to update');
        }
      }
    } catch (err) {
      toast.error("Connection error");
    } finally {
      setTogglingPrivacy(false);
    }
  };

  const handlePrivacyPurchaseSuccess = async () => {
    if (privacyPurchaseDomain) {
      // Update local state immediately for responsiveness
      setSelectedDomain(prev =>
        prev?.id === privacyPurchaseDomain.id ? { ...prev, privacy_enabled: true } : prev
      );
      setDomains(prev => prev.map(d =>
        d.id === privacyPurchaseDomain.id ? { ...d, privacy_enabled: true } : d
      ));
      // Refresh domain details from server to get accurate status
      await fetchDomainDetails(privacyPurchaseDomain);
    }
    setPrivacyPurchaseDomain(null);
  };

  const handleToggleLock = async () => {
    if (!selectedDomain || togglingLock) return;
    setTogglingLock(true);
    try {
      const newValue = !selectedDomain.lock_status;
      const res = await fetch(`${API_URL}/domains/${selectedDomain.id}/lock`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ locked: newValue })
      });

      if (res.ok) {
        toast.success(`Domain ${newValue ? 'locked' : 'unlocked'}`);
        setSelectedDomain(prev => ({ ...prev, lock_status: newValue }));
        setDomains(prev => prev.map(d =>
          d.id === selectedDomain.id ? { ...d, lock_status: newValue } : d
        ));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update lock status');
      }
    } catch (err) {
      toast.error("Connection error");
    } finally {
      setTogglingLock(false);
    }
  };

  const handleGetAuthCode = async () => {
    if (!selectedDomain) return;
    try {
      const res = await fetch(`${API_URL}/domains/${selectedDomain.id}/authcode`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setManagementData(prev => ({
          ...prev,
          [selectedDomain.id]: { ...prev[selectedDomain.id], authCode: data.authCode }
        }));
        // Also update lock status since getting auth code unlocks domain
        setSelectedDomain(prev => ({ ...prev, lock_status: false }));
        setDomains(prev => prev.map(d =>
          d.id === selectedDomain.id ? { ...d, lock_status: false } : d
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

  const handleAddRenewalToCart = () => {
    if (!selectedDomain) return;
    // domain_name is just the SLD, tld is in separate column
    addToCart({
      item_type: 'renew',
      domain_name: selectedDomain.domain_name,
      tld: selectedDomain.tld,
      years: renewalYears,
      options: {}
    });
    setRenewalYears(1); // Reset after adding
  };

  const StatusBadge = ({ status }) => {
    const styles = {
      active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      transfer_pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    };

    const icons = {
      active: <Check className="w-3 h-3" />,
      pending: <Clock className="w-3 h-3" />,
      transfer_pending: <Clock className="w-3 h-3" />,
      expired: <AlertTriangle className="w-3 h-3" />,
      suspended: <AlertTriangle className="w-3 h-3" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
        {icons[status]}
        {status === 'transfer_pending' ? 'Transfer Pending' : status?.charAt(0).toUpperCase() + status?.slice(1)}
      </span>
    );
  };

  const daysUntilExpiry = (date) => {
    if (!date) return null;
    const days = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const Pagination = () => (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
      <div className="text-sm text-slate-600 dark:text-slate-400">
        Showing {domains.length} of {total} domains
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-slate-600 dark:text-slate-400">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const ToggleSwitch = ({ enabled, onChange, loading: isLoading }) => (
    <button
      onClick={onChange}
      disabled={isLoading}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
      } ${isLoading ? 'opacity-50' : ''}`}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 absolute top-1 left-1 animate-spin text-white" />
      ) : (
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
          enabled ? 'left-6' : 'left-1'
        }`} />
      )}
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
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
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search domains..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input w-full sm:w-40"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
          </select>
          <select
            value={expiringFilter}
            onChange={(e) => { setExpiringFilter(e.target.value); setPage(1); }}
            className="input w-full sm:w-48"
          >
            <option value="">All Expiration</option>
            <option value="7">Expiring in 7 days</option>
            <option value="30">Expiring in 30 days</option>
            <option value="90">Expiring in 90 days</option>
            <option value="expired">Already Expired</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Domains Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : domains.length === 0 ? (
          <div className="text-center py-12">
            <Globe className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
              No Domains Found
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              {search || statusFilter || expiringFilter
                ? 'No domains match your filters'
                : 'Register your first domain to get started'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Domain</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Expires</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Auto-Renew</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Privacy</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Lock</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {domains.map((domain) => {
                    const days = daysUntilExpiry(domain.expiration_date);
                    const isExpiringSoon = days !== null && days <= 30 && days > 0;
                    const isExpired = days !== null && days <= 0;

                    return (
                      <tr key={domain.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                              <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                              {domain.domain_name}.{domain.tld}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={domain.status} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-slate-900 dark:text-slate-100">
                            {formatDate(domain.expiration_date)}
                          </div>
                          {isExpiringSoon && (
                            <div className="text-xs text-amber-600 dark:text-amber-400">
                              {days} days left
                            </div>
                          )}
                          {isExpired && (
                            <div className="text-xs text-red-600 dark:text-red-400">
                              Expired
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {domain.auto_renew ? (
                            <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-slate-400 mx-auto" />
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {domain.privacy_enabled ? (
                            <Shield className="w-5 h-5 text-emerald-500 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-slate-400 mx-auto" />
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {domain.lock_status ? (
                            <Lock className="w-5 h-5 text-emerald-500 mx-auto" />
                          ) : (
                            <Unlock className="w-5 h-5 text-slate-400 mx-auto" />
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            onClick={() => openDomainModal(domain)}
                            className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Manage Domain"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination />
          </>
        )}
      </div>

      {/* Domain Detail Modal */}
      {selectedDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-500 to-purple-600">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white font-mono">
                    {selectedDomain.domain_name}.{selectedDomain.tld}
                  </h2>
                  <p className="text-sm text-white/80">
                    Domain Management
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDomain(null)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
              {[
                { id: 'details', label: 'Details', icon: Globe },
                { id: 'nameservers', label: 'Nameservers', icon: Server },
                { id: 'forwarding', label: 'Forwarding', icon: ExternalLink },
                { id: 'settings', label: 'Settings', icon: Settings },
                { id: 'transfer', label: 'Transfer', icon: Key }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-12rem)]">
              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* Status Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Status</p>
                      <StatusBadge status={selectedDomain.status} />
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Expires</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatDate(selectedDomain.expiration_date)}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Auto-Renew</p>
                      <p className={`text-sm font-medium ${selectedDomain.auto_renew ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {selectedDomain.auto_renew ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Privacy</p>
                      <p className={`text-sm font-medium ${selectedDomain.privacy_enabled ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {selectedDomain.privacy_enabled ? 'Protected' : 'Public'}
                      </p>
                    </div>
                  </div>

                  {/* Nameservers Preview */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                      <Server className="w-4 h-4" />
                      Current Nameservers
                    </h4>
                    <div className="space-y-1">
                      {(managementData[selectedDomain.id]?.nameservers || []).length > 0 ? (
                        managementData[selectedDomain.id].nameservers.map((ns, idx) => (
                          <p key={idx} className="font-mono text-sm text-slate-600 dark:text-slate-400">
                            {ns}
                          </p>
                        ))
                      ) : managementData[selectedDomain.id]?.loading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      ) : (
                        <p className="text-sm text-slate-500">No nameservers configured</p>
                      )}
                    </div>
                  </div>

                  {/* WHOIS Contacts Section */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <button
                      onClick={() => setShowContacts(!showContacts)}
                      className="w-full flex items-center justify-between"
                    >
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        WHOIS Contacts
                      </h4>
                      {showContacts ? (
                        <ChevronLeft className="w-4 h-4 text-slate-400 rotate-90" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 rotate-90" />
                      )}
                    </button>
                    {showContacts && (
                      <div className="mt-4">
                        <DomainContactsPanel
                          domainId={selectedDomain.id}
                          domainName={selectedDomain.domain_name}
                        />
                      </div>
                    )}
                  </div>

                  {/* Renew Button */}
                  <div className="flex items-center gap-3">
                    <select
                      value={renewalYears}
                      onChange={(e) => setRenewalYears(parseInt(e.target.value))}
                      className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-3 text-sm font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(y => (
                        <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddRenewalToCart}
                      className="flex-1 flex items-center justify-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
                    >
                      <ShoppingCart className="w-5 h-5" />
                      <span className="font-medium">Add Renewal to Cart</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Nameservers Tab */}
              {activeTab === 'nameservers' && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      <strong>Note:</strong> Changes to nameservers may take up to 48 hours to propagate globally.
                      At least 2 nameservers are required, up to 13 allowed.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {nsInputs.map((ns, idx) => (
                      <div key={idx} className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Nameserver {idx + 1} {idx < 2 && <span className="text-red-500">*</span>}
                          </label>
                          <input
                            type="text"
                            value={ns}
                            onChange={(e) => {
                              const newNs = [...nsInputs];
                              newNs[idx] = e.target.value;
                              setNsInputs(newNs);
                            }}
                            placeholder={`ns${idx + 1}.example.com`}
                            className="input w-full font-mono"
                          />
                        </div>
                        {idx >= 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newNs = nsInputs.filter((_, i) => i !== idx);
                              setNsInputs(newNs);
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mb-0.5"
                            title="Remove nameserver"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {nsInputs.length < 13 && (
                    <button
                      type="button"
                      onClick={() => setNsInputs([...nsInputs, ''])}
                      className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Nameserver
                    </button>
                  )}

                  <button
                    onClick={handleSaveNameservers}
                    disabled={savingNS}
                    className="btn-primary w-full"
                  >
                    {savingNS ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Nameservers'
                    )}
                  </button>
                </div>
              )}

              {/* Forwarding Tab */}
              {activeTab === 'forwarding' && (
                <div className="space-y-6">
                  {/* Email Forwarding Section */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Email Forwarding
                    </h3>
                    <EmailForwardingPanel
                      domainId={selectedDomain.id}
                      domainName={selectedDomain.domain_name}
                      tld={selectedDomain.tld}
                      nameservers={managementData[selectedDomain.id]?.nameservers || []}
                    />
                  </div>

                  <hr className="border-slate-200 dark:border-slate-700" />

                  {/* URL Forwarding Section */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                      <ExternalLink className="w-4 h-4" />
                      URL Forwarding
                    </h3>
                    <UrlForwardingPanel
                      domainId={selectedDomain.id}
                      domainName={selectedDomain.domain_name}
                      tld={selectedDomain.tld}
                      nameservers={managementData[selectedDomain.id]?.nameservers || []}
                    />
                  </div>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="space-y-4">
                  {/* Auto-Renew */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 text-slate-500" />
                          <span className="font-medium text-slate-900 dark:text-slate-100">Auto-Renew</span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          Automatically renew this domain before expiration
                        </p>
                      </div>
                      <ToggleSwitch
                        enabled={selectedDomain.auto_renew}
                        onChange={handleToggleAutoRenew}
                        loading={togglingAutoRenew}
                      />
                    </div>
                    {/* Show payment method info if auto-renew enabled */}
                    {selectedDomain.auto_renew && selectedDomain.auto_renew_payment_method_id && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <CreditCard className="w-4 h-4" />
                            <span>Payment method saved for renewal</span>
                          </div>
                          <button
                            onClick={() => setAutoRenewSetupDomain(selectedDomain)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            Update card
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Prompt to set up payment if auto-renew but no payment method */}
                    {selectedDomain.auto_renew && !selectedDomain.auto_renew_payment_method_id && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                        <button
                          onClick={() => setAutoRenewSetupDomain(selectedDomain)}
                          className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          Add payment method for auto-renewal
                        </button>
                      </div>
                    )}
                  </div>

                  {/* WHOIS Privacy */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <div>
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-slate-500" />
                        <span className="font-medium text-slate-900 dark:text-slate-100">WHOIS Privacy</span>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Hide your personal information from public WHOIS lookups
                      </p>
                    </div>
                    <ToggleSwitch
                      enabled={selectedDomain.privacy_enabled}
                      onChange={handleTogglePrivacy}
                      loading={togglingPrivacy}
                    />
                  </div>

                  {/* Transfer Lock */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <div>
                      <div className="flex items-center gap-2">
                        {selectedDomain.lock_status ? (
                          <Lock className="w-4 h-4 text-slate-500" />
                        ) : (
                          <Unlock className="w-4 h-4 text-slate-500" />
                        )}
                        <span className="font-medium text-slate-900 dark:text-slate-100">Transfer Lock</span>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Prevent unauthorized domain transfers
                      </p>
                    </div>
                    <ToggleSwitch
                      enabled={selectedDomain.lock_status}
                      onChange={handleToggleLock}
                      loading={togglingLock}
                    />
                  </div>
                </div>
              )}

              {/* Transfer Tab */}
              {activeTab === 'transfer' && (
                <div className="space-y-6">
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-800 dark:text-amber-300">Transfer Out</h4>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                          To transfer this domain to another registrar, you'll need the EPP auth code below.
                          Getting the auth code will automatically unlock the domain.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Domain Status */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Transfer Lock Status</span>
                      <span className={`text-sm font-medium ${selectedDomain.lock_status ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {selectedDomain.lock_status ? 'Locked' : 'Unlocked'}
                      </span>
                    </div>

                    {/* Auth Code */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        EPP Auth Code
                      </label>
                      {managementData[selectedDomain.id]?.authCode ? (
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 font-mono text-sm break-all">
                          {managementData[selectedDomain.id].authCode}
                        </div>
                      ) : (
                        <button
                          onClick={handleGetAuthCode}
                          className="btn-secondary w-full"
                        >
                          <Key className="w-4 h-4 mr-2" />
                          Get Auth Code
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                    <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Transfer Steps</h4>
                    <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside">
                      <li>Get the EPP auth code above (domain will be unlocked)</li>
                      <li>Initiate a transfer at your new registrar</li>
                      <li>Provide the auth code when requested</li>
                      <li>Approve the transfer confirmation email</li>
                      <li>Transfer typically completes within 5-7 days</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Privacy Purchase Modal */}
      {privacyPurchaseDomain && (
        <PrivacyPurchaseModal
          domain={privacyPurchaseDomain}
          onClose={() => setPrivacyPurchaseDomain(null)}
          onSuccess={handlePrivacyPurchaseSuccess}
        />
      )}

      {/* Auto-Renew Setup Modal */}
      <AutoRenewSetupModal
        isOpen={!!autoRenewSetupDomain}
        onClose={() => setAutoRenewSetupDomain(null)}
        domain={autoRenewSetupDomain}
        onSuccess={handleAutoRenewSetupSuccess}
      />
    </div>
  );
}

export default Dashboard;
