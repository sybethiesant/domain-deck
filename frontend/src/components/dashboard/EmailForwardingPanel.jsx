import React, { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';

function EmailForwardingPanel({ domainId, domainName, tld }) {
  const { token } = useAuth();
  const [forwards, setForwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newEmailUser, setNewEmailUser] = useState('');
  const [newForwardTo, setNewForwardTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    fetchForwards();
  }, [domainId]);

  const fetchForwards = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/domains/${domainId}/email-forwarding`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setForwards(data.forwards || []);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to load email forwards');
      }
    } catch (err) {
      setError('Connection error');
    }
    setLoading(false);
  };

  const handleAddForward = async (e) => {
    e.preventDefault();
    if (!newEmailUser.trim() || !newForwardTo.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/domains/${domainId}/email-forwarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          emailUser: newEmailUser.trim(),
          forwardTo: newForwardTo.trim()
        })
      });

      if (res.ok) {
        toast.success('Email forward added');
        setNewEmailUser('');
        setNewForwardTo('');
        setAdding(false);
        fetchForwards();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to add email forward');
      }
    } catch (err) {
      toast.error('Connection error');
    }
    setSubmitting(false);
  };

  const handleDeleteForward = async (emailUser) => {
    setDeleting(emailUser);
    try {
      const res = await fetch(`${API_URL}/domains/${domainId}/email-forwarding/${encodeURIComponent(emailUser)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Email forward deleted');
        fetchForwards();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete email forward');
      }
    } catch (err) {
      toast.error('Connection error');
    }
    setDeleting(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          <strong>Email Forwarding</strong> allows you to create email addresses at your domain
          that forward to your existing email accounts.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Existing Forwards */}
      {forwards.length > 0 && (
        <div className="space-y-2">
          {forwards.map((forward) => (
            <div
              key={forward.emailUser}
              className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="font-mono text-sm text-slate-900 dark:text-slate-100 truncate">
                  {forward.emailAddress}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="font-mono text-sm text-slate-600 dark:text-slate-400 truncate">
                  {forward.forwardTo}
                </span>
              </div>
              <button
                onClick={() => handleDeleteForward(forward.emailUser)}
                disabled={deleting === forward.emailUser}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                title="Delete forward"
              >
                {deleting === forward.emailUser ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {forwards.length === 0 && !error && (
        <div className="text-center py-6 text-slate-500 dark:text-slate-400">
          <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No email forwards configured</p>
        </div>
      )}

      {/* Add New Forward */}
      {adding ? (
        <form onSubmit={handleAddForward} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={newEmailUser}
                  onChange={(e) => setNewEmailUser(e.target.value.replace(/[^a-zA-Z0-9._%+-]/g, ''))}
                  placeholder="info"
                  className="input rounded-r-none flex-1 font-mono"
                  required
                />
                <span className="inline-flex items-center px-3 bg-slate-200 dark:bg-slate-600 border border-l-0 border-slate-300 dark:border-slate-500 rounded-r-lg text-sm text-slate-600 dark:text-slate-300 font-mono">
                  @{domainName}.{tld}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Forward To
              </label>
              <input
                type="email"
                value={newForwardTo}
                onChange={(e) => setNewForwardTo(e.target.value)}
                placeholder="you@gmail.com"
                className="input w-full font-mono"
                required
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex-1"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Forward'
              )}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setNewEmailUser(''); setNewForwardTo(''); }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Email Forward
        </button>
      )}
    </div>
  );
}

export default EmailForwardingPanel;
