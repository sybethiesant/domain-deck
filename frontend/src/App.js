import React, { useState, useEffect, createContext, useContext } from 'react';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import DomainSearch from './components/domains/DomainSearch';
import AuthModal from './components/auth/AuthModal';
import CartSidebar from './components/cart/CartSidebar';
import Dashboard from './components/dashboard/Dashboard';
import Checkout from './components/checkout/Checkout';
import AdminDashboard from './components/admin/AdminDashboard';
import { API_URL } from './config/api';

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

function App() {
  // View state
  const [currentView, setCurrentView] = useState('home');

  // Theme state
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'system';
  });

  // Auth state
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');

  // Cart state
  const [cart, setCart] = useState({ items: [], subtotal: 0 });
  const [showCart, setShowCart] = useState(false);

  // Apply theme
  useEffect(() => {
    const applyTheme = () => {
      const isDark = theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
    };

    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', applyTheme);
      return () => mediaQuery.removeEventListener('change', applyTheme);
    }
  }, [theme]);

  // Check auth on mount
  useEffect(() => {
    if (token) {
      fetchUser();
    }
  }, [token]);

  // Fetch cart when user logs in
  useEffect(() => {
    if (token) {
      fetchCart();
    } else {
      setCart({ items: [], subtotal: 0 });
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        if (userData.theme_preference && userData.theme_preference !== 'system') {
          setTheme(userData.theme_preference);
        }
      } else {
        logout();
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  };

  const fetchCart = async () => {
    try {
      const res = await fetch(`${API_URL}/cart`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const cartData = await res.json();
        setCart(cartData);
      }
    } catch (error) {
      console.error('Error fetching cart:', error);
    }
  };

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    setShowAuthModal(false);
    fetchCart();
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    setCart({ items: [], subtotal: 0 });
    setCurrentView('home');
  };

  const openAuth = (mode = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const addToCart = async (item) => {
    if (!token) {
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
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to add to cart');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
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
      }
    } catch (error) {
      console.error('Error removing from cart:', error);
    }
  };

  const updateTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Render current view
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return user ? <Dashboard /> : <DomainSearch onAddToCart={addToCart} />;
      case 'checkout':
        return <Checkout onComplete={() => { fetchCart(); setCurrentView('dashboard'); }} />;
      case 'admin':
        return user?.is_admin ? <AdminDashboard /> : <DomainSearch onAddToCart={addToCart} />;
      default:
        return <DomainSearch onAddToCart={addToCart} />;
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: updateTheme }}>
      <AuthContext.Provider value={{ user, token, login, logout, openAuth }}>
        <CartContext.Provider value={{ cart, addToCart, removeFromCart, fetchCart, showCart, setShowCart }}>
          <div className="min-h-screen flex flex-col">
            <Navbar
              currentView={currentView}
              onNavigate={setCurrentView}
            />

            <main className="flex-1">
              {renderView()}
            </main>

            <Footer />

            {/* Auth Modal */}
            {showAuthModal && (
              <AuthModal
                mode={authMode}
                onClose={() => setShowAuthModal(false)}
                onSwitchMode={setAuthMode}
              />
            )}

            {/* Cart Sidebar */}
            {showCart && (
              <CartSidebar
                onClose={() => setShowCart(false)}
                onCheckout={() => { setShowCart(false); setCurrentView('checkout'); }}
              />
            )}
          </div>
        </CartContext.Provider>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
}

export default App;
