import React, { useState, useEffect } from 'react';
import { Search, Check, X, ShoppingCart, Loader2, Sparkles, Shield, Clock, Headphones, Globe, Lock, Zap } from 'lucide-react';
import { API_URL } from '../../config/api';

function DomainSearch({ onAddToCart }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      const res = await fetch(`${API_URL}/domains/pricing`);
      if (res.ok) {
        const data = await res.json();
        setPricing(data);
      }
    } catch (err) {
      console.error('Error fetching pricing:', err);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setSearching(true);
    setError(null);
    setResults(null);
    setSuggestions([]);

    let domain = searchTerm.toLowerCase().trim();
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');

    try {
      const res = await fetch(`${API_URL}/domains/check/${domain}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to check domain');
        setSearching(false);
        return;
      }

      const data = await res.json();
      setResults(data);

      const sld = domain.split('.')[0];
      const suggestRes = await fetch(`${API_URL}/domains/suggestions/${sld}`);
      if (suggestRes.ok) {
        const suggestData = await suggestRes.json();
        setSuggestions(suggestData.filter(s => s.domain !== data.domain));
      }
    } catch (err) {
      setError('Failed to check domain availability');
    }

    setSearching(false);
  };

  const handleAddToCart = (domain, tld, price) => {
    onAddToCart({
      item_type: 'register',
      domain_name: domain.split('.')[0],
      tld: tld,
      years: 1,
      options: {}
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white py-20 lg:py-28">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Instant domain registration
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
            Your Domain, Your{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">
              Identity
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            Secure your online presence with a domain that represents you.
            Fast registration, competitive pricing, full control.
          </p>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-8">
            <div className="relative flex items-center bg-white rounded-2xl shadow-2xl shadow-indigo-500/20">
              <Globe className="absolute left-5 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Find your domain name..."
                className="w-full px-14 py-5 text-lg rounded-2xl text-slate-900 placeholder-slate-400
                           focus:outline-none focus:ring-4 focus:ring-indigo-500/30"
              />
              <button
                type="submit"
                disabled={searching || !searchTerm.trim()}
                className="absolute right-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {searching ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span className="hidden sm:inline">Search</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Popular TLDs */}
          <div className="flex flex-wrap justify-center gap-3">
            {pricing.slice(0, 6).map((p) => (
              <button
                key={p.tld}
                onClick={() => setSearchTerm(prev => {
                  const sld = prev.split('.')[0] || 'example';
                  return `${sld}.${p.tld}`;
                })}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 backdrop-blur border border-white/10 rounded-lg text-sm font-medium transition-colors"
              >
                <span className="text-indigo-400">.{p.tld}</span>
                <span className="text-slate-400 ml-2">${parseFloat(p.price_register).toFixed(0)}</span>
              </button>
            ))}
          </div>

          {/* Trust indicators */}
          <div className="mt-12 flex flex-wrap justify-center gap-8 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>SSL Secured</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>Instant Activation</span>
            </div>
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-emerald-400" />
              <span>Expert Support</span>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      {(results || error) && (
        <section className="py-12 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl mb-6 flex items-center gap-3">
                <X className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            {results && (
              <div className="space-y-6">
                {/* Primary Result */}
                <div className={`bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border-2 ${
                  results.available ? 'border-emerald-500' : 'border-slate-200 dark:border-slate-700'
                }`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                        results.available
                          ? 'bg-emerald-100 dark:bg-emerald-900/30'
                          : 'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        {results.available ? (
                          <Check className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <X className="w-7 h-7 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
                          {results.domain}
                        </h2>
                        <p className={`text-sm font-medium ${
                          results.available
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {results.available ? 'Available for registration' : 'Already registered'}
                        </p>
                      </div>
                    </div>

                    {results.available && (
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                            ${results.pricing.register.toFixed(2)}
                          </p>
                          <p className="text-sm text-slate-500">per year</p>
                        </div>
                        <button
                          onClick={() => handleAddToCart(results.domain, results.tld, results.pricing.register)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center gap-2"
                        >
                          <ShoppingCart className="w-5 h-5" />
                          Add to Cart
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Suggestions */}
                {suggestions.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                      <Sparkles className="w-5 h-5 text-indigo-500" />
                      Alternative Options
                    </h3>
                    <div className="grid gap-3">
                      {suggestions.map((s) => (
                        <div
                          key={s.domain}
                          className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              s.available
                                ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                : 'bg-slate-100 dark:bg-slate-800'
                            }`}>
                              {s.available ? (
                                <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <X className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {s.domain}
                            </span>
                          </div>

                          {s.available && (
                            <div className="flex items-center gap-4 sm:ml-auto">
                              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                ${s.price.toFixed(2)}/yr
                              </span>
                              <button
                                onClick={() => handleAddToCart(s.domain, s.tld, s.price)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                              >
                                Add to Cart
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Pricing Table */}
      {!results && !error && pricing.length > 0 && (
        <section className="py-20 bg-white dark:bg-slate-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
                Domain Pricing
              </h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
                Straightforward pricing with no hidden fees. Renewal rates are locked in at registration.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {pricing.map((p) => (
                <div
                  key={p.tld}
                  className="bg-slate-50 dark:bg-slate-800 rounded-xl p-6 text-center border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors group"
                >
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-2 group-hover:scale-110 transition-transform">
                    .{p.tld}
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    ${parseFloat(p.price_register).toFixed(2)}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">first year</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Renew ${parseFloat(p.price_renew).toFixed(2)}/yr
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
              Everything You Need
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
              More than just domain registration. Get the tools and support to build your online presence.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mb-5">
                <Zap className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Full DNS Control
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Manage nameservers, A records, CNAME, MX, and more through our intuitive control panel.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center mb-5">
                <Lock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                WHOIS Privacy
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Keep your personal information private. Protect against spam and unwanted contact.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center mb-5">
                <Shield className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Domain Security
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                Transfer lock, two-factor authentication, and expiration alerts keep your domains secure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-indigo-600 to-indigo-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to claim your domain?
          </h2>
          <p className="text-indigo-100 mb-8 text-lg">
            Search above to get started. Registration takes less than 2 minutes.
          </p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="bg-white text-indigo-600 font-semibold py-3 px-8 rounded-xl hover:bg-indigo-50 transition-colors"
          >
            Search Domains
          </button>
        </div>
      </section>
    </div>
  );
}

export default DomainSearch;
