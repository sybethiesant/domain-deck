import React, { useState, useEffect } from 'react';
import { Server, Loader2, AlertCircle, Plus, Trash2, Save, RefreshCw, Info, RotateCcw } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT'];

// eNom default nameservers (required for DNS hosting to work)
const DEFAULT_NAMESERVERS = [
  'dns1.name-services.com',
  'dns2.name-services.com',
  'dns3.name-services.com',
  'dns4.name-services.com'
];

function DnsManagementPanel({ domainId, domainName, tld, nameservers, isAdmin = false, onNameserversUpdated }) {
  const { token } = useAuth();
  // Use admin routes if isAdmin is true
  const basePath = isAdmin ? `${API_URL}/admin/domains` : `${API_URL}/domains`;
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [restoringNS, setRestoringNS] = useState(false);
  const [forwardingActive, setForwardingActive] = useState(false);
  const [forwardingUrl, setForwardingUrl] = useState(null);

  // New record form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRecord, setNewRecord] = useState({
    hostName: '',
    recordType: 'A',
    address: '',
    mxPref: 10
  });

  // Check if using eNom nameservers (required for DNS management)
  const isUsingEnomNS = React.useMemo(() => {
    if (!nameservers || nameservers.length === 0) {
      // No nameservers set yet - allow DNS management (new domain)
      return true;
    }
    // Check if using eNom's nameservers (name-services.com)
    const nsLowerList = nameservers.map(ns => ns.toLowerCase().trim());
    return nsLowerList.some(ns =>
      ns.includes('name-services') ||
      ns.includes('enom') ||
      ns.includes('registrar-servers')
    );
  }, [nameservers]);

  useEffect(() => {
    // Only fetch records if using eNom nameservers
    if (isUsingEnomNS) {
      fetchRecords();
      fetchForwardingStatus();
    } else {
      setLoading(false);
    }
  }, [domainId, isUsingEnomNS]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchForwardingStatus = async () => {
    try {
      const res = await fetch(`${basePath}/${domainId}/url-forwarding`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setForwardingActive(data.enabled || false);
        setForwardingUrl(data.forwardUrl || null);
      }
    } catch (err) {
      // Silently fail - forwarding status is not critical
    }
  };

  const handleRestoreDefaultNS = async () => {
    if (!window.confirm(`This will change nameservers to eNom's default (dns1.name-services.com, dns2.name-services.com). This is required for DNS management. Continue?`)) {
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
        // Notify parent to refresh domain data
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

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/${domainId}/dns`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        // Filter out URL/URL301/Frame records (those are managed in Forwarding tab)
        const dnsRecords = (data.records || []).filter(r =>
          !['URL', 'URL301', 'Frame'].includes(r.recordType)
        );
        setRecords(dnsRecords);
      } else if (res.status === 404) {
        setRecords([]);
      } else {
        const data = await res.json();
        if (data.error?.toLowerCase().includes('not found') ||
            data.error?.toLowerCase().includes('no records')) {
          setRecords([]);
        } else {
          setError(data.error || 'Failed to load DNS records');
        }
      }
    } catch (err) {
      setError('Connection error');
    }
    setLoading(false);
  };

  const handleAddRecord = async (e) => {
    e.preventDefault();

    if (!newRecord.address.trim()) {
      toast.error('Please enter a value for the record');
      return;
    }

    // Validate based on record type
    if (newRecord.recordType === 'A') {
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4Regex.test(newRecord.address)) {
        toast.error('Please enter a valid IPv4 address');
        return;
      }
    } else if (newRecord.recordType === 'AAAA') {
      // Basic IPv6 check
      if (!newRecord.address.includes(':')) {
        toast.error('Please enter a valid IPv6 address');
        return;
      }
    } else if (newRecord.recordType === 'MX' || newRecord.recordType === 'CNAME') {
      // Should be a hostname
      if (!newRecord.address.includes('.') && newRecord.address !== '@') {
        toast.error('Please enter a valid hostname');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`${basePath}/${domainId}/dns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          hostName: newRecord.hostName.trim() || '@',
          recordType: newRecord.recordType,
          address: newRecord.address.trim(),
          mxPref: newRecord.recordType === 'MX' ? parseInt(newRecord.mxPref) : undefined
        })
      });

      if (res.ok) {
        toast.success('DNS record added');
        setNewRecord({ hostName: '', recordType: 'A', address: '', mxPref: 10 });
        setShowAddForm(false);
        fetchRecords();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to add DNS record');
      }
    } catch (err) {
      toast.error('Connection error');
    }
    setSaving(false);
  };

  const handleDeleteRecord = async (index) => {
    if (!window.confirm('Are you sure you want to delete this DNS record?')) return;

    setDeleting(index);
    try {
      const res = await fetch(`${basePath}/${domainId}/dns/${index}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('DNS record deleted');
        fetchRecords();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete DNS record');
      }
    } catch (err) {
      toast.error('Connection error');
    }
    setDeleting(null);
  };

  const getRecordTypeDescription = (type) => {
    switch (type) {
      case 'A': return 'Points to an IPv4 address';
      case 'AAAA': return 'Points to an IPv6 address';
      case 'CNAME': return 'Alias to another hostname';
      case 'MX': return 'Mail server for receiving email';
      case 'TXT': return 'Text record (SPF, DKIM, verification)';
      default: return '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Block DNS management when using custom nameservers
  if (!isUsingEnomNS) {
    return (
      <div className="space-y-4">
        <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-base font-semibold text-amber-800 dark:text-amber-300">Custom Nameservers Detected</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-2">
                DNS management is only available when using eNom's default nameservers.
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
                To manage DNS records here, restore the default eNom nameservers below. Otherwise,
                you'll need to manage DNS at your current DNS provider.
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
          Manage DNS records for <span className="font-mono">{domainName}.{tld}</span>.
          Changes typically propagate within 15 minutes but may take up to 24 hours globally.
        </p>
      </div>

      {/* URL Forwarding Active Notice */}
      {forwardingActive && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
          <Info className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              URL Forwarding is Active
            </p>
            <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1">
              The root A record for <span className="font-mono">{domainName}.{tld}</span> is managed automatically
              and points to the forwarding server. Forwarding to: <span className="font-mono">{forwardingUrl}</span>
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Records List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Server className="w-4 h-4" />
            DNS Records ({records.length})
          </h4>
          <div className="flex gap-2">
            <button
              onClick={fetchRecords}
              className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="p-6 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-center">
            <Server className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No DNS records configured
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Host</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Value</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Priority</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {records.map((record, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-3 py-2 font-mono text-slate-900 dark:text-slate-100">
                      {record.hostName === '@' ? `${domainName}.${tld}` : `${record.hostName}.${domainName}.${tld}`}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                        record.recordType === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        record.recordType === 'AAAA' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                        record.recordType === 'CNAME' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        record.recordType === 'MX' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        record.recordType === 'TXT' ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {record.recordType}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={record.address}>
                      {record.address}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
                      {record.recordType === 'MX' ? record.mxPref : '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDeleteRecord(idx)}
                        disabled={deleting === idx}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete record"
                      >
                        {deleting === idx ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Record Button / Form */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          <Plus className="w-4 h-4" />
          Add DNS Record
        </button>
      ) : (
        <form onSubmit={handleAddRecord} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl space-y-4">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add New Record</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Host Name
              </label>
              <input
                type="text"
                value={newRecord.hostName}
                onChange={(e) => setNewRecord(prev => ({ ...prev, hostName: e.target.value }))}
                placeholder="@ for root, or subdomain"
                className="input w-full font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">
                Leave blank or use @ for {domainName}.{tld}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Record Type
              </label>
              <select
                value={newRecord.recordType}
                onChange={(e) => setNewRecord(prev => ({ ...prev, recordType: e.target.value }))}
                className="input w-full"
              >
                {RECORD_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                {getRecordTypeDescription(newRecord.recordType)}
              </p>
            </div>

            <div className={newRecord.recordType === 'MX' ? 'sm:col-span-1' : 'sm:col-span-2'}>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Value
              </label>
              <input
                type="text"
                value={newRecord.address}
                onChange={(e) => setNewRecord(prev => ({ ...prev, address: e.target.value }))}
                placeholder={
                  newRecord.recordType === 'A' ? '192.0.2.1' :
                  newRecord.recordType === 'AAAA' ? '2001:db8::1' :
                  newRecord.recordType === 'CNAME' ? 'target.example.com' :
                  newRecord.recordType === 'MX' ? 'mail.example.com' :
                  'v=spf1 include:_spf.google.com ~all'
                }
                className="input w-full font-mono"
              />
            </div>

            {newRecord.recordType === 'MX' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Priority
                </label>
                <input
                  type="number"
                  min="0"
                  max="65535"
                  value={newRecord.mxPref}
                  onChange={(e) => setNewRecord(prev => ({ ...prev, mxPref: e.target.value }))}
                  className="input w-full"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Lower = higher priority
                </p>
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
                  Adding...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Add Record
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewRecord({ hostName: '', recordType: 'A', address: '', mxPref: 10 });
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default DnsManagementPanel;
