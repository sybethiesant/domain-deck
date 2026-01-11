import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { ArrowLeft, CreditCard, Lock, Check, Loader2, AlertCircle } from 'lucide-react';
import { useCart, useAuth } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';

// Stripe promise will be initialized when we get the publishable key
let stripePromise = null;

// Payment form component (must be inside Elements provider)
function PaymentForm({ clientSecret, onSuccess, billingAddress }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

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
        return_url: `${window.location.origin}/checkout`,
        payment_method_data: {
          billing_details: {
            name: `${billingAddress.first_name} ${billingAddress.last_name}`,
            email: billingAddress.email,
            phone: billingAddress.phone,
            address: {
              line1: billingAddress.address_line1,
              city: billingAddress.city,
              state: billingAddress.state,
              postal_code: billingAddress.postal_code,
              country: billingAddress.country
            }
          }
        }
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
    <form onSubmit={handleSubmit}>
      <PaymentElement
        options={{
          layout: 'tabs'
        }}
      />

      {error && (
        <div className="mt-4 flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        className="btn-primary w-full py-3 mt-6"
      >
        {processing ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        ) : (
          <>
            <Lock className="w-4 h-4 mr-2" />
            Pay Now
          </>
        )}
      </button>
    </form>
  );
}

function Checkout({ onComplete }) {
  const { cart, fetchCart } = useCart();
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('review'); // review, payment, complete
  const [orderNumber, setOrderNumber] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [stripeConfigured, setStripeConfigured] = useState(false);

  const [contactInfo, setContactInfo] = useState({
    first_name: user?.full_name?.split(' ')[0] || '',
    last_name: user?.full_name?.split(' ').slice(1).join(' ') || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address_line1: user?.address_line1 || '',
    city: user?.city || '',
    state: user?.state || '',
    postal_code: user?.postal_code || '',
    country: 'US'
  });

  // Initialize Stripe and get config
  useEffect(() => {
    async function initStripe() {
      try {
        const res = await fetch(`${API_URL}/stripe/config`);
        const config = await res.json();

        if (config.publishableKey && config.configured) {
          stripePromise = loadStripe(config.publishableKey);
          setStripeConfigured(true);
        } else {
          setStripeConfigured(false);
        }
      } catch (err) {
        console.error('Failed to load Stripe config:', err);
        setStripeConfigured(false);
      }
      setLoading(false);
    }

    initStripe();
  }, []);

  const handleContactChange = (e) => {
    setContactInfo({ ...contactInfo, [e.target.name]: e.target.value });
  };

  // Validate contact info
  const validateContactInfo = () => {
    const required = ['first_name', 'last_name', 'email', 'address_line1', 'city', 'state', 'postal_code'];
    for (const field of required) {
      if (!contactInfo[field]?.trim()) {
        return false;
      }
    }
    return true;
  };

  // Proceed to payment
  const handleProceedToPayment = async () => {
    if (!validateContactInfo()) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create payment intent
      const res = await fetch(`${API_URL}/stripe/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          billing_address: contactInfo
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize payment');
      }

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      setStep('payment');
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    }

    setLoading(false);
  };

  // Handle payment success
  const handlePaymentSuccess = async (paymentIntent) => {
    setLoading(true);

    try {
      // Create order
      const res = await fetch(`${API_URL}/orders/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          payment_intent_id: paymentIntent.id,
          billing_address: contactInfo
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create order');
      }

      setOrderNumber(data.order.order_number);
      setStep('complete');
      await fetchCart();
      toast.success('Order placed successfully!');
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    }

    setLoading(false);
  };

  // Fallback for when Stripe is not configured
  const handlePlaceOrderWithoutPayment = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/orders/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          billing_address: contactInfo
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to place order');
      }

      setOrderNumber(data.order.order_number);
      setStep('complete');
      await fetchCart();
      toast.success('Order placed! (Payment pending)');
    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  };

  // Order complete view
  if (step === 'complete') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
          Order Placed Successfully!
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2">
          Your order number is:
        </p>
        <p className="text-xl font-mono font-bold text-indigo-600 dark:text-indigo-400 mb-8">
          {orderNumber}
        </p>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          We're processing your domain registration. You'll receive an email confirmation shortly.
        </p>
        <button onClick={onComplete} className="btn-primary">
          View My Domains
        </button>
      </div>
    );
  }

  // Payment step
  if (step === 'payment' && clientSecret && stripeConfigured) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <button
            onClick={() => setStep('review')}
            className="flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Review
          </button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Payment
          </h1>
        </div>

        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Order Total: ${cart.subtotal.toFixed(2)}
          </h2>

          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: document.documentElement.classList.contains('dark') ? 'night' : 'stripe',
                variables: {
                  colorPrimary: '#4F46E5',
                  borderRadius: '8px'
                }
              }
            }}
          >
            <PaymentForm
              clientSecret={clientSecret}
              onSuccess={handlePaymentSuccess}
              billingAddress={contactInfo}
            />
          </Elements>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          Your payment is secured with 256-bit SSL encryption
        </p>
      </div>
    );
  }

  // Review step (default)
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onComplete}
          className="flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Checkout
        </h1>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Information */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Contact Information
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={contactInfo.first_name}
                  onChange={handleContactChange}
                  required
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={contactInfo.last_name}
                  onChange={handleContactChange}
                  required
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={contactInfo.email}
                  onChange={handleContactChange}
                  required
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={contactInfo.phone}
                  onChange={handleContactChange}
                  className="input"
                />
              </div>
            </div>
          </div>

          {/* Billing Address */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Billing Address
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Street Address *
                </label>
                <input
                  type="text"
                  name="address_line1"
                  value={contactInfo.address_line1}
                  onChange={handleContactChange}
                  required
                  className="input"
                />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={contactInfo.city}
                    onChange={handleContactChange}
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    State *
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={contactInfo.state}
                    onChange={handleContactChange}
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    ZIP Code *
                  </label>
                  <input
                    type="text"
                    name="postal_code"
                    value={contactInfo.postal_code}
                    onChange={handleContactChange}
                    required
                    className="input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Preview */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Payment Method
            </h2>
            {stripeConfigured ? (
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                <CreditCard className="w-6 h-6" />
                <span>Credit or Debit Card (Stripe)</span>
              </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-4 py-3 rounded-lg text-sm">
                <strong>Note:</strong> Stripe payment is not configured yet.
                Orders will be created in pending status.
              </div>
            )}
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="card p-6 sticky top-24">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Order Summary
            </h2>

            <div className="space-y-3 mb-4">
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <div>
                    <span className="text-slate-900 dark:text-slate-100 font-mono">
                      {item.domain_name}.{item.tld}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 text-xs ml-2">
                      ({item.item_type})
                    </span>
                  </div>
                  <span className="text-slate-900 dark:text-slate-100">
                    ${parseFloat(item.price).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mb-6">
              <div className="flex justify-between text-lg font-semibold">
                <span className="text-slate-900 dark:text-slate-100">Total</span>
                <span className="text-slate-900 dark:text-slate-100">
                  ${cart.subtotal.toFixed(2)}
                </span>
              </div>
            </div>

            {stripeConfigured ? (
              <button
                onClick={handleProceedToPayment}
                disabled={loading || cart.items.length === 0}
                className="btn-primary w-full py-3"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Proceed to Payment
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handlePlaceOrderWithoutPayment}
                disabled={loading || cart.items.length === 0}
                className="btn-primary w-full py-3"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" />
                    Place Order
                  </>
                )}
              </button>
            )}

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-4">
              By placing your order, you agree to our Terms of Service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
