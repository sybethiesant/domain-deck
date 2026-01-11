import React from 'react';
import { Link } from 'react-router-dom';
import { Globe, Mail } from 'lucide-react';

function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 text-xl font-bold text-white mb-4">
              <Globe className="w-6 h-6 text-indigo-500" />
              <span>WorxTech</span>
            </div>
            <p className="text-sm mb-2 text-slate-300 font-medium">
              WorxTech Internet Services LLC
            </p>
            <p className="text-sm mb-4 max-w-md">
              Your partner for domain registration, management, and web services.
              Fast, secure, and reliable since day one.
            </p>
            <a
              href="mailto:support@worxtech.biz"
              className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <Mail className="w-4 h-4" />
              support@worxtech.biz
            </a>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-white font-semibold mb-4">Services</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Domain Registration
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  Domain Transfer
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  WHOIS Privacy
                </Link>
              </li>
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  DNS Management
                </Link>
              </li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="text-white font-semibold mb-4">Account</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/dashboard" className="hover:text-white transition-colors">
                  My Domains
                </Link>
              </li>
              <li>
                <Link to="/orders" className="hover:text-white transition-colors">
                  Order History
                </Link>
              </li>
              <li>
                <Link to="/contacts" className="hover:text-white transition-colors">
                  Contacts
                </Link>
              </li>
              <li>
                <Link to="/settings" className="hover:text-white transition-colors">
                  Settings
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Legal Links */}
        <div className="border-t border-slate-800 mt-8 pt-6">
          <div className="flex flex-wrap justify-center gap-6 text-sm mb-6">
            <Link to="/terms" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link to="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link to="/refund" className="hover:text-white transition-colors">
              Refund Policy
            </Link>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm">
          <p>&copy; {currentYear} WorxTech Internet Services LLC. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="https://worxtech.biz" className="hover:text-white transition-colors">
              worxtech.biz
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
