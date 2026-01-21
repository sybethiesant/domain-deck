import { useState, useEffect } from 'react';
import { X, Shield, Check, AlertCircle, Loader2, Wallet } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { API_URL } from '../../config/api';

// Stripe promise loaded dynamically from API config
let stripePromise = null;

// Inner form component that uses Stripe hooks
function AutoRenewForm({ domainId, domainName, renewalPrice, setupIntentId, onSuccess, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Confirm the Setup Intent with the payment element
      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href, // Required but won't redirect for most payment methods
        },
        redirect: 'if_required', // Only redirect if payment method requires it
      });

      if (stripeError) {
        setError(stripeError.message);
        setLoading(false);
        return;
      }

      if (setupIntent && setupIntent.status === 'succeeded') {
        // Confirm with our backend
        const token = localStorage.getItem('token');
        const confirmResponse = await fetch(`${API_URL}/domains/${domainId}/confirm-auto-renew`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ setup_intent_id: setupIntentId })
        });

        if (!confirmResponse.ok) {
          const data = await confirmResponse.json();
          throw new Error(data.error || 'Failed to confirm setup');
        }

        const data = await confirmResponse.json();
        onSuccess(data);
      } else {
        setError('Payment setup failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Failed to save payment method');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Domain info */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-indigo-500" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{domainName}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Renewal price: ${renewalPrice?.toFixed(2) || '14.99'}/year
            </p>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="space-y-2">
        <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
          <span>You will NOT be charged today</span>
        </div>
        <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
          <span>Payment method validated and saved for renewal</span>
        </div>
        <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
          <span>Automatic renewal 30 days before expiration</span>
        </div>
        <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Check className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
          <span>Cancel anytime from your dashboard</span>
        </div>
      </div>

      {/* Payment Element - shows all available payment methods */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          <Wallet className="w-4 h-4 inline mr-2" />
          Payment Method
        </label>
        <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-3 bg-white dark:bg-slate-700">
          <PaymentElement />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Shield className="w-4 h-4" />
              Enable Auto-Renew
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// Main modal component
export default function AutoRenewSetupModal({ isOpen, onClose, domain, onSuccess }) {
  const [success, setSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [setupIntentId, setSetupIntentId] = useState(null);
  const [initError, setInitError] = useState(null);

  // Create fresh Setup Intent when modal opens
  useEffect(() => {
    if (isOpen && domain) {
      setSuccess(false);
      setSuccessData(null);
      setClientSecret(null);
      setSetupIntentId(null);
      setInitError(null);

      const createSetupIntent = async () => {
        try {
          // First, get Stripe config from API
          const configRes = await fetch(`${API_URL}/stripe/config`);
          const config = await configRes.json();

          if (!config.publishableKey) {
            throw new Error('Payment processing is not configured');
          }

          // Initialize Stripe with the key from API
          stripePromise = loadStripe(config.publishableKey);

          const token = localStorage.getItem('token');
          const response = await fetch(`${API_URL}/domains/${domain.id}/setup-auto-renew`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to initialize payment setup');
          }

          const data = await response.json();
          setClientSecret(data.clientSecret);
          setSetupIntentId(data.setupIntentId);
        } catch (err) {
          setInitError(err.message || 'Failed to initialize payment setup');
        }
      };

      createSetupIntent();
    }
  }, [isOpen, domain]);

  if (!isOpen || !domain) return null;

  const handleSuccess = (data) => {
    setSuccess(true);
    setSuccessData(data);
    // Auto-close after showing success
    setTimeout(() => {
      onSuccess?.(data);
      onClose();
    }, 2000);
  };

  const handleClose = () => {
    setSuccess(false);
    setSuccessData(null);
    setClientSecret(null);
    setSetupIntentId(null);
    setInitError(null);
    onClose();
  };

  // Stripe Elements options
  const elementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#4f46e5',
        colorBackground: '#ffffff',
        colorText: '#1e293b',
        colorDanger: '#ef4444',
        fontFamily: 'system-ui, sans-serif',
        borderRadius: '8px',
      },
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {success ? 'Auto-Renew Enabled!' : 'Set Up Auto-Renew'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Auto-Renew Enabled!
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                {domain.domain_name}.{domain.tld} will automatically renew before expiration.
              </p>
              {successData?.paymentMethod && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {successData.paymentMethod.brand} ending in {successData.paymentMethod.last4} will be charged
                </p>
              )}
            </div>
          ) : initError ? (
            <div className="text-center py-8">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{initError}</span>
              </div>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>
          ) : !clientSecret ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <Elements stripe={stripePromise} options={elementsOptions} key={clientSecret}>
              <AutoRenewForm
                domainId={domain.id}
                domainName={`${domain.domain_name}.${domain.tld}`}
                renewalPrice={domain.renewalPrice}
                setupIntentId={setupIntentId}
                onSuccess={handleSuccess}
                onCancel={handleClose}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}
