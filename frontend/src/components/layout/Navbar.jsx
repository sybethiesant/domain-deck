import React from 'react';
import { Globe, ShoppingCart, User, Sun, Moon, Monitor, LogOut, Settings, LayoutDashboard } from 'lucide-react';
import { useAuth, useCart, useTheme } from '../../App';

function Navbar({ currentView, onNavigate }) {
  const { user, logout, openAuth } = useAuth();
  const { cart, setShowCart } = useCart();
  const { theme, setTheme } = useTheme();
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [showThemeMenu, setShowThemeMenu] = React.useState(false);

  const themeOptions = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 text-xl font-bold text-gradient"
          >
            <Globe className="w-7 h-7 text-primary-600" />
            <span>WorxTech</span>
          </button>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <button
              onClick={() => onNavigate('home')}
              className={`text-sm font-medium transition-colors ${
                currentView === 'home'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Domains
            </button>
            {user && (
              <button
                onClick={() => onNavigate('dashboard')}
                className={`text-sm font-medium transition-colors ${
                  currentView === 'dashboard'
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                My Domains
              </button>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <div className="relative">
              <button
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {theme === 'dark' ? <Moon className="w-5 h-5" /> :
                 theme === 'light' ? <Sun className="w-5 h-5" /> :
                 <Monitor className="w-5 h-5" />}
              </button>

              {showThemeMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowThemeMenu(false)} />
                  <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-slate-800 rounded-lg shadow-elevated border border-slate-200 dark:border-slate-700 py-1 z-20">
                    {themeOptions.map(({ value, icon: Icon, label }) => (
                      <button
                        key={value}
                        onClick={() => { setTheme(value); setShowThemeMenu(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${
                          theme === value
                            ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Cart */}
            {user && (
              <button
                onClick={() => setShowCart(true)}
                className="relative p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ShoppingCart className="w-5 h-5" />
                {cart.items.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {cart.items.length}
                  </span>
                )}
              </button>
            )}

            {/* User Menu */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                      {user.username?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                </button>

                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-elevated border border-slate-200 dark:border-slate-700 py-1 z-20">
                      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {user.full_name || user.username}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {user.email}
                        </p>
                      </div>

                      <button
                        onClick={() => { onNavigate('dashboard'); setShowUserMenu(false); }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        My Domains
                      </button>

                      {user.is_admin && (
                        <button
                          onClick={() => { onNavigate('admin'); setShowUserMenu(false); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <Settings className="w-4 h-4" />
                          Admin Panel
                        </button>
                      )}

                      <div className="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1">
                        <button
                          onClick={() => { logout(); setShowUserMenu(false); }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openAuth('login')}
                  className="btn-ghost text-sm"
                >
                  Sign In
                </button>
                <button
                  onClick={() => openAuth('register')}
                  className="btn-primary text-sm"
                >
                  Get Started
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
