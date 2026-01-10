import React, { useState, useEffect } from 'react';
import {
  Users, Globe, ShoppingCart, DollarSign,
  TrendingUp, AlertTriangle, RefreshCw, Loader2
} from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';

function AdminDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        setError('Failed to load statistics');
      }
    } catch (err) {
      setError('Connection error');
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const statCards = stats ? [
    {
      label: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      color: 'primary'
    },
    {
      label: 'Active Domains',
      value: stats.activeDomains,
      icon: Globe,
      color: 'accent'
    },
    {
      label: 'Total Orders',
      value: stats.totalOrders,
      icon: ShoppingCart,
      color: 'blue'
    },
    {
      label: 'Total Revenue',
      value: `$${stats.totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: 'green'
    },
    {
      label: 'Orders Today',
      value: stats.ordersToday,
      icon: TrendingUp,
      color: 'purple'
    },
    {
      label: 'Expiring Soon',
      value: stats.expiringSoon,
      icon: AlertTriangle,
      color: 'yellow'
    }
  ] : [];

  const getColorClasses = (color) => {
    const colors = {
      primary: 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400',
      accent: 'bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400',
      blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
      green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
      purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
      yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
    };
    return colors[color] || colors.primary;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Admin Dashboard
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Overview of your domain reseller business
          </p>
        </div>
        <button onClick={fetchStats} className="btn-secondary">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 mb-8">
        <nav className="flex gap-8">
          {['overview', 'users', 'orders', 'domains', 'pricing'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 px-1 border-b-2 font-medium text-sm capitalize transition-colors ${
                activeTab === tab
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {statCards.map((stat, i) => (
              <div key={i} className="card p-4">
                <div className={`w-10 h-10 rounded-lg ${getColorClasses(stat.color)} flex items-center justify-center mb-3`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {stat.value}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {/* Quick Stats */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Today's Performance
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Orders</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {stats?.ordersToday || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Revenue</span>
                  <span className="font-semibold text-accent-600 dark:text-accent-400">
                    ${stats?.revenueToday?.toFixed(2) || '0.00'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Pending Orders</span>
                  <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                    {stats?.pendingOrders || 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Attention Required
              </h3>
              <div className="space-y-4">
                {stats?.expiringSoon > 0 && (
                  <div className="flex items-center gap-3 text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="w-5 h-5" />
                    <span>{stats.expiringSoon} domains expiring in 30 days</span>
                  </div>
                )}
                {stats?.pendingOrders > 0 && (
                  <div className="flex items-center gap-3 text-primary-600 dark:text-primary-400">
                    <ShoppingCart className="w-5 h-5" />
                    <span>{stats.pendingOrders} orders need processing</span>
                  </div>
                )}
                {!stats?.expiringSoon && !stats?.pendingOrders && (
                  <p className="text-slate-500 dark:text-slate-400">
                    Nothing requires immediate attention.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab !== 'overview' && (
        <div className="card p-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} management coming soon.
          </p>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
