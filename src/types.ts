export interface Message {
  id: string;
  uid?: string | number;
  folderPath: string;
  remoteFolder?: string;
  folder?: string;
  from: string | { name?: string; address: string }[];
  fromName?: string;
  to: string | { name?: string; address: string }[];
  cc?: string | { name?: string; address: string }[];
  bcc?: string | { name?: string; address: string }[];
  subject: string;
  date: string;
  receivedDate?: string;
  read: boolean;
  flagged: boolean;
  size?: number;
  status?: string;
  error?: string;
  html?: string;
  text?: string;
  body?: string;
  loading?: boolean;
  attachments?: {
    id?: string;
    filename?: string;
    name?: string;
    contentType?: string;
    size?: number;
    contentBase64?: string;
  }[];
}

export interface Folder {
  path: string;
  name: string;
  specialUse?: string;
  unreadCount?: number;
  messageCount?: number;
  totalCount?: number;
}

export interface Signature {
  id: string;
  name: string;
  html: string;
}

export interface Settings {
  email: string;
  senderName: string;
  password?: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  rejectUnauthorized: boolean;
  signatures: Signature[];
  defaultSignatureId: string;
  signatureEnabled: boolean;
  signatureOnReply: boolean;
  signatureOnForward: boolean;
  signaturePlacement: 'above' | 'below';
  defaultPriority: string;
  defaultReadReceipt: boolean;
  forwardEnabled?: boolean;
  forwardSaveCopy?: boolean;
  forwardEmails?: string[];
  language?: string;
  timezone?: string;
  defaultFont?: string;
  defaultBodyFormat?: 'html' | 'plain';
  syncInterval?: string;
  pushEmailIdle?: boolean;
  authType?: 'password' | 'google_oauth' | 'microsoft_oauth';
  googleClientId?: string;
  googleClientSecret?: string;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
  calendarExtensionEnabled?: boolean;
  calendarClientId?: string;
  calendarClientSecret?: string;
  contactsExtensionEnabled?: boolean;
  contactsClientId?: string;
  contactsClientSecret?: string;
  configured?: boolean;
}

export interface Preferences {
  density: 'micro' | 'compact' | 'standard' | 'large';
  previewPane: boolean;
  mailboxSource: 'imap' | 'rackspace' | 'demo';
  theme: 'slate' | 'navy' | 'midnight' | 'emerald';
}
