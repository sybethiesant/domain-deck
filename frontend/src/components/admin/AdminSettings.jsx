import React, { useState, useEffect, useCallback } from 'react';
import { Save, Loader2, RefreshCw, Globe, Mail, Bell, Server, ShoppingCart, Shield, AlertTriangle, Zap, CreditCard, Send, Eye, Edit2, X, Check } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import { toast } from 'react-hot-toast';

function AdminSettings() {
  const { token } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modified, setModified] = useState({});

  // API mode state
  const [apiModes, setApiModes] = useState(null);
  const [apiModesLoading, setApiModesLoading] = useState(false);
  const [togglingMode, setTogglingMode] = useState(null);

  // Email settings state
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [previewingTemplate, setPreviewingTemplate] = useState(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setModified({});
      } else {
        toast.error('Failed to load settings');
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      toast.error('Failed to load settings');
    }
    setLoading(false);
  }, [token]);

  const fetchApiModes = useCallback(async () => {
    setApiModesLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/api-modes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setApiModes(await res.json());
      }
    } catch (err) {
      console.error('Error fetching API modes:', err);
    }
    setApiModesLoading(false);
  }, [token]);

  const toggleApiMode = async (service, newTestMode) => {
    setTogglingMode(service);
    try {
      const body = service === 'enom'
        ? { enom_test_mode: newTestMode }
        : { stripe_test_mode: newTestMode };

      const res = await fetch(`${API_URL}/admin/api-modes`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`${service.toUpperCase()} switched to ${newTestMode ? 'TEST' : 'PRODUCTION'} mode`);
        if (result.warning) {
          toast(result.warning, { icon: '⚠️', duration: 5000 });
        }
        fetchApiModes();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to switch mode');
      }
    } catch (err) {
      toast.error('Failed to switch mode');
    }
    setTogglingMode(null);
  };

  const fetchEmailStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/email/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setEmailStatus(await res.json());
      }
    } catch (err) {
      console.error('Error fetching email status:', err);
    }
  }, [token]);

  const fetchEmailTemplates = useCallback(async () => {
    setEmailLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/email-templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setEmailTemplates(await res.json());
      }
    } catch (err) {
      console.error('Error fetching email templates:', err);
    }
    setEmailLoading(false);
  }, [token]);

  const sendTestEmail = async () => {
    if (!testEmailAddress) {
      toast.error('Enter an email address');
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch(`${API_URL}/admin/email/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: testEmailAddress })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Test email sent via ${data.provider}`);
      } else {
        toast.error(data.error || 'Failed to send test email');
      }
    } catch (err) {
      toast.error('Failed to send test email');
    }
    setSendingTest(false);
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    setSavingTemplate(true);
    try {
      const res = await fetch(`${API_URL}/admin/email-templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editingTemplate.name,
          description: editingTemplate.description,
          subject: editingTemplate.subject,
          html_content: editingTemplate.html_content,
          is_active: editingTemplate.is_active
        })
      });
      if (res.ok) {
        toast.success('Template saved');
        setEditingTemplate(null);
        fetchEmailTemplates();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save template');
      }
    } catch (err) {
      toast.error('Failed to save template');
    }
    setSavingTemplate(false);
  };

  const previewTemplate = async (templateId) => {
    try {
      const res = await fetch(`${API_URL}/admin/email-templates/${templateId}/preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sample_data: {} })
      });
      if (res.ok) {
        setPreviewingTemplate(await res.json());
      }
    } catch (err) {
      toast.error('Failed to preview template');
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchApiModes();
    fetchEmailStatus();
    fetchEmailTemplates();
  }, [fetchSettings, fetchApiModes, fetchEmailStatus, fetchEmailTemplates]);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setModified(prev => ({ ...prev, [key]: true }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only send modified settings
      const changedSettings = {};
      for (const key of Object.keys(modified)) {
        changedSettings[key] = settings[key];
      }

      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(changedSettings)
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`Updated ${result.updated?.length || 0} settings`);
        setModified({});
        if (result.errors?.length > 0) {
          result.errors.forEach(e => toast.error(`${e.key}: ${e.error}`));
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Failed to save settings');
    }
    setSaving(false);
  };

  const toggleMaintenance = async () => {
    const newMode = settings.maintenance_mode !== 'true';
    try {
      const res = await fetch(`${API_URL}/admin/maintenance`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: newMode,
          message: settings.maintenance_message
        })
      });

      if (res.ok) {
        toast.success(newMode ? 'Maintenance mode enabled' : 'Maintenance mode disabled');
        setSettings(prev => ({ ...prev, maintenance_mode: newMode ? 'true' : 'false' }));
      } else {
        toast.error('Failed to toggle maintenance mode');
      }
    } catch (err) {
      toast.error('Failed to toggle maintenance mode');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const hasChanges = Object.keys(modified).length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">System Settings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Configure your domain reseller platform</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchSettings} className="btn-secondary">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </button>
        </div>
      </div>

      {hasChanges && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          <span className="text-yellow-800 dark:text-yellow-200">You have unsaved changes</span>
        </div>
      )}

      {/* Site Settings */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <Globe className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Site Settings</h3>
            <p className="text-sm text-slate-500">General site configuration</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Site Name
            </label>
            <input
              type="text"
              value={settings.site_name || ''}
              onChange={(e) => handleChange('site_name', e.target.value)}
              className="input w-full"
              placeholder="WorxTech"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tagline
            </label>
            <input
              type="text"
              value={settings.site_tagline || ''}
              onChange={(e) => handleChange('site_tagline', e.target.value)}
              className="input w-full"
              placeholder="Domain Names Made Simple"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Support Email
            </label>
            <input
              type="email"
              value={settings.support_email || ''}
              onChange={(e) => handleChange('support_email', e.target.value)}
              className="input w-full"
              placeholder="support@worxtech.biz"
            />
          </div>
        </div>
      </div>

      {/* API Mode Settings */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">API Mode Settings</h3>
            <p className="text-sm text-slate-500">Switch between test and production environments</p>
          </div>
          <button onClick={fetchApiModes} className="ml-auto btn-secondary text-sm py-1">
            <RefreshCw className={`w-4 h-4 ${apiModesLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-medium">Important</p>
              <p>Domains registered in test mode cannot be managed in production mode and vice versa. Mode changes take effect immediately.</p>
            </div>
          </div>
        </div>

        {apiModes ? (
          <div className="grid md:grid-cols-2 gap-6">
            {/* eNom Mode */}
            <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-slate-500" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">eNom</span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  apiModes.enom.currentMode === 'test'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                  {apiModes.enom.currentMode.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-slate-500 mb-3">Endpoint: {apiModes.enom.endpoint}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleApiMode('enom', true)}
                  disabled={togglingMode === 'enom' || apiModes.enom.currentMode === 'test'}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    apiModes.enom.currentMode === 'test'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  {togglingMode === 'enom' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Test'}
                </button>
                <button
                  onClick={() => toggleApiMode('enom', false)}
                  disabled={togglingMode === 'enom' || apiModes.enom.currentMode === 'production'}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    apiModes.enom.currentMode === 'production'
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  Production
                </button>
              </div>
            </div>

            {/* Stripe Mode */}
            <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-slate-500" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">Stripe</span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  apiModes.stripe.currentMode === 'test'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                  {apiModes.stripe.currentMode.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-slate-500 mb-3">
                Status: {apiModes.stripe.configured ? 'Configured' : 'Not Configured'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleApiMode('stripe', true)}
                  disabled={togglingMode === 'stripe' || apiModes.stripe.currentMode === 'test'}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    apiModes.stripe.currentMode === 'test'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  {togglingMode === 'stripe' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Test'}
                </button>
                <button
                  onClick={() => toggleApiMode('stripe', false)}
                  disabled={togglingMode === 'stripe' || apiModes.stripe.currentMode === 'production'}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    apiModes.stripe.currentMode === 'production'
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  Production
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-slate-500">
            {apiModesLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Failed to load API modes'}
          </div>
        )}
      </div>

      {/* Domain Settings */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Server className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Domain Settings</h3>
            <p className="text-sm text-slate-500">Nameserver and domain sync configuration</p>
          </div>
        </div>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Default Nameservers
              <span className="text-slate-400 font-normal ml-2">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={settings.default_nameservers || ''}
              onChange={(e) => handleChange('default_nameservers', e.target.value)}
              className="input w-full font-mono text-sm"
              placeholder="ns1.worxtech.biz,ns2.worxtech.biz"
            />
            <p className="text-xs text-slate-500 mt-1">Used for new domain registrations</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Suspended Domain Nameservers
              <span className="text-slate-400 font-normal ml-2">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={settings.suspended_nameservers || ''}
              onChange={(e) => handleChange('suspended_nameservers', e.target.value)}
              className="input w-full font-mono text-sm"
              placeholder="ns1.suspended.worxtech.biz,ns2.suspended.worxtech.biz"
            />
            <p className="text-xs text-slate-500 mt-1">Nameservers applied when a domain is suspended</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.auto_sync_enabled === 'true'}
                  onChange={(e) => handleChange('auto_sync_enabled', e.target.checked ? 'true' : 'false')}
                  className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="font-medium text-slate-900 dark:text-slate-100">Auto-Sync Domains</span>
                  <p className="text-sm text-slate-500">Automatically sync domains from eNom</p>
                </div>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Sync Interval (hours)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={settings.sync_interval_hours || '24'}
                onChange={(e) => handleChange('sync_interval_hours', e.target.value)}
                className="input w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Registration Settings */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Registration Settings</h3>
            <p className="text-sm text-slate-500">User registration and verification</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.registration_enabled === 'true'}
              onChange={(e) => handleChange('registration_enabled', e.target.checked ? 'true' : 'false')}
              className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="font-medium text-slate-900 dark:text-slate-100">Allow Registration</span>
              <p className="text-sm text-slate-500">Enable new user sign-ups</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.email_verification_required === 'true'}
              onChange={(e) => handleChange('email_verification_required', e.target.checked ? 'true' : 'false')}
              className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="font-medium text-slate-900 dark:text-slate-100">Email Verification</span>
              <p className="text-sm text-slate-500">Require email verification</p>
            </div>
          </label>
        </div>
      </div>

      {/* Order Settings */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Order Settings</h3>
            <p className="text-sm text-slate-500">Checkout and order processing</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Order Expiration (hours)
            </label>
            <input
              type="number"
              min="1"
              max="168"
              value={settings.order_expiration_hours || '24'}
              onChange={(e) => handleChange('order_expiration_hours', e.target.value)}
              className="input w-full"
            />
            <p className="text-xs text-slate-500 mt-1">Pending orders expire after this time</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.require_contact_for_checkout === 'true'}
              onChange={(e) => handleChange('require_contact_for_checkout', e.target.checked ? 'true' : 'false')}
              className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="font-medium text-slate-900 dark:text-slate-100">Require Contact for Checkout</span>
              <p className="text-sm text-slate-500">Require WHOIS contact info at checkout</p>
            </div>
          </label>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Notification Settings</h3>
            <p className="text-sm text-slate-500">Email notification preferences</p>
          </div>
        </div>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.admin_email_notifications === 'true'}
              onChange={(e) => handleChange('admin_email_notifications', e.target.checked ? 'true' : 'false')}
              className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="font-medium text-slate-900 dark:text-slate-100">Admin Email Notifications</span>
              <p className="text-sm text-slate-500">Send notifications to admin email</p>
            </div>
          </label>
          <div className="grid md:grid-cols-3 gap-4 pl-8">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notify_on_new_order === 'true'}
                onChange={(e) => handleChange('notify_on_new_order', e.target.checked ? 'true' : 'false')}
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">New orders</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notify_on_failed_order === 'true'}
                onChange={(e) => handleChange('notify_on_failed_order', e.target.checked ? 'true' : 'false')}
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Failed orders</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notify_on_expiring_domains === 'true'}
                onChange={(e) => handleChange('notify_on_expiring_domains', e.target.checked ? 'true' : 'false')}
                className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Expiring domains</span>
            </label>
          </div>
          <div className="pl-8">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Expiring Domain Warning (days)
            </label>
            <input
              type="number"
              min="1"
              max="90"
              value={settings.expiring_domain_days || '30'}
              onChange={(e) => handleChange('expiring_domain_days', e.target.value)}
              className="input w-32"
            />
          </div>
        </div>
      </div>

      {/* Email Settings */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Email Settings</h3>
            <p className="text-sm text-slate-500">SMTP configuration and email templates</p>
          </div>
          <button onClick={() => { fetchEmailStatus(); fetchEmailTemplates(); }} className="ml-auto btn-secondary text-sm py-1">
            <RefreshCw className={`w-4 h-4 ${emailLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* SMTP Status */}
        <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg mb-6">
          <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">SMTP Configuration</h4>
          {emailStatus ? (
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Host:</span>
                <span className="ml-2 font-mono">{emailStatus.host}</span>
              </div>
              <div>
                <span className="text-slate-500">Port:</span>
                <span className="ml-2 font-mono">{emailStatus.port}</span>
              </div>
              <div>
                <span className="text-slate-500">From:</span>
                <span className="ml-2">{emailStatus.fromName} &lt;{emailStatus.from}&gt;</span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>
                <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                  emailStatus.connected
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}>
                  {emailStatus.connected ? 'Connected' : 'Console Mode'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">Loading...</p>
          )}
        </div>

        {/* Test Email */}
        <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg mb-6">
          <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Send Test Email</h4>
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="test@example.com"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              className="input flex-1"
            />
            <button
              onClick={sendTestEmail}
              disabled={sendingTest || !testEmailAddress}
              className="btn-primary disabled:opacity-50"
            >
              {sendingTest ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Test
            </button>
          </div>
        </div>

        {/* Email Templates */}
        <div>
          <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Email Templates</h4>
          <div className="space-y-2">
            {emailLoading ? (
              <div className="text-center py-4">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
              </div>
            ) : emailTemplates.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">No templates found</p>
            ) : (
              emailTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{template.name}</p>
                    <p className="text-sm text-slate-500">{template.template_key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      template.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                      {template.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => previewTemplate(template.id)}
                      className="p-1.5 text-slate-400 hover:text-primary-600"
                      title="Preview"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingTemplate({ ...template })}
                      className="p-1.5 text-slate-400 hover:text-primary-600"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Template Edit Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b dark:border-slate-700 p-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Edit Template: {editingTemplate.name}</h3>
              <button onClick={() => setEditingTemplate(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <input
                  type="text"
                  value={editingTemplate.description || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subject</label>
                <input
                  type="text"
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  className="input w-full font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Use {"{{variable}}"} for dynamic content</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">HTML Content</label>
                <textarea
                  value={editingTemplate.html_content}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, html_content: e.target.value })}
                  className="input w-full h-64 font-mono text-sm resize-y"
                />
                {editingTemplate.variables?.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Available variables: {editingTemplate.variables.map(v => `{{${v}}}`).join(', ')}
                  </p>
                )}
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingTemplate.is_active}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Active</span>
                </label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t dark:border-slate-700 p-4 flex justify-end gap-3">
              <button onClick={() => setEditingTemplate(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveTemplate} disabled={savingTemplate} className="btn-primary disabled:opacity-50">
                {savingTemplate ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {previewingTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="border-b dark:border-slate-700 p-4 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Template Preview</h3>
                <p className="text-sm text-slate-500">Subject: {previewingTemplate.subject}</p>
              </div>
              <button onClick={() => setPreviewingTemplate(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div
                className="bg-white rounded-lg shadow-sm"
                dangerouslySetInnerHTML={{ __html: previewingTemplate.html }}
              />
            </div>
            <div className="border-t dark:border-slate-700 p-4 flex justify-end">
              <button onClick={() => setPreviewingTemplate(null)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Mode */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Maintenance Mode</h3>
            <p className="text-sm text-slate-500">Temporarily disable public access</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                Maintenance Mode: {settings.maintenance_mode === 'true' ? (
                  <span className="text-red-600">ENABLED</span>
                ) : (
                  <span className="text-green-600">Disabled</span>
                )}
              </p>
              <p className="text-sm text-slate-500">When enabled, only admins can access the site</p>
            </div>
            <button
              onClick={toggleMaintenance}
              className={settings.maintenance_mode === 'true' ? 'btn-primary' : 'btn-secondary text-red-600 border-red-300 hover:bg-red-50'}
            >
              {settings.maintenance_mode === 'true' ? 'Disable' : 'Enable'} Maintenance
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Maintenance Message
            </label>
            <textarea
              value={settings.maintenance_message || ''}
              onChange={(e) => handleChange('maintenance_message', e.target.value)}
              className="input w-full h-24 resize-none"
              placeholder="We are currently performing maintenance. Please check back soon."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminSettings;
