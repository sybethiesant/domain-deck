import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Loader2, RefreshCw, Globe, Mail, Bell, Server, ShoppingCart, Shield, AlertTriangle, Zap, CreditCard, Send, Eye, Edit2, X, Check, Upload, Trash2, Image, Users, Download, ArrowRight, KeyRound, Palette, Wrench, Settings, FileText } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import { toast } from 'react-hot-toast';
import DOMPurify from 'dompurify';

function AdminSettings() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modified, setModified] = useState({});

  // API mode state
  const [apiModes, setApiModes] = useState(null);
  const [apiModesLoading, setApiModesLoading] = useState(false);
  const [togglingMode, setTogglingMode] = useState(null);

  // Email settings state
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [previewingTemplate, setPreviewingTemplate] = useState(null);

  // Logo state
  const [logoSettings, setLogoSettings] = useState({ logo_url: '', logo_width: '180', logo_height: '50' });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const logoInputRef = useRef(null);

  // Sub-account migration state
  const [subAccounts, setSubAccounts] = useState([]);
  const [subAccountsLoading, setSubAccountsLoading] = useState(false);
  const [selectedSubAccount, setSelectedSubAccount] = useState(null);
  const [subAccountDomains, setSubAccountDomains] = useState([]);
  const [subAccountDomainsLoading, setSubAccountDomainsLoading] = useState(false);
  const [importingSubAccount, setImportingSubAccount] = useState(null);
  const [sendingResetEmail, setSendingResetEmail] = useState(null);

  // Email branding state
  const [emailBranding, setEmailBranding] = useState({
    email_logo_url: '',
    email_logo_background: '#ffffff',
    email_header_style: 'gradient',
    email_header_color: '#4f46e5',
    email_header_gradient_end: '#6366f1'
  });
  const [uploadingEmailLogo, setUploadingEmailLogo] = useState(false);
  const emailLogoInputRef = useRef(null);

  // Legal pages state
  const [legalPages, setLegalPages] = useState([]);
  const [legalPagesLoading, setLegalPagesLoading] = useState(false);
  const [editingLegalPage, setEditingLegalPage] = useState(null);
  const [savingLegalPage, setSavingLegalPage] = useState(false);

  // Tab definitions
  const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'domains', label: 'Domains', icon: Server },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'api', label: 'API & Services', icon: Zap },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'legal', label: 'Legal Pages', icon: FileText },
    { id: 'system', label: 'System', icon: Settings },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'migration', label: 'Migration', icon: Users },
  ];

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setModified({});
      } else {
        toast.error('Failed to load settings');
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      toast.error('Failed to load settings');
    }
    setLoading(false);
  }, [token]);

  const fetchLogoSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/logo`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setLogoSettings(await res.json());
      }
    } catch (err) {
      console.error('Error fetching logo settings:', err);
    }
  }, [token]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|gif|svg\+xml|webp)$/)) {
      toast.error('Please select a valid image file (JPG, PNG, GIF, SVG, or WebP)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      formData.append('width', logoSettings.logo_width);
      formData.append('height', logoSettings.logo_height);

      const res = await fetch(`${API_URL}/admin/logo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setLogoSettings(data);
        toast.success('Logo uploaded successfully');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to upload logo');
      }
    } catch (err) {
      console.error('Error uploading logo:', err);
      toast.error('Failed to upload logo');
    }
    setUploadingLogo(false);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleLogoDelete = async () => {
    if (!window.confirm('Are you sure you want to delete the logo?')) return;

    setDeletingLogo(true);
    try {
      const res = await fetch(`${API_URL}/admin/logo`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setLogoSettings({ ...logoSettings, logo_url: '' });
        toast.success('Logo deleted');
      } else {
        toast.error('Failed to delete logo');
      }
    } catch (err) {
      toast.error('Failed to delete logo');
    }
    setDeletingLogo(false);
  };

  const updateLogoDimensions = async (width, height) => {
    setLogoSettings(prev => ({ ...prev, logo_width: width, logo_height: height }));

    try {
      await fetch(`${API_URL}/admin/logo/dimensions`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ width, height })
      });
    } catch (err) {
      console.error('Error updating logo dimensions:', err);
    }
  };

  const fetchApiModes = useCallback(async () => {
    setApiModesLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/api-modes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setApiModes(await res.json());
      }
    } catch (err) {
      console.error('Error fetching API modes:', err);
    }
    setApiModesLoading(false);
  }, [token]);

  const toggleApiMode = async (service, newTestMode) => {
    setTogglingMode(service);
    try {
      const body = service === 'enom'
        ? { enom_test_mode: newTestMode }
        : { stripe_test_mode: newTestMode };

      const res = await fetch(`${API_URL}/admin/api-modes`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`${service.toUpperCase()} switched to ${newTestMode ? 'TEST' : 'PRODUCTION'} mode`);
        if (result.warning) {
          toast(result.warning, { icon: '⚠️', duration: 5000 });
        }
        fetchApiModes();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to switch mode');
      }
    } catch (err) {
      toast.error('Failed to switch mode');
    }
    setTogglingMode(null);
  };

  const fetchEmailStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/email/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setEmailStatus(await res.json());
      }
    } catch (err) {
      console.error('Error fetching email status:', err);
    }
  }, [token]);

  const fetchEmailTemplates = useCallback(async () => {
    setEmailLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/email-templates`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setEmailTemplates(await res.json());
      }
    } catch (err) {
      console.error('Error fetching email templates:', err);
    }
    setEmailLoading(false);
  }, [token]);

  const sendTestEmail = async () => {
    if (!testEmailAddress) {
      toast.error('Enter an email address');
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch(`${API_URL}/admin/email/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: testEmailAddress })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Test email sent via ${data.provider}`);
      } else {
        toast.error(data.error || 'Failed to send test email');
      }
    } catch (err) {
      toast.error('Failed to send test email');
    }
    setSendingTest(false);
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    setSavingTemplate(true);
    try {
      const res = await fetch(`${API_URL}/admin/email-templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editingTemplate.name,
          description: editingTemplate.description,
          subject: editingTemplate.subject,
          html_content: editingTemplate.html_content,
          is_active: editingTemplate.is_active
        })
      });
      if (res.ok) {
        toast.success('Template saved');
        setEditingTemplate(null);
        fetchEmailTemplates();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save template');
      }
    } catch (err) {
      toast.error('Failed to save template');
    }
    setSavingTemplate(false);
  };

  const previewTemplate = async (templateId) => {
    try {
      const res = await fetch(`${API_URL}/admin/email-templates/${templateId}/preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sample_data: {} })
      });
      if (res.ok) {
        setPreviewingTemplate(await res.json());
      }
    } catch (err) {
      toast.error('Failed to preview template');
    }
  };

  // Email branding functions
  const fetchEmailBranding = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmailBranding({
          email_logo_url: data.email_logo_url || '',
          email_logo_background: data.email_logo_background || '#ffffff',
          email_header_style: data.email_header_style || 'gradient',
          email_header_color: data.email_header_color || '#4f46e5',
          email_header_gradient_end: data.email_header_gradient_end || '#6366f1'
        });
      }
    } catch (err) {
      console.error('Error fetching email branding:', err);
    }
  }, [token]);

  const handleEmailLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|gif|svg\+xml|webp)$/)) {
      toast.error('Please select a valid image file (JPG, PNG, GIF, SVG, or WebP)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploadingEmailLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);

      const res = await fetch(`${API_URL}/admin/settings/email-logo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setEmailBranding(prev => ({ ...prev, email_logo_url: data.email_logo_url }));
        toast.success('Email logo uploaded successfully');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to upload email logo');
      }
    } catch (err) {
      console.error('Error uploading email logo:', err);
      toast.error('Failed to upload email logo');
    }
    setUploadingEmailLogo(false);
    if (emailLogoInputRef.current) emailLogoInputRef.current.value = '';
  };

  const deleteEmailLogo = async () => {
    if (!window.confirm('Are you sure you want to delete the email logo?')) return;

    try {
      const res = await fetch(`${API_URL}/admin/settings/email-logo`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setEmailBranding(prev => ({ ...prev, email_logo_url: '' }));
        toast.success('Email logo deleted');
      } else {
        toast.error('Failed to delete email logo');
      }
    } catch (err) {
      toast.error('Failed to delete email logo');
    }
  };

  const updateEmailBranding = async (key, value) => {
    setEmailBranding(prev => ({ ...prev, [key]: value }));

    try {
      await fetch(`${API_URL}/admin/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ [key]: value })
      });
    } catch (err) {
      console.error('Error updating email branding:', err);
    }
  };

  // Legal pages functions
  const fetchLegalPages = useCallback(async () => {
    setLegalPagesLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/legal-pages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setLegalPages(await res.json());
      }
    } catch (err) {
      console.error('Error fetching legal pages:', err);
    }
    setLegalPagesLoading(false);
  }, [token]);

  const saveLegalPage = async () => {
    if (!editingLegalPage) return;
    setSavingLegalPage(true);
    try {
      const res = await fetch(`${API_URL}/admin/legal-pages/${editingLegalPage.page_key}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: editingLegalPage.title,
          content: editingLegalPage.content
        })
      });
      if (res.ok) {
        toast.success('Legal page saved');
        setEditingLegalPage(null);
        fetchLegalPages();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save legal page');
      }
    } catch (err) {
      toast.error('Failed to save legal page');
    }
    setSavingLegalPage(false);
  };

  const resetLegalPage = async (pageKey) => {
    if (!window.confirm('Reset this page to the default content? This will clear any custom content.')) return;

    try {
      const res = await fetch(`${API_URL}/admin/legal-pages/${pageKey}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Legal page reset to default');
        fetchLegalPages();
      } else {
        toast.error('Failed to reset legal page');
      }
    } catch (err) {
      toast.error('Failed to reset legal page');
    }
  };

  // Default legal page templates
  const getDefaultLegalTemplate = (pageKey) => {
    const templates = {
      terms: `<p><strong>Effective Date:</strong> January 1, 2025<br /><strong>Last Updated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

<h2>1. Acceptance of Terms</h2>
<p>By accessing or using our website and services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.</p>

<h2>2. Services Provided</h2>
<p>We provide domain registration, domain transfer, domain renewal, WHOIS privacy protection, and DNS management services. We act as an authorized reseller through accredited domain registrars.</p>
<ul>
  <li>Domain name registration and management</li>
  <li>Domain transfers between registrars</li>
  <li>Domain renewal services</li>
  <li>WHOIS privacy protection</li>
  <li>DNS and nameserver management</li>
</ul>

<h2>3. Account Registration</h2>
<p>To use our services, you must create an account with accurate and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must be at least 18 years old to create an account.</p>

<h2>4. Domain Registration Terms</h2>
<p>Domain registrations are subject to the terms and policies of ICANN and the applicable domain registry. By registering a domain, you agree to:</p>
<ul>
  <li>Provide accurate WHOIS contact information</li>
  <li>Comply with the Uniform Domain Name Dispute Resolution Policy (UDRP)</li>
  <li>Not use domains for illegal activities, spam, or malware distribution</li>
  <li>Maintain valid contact information for domain-related communications</li>
</ul>

<h2>5. Payment Terms</h2>
<p>All payments are processed securely through Stripe. Prices are displayed in US dollars and are subject to change. Domain registration fees are non-refundable once the domain has been registered with the registry. See our Refund Policy for more details.</p>

<h2>6. Prohibited Uses</h2>
<p>You may not use our services to:</p>
<ul>
  <li>Register domains for illegal purposes</li>
  <li>Engage in phishing, fraud, or identity theft</li>
  <li>Distribute malware or conduct cyberattacks</li>
  <li>Infringe on trademarks or intellectual property</li>
  <li>Send unsolicited bulk email (spam)</li>
  <li>Violate any applicable laws or regulations</li>
</ul>

<h2>7. Service Availability</h2>
<p>We strive to maintain high availability of our services but do not guarantee uninterrupted access. We may perform maintenance or updates that temporarily affect service availability. We are not liable for any losses resulting from service interruptions.</p>

<h2>8. Limitation of Liability</h2>
<p>We shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of our services. Our total liability shall not exceed the amount paid by you for the specific service giving rise to the claim.</p>

<h2>9. Termination</h2>
<p>We reserve the right to suspend or terminate your account for violations of these terms or for any other reason at our discretion. Upon termination, your right to use our services will immediately cease.</p>

<h2>10. Changes to Terms</h2>
<p>We may update these Terms of Service from time to time. We will notify users of significant changes via email or through our website. Continued use of our services after changes constitutes acceptance of the updated terms.</p>

<h2>11. Contact Information</h2>
<p>For questions about these Terms of Service, please contact us at our support email.</p>`,

      privacy: `<p><strong>Effective Date:</strong> January 1, 2025<br /><strong>Last Updated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

<h2>1. Introduction</h2>
<p>We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and services.</p>

<h2>2. Information We Collect</h2>
<h3>Personal Information</h3>
<p>When you create an account or register a domain, we collect:</p>
<ul>
  <li>Name and contact information (email, phone, address)</li>
  <li>Account credentials (username and encrypted password)</li>
  <li>WHOIS registrant information (as required by ICANN)</li>
  <li>Payment information (processed securely by Stripe)</li>
</ul>

<h3>Automatically Collected Information</h3>
<ul>
  <li>IP address and browser type</li>
  <li>Device information and operating system</li>
  <li>Pages visited and time spent on our site</li>
  <li>Referring website addresses</li>
</ul>

<h2>3. How We Use Your Information</h2>
<p>We use the information we collect to:</p>
<ul>
  <li>Process domain registrations and manage your account</li>
  <li>Complete transactions and send order confirmations</li>
  <li>Respond to customer service requests</li>
  <li>Send important notices about your domains (expiration, renewals)</li>
  <li>Comply with legal obligations and ICANN requirements</li>
  <li>Improve our website and services</li>
  <li>Prevent fraud and enhance security</li>
</ul>

<h2>4. Information Sharing</h2>
<p>We may share your information with:</p>
<ul>
  <li><strong>Domain Registries:</strong> WHOIS information is shared with domain registries as required for domain registration</li>
  <li><strong>Payment Processors:</strong> Stripe processes all payments and receives necessary transaction data</li>
  <li><strong>Service Providers:</strong> Third parties who assist in operating our website and services</li>
  <li><strong>Legal Requirements:</strong> When required by law, subpoena, or to protect our rights</li>
</ul>
<p>We do not sell your personal information to third parties for marketing purposes.</p>

<h2>5. WHOIS Privacy</h2>
<p>Domain registrations require WHOIS contact information to be submitted to the registry. We offer WHOIS Privacy Protection services that mask your personal information in public WHOIS lookups while still maintaining accurate records as required by ICANN.</p>

<h2>6. Data Security</h2>
<p>We implement industry-standard security measures to protect your information:</p>
<ul>
  <li>SSL/TLS encryption for all data transmission</li>
  <li>Secure password hashing (bcrypt)</li>
  <li>Regular security audits and updates</li>
  <li>Limited employee access to personal data</li>
  <li>Secure payment processing through Stripe (PCI-DSS compliant)</li>
</ul>

<h2>7. Data Retention</h2>
<p>We retain your personal information for as long as your account is active or as needed to provide services. We may retain certain information as required by law or for legitimate business purposes, such as resolving disputes or enforcing agreements.</p>

<h2>8. Your Rights</h2>
<p>You have the right to:</p>
<ul>
  <li>Access and review your personal information</li>
  <li>Update or correct inaccurate information</li>
  <li>Request deletion of your account (subject to legal requirements)</li>
  <li>Opt out of marketing communications</li>
  <li>Request a copy of your data</li>
</ul>
<p>To exercise these rights, contact us at our support email.</p>

<h2>9. Cookies</h2>
<p>We use essential cookies to maintain your session and remember your preferences. We do not use third-party tracking cookies for advertising purposes.</p>

<h2>10. Children's Privacy</h2>
<p>Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected information from a child, we will take steps to delete it.</p>

<h2>11. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the new policy on this page and updating the "Last Updated" date.</p>

<h2>12. Contact Us</h2>
<p>If you have questions about this Privacy Policy, please contact us at our support email.</p>`,

      refund: `<p><strong>Effective Date:</strong> January 1, 2025<br /><strong>Last Updated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

<div style="background-color: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
  <p style="color: #3730A3; font-weight: 500; margin: 0;">Please read this policy carefully before making a purchase. Due to the nature of domain registration services, refund eligibility varies based on the type of service and timing of your request.</p>
</div>

<h2>1. Domain Registration Refunds</h2>
<h3>Before Registration Completes</h3>
<p>If your domain registration has not yet been processed with the registry, you may request a full refund by contacting us within 24 hours of your purchase.</p>

<h3>After Registration Completes</h3>
<p>Once a domain has been successfully registered with the registry, the registration fee is <strong>non-refundable</strong>. This is because:</p>
<ul>
  <li>Domain registrations are immediately processed with the registry</li>
  <li>Registry fees are non-refundable to us as the reseller</li>
  <li>The domain is allocated exclusively to you upon registration</li>
</ul>

<h3>5-Day Add Grace Period (Select TLDs)</h3>
<p>Some domain extensions offer a 5-day Add Grace Period during which a newly registered domain can be deleted for a refund. If your domain's TLD supports this and you request cancellation within 5 days of registration, we may be able to process a refund minus any applicable fees. Contact support to check eligibility.</p>

<h2>2. Domain Renewal Refunds</h2>
<p>Domain renewal fees are <strong>non-refundable</strong> once the renewal has been processed with the registry. If you have auto-renewal enabled, you may disable it at any time through your dashboard to prevent future automatic renewals.</p>

<h2>3. Domain Transfer Refunds</h2>
<p>Domain transfer fees are handled as follows:</p>
<ul>
  <li><strong>Before transfer initiates:</strong> Full refund available</li>
  <li><strong>Transfer in progress:</strong> Refund available if transfer fails or is rejected</li>
  <li><strong>Completed transfer:</strong> Non-refundable (domain has been extended by one year)</li>
</ul>

<h2>4. WHOIS Privacy Protection</h2>
<p>WHOIS Privacy Protection is typically included free with domain registrations. If purchased as an add-on service, it may be refunded if cancelled within 30 days of purchase and the service has not been activated.</p>

<h2>5. Failed Transactions</h2>
<p>If your payment was processed but the domain registration failed for any reason (domain unavailable, registry error, etc.), you will receive a full refund within 5-10 business days. We will notify you by email if this occurs.</p>

<h2>6. How to Request a Refund</h2>
<p>To request a refund, please contact us with:</p>
<ul>
  <li>Your order number</li>
  <li>The domain name(s) in question</li>
  <li>The email address associated with your account</li>
  <li>Reason for the refund request</li>
</ul>

<h2>7. Refund Processing Time</h2>
<p>Approved refunds will be processed within 5-10 business days. Refunds will be issued to the original payment method. Depending on your bank or credit card company, it may take an additional 5-10 business days for the refund to appear on your statement.</p>

<h2>8. Chargebacks</h2>
<p>We encourage you to contact us directly to resolve any billing issues before initiating a chargeback with your bank. Chargebacks result in the immediate suspension of your account and all associated domains until the dispute is resolved.</p>

<h2>9. Exceptions</h2>
<p>We reserve the right to make exceptions to this policy on a case-by-case basis. Exceptions are at our sole discretion and do not set precedent for future requests.</p>

<h2>10. Contact Us</h2>
<p>If you have questions about our Refund Policy, please contact us at our support email.</p>`
    };
    return templates[pageKey] || '';
  };

  const loadDefaultTemplate = () => {
    if (!editingLegalPage) return;
    const template = getDefaultLegalTemplate(editingLegalPage.page_key);
    setEditingLegalPage({ ...editingLegalPage, content: template });
    toast.success('Default template loaded - you can now customize it');
  };

  useEffect(() => {
    fetchSettings();
    fetchApiModes();
    fetchEmailStatus();
    fetchEmailTemplates();
    fetchLogoSettings();
    fetchEmailBranding();
    fetchLegalPages();
  }, [fetchSettings, fetchApiModes, fetchEmailStatus, fetchEmailTemplates, fetchLogoSettings, fetchEmailBranding, fetchLegalPages]);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setModified(prev => ({ ...prev, [key]: true }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const changedSettings = {};
      for (const key of Object.keys(modified)) {
        changedSettings[key] = settings[key];
      }

      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(changedSettings)
      });

      if (res.ok) {
        const result = await res.json();
        toast.success(`Updated ${result.updated?.length || 0} settings`);
        setModified({});
        if (result.errors?.length > 0) {
          result.errors.forEach(e => toast.error(`${e.key}: ${e.error}`));
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Failed to save settings');
    }
    setSaving(false);
  };

  const toggleMaintenance = async () => {
    const newMode = settings.maintenance_mode !== 'true';
    try {
      const res = await fetch(`${API_URL}/admin/maintenance`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: newMode,
          message: settings.maintenance_message
        })
      });

      if (res.ok) {
        toast.success(newMode ? 'Maintenance mode enabled' : 'Maintenance mode disabled');
        setSettings(prev => ({ ...prev, maintenance_mode: newMode ? 'true' : 'false' }));
      } else {
        toast.error('Failed to toggle maintenance mode');
      }
    } catch (err) {
      toast.error('Failed to toggle maintenance mode');
    }
  };

  // Sub-account migration functions
  const fetchSubAccounts = async () => {
    setSubAccountsLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/enom/subaccounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSubAccounts(await res.json());
      } else {
        toast.error('Failed to load sub-accounts');
      }
    } catch (err) {
      console.error('Error fetching sub-accounts:', err);
      toast.error('Failed to load sub-accounts');
    }
    setSubAccountsLoading(false);
  };

  const fetchSubAccountDomains = async (accountId) => {
    setSubAccountDomainsLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/enom/subaccounts/${encodeURIComponent(accountId)}/domains`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSubAccountDomains(await res.json());
      } else {
        toast.error('Failed to load domains');
      }
    } catch (err) {
      console.error('Error fetching sub-account domains:', err);
      toast.error('Failed to load domains');
    }
    setSubAccountDomainsLoading(false);
  };

  const importSubAccount = async (accountId) => {
    if (!window.confirm('Import this sub-account? This will create a new user account (without password) and import all their domains.')) {
      return;
    }

    setImportingSubAccount(accountId);
    try {
      const res = await fetch(`${API_URL}/admin/enom/subaccounts/${encodeURIComponent(accountId)}/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Imported ${data.domains.imported} domains for ${data.user.email}`);
        setSubAccounts(prev => prev.map(sa =>
          sa.loginId === accountId ? { ...sa, imported: true, worxtechUserId: data.user.id, worxtechUsername: data.user.username } : sa
        ));
      } else {
        toast.error(data.error || 'Failed to import sub-account');
      }
    } catch (err) {
      console.error('Error importing sub-account:', err);
      toast.error('Failed to import sub-account');
    }
    setImportingSubAccount(null);
  };

  const sendPasswordResetToUser = async (userId) => {
    setSendingResetEmail(userId);
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/send-reset`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Password reset email sent');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to send password reset email');
      }
    } catch (err) {
      console.error('Error sending password reset:', err);
      toast.error('Failed to send password reset email');
    }
    setSendingResetEmail(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const hasChanges = Object.keys(modified).length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">System Settings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Configure your domain reseller platform</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchSettings} className="btn-secondary">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </button>
        </div>
      </div>

      {hasChanges && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          <span className="text-yellow-800 dark:text-yellow-200">You have unsaved changes</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          <nav className="flex -mb-px min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Site Settings */}
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Site Information</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Site Name
                    </label>
                    <input
                      type="text"
                      value={settings.site_name || ''}
                      onChange={(e) => handleChange('site_name', e.target.value)}
                      className="input w-full"
                      placeholder="WorxTech"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Tagline
                    </label>
                    <input
                      type="text"
                      value={settings.site_tagline || ''}
                      onChange={(e) => handleChange('site_tagline', e.target.value)}
                      className="input w-full"
                      placeholder="Domain Names Made Simple"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Support Email
                    </label>
                    <input
                      type="email"
                      value={settings.support_email || ''}
                      onChange={(e) => handleChange('support_email', e.target.value)}
                      className="input w-full"
                      placeholder="support@worxtech.biz"
                    />
                  </div>
                </div>
              </div>

              {/* Registration & Order Settings */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Registration Settings</h3>
                <div className="space-y-4">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.registration_enabled === 'true'}
                      onChange={(e) => handleChange('registration_enabled', e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Allow new user registration</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.email_verification_required === 'true'}
                      onChange={(e) => handleChange('email_verification_required', e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Require email verification for new accounts</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.require_contact_for_checkout === 'true'}
                      onChange={(e) => handleChange('require_contact_for_checkout', e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Require contact selection at checkout</span>
                  </label>
                </div>
              </div>

              {/* Order Settings */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Order Settings</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Order Expiration (hours)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={settings.order_expiration_hours || '24'}
                      onChange={(e) => handleChange('order_expiration_hours', e.target.value)}
                      className="input w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">Pending orders expire after this many hours</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Domain Push Timeout (days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={settings.push_timeout_days || '7'}
                      onChange={(e) => handleChange('push_timeout_days', e.target.value)}
                      className="input w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">Domain push requests expire after this many days</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              {/* Default Theme */}
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Default Theme</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  The default theme shown to new visitors who haven't set a preference.
                </p>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  {[
                    { id: 'light', label: 'Light', icon: '☀️' },
                    { id: 'dark', label: 'Dark', icon: '🌙' }
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleChange('default_theme', option.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                        (settings.default_theme || 'dark') === option.id
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <span className="text-2xl">{option.icon}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Logo Settings */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Site Logo</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Logo Preview & Upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Logo Image
                    </label>
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center">
                      {logoSettings.logo_url ? (
                        <div className="space-y-3">
                          <div className="flex justify-center p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                            <img
                              src={`/api${logoSettings.logo_url}`}
                              alt="Site Logo"
                              style={{
                                maxWidth: `${logoSettings.logo_width}px`,
                                maxHeight: `${logoSettings.logo_height}px`,
                                objectFit: 'contain'
                              }}
                              className="max-w-full"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          </div>
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => logoInputRef.current?.click()}
                              disabled={uploadingLogo}
                              className="btn-secondary text-sm py-1.5"
                            >
                              {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                              <span className="ml-1">Replace</span>
                            </button>
                            <button
                              onClick={handleLogoDelete}
                              disabled={deletingLogo}
                              className="btn-secondary text-sm py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              {deletingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              <span className="ml-1">Delete</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="py-6">
                          <Image className="w-12 h-12 mx-auto text-slate-400 mb-3" />
                          <p className="text-sm text-slate-500 mb-3">No logo uploaded</p>
                          <button
                            onClick={() => logoInputRef.current?.click()}
                            disabled={uploadingLogo}
                            className="btn-primary text-sm"
                          >
                            {uploadingLogo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            Upload Logo
                          </button>
                        </div>
                      )}
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/svg+xml,image/webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Supported: JPG, PNG, GIF, SVG, WebP (max 5MB)
                    </p>
                  </div>

                  {/* Logo Dimensions */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Display Width: {logoSettings.logo_width}px
                      </label>
                      <input
                        type="range"
                        min="50"
                        max="400"
                        value={logoSettings.logo_width}
                        onChange={(e) => updateLogoDimensions(e.target.value, logoSettings.logo_height)}
                        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Display Height: {logoSettings.logo_height}px
                      </label>
                      <input
                        type="range"
                        min="20"
                        max="150"
                        value={logoSettings.logo_height}
                        onChange={(e) => updateLogoDimensions(logoSettings.logo_width, e.target.value)}
                        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Domains Tab */}
          {activeTab === 'domains' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Domain Settings</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Default Nameservers
                    </label>
                    <input
                      type="text"
                      value={settings.default_nameservers || ''}
                      onChange={(e) => handleChange('default_nameservers', e.target.value)}
                      className="input w-full font-mono text-sm"
                      placeholder="dns1.name-services.com,dns2.name-services.com"
                    />
                    <p className="text-xs text-slate-500 mt-1">Comma-separated list of default nameservers for new domains</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Suspended Nameservers
                    </label>
                    <input
                      type="text"
                      value={settings.suspended_nameservers || ''}
                      onChange={(e) => handleChange('suspended_nameservers', e.target.value)}
                      className="input w-full font-mono text-sm"
                      placeholder="ns1.suspended.worxtech.biz,ns2.suspended.worxtech.biz"
                    />
                    <p className="text-xs text-slate-500 mt-1">Nameservers used for suspended domains</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Sync Settings</h3>
                <div className="space-y-4">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.auto_sync_enabled === 'true'}
                      onChange={(e) => handleChange('auto_sync_enabled', e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Enable automatic domain sync</span>
                  </label>
                  <div className="max-w-xs">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Sync Interval (hours)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={settings.sync_interval_hours || '24'}
                      onChange={(e) => handleChange('sync_interval_hours', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Password Requirements */}
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Password Requirements</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Minimum Password Length
                    </label>
                    <input
                      type="number"
                      min="8"
                      max="32"
                      value={settings.min_password_length || '12'}
                      onChange={(e) => handleChange('min_password_length', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={settings.password_require_uppercase === 'true'}
                        onChange={(e) => handleChange('password_require_uppercase', e.target.checked ? 'true' : 'false')}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-slate-700 dark:text-slate-300">Require uppercase letter</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={settings.password_require_lowercase === 'true'}
                        onChange={(e) => handleChange('password_require_lowercase', e.target.checked ? 'true' : 'false')}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-slate-700 dark:text-slate-300">Require lowercase letter</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={settings.password_require_number === 'true'}
                        onChange={(e) => handleChange('password_require_number', e.target.checked ? 'true' : 'false')}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-slate-700 dark:text-slate-300">Require number</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={settings.password_require_special === 'true'}
                        onChange={(e) => handleChange('password_require_special', e.target.checked ? 'true' : 'false')}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-slate-700 dark:text-slate-300">Require special character</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Account Lockout */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Account Lockout</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Failed Attempts Before Lockout
                    </label>
                    <input
                      type="number"
                      min="3"
                      max="10"
                      value={settings.lockout_attempts || '5'}
                      onChange={(e) => handleChange('lockout_attempts', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Lockout Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="60"
                      value={settings.lockout_duration_minutes || '15'}
                      onChange={(e) => handleChange('lockout_duration_minutes', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Rate Limiting */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Rate Limiting</h3>
                <p className="text-sm text-slate-500 mb-4">Maximum requests per minute by type</p>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Auth Endpoints
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="100"
                      value={settings.rate_limit_auth || '20'}
                      onChange={(e) => handleChange('rate_limit_auth', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Domain Checks
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="200"
                      value={settings.rate_limit_domain_check || '50'}
                      onChange={(e) => handleChange('rate_limit_domain_check', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Checkout
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={settings.rate_limit_checkout || '5'}
                      onChange={(e) => handleChange('rate_limit_checkout', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      General API
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="500"
                      value={settings.rate_limit_general || '100'}
                      onChange={(e) => handleChange('rate_limit_general', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Order Settings</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Order Expiration (hours)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={settings.order_expiration_hours || '24'}
                      onChange={(e) => handleChange('order_expiration_hours', e.target.value)}
                      className="input w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">Time before unpaid orders expire</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Credit Card Fee (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={settings.cc_fee_percent || '5'}
                      onChange={(e) => handleChange('cc_fee_percent', e.target.value)}
                      className="input w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">eNom CC refill fee percentage</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Checkout Requirements</h3>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.require_contact_for_checkout === 'true'}
                    onChange={(e) => handleChange('require_contact_for_checkout', e.target.checked ? 'true' : 'false')}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-slate-700 dark:text-slate-300">Require contact information for checkout</span>
                </label>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Cart Settings</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Cart Item Expiry (hours)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={settings.cart_item_expiry_hours || '24'}
                      onChange={(e) => handleChange('cart_item_expiry_hours', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Maximum Cart Items
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="50"
                      value={settings.cart_max_items || '20'}
                      onChange={(e) => handleChange('cart_max_items', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Pricing Defaults</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Default Privacy Price ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={settings.default_privacy_price || '9.99'}
                      onChange={(e) => handleChange('default_privacy_price', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Default Price Markup (multiplier)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="3"
                      step="0.01"
                      value={settings.default_price_markup || '1.30'}
                      onChange={(e) => handleChange('default_price_markup', e.target.value)}
                      className="input w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">e.g., 1.30 = 30% markup on cost</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Tax Settings</h3>
                <div className="space-y-4">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.tax_enabled === 'true'}
                      onChange={(e) => handleChange('tax_enabled', e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Enable tax calculation</span>
                  </label>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Tax Rate (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        step="0.1"
                        value={settings.tax_rate || '0'}
                        onChange={(e) => handleChange('tax_rate', e.target.value)}
                        className="input w-full"
                        disabled={settings.tax_enabled !== 'true'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Tax Label
                      </label>
                      <input
                        type="text"
                        value={settings.tax_label || 'Tax'}
                        onChange={(e) => handleChange('tax_label', e.target.value)}
                        className="input w-full"
                        placeholder="Tax"
                        disabled={settings.tax_enabled !== 'true'}
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-3 pb-2">
                        <input
                          type="checkbox"
                          checked={settings.tax_inclusive === 'true'}
                          onChange={(e) => handleChange('tax_inclusive', e.target.checked ? 'true' : 'false')}
                          className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          disabled={settings.tax_enabled !== 'true'}
                        />
                        <span className="text-slate-700 dark:text-slate-300">Tax inclusive pricing</span>
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    When enabled, tax will be calculated on all orders. Tax inclusive means prices already include tax.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* API & Services Tab */}
          {activeTab === 'api' && (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-medium">How API Modes Work</p>
                    <p>Mode changes only affect <strong>new registrations</strong>. Existing domains remember which mode they were registered in.</p>
                  </div>
                </div>
              </div>

              {apiModes ? (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* eNom Mode */}
                  <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Server className="w-5 h-5 text-slate-500" />
                        <span className="font-medium text-slate-900 dark:text-slate-100">eNom</span>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        apiModes.enom.currentMode === 'test'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                        {apiModes.enom.currentMode.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mb-3">Endpoint: {apiModes.enom.endpoint}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleApiMode('enom', true)}
                        disabled={togglingMode === 'enom' || apiModes.enom.currentMode === 'test'}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          apiModes.enom.currentMode === 'test'
                            ? 'bg-yellow-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {togglingMode === 'enom' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Test'}
                      </button>
                      <button
                        onClick={() => toggleApiMode('enom', false)}
                        disabled={togglingMode === 'enom' || apiModes.enom.currentMode === 'production'}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          apiModes.enom.currentMode === 'production'
                            ? 'bg-green-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Production
                      </button>
                    </div>
                  </div>

                  {/* Stripe Mode */}
                  <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-5 h-5 text-slate-500" />
                        <span className="font-medium text-slate-900 dark:text-slate-100">Stripe</span>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        apiModes.stripe.currentMode === 'test'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                        {apiModes.stripe.currentMode.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mb-3">
                      Status: {apiModes.stripe.configured ? 'Configured' : 'Not Configured'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleApiMode('stripe', true)}
                        disabled={togglingMode === 'stripe' || apiModes.stripe.currentMode === 'test'}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          apiModes.stripe.currentMode === 'test'
                            ? 'bg-yellow-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {togglingMode === 'stripe' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Test'}
                      </button>
                      <button
                        onClick={() => toggleApiMode('stripe', false)}
                        disabled={togglingMode === 'stripe' || apiModes.stripe.currentMode === 'production'}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          apiModes.stripe.currentMode === 'production'
                            ? 'bg-green-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Production
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              )}
            </div>
          )}

          {/* Email Tab */}
          {activeTab === 'email' && (
            <div className="space-y-6">
              {/* Email Status */}
              {emailStatus && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Host:</span>
                      <span className="ml-2 text-slate-900 dark:text-slate-100">{emailStatus.host}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">From:</span>
                      <span className="ml-2 text-slate-900 dark:text-slate-100">{emailStatus.from}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Status:</span>
                      <span className={`ml-2 ${emailStatus.connected ? 'text-green-600' : 'text-yellow-600'}`}>
                        {emailStatus.connected ? 'Connected' : 'Not Connected'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Notification Settings */}
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Notification Settings</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Admin Notification Email
                    </label>
                    <input
                      type="email"
                      value={settings.admin_notification_email || ''}
                      onChange={(e) => handleChange('admin_notification_email', e.target.value)}
                      className="input w-full"
                      placeholder="admin@worxtech.biz"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Expiring Domain Warning (days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={settings.expiring_domain_days || '30'}
                      onChange={(e) => handleChange('expiring_domain_days', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.notify_on_new_order === 'true'}
                      onChange={(e) => handleChange('notify_on_new_order', e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Notify on new orders</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.notify_on_failed_order === 'true'}
                      onChange={(e) => handleChange('notify_on_failed_order', e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Notify on failed orders</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.notify_on_expiring_domains === 'true'}
                      onChange={(e) => handleChange('notify_on_expiring_domains', e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Notify on expiring domains</span>
                  </label>
                </div>
              </div>

              {/* Test Email */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Send Test Email</h3>
                <div className="flex gap-3 max-w-md">
                  <input
                    type="email"
                    value={testEmailAddress}
                    onChange={(e) => setTestEmailAddress(e.target.value)}
                    className="input flex-1"
                    placeholder="test@example.com"
                  />
                  <button
                    onClick={sendTestEmail}
                    disabled={sendingTest}
                    className="btn-primary"
                  >
                    {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Send
                  </button>
                </div>
              </div>

              {/* Email Branding */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Email Branding</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Customize the appearance of emails sent to customers.
                </p>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Email Logo Upload */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Email Logo
                    </label>
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center">
                      {emailBranding.email_logo_url ? (
                        <div className="space-y-3">
                          <div
                            className="flex justify-center p-4 rounded-lg"
                            style={{ backgroundColor: emailBranding.email_logo_background }}
                          >
                            <img
                              src={emailBranding.email_logo_url.startsWith('http') ? emailBranding.email_logo_url : `/api${emailBranding.email_logo_url}`}
                              alt="Email Logo"
                              style={{ maxWidth: '200px', maxHeight: '60px', objectFit: 'contain' }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          </div>
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => emailLogoInputRef.current?.click()}
                              disabled={uploadingEmailLogo}
                              className="btn-secondary text-sm py-1.5"
                            >
                              {uploadingEmailLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                              <span className="ml-1">Replace</span>
                            </button>
                            <button
                              onClick={deleteEmailLogo}
                              className="btn-secondary text-sm py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span className="ml-1">Remove</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="py-6">
                          <Mail className="w-12 h-12 mx-auto text-slate-400 mb-3" />
                          <p className="text-sm text-slate-500 mb-3">No email logo - text header will be used</p>
                          <button
                            onClick={() => emailLogoInputRef.current?.click()}
                            disabled={uploadingEmailLogo}
                            className="btn-primary text-sm"
                          >
                            {uploadingEmailLogo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            Upload Email Logo
                          </button>
                        </div>
                      )}
                      <input
                        ref={emailLogoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/svg+xml,image/webp"
                        onChange={handleEmailLogoUpload}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Email Branding Options */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Logo Background Color
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={emailBranding.email_logo_background}
                          onChange={(e) => updateEmailBranding('email_logo_background', e.target.value)}
                          className="w-10 h-10 rounded border border-slate-300 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={emailBranding.email_logo_background}
                          onChange={(e) => updateEmailBranding('email_logo_background', e.target.value)}
                          className="input flex-1 font-mono text-sm"
                          placeholder="#ffffff"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Background color for the logo area (useful for logos that need a specific background)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Header Style
                      </label>
                      <select
                        value={emailBranding.email_header_style}
                        onChange={(e) => updateEmailBranding('email_header_style', e.target.value)}
                        className="input w-full"
                      >
                        <option value="gradient">Gradient</option>
                        <option value="solid">Solid Color</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          {emailBranding.email_header_style === 'gradient' ? 'Start Color' : 'Header Color'}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={emailBranding.email_header_color}
                            onChange={(e) => updateEmailBranding('email_header_color', e.target.value)}
                            className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={emailBranding.email_header_color}
                            onChange={(e) => updateEmailBranding('email_header_color', e.target.value)}
                            className="input flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>
                      {emailBranding.email_header_style === 'gradient' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            End Color
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={emailBranding.email_header_gradient_end}
                              onChange={(e) => updateEmailBranding('email_header_gradient_end', e.target.value)}
                              className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={emailBranding.email_header_gradient_end}
                              onChange={(e) => updateEmailBranding('email_header_gradient_end', e.target.value)}
                              className="input flex-1 font-mono text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Preview */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Header Preview
                      </label>
                      <div
                        className="rounded-lg p-4 text-white text-center font-bold"
                        style={{
                          background: emailBranding.email_header_style === 'gradient'
                            ? `linear-gradient(135deg, ${emailBranding.email_header_color}, ${emailBranding.email_header_gradient_end})`
                            : emailBranding.email_header_color
                        }}
                      >
                        {settings?.site_name || 'Your Site Name'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Email Templates */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Email Templates</h3>
                {emailLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {emailTemplates.map(template => (
                      <div key={template.id} className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 dark:text-slate-100">{template.name}</span>
                            {!template.is_active && (
                              <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 rounded">Disabled</span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500">{template.description}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => previewTemplate(template.id)}
                            className="btn-secondary text-sm py-1.5"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingTemplate(template)}
                            className="btn-secondary text-sm py-1.5"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Legal Pages Tab */}
          {activeTab === 'legal' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Legal Pages</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Customize your Terms of Service, Privacy Policy, and Refund Policy pages.
                  If no custom content is set, the default template with your site settings will be shown.
                </p>
              </div>

              {legalPagesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { key: 'terms', label: 'Terms of Service', icon: FileText },
                    { key: 'privacy', label: 'Privacy Policy', icon: Shield },
                    { key: 'refund', label: 'Refund Policy', icon: CreditCard }
                  ].map(page => {
                    const savedPage = legalPages.find(p => p.page_key === page.key);
                    const hasCustomContent = savedPage && savedPage.content;

                    return (
                      <div
                        key={page.key}
                        className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <page.icon className="w-5 h-5 text-slate-400" />
                            <div>
                              <span className="font-medium text-slate-900 dark:text-slate-100">{page.label}</span>
                              {hasCustomContent ? (
                                <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded">
                                  Customized
                                </span>
                              ) : (
                                <span className="ml-2 px-2 py-0.5 text-xs bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 rounded">
                                  Using Default
                                </span>
                              )}
                              {savedPage?.updated_at && (
                                <p className="text-xs text-slate-500 mt-1">
                                  Last updated: {new Date(savedPage.updated_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <a
                              href={`/${page.key}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-secondary text-sm py-1.5"
                            >
                              <Eye className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => setEditingLegalPage({
                                page_key: page.key,
                                title: page.label,
                                content: savedPage?.content || ''
                              })}
                              className="btn-secondary text-sm py-1.5"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {hasCustomContent && (
                              <button
                                onClick={() => resetLegalPage(page.key)}
                                className="btn-secondary text-sm py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="Reset to default"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <p className="font-medium">HTML Content Supported</p>
                    <p>You can use HTML tags to format your legal pages. The content will be sanitized before display for security.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* System Tab */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              {/* Timezone */}
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">System Settings</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      System Timezone
                    </label>
                    <select
                      value={settings.system_timezone || 'America/New_York'}
                      onChange={(e) => handleChange('system_timezone', e.target.value)}
                      className="input w-full"
                    >
                      <option value="America/New_York">Eastern (America/New_York)</option>
                      <option value="America/Chicago">Central (America/Chicago)</option>
                      <option value="America/Denver">Mountain (America/Denver)</option>
                      <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/London">London (Europe/London)</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Timezone for scheduled jobs and reports</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Logo Max File Size (MB)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={settings.logo_max_file_size_mb || '5'}
                      onChange={(e) => handleChange('logo_max_file_size_mb', e.target.value)}
                      className="input w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Auto-Renew Settings */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Auto-Renewal Settings</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Auto-Renew Threshold (days)
                    </label>
                    <input
                      type="number"
                      min="7"
                      max="90"
                      value={settings.auto_renew_threshold_days || '30'}
                      onChange={(e) => handleChange('auto_renew_threshold_days', e.target.value)}
                      className="input w-full"
                    />
                    <p className="text-xs text-slate-500 mt-1">Domains expiring within this many days will be auto-renewed</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Expiration Notification Days
                    </label>
                    <input
                      type="text"
                      value={settings.expiration_notification_days || '[30,14,7,3,1]'}
                      onChange={(e) => handleChange('expiration_notification_days', e.target.value)}
                      className="input w-full font-mono text-sm"
                      placeholder="[30,14,7,3,1]"
                    />
                    <p className="text-xs text-slate-500 mt-1">JSON array of days before expiration to send notifications</p>
                  </div>
                </div>
              </div>

              {/* Background Job Schedules */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Background Job Schedules</h3>
                <p className="text-sm text-slate-500 mb-4">Cron expressions for scheduled tasks. Changes require server restart.</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Domain Sync
                    </label>
                    <input
                      type="text"
                      value={settings.job_domain_sync_schedule || '0 0,6,12,18 * * *'}
                      onChange={(e) => handleChange('job_domain_sync_schedule', e.target.value)}
                      className="input w-full font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Default: Every 6 hours</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Expiration Notifications
                    </label>
                    <input
                      type="text"
                      value={settings.job_expiration_notify_schedule || '0 0 * * *'}
                      onChange={(e) => handleChange('job_expiration_notify_schedule', e.target.value)}
                      className="input w-full font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Default: Daily at midnight</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Cart Cleanup
                    </label>
                    <input
                      type="text"
                      value={settings.job_clean_cart_schedule || '0 * * * *'}
                      onChange={(e) => handleChange('job_clean_cart_schedule', e.target.value)}
                      className="input w-full font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Default: Every hour</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Transfer Sync
                    </label>
                    <input
                      type="text"
                      value={settings.job_sync_transfers_schedule || '0 */2 * * *'}
                      onChange={(e) => handleChange('job_sync_transfers_schedule', e.target.value)}
                      className="input w-full font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Default: Every 2 hours</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Auto-Renew
                    </label>
                    <input
                      type="text"
                      value={settings.job_auto_renew_schedule || '0 3 * * *'}
                      onChange={(e) => handleChange('job_auto_renew_schedule', e.target.value)}
                      className="input w-full font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Default: Daily at 3 AM</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Push Request Expiry
                    </label>
                    <input
                      type="text"
                      value={settings.job_expire_push_schedule || '30 * * * *'}
                      onChange={(e) => handleChange('job_expire_push_schedule', e.target.value)}
                      className="input w-full font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Default: Every hour at :30</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Maintenance Tab */}
          {activeTab === 'maintenance' && (
            <div className="space-y-6">
              <div className={`p-6 rounded-lg border-2 ${
                settings.maintenance_mode === 'true'
                  ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                  : 'border-slate-200 dark:border-slate-700'
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Maintenance Mode</h3>
                    <p className="text-sm text-slate-500">When enabled, non-admin users will see a maintenance page</p>
                  </div>
                  <button
                    onClick={toggleMaintenance}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      settings.maintenance_mode === 'true'
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {settings.maintenance_mode === 'true' ? 'Disable' : 'Enable'}
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Maintenance Message
                  </label>
                  <textarea
                    value={settings.maintenance_message || ''}
                    onChange={(e) => handleChange('maintenance_message', e.target.value)}
                    rows={3}
                    className="input w-full"
                    placeholder="We are currently performing maintenance. Please check back soon."
                  />
                </div>
              </div>

              {settings.maintenance_mode === 'true' && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div className="text-sm text-yellow-800 dark:text-yellow-200">
                      <p className="font-medium">Maintenance Mode is Active</p>
                      <p>Non-admin users cannot access the site. Admins can still log in via the /login page.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Migration Tab */}
          {activeTab === 'migration' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Sub-Account Migration</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Import sub-accounts from eNom and convert them to WorxTech user accounts.
                </p>
                <button
                  onClick={fetchSubAccounts}
                  disabled={subAccountsLoading}
                  className="btn-primary"
                >
                  {subAccountsLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Load Sub-Accounts
                </button>
              </div>

              {subAccounts.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Login ID</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Email</th>
                        <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                        <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {subAccounts.map(sa => (
                        <tr key={sa.loginId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 text-sm text-slate-900 dark:text-slate-100">{sa.loginId}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{sa.email}</td>
                          <td className="px-4 py-3">
                            {sa.imported ? (
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                                Imported
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 rounded-full">
                                Not Imported
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => {
                                  setSelectedSubAccount(sa.loginId);
                                  fetchSubAccountDomains(sa.loginId);
                                }}
                                className="btn-secondary text-xs py-1"
                              >
                                View Domains
                              </button>
                              {!sa.imported ? (
                                <button
                                  onClick={() => importSubAccount(sa.loginId)}
                                  disabled={importingSubAccount === sa.loginId}
                                  className="btn-primary text-xs py-1"
                                >
                                  {importingSubAccount === sa.loginId ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <>
                                      <ArrowRight className="w-3 h-3 mr-1" />
                                      Import
                                    </>
                                  )}
                                </button>
                              ) : (
                                <button
                                  onClick={() => sendPasswordResetToUser(sa.worxtechUserId)}
                                  disabled={sendingResetEmail === sa.worxtechUserId}
                                  className="btn-secondary text-xs py-1"
                                >
                                  {sendingResetEmail === sa.worxtechUserId ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <>
                                      <KeyRound className="w-3 h-3 mr-1" />
                                      Send Reset
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sub-account domains modal */}
              {selectedSubAccount && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                        Domains for {selectedSubAccount}
                      </h3>
                      <button onClick={() => setSelectedSubAccount(null)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="p-4 overflow-y-auto max-h-96">
                      {subAccountDomainsLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                      ) : subAccountDomains.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No domains found</p>
                      ) : (
                        <div className="space-y-2">
                          {subAccountDomains.map((domain, i) => (
                            <div key={i} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-between">
                              <span className="text-slate-900 dark:text-slate-100">{domain.sld}.{domain.tld}</span>
                              <span className="text-sm text-slate-500">Expires: {domain.expiration}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Template Edit Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Edit Template: {editingTemplate.name}
              </h3>
              <button onClick={() => setEditingTemplate(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Subject</label>
                <input
                  type="text"
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">HTML Content</label>
                <textarea
                  value={editingTemplate.html_content}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, html_content: e.target.value })}
                  rows={15}
                  className="input w-full font-mono text-sm"
                />
              </div>
              <div className="text-sm text-slate-500">
                <strong>Available Variables:</strong> {editingTemplate.variables?.join(', ') || 'None'}
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingTemplate.is_active}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, is_active: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-slate-700 dark:text-slate-300">Template is active</span>
              </label>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button onClick={() => setEditingTemplate(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveTemplate} disabled={savingTemplate} className="btn-primary">
                {savingTemplate ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {previewingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">Template Preview</h3>
                <p className="text-sm text-slate-500">Subject: {previewingTemplate.subject}</p>
              </div>
              <button onClick={() => setPreviewingTemplate(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <iframe
                srcDoc={previewingTemplate.html}
                title="Email Preview"
                className="w-full border border-slate-200 rounded-lg bg-white"
                style={{ height: '60vh', minHeight: '400px' }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}

      {/* Legal Page Edit Modal */}
      {editingLegalPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Edit {editingLegalPage.title}
              </h3>
              <button onClick={() => setEditingLegalPage(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Page Title
                </label>
                <input
                  type="text"
                  value={editingLegalPage.title}
                  onChange={(e) => setEditingLegalPage({ ...editingLegalPage, title: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Content (HTML)
                  </label>
                  <button
                    onClick={loadDefaultTemplate}
                    className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    Load Default Template
                  </button>
                </div>
                <textarea
                  value={editingLegalPage.content}
                  onChange={(e) => setEditingLegalPage({ ...editingLegalPage, content: e.target.value })}
                  rows={20}
                  className="input w-full font-mono text-sm"
                  placeholder="<h2>Section Title</h2>&#10;<p>Your content here...</p>"
                />
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
                <strong>Tip:</strong> Click "Load Default Template" to start with the default content and customize it.
                Leave content empty to use the built-in default (which includes your site name and support email).
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button onClick={() => setEditingLegalPage(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveLegalPage} disabled={savingLegalPage} className="btn-primary">
                {savingLegalPage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSettings;
