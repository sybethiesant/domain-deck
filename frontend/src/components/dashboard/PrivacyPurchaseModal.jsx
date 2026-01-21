import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X, Shield, Lock, Check, Loader2, AlertCircle, Eye, EyeOff, CreditCard } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';

let stripePromise = null;

// Payment form component (inside Elements provider)
function PrivacyPaymentForm({ clientSecret, onSuccess, onCancel, domainName, amount }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message);
      setProcessing(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/dashboard`
      },
      redirect: 'if_required'
    });

    if (confirmError) {
      setError(confirmError.message);
      setProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess(paymentIntent);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />

      {error && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          className="flex-1 px-4 py-2.5 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className="flex-1 btn-primary flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Pay ${(parseFloat(amount) || 0).toFixed(2)}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export default function PrivacyPurchaseModal({ domain, onClose, onSuccess }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [amount, setAmount] = useState(0);
  const [privacyStatus, setPrivacyStatus] = useState(null);

  // Validate domain prop
  if (!domain || !domain.id) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 max-w-md w-full">
          <div className="text-red-600 dark:text-red-400 flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Invalid domain</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Domain information is missing. Please try again.
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Initialize Stripe and create payment intent
  useEffect(() => {
    async function initPayment() {
      try {
        // Get Stripe config
        const configRes = await fetch(`${API_URL}/stripe/config`);
        const config = await configRes.json();

        if (!config.publishableKey) {
          throw new Error('Payment processing is not configured');
        }

        // Always create fresh stripePromise to avoid stale key issues
        stripePromise = loadStripe(config.publishableKey);

        // Create privacy purchase payment intent
        const res = await fetch(`${API_URL}/stripe/privacy-purchase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ domain_id: domain.id })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to initialize payment');
        }

        setClientSecret(data.clientSecret);
        setAmount(data.amount);
        setPrivacyStatus(data.privacyStatus);
      } catch (err) {
        console.error('[PrivacyPurchase] Error initializing:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    initPayment();
  }, [domain.id, token]);

  const handlePaymentSuccess = (paymentIntent) => {
    toast.success('WHOIS Privacy purchased successfully!');
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-500 to-purple-600">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                WHOIS Privacy Protection
              </h2>
              <p className="text-sm text-white/80">
                {domain.domain_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-12rem)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400">Preparing payment...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Benefits Section */}
              <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  What does WHOIS Privacy do?
                </h3>
                <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                  <li className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span><strong>Hide your personal information</strong> from public WHOIS lookups</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span><strong>Reduce spam and unwanted solicitations</strong> to your email and phone</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span><strong>Protect against identity theft</strong> and domain hijacking attempts</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span><strong>1-year protection</strong> that renews with your domain</span>
                  </li>
                </ul>
              </div>

              {/* Before/After Preview */}
              <div className="mb-6 grid grid-cols-2 gap-3">
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-2 text-red-700 dark:text-red-400">
                    <EyeOff className="w-4 h-4" />
                    <span className="text-xs font-medium">Without Privacy</span>
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-300 space-y-0.5">
                    <p>John Smith</p>
                    <p>123 Main Street</p>
                    <p>john@example.com</p>
                    <p>+1.5551234567</p>
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2 mb-2 text-emerald-700 dark:text-emerald-400">
                    <Eye className="w-4 h-4" />
                    <span className="text-xs font-medium">With Privacy</span>
                  </div>
                  <div className="text-xs text-emerald-600 dark:text-emerald-300 space-y-0.5">
                    <p>REDACTED FOR PRIVACY</p>
                    <p>REDACTED FOR PRIVACY</p>
                    <p>Contact via registrar</p>
                    <p>REDACTED</p>
                  </div>
                </div>
              </div>

              {/* Price Summary */}
              <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">WHOIS Privacy for 1 year</p>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                      Auto-renews with domain registration
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                      ${(parseFloat(amount) || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">/year</p>
                  </div>
                </div>
              </div>

              {/* Payment Form */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
                <div className="flex items-center gap-2 mb-4 text-sm text-slate-600 dark:text-slate-400">
                  <CreditCard className="w-4 h-4" />
                  <span>Secure payment powered by Stripe</span>
                </div>

                {clientSecret && stripePromise && (
                  <Elements
                    stripe={stripePromise}
                    options={{
                      clientSecret,
                      appearance: {
                        theme: document.documentElement.classList.contains('dark') ? 'night' : 'stripe',
                        variables: {
                          colorPrimary: '#4f46e5'
                        }
                      },
                      loader: 'auto'
                    }}
                    onLoadError={(error) => {
                      console.error('Stripe Elements load error:', error);
                      setError(`Stripe error: ${error.message || 'Failed to load payment form'}`);
                    }}
                  >
                    <PrivacyPaymentForm
                      clientSecret={clientSecret}
                      onSuccess={handlePaymentSuccess}
                      onCancel={onClose}
                      domainName={domain.domain_name}
                      amount={amount}
                    />
                  </Elements>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
