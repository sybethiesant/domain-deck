import React, { useState, useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { API_URL } from '../config/api';

function Terms() {
  const [loading, setLoading] = useState(true);
  const [customContent, setCustomContent] = useState(null);
  const [siteConfig, setSiteConfig] = useState({
    site_name: 'Domain Store',
    company_name: 'Your Company Name',
    support_email: 'support@example.com',
    site_url: 'https://example.com'
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch site config and legal content in parallel
        const [configRes, contentRes] = await Promise.all([
          fetch(`${API_URL}/site-config`),
          fetch(`${API_URL}/legal/terms`)
        ]);

        if (configRes.ok) {
          const config = await configRes.json();
          setSiteConfig(prev => ({ ...prev, ...config }));
        }

        if (contentRes.ok) {
          const content = await contentRes.json();
          if (content.has_custom_content && content.content) {
            setCustomContent(content.content);
          }
        }
      } catch (err) {
        console.error('Error fetching terms:', err);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

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
          <FileText className="w-8 h-8 text-indigo-500" />
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Terms of Service</h1>
        </div>
        <div
          className="prose prose-slate dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: customContent }}
        />
      </div>
    );
  }

  // Default content
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <FileText className="w-8 h-8 text-indigo-500" />
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Terms of Service</h1>
      </div>

      <div className="prose prose-slate dark:prose-invert max-w-none">
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          <strong>Effective Date:</strong> January 1, 2025<br />
          <strong>Last Updated:</strong> January 10, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">1. Acceptance of Terms</h2>
          <p className="text-slate-600 dark:text-slate-300">
            By accessing or using {siteConfig.company_name} ("{siteConfig.site_name}," "we," "our," or "us")
            website and services at {siteConfig.site_url?.replace(/^https?:\/\//, '')}, you agree to be bound by these Terms of Service.
            If you do not agree to these terms, please do not use our services.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">2. Services Provided</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            {siteConfig.site_name} provides domain registration, domain transfer, domain renewal, WHOIS privacy
            protection, and DNS management services. We act as an authorized reseller through
            accredited domain registrars.
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
            <li>Domain name registration and management</li>
            <li>Domain transfers between registrars</li>
            <li>Domain renewal services</li>
            <li>WHOIS privacy protection</li>
            <li>DNS and nameserver management</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">3. Account Registration</h2>
          <p className="text-slate-600 dark:text-slate-300">
            To use our services, you must create an account with accurate and complete information.
            You are responsible for maintaining the confidentiality of your account credentials and
            for all activities that occur under your account. You must be at least 18 years old to
            create an account.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">4. Domain Registration Terms</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            Domain registrations are subject to the terms and policies of ICANN and the applicable
            domain registry. By registering a domain through {siteConfig.site_name}, you agree to:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
            <li>Provide accurate WHOIS contact information</li>
            <li>Comply with the Uniform Domain Name Dispute Resolution Policy (UDRP)</li>
            <li>Not use domains for illegal activities, spam, or malware distribution</li>
            <li>Maintain valid contact information for domain-related communications</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">5. Payment Terms</h2>
          <p className="text-slate-600 dark:text-slate-300">
            All payments are processed securely through Stripe. Prices are displayed in US dollars
            and are subject to change. Domain registration fees are non-refundable once the domain
            has been registered with the registry. See our Refund Policy for more details.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">6. Prohibited Uses</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            You may not use our services to:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
            <li>Register domains for illegal purposes</li>
            <li>Engage in phishing, fraud, or identity theft</li>
            <li>Distribute malware or conduct cyberattacks</li>
            <li>Infringe on trademarks or intellectual property</li>
            <li>Send unsolicited bulk email (spam)</li>
            <li>Violate any applicable laws or regulations</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">7. Service Availability</h2>
          <p className="text-slate-600 dark:text-slate-300">
            We strive to maintain high availability of our services but do not guarantee uninterrupted
            access. We may perform maintenance or updates that temporarily affect service availability.
            We are not liable for any losses resulting from service interruptions.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">8. Limitation of Liability</h2>
          <p className="text-slate-600 dark:text-slate-300">
            {siteConfig.site_name} shall not be liable for any indirect, incidental, special, consequential, or
            punitive damages arising from your use of our services. Our total liability shall not
            exceed the amount paid by you for the specific service giving rise to the claim.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">9. Termination</h2>
          <p className="text-slate-600 dark:text-slate-300">
            We reserve the right to suspend or terminate your account for violations of these terms
            or for any other reason at our discretion. Upon termination, your right to use our
            services will immediately cease.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">10. Changes to Terms</h2>
          <p className="text-slate-600 dark:text-slate-300">
            We may update these Terms of Service from time to time. We will notify users of
            significant changes via email or through our website. Continued use of our services
            after changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">11. Contact Information</h2>
          <p className="text-slate-600 dark:text-slate-300">
            For questions about these Terms of Service, please contact us at:<br />
            <strong>Email:</strong> {siteConfig.support_email}<br />
            <strong>Company:</strong> {siteConfig.company_name}
          </p>
        </section>
      </div>
    </div>
  );
}

export default Terms;
