import React, { useState, useEffect, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { ArrowLeft, CreditCard, Lock, Check, Loader2, AlertCircle, User, Plus, ChevronDown } from 'lucide-react';
import { useCart, useAuth } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';

// Stripe promise will be initialized when we get the publishable key
let stripePromise = null;

// User-friendly labels for ccTLD extended attributes
// These replace cryptic eNom attribute names with plain English
// Note: Backend now provides descriptions, but we can override/enhance them here
const FRIENDLY_LABELS = {
  // .US domain requirements
  us_nexus: {
    label: 'US Connection',
    placeholder: 'Select how you are connected to the US...'
  },
  us_purpose: {
    label: 'Domain Purpose',
    placeholder: 'Select what this domain will be used for...'
  },
  // .UK domain requirements
  uk_legal_type: {
    label: 'Registrant Type',
    placeholder: 'Select your registrant type...'
  },
  // .EU domain requirements
  eu_country: {
    label: 'EU Country',
    placeholder: 'Select your EU country...'
  },
  // .CA domain requirements
  ca_legal_type: {
    label: 'Canadian Entity Type',
    placeholder: 'Select your entity type...'
  },
  // .AU domain requirements
  au_registrant_id_type: {
    label: 'Australian ID Type',
    placeholder: 'Select your ID type...'
  },
  au_registrant_id: {
    label: 'ID Number',
    placeholder: 'Enter your ABN, ACN, or TM number'
  },
  // .IN domain requirements (India)
  in_aadharnumber: {
    label: 'Aadhaar Number',
    placeholder: 'Enter 12-digit Aadhaar number (optional)'
  },
  in_panumber: {
    label: 'PAN Number',
    placeholder: 'Enter PAN (e.g., ABCDE1234F) (optional)'
  },
  // Generic fallback formatter
  _formatName: (name) => {
    // Remove TLD prefix (e.g., "us_", "uk_") and format nicely
    const withoutPrefix = name.replace(/^[a-z]{2,3}_/, '');
    return withoutPrefix
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\bId\b/g, 'ID')
      .replace(/\bAadharnumber\b/g, 'Aadhaar Number')
      .replace(/\bPanumber\b/g, 'PAN Number');
  }
};

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

  // Contact selection state
  const [savedContacts, setSavedContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [contactMode, setContactMode] = useState('select'); // 'select' or 'new'
  const [selectedContactId, setSelectedContactId] = useState(null);

  // Auto-renew toggle (default ON)
  const [autoRenew, setAutoRenew] = useState(true);

  // TLD requirements state (for ccTLDs like .in, .uk, .eu)
  const [tldRequirements, setTldRequirements] = useState({});
  const [extendedAttributes, setExtendedAttributes] = useState({});
  const [loadingRequirements, setLoadingRequirements] = useState(false);

  // Contact form state (for new contact entry)
  const [contactInfo, setContactInfo] = useState({
    first_name: user?.full_name?.split(' ')[0] || '',
    last_name: user?.full_name?.split(' ').slice(1).join(' ') || '',
    organization: '',
    email: user?.email || '',
    phone: user?.phone || '',
    address_line1: user?.address_line1 || '',
    address_line2: '',
    city: user?.city || '',
    state: user?.state || '',
    postal_code: user?.postal_code || '',
    country: 'US'
  });

  // Fetch saved contacts
  useEffect(() => {
    async function fetchContacts() {
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/contacts`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const contacts = await res.json();
          setSavedContacts(contacts || []);
          // Auto-select default contact if available
          const defaultContact = contacts?.find(c => c.is_default);
          if (defaultContact) {
            setSelectedContactId(defaultContact.id);
            setContactMode('select');
          } else if (contacts?.length > 0) {
            setSelectedContactId(contacts[0].id);
            setContactMode('select');
          } else {
            setContactMode('new'); // No saved contacts, force new entry
          }
        }
      } catch (err) {
        console.error('Failed to fetch contacts:', err);
        setContactMode('new');
      }
      setLoadingContacts(false);
    }
    fetchContacts();
  }, [token]);

  // Fetch TLD requirements when cart changes
  useEffect(() => {
    async function fetchTldRequirements() {
      if (!cart?.items?.length) return;

      // Get unique TLDs from cart
      const tlds = [...new Set(cart.items.map(item => item.tld))];
      if (tlds.length === 0) return;

      setLoadingRequirements(true);
      try {
        const res = await fetch(`${API_URL}/domains/tld-requirements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tlds })
        });

        if (res.ok) {
          const requirements = await res.json();
          setTldRequirements(requirements);

          // Initialize extended attributes state for each required field
          const attrs = {};
          Object.entries(requirements).forEach(([tld, req]) => {
            if (req.hasRequirements) {
              req.attributes.forEach(attr => {
                if (!attrs[`${tld}_${attr.name}`]) {
                  attrs[`${tld}_${attr.name}`] = '';
                }
              });
            }
          });
          setExtendedAttributes(prev => ({ ...prev, ...attrs }));
        }
      } catch (err) {
        console.error('Failed to fetch TLD requirements:', err);
      }
      setLoadingRequirements(false);
    }
    fetchTldRequirements();
  }, [cart?.items]);

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

  // Handle payment success from redirect-based methods (defined before useEffect that uses it)
  const handleRedirectPaymentSuccess = useCallback(async (paymentIntentId) => {
    setLoading(true);

    try {
      // Get contact, auto_renew, and extended attributes from localStorage (stored before redirect)
      const storedContact = localStorage.getItem('checkout_registrant_contact');
      const storedAutoRenew = localStorage.getItem('checkout_auto_renew');
      const storedExtAttrs = localStorage.getItem('checkout_extended_attributes');
      if (!storedContact) {
        throw new Error('Contact information not found. Please try checkout again.');
      }

      const registrantContact = JSON.parse(storedContact);
      const savedAutoRenew = storedAutoRenew ? JSON.parse(storedAutoRenew) : true;
      const savedExtAttrs = storedExtAttrs ? JSON.parse(storedExtAttrs) : {};

      // Clear stored data
      localStorage.removeItem('checkout_registrant_contact');
      localStorage.removeItem('checkout_auto_renew');
      localStorage.removeItem('checkout_extended_attributes');

      // Create order with the payment intent and extended attributes
      const res = await fetch(`${API_URL}/orders/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
          billing_address: registrantContact,
          registrant_contact: registrantContact,
          auto_renew: savedAutoRenew,
          extended_attributes: savedExtAttrs
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
  }, [token, fetchCart]);

  // Handle redirect callback from payment methods like Amazon Pay, etc.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentIntentId = urlParams.get('payment_intent');
    const redirectStatus = urlParams.get('redirect_status');

    if (paymentIntentId && redirectStatus) {
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);

      if (redirectStatus === 'succeeded') {
        // Payment succeeded via redirect - complete the order
        handleRedirectPaymentSuccess(paymentIntentId);
      } else {
        setError(`Payment ${redirectStatus}. Please try again.`);
      }
    }
  }, [handleRedirectPaymentSuccess]);

  const handleContactChange = (e) => {
    setContactInfo({ ...contactInfo, [e.target.name]: e.target.value });
  };

  const handleExtendedAttributeChange = (key, value) => {
    setExtendedAttributes(prev => ({ ...prev, [key]: value }));
  };

  // Check if any TLDs in cart have special requirements
  const hasSpecialRequirements = () => {
    return Object.values(tldRequirements).some(req => req?.hasRequirements);
  };

  // Get required extended attributes that are missing
  const getMissingExtendedAttributes = () => {
    const missing = [];
    Object.entries(tldRequirements).forEach(([tld, req]) => {
      if (req?.hasRequirements) {
        req.attributes.forEach(attr => {
          if (attr.required && !extendedAttributes[`${tld}_${attr.name}`]?.trim()) {
            missing.push({ tld, attr });
          }
        });
      }
    });
    return missing;
  };

  // Get the registrant contact (selected or entered)
  const getRegistrantContact = () => {
    if (contactMode === 'select' && selectedContactId) {
      return savedContacts.find(c => c.id === selectedContactId);
    }
    return contactInfo;
  };

  // Validate contact info - phone is REQUIRED for ICANN compliance
  const validateContactInfo = () => {
    const contact = getRegistrantContact();
    if (!contact) return false;

    const required = ['first_name', 'last_name', 'email', 'phone', 'address_line1', 'city', 'state', 'postal_code'];
    for (const field of required) {
      if (!contact[field]?.trim()) {
        return false;
      }
    }
    return true;
  };

  // Validate extended attributes for ccTLDs
  const validateExtendedAttributes = () => {
    const missing = getMissingExtendedAttributes();
    return missing.length === 0;
  };

  // Proceed to payment
  const handleProceedToPayment = async () => {
    if (!validateContactInfo()) {
      setError('Please fill in all required contact fields including phone number (required for ICANN compliance)');
      return;
    }

    // Validate extended attributes for ccTLDs
    if (!validateExtendedAttributes()) {
      const missing = getMissingExtendedAttributes();
      const missingNames = missing.map(m => `${m.attr.name} for .${m.tld}`).join(', ');
      setError(`Please fill in required fields: ${missingNames}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const registrantContact = getRegistrantContact();

      // Store contact, auto_renew, and extended attributes for redirect-based payment methods
      localStorage.setItem('checkout_registrant_contact', JSON.stringify(registrantContact));
      localStorage.setItem('checkout_auto_renew', JSON.stringify(autoRenew));
      localStorage.setItem('checkout_extended_attributes', JSON.stringify(extendedAttributes));

      // Create payment intent
      const res = await fetch(`${API_URL}/stripe/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          billing_address: registrantContact
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
      const registrantContact = getRegistrantContact();

      // Create order with registrant contact and extended attributes
      const res = await fetch(`${API_URL}/orders/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          payment_intent_id: paymentIntent.id,
          billing_address: registrantContact,
          registrant_contact: registrantContact,
          auto_renew: autoRenew,
          extended_attributes: extendedAttributes
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
    if (!validateContactInfo()) {
      setError('Please fill in all required contact fields including phone');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const registrantContact = getRegistrantContact();

      const res = await fetch(`${API_URL}/orders/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          billing_address: registrantContact,
          registrant_contact: registrantContact,
          auto_renew: autoRenew
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
              billingAddress={getRegistrantContact()}
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
          {/* Registrant Contact - Required for domain registration */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Registrant Contact
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              This information will be used as the WHOIS contact for your domain registration.
              All fields are required for ICANN compliance.
            </p>

            {loadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : (
              <>
                {/* Contact selection mode */}
                {savedContacts.length > 0 && (
                  <div className="mb-6">
                    <div className="flex gap-4 mb-4">
                      <button
                        type="button"
                        onClick={() => setContactMode('select')}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                          contactMode === 'select'
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <User className="w-4 h-4 inline mr-2" />
                        Use Saved Contact
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactMode('new')}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                          contactMode === 'new'
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <Plus className="w-4 h-4 inline mr-2" />
                        Enter New Contact
                      </button>
                    </div>

                    {contactMode === 'select' && (
                      <div className="relative">
                        <select
                          value={selectedContactId || ''}
                          onChange={(e) => setSelectedContactId(parseInt(e.target.value))}
                          className="input appearance-none pr-10"
                        >
                          <option value="">Select a contact...</option>
                          {savedContacts.map(contact => (
                            <option key={contact.id} value={contact.id}>
                              {contact.first_name} {contact.last_name} - {contact.email}
                              {contact.is_default && ' (Default)'}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    )}
                  </div>
                )}

                {/* Show selected contact preview OR new contact form */}
                {contactMode === 'select' && selectedContactId ? (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                    {(() => {
                      const contact = savedContacts.find(c => c.id === selectedContactId);
                      if (!contact) return null;
                      return (
                        <div className="grid sm:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Name:</span>
                            <span className="ml-2 text-slate-900 dark:text-slate-100">
                              {contact.first_name} {contact.last_name}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Email:</span>
                            <span className="ml-2 text-slate-900 dark:text-slate-100">{contact.email}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Phone:</span>
                            <span className="ml-2 text-slate-900 dark:text-slate-100">{contact.phone}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Address:</span>
                            <span className="ml-2 text-slate-900 dark:text-slate-100">
                              {contact.city}, {contact.state} {contact.postal_code}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (contactMode === 'new' || savedContacts.length === 0) && (
                  <div className="space-y-4">
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
                          Organization
                        </label>
                        <input
                          type="text"
                          name="organization"
                          value={contactInfo.organization}
                          onChange={handleContactChange}
                          placeholder="Optional"
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
                          Phone * <span className="text-xs text-slate-500">(Include country code)</span>
                        </label>
                        <input
                          type="tel"
                          name="phone"
                          value={contactInfo.phone}
                          onChange={handleContactChange}
                          placeholder="+1.5551234567"
                          required
                          className="input"
                        />
                      </div>
                    </div>

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

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Address Line 2
                      </label>
                      <input
                        type="text"
                        name="address_line2"
                        value={contactInfo.address_line2}
                        onChange={handleContactChange}
                        placeholder="Apt, Suite, Unit (Optional)"
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
                          ZIP/Postal Code *
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

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Country *
                      </label>
                      <select
                        name="country"
                        value={contactInfo.country}
                        onChange={handleContactChange}
                        className="input"
                      >
                        <option value="US">United States</option>
                        <option value="CA">Canada</option>
                        <option value="GB">United Kingdom</option>
                        <option value="AU">Australia</option>
                        <option value="DE">Germany</option>
                        <option value="FR">France</option>
                      </select>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Extended Attributes for ccTLDs (like .in, .uk, .eu) */}
          {hasSpecialRequirements() && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Additional Registration Requirements
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Some domain extensions require additional information for registration compliance.
              </p>

              {loadingRequirements ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(tldRequirements).map(([tld, req]) => {
                    if (!req?.hasRequirements) return null;

                    // Get the domains in cart using this TLD
                    const domainsWithTld = cart.items
                      .filter(item => item.tld === tld)
                      .map(item => `${item.domain_name}.${item.tld}`);

                    return (
                      <div key={tld} className="border-l-4 border-indigo-500 pl-4">
                        <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-1">
                          .{tld.toUpperCase()} Requirements
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                          For: {domainsWithTld.join(', ')}
                        </p>

                        <div className="space-y-4">
                          {req.attributes.map(attr => {
                            const attrKey = `${tld}_${attr.name}`;
                            const hasOptions = attr.options && attr.options.length > 0;

                            // Get user-friendly label and description
                            const friendly = FRIENDLY_LABELS[attr.name] || {};
                            const displayLabel = friendly.label || FRIENDLY_LABELS._formatName(attr.name);
                            const displayDescription = friendly.description || attr.description;
                            const displayPlaceholder = friendly.placeholder || (hasOptions ? 'Select an option...' : `Enter ${displayLabel.toLowerCase()}`);

                            return (
                              <div key={attrKey}>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                  {displayLabel}
                                  {attr.required && <span className="text-red-500 ml-1">*</span>}
                                </label>
                                {displayDescription && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                    {displayDescription}
                                  </p>
                                )}

                                {hasOptions ? (
                                  <div className="relative">
                                    <select
                                      value={extendedAttributes[attrKey] || ''}
                                      onChange={(e) => handleExtendedAttributeChange(attrKey, e.target.value)}
                                      className="input appearance-none pr-10"
                                      required={attr.required}
                                    >
                                      <option value="">{displayPlaceholder}</option>
                                      {attr.options.map(opt => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.title || opt.value}
                                        </option>
                                      ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                  </div>
                                ) : (
                                  <input
                                    type="text"
                                    value={extendedAttributes[attrKey] || ''}
                                    onChange={(e) => handleExtendedAttributeChange(attrKey, e.target.value)}
                                    placeholder={displayPlaceholder}
                                    className="input"
                                    required={attr.required}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
                <div key={item.id} className="flex justify-between gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="text-slate-900 dark:text-slate-100 font-mono break-all">
                      {item.domain_name}.{item.tld}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 text-xs ml-2">
                      ({item.item_type})
                    </span>
                  </div>
                  <span className="text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    ${parseFloat(item.price).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Auto-Renew Toggle - only show for registrations */}
            {cart.items.some(item => item.item_type === 'register') && (
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mb-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Auto-Renew
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Automatically renew before expiration
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={autoRenew}
                      onChange={(e) => setAutoRenew(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                  </div>
                </label>
                {autoRenew && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                    Your payment method will be saved for automatic renewals
                  </p>
                )}
              </div>
            )}

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
