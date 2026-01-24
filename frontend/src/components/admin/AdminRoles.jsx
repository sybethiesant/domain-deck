import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Users, Edit2, Save, X, Loader2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import { toast } from 'react-hot-toast';

function AdminRoles() {
  const { token, user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState(null);
  const [expandedRole, setExpandedRole] = useState(null);
  const [roleUsers, setRoleUsers] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/roles/all`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRoles(data);
      }
    } catch (err) {
      toast.error('Failed to load roles');
    }
    setLoading(false);
  }, [token]);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/permissions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPermissions(data);
      }
    } catch (err) {
      console.error('Failed to load permissions');
    }
  }, [token]);

  const fetchRoleUsers = async (level) => {
    try {
      const res = await fetch(`${API_URL}/admin/roles/${level}/users?limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRoleUsers(prev => ({ ...prev, [level]: data }));
      }
    } catch (err) {
      console.error('Failed to load role users');
    }
  };

  useEffect(() => {
    fetchRoles();
    fetchPermissions();
  }, [fetchRoles, fetchPermissions]);

  const handleExpand = (level) => {
    if (expandedRole === level) {
      setExpandedRole(null);
    } else {
      setExpandedRole(level);
      if (!roleUsers[level]) {
        fetchRoleUsers(level);
      }
    }
  };

  const handleEdit = (role) => {
    setEditingRole({
      ...role,
      permissions: role.permissions ? (typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions) : []
    });
  };

  const handleSave = async () => {
    if (!editingRole) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/roles/${editingRole.level}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          display_name: editingRole.display_name,
          description: editingRole.description,
          permissions: editingRole.permissions
        })
      });

      if (res.ok) {
        toast.success('Role updated successfully');
        setEditingRole(null);
        fetchRoles();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update role');
      }
    } catch (err) {
      toast.error('Failed to update role');
    }
    setSaving(false);
  };

  const togglePermission = (permKey) => {
    if (!editingRole) return;

    const currentPerms = editingRole.permissions || [];
    const hasPermission = currentPerms.includes(permKey);

    setEditingRole({
      ...editingRole,
      permissions: hasPermission
        ? currentPerms.filter(p => p !== permKey)
        : [...currentPerms, permKey]
    });
  };

  const getRoleBadgeColor = (level) => {
    switch (level) {
      case 0: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
      case 1: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 2: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 3: return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 4: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
    }
  };

  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Role Management</h2>
          <p className="text-sm text-slate-500">Configure role permissions and access levels</p>
        </div>
      </div>

      {/* Roles List */}
      <div className="space-y-4">
        {roles.map((role) => (
          <div key={role.level} className="card overflow-hidden">
            {/* Role Header */}
            <div
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
              onClick={() => handleExpand(role.level)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getRoleBadgeColor(role.level)}`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                      {role.display_name || role.name}
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeColor(role.level)}`}>
                      Level {role.level}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{role.description || 'No description'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {roleUsers[role.level]?.total || '—'} users
                  </p>
                </div>
                {role.level < 4 && user?.role_level >= 4 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(role); }}
                    className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
                {expandedRole === role.level ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </div>
            </div>

            {/* Expanded Content */}
            {expandedRole === role.level && (
              <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/30">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Permissions */}
                  <div>
                    <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Permissions</h4>
                    {role.permissions ? (
                      <div className="flex flex-wrap gap-2">
                        {(typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions).map((perm) => (
                          <span
                            key={perm}
                            className="px-2 py-1 bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded text-xs"
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        {role.level === 4 ? 'All permissions (Super Admin)' : 'Inherits from role level'}
                      </p>
                    )}
                  </div>

                  {/* Users */}
                  <div>
                    <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Users with this role
                    </h4>
                    {roleUsers[role.level]?.users?.length > 0 ? (
                      <div className="space-y-2">
                        {roleUsers[role.level].users.map((u) => (
                          <div key={u.id} className="flex items-center gap-2 text-sm">
                            <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-medium text-primary-600">
                              {(u.full_name || u.username || 'U').charAt(0).toUpperCase()}
                            </div>
                            <span className="text-slate-700 dark:text-slate-300">{u.full_name || u.username}</span>
                            <span className="text-slate-400">({u.email})</span>
                          </div>
                        ))}
                        {roleUsers[role.level].total > 10 && (
                          <p className="text-xs text-slate-500">
                            +{roleUsers[role.level].total - 10} more users
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No users with this role</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingRole && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Edit Role: {editingRole.display_name || editingRole.name}
                </h3>
                <p className="text-sm text-slate-500">Level {editingRole.level}</p>
              </div>
              <button
                onClick={() => setEditingRole(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editingRole.display_name || ''}
                  onChange={(e) => setEditingRole({ ...editingRole, display_name: e.target.value })}
                  className="input w-full"
                  placeholder="Enter display name"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={editingRole.description || ''}
                  onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                  className="input w-full"
                  rows={2}
                  placeholder="Enter role description"
                />
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Permissions
                </label>
                <div className="space-y-4">
                  {Object.entries(groupedPermissions).map(([category, perms]) => (
                    <div key={category}>
                      <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        {category}
                      </h5>
                      <div className="grid grid-cols-2 gap-2">
                        {perms.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                          >
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                editingRole.permissions?.includes(perm.key)
                                  ? 'bg-primary-600 border-primary-600'
                                  : 'border-slate-300 dark:border-slate-600'
                              }`}
                              onClick={() => togglePermission(perm.key)}
                            >
                              {editingRole.permissions?.includes(perm.key) && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <div>
                              <span className="text-sm text-slate-700 dark:text-slate-300">
                                {perm.description}
                              </span>
                              <span className="text-xs text-slate-400 ml-2">({perm.key})</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setEditingRole(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminRoles;
