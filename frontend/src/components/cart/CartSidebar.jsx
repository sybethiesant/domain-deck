import React, { useState } from 'react';
import { X, ShoppingCart, Trash2, ArrowRight, Loader2 } from 'lucide-react';
import { useCart } from '../../App';

const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function CartSidebar({ onClose, onCheckout }) {
  const { cart, removeFromCart, updateCartItem } = useCart();
  const [updatingId, setUpdatingId] = useState(null);

  const handleYearsChange = async (itemId, years) => {
    setUpdatingId(itemId);
    await updateCartItem(itemId, { years: parseInt(years, 10) });
    setUpdatingId(null);
  };

  const getItemTypeLabel = (type) => {
    switch (type) {
      case 'register': return 'Registration';
      case 'transfer': return 'Transfer';
      case 'renew': return 'Renewal';
      default: return type;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl animate-slide-in flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Your Cart
            </h2>
            <span className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-sm font-medium rounded-full">
              {cart.items.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ShoppingCart className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
              <p className="text-slate-600 dark:text-slate-400 mb-2">
                Your cart is empty
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-500">
                Search for domains to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="card p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.domain_name}.{item.tld}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {getItemTypeLabel(item.item_type)}
                      </span>
                      {/* Transfers are a fixed one-year fee at the registry, so
                          the term is not selectable for them. */}
                      {item.item_type === 'transfer' ? (
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          • {item.years} year{item.years > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <>
                          <span className="text-sm text-slate-400">•</span>
                          <select
                            value={item.years}
                            onChange={(e) => handleYearsChange(item.id, e.target.value)}
                            disabled={updatingId === item.id}
                            aria-label={`Term in years for ${item.domain_name}.${item.tld}`}
                            className="text-sm bg-transparent border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-slate-700 dark:text-slate-300 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            {YEAR_OPTIONS.map((y) => (
                              <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>
                            ))}
                          </select>
                          {updatingId === item.id && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      ${parseFloat(item.price).toFixed(2)}
                    </p>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.items.length > 0 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between text-lg">
              <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                ${cart.subtotal.toFixed(2)}
              </span>
            </div>

            <button
              onClick={onCheckout}
              className="btn-primary w-full py-3 text-base"
            >
              Proceed to Checkout
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CartSidebar;
