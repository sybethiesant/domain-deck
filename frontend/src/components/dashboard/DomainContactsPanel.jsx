import React, { useState, useEffect } from 'react';
import { Loader2, User, Mail, Phone, MapPin, Building2, Edit2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../App';
import { API_URL } from '../../config/api';
import DomainContactEditModal from './DomainContactEditModal';

const CONTACT_TYPES = [
  { key: 'registrant', label: 'Registrant', description: 'Domain owner', required: true },
  { key: 'admin', label: 'Admin', description: 'Administrative contact', required: false },
  { key: 'tech', label: 'Tech', description: 'Technical contact', required: false },
  { key: 'billing', label: 'Billing', description: 'Billing contact', required: false }
];

export default function DomainContactsPanel({ domainId, domainName }) {
  const { token } = useAuth();
  const [contacts, setContacts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingType, setEditingType] = useState(null);

  const fetchContacts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/domains/${domainId}/contacts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch contacts');
      }

      const data = await res.json();
      setContacts(data);
    } catch (err) {
      console.error('Error fetching domain contacts:', err);
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (domainId && token) {
      fetchContacts();
    }
  }, [domainId, token]);

  const handleEditSaved = () => {
    setEditingType(null);
    fetchContacts();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        <span className="ml-2 text-slate-500">Loading contacts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        <span>{error}</span>
        <button
          onClick={fetchContacts}
          className="ml-auto text-sm underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Check if contact has meaningful data (at least a name or email)
  const hasContactData = (contact) => {
    if (!contact) return false;
    const firstName = contact.firstName || contact.first_name;
    const lastName = contact.lastName || contact.last_name;
    const email = contact.email || contact.emailAddress;
    return !!(firstName || lastName || email);
  };

  // Helper to render contact details
  const renderContactDetails = (contact) => (
    <div className="space-y-2 text-sm">
      <div className="flex items-start gap-2">
        <User className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
        <span className="text-slate-700 dark:text-slate-300">
          {contact.firstName || contact.first_name} {contact.lastName || contact.last_name}
          {(contact.organization || contact.company) && (
            <span className="block text-slate-500 dark:text-slate-400 text-xs">
              {contact.organization || contact.company}
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-slate-700 dark:text-slate-300 truncate">
          {contact.email || contact.emailAddress}
        </span>
      </div>

      {(contact.phone) && (
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-slate-700 dark:text-slate-300">
            {contact.phone}
          </span>
        </div>
      )}

      {(contact.city || contact.City) && (
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <span className="text-slate-700 dark:text-slate-300">
            {contact.city || contact.City}, {contact.state || contact.stateProvince || contact.StateProvince} {contact.postalCode || contact.postal_code || contact.PostalCode}
            <span className="block text-slate-500 dark:text-slate-400 text-xs">
              {contact.country || contact.Country || 'US'}
            </span>
          </span>
        </div>
      )}
    </div>
  );

  const registrantContact = contacts?.registrant;
  const hasRegistrantData = hasContactData(registrantContact);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {CONTACT_TYPES.map(({ key, label, description, required }) => {
          const contact = contacts?.[key];
          const hasData = hasContactData(contact);
          // For non-registrant contacts with no data, they inherit from registrant
          const inheritsFromRegistrant = !required && !hasData && hasRegistrantData;

          return (
            <div
              key={key}
              className={`bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border ${
                inheritsFromRegistrant
                  ? 'border-indigo-200 dark:border-indigo-800'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-slate-900 dark:text-slate-100">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
                </div>
                <button
                  onClick={() => setEditingType(key)}
                  className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                  title={`Edit ${label} contact`}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>

              {hasData ? (
                renderContactDetails(contact)
              ) : inheritsFromRegistrant ? (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs text-indigo-600 dark:text-indigo-400">
                    <User className="w-3 h-3" />
                    <span>Uses Registrant contact</span>
                  </div>
                  <div className="opacity-75">
                    {renderContactDetails(registrantContact)}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400 italic">
                  No contact set
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editingType && (
        <DomainContactEditModal
          domainId={domainId}
          domainName={domainName}
          contactType={editingType}
          currentContact={contacts?.[editingType]}
          registrantContact={contacts?.registrant}
          onClose={() => setEditingType(null)}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  );
}
