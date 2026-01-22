import React from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import { useLegalPage } from '../hooks/useLegalPage';

function Refund() {
  const { loading, customContent, siteConfig } = useLegalPage('refund');

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
          <RotateCcw className="w-8 h-8 text-indigo-500" />
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Refund Policy</h1>
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
        <RotateCcw className="w-8 h-8 text-indigo-500" />
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Refund Policy</h1>
      </div>

      <div className="prose prose-slate dark:prose-invert max-w-none">
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          <strong>Effective Date:</strong> January 1, 2025<br />
          <strong>Last Updated:</strong> January 10, 2026
        </p>

        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 mb-8">
          <p className="text-indigo-800 dark:text-indigo-200 font-medium">
            Please read this policy carefully before making a purchase. Due to the nature of
            domain registration services, refund eligibility varies based on the type of service
            and timing of your request.
          </p>
        </div>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">1. Domain Registration Refunds</h2>

          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mt-4 mb-2">Before Registration Completes</h3>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            If your domain registration has not yet been processed with the registry, you may
            request a full refund by contacting us within 24 hours of your purchase.
          </p>

          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mt-4 mb-2">After Registration Completes</h3>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            Once a domain has been successfully registered with the registry, the registration
            fee is <strong>non-refundable</strong>. This is because:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
            <li>Domain registrations are immediately processed with the registry</li>
            <li>Registry fees are non-refundable to us as the reseller</li>
            <li>The domain is allocated exclusively to you upon registration</li>
          </ul>

          <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mt-4 mb-2">5-Day Add Grace Period (Select TLDs)</h3>
          <p className="text-slate-600 dark:text-slate-300">
            Some domain extensions offer a 5-day Add Grace Period during which a newly registered
            domain can be deleted for a refund. If your domain's TLD supports this and you request
            cancellation within 5 days of registration, we may be able to process a refund minus
            any applicable fees. Contact support to check eligibility.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">2. Domain Renewal Refunds</h2>
          <p className="text-slate-600 dark:text-slate-300">
            Domain renewal fees are <strong>non-refundable</strong> once the renewal has been
            processed with the registry. If you have auto-renewal enabled, you may disable it
            at any time through your dashboard to prevent future automatic renewals.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">3. Domain Transfer Refunds</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            Domain transfer fees are handled as follows:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
            <li><strong>Before transfer initiates:</strong> Full refund available</li>
            <li><strong>Transfer in progress:</strong> Refund available if transfer fails or is rejected</li>
            <li><strong>Completed transfer:</strong> Non-refundable (domain has been extended by one year)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">4. WHOIS Privacy Protection</h2>
          <p className="text-slate-600 dark:text-slate-300">
            WHOIS Privacy Protection is typically included free with domain registrations.
            If purchased as an add-on service, it may be refunded if cancelled within 30 days
            of purchase and the service has not been activated.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">5. Failed Transactions</h2>
          <p className="text-slate-600 dark:text-slate-300">
            If your payment was processed but the domain registration failed for any reason
            (domain unavailable, registry error, etc.), you will receive a full refund within
            5-10 business days. We will notify you by email if this occurs.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">6. How to Request a Refund</h2>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            To request a refund, please contact us with:
          </p>
          <ul className="list-disc pl-6 text-slate-600 dark:text-slate-300 space-y-2">
            <li>Your order number</li>
            <li>The domain name(s) in question</li>
            <li>The email address associated with your account</li>
            <li>Reason for the refund request</li>
          </ul>
          <p className="text-slate-600 dark:text-slate-300 mt-4">
            <strong>Email:</strong> {siteConfig.support_email}
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">7. Refund Processing Time</h2>
          <p className="text-slate-600 dark:text-slate-300">
            Approved refunds will be processed within 5-10 business days. Refunds will be issued
            to the original payment method. Depending on your bank or credit card company, it may
            take an additional 5-10 business days for the refund to appear on your statement.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">8. Chargebacks</h2>
          <p className="text-slate-600 dark:text-slate-300">
            We encourage you to contact us directly to resolve any billing issues before initiating
            a chargeback with your bank. Chargebacks result in the immediate suspension of your
            account and all associated domains until the dispute is resolved.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">9. Exceptions</h2>
          <p className="text-slate-600 dark:text-slate-300">
            We reserve the right to make exceptions to this policy on a case-by-case basis.
            Exceptions are at our sole discretion and do not set precedent for future requests.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">10. Contact Us</h2>
          <p className="text-slate-600 dark:text-slate-300">
            If you have questions about our Refund Policy, please contact us at:<br />
            <strong>Email:</strong> {siteConfig.support_email}<br />
            <strong>Company:</strong> {siteConfig.company_name}
          </p>
        </section>
      </div>
    </div>
  );
}

export default Refund;
