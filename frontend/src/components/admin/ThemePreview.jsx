import React from 'react';
import { Sun, Moon, Search, ShoppingCart, User, Check, AlertTriangle, X } from 'lucide-react';

/**
 * ThemePreview Component
 * Shows a live mini-preview of the current theme settings
 */
export default function ThemePreview({ previewMode = 'light' }) {
  const isDark = previewMode === 'dark';

  return (
    <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
      {/* Mini Navbar */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary-600" />
          <span className={`font-display font-semibold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Brand Name
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className={`p-1.5 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}>
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button className={`p-1.5 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}>
            <ShoppingCart className="w-4 h-4" />
          </button>
          <button className={`p-1.5 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}>
            <User className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 space-y-4">
        {/* Search Bar */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
          <Search className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          <span className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Search domains...</span>
        </div>

        {/* Sample Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Primary Card */}
          <div className={`p-3 rounded-lg border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
            <p className={`font-display text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              example.com
            </p>
            <p className="text-primary-600 text-xs font-semibold">$12.99/yr</p>
            <button className="mt-2 w-full py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
              Add to Cart
            </button>
          </div>

          {/* Secondary Card */}
          <div className={`p-3 rounded-lg border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
            <p className={`font-display text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              example.net
            </p>
            <p className="text-accent-600 text-xs font-semibold">$9.99/yr</p>
            <button className="mt-2 w-full py-1.5 text-xs font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors">
              Add to Cart
            </button>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400 rounded-full">
            <Check className="w-3 h-3" /> Available
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400 rounded-full">
            <AlertTriangle className="w-3 h-3" /> Premium
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400 rounded-full">
            <X className="w-3 h-3" /> Taken
          </span>
        </div>

        {/* Buttons Row */}
        <div className="flex gap-2">
          <button className="flex-1 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors">
            Primary
          </button>
          <button className="flex-1 py-1.5 text-xs font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors">
            Accent
          </button>
          <button className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            Secondary
          </button>
        </div>

        {/* Text Sample */}
        <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          <p className={`font-display font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Heading Text
          </p>
          <p className="font-sans">
            Body text appears in this font style. It should be readable and comfortable.
          </p>
          <p className="font-mono mt-1 text-[10px] text-primary-600">
            const code = "monospace";
          </p>
        </div>
      </div>
    </div>
  );
}
