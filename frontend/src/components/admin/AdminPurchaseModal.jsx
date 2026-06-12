import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Search, AlertCircle, Check, DollarSign } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';

/**
 * Admin Purchase Modal
 * Lets an admin register/transfer/renew a domain on behalf of a user.
 * Costs are charged to the eNom reseller balance (auto-refilled if needed).
 * No Stripe charge. Creates an order with payment_status='admin_credit'.
 */
export default function AdminPurchaseModal({ onClose, onSuccess }) {
  const { token } = useAuth();

  const [action, setAction] = useState('register'); // register | transfer | renew

  // Common
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [tlds, setTlds] = useState([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Register / Transfer fields
  const [userId, setUserId] = useState('');
  const [sld, setSld] = useState('');
  const [tld, setTld] = useState('');
  const [years, setYears] = useState(1);
  const [privacy, setPrivacy] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [contacts, setContacts] = useState([]);
  const [contactId, setContactId] = useState(''); // '' = use user's default
  const [availability, setAvailability] = useState(null);
  const [checkingAvail, setCheckingAvail] = useState(false);

  // Renew fields
  const [domainsList, setDomainsList] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [domainSearch, setDomainSearch] = useState('');
  const [domainId, setDomainId] = useState('');

  // Cost preview
  const [costPreview, setCostPreview] = useState(null);

  // Initial fetch: users + tlds
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setUsersLoading(true);
      try {
        const [usersRes, pricingRes] = await Promise.all([
          fetch(`${API_URL}/admin/users?limit=500`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/admin/pricing`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        if (cancelled) return;
        if (usersRes.ok) {
          const data = await usersRes.json();
          setUsers(data.users || data || []);
        }
        if (pricingRes.ok) {
          const data = await pricingRes.json();
          const list = (data.pricing || data || []).filter(p => p.is_active);
          setTlds(list);
        }
      } catch (e) {
        toast.error('Failed to load users or TLDs');
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // When user is selected, load their saved contacts
  useEffect(() => {
    if (!userId || action === 'renew') {
      setContacts([]);
      setContactId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/admin/users/${userId}/contacts`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setContacts(data.contacts || data || []);
        } else {
          setContacts([]);
        }
      } catch {
        setContacts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, action, token]);

  // For renew: fetch a list of domains (filtered)
  useEffect(() => {
    if (action !== 'renew') return;
    let cancelled = false;
    (async () => {
      setDomainsLoading(true);
      try {
        const params = new URLSearchParams({ limit: 100 });
        if (domainSearch) params.append('search', domainSearch);
        const res = await fetch(`${API_URL}/admin/domains?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setDomainsList(data.domains || []);
        }
      } finally {
        if (!cancelled) setDomainsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [action, domainSearch, token]);

  // Update cost preview when fields change
  useEffect(() => {
    if (action === 'renew') {
      const d = domainsList.find(x => String(x.id) === String(domainId));
      if (!d) { setCostPreview(null); return; }
      const t = tlds.find(x => x.tld === d.tld);
      if (!t) { setCostPreview(null); return; }
      setCostPreview({ unit: parseFloat(t.cost_renew), total: parseFloat(t.cost_renew) * years });
    } else {
      const t = tlds.find(x => x.tld === tld);
      if (!t) { setCostPreview(null); return; }
      const unit = action === 'register' ? parseFloat(t.cost_register) : parseFloat(t.cost_transfer);
      setCostPreview({ unit, total: unit * (action === 'transfer' ? 1 : years) });
    }
  }, [action, tld, years, tlds, domainId, domainsList]);

  // Reset availability when domain changes
  useEffect(() => { setAvailability(null); }, [sld, tld]);

  const handleCheckAvail = async () => {
    if (!sld || !tld) { toast.error('Enter SLD and TLD first'); return; }
    setCheckingAvail(true);
    setAvailability(null);
    try {
      const res = await fetch(`${API_URL}/domains/check/${sld}.${tld}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setAvailability(data);
    } catch {
      toast.error('Availability check failed');
    } finally {
      setCheckingAvail(false);
    }
  };

  const handleSubmit = async () => {
    // Validate
    if (action === 'renew') {
      if (!domainId) return toast.error('Pick a domain to renew');
    } else {
      if (!userId) return toast.error('Pick a target user');
      if (!sld || !tld) return toast.error('Enter domain and TLD');
      if (action === 'transfer' && !authCode.trim()) {
        return toast.error('Auth code is required for transfers (registry requirement)');
      }
    }

    const body = { action, reason: reason || undefined };
    if (action === 'renew') {
      body.domain_id = parseInt(domainId);
      body.years = parseInt(years) || 1;
    } else {
      body.user_id = parseInt(userId);
      body.sld = sld.trim().toLowerCase();
      body.tld = tld.toLowerCase();
      body.years = parseInt(years) || 1;
      if (contactId) body.registrant_contact_id = parseInt(contactId);
      if (action === 'register') body.privacy = !!privacy;
      if (action === 'transfer') body.auth_code = authCode.trim();
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/domains/admin-purchase`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || `${action} failed`);
        return;
      }
      let msg = data.message || `${action} succeeded`;
      if (data.refill) msg += ` (auto-refilled $${data.refill.requestedAmount})`;
      toast.success(msg);
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error(`Network error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedUser = users.find(u => String(u.id) === String(userId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Admin Purchase</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Charged to eNom balance. No Stripe payment.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Action selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Action</label>
            <div className="grid grid-cols-3 gap-2">
              {['register', 'transfer', 'renew'].map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAction(a)}
                  className={`px-3 py-2 rounded text-sm font-medium border ${
                    action === a
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* RENEW: domain picker */}
          {action === 'renew' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Domain to renew</label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by domain or owner..."
                  value={domainSearch}
                  onChange={e => setDomainSearch(e.target.value)}
                  className="input pl-10 w-full"
                />
              </div>
              <select
                value={domainId}
                onChange={e => setDomainId(e.target.value)}
                className="input w-full"
                disabled={domainsLoading}
              >
                <option value="">— Select a domain —</option>
                {domainsList.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.domain_name}.{d.tld} {d.username ? `(${d.username})` : ''} {d.expiration_date ? `— exp ${new Date(d.expiration_date).toLocaleDateString()}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* REGISTER / TRANSFER: target user */}
          {action !== 'renew' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Credit to user</label>
              <select
                value={userId}
                onChange={e => setUserId(e.target.value)}
                className="input w-full"
                disabled={usersLoading}
              >
                <option value="">— Select user —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.username || u.email} {u.username && u.email ? `<${u.email}>` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* REGISTER / TRANSFER: domain inputs */}
          {action !== 'renew' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Domain</label>
                <input
                  type="text"
                  placeholder="example"
                  value={sld}
                  onChange={e => setSld(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">TLD</label>
                <select value={tld} onChange={e => setTld(e.target.value)} className="input w-full">
                  <option value="">— TLD —</option>
                  {tlds.map(t => (
                    <option key={t.tld} value={t.tld}>.{t.tld}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* REGISTER: availability check */}
          {action === 'register' && sld && tld && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCheckAvail}
                disabled={checkingAvail}
                className="btn-secondary text-sm"
              >
                {checkingAvail ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check availability'}
              </button>
              {availability && (
                <span className={`text-sm flex items-center gap-1 ${availability.available ? 'text-green-600' : 'text-red-600'}`}>
                  {availability.available ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {availability.available
                    ? `${sld}.${tld} is available${availability.premium ? ' (PREMIUM)' : ''}`
                    : `${sld}.${tld} is not available`}
                </span>
              )}
            </div>
          )}

          {/* Years (and privacy for register) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Years</label>
              <input
                type="number"
                min={1}
                max={10}
                value={years}
                onChange={e => setYears(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                className="input w-full"
                disabled={action === 'transfer'}
              />
              {action === 'transfer' && (
                <p className="text-xs text-slate-500 mt-1">Transfers add 1 year automatically</p>
              )}
            </div>
            {action === 'register' && (
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={privacy} onChange={e => setPrivacy(e.target.checked)} />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Enable WHOIS Privacy</span>
                </label>
              </div>
            )}
          </div>

          {/* TRANSFER: auth code */}
          {action === 'transfer' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Auth code (EPP) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={authCode}
                onChange={e => setAuthCode(e.target.value)}
                placeholder="Required by the registry to authorize transfer"
                className="input w-full font-mono"
              />
            </div>
          )}

          {/* REGISTER / TRANSFER: registrant contact */}
          {action !== 'renew' && userId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Registrant contact</label>
              {contacts.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  This user has no saved contacts. The request will fail unless one is created first.
                </p>
              ) : (
                <select value={contactId} onChange={e => setContactId(e.target.value)} className="input w-full">
                  <option value="">Use user's default contact</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name} &lt;{c.email}&gt;{c.is_default ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Reason / note (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g., Goodwill credit, support ticket #123"
              className="input w-full"
            />
          </div>

          {/* Cost preview */}
          {costPreview && (
            <div className="rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                eNom cost
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                ${costPreview.total.toFixed(2)}
                <span className="text-xs text-slate-500 ml-1">
                  (${costPreview.unit.toFixed(2)} × {action === 'transfer' ? 1 : years})
                </span>
              </span>
            </div>
          )}

          {selectedUser && action !== 'renew' && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Domain will be credited to <strong>{selectedUser.email}</strong>.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="btn-secondary" disabled={submitting}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || (action === 'register' && availability && !availability.available)}
            className="btn-primary"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {submitting ? 'Processing...' : `Confirm ${action.charAt(0).toUpperCase() + action.slice(1)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
