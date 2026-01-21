import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';
import { API_URL } from '../config/api';
import { useAuth } from '../App';

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('verifying'); // verifying, success, error, resend
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    } else {
      setStatus('resend');
      setMessage('No verification token provided. Enter your email to resend the verification link.');
    }
  }, [token]);

  const verifyEmail = async (verificationToken) => {
    try {
      const res = await fetch(`${API_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verificationToken })
      });

      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        setMessage(data.message || 'Email verified successfully!');

        // If we got a token, log the user in
        if (data.token) {
          // Fetch user data and log in
          const userRes = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${data.token}` }
          });
          if (userRes.ok) {
            const userData = await userRes.json();
            login(userData, data.token);
            setTimeout(() => navigate('/'), 2000);
          }
        }
      } else {
        setStatus('error');
        setMessage(data.error || 'Verification failed');
      }
    } catch (err) {
      setStatus('error');
      setMessage('An error occurred during verification');
    }
  };

  const resendVerification = async () => {
    if (!email) return;

    setResending(true);
    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message || 'Verification email sent!');
        setStatus('resend-success');
      } else {
        setMessage(data.error || 'Failed to resend verification email');
      }
    } catch (err) {
      setMessage('An error occurred. Please try again.');
    }
    setResending(false);
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === 'verifying' && (
          <>
            <Loader2 className="w-16 h-16 text-primary-600 animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Verifying Your Email
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Please wait while we verify your email address...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Email Verified!
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {message}
            </p>
            <p className="text-sm text-slate-500">
              Redirecting you to the homepage...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Verification Failed
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {message}
            </p>
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Need a new verification link? Enter your email below:
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input flex-1"
                />
                <button
                  onClick={resendVerification}
                  disabled={resending || !email}
                  className="btn-primary disabled:opacity-50"
                >
                  {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resend'}
                </button>
              </div>
            </div>
          </>
        )}

        {(status === 'resend' || status === 'resend-success') && (
          <>
            <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-10 h-10 text-primary-600 dark:text-primary-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {status === 'resend-success' ? 'Email Sent!' : 'Resend Verification'}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {message}
            </p>
            {status !== 'resend-success' && (
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input flex-1"
                />
                <button
                  onClick={resendVerification}
                  disabled={resending || !email}
                  className="btn-primary disabled:opacity-50"
                >
                  {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
                </button>
              </div>
            )}
            {status === 'resend-success' && (
              <button
                onClick={() => navigate('/')}
                className="btn-primary"
              >
                Go to Homepage
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default VerifyEmail;
