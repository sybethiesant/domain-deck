import React from 'react';
import { Globe, Mail, Phone } from 'lucide-react';

function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 text-xl font-bold text-white mb-4">
              <Globe className="w-6 h-6 text-primary-500" />
              <span>WorxTech</span>
            </div>
            <p className="text-sm mb-4 max-w-md">
              Your trusted partner for domain registration, management, and web services.
              Secure your online presence with WorxTech.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <a href="mailto:support@worxtech.biz" className="flex items-center gap-1 hover:text-white transition-colors">
                <Mail className="w-4 h-4" />
                support@worxtech.biz
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Services</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Domain Registration</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Domain Transfer</a></li>
              <li><a href="#" className="hover:text-white transition-colors">WHOIS Privacy</a></li>
              <li><a href="#" className="hover:text-white transition-colors">DNS Management</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Support</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-8 pt-8 text-sm text-center">
          <p>&copy; {new Date().getFullYear()} WorxTech. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
