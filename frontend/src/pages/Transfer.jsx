import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, AlertCircle, Loader2, ShoppingCart, Key, Globe, Info, ChevronRight } from 'lucide-react';
import { useAuth, useCart } from '../App';
import { API_URL } from '../config/api';
import { toast } from 'react-hot-toast';

function Transfer() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { refreshCart } = useCart();
  const [domain, setDomain] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [transferInfo, setTransferInfo] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const parseDomain = (input) => {
    const cleaned = input.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    const parts = cleaned.split('.');
    if (parts.length >= 2) {
      const tld = parts.slice(1).join('.');
      const sld = parts[0];
      return { sld, tld };
    }
    return null;
  };

  const checkDomain = async () => {
    if (!domain) {
      setError('Please enter a domain name');
      return;
    }

    const parsed = parseDomain(domain);
    if (!parsed) {
      setError('Invalid domain format. Please enter like "example.com"');
      return;
    }

    setError('');
    setChecking(true);
    setTransferInfo(null);

    try {
      // Check if domain is available (should NOT be available for transfer)
      const checkRes = await fetch(`${API_URL}/domains/check/${parsed.sld}.${parsed.tld}`);
      const checkData = await checkRes.json();

      if (checkData.available) {
        setError('This domain is available for registration, not transfer. Would you like to register it instead?');
        setTransferInfo({ available: true, sld: parsed.sld, tld: parsed.tld });
        setChecking(false);
        return;
      }

      // Get TLD pricing
      const pricingRes = await fetch(`${API_URL}/domains/pricing`);
      const pricingData = await pricingRes.json();
      const tldPricing = pricingData.find(p => p.tld === parsed.tld);

      if (!tldPricing) {
        setError(`We don't currently support transfers for .${parsed.tld} domains`);
        setChecking(false);
        return;
      }

      setTransferInfo({
        available: false,
        sld: parsed.sld,
        tld: parsed.tld,
        price: parseFloat(tldPricing.transfer),
        registrar: checkData.registrar || 'Current Registrar'
      });
    } catch (err) {
      setError('Failed to check domain. Please try again.');
    }
    setChecking(false);
  };

  const addToCart = async () => {
    if (!token) {
      toast.error('Please log in to initiate a transfer');
      return;
    }

    if (!authCode.trim()) {
      setError('Please enter the authorization code (EPP code) from your current registrar');
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`${API_URL}/cart/add`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          item_type: 'transfer',
          domain_name: transferInfo.sld,
          tld: transferInfo.tld,
          years: 1,
          options: {
            auth_code: authCode.trim()
          }
        })
      });

      if (res.ok) {
        toast.success('Transfer added to cart');
        refreshCart();
        navigate('/checkout');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to add to cart');
      }
    } catch (err) {
      toast.error('Failed to add to cart');
    }
    setAdding(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            Transfer Your Domain
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Move your domain to WorxTech for better prices and management
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Before you begin</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-300">
                <li>Unlock your domain at your current registrar</li>
                <li>Obtain the authorization code (EPP/Auth code)</li>
                <li>Ensure the domain was registered at least 60 days ago</li>
                <li>Disable WHOIS privacy (temporarily, if enabled)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Domain Input */}
        <div className="card p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Domain Name
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && checkDomain()}
                    placeholder="example.com"
                    className="input pl-10 w-full"
                  />
                </div>
                <button
                  onClick={checkDomain}
                  disabled={checking || !domain}
                  className="btn-primary"
                >
                  {checking ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Check<ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Available for Registration - offer register instead */}
            {transferInfo?.available && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">This domain is available!</span>
                </div>
                <p className="text-sm text-green-600 dark:text-green-400 mb-3">
                  You can register this domain instead of transferring it.
                </p>
                <button
                  onClick={() => navigate(`/?search=${transferInfo.sld}.${transferInfo.tld}`)}
                  className="btn-primary"
                >
                  Register {transferInfo.sld}.{transferInfo.tld}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Transfer Details */}
        {transferInfo && !transferInfo.available && (
          <div className="card p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
              <div>
                <p className="text-sm text-slate-500">Domain to Transfer</p>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {transferInfo.sld}.{transferInfo.tld}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Transfer Price</p>
                <p className="text-2xl font-bold text-accent-600">
                  ${transferInfo.price?.toFixed(2)}
                </p>
                <p className="text-xs text-slate-500">+1 year added to expiration</p>
              </div>
            </div>

            {/* Auth Code Input */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Authorization Code (EPP Code)
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Enter the code from your current registrar"
                  className="input pl-10 w-full font-mono"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Get this code from your current registrar's control panel
              </p>
            </div>

            {/* Transfer Features */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
              <p className="font-medium text-slate-900 dark:text-slate-100 mb-3">What you get:</p>
              <ul className="space-y-2">
                {[
                  'Free 1-year extension added to your domain',
                  'Easy DNS management',
                  'WHOIS privacy available',
                  'Auto-renewal option',
                  '24/7 support'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Check className="w-4 h-4 text-accent-600" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Add to Cart Button */}
            <button
              onClick={addToCart}
              disabled={adding || !authCode.trim()}
              className="btn-primary w-full py-3"
            >
              {adding ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Add Transfer to Cart - ${transferInfo.price?.toFixed(2)}
                </>
              )}
            </button>

            {!token && (
              <p className="text-center text-sm text-slate-500">
                <button
                  onClick={() => navigate('/login')}
                  className="text-primary-600 hover:underline"
                >
                  Log in
                </button>
                {' '}or{' '}
                <button
                  onClick={() => navigate('/login?register=true')}
                  className="text-primary-600 hover:underline"
                >
                  create an account
                </button>
                {' '}to continue
              </p>
            )}
          </div>
        )}

        {/* Transfer Steps */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 text-center">
            How Domain Transfer Works
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                step: 1,
                title: 'Unlock & Get Code',
                desc: 'Unlock your domain at your current registrar and obtain the authorization code.'
              },
              {
                step: 2,
                title: 'Initiate Transfer',
                desc: 'Enter your domain and auth code above, then complete checkout.'
              },
              {
                step: 3,
                title: 'Approve Transfer',
                desc: 'Confirm the transfer via email. Transfer completes in 5-7 days.'
              }
            ].map((item) => (
              <div key={item.step} className="card p-4 text-center">
                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-3">
                  <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{item.step}</span>
                </div>
                <h3 className="font-medium text-slate-900 dark:text-slate-100 mb-1">{item.title}</h3>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Transfer;
