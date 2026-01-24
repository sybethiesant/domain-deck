import React, { useState, useEffect } from 'react';
import { User, Lock, Palette, Save, Loader2, CreditCard, Trash2, Star, Shield, ShieldCheck, ShieldOff, Copy, RefreshCw } from 'lucide-react';
import { useAuth, useTheme } from '../App';
import { API_URL } from '../config/api';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user, token, fetchUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);

  // Profile form state
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'US'
  });

  // Password form state
  const [passwords, setPasswords] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisableModal, setShowDisableModal] = useState(false);

  // Fetch payment methods
  const fetchPaymentMethods = async () => {
    if (!token) return;
    setLoadingPaymentMethods(true);
    try {
      const res = await fetch(`${API_URL}/stripe/payment-methods`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data.paymentMethods || []);
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
    } finally {
      setLoadingPaymentMethods(false);
    }
  };

  // Load profile data fresh on mount
  useEffect(() => {
    if (user) {
      setProfile({
        full_name: user.full_name || '',
        email: user.email || '',
        phone: user.phone || '',
        company_name: user.company_name || '',
        address_line1: user.address_line1 || '',
        address_line2: user.address_line2 || '',
        city: user.city || '',
        state: user.state || '',
        postal_code: user.postal_code || '',
        country: user.country || 'US'
      });
    }
  }, [user]);

  // Load payment methods when tab changes to billing
  useEffect(() => {
    if (activeTab === 'billing' && token) {
      fetchPaymentMethods();
    }
  }, [activeTab, token]);

  // Fetch 2FA status when security tab is active
  useEffect(() => {
    if (activeTab === 'security' && token) {
      fetch2FAStatus();
    }
  }, [activeTab, token]);

  // Fetch 2FA status
  const fetch2FAStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/2fa/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTwoFactorEnabled(data.enabled);
      }
    } catch (error) {
      console.error('Failed to fetch 2FA status:', error);
    }
  };

  // Start 2FA setup
  const start2FASetup = async () => {
    setTwoFactorLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/setup`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setQrCode(data.qrCode);
        setTotpSecret(data.secret);
        setSetupMode(true);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to start 2FA setup');
      }
    } catch (error) {
      toast.error('Failed to start 2FA setup');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  // Verify and enable 2FA
  const verify2FA = async () => {
    if (verificationCode.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }

    setTwoFactorLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: verificationCode })
      });

      if (res.ok) {
        const data = await res.json();
        setBackupCodes(data.backupCodes);
        setShowBackupCodes(true);
        setSetupMode(false);
        setTwoFactorEnabled(true);
        setVerificationCode('');
        toast.success('Two-factor authentication enabled');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Invalid verification code');
      }
    } catch (error) {
      toast.error('Failed to verify 2FA code');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  // Disable 2FA
  const disable2FA = async () => {
    if (!disablePassword) {
      toast.error('Please enter your password');
      return;
    }

    setTwoFactorLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/disable`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: disablePassword })
      });

      if (res.ok) {
        setTwoFactorEnabled(false);
        setShowDisableModal(false);
        setDisablePassword('');
        toast.success('Two-factor authentication disabled');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to disable 2FA');
      }
    } catch (error) {
      toast.error('Failed to disable 2FA');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  // Regenerate backup codes
  const regenerateBackupCodes = async () => {
    setTwoFactorLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/regenerate-backup-codes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setBackupCodes(data.backupCodes);
        setShowBackupCodes(true);
        toast.success('New backup codes generated');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to regenerate backup codes');
      }
    } catch (error) {
      toast.error('Failed to regenerate backup codes');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  // Copy backup codes to clipboard
  const copyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
    toast.success('Backup codes copied to clipboard');
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch(`${API_URL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(profile)
      });

      if (res.ok) {
        await fetchUser();
        toast.success('Profile updated successfully');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to update profile');
      }
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();

    if (passwords.new_password !== passwords.confirm_password) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwords.new_password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`${API_URL}/auth/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: passwords.current_password,
          new_password: passwords.new_password
        })
      });

      if (res.ok) {
        setPasswords({ current_password: '', new_password: '', confirm_password: '' });
        toast.success('Password changed successfully');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to change password');
      }
    } catch (error) {
      toast.error('Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = async (newTheme) => {
    setTheme(newTheme);

    try {
      await fetch(`${API_URL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ theme_preference: newTheme })
      });
    } catch (error) {
      console.error('Failed to save theme preference');
    }
  };

  // Set payment method as default
  const handleSetDefaultPaymentMethod = async (pmId) => {
    try {
      const res = await fetch(`${API_URL}/stripe/payment-methods/${pmId}/default`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Default payment method updated');
        fetchPaymentMethods();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to update default payment method');
      }
    } catch (error) {
      toast.error('Failed to update default payment method');
    }
  };

  // Delete payment method
  const handleDeletePaymentMethod = async (pmId) => {
    if (!window.confirm('Are you sure you want to remove this payment method?')) return;

    try {
      const res = await fetch(`${API_URL}/stripe/payment-methods/${pmId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Payment method removed');
        fetchPaymentMethods();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to remove payment method');
      }
    } catch (error) {
      toast.error('Failed to remove payment method');
    }
  };

  // Get card brand icon/display
  const getCardBrandDisplay = (brand) => {
    const brands = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      diners: 'Diners Club',
      jcb: 'JCB',
      unionpay: 'UnionPay'
    };
    return brands[brand?.toLowerCase()] || brand || 'Card';
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'appearance', label: 'Appearance', icon: Palette }
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
        Account Settings
      </h1>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        {/* Tab Navigation */}
        <div className="border-b border-slate-200 dark:border-slate-700">
          <nav className="flex -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={profile.company_name}
                    onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Address</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Address Line 1
                    </label>
                    <input
                      type="text"
                      value={profile.address_line1}
                      onChange={(e) => setProfile({ ...profile, address_line1: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Address Line 2
                    </label>
                    <input
                      type="text"
                      value={profile.address_line2}
                      onChange={(e) => setProfile({ ...profile, address_line2: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={profile.city}
                      onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      State/Province
                    </label>
                    <input
                      type="text"
                      value={profile.state}
                      onChange={(e) => setProfile({ ...profile, state: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Postal Code
                    </label>
                    <input
                      type="text"
                      value={profile.postal_code}
                      onChange={(e) => setProfile({ ...profile, postal_code: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Country
                    </label>
                    <select
                      value={profile.country}
                      onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="GB">United Kingdom</option>
                      <option value="AU">Australia</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-8">
              {/* Two-Factor Authentication Section */}
              <div className="pb-8 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${twoFactorEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
                    {twoFactorEnabled ? (
                      <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Shield className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">Two-Factor Authentication</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {twoFactorEnabled
                        ? 'Your account is protected with 2FA'
                        : 'Add an extra layer of security to your account'}
                    </p>
                  </div>
                </div>

                {/* 2FA Status & Actions */}
                {!setupMode && !showBackupCodes && (
                  <div className="max-w-md">
                    {twoFactorEnabled ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                          <span className="text-sm text-green-700 dark:text-green-300">Two-factor authentication is enabled</span>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={regenerateBackupCodes}
                            disabled={twoFactorLoading}
                            className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                          >
                            <RefreshCw className={`w-4 h-4 ${twoFactorLoading ? 'animate-spin' : ''}`} />
                            New Backup Codes
                          </button>
                          <button
                            onClick={() => setShowDisableModal(true)}
                            className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <ShieldOff className="w-4 h-4" />
                            Disable 2FA
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Use an authenticator app like Google Authenticator, Authy, or 1Password to generate one-time codes.
                        </p>
                        <button
                          onClick={start2FASetup}
                          disabled={twoFactorLoading}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {twoFactorLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                          Enable Two-Factor Authentication
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 2FA Setup Mode */}
                {setupMode && (
                  <div className="max-w-md space-y-6">
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <h4 className="font-medium text-slate-900 dark:text-white mb-2">Step 1: Scan QR Code</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        Scan this QR code with your authenticator app
                      </p>
                      <div className="flex justify-center mb-4">
                        <img src={qrCode} alt="2FA QR Code" className="w-48 h-48 rounded-lg border border-slate-200 dark:border-slate-600" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Can't scan? Enter this code manually:</p>
                        <code className="text-sm font-mono bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded select-all">
                          {totpSecret}
                        </code>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <h4 className="font-medium text-slate-900 dark:text-white mb-2">Step 2: Enter Verification Code</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        Enter the 6-digit code from your authenticator app
                      </p>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setSetupMode(false);
                          setVerificationCode('');
                        }}
                        className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={verify2FA}
                        disabled={twoFactorLoading || verificationCode.length !== 6}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {twoFactorLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Verify & Enable
                      </button>
                    </div>
                  </div>
                )}

                {/* Backup Codes Display */}
                {showBackupCodes && (
                  <div className="max-w-md space-y-4">
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">Save Your Backup Codes</h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Store these codes in a safe place. Each code can only be used once if you lose access to your authenticator app.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {backupCodes.map((code, index) => (
                          <code key={index} className="text-sm font-mono bg-white dark:bg-slate-600 px-3 py-2 rounded border border-slate-200 dark:border-slate-500 text-center">
                            {code}
                          </code>
                        ))}
                      </div>
                      <button
                        onClick={copyBackupCodes}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600"
                      >
                        <Copy className="w-4 h-4" />
                        Copy All Codes
                      </button>
                    </div>

                    <button
                      onClick={() => setShowBackupCodes(false)}
                      className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      I've Saved My Backup Codes
                    </button>
                  </div>
                )}
              </div>

              {/* Password Change Section */}
              <div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Change Password</h3>
                <form onSubmit={handlePasswordChange} className="max-w-md space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={passwords.current_password}
                      onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
                      required
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwords.new_password}
                      onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
                      required
                      minLength={8}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={passwords.confirm_password}
                      onChange={(e) => setPasswords({ ...passwords, confirm_password: e.target.value })}
                      required
                      minLength={8}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Change Password
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Disable 2FA Modal */}
          {showDisableModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <ShieldOff className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Disable Two-Factor Authentication</h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  This will remove the extra security from your account. Enter your password to confirm.
                </p>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2 mb-4 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowDisableModal(false);
                      setDisablePassword('');
                    }}
                    className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={disable2FA}
                    disabled={twoFactorLoading || !disablePassword}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {twoFactorLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Disable 2FA
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Saved Payment Methods</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Your saved payment methods are used for domain renewals when auto-renew is enabled.
                </p>

                {loadingPaymentMethods ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  </div>
                ) : paymentMethods.length === 0 ? (
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-6 text-center">
                    <CreditCard className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <h4 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No Payment Methods</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Your payment method will be saved automatically when you make a purchase.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {paymentMethods.map((pm) => (
                      <div
                        key={pm.id}
                        className={`flex items-center justify-between p-4 rounded-lg border ${
                          pm.isDefault
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-8 bg-slate-200 dark:bg-slate-600 rounded flex items-center justify-center">
                            <CreditCard className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900 dark:text-white">
                                {getCardBrandDisplay(pm.brand)} ending in {pm.last4}
                              </span>
                              {pm.isDefault && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-full">
                                  <Star className="w-3 h-3" />
                                  Default
                                </span>
                              )}
                            </div>
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                              Expires {pm.expMonth}/{pm.expYear}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!pm.isDefault && (
                            <button
                              onClick={() => handleSetDefaultPaymentMethod(pm.id)}
                              className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                            >
                              Set as default
                            </button>
                          )}
                          <button
                            onClick={() => handleDeletePaymentMethod(pm.id)}
                            className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            title="Remove payment method"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">About Auto-Renewal</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    When auto-renew is enabled for a domain, we'll automatically charge your default payment method
                    30 days before the domain expires. You'll receive an email notification before the charge.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Theme</h3>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  {[
                    { id: 'light', label: 'Light', icon: '☀️' },
                    { id: 'dark', label: 'Dark', icon: '🌙' }
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleThemeChange(option.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                        theme === option.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
