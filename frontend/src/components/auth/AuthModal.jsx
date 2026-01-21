import React, { useState } from 'react';
import { X, Loader2, Eye, EyeOff, Globe, Mail, CheckCircle } from 'lucide-react';
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
    full_name: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
  };

  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');

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

      // Handle registration that requires verification
      if (data.requiresVerification) {
        setVerificationEmail(formData.email);
        setVerificationSent(true);
        setLoading(false);
        return;
      }

      login(data.user, data.token);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Verification Sent View */}
        {verificationSent && !error ? (
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
              : 'Start your journey with WorxTech'}
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
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Username
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
                  Full Name
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  className="input"
                  placeholder="John Doe"
                />
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
        <div className="px-6 pb-6 text-center">
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
        </div>
        </>
        )}
      </div>
    </div>
  );
}

export default AuthModal;
