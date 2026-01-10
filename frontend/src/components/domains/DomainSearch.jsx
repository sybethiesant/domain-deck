import React, { useState, useEffect } from 'react';
import { Search, Check, X, ShoppingCart, Loader2, Sparkles } from 'lucide-react';
import { API_URL } from '../../config/api';

function DomainSearch({ onAddToCart }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [error, setError] = useState(null);

  // Fetch TLD pricing on mount
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

    // Clean and parse domain
    let domain = searchTerm.toLowerCase().trim();
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');

    try {
      // Check the primary domain
      const res = await fetch(`${API_URL}/domains/check/${domain}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to check domain');
        setSearching(false);
        return;
      }

      const data = await res.json();
      setResults(data);

      // Get suggestions
      const sld = domain.split('.')[0];
      const suggestRes = await fetch(`${API_URL}/domains/suggestions/${sld}`);
      if (suggestRes.ok) {
        const suggestData = await suggestRes.json();
        // Filter out the primary result
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
      <section className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
            Find Your Perfect Domain
          </h1>
          <p className="text-lg md:text-xl text-primary-100 mb-10 max-w-2xl mx-auto">
            Start your online journey with a memorable domain name.
            Search, register, and manage your domains with ease.
          </p>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search for your domain name..."
                className="w-full px-6 py-4 pr-32 text-lg rounded-xl text-slate-900 placeholder-slate-400
                           focus:outline-none focus:ring-4 focus:ring-primary-300 shadow-elevated"
              />
              <button
                type="submit"
                disabled={searching || !searchTerm.trim()}
                className="absolute right-2 btn-primary py-3 px-6 disabled:opacity-50"
              >
                {searching ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    Search
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Popular TLDs */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {pricing.slice(0, 6).map((p) => (
              <span
                key={p.tld}
                className="px-4 py-2 bg-white/10 backdrop-blur rounded-full text-sm font-medium"
              >
                .{p.tld} - ${parseFloat(p.price_register).toFixed(2)}/yr
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Results Section */}
      {(results || error) && (
        <section className="py-12 bg-slate-50 dark:bg-slate-900">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-6 py-4 rounded-xl mb-6">
                {error}
              </div>
            )}

            {results && (
              <div className="space-y-6">
                {/* Primary Result */}
                <div className={`card p-6 ${results.available ? 'ring-2 ring-accent-500' : ''}`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        results.available
                          ? 'bg-accent-100 dark:bg-accent-900/30'
                          : 'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        {results.available ? (
                          <Check className="w-6 h-6 text-accent-600 dark:text-accent-400" />
                        ) : (
                          <X className="w-6 h-6 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                          {results.domain}
                        </h2>
                        <p className={`text-sm ${
                          results.available
                            ? 'text-accent-600 dark:text-accent-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {results.available ? 'Available!' : 'Not available'}
                        </p>
                      </div>
                    </div>

                    {results.available && (
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                            ${results.pricing.register.toFixed(2)}
                          </p>
                          <p className="text-sm text-slate-500">per year</p>
                        </div>
                        <button
                          onClick={() => handleAddToCart(results.domain, results.tld, results.pricing.register)}
                          className="btn-success py-3 px-6"
                        >
                          <ShoppingCart className="w-5 h-5 mr-2" />
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
                      <Sparkles className="w-5 h-5 text-primary-500" />
                      More Options
                    </h3>
                    <div className="grid gap-3">
                      {suggestions.map((s) => (
                        <div
                          key={s.domain}
                          className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              s.available
                                ? 'bg-accent-100 dark:bg-accent-900/30'
                                : 'bg-slate-100 dark:bg-slate-800'
                            }`}>
                              {s.available ? (
                                <Check className="w-4 h-4 text-accent-600 dark:text-accent-400" />
                              ) : (
                                <X className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                              {s.domain}
                            </span>
                          </div>

                          {s.available && (
                            <div className="flex items-center gap-4 sm:ml-auto">
                              <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                                ${s.price.toFixed(2)}/yr
                              </span>
                              <button
                                onClick={() => handleAddToCart(s.domain, s.tld, s.price)}
                                className="btn-primary py-2 px-4 text-sm"
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
        <section className="py-16 bg-white dark:bg-slate-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-slate-100 mb-4">
              Domain Pricing
            </h2>
            <p className="text-center text-slate-600 dark:text-slate-400 mb-10 max-w-2xl mx-auto">
              Simple, transparent pricing. No hidden fees.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {pricing.map((p) => (
                <div key={p.tld} className="card p-5 text-center hover:shadow-elevated transition-shadow">
                  <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mb-1">
                    .{p.tld}
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    ${parseFloat(p.price_register).toFixed(2)}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">per year</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                    Renew: ${parseFloat(p.price_renew).toFixed(2)}/yr
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-16 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-slate-900 dark:text-slate-100 mb-12">
            Why Choose WorxTech?
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Easy Management',
                description: 'Intuitive dashboard to manage all your domains, DNS settings, and renewals in one place.'
              },
              {
                title: 'WHOIS Privacy',
                description: 'Protect your personal information with our WHOIS privacy protection service.'
              },
              {
                title: 'Secure & Reliable',
                description: 'Enterprise-grade security and 99.9% uptime guarantee for your peace of mind.'
              }
            ].map((feature, i) => (
              <div key={i} className="card p-6 text-center">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  {feature.title}
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default DomainSearch;
