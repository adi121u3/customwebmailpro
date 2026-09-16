import { AppError } from '../../backend/errors.js';
import { callRackspaceRouter } from './client.js';

export async function updateRecentContacts(contacts: any[]) {
  const response = await callRackspaceRouter('Contacts.updateRecentContacts', buildUpdateRecentContactsArgs(contacts));
  if (!Array.isArray(response) || !response[0] || typeof response[0] !== 'object') {
    throw new AppError(502, 'RACKSPACE_RECENT_CONTACTS_RESPONSE_UNKNOWN', 'Rackspace returned an unrecognized recent-contacts response.');
  }
  return response[0];
}

export function buildUpdateRecentContactsArgs(contacts: any[]) { return [contacts]; }
