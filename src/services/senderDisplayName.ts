export const SENDER_DISPLAY_NAME_MAX_LENGTH = 100;

export function getStoredSenderName(): string {
  try {
    return localStorage.getItem('irumol_sender_display_name') || '';
  } catch {
    return '';
  }
}

export function setStoredSenderName(name: string): void {
  try {
    localStorage.setItem('irumol_sender_display_name', name.slice(0, SENDER_DISPLAY_NAME_MAX_LENGTH));
  } catch {}
}

export function resolveSenderDisplayName({ current, identityDefault, accountDefault, email }: {
  current?: string;
  identityDefault?: string;
  accountDefault?: string;
  email?: string;
}): string {
  const trimmed = (current || '').trim();
  if (trimmed) return trimmed;
  const identity = (identityDefault || '').trim();
  if (identity) return identity;
  const account = (accountDefault || '').trim();
  if (account) return account;
  const stored = getStoredSenderName().trim();
  if (stored) return stored;
  if (email) {
    const prefix = email.split('@')[0];
    return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1).replace(/[._]/g, ' ') : 'Irumol User';
  }
  return 'Irumol User';
}
