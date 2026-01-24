import React, { useState } from 'react';
import { X, Loader2, Eye, EyeOff, Globe, Mail, CheckCircle, Shield, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';

function AuthModal({ mode, onClose, onSwitchMode }) {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    phone: '',
    company_name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'US'
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
  };

  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login'
        ? { email: formData.email, password: formData.password }
        : formData;

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle verification required (login attempt with unverified email)
        if (data.requiresVerification) {
          setVerificationEmail(data.email || formData.email);
          setVerificationSent(true);
          setError('Please verify your email address to log in. Check your inbox for the verification link.');
          setLoading(false);
          return;
        }
        setError(data.error || 'Something went wrong');
        setLoading(false);
        return;
      }

      // Handle 2FA required
      if (data.requires2FA) {
        setTwoFactorToken(data.twoFactorToken);
        setRequires2FA(true);
        setLoading(false);
        return;
      }

      // Handle registration that requires verification
      if (data.requiresVerification) {
        setVerificationEmail(formData.email);
        setVerificationSent(true);
        setLoading(false);
        return;
      }

      login(data.user, data.token);
      setLoading(false);
    } catch (err) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail })
      });
      const data = await res.json();
      if (res.ok) {
        setError(null);
        alert('Verification email sent! Please check your inbox.');
      } else {
        setError(data.error || 'Failed to resend verification email');
      }
    } catch (err) {
      setError('Failed to resend verification email');
    }
    setLoading(false);
  };

  const handle2FASubmit = async (e) => {
    e.preventDefault();
    if (!twoFactorCode) {
      setError('Please enter your verification code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/auth/2fa/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twoFactorToken,
          code: twoFactorCode,
          isBackupCode: useBackupCode
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid verification code');
        setLoading(false);
        return;
      }

      login(data.user, data.token);
      setLoading(false);
    } catch (err) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  const back2FAToLogin = () => {
    setRequires2FA(false);
    setTwoFactorToken('');
    setTwoFactorCode('');
    setUseBackupCode(false);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full ${mode === 'register' ? 'max-w-2xl max-h-[90vh] overflow-y-auto' : 'max-w-md'} animate-scale-in`}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 2FA Verification View */}
        {requires2FA ? (
          <div className="p-6">
            <button
              onClick={back2FAToLogin}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-primary-600 dark:text-primary-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                Two-Factor Authentication
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                {useBackupCode
                  ? 'Enter one of your backup codes'
                  : 'Enter the 6-digit code from your authenticator app'}
              </p>
            </div>

            <form onSubmit={handle2FASubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <input
                  type="text"
                  inputMode={useBackupCode ? 'text' : 'numeric'}
                  pattern={useBackupCode ? undefined : '[0-9]*'}
                  maxLength={useBackupCode ? 12 : 6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(useBackupCode ? e.target.value : e.target.value.replace(/\D/g, ''))}
                  placeholder={useBackupCode ? 'XXXX-XXXX' : '000000'}
                  className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || (!useBackupCode && twoFactorCode.length !== 6) || (useBackupCode && !twoFactorCode)}
                className="btn-primary w-full py-3 text-base"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  'Verify'
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    setTwoFactorCode('');
                    setError(null);
                  }}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {useBackupCode
                    ? 'Use authenticator app instead'
                    : "Can't access your authenticator? Use a backup code"}
                </button>
              </div>
            </form>
          </div>
        ) : verificationSent && !error ? (
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Check Your Email
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              We've sent a verification link to:
            </p>
            <p className="font-medium text-slate-900 dark:text-slate-100 mb-6">
              {verificationEmail}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Click the link in the email to verify your account. The link will expire in 24 hours.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={resendVerification}
                disabled={loading}
                className="btn-secondary w-full"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Resend Verification Email
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-primary w-full"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
        {/* Header */}
        <div className="p-6 pb-0 text-center">
          <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Globe className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {mode === 'login'
              ? 'Sign in to manage your domains'
              : 'Start your domain journey'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
              {verificationSent && (
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={loading}
                  className="ml-2 underline hover:no-underline"
                >
                  Resend verification email
                </button>
              )}
            </div>
          )}

          {mode === 'register' && (
            <>
              {/* Account Info Section */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9_]+"
                    className="input"
                    placeholder="your_username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    required
                    className="input"
                    placeholder="John Doe"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="input"
                    placeholder="+1.5551234567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Company <span className="text-slate-400 text-xs">(optional)</span>
                  </label>
                  <input
                    type="text"
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleChange}
                    className="input"
                    placeholder="Company name"
                  />
                </div>
              </div>

              {/* Address Section */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Billing Address</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Street Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="address_line1"
                      value={formData.address_line1}
                      onChange={handleChange}
                      required
                      className="input"
                      placeholder="123 Main Street"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Address Line 2 <span className="text-slate-400 text-xs">(optional)</span>
                    </label>
                    <input
                      type="text"
                      name="address_line2"
                      value={formData.address_line2}
                      onChange={handleChange}
                      className="input"
                      placeholder="Apt, Suite, Unit"
                    />
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        required
                        className="input"
                        placeholder="City"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        State <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="state"
                        value={formData.state}
                        onChange={handleChange}
                        required
                        className="input"
                        placeholder="CA"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        ZIP <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="postal_code"
                        value={formData.postal_code}
                        onChange={handleChange}
                        required
                        className="input"
                        placeholder="12345"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      required
                      className="input"
                    >
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="GB">United Kingdom</option>
                      <option value="AU">Australia</option>
                      <option value="DE">Germany</option>
                      <option value="FR">France</option>
                      <option value="NL">Netherlands</option>
                      <option value="IN">India</option>
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="input"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={mode === 'register' ? 12 : 1}
                className="input pr-10"
                placeholder={mode === 'register' ? 'At least 12 characters' : 'Your password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-base"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : mode === 'login' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="px-6 pb-6 text-center space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => onSwitchMode('register')}
                  className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => onSwitchMode('login')}
                  className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
          {mode === 'login' && (
            <p className="text-sm">
              <a
                href="/forgot-password"
                className="text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400"
              >
                Forgot your password?
              </a>
            </p>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

export default AuthModal;
