import React, { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Loader2, ChevronLeft, ChevronRight, Filter, Calendar, User, Activity, Eye, X, Download, Clock } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import { toast } from 'react-hot-toast';

function AdminAuditLogs() {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filter options
  const [actions, setActions] = useState([]);
  const [entityTypes, setEntityTypes] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  // Detail view
  const [selectedLog, setSelectedLog] = useState(null);

  // Activity summary
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50 });
      if (search) params.append('search', search);
      if (action) params.append('action', action);
      if (entityType) params.append('entity_type', entityType);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const res = await fetch(`${API_URL}/admin/audit-logs?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      }
    } catch (err) {
      toast.error('Failed to load audit logs');
    }
    setLoading(false);
  }, [token, page, search, action, entityType, startDate, endDate]);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const [actionsRes, typesRes] = await Promise.all([
        fetch(`${API_URL}/admin/audit-logs/actions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/admin/audit-logs/entity-types`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (actionsRes.ok) setActions(await actionsRes.json());
      if (typesRes.ok) setEntityTypes(await typesRes.json());
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  }, [token]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/activity/summary?days=7`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSummary(await res.json());
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
    setSummaryLoading(false);
  }, [token]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchFilterOptions();
    fetchSummary();
  }, [fetchFilterOptions, fetchSummary]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const clearFilters = () => {
    setSearch('');
    setAction('');
    setEntityType('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const exportLogs = async () => {
    try {
      const params = new URLSearchParams({ limit: 10000 });
      if (search) params.append('search', search);
      if (action) params.append('action', action);
      if (entityType) params.append('entity_type', entityType);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const res = await fetch(`${API_URL}/admin/audit-logs?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const csv = [
          ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'IP Address', 'User Agent'].join(','),
          ...data.logs.map(log => [
            new Date(log.created_at).toISOString(),
            log.username || '',
            log.action,
            log.entity_type || '',
            log.entity_id || '',
            log.ip_address || '',
            `"${(log.user_agent || '').replace(/"/g, '""')}"`
          ].join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Audit logs exported');
      }
    } catch (err) {
      toast.error('Failed to export logs');
    }
  };

  const formatAction = (action) => {
    return action
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  const getActionColor = (action) => {
    if (action.includes('delete') || action.includes('remove')) {
      return 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400';
    }
    if (action.includes('create') || action.includes('add') || action.includes('register')) {
      return 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400';
    }
    if (action.includes('update') || action.includes('edit') || action.includes('change')) {
      return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400';
    }
    if (action.includes('login') || action.includes('logout') || action.includes('auth')) {
      return 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400';
    }
    return 'text-slate-600 bg-slate-50 dark:bg-slate-700 dark:text-slate-300';
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{total.toLocaleString()}</p>
              <p className="text-xs text-slate-500">Total Entries</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Clock className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {summary?.byDay?.reduce((sum, d) => sum + parseInt(d.count), 0) || 0}
              </p>
              <p className="text-xs text-slate-500">Last 7 Days</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {summary?.topUsers?.length || 0}
              </p>
              <p className="text-xs text-slate-500">Active Users</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <Filter className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{actions.length}</p>
              <p className="text-xs text-slate-500">Action Types</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by username or action..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary ${showFilters ? 'bg-primary-100 dark:bg-primary-900/30' : ''}`}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </button>
          <button
            type="button"
            onClick={exportLogs}
            className="btn-secondary"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
          <button
            type="button"
            onClick={() => { fetchLogs(); fetchSummary(); }}
            className="btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </form>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Action</label>
              <select
                value={action}
                onChange={(e) => { setAction(e.target.value); setPage(1); }}
                className="input w-full"
              >
                <option value="">All Actions</option>
                {actions.map(a => (
                  <option key={a.action} value={a.action}>{formatAction(a.action)} ({a.count})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Entity Type</label>
              <select
                value={entityType}
                onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
                className="input w-full"
              >
                <option value="">All Types</option>
                {entityTypes.map(t => (
                  <option key={t.entity_type} value={t.entity_type}>{t.entity_type} ({t.count})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                className="input w-full"
              />
            </div>
            <div className="md:col-span-4 flex justify-end">
              <button
                onClick={clearFilters}
                className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Clear all filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Logs Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">IP Address</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center text-slate-500">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{log.username || 'System'}</p>
                        <p className="text-xs text-slate-500">{log.email || ''}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                        {formatAction(log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {log.entity_type && (
                        <span>
                          {log.entity_type}
                          {log.entity_id && <span className="text-slate-400"> #{log.entity_id}</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-500">
                      {log.ip_address || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, total)} of {total.toLocaleString()} entries
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-2 text-sm text-slate-600 dark:text-slate-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Audit Log Details</h3>
                <p className="text-sm text-slate-500">{new Date(selectedLog.created_at).toLocaleString()}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">User</label>
                  <p className="text-slate-900 dark:text-slate-100">{selectedLog.username || 'System'}</p>
                  {selectedLog.email && <p className="text-sm text-slate-500">{selectedLog.email}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">Action</label>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(selectedLog.action)}`}>
                    {formatAction(selectedLog.action)}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">Entity</label>
                  <p className="text-slate-900 dark:text-slate-100">
                    {selectedLog.entity_type || '-'}
                    {selectedLog.entity_id && ` #${selectedLog.entity_id}`}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">IP Address</label>
                  <p className="font-mono text-slate-900 dark:text-slate-100">{selectedLog.ip_address || '-'}</p>
                </div>
              </div>

              {selectedLog.user_agent && (
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">User Agent</label>
                  <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg break-all">
                    {selectedLog.user_agent}
                  </p>
                </div>
              )}

              {selectedLog.old_values && (
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">Previous Values</label>
                  <pre className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.old_values, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_values && (
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">New Values</label>
                  <pre className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.new_values, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminAuditLogs;
