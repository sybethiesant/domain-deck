import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, KeyRound, Eye, EyeOff, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../App';
import { API_URL } from '../config/api';

function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenEmail, setTokenEmail] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formData, setFormData] = useState({ password: '', confirm_password: '' });
  const [passwordErrors, setPasswordErrors] = useState([]);

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setError('No reset token provided');
        setVerifying(false);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (data.valid) {
          setTokenValid(true);
          setTokenEmail(data.email);
        } else {
          setError(data.error || 'Invalid or expired reset token');
        }
      } catch (err) {
        setError('Failed to verify reset token');
      }
      setVerifying(false);
      setLoading(false);
    };

    verifyToken();
  }, [token]);

  // Validate password
  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 12) errors.push('At least 12 characters');
    if (!/[A-Z]/.test(password)) errors.push('One uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('One lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('One number');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('One special character');
    return errors;
  };

  const handlePasswordChange = (e) => {
    const password = e.target.value;
    setFormData({ ...formData, password });
    setPasswordErrors(validatePassword(password));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      return;
    }

    const errors = validatePassword(formData.password);
    if (errors.length > 0) {
      setError('Password does not meet requirements');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          new_password: formData.password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        setLoading(false);
        return;
      }

      // Password reset successful - log them in
      if (data.token) {
        // Fetch user data with the new token
        const userRes = await fetch(`${API_URL}/auth/me`, {
          headers: { 'Authorization': `Bearer ${data.token}` }
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          login(userData, data.token);
        }
      }

      setSuccess(true);
    } catch (err) {
      setError('Connection error. Please try again.');
    }
    setLoading(false);
  };

  // Token verification in progress
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-500 mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Verifying reset link...</p>
          </div>
        </div>
      </div>
    );
  }

  // Token invalid
  if (!tokenValid && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Invalid Reset Link
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {error || 'This password reset link is invalid or has expired.'}
            </p>
            <Link to="/forgot-password" className="btn-primary inline-flex items-center">
              Request New Link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Password reset successful
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Password Reset Complete
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Your password has been successfully reset. You are now logged in.
            </p>
            <button
              onClick={() => navigate('/')}
              className="btn-primary"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Password reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Set New Password
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Create a new password for <strong>{tokenEmail}</strong>
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handlePasswordChange}
                  required
                  className="input pr-10"
                  placeholder="Create a strong password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Password requirements */}
              {formData.password && passwordErrors.length > 0 && (
                <div className="mt-2 text-xs">
                  <p className="text-slate-500 mb-1">Password must have:</p>
                  <ul className="space-y-0.5">
                    {['At least 12 characters', 'One uppercase letter', 'One lowercase letter', 'One number', 'One special character'].map((req) => (
                      <li
                        key={req}
                        className={passwordErrors.includes(req)
                          ? 'text-red-500'
                          : 'text-green-500'
                        }
                      >
                        {passwordErrors.includes(req) ? '- ' : '+ '}{req}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={formData.confirm_password}
                  onChange={(e) => { setFormData({ ...formData, confirm_password: e.target.value }); setError(null); }}
                  required
                  className="input pr-10"
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {formData.confirm_password && formData.password !== formData.confirm_password && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || passwordErrors.length > 0 || formData.password !== formData.confirm_password}
              className="btn-primary w-full py-3 text-base disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'Reset Password'
              )}
            </button>
          </form>

          {/* Back to login */}
          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 inline-flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;
