import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, Loader2, User, Globe, ShoppingCart, Users, MessageSquare, Activity, Check, X, Edit2, Pin, Trash2, Plus, Shield, Lock, Unlock, Eye } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import { toast } from 'react-hot-toast';
import { DomainDetailModal } from './AdminDomains';

const ROLE_OPTIONS = [
  { level: 0, name: 'customer', label: 'Customer' },
  { level: 1, name: 'support', label: 'Support' },
  { level: 2, name: 'sales', label: 'Sales' },
  { level: 3, name: 'admin', label: 'Admin' },
  { level: 4, name: 'superadmin', label: 'Super Admin' }
];

const COUNTRY_OPTIONS = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IN', name: 'India' }
];

function AdminUserDetail({ userId, onClose }) {
  const { token, user: currentUser, impersonate } = useAuth();
  const [impersonating, setImpersonating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [editedFields, setEditedFields] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  // Notes state
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Domain management state
  const [selectedDomain, setSelectedDomain] = useState(null);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setEditedFields({});
        setHasChanges(false);
      } else {
        toast.error('Failed to load user');
        onClose();
      }
    } catch (err) {
      toast.error('Failed to load user');
      onClose();
    }
    setLoading(false);
  }, [userId, token, onClose]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleFieldChange = (field, value) => {
    setEditedFields(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const getFieldValue = (field) => {
    return editedFields[field] !== undefined ? editedFields[field] : (user?.[field] || '');
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);

    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editedFields)
      });

      if (res.ok) {
        const updated = await res.json();
        setUser(prev => ({ ...prev, ...updated }));
        setEditedFields({});
        setHasChanges(false);
        toast.success('User updated successfully');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to update user');
      }
    } catch (err) {
      toast.error('Failed to update user');
    }
    setSaving(false);
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);

    try {
      const res = await fetch(`${API_URL}/notes/user/${userId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ note: newNote })
      });

      if (res.ok) {
        setNewNote('');
        toast.success('Note added');
        fetchUser();
      } else {
        toast.error('Failed to add note');
      }
    } catch (err) {
      toast.error('Failed to add note');
    }
    setAddingNote(false);
  };

  const handleTogglePin = async (noteId) => {
    try {
      const res = await fetch(`${API_URL}/notes/${noteId}/toggle-pin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchUser();
    } catch (err) {
      toast.error('Failed to toggle pin');
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      const res = await fetch(`${API_URL}/notes/${noteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Note deleted');
        fetchUser();
      }
    } catch (err) {
      toast.error('Failed to delete note');
    }
  };

  const StatusBadge = ({ status, type = 'default' }) => {
    const styles = {
      active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      refunded: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      default: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.default}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-900 z-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!user) return null;

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'domains', label: 'Domains', icon: Globe, count: user.domains?.length },
    { id: 'orders', label: 'Orders', icon: ShoppingCart, count: user.recentOrders?.length },
    { id: 'contacts', label: 'Contacts', icon: Users, count: user.contacts?.length },
    { id: 'notes', label: 'Notes', icon: MessageSquare, count: user.notes?.length },
    { id: 'activity', label: 'Activity', icon: Activity }
  ];

  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-900 z-50 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {user.full_name || user.username}
                </h1>
                <p className="text-sm text-slate-500">{user.email}</p>
              </div>
              <StatusBadge status={user.role_name || 'customer'} />
              {user.email_verified && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <Check className="w-3 h-3" /> Verified
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {hasChanges && (
                <span className="text-sm text-amber-600 dark:text-amber-400">Unsaved changes</span>
              )}
              {/* Delete button - only for super admins, can't delete self or higher roles */}
              {currentUser?.role_level >= 4 && user?.id !== currentUser?.id && user?.role_level < currentUser?.role_level && (
                <button
                  onClick={async () => {
                    if (!window.confirm(`Are you sure you want to delete ${user.username}? This action cannot be undone.`)) {
                      return;
                    }
                    setDeleting(true);
                    try {
                      const res = await fetch(`${API_URL}/admin/users/${userId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      const data = await res.json();
                      if (res.ok) {
                        toast.success(data.message || 'User deleted');
                        onClose();
                      } else {
                        toast.error(data.error || 'Failed to delete user');
                      }
                    } catch (err) {
                      toast.error('Failed to delete user');
                    }
                    setDeleting(false);
                  }}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  title="Delete this user"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Delete
                </button>
              )}
              {/* Impersonate button - only for super admins, can't impersonate self or higher roles */}
              {currentUser?.role_level >= 4 && user?.id !== currentUser?.id && user?.role_level < currentUser?.role_level && (
                <button
                  onClick={async () => {
                    setImpersonating(true);
                    await impersonate(userId);
                    setImpersonating(false);
                  }}
                  disabled={impersonating}
                  className="btn-secondary"
                  title="View site as this user"
                >
                  {impersonating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                  Impersonate
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className="ml-1 px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* Account Info */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Account Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
                  <input
                    type="text"
                    value={user.username}
                    disabled
                    className="input bg-slate-50 dark:bg-slate-800 cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">Username cannot be changed</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={getFieldValue('email')}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
                  <select
                    value={getFieldValue('role_level')}
                    onChange={(e) => {
                      const level = parseInt(e.target.value);
                      const role = ROLE_OPTIONS.find(r => r.level === level);
                      handleFieldChange('role_level', level);
                      handleFieldChange('role_name', role?.name || 'customer');
                    }}
                    className="input"
                    disabled={currentUser?.role_level <= user.role_level && !currentUser?.is_admin}
                  >
                    {ROLE_OPTIONS.map(role => (
                      <option key={role.level} value={role.level}>{role.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email Verified</label>
                  <div className="flex items-center gap-3 mt-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={getFieldValue('email_verified')}
                        onChange={(e) => handleFieldChange('email_verified', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {getFieldValue('email_verified') ? 'Verified' : 'Not verified'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Personal Info */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Personal Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={getFieldValue('full_name')}
                    onChange={(e) => handleFieldChange('full_name', e.target.value)}
                    className="input"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={getFieldValue('phone')}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    className="input"
                    placeholder="+1.555.123.4567"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Company</label>
                  <input
                    type="text"
                    value={getFieldValue('company_name')}
                    onChange={(e) => handleFieldChange('company_name', e.target.value)}
                    className="input"
                    placeholder="Acme Inc."
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Address</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address Line 1</label>
                  <input
                    type="text"
                    value={getFieldValue('address_line1')}
                    onChange={(e) => handleFieldChange('address_line1', e.target.value)}
                    className="input"
                    placeholder="123 Main Street"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address Line 2</label>
                  <input
                    type="text"
                    value={getFieldValue('address_line2')}
                    onChange={(e) => handleFieldChange('address_line2', e.target.value)}
                    className="input"
                    placeholder="Apt 4B"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">City</label>
                  <input
                    type="text"
                    value={getFieldValue('city')}
                    onChange={(e) => handleFieldChange('city', e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">State/Province</label>
                  <input
                    type="text"
                    value={getFieldValue('state')}
                    onChange={(e) => handleFieldChange('state', e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={getFieldValue('postal_code')}
                    onChange={(e) => handleFieldChange('postal_code', e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Country</label>
                  <select
                    value={getFieldValue('country')}
                    onChange={(e) => handleFieldChange('country', e.target.value)}
                    className="input"
                  >
                    <option value="">Select country...</option>
                    {COUNTRY_OPTIONS.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Account Stats */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Account Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{user.domains?.length || 0}</p>
                  <p className="text-sm text-slate-500">Domains</p>
                </div>
                <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{user.recentOrders?.length || 0}</p>
                  <p className="text-sm text-slate-500">Orders</p>
                </div>
                <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                  </p>
                  <p className="text-sm text-slate-500">Joined</p>
                </div>
                <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Never'}
                  </p>
                  <p className="text-sm text-slate-500">Last Login</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Domains Tab */}
        {activeTab === 'domains' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Domains ({user.domains?.length || 0})
              </h3>
              <p className="text-sm text-slate-500">Click any row to manage domain</p>
            </div>
            {user.domains?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Domain</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Expires</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Auto-Renew</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Privacy</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Lock</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {user.domains.map(domain => (
                      <tr
                        key={domain.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedDomain(domain)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-slate-400" />
                            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                              {domain.domain_name}.{domain.tld}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={domain.status} />
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                          {domain.expiration_date ? new Date(domain.expiration_date).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {domain.auto_renew ? (
                            <Check className="w-5 h-5 text-green-500" />
                          ) : (
                            <X className="w-5 h-5 text-slate-400" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {domain.privacy_enabled ? (
                            <Shield className="w-5 h-5 text-green-500" />
                          ) : (
                            <Shield className="w-5 h-5 text-slate-400" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {domain.lock_status ? (
                            <Lock className="w-5 h-5 text-amber-500" />
                          ) : (
                            <Unlock className="w-5 h-5 text-slate-400" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedDomain(domain); }}
                            className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-12 text-center text-slate-500">
                <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No domains</p>
              </div>
            )}

            {/* Domain Detail Modal */}
            {selectedDomain && (
              <DomainDetailModal
                domain={selectedDomain}
                onClose={() => setSelectedDomain(null)}
                onSave={() => { setSelectedDomain(null); fetchUser(); }}
                onRefresh={fetchUser}
                token={token}
              />
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Orders ({user.recentOrders?.length || 0})
              </h3>
            </div>
            {user.recentOrders?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Order #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {user.recentOrders.map(order => (
                      <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-mono text-sm">
                          #{order.order_number || order.id}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          ${parseFloat(order.total || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={order.payment_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-12 text-center text-slate-500">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No orders</p>
              </div>
            )}
          </div>
        )}

        {/* Contacts Tab */}
        {activeTab === 'contacts' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Saved Contacts ({user.contacts?.length || 0})
              </h3>
            </div>
            {user.contacts?.length > 0 ? (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {user.contacts.map(contact => (
                  <div key={contact.id} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {contact.first_name} {contact.last_name}
                        </span>
                        {contact.is_default && (
                          <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs rounded-full">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{contact.email}</p>
                    </div>
                    <span className="text-xs text-slate-400 uppercase">{contact.contact_type || 'registrant'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-12 text-center text-slate-500">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No saved contacts</p>
              </div>
            )}
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            {/* Add Note */}
            <div className="card p-4">
              <div className="flex gap-3">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a staff note about this customer..."
                  className="input flex-1 min-h-[80px] resize-none"
                />
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                  className="btn-primary self-end"
                >
                  {addingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Notes List */}
            {user.notes?.length > 0 ? (
              <div className="space-y-3">
                {user.notes.map(note => (
                  <div
                    key={note.id}
                    className={`card p-4 ${note.is_pinned ? 'border-l-4 border-l-amber-500' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap">{note.note}</p>
                        <p className="text-xs text-slate-500 mt-2">
                          {note.staff_username || 'Staff'} - {new Date(note.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleTogglePin(note.id)}
                          className={`p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 ${note.is_pinned ? 'text-amber-500' : 'text-slate-400'}`}
                          title={note.is_pinned ? 'Unpin' : 'Pin'}
                        >
                          <Pin className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card px-6 py-12 text-center text-slate-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No staff notes</p>
              </div>
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h3>
            </div>
            {user.recentActivity?.length > 0 ? (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {user.recentActivity.map((activity, idx) => (
                  <div key={idx} className="px-6 py-3 flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-primary-500"></div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        <span className="font-medium">{activity.action}</span>
                        {activity.entity_type && (
                          <span className="text-slate-500">
                            {' '}on {activity.entity_type}
                            {activity.entity_id && ` #${activity.entity_id}`}
                          </span>
                        )}
                      </p>
                      {activity.details && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {typeof activity.details === 'string' ? activity.details : JSON.stringify(activity.details)}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(activity.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-12 text-center text-slate-500">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No recent activity</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminUserDetail;
