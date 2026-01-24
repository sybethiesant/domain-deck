import React, { useState, useEffect, useCallback } from 'react';
import { Users, Globe, ShoppingCart, DollarSign, TrendingUp, AlertTriangle, RefreshCw, Loader2, Search, ChevronLeft, ChevronRight, Edit2, Save, X, Eye, Check, Download, Wallet, CreditCard, Settings, History, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import { toast } from 'react-hot-toast';
import AdminDomains from './AdminDomains';
import AdminSettings from './AdminSettings';
import AdminUserDetail from './AdminUserDetail';
import AdminAuditLogs from './AdminAuditLogs';

// Role level constants (mirror backend)
const ROLE_LEVELS = {
  CUSTOMER: 0,
  SUPPORT: 1,
  SALES: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4
};

function AdminDashboard() {
  const { token, user } = useAuth();
  const userRoleLevel = user?.role_level || 0;
  const isAdmin = userRoleLevel >= ROLE_LEVELS.ADMIN || user?.is_admin;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [ordersFilter, setOrdersFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [domains, setDomains] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [domainsPage, setDomainsPage] = useState(1);
  const [domainsTotalPages, setDomainsTotalPages] = useState(1);
  const [domainsSearch, setDomainsSearch] = useState('');
  const [syncingDomains, setSyncingDomains] = useState(false);
  const [pricing, setPricing] = useState([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [editingPrice, setEditingPrice] = useState(null);
  const [syncingPrices, setSyncingPrices] = useState(false);
  const [newTld, setNewTld] = useState(null);

  // Balance management state
  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceSettings, setBalanceSettings] = useState(null);
  const [balanceTransactions, setBalanceTransactions] = useState([]);
  const [refillAmount, setRefillAmount] = useState('100.00');
  const [refilling, setRefilling] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(API_URL + '/admin/stats', { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) setStats(await res.json());
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({ page: usersPage, limit: 20 });
      if (usersSearch) params.append('search', usersSearch);
      const res = await fetch(API_URL + '/admin/users?' + params, { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) { const data = await res.json(); setUsers(data.users || []); setUsersTotalPages(data.totalPages || 1); }
    } catch (err) { toast.error('Failed to load users'); }
    setUsersLoading(false);
  }, [token, usersPage, usersSearch]);

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const params = new URLSearchParams({ page: ordersPage, limit: 20 });
      if (ordersFilter !== 'all') params.append('status', ordersFilter);
      const res = await fetch(API_URL + '/admin/orders?' + params, { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) { const data = await res.json(); setOrders(data.orders || []); setOrdersTotalPages(data.totalPages || 1); }
    } catch (err) { toast.error('Failed to load orders'); }
    setOrdersLoading(false);
  }, [token, ordersPage, ordersFilter]);

  const fetchOrderDetails = async (orderId) => {
    try {
      const res = await fetch(API_URL + '/admin/orders/' + orderId, { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) setSelectedOrder(await res.json());
    } catch (err) { toast.error('Failed'); }
  };

  const processRefund = async (orderId) => {
    if (!window.confirm('Refund this order?')) return;
    try {
      const res = await fetch(API_URL + '/admin/orders/' + orderId + '/refund', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) { toast.success('Refunded'); fetchOrders(); setSelectedOrder(null); }
      else { const err = await res.json(); toast.error(err.error || 'Failed'); }
    } catch (err) { toast.error('Failed'); }
  };

  const fetchDomains = useCallback(async () => {
    setDomainsLoading(true);
    try {
      const params = new URLSearchParams({ page: domainsPage, limit: 20 });
      if (domainsSearch) params.append('search', domainsSearch);
      const res = await fetch(API_URL + '/admin/domains?' + params, { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) { const data = await res.json(); setDomains(data.domains || []); setDomainsTotalPages(data.totalPages || 1); }
    } catch (err) { toast.error('Failed to load domains'); }
    setDomainsLoading(false);
  }, [token, domainsPage, domainsSearch]);

  const syncAllDomains = async () => {
    setSyncingDomains(true);
    try {
      const res = await fetch(API_URL + '/admin/sync-enom', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) { const data = await res.json(); toast.success('Synced ' + (data.imported || 0) + ' domains from eNom'); fetchDomains(); }
      else toast.error('Sync failed');
    } catch (err) { toast.error('Sync failed'); }
    setSyncingDomains(false);
  };

  const fetchPricing = useCallback(async () => {
    setPricingLoading(true);
    try {
      const res = await fetch(API_URL + '/admin/pricing', { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) setPricing(await res.json() || []);
    } catch (err) { toast.error('Failed to load pricing'); }
    setPricingLoading(false);
  }, [token]);

  const updatePricing = async (tld, priceData) => {
    try {
      const res = await fetch(API_URL + '/admin/pricing/' + tld, {
        method: 'PUT', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(priceData)
      });
      if (res.ok) { toast.success('Updated'); setEditingPrice(null); fetchPricing(); }
      else { const err = await res.json(); toast.error(err.error || 'Failed'); }
    } catch (err) { toast.error('Failed'); }
  };

  const addTldPricing = async (tldData) => {
    try {
      const res = await fetch(API_URL + '/admin/pricing', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(tldData)
      });
      if (res.ok) { toast.success('TLD added'); setNewTld(null); fetchPricing(); }
      else { const err = await res.json(); toast.error(err.error || 'Failed'); }
    } catch (err) { toast.error('Failed'); }
  };

  const syncPricingFromEnom = async () => {
    setSyncingPrices(true);
    try {
      const res = await fetch(API_URL + '/admin/enom/sync-pricing', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) { const data = await res.json(); toast.success('Synced ' + (data.synced || 0) + ' TLDs'); fetchPricing(); }
      else toast.error('Sync failed');
    } catch (err) { toast.error('Sync failed'); }
    setSyncingPrices(false);
  };

  // Balance management functions
  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const res = await fetch(API_URL + '/admin/balance', { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) {
        const data = await res.json();
        setBalance(data);
      }
    } catch (err) { toast.error('Failed to load balance'); }
    setBalanceLoading(false);
  }, [token]);

  const fetchBalanceSettings = useCallback(async () => {
    try {
      const res = await fetch(API_URL + '/admin/balance/settings', { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) setBalanceSettings(await res.json());
    } catch (err) { console.error(err); }
  }, [token]);

  const fetchBalanceTransactions = useCallback(async () => {
    try {
      const res = await fetch(API_URL + '/admin/balance/transactions?limit=50', { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) {
        const data = await res.json();
        setBalanceTransactions(data.transactions || []);
      }
    } catch (err) { console.error(err); }
  }, [token]);

  const refillBalance = async () => {
    const amount = parseFloat(refillAmount);
    if (isNaN(amount) || amount < 25) {
      toast.error('Minimum refill is $25.00');
      return;
    }
    setRefilling(true);
    try {
      const res = await fetch(API_URL + '/admin/balance/refill', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      if (res.ok) {
        const data = await res.json();
        toast.success('Balance refilled! Net added: $' + data.net_amount.toFixed(2));
        fetchBalance();
        fetchBalanceTransactions();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Refill failed');
      }
    } catch (err) { toast.error('Refill failed'); }
    setRefilling(false);
  };

  const updateBalanceSettings = async (newSettings) => {
    setSavingSettings(true);
    try {
      const res = await fetch(API_URL + '/admin/balance/settings', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        toast.success('Settings saved');
        setEditingSettings(false);
        fetchBalanceSettings();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save settings');
      }
    } catch (err) { toast.error('Failed to save settings'); }
    setSavingSettings(false);
  };

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'orders') fetchOrders();
    if (activeTab === 'domains') fetchDomains();
    if (activeTab === 'pricing') fetchPricing();
    if (activeTab === 'balance') {
      fetchBalance();
      fetchBalanceSettings();
      fetchBalanceTransactions();
    }
  }, [activeTab, fetchUsers, fetchOrders, fetchDomains, fetchPricing, fetchBalance, fetchBalanceSettings, fetchBalanceTransactions]);

  const StatusBadge = ({ status }) => {
    const styles = { pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', refunded: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', unpaid: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' };
    return <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (styles[status] || styles.pending)}>{status}</span>;
  };

  const Pagination = ({ page, totalPages, setPage }) => (
    <div className="flex items-center justify-between mt-4">
      <span className="text-sm text-slate-600 dark:text-slate-400">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary text-sm disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="btn-secondary text-sm disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>;

  const statCards = stats ? [{ label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'primary' }, { label: 'Active Domains', value: stats.activeDomains, icon: Globe, color: 'accent' }, { label: 'Total Orders', value: stats.totalOrders, icon: ShoppingCart, color: 'blue' }, { label: 'Total Revenue', value: '$' + (stats.totalRevenue?.toFixed(2) || '0.00'), icon: DollarSign, color: 'green' }, { label: 'Orders Today', value: stats.ordersToday, icon: TrendingUp, color: 'purple' }, { label: 'Expiring Soon', value: stats.expiringSoon, icon: AlertTriangle, color: 'yellow' }] : [];

  const getColorClasses = (color) => { const colors = { primary: 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400', accent: 'bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400', blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400', purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400', yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' }; return colors[color] || colors.primary; };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Admin Dashboard</h1><p className="text-slate-600 dark:text-slate-400 mt-1">Manage your domain reseller business</p></div>
        <button onClick={fetchStats} className="btn-secondary"><RefreshCw className="w-4 h-4 mr-2" />Refresh</button>
      </div>
      {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">{error}</div>}
      <div className="border-b border-slate-200 dark:border-slate-800 mb-8">
        <nav className="flex gap-8 overflow-x-auto">
          {/* Base tabs for all staff (level 1+) */}
          {['overview', 'users', 'orders', 'domains'].map((tab) => (<button key={tab} onClick={() => setActiveTab(tab)} className={'pb-4 px-1 border-b-2 font-medium text-sm capitalize transition-colors whitespace-nowrap ' + (activeTab === tab ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>{tab}</button>))}
          {/* Admin-only tabs (level 3+) */}
          {isAdmin && ['pricing', 'balance', 'audit', 'settings'].map((tab) => (<button key={tab} onClick={() => setActiveTab(tab)} className={'pb-4 px-1 border-b-2 font-medium text-sm capitalize transition-colors whitespace-nowrap ' + (activeTab === tab ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')}>{tab}</button>))}
        </nav>
      </div>

      {activeTab === 'overview' && (<div className="space-y-8"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">{statCards.map((stat, i) => (<div key={i} className="card p-4"><div className={'w-10 h-10 rounded-lg ' + getColorClasses(stat.color) + ' flex items-center justify-center mb-3'}><stat.icon className="w-5 h-5" /></div><p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stat.value}</p><p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p></div>))}</div><div className="grid md:grid-cols-2 gap-6"><div className="card p-6"><h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Today's Performance</h3><div className="space-y-4"><div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Orders</span><span className="font-semibold">{stats?.ordersToday || 0}</span></div><div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Revenue</span><span className="font-semibold text-accent-600">${stats?.revenueToday?.toFixed(2) || '0.00'}</span></div><div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">Pending</span><span className="font-semibold text-yellow-600">{stats?.pendingOrders || 0}</span></div></div></div><div className="card p-6"><h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Attention Required</h3><div className="space-y-4">{stats?.expiringSoon > 0 && <div className="flex items-center gap-3 text-yellow-600"><AlertTriangle className="w-5 h-5" /><span>{stats.expiringSoon} domains expiring soon</span></div>}{stats?.pendingOrders > 0 && <div className="flex items-center gap-3 text-primary-600"><ShoppingCart className="w-5 h-5" /><span>{stats.pendingOrders} orders pending</span></div>}{!stats?.expiringSoon && !stats?.pendingOrders && <p className="text-slate-500">All good!</p>}</div></div></div></div>)}

      {activeTab === 'users' && (<div className="space-y-6"><div className="flex gap-4"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input type="text" placeholder="Search users..." value={usersSearch} onChange={(e) => { setUsersSearch(e.target.value); setUsersPage(1); }} className="input pl-10 w-full" /></div><button onClick={fetchUsers} className="btn-secondary"><RefreshCw className={'w-4 h-4 ' + (usersLoading ? 'animate-spin' : '')} /></button></div><div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Role</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Domains</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Orders</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Joined</th><th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{usersLoading ? <tr><td colSpan="6" className="px-4 py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr> : users.length === 0 ? <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">No users</td></tr> : users.map((user) => (<tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-4 py-3"><p className="font-medium text-slate-900 dark:text-slate-100">{user.username}</p><p className="text-sm text-slate-500">{user.email}</p></td><td className="px-4 py-3"><span className={'px-2 py-1 rounded-full text-xs font-medium ' + (user.role_level >= 3 ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' : user.role_level >= 1 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300')}>{user.role_name || 'customer'}</span></td><td className="px-4 py-3 text-slate-600 dark:text-slate-400">{user.domain_count || 0}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-400">{user.order_count || 0}</td><td className="px-4 py-3 text-sm text-slate-500">{new Date(user.created_at).toLocaleDateString()}</td><td className="px-4 py-3 text-right"><button onClick={() => setSelectedUserId(user.id)} className="p-1 text-slate-400 hover:text-primary-600"><Eye className="w-4 h-4" /></button></td></tr>))}</tbody></table></div></div><Pagination page={usersPage} totalPages={usersTotalPages} setPage={setUsersPage} />{selectedUserId && <AdminUserDetail userId={selectedUserId} onClose={() => { setSelectedUserId(null); fetchUsers(); }} />}</div>)}

      {activeTab === 'orders' && (<div className="space-y-6"><div className="flex gap-4"><select value={ordersFilter} onChange={(e) => { setOrdersFilter(e.target.value); setOrdersPage(1); }} className="input"><option value="all">All Orders</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="refunded">Refunded</option></select><button onClick={fetchOrders} className="btn-secondary"><RefreshCw className={'w-4 h-4 ' + (ordersLoading ? 'animate-spin' : '')} /></button></div><div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">ID</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Total</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Payment</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th><th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{ordersLoading ? <tr><td colSpan="7" className="px-4 py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr> : orders.length === 0 ? <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">No orders</td></tr> : orders.map((order) => (<tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-4 py-3 font-mono text-sm">#{order.id}</td><td className="px-4 py-3"><p className="font-medium">{order.username || 'Unknown'}</p><p className="text-sm text-slate-500">{order.email}</p></td><td className="px-4 py-3 font-semibold">${parseFloat(order.total || 0).toFixed(2)}</td><td className="px-4 py-3"><StatusBadge status={order.status} /></td><td className="px-4 py-3"><StatusBadge status={order.payment_status} /></td><td className="px-4 py-3 text-sm text-slate-500">{new Date(order.created_at).toLocaleDateString()}</td><td className="px-4 py-3 text-right"><button onClick={() => fetchOrderDetails(order.id)} className="p-1 text-slate-400 hover:text-primary-600"><Eye className="w-4 h-4" /></button></td></tr>))}</tbody></table></div></div><Pagination page={ordersPage} totalPages={ordersTotalPages} setPage={setOrdersPage} />{selectedOrder && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full p-6"><div className="flex justify-between items-start mb-6"><div><h3 className="text-xl font-bold">Order #{selectedOrder.id}</h3><p className="text-slate-500">{new Date(selectedOrder.created_at).toLocaleString()}</p></div><button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button></div><div className="grid grid-cols-2 gap-4 mb-6"><div><p className="text-sm text-slate-500">Status</p><StatusBadge status={selectedOrder.status} /></div><div><p className="text-sm text-slate-500">Payment</p><StatusBadge status={selectedOrder.payment_status} /></div><div><p className="text-sm text-slate-500">Customer</p><p className="font-medium">{selectedOrder.username}</p></div><div><p className="text-sm text-slate-500">Total</p><p className="font-bold text-lg">${parseFloat(selectedOrder.total || 0).toFixed(2)}</p></div></div>{selectedOrder.items?.length > 0 && (<div className="mb-6"><p className="text-sm text-slate-500 mb-2">Items</p><div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-2">{selectedOrder.items.map((item, i) => <div key={i} className="flex justify-between"><span>{item.domain_name}.{item.tld}</span><span className="text-slate-600">${parseFloat(item.total_price || item.price || 0).toFixed(2)}</span></div>)}</div></div>)}<div className="flex gap-4 pt-4 border-t dark:border-slate-700">{isAdmin && selectedOrder.payment_status === 'paid' && selectedOrder.status !== 'refunded' && <button onClick={() => processRefund(selectedOrder.id)} className="btn-secondary text-red-600">Refund</button>}<button onClick={() => setSelectedOrder(null)} className="btn-secondary ml-auto">Close</button></div></div></div>)}</div>)}

      {activeTab === 'domains' && <AdminDomains />}

      {activeTab === 'pricing' && (<div className="space-y-6"><div className="flex gap-4 flex-wrap"><button onClick={syncPricingFromEnom} disabled={syncingPrices} className="btn-primary">{syncingPrices ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}Sync Costs from eNom</button><button onClick={() => setNewTld({ tld: '', cost_register: '', cost_renew: '', price_register: '', price_renew: '', price_privacy: '9.99' })} className="btn-secondary">+ Add TLD</button><button onClick={fetchPricing} className="btn-secondary ml-auto"><RefreshCw className={'w-4 h-4 ' + (pricingLoading ? 'animate-spin' : '')} /></button></div><div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-slate-50 dark:bg-slate-800/50"><tr><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">TLD</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cost</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Price</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Privacy</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Margin</th><th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Active</th><th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{pricingLoading ? <tr><td colSpan="7" className="px-4 py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr> : pricing.length === 0 ? <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">No pricing</td></tr> : pricing.map((p) => (<tr key={p.tld} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">{editingPrice === p.tld ? (<><td className="px-4 py-3 font-bold">.{p.tld}</td><td className="px-4 py-3"><input type="number" step="0.01" min="0" defaultValue={p.cost_register} id={'cost_' + p.tld} className="input w-20 text-sm py-1" /></td><td className="px-4 py-3"><input type="number" step="0.01" min="0" defaultValue={p.price_register} id={'price_' + p.tld} className="input w-20 text-sm py-1" /></td><td className="px-4 py-3"><input type="number" step="0.01" min="0" defaultValue={p.price_privacy} id={'priv_' + p.tld} className="input w-20 text-sm py-1" /></td><td className="px-4 py-3">-</td><td className="px-4 py-3"><input type="checkbox" defaultChecked={p.is_active} id={'active_' + p.tld} className="rounded" /></td><td className="px-4 py-3 text-right"><button onClick={() => { updatePricing(p.tld, { cost_register: parseFloat(document.getElementById('cost_' + p.tld).value), cost_renew: parseFloat(document.getElementById('cost_' + p.tld).value), price_register: parseFloat(document.getElementById('price_' + p.tld).value), price_renew: parseFloat(document.getElementById('price_' + p.tld).value), price_transfer: parseFloat(document.getElementById('price_' + p.tld).value), price_privacy: parseFloat(document.getElementById('priv_' + p.tld).value), is_active: document.getElementById('active_' + p.tld).checked }); }} className="p-1 text-green-600"><Save className="w-4 h-4" /></button><button onClick={() => setEditingPrice(null)} className="p-1 text-slate-400"><X className="w-4 h-4" /></button></td></>) : (<><td className="px-4 py-3 font-bold">.{p.tld}</td><td className="px-4 py-3 text-slate-600">${parseFloat(p.cost_register || 0).toFixed(2)}</td><td className="px-4 py-3 font-semibold">${parseFloat(p.price_register || 0).toFixed(2)}</td><td className="px-4 py-3 text-slate-600">${parseFloat(p.price_privacy || 0).toFixed(2)}</td><td className="px-4 py-3 text-green-600">${(parseFloat(p.price_register || 0) - parseFloat(p.cost_register || 0)).toFixed(2)}</td><td className="px-4 py-3">{p.is_active ? <Check className="w-5 h-5 text-green-500" /> : <X className="w-5 h-5 text-slate-400" />}</td><td className="px-4 py-3 text-right"><button onClick={() => setEditingPrice(p.tld)} className="p-1 text-slate-400 hover:text-primary-600"><Edit2 className="w-4 h-4" /></button></td></>)}</tr>))}</tbody></table></div></div>{newTld && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6"><div className="flex justify-between items-start mb-6"><h3 className="text-xl font-bold">Add New TLD</h3><button onClick={() => setNewTld(null)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button></div><div className="space-y-4"><div><label className="block text-sm font-medium mb-1">TLD</label><input type="text" placeholder="com" value={newTld.tld} onChange={(e) => setNewTld({ ...newTld, tld: e.target.value.toLowerCase().replace('.', '') })} className="input w-full" /></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium mb-1">Cost</label><input type="number" step="0.01" min="0" placeholder="10.00" value={newTld.cost_register} onChange={(e) => setNewTld({ ...newTld, cost_register: e.target.value })} className="input w-full" /></div><div><label className="block text-sm font-medium mb-1">Price</label><input type="number" step="0.01" min="0" placeholder="14.99" value={newTld.price_register} onChange={(e) => setNewTld({ ...newTld, price_register: e.target.value })} className="input w-full" /></div></div><div><label className="block text-sm font-medium mb-1">Privacy Price</label><input type="number" step="0.01" min="0" placeholder="9.99" value={newTld.price_privacy} onChange={(e) => setNewTld({ ...newTld, price_privacy: e.target.value })} className="input w-full" /></div><div className="flex gap-4 pt-4"><button onClick={() => addTldPricing({ tld: newTld.tld, cost_register: parseFloat(newTld.cost_register) || 0, cost_renew: parseFloat(newTld.cost_register) || 0, cost_transfer: parseFloat(newTld.cost_register) || 0, price_register: parseFloat(newTld.price_register) || 0, price_renew: parseFloat(newTld.price_register) || 0, price_transfer: parseFloat(newTld.price_register) || 0, price_privacy: parseFloat(newTld.price_privacy) || 9.99 })} disabled={!newTld.tld || !newTld.price_register} className="btn-primary flex-1">Add TLD</button><button onClick={() => setNewTld(null)} className="btn-secondary">Cancel</button></div></div></div></div>)}</div>)}

      {activeTab === 'balance' && (
        <div className="space-y-6">
          {/* Balance Overview */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Current Balance Card */}
            <div className="card p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">eNom Balance</p>
                  {balanceLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                      ${balance?.availableBalance?.toFixed(2) || '0.00'}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {balance?.timestamp ? 'Updated: ' + new Date(balance.timestamp).toLocaleString() : 'Currency: USD'}
              </p>
              <button onClick={fetchBalance} disabled={balanceLoading} className="btn-secondary w-full mt-4">
                <RefreshCw className={'w-4 h-4 mr-2 ' + (balanceLoading ? 'animate-spin' : '')} />
                Refresh Balance
              </button>
            </div>

            {/* Refill Card */}
            <div className="card p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Refill Account</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Add Funds</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Amount (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="25"
                    value={refillAmount}
                    onChange={(e) => setRefillAmount(e.target.value)}
                    className="input w-full"
                    placeholder="100.00"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Min: $25.00 | 5% CC fee applies (~${(parseFloat(refillAmount || 0) * 0.05).toFixed(2)} fee)
                </p>
                <button
                  onClick={refillBalance}
                  disabled={refilling || parseFloat(refillAmount) < 25}
                  className="btn-primary w-full"
                >
                  {refilling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowUpRight className="w-4 h-4 mr-2" />}
                  Refill ${parseFloat(refillAmount || 0).toFixed(2)}
                </button>
              </div>
            </div>

            {/* Settings Card */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                    <Settings className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Balance Settings</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Auto-Refill</p>
                  </div>
                </div>
                <button onClick={() => setEditingSettings(!editingSettings)} className="text-slate-400 hover:text-primary-600">
                  <Edit2 className="w-5 h-5" />
                </button>
              </div>
              {balanceSettings ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Auto-Refill</span>
                    <span className={balanceSettings.auto_refill_enabled ? 'text-green-600' : 'text-slate-500'}>
                      {balanceSettings.auto_refill_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Threshold</span>
                    <span>${parseFloat(balanceSettings.min_balance_threshold || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Refill Amount</span>
                    <span>${parseFloat(balanceSettings.refill_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Low Alert</span>
                    <span>${parseFloat(balanceSettings.low_balance_alert || 0).toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Loading settings...</p>
              )}
            </div>
          </div>

          {/* Settings Edit Modal */}
          {editingSettings && balanceSettings && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Balance Settings</h3>
                  <button onClick={() => setEditingSettings(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.target;
                  updateBalanceSettings({
                    auto_refill_enabled: form.auto_refill.checked,
                    min_balance_threshold: parseFloat(form.threshold.value),
                    refill_amount: parseFloat(form.refill_amount.value),
                    low_balance_alert: parseFloat(form.alert.value),
                    email_alerts_enabled: form.email_alerts.checked,
                    alert_email: form.alert_email.value
                  });
                }} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" name="auto_refill" id="auto_refill" defaultChecked={balanceSettings.auto_refill_enabled} className="rounded" />
                    <label htmlFor="auto_refill" className="text-sm font-medium">Enable Auto-Refill</label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Min Balance Threshold ($)</label>
                    <input type="number" name="threshold" step="0.01" min="0" defaultValue={balanceSettings.min_balance_threshold} className="input w-full" />
                    <p className="text-xs text-slate-500 mt-1">Auto-refill triggers when balance falls below this</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Refill Amount ($)</label>
                    <input type="number" name="refill_amount" step="0.01" min="25" defaultValue={balanceSettings.refill_amount} className="input w-full" />
                    <p className="text-xs text-slate-500 mt-1">Amount to refill (min $25)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Low Balance Alert ($)</label>
                    <input type="number" name="alert" step="0.01" min="0" defaultValue={balanceSettings.low_balance_alert} className="input w-full" />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" name="email_alerts" id="email_alerts" defaultChecked={balanceSettings.email_alerts_enabled} className="rounded" />
                    <label htmlFor="email_alerts" className="text-sm font-medium">Email Alerts</label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Alert Email</label>
                    <input type="email" name="alert_email" defaultValue={balanceSettings.alert_email || ''} placeholder="admin@example.com" className="input w-full" />
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button type="submit" disabled={savingSettings} className="btn-primary flex-1">
                      {savingSettings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Save Settings
                    </button>
                    <button type="button" onClick={() => setEditingSettings(false)} className="btn-secondary">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Transaction History */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-slate-500" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transaction History</h3>
              </div>
              <button onClick={fetchBalanceTransactions} className="btn-secondary text-sm">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Fee</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Net</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Balance After</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Domain</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {balanceTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-8 text-center text-slate-500">No transactions recorded</td>
                    </tr>
                  ) : (
                    balanceTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {tx.transaction_type === 'refill' ? (
                              <ArrowUpRight className="w-4 h-4 text-green-500" />
                            ) : (
                              <ArrowDownRight className="w-4 h-4 text-red-500" />
                            )}
                            <span className="font-medium capitalize">{tx.transaction_type}</span>
                            {tx.auto_refill && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Auto</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold">${parseFloat(tx.amount || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-500">${parseFloat(tx.fee_amount || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-medium text-green-600">${parseFloat(tx.net_amount || 0).toFixed(2)}</td>
                        <td className="px-4 py-3">${parseFloat(tx.balance_after || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-600">{tx.domain_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{new Date(tx.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate">{tx.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && <AdminAuditLogs />}

      {activeTab === 'settings' && <AdminSettings />}
    </div>
  );
}

export default AdminDashboard;
