import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import DomainSearch from './components/domains/DomainSearch';
import AuthModal from './components/auth/AuthModal';
import CartSidebar from './components/cart/CartSidebar';
import Dashboard from './components/dashboard/Dashboard';
import Checkout from './components/checkout/Checkout';
import AdminDashboard from './components/admin/AdminDashboard';
import SettingsPage from './pages/Settings';
import OrdersPage from './pages/Orders';
import ContactsPage from './pages/Contacts';
import TermsPage from './pages/Terms';
import PrivacyPage from './pages/Privacy';
import RefundPage from './pages/Refund';
import VerifyEmailPage from './pages/VerifyEmail';
import LoginPage from './pages/Login';
import ForgotPasswordPage from './pages/ForgotPassword';
import ResetPasswordPage from './pages/ResetPassword';
import { API_URL } from './config/api';

// Error Boundary for catching React rendering errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <div className="max-w-md mx-auto text-center p-8">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Something went wrong</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">We encountered an unexpected error. Please refresh the page to try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


// Theme Context
const ThemeContext = createContext();

export function useTheme() {
  return useContext(ThemeContext);
}

// Auth Context
const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

// Cart Context
const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

// Protected Route Component
function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, token } = useAuth();

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (requireAdmin && !user?.is_admin && user?.role_level < 3) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// Main App Content with Router
// Maintenance Page Component
function MaintenancePage({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-lg mx-auto text-center p-8">
        <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">Under Maintenance</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mb-6">{message}</p>
        <p className="text-sm text-slate-500 dark:text-slate-500">
          We apologize for the inconvenience. Please check back soon.
        </p>
      </div>
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  // Maintenance mode state
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  // Site config state (fetched from API)
  const [siteConfig, setSiteConfig] = useState(null);

  // Theme state - use localStorage if set, otherwise wait for site config default
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    // Return dark as initial default, will be updated by site config fetch
    return 'dark';
  });

  // Fetch site config (including default_theme) on mount
  useEffect(() => {
    const fetchSiteConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/site-config`);
        if (res.ok) {
          const config = await res.json();
          setSiteConfig(config);
          // Apply default theme if user hasn't set a preference
          const savedTheme = localStorage.getItem('theme');
          if (!savedTheme && config.default_theme) {
            setTheme(config.default_theme);
          }
        }
      } catch (err) {
        console.error('Failed to fetch site config:', err);
      }
    };
    fetchSiteConfig();
  }, []);

  // Auth state
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authLoading, setAuthLoading] = useState(true);

  // Impersonation state
  const [isImpersonating, setIsImpersonating] = useState(() => !!localStorage.getItem('originalAdminToken'));
  const [originalAdminUser, setOriginalAdminUser] = useState(() => {
    const saved = localStorage.getItem('originalAdminUser');
    return saved ? JSON.parse(saved) : null;
  });

  // Cart state
  const [cart, setCart] = useState({ items: [], subtotal: 0 });
  const [showCart, setShowCart] = useState(false);
  const [pendingCartItem, setPendingCartItem] = useState(null); // Item waiting for auth

  // Check for maintenance mode on API errors
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 503) {
        const data = await response.clone().json().catch(() => ({}));
        if (data.maintenance) {
          setMaintenanceMode(true);
          setMaintenanceMessage(data.message || 'We are currently performing maintenance.');
        }
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Fetch user - always fetch fresh data
  const fetchUser = useCallback(async () => {
    if (!token) {
      setAuthLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });

      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        // Apply user's saved theme preference if it's light or dark
        if (userData.theme_preference === 'light' || userData.theme_preference === 'dark') {
          setTheme(userData.theme_preference);
        }
      } else {
        logout();
      }
    } catch (error) {
      console.error('Error fetching user:', error.name || 'Error');
    } finally {
      setAuthLoading(false);
    }
  }, [token]);

  // Fetch cart - always fetch fresh data
  const fetchCart = useCallback(async () => {
    if (!token) {
      setCart({ items: [], subtotal: 0 });
      return;
    }

    try {
      const res = await fetch(`${API_URL}/cart`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache'
        }
      });

      if (res.ok) {
        const cartData = await res.json();
        setCart(cartData);
      }
    } catch (error) {
      console.error('Error fetching cart:', error.name || 'Error');
    }
  }, [token]);

  // Check auth on mount and when token changes
  useEffect(() => {
    const controller = new AbortController();
    fetchUser(controller.signal);
    return () => controller.abort();
  }, [fetchUser]);

  // Fetch cart when user logs in or route changes
  useEffect(() => {
    if (!token) {
      setCart({ items: [], subtotal: 0 });
      return;
    }
    
    const controller = new AbortController();
    fetchCart(controller.signal);
    return () => controller.abort();
  }, [token, location.pathname, fetchCart]);

  const login = async (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    setShowAuthModal(false);
    toast.success(`Welcome, ${userData.username}!`);

    // Check if there's a pending cart item from before auth
    if (pendingCartItem) {
      const item = pendingCartItem;
      setPendingCartItem(null); // Clear it first

      // Add the item to cart now that we're authenticated
      try {
        const res = await fetch(`${API_URL}/cart/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(item)
        });

        if (res.ok) {
          await fetchCart();
          setShowCart(true);
          toast.success(`Added ${item.domain_name}.${item.tld} to cart`);
        } else {
          const error = await res.json();
          toast.error(error.error || 'Failed to add to cart');
        }
      } catch (error) {
        console.error('Error adding pending item to cart:', error);
        toast.error('Failed to add item to cart');
      }
    } else {
      // No pending item - just fetch cart normally
      fetchCart();
    }
  };

  const logout = () => {
    // If impersonating, also clear impersonation data
    if (isImpersonating) {
      localStorage.removeItem('originalAdminToken');
      localStorage.removeItem('originalAdminUser');
      setIsImpersonating(false);
      setOriginalAdminUser(null);
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    setCart({ items: [], subtotal: 0 });
    navigate('/');
    toast.success('Logged out successfully');
  };

  // Impersonate a user (admin only)
  const impersonate = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/impersonate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const error = await res.json();
        toast.error(error.error || 'Failed to impersonate user');
        return false;
      }

      const data = await res.json();

      // Save current admin token and user before switching
      localStorage.setItem('originalAdminToken', token);
      localStorage.setItem('originalAdminUser', JSON.stringify(user));
      setOriginalAdminUser(user);
      setIsImpersonating(true);

      // Switch to impersonated user
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);

      toast.success(`Now viewing as ${data.user.username}`);
      navigate('/dashboard');
      return true;
    } catch (error) {
      console.error('Impersonation error:', error);
      toast.error('Failed to impersonate user');
      return false;
    }
  };

  // Stop impersonation and return to admin account
  const stopImpersonation = () => {
    const originalToken = localStorage.getItem('originalAdminToken');
    const originalUser = localStorage.getItem('originalAdminUser');

    if (!originalToken || !originalUser) {
      toast.error('Could not restore admin session');
      logout();
      return;
    }

    // Restore admin token and user
    setToken(originalToken);
    setUser(JSON.parse(originalUser));
    localStorage.setItem('token', originalToken);

    // Clear impersonation data
    localStorage.removeItem('originalAdminToken');
    localStorage.removeItem('originalAdminUser');
    setIsImpersonating(false);
    setOriginalAdminUser(null);

    toast.success('Returned to admin account');
    navigate('/admin');
  };

  const openAuth = (mode = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const addToCart = async (item) => {
    if (!token) {
      // Store the item and prompt for auth - will be added after login/register
      setPendingCartItem(item);
      openAuth('login');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/cart/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(item)
      });

      if (res.ok) {
        await fetchCart();
        setShowCart(true);
        toast.success(`Added ${item.domain_name}.${item.tld} to cart`);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to add to cart');
      }
    } catch (error) {
      console.error('Error adding to cart:', error.name || 'Error');
      toast.error('Failed to add to cart');
    }
  };

  const removeFromCart = async (itemId) => {
    try {
      const res = await fetch(`${API_URL}/cart/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        await fetchCart();
        toast.success('Removed from cart');
      }
    } catch (error) {
      console.error('Error removing from cart:', error.name || 'Error');
      toast.error('Failed to remove from cart');
    }
  };

  const updateTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  // Show maintenance page if site is in maintenance mode (unless user is admin or on /login page)
  const isLoginPage = location.pathname === '/login';
  if (maintenanceMode && !isLoginPage && (!user || (!user.is_admin && user.role_level < 3))) {
    return <MaintenancePage message={maintenanceMessage} />;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme: updateTheme }}>
      <AuthContext.Provider value={{ user, token, login, logout, openAuth, fetchUser, isImpersonating, originalAdminUser, impersonate, stopImpersonation }}>
        <CartContext.Provider value={{ cart, addToCart, removeFromCart, fetchCart, showCart, setShowCart }}>
          <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
            {/* Impersonation Banner */}
            {isImpersonating && (
              <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-4 text-sm font-medium sticky top-0 z-50">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Viewing as: <strong>{user?.username}</strong> ({user?.email})
                </span>
                <button
                  onClick={stopImpersonation}
                  className="bg-white text-amber-600 px-3 py-1 rounded-lg hover:bg-amber-50 transition-colors font-semibold"
                >
                  Switch Back to {originalAdminUser?.username}
                </button>
              </div>
            )}
            <Navbar />

            <main className="flex-1">
              <Routes>
                <Route path="/" element={<DomainSearch onAddToCart={addToCart} />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/orders"
                  element={
                    <ProtectedRoute>
                      <OrdersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/contacts"
                  element={
                    <ProtectedRoute>
                      <ContactsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/checkout"
                  element={
                    <ProtectedRoute>
                      <Checkout onComplete={() => { fetchCart(); navigate('/dashboard'); }} />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requireAdmin={true}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/refund" element={<RefundPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>

            <Footer />

            {/* Auth Modal */}
            {showAuthModal && (
              <AuthModal
                mode={authMode}
                onClose={() => {
                  setShowAuthModal(false);
                  setPendingCartItem(null); // Clear pending item if modal closed without auth
                }}
                onSwitchMode={setAuthMode}
              />
            )}

            {/* Cart Sidebar */}
            {showCart && (
              <CartSidebar
                onClose={() => setShowCart(false)}
                onCheckout={() => { setShowCart(false); navigate('/checkout'); }}
              />
            )}
          </div>

          {/* Toast Notifications */}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'var(--toast-bg, #1e293b)',
                color: 'var(--toast-color, #f1f5f9)',
              },
              success: {
                iconTheme: {
                  primary: '#10B981',
                  secondary: '#ffffff',
                },
              },
              error: {
                iconTheme: {
                  primary: '#EF4444',
                  secondary: '#ffffff',
                },
              },
            }}
          />
        </CartContext.Provider>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <Router>
      <AppContent />
    </Router>
    </ErrorBoundary>
  );
}

export default App;
