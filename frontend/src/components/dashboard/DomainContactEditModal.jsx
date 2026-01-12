import React, { useState, useEffect } from 'react';
import { X, Loader2, Upload, Edit3, Check, Copy } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import toast from 'react-hot-toast';

const CONTACT_TYPES = [
  { key: 'registrant', label: 'Registrant', description: 'Domain owner' },
  { key: 'admin', label: 'Administrative', description: 'Admin contact' },
  { key: 'tech', label: 'Technical', description: 'Tech contact' },
  { key: 'billing', label: 'Billing', description: 'Billing contact' }
];

export default function DomainContactEditModal({
  domainId,
  domainName,
  contactType, // Initial contact type to select
  currentContact,
  registrantContact, // Registrant data for copy functionality
  onClose,
  onSaved
}) {
  const { token } = useAuth();
  // Check if registrant has data to enable copy option
  const hasRegistrantData = registrantContact && (registrantContact.firstName || registrantContact.first_name);
  const [mode, setMode] = useState('import'); // 'import', 'manual', or 'registrant'
  const [savedContacts, setSavedContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Which contact types to update (multi-select)
  const [selectedTypes, setSelectedTypes] = useState({
    registrant: contactType === 'registrant',
    admin: contactType === 'admin',
    tech: contactType === 'tech',
    billing: contactType === 'billing'
  });

  // Manual entry form state
  const [formData, setFormData] = useState({
    first_name: currentContact?.firstName || currentContact?.first_name || '',
    last_name: currentContact?.lastName || currentContact?.last_name || '',
    organization: currentContact?.organization || currentContact?.company || '',
    email: currentContact?.email || currentContact?.emailAddress || '',
    phone: currentContact?.phone || '',
    address_line1: currentContact?.address1 || currentContact?.address_line1 || currentContact?.Address1 || '',
    address_line2: currentContact?.address2 || currentContact?.address_line2 || currentContact?.Address2 || '',
    city: currentContact?.city || currentContact?.City || '',
    state: currentContact?.state || currentContact?.stateProvince || currentContact?.StateProvince || '',
    postal_code: currentContact?.postalCode || currentContact?.postal_code || currentContact?.PostalCode || '',
    country: currentContact?.country || currentContact?.Country || 'US'
  });

  // Fetch saved contacts for import
  useEffect(() => {
    async function fetchSavedContacts() {
      try {
        const res = await fetch(`${API_URL}/contacts`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          // API returns array directly, not { contacts: [] }
          const contacts = Array.isArray(data) ? data : (data.contacts || []);
          setSavedContacts(contacts);
          // Auto-select default contact if available
          const defaultContact = contacts.find(c => c.is_default);
          if (defaultContact) {
            setSelectedContactId(defaultContact.id);
          } else if (contacts.length > 0) {
            setSelectedContactId(contacts[0].id);
          }
          if (contacts.length === 0) {
            setMode('manual');
          }
        }
      } catch (err) {
        console.error('Failed to fetch contacts:', err);
        setMode('manual');
      }
      setLoadingContacts(false);
    }
    fetchSavedContacts();
  }, [token]);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const toggleContactType = (type) => {
    setSelectedTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const getSelectedCount = () => {
    return Object.values(selectedTypes).filter(Boolean).length;
  };

  const validateForm = () => {
    const required = ['first_name', 'last_name', 'email', 'phone', 'address_line1', 'city', 'state', 'postal_code'];
    return required.every(field => formData[field]?.trim());
  };

  const handleSave = async () => {
    // Check at least one contact type is selected
    if (getSelectedCount() === 0) {
      toast.error('Please select at least one contact type to update');
      return;
    }

    let contactToSave;

    // Copy from Registrant mode
    if (mode === 'registrant' && hasRegistrantData) {
      contactToSave = {
        firstName: registrantContact.firstName || registrantContact.first_name,
        lastName: registrantContact.lastName || registrantContact.last_name,
        organization: registrantContact.organization || registrantContact.company || '',
        email: registrantContact.email || registrantContact.emailAddress,
        phone: registrantContact.phone,
        address1: registrantContact.address1 || registrantContact.address_line1,
        address2: registrantContact.address2 || registrantContact.address_line2 || '',
        city: registrantContact.city || registrantContact.City,
        state: registrantContact.state || registrantContact.stateProvince,
        postalCode: registrantContact.postalCode || registrantContact.postal_code,
        country: registrantContact.country || registrantContact.Country || 'US'
      };
    }
    // Use import mode if we have saved contacts and either selected one or can use the first
    else if (mode === 'import' && savedContacts.length > 0) {
      // Use selected contact, or fall back to first saved contact
      const contactId = selectedContactId || savedContacts[0]?.id;
      const selected = savedContacts.find(c => c.id === contactId);

      if (!selected) {
        toast.error('Please select a contact');
        return;
      }

      contactToSave = {
        firstName: selected.first_name,
        lastName: selected.last_name,
        organization: selected.organization || '',
        email: selected.email,
        phone: selected.phone,
        address1: selected.address_line1,
        address2: selected.address_line2 || '',
        city: selected.city,
        state: selected.state,
        postalCode: selected.postal_code,
        country: selected.country || 'US'
      };
    } else {
      if (!validateForm()) {
        toast.error('Please fill in all required fields');
        return;
      }
      contactToSave = {
        firstName: formData.first_name,
        lastName: formData.last_name,
        organization: formData.organization || '',
        email: formData.email,
        phone: formData.phone,
        address1: formData.address_line1,
        address2: formData.address_line2 || '',
        city: formData.city,
        state: formData.state,
        postalCode: formData.postal_code,
        country: formData.country || 'US'
      };
    }

    setSaving(true);

    try {
      // Build request body with all selected contact types
      const requestBody = {};
      if (selectedTypes.registrant) requestBody.registrant = contactToSave;
      if (selectedTypes.admin) requestBody.admin = contactToSave;
      if (selectedTypes.tech) requestBody.tech = contactToSave;
      if (selectedTypes.billing) requestBody.billing = contactToSave;

      const res = await fetch(`${API_URL}/domains/${domainId}/contacts`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update contacts');
      }

      const updatedTypes = Object.entries(selectedTypes)
        .filter(([_, selected]) => selected)
        .map(([type]) => CONTACT_TYPES.find(t => t.key === type)?.label)
        .join(', ');

      toast.success(`Updated: ${updatedTypes}`);
      onSaved();
    } catch (err) {
      console.error('Error saving contacts:', err);
      toast.error(err.message);
    }

    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Update Domain Contacts
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {domainName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-8rem)]">
          {loadingContacts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : (
            <>
              {/* Contact types to update */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                  Select contact types to update:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CONTACT_TYPES.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleContactType(key)}
                      className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        selectedTypes[key]
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {selectedTypes[key] && <Check className="w-4 h-4" />}
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {getSelectedCount()} contact type{getSelectedCount() !== 1 ? 's' : ''} selected
                </p>
              </div>

              {/* Mode selector */}
              <div className="flex flex-wrap gap-3 mb-6">
                {/* Copy from Registrant option - only show for non-registrant contact types */}
                {hasRegistrantData && contactType !== 'registrant' && (
                  <button
                    type="button"
                    onClick={() => setMode('registrant')}
                    className={`flex-1 min-w-[140px] py-3 px-4 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
                      mode === 'registrant'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Copy className="w-4 h-4" />
                    Copy from Registrant
                  </button>
                )}
                {savedContacts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMode('import')}
                    className={`flex-1 min-w-[140px] py-3 px-4 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
                      mode === 'import'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    Import from Saved
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className={`flex-1 min-w-[140px] py-3 px-4 rounded-lg border-2 transition-colors flex items-center justify-center gap-2 ${
                    mode === 'manual'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                  Enter Manually
                </button>
              </div>

              {/* Registrant copy mode */}
              {mode === 'registrant' && hasRegistrantData && (
                <div className="space-y-4">
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                    <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-3">
                      The following contact information from the Registrant will be copied:
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-indigo-500 dark:text-indigo-400">Name:</span>
                        <span className="ml-2 text-slate-700 dark:text-slate-300">
                          {registrantContact.firstName || registrantContact.first_name} {registrantContact.lastName || registrantContact.last_name}
                        </span>
                      </div>
                      {(registrantContact.organization || registrantContact.company) && (
                        <div>
                          <span className="text-indigo-500 dark:text-indigo-400">Org:</span>
                          <span className="ml-2 text-slate-700 dark:text-slate-300">
                            {registrantContact.organization || registrantContact.company}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-indigo-500 dark:text-indigo-400">Email:</span>
                        <span className="ml-2 text-slate-700 dark:text-slate-300">
                          {registrantContact.email || registrantContact.emailAddress}
                        </span>
                      </div>
                      <div>
                        <span className="text-indigo-500 dark:text-indigo-400">Phone:</span>
                        <span className="ml-2 text-slate-700 dark:text-slate-300">
                          {registrantContact.phone}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-indigo-500 dark:text-indigo-400">Address:</span>
                        <span className="ml-2 text-slate-700 dark:text-slate-300">
                          {registrantContact.address1 || registrantContact.address_line1}, {registrantContact.city || registrantContact.City}, {registrantContact.state || registrantContact.stateProvince} {registrantContact.postalCode || registrantContact.postal_code}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Import mode */}
              {mode === 'import' && savedContacts.length > 0 && (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Select a saved contact to apply:
                  </label>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {savedContacts.map(contact => (
                      <label
                        key={contact.id}
                        className={`block p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedContactId === contact.id
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="selectedContact"
                          value={contact.id}
                          checked={selectedContactId === contact.id}
                          onChange={() => setSelectedContactId(contact.id)}
                          className="sr-only"
                        />
                        <div className="space-y-2">
                          {/* Name and Default Badge */}
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {contact.first_name} {contact.last_name}
                            </div>
                            {contact.is_default && (
                              <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded">
                                Default
                              </span>
                            )}
                          </div>

                          {/* Organization (if present) */}
                          {contact.organization && (
                            <div className="text-sm text-slate-600 dark:text-slate-300">
                              {contact.organization}
                            </div>
                          )}

                          {/* Contact Details Grid */}
                          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                            {/* Email */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Email:</span>
                              <span className="truncate">{contact.email}</span>
                            </div>

                            {/* Phone */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Phone:</span>
                              <span>{contact.phone}</span>
                            </div>
                          </div>

                          {/* Address */}
                          <div className="text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
                            <div>{contact.address_line1}</div>
                            {contact.address_line2 && <div>{contact.address_line2}</div>}
                            <div>
                              {contact.city}, {contact.state} {contact.postal_code}
                            </div>
                            <div className="text-slate-400">{contact.country || 'US'}</div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual mode */}
              {(mode === 'manual' || savedContacts.length === 0) && (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        First Name *
                      </label>
                      <input
                        type="text"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleInputChange}
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleInputChange}
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Organization
                      </label>
                      <input
                        type="text"
                        name="organization"
                        value={formData.organization}
                        onChange={handleInputChange}
                        placeholder="Optional"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Email *
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="input"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Phone * <span className="text-xs text-slate-500">(Include country code)</span>
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="+1.5551234567"
                        className="input"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Street Address *
                    </label>
                    <input
                      type="text"
                      name="address_line1"
                      value={formData.address_line1}
                      onChange={handleInputChange}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Address Line 2
                    </label>
                    <input
                      type="text"
                      name="address_line2"
                      value={formData.address_line2}
                      onChange={handleInputChange}
                      placeholder="Apt, Suite, Unit (Optional)"
                      className="input"
                    />
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        State *
                      </label>
                      <input
                        type="text"
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        ZIP/Postal *
                      </label>
                      <input
                        type="text"
                        name="postal_code"
                        value={formData.postal_code}
                        onChange={handleInputChange}
                        className="input"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Country *
                    </label>
                    <select
                      name="country"
                      value={formData.country}
                      onChange={handleInputChange}
                      className="input"
                    >
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="GB">United Kingdom</option>
                      <option value="AU">Australia</option>
                      <option value="DE">Germany</option>
                      <option value="FR">France</option>
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingContacts || getSelectedCount() === 0}
            className="btn-primary px-6"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              `Update ${getSelectedCount()} Contact${getSelectedCount() !== 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
