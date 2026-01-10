import React, { useState, useEffect } from 'react';
import { ArrowLeft, CreditCard, Lock, Check, Loader2 } from 'lucide-react';
import { useCart, useAuth } from '../../App';
import { API_URL } from '../../config/api';

function Checkout({ onComplete }) {
  const { cart, fetchCart } = useCart();
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('review'); // review, payment, complete
  const [orderNumber, setOrderNumber] = useState(null);

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

  const handleContactChange = (e) => {
    setContactInfo({ ...contactInfo, [e.target.name]: e.target.value });
  };

  const handlePlaceOrder = async () => {
    setLoading(true);
    setError(null);

    try {
      // For now, create order without actual Stripe payment
      // In production, integrate with Stripe Elements
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
        setError(data.error || 'Failed to place order');
        setLoading(false);
        return;
      }

      setOrderNumber(data.order.order_number);
      setStep('complete');
      await fetchCart();
    } catch (err) {
      setError('Connection error. Please try again.');
    }

    setLoading(false);
  };

  if (step === 'complete') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-accent-100 dark:bg-accent-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="w-8 h-8 text-accent-600 dark:text-accent-400" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
          Order Placed Successfully!
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2">
          Your order number is:
        </p>
        <p className="text-xl font-mono font-bold text-primary-600 dark:text-primary-400 mb-8">
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
        <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
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
                  First Name
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
                  Last Name
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
                  Email
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
                  Street Address
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
                    City
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
                    State
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
                    ZIP Code
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

          {/* Payment */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Payment Method
            </h2>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 text-center">
              <CreditCard className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-slate-600 dark:text-slate-400 text-sm">
                Stripe payment integration will be configured here.
                <br />
                For testing, orders will be created without payment.
              </p>
            </div>
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
                  <span className="text-slate-600 dark:text-slate-400 font-mono">
                    {item.domain_name}
                  </span>
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

            <button
              onClick={handlePlaceOrder}
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
