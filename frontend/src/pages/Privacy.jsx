import React from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { useLegalPage } from '../hooks/useLegalPage';

function Privacy() {
  const { loading, customContent, siteConfig } = useLegalPage('privacy');

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // If custom content exists, render it
  if (customContent) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-indigo-500" />
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Privacy Policy</h1>
        </div>
        <div
          className="prose prose-slate dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: customContent }}
        />
      </div>
    );
  }

  // Default content with dynamic site config
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-8 h-8 text-indigo-500" />
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Privacy Policy</h1>
      </div>

      <div className="prose prose-slate dark:prose-invert max-w-none">
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          <strong>Effective Date:</strong> January 1, 2025<br />
          <strong>Last Updated:</strong> January 10, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">1. Introduction</h2>
          <p className="text-slate-600 dark:text-slate-300">
            {siteConfig.company_name} ("{siteConfig.site_name}," "we," "our," or "us") is committed to
            protecting your privacy. This Privacy Policy explains how we collect, use, disclose,
            and safeguard your information when you use our website and services at {siteConfig.site_url?.replace(/^https?:\/\//, '')}.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">2. Information We Collect</h2>

          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mt-4 mb-2">Personal Information</h3>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            When you create an account or register a domain, we collect:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2 mb-4">
            <li>Name and contact information (email, phone, address)</li>
            <li>Account credentials (username and encrypted password)</li>
            <li>WHOIS registrant information (as required by ICANN)</li>
            <li>Payment information (processed securely by Stripe)</li>
          </ul>

          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mt-4 mb-2">Automatically Collected Information</h3>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
            <li>IP address and browser type</li>
            <li>Device information and operating system</li>
            <li>Pages visited and time spent on our site</li>
            <li>Referring website addresses</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">3. How We Use Your Information</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            We use the information we collect to:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
            <li>Process domain registrations and manage your account</li>
            <li>Complete transactions and send order confirmations</li>
            <li>Respond to customer service requests</li>
            <li>Send important notices about your domains (expiration, renewals)</li>
            <li>Comply with legal obligations and ICANN requirements</li>
            <li>Improve our website and services</li>
            <li>Prevent fraud and enhance security</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">4. Information Sharing</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            We may share your information with:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
            <li><strong>Domain Registries:</strong> WHOIS information is shared with domain registries as required for domain registration</li>
            <li><strong>Payment Processors:</strong> Stripe processes all payments and receives necessary transaction data</li>
            <li><strong>Service Providers:</strong> Third parties who assist in operating our website and services</li>
            <li><strong>Legal Requirements:</strong> When required by law, subpoena, or to protect our rights</li>
          </ul>
          <p className="text-slate-600 dark:text-slate-300 mt-4">
            We do not sell your personal information to third parties for marketing purposes.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">5. WHOIS Privacy</h2>
          <p className="text-slate-600 dark:text-slate-300">
            Domain registrations require WHOIS contact information to be submitted to the registry.
            We offer WHOIS Privacy Protection services that mask your personal information in
            public WHOIS lookups while still maintaining accurate records as required by ICANN.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">6. Data Security</h2>
          <p className="text-slate-600 dark:text-slate-300">
            We implement industry-standard security measures to protect your information:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2 mt-4">
            <li>SSL/TLS encryption for all data transmission</li>
            <li>Secure password hashing (bcrypt)</li>
            <li>Regular security audits and updates</li>
            <li>Limited employee access to personal data</li>
            <li>Secure payment processing through Stripe (PCI-DSS compliant)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">7. Data Retention</h2>
          <p className="text-slate-600 dark:text-slate-300">
            We retain your personal information for as long as your account is active or as needed
            to provide services. We may retain certain information as required by law or for
            legitimate business purposes, such as resolving disputes or enforcing agreements.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">8. Your Rights</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            You have the right to:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
            <li>Access and review your personal information</li>
            <li>Update or correct inaccurate information</li>
            <li>Request deletion of your account (subject to legal requirements)</li>
            <li>Opt out of marketing communications</li>
            <li>Request a copy of your data</li>
          </ul>
          <p className="text-slate-600 dark:text-slate-300 mt-4">
            To exercise these rights, contact us at {siteConfig.support_email}.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">9. Cookies</h2>
          <p className="text-slate-600 dark:text-slate-300">
            We use essential cookies to maintain your session and remember your preferences.
            We do not use third-party tracking cookies for advertising purposes.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">10. Children's Privacy</h2>
          <p className="text-slate-600 dark:text-slate-300">
            Our services are not intended for individuals under the age of 18. We do not knowingly
            collect personal information from children. If we become aware that we have collected
            information from a child, we will take steps to delete it.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">11. Changes to This Policy</h2>
          <p className="text-slate-600 dark:text-slate-300">
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes by posting the new policy on this page and updating the "Last Updated" date.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">12. Contact Us</h2>
          <p className="text-slate-600 dark:text-slate-300">
            If you have questions about this Privacy Policy, please contact us at:<br />
            <strong>Email:</strong> {siteConfig.support_email}<br />
            <strong>Company:</strong> {siteConfig.company_name}
          </p>
        </section>
      </div>
    </div>
  );
}

export default Privacy;
