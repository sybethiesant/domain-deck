import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe, Search, RefreshCw, Loader2, Download, ChevronLeft, ChevronRight,
  Check, X, Shield, Lock, Unlock, Edit2, Eye, Calendar, User, Server,
  AlertTriangle, Clock, Filter, MoreVertical, Trash2, Key, ExternalLink,
  Save, Users, ArrowRight, Plus, Contact, Database
} from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';
import DomainContactsPanel from '../dashboard/DomainContactsPanel';
import DnsManagementPanel from '../dashboard/DnsManagementPanel';

// Status badge component
const StatusBadge = ({ status }) => {
  const styles = {
    active: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    suspended: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
    transfer: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
};

// Toggle switch component
const ToggleSwitch = ({ enabled, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!enabled)}
    disabled={disabled}
    className={`relative w-12 h-6 rounded-full transition-colors ${
      enabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow ${
      enabled ? 'left-7' : 'left-1'
    }`} />
  </button>
);

// Domain detail/edit modal - exported for use in other admin components
// isAdmin prop controls whether editing features are shown (default true for backwards compatibility)
export function DomainDetailModal({ domain, onClose, onSave, onRefresh, token, isAdmin = true }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [details, setDetails] = useState(null);
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({});
  const [activeSection, setActiveSection] = useState('details');

  // Nameserver editing state
  const [nameservers, setNameservers] = useState(['', '', '', '']);
  const [editingNameservers, setEditingNameservers] = useState(false);
  const [savingNameservers, setSavingNameservers] = useState(false);

  // Privacy toggle state
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);
  const [showPrivacyConfirm, setShowPrivacyConfirm] = useState(false);

  // Fetch domain details and users
  useEffect(() => {
    async function fetchData() {
      try {
        const [detailsRes, usersRes] = await Promise.all([
          fetch(`${API_URL}/admin/domains/${domain.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${API_URL}/admin/users?limit=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (detailsRes.ok) {
          const data = await detailsRes.json();
          setDetails(data);
          setFormData({
            user_id: data.user_id,
            status: data.status,
            auto_renew: data.auto_renew,
            privacy_enabled: data.privacy_enabled
          });
          // Parse and set nameservers
          if (data.nameservers) {
            const ns = typeof data.nameservers === 'string'
              ? JSON.parse(data.nameservers)
              : data.nameservers;
            setNameservers([...ns, '', '', '', ''].slice(0, 4));
          }
        }

        if (usersRes.ok) {
          const data = await usersRes.json();
          setUsers(data.users || []);
        }
      } catch (err) {
        console.error('Error fetching domain details:', err);
        toast.error('Failed to load domain details');
      }
      setLoading(false);
    }
    fetchData();
  }, [domain.id, token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/domains/${domain.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success('Domain updated');
        onSave();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update');
      }
    } catch (err) {
      toast.error('Failed to update');
    }
    setSaving(false);
  };

  // Push domain to another user (admin - immediate, no acceptance needed)
  const handlePushDomain = async () => {
    if (!formData.user_id || formData.user_id === details?.user_id) {
      toast.error('Please select a different user');
      return;
    }

    const targetUser = users.find(u => u.id === formData.user_id);
    if (!targetUser) {
      toast.error('User not found');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/domains/${domain.id}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          to_email: targetUser.email,
          notes: 'Admin transfer'
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message || 'Domain transferred');
        onSave();
      } else {
        toast.error(data.error || 'Failed to transfer');
      }
    } catch (err) {
      toast.error('Failed to transfer');
    }
    setSaving(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/admin/domains/${domain.id}/sync`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setDetails(prev => ({ ...prev, ...data.domain }));
        toast.success('Domain synced from eNom');
        if (onRefresh) onRefresh();
      } else {
        toast.error('Failed to sync');
      }
    } catch (err) {
      toast.error('Failed to sync');
    }
    setSyncing(false);
  };

  const handleGetAuthCode = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/domains/${domain.id}/auth-code`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Auth Code: ${data.authCode}`, { duration: 10000 });
      } else {
        toast.error('Failed to get auth code');
      }
    } catch (err) {
      toast.error('Failed to get auth code');
    }
  };

  const handleToggleLock = async (lock) => {
    try {
      const res = await fetch(`${API_URL}/admin/domains/${domain.id}/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ lock })
      });

      if (res.ok) {
        setDetails(prev => ({ ...prev, lock_status: lock }));
        toast.success(`Domain ${lock ? 'locked' : 'unlocked'}`);
        if (onRefresh) onRefresh();
      } else {
        toast.error('Failed to update lock');
      }
    } catch (err) {
      toast.error('Failed to update lock');
    }
  };

  // Save nameservers (admin endpoint - no user ownership check)
  const handleSaveNameservers = async () => {
    const validNs = nameservers.filter(ns => ns.trim());
    if (validNs.length < 2) {
      toast.error('At least 2 nameservers are required');
      return;
    }

    setSavingNameservers(true);
    try {
      const res = await fetch(`${API_URL}/admin/domains/${domain.id}/nameservers`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nameservers: validNs })
      });

      if (res.ok) {
        const data = await res.json();
        setDetails(prev => ({ ...prev, nameservers: JSON.stringify(data.nameservers) }));
        setEditingNameservers(false);
        toast.success('Nameservers updated');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update nameservers');
      }
    } catch (err) {
      toast.error('Failed to update nameservers');
    }
    setSavingNameservers(false);
  };

  // Toggle privacy (admin endpoint - bypasses payment check)
  // When enabling, show confirmation since it costs money but won't bill customer
  const handleTogglePrivacy = async (enable) => {
    // If enabling and not already enabled, show confirmation first
    if (enable && !details?.privacy_enabled) {
      setShowPrivacyConfirm(true);
      return;
    }
    await executePrivacyToggle(enable);
  };

  const executePrivacyToggle = async (enable) => {
    setShowPrivacyConfirm(false);
    setTogglingPrivacy(true);
    try {
      const res = await fetch(`${API_URL}/admin/domains/${domain.id}/privacy`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ enabled: enable, adminOverride: true })
      });

      if (res.ok) {
        const data = await res.json();
        setDetails(prev => ({ ...prev, privacy_enabled: enable }));
        setFormData(prev => ({ ...prev, privacy_enabled: enable }));
        if (data.purchased) {
          toast.success('ID Protect purchased and enabled - charged to reseller account');
        } else if (data.costIncurred) {
          toast.success('WHOIS Privacy enabled - charged to reseller account');
        } else {
          toast.success(`WHOIS Privacy ${enable ? 'enabled' : 'disabled'}`);
        }
        // Refresh the domain list in the background (without closing modal)
        if (onRefresh) onRefresh();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update privacy');
      }
    } catch (err) {
      toast.error('Failed to update privacy');
    }
    setTogglingPrivacy(false);
  };

  // Toggle auto-renew (admin endpoint)
  const handleToggleAutoRenew = async (enable) => {
    try {
      const res = await fetch(`${API_URL}/admin/domains/${domain.id}/autorenew`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ auto_renew: enable })
      });

      if (res.ok) {
        setDetails(prev => ({ ...prev, auto_renew: enable }));
        setFormData(prev => ({ ...prev, auto_renew: enable }));
        toast.success(`Auto-renew ${enable ? 'enabled' : 'disabled'}`);
        if (onRefresh) onRefresh();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update auto-renew');
      }
    } catch (err) {
      toast.error('Failed to update auto-renew');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
          <p className="mt-4 text-slate-500">Loading domain details...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-600 to-purple-600">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-lg font-bold text-white">{domain.domain_name}.{domain.tld}</h2>
              <p className="text-sm text-white/70">Domain Management</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {[
            { id: 'details', label: 'Details', icon: Eye },
            { id: 'nameservers', label: 'Nameservers', icon: Server },
            { id: 'dns', label: 'DNS', icon: Database },
            { id: 'settings', label: 'Settings', icon: Edit2 },
            { id: 'contacts', label: 'Contacts', icon: Contact },
            { id: 'transfer', label: 'Transfer', icon: Users },
            { id: 'history', label: 'History', icon: Clock }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeSection === tab.id
                  ? 'bg-slate-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === 'details' && details && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Status</p>
                  <StatusBadge status={details.status} />
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Expires</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {details.expiration_date ? new Date(details.expiration_date).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Auto-Renew</p>
                  <div className="flex items-center gap-2">
                    {details.auto_renew ? (
                      <><Check className="w-4 h-4 text-green-500" /><span className="text-green-600">Enabled</span></>
                    ) : (
                      <><X className="w-4 h-4 text-slate-400" /><span className="text-slate-500">Disabled</span></>
                    )}
                  </div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Privacy</p>
                  <div className="flex items-center gap-2">
                    {details.privacy_enabled ? (
                      <><Shield className="w-4 h-4 text-green-500" /><span className="text-green-600">Protected</span></>
                    ) : (
                      <><Shield className="w-4 h-4 text-slate-400" /><span className="text-slate-500">Exposed</span></>
                    )}
                  </div>
                </div>
              </div>

              {/* Owner Info */}
              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" /> Owner
                </h4>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Username</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{details.username || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Email</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{details.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Full Name</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{details.full_name || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Nameservers */}
              {details.nameservers && (
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                    <Server className="w-4 h-4" /> Nameservers
                  </h4>
                  <div className="grid md:grid-cols-2 gap-2">
                    {(typeof details.nameservers === 'string' ? JSON.parse(details.nameservers) : details.nameservers).map((ns, i) => (
                      <div key={i} className="px-3 py-2 bg-white dark:bg-slate-800 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300">
                        {ns}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions - Admin only */}
              {isAdmin && (
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleSync} disabled={syncing} className="btn-secondary text-sm">
                    {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Sync from eNom
                  </button>
                  <button onClick={handleGetAuthCode} className="btn-secondary text-sm">
                    <Key className="w-4 h-4 mr-2" />
                    Get Auth Code
                  </button>
                  <button
                    onClick={() => handleToggleLock(!details.lock_status)}
                    className="btn-secondary text-sm"
                  >
                    {details.lock_status ? (
                      <><Unlock className="w-4 h-4 mr-2" />Unlock Domain</>
                    ) : (
                      <><Lock className="w-4 h-4 mr-2" />Lock Domain</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Nameservers Tab */}
          {activeSection === 'nameservers' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Server className="w-5 h-5 text-indigo-600" />
                  Nameservers
                </h3>
                {!editingNameservers && isAdmin && (
                  <button
                    onClick={() => setEditingNameservers(true)}
                    className="btn-secondary text-sm"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit Nameservers
                  </button>
                )}
              </div>

              {editingNameservers ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Enter at least 2 nameservers. Changes will be applied to eNom immediately.
                  </p>
                  <div className="space-y-3">
                    {nameservers.map((ns, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <span className="text-sm text-slate-500 w-8">NS{index + 1}</span>
                        <input
                          type="text"
                          value={ns}
                          onChange={(e) => {
                            const newNs = [...nameservers];
                            newNs[index] = e.target.value.toLowerCase();
                            setNameservers(newNs);
                          }}
                          placeholder={`ns${index + 1}.example.com`}
                          className="input flex-1 font-mono text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setEditingNameservers(false)}
                      className="btn-secondary flex-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNameservers}
                      disabled={savingNameservers}
                      className="btn-primary flex-1"
                    >
                      {savingNameservers ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                      ) : (
                        <><Save className="w-4 h-4 mr-2" />Save Nameservers</>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {details?.nameservers ? (
                    (typeof details.nameservers === 'string' ? JSON.parse(details.nameservers) : details.nameservers).map((ns, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <span className="text-sm text-slate-500 dark:text-slate-400 w-8">NS{i + 1}</span>
                        <span className="font-mono text-sm text-slate-900 dark:text-slate-100">{ns}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                      No nameservers configured
                    </p>
                  )}
                </div>
              )}

              {/* Quick NS presets */}
              {editingNameservers && (
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                  <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400 mb-3">
                    Common Nameserver Presets
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: 'Cloudflare', ns: ['amy.ns.cloudflare.com', 'ben.ns.cloudflare.com'] },
                      { name: 'Google', ns: ['ns-cloud-a1.googledomains.com', 'ns-cloud-a2.googledomains.com'] },
                      { name: 'Vercel', ns: ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'] }
                    ].map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => setNameservers([...preset.ns, '', ''].slice(0, 4))}
                        className="px-3 py-1.5 text-sm bg-white dark:bg-slate-800 rounded-lg border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DNS Tab */}
          {activeSection === 'dns' && (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <p className="text-sm text-indigo-700 dark:text-indigo-300">
                  <strong>Admin Access:</strong> You can view and edit DNS records for this domain.
                  Changes are applied directly to eNom.
                </p>
              </div>
              <DnsManagementPanel
                domainId={domain.id}
                domainName={domain.domain_name}
                tld={domain.tld}
                nameservers={details?.nameservers ?
                  (typeof details.nameservers === 'string' ? JSON.parse(details.nameservers) : details.nameservers)
                  : []
                }
                isAdmin={isAdmin}
                onNameserversUpdated={(newNs) => {
                  // Update local state when nameservers are restored via DNS panel
                  setDetails(prev => ({ ...prev, nameservers: newNs }));
                  setNameservers([...newNs, '', '', '', ''].slice(0, 4));
                }}
              />
            </div>
          )}

          {activeSection === 'settings' && (
            <div className="space-y-6">
              {!isAdmin && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    <strong>View Only:</strong> You don't have permission to edit domain settings.
                  </p>
                </div>
              )}
              <div className="grid gap-6">
                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Domain Status (Database Only)
                  </label>
                  <select
                    value={formData.status || ''}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="input w-full"
                    disabled={!isAdmin}
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                    <option value="suspended">Suspended</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    This updates the database status. Use Sync to get actual status from eNom.
                  </p>
                </div>

                {/* Auto-Renew Toggle */}
                <div className={`flex items-center justify-between p-4 rounded-xl ${
                  details?.auto_renew_payment_method_id
                    ? 'bg-slate-50 dark:bg-slate-700/50'
                    : 'bg-slate-100 dark:bg-slate-800/50'
                }`}>
                  <div>
                    <h4 className={`font-medium ${
                      details?.auto_renew_payment_method_id
                        ? 'text-slate-900 dark:text-slate-100'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}>Auto-Renew</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      System will automatically charge and renew domain before expiration
                    </p>
                    {!details?.auto_renew_payment_method_id && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        No payment method saved for this domain
                      </p>
                    )}
                  </div>
                  <ToggleSwitch
                    enabled={details?.auto_renew}
                    onChange={handleToggleAutoRenew}
                    disabled={!isAdmin || !details?.auto_renew_payment_method_id}
                  />
                </div>

                {/* Privacy Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <div>
                    <h4 className="font-medium text-slate-900 dark:text-slate-100">WHOIS Privacy</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Hide registrant information in WHOIS lookup
                    </p>
                    {!details?.privacy_enabled && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Enabling will charge reseller account (not billed to customer)
                      </p>
                    )}
                  </div>
                  <ToggleSwitch
                    enabled={details?.privacy_enabled}
                    onChange={handleTogglePrivacy}
                    disabled={!isAdmin || togglingPrivacy}
                  />
                </div>

                {/* Lock Status */}
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <div>
                    <h4 className="font-medium text-slate-900 dark:text-slate-100">Transfer Lock</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Prevent unauthorized domain transfers
                    </p>
                  </div>
                  <ToggleSwitch
                    enabled={details?.lock_status}
                    onChange={(lock) => handleToggleLock(lock)}
                    disabled={!isAdmin}
                  />
                </div>
              </div>

              {isAdmin && (
                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Status Change
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Contacts Tab */}
          {activeSection === 'contacts' && (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <p className="text-sm text-indigo-700 dark:text-indigo-300">
                  <strong>Admin Access:</strong> You can view and edit WHOIS contacts for this domain.
                  Changes are applied directly to eNom.
                </p>
              </div>
              <DomainContactsPanel domainId={domain.id} domainName={`${domain.domain_name}.${domain.tld}`} adminMode={true} ownerUserId={details?.user_id} />
            </div>
          )}

          {activeSection === 'transfer' && (
            <div className="space-y-6">
              {!isAdmin ? (
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    <strong>View Only:</strong> Admin access required to transfer domains.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-800 dark:text-amber-300">Transfer Domain Ownership</h4>
                      <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                        This will transfer the domain to another user's account. The new owner will have full control over the domain.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Current Owner
                </label>
                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{details?.username || 'Unknown'}</p>
                  <p className="text-sm text-slate-500">{details?.email || '-'}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Transfer To
                </label>
                <select
                  value={formData.user_id || ''}
                  onChange={(e) => setFormData({ ...formData, user_id: parseInt(e.target.value) })}
                  className="input w-full"
                  disabled={!isAdmin}
                >
                  <option value="">Select a user...</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.username} ({user.email})
                    </option>
                  ))}
                </select>
              </div>

              {formData.user_id && formData.user_id !== details?.user_id && (
                <div className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                  <div className="flex-1">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {details?.username || 'Current Owner'}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-indigo-600" />
                  <div className="flex-1 text-right">
                    <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                      {users.find(u => u.id === formData.user_id)?.username || 'New Owner'}
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={handlePushDomain}
                disabled={!isAdmin || saving || !formData.user_id || formData.user_id === details?.user_id}
                className="btn-primary w-full"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
                Transfer Domain (Immediate)
              </button>

              {isAdmin && (
                <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-2">
                  Admin transfers are immediate and don't require acceptance.
                </p>
              )}
            </div>
          )}

          {activeSection === 'history' && details && (
            <div className="space-y-4">
              <h4 className="font-medium text-slate-900 dark:text-slate-100">Order History</h4>
              {details.orderHistory?.length > 0 ? (
                <div className="space-y-3">
                  {details.orderHistory.map((order, i) => (
                    <div key={i} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {order.order_number}
                          </span>
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                            order.order_status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {order.order_status}
                          </span>
                        </div>
                        <span className="text-sm text-slate-500">
                          {new Date(order.order_date).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {order.item_type} - {order.years} year(s) - ${parseFloat(order.total_price).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400 text-center py-8">No order history found</p>
              )}

              {details.notes?.length > 0 && (
                <>
                  <h4 className="font-medium text-slate-900 dark:text-slate-100 mt-6">Staff Notes</h4>
                  <div className="space-y-3">
                    {details.notes.map((note, i) => (
                      <div key={i} className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border-l-4 border-yellow-400">
                        <p className="text-slate-700 dark:text-slate-300">{note.content}</p>
                        <p className="text-xs text-slate-500 mt-2">
                          {note.staff_username} - {new Date(note.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Privacy Enable Confirmation Dialog */}
      {showPrivacyConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Purchase & Enable WHOIS Privacy
              </h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-2">
              This will purchase ID Protect from eNom and enable WHOIS privacy for this domain.
            </p>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>Cost Notice:</strong> The ID Protect service fee will be charged to the reseller account at eNom.
                The customer will not be invoiced for this purchase.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPrivacyConfirm(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => executePrivacyToggle(true)}
                disabled={togglingPrivacy}
                className="btn-primary flex-1"
              >
                {togglingPrivacy ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Purchasing...</>
                ) : (
                  'Purchase & Enable'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Role level constants (mirror backend)
const ROLE_LEVELS = {
  CUSTOMER: 0,
  SUPPORT: 1,
  SALES: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4
};

// Main AdminDomains component
export default function AdminDomains() {
  const { token, user } = useAuth();
  const isAdmin = (user?.role_level || 0) >= ROLE_LEVELS.ADMIN || user?.is_admin;
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expiringFilter, setExpiringFilter] = useState('');
  const [tldFilter, setTldFilter] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [availableTlds, setAvailableTlds] = useState([]);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 25 });
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (expiringFilter) params.append('expiring', expiringFilter);
      if (tldFilter) params.append('tld', tldFilter);

      const res = await fetch(`${API_URL}/admin/domains?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setDomains(data.domains || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);

        // Extract unique TLDs for filter
        const tlds = [...new Set(data.domains.map(d => d.tld))].filter(Boolean);
        setAvailableTlds(prev => [...new Set([...prev, ...tlds])]);
      }
    } catch (err) {
      toast.error('Failed to load domains');
    }
    setLoading(false);
  }, [token, page, search, statusFilter, expiringFilter, tldFilter]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/admin/sync-enom`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Synced ${data.imported || 0} domains from eNom${data.errors?.length > 0 ? `, ${data.errors.length} failed` : ''}`);
        fetchDomains();
      } else {
        toast.error('Sync failed');
      }
    } catch (err) {
      toast.error('Sync failed');
    }
    setSyncing(false);
  };

  const daysUntilExpiry = (date) => {
    if (!date) return null;
    const days = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getExpiryClass = (date) => {
    const days = daysUntilExpiry(date);
    if (days === null) return '';
    if (days < 0) return 'text-red-600 dark:text-red-400 font-semibold';
    if (days <= 7) return 'text-red-600 dark:text-red-400';
    if (days <= 30) return 'text-amber-600 dark:text-amber-400';
    return 'text-slate-600 dark:text-slate-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Domain Management</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {total} total domains
          </p>
        </div>
        <div className="flex gap-3">
          {isAdmin && (
            <button onClick={handleSyncAll} disabled={syncing} className="btn-primary">
              {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Sync All from eNom
            </button>
          )}
          <button onClick={fetchDomains} disabled={loading} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search domains or owners..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input pl-10 w-full"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input w-40"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
          </select>

          {/* Expiring Filter */}
          <select
            value={expiringFilter}
            onChange={(e) => { setExpiringFilter(e.target.value); setPage(1); }}
            className="input w-44"
          >
            <option value="">All Dates</option>
            <option value="7">Expiring in 7 days</option>
            <option value="true">Expiring in 30 days</option>
            <option value="90">Expiring in 90 days</option>
            <option value="expired">Already Expired</option>
          </select>

          {/* TLD Filter */}
          <select
            value={tldFilter}
            onChange={(e) => { setTldFilter(e.target.value); setPage(1); }}
            className="input w-32"
          >
            <option value="">All TLDs</option>
            {availableTlds.sort().map(tld => (
              <option key={tld} value={tld}>.{tld}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Domains Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Domain</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Expires</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Renew</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Privacy</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Lock</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
                    <p className="mt-2 text-slate-500">Loading domains...</p>
                  </td>
                </tr>
              ) : domains.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-12 text-center text-slate-500">
                    No domains found
                  </td>
                </tr>
              ) : (
                domains.map((domain) => {
                  const days = daysUntilExpiry(domain.expiration_date);
                  return (
                    <tr
                      key={domain.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedDomain(domain)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Globe className="w-5 h-5 text-slate-400" />
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{domain.domain_name}</p>
                            <p className="text-xs text-slate-500">.{domain.tld}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700 dark:text-slate-300">{domain.username || 'Unassigned'}</p>
                        <p className="text-xs text-slate-500">{domain.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={domain.status} />
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            domain.enom_mode === 'production'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {domain.enom_mode === 'production' ? 'PROD' : 'TEST'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className={getExpiryClass(domain.expiration_date)}>
                          {domain.expiration_date ? new Date(domain.expiration_date).toLocaleDateString() : '-'}
                        </p>
                        {days !== null && days <= 30 && (
                          <p className="text-xs text-slate-500">
                            {days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {domain.auto_renew && domain.auto_renew_payment_method_id ? (
                          <Check className="w-5 h-5 text-green-500 mx-auto" title="Auto-renew enabled with payment method" />
                        ) : domain.auto_renew && !domain.auto_renew_payment_method_id ? (
                          <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" title="Auto-renew enabled but no payment method" />
                        ) : (
                          <X className="w-5 h-5 text-slate-300 mx-auto" title="Auto-renew disabled" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {domain.privacy_enabled ? (
                          <Shield className="w-5 h-5 text-green-500 mx-auto" />
                        ) : (
                          <Shield className="w-5 h-5 text-slate-300 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {domain.lock_status ? (
                          <Lock className="w-5 h-5 text-amber-500 mx-auto" />
                        ) : (
                          <Unlock className="w-5 h-5 text-slate-300 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedDomain(domain); }}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Page {page} of {totalPages} ({total} domains)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Domain Detail Modal */}
      {selectedDomain && (
        <DomainDetailModal
          domain={selectedDomain}
          onClose={() => setSelectedDomain(null)}
          onSave={() => { setSelectedDomain(null); fetchDomains(); }}
          onRefresh={fetchDomains}
          token={token}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
