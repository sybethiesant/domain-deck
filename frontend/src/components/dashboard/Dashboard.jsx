import React, { useState, useEffect } from 'react';
import { Globe, RefreshCw, Settings, AlertTriangle, Check, Clock, Loader2 } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';

function Dashboard() {
  const { token } = useAuth();
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
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
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-400 text-xs font-medium rounded-full">
            <Check className="w-3 h-3" />
            Active
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded-full">
            <Clock className="w-3 h-3" />
            Pending
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
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
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
          onClick={fetchDomains}
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
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Domain
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Auto-Renew
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {domains.map((domain) => {
                  const daysUntil = getDaysUntilExpiry(domain.expiration_date);
                  const isExpiringSoon = daysUntil !== null && daysUntil <= 30 && daysUntil > 0;

                  return (
                    <tr key={domain.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-6 py-4">
                        <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                          {domain.domain_name}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(domain.status)}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-slate-900 dark:text-slate-100">
                            {formatDate(domain.expiration_date)}
                          </p>
                          {isExpiringSoon && (
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
                              Expires in {daysUntil} days
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm ${domain.auto_renew ? 'text-accent-600 dark:text-accent-400' : 'text-slate-500'}`}>
                          {domain.auto_renew ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="btn-ghost py-1 px-3 text-sm">
                          <Settings className="w-4 h-4 mr-1" />
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
