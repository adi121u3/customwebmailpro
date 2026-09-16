import { z } from 'zod';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const addressParser = require('nodemailer/lib/addressparser');

const address = z.string().trim().email().max(320);
function parseAddresses(value: unknown) {
  const inputs = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return inputs.flatMap((input: any) => addressParser(String(input), { flatten: true })).map((item: any) => item.address).filter(Boolean);
}
const addressList = z.preprocess(parseAddresses, z.array(address).max(100).optional().default([]));
const signatureSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  html: z.string().max(500_000)
}).strict();

export const settingsSchema = z.object({
  email: address,
  senderName: z.string().trim().max(120).default(''),
  password: z.string().max(1024).optional().default(''),
  imapHost: z.string().trim().min(1).max(253).default('secure.emailsrvr.com'),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  imapSecure: z.boolean().default(true),
  smtpHost: z.string().trim().min(1).max(253).default('secure.emailsrvr.com'),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(465),
  smtpSecure: z.boolean().default(true),
  rejectUnauthorized: z.boolean().default(true),
  signatures: z.array(signatureSchema).max(20).default([]),
  defaultSignatureId: z.string().trim().max(64).default(''),
  signatureEnabled: z.boolean().default(false),
  signatureOnReply: z.boolean().default(false),
  signatureOnForward: z.boolean().default(false),
  signaturePlacement: z.enum(['above', 'below']).default('above'),
  defaultPriority: z.enum(['1', '2', '3', '4', '5']).default('3'),
  defaultReadReceipt: z.boolean().default(false),
  forwardEnabled: z.boolean().optional().default(false),
  forwardSaveCopy: z.boolean().optional().default(true),
  forwardEmails: addressList,
  language: z.string().trim().max(20).optional().default('en-US'),
  timezone: z.string().trim().max(50).optional().default('UTC'),
  syncInterval: z.string().trim().max(20).optional().default('5m'),
  pushEmailIdle: z.boolean().optional().default(true),
  authType: z.enum(['password', 'google_oauth', 'microsoft_oauth']).optional().default('password'),
  googleClientId: z.string().trim().max(500).optional().default(''),
  googleClientSecret: z.string().trim().max(500).optional().default(''),
  microsoftClientId: z.string().trim().max(500).optional().default(''),
  microsoftClientSecret: z.string().trim().max(500).optional().default(''),
  calendarExtensionEnabled: z.boolean().optional().default(false),
  calendarClientId: z.string().trim().max(500).optional().default(''),
  calendarClientSecret: z.string().trim().max(500).optional().default(''),
  contactsExtensionEnabled: z.boolean().optional().default(false),
  contactsClientId: z.string().trim().max(500).optional().default(''),
  contactsClientSecret: z.string().trim().max(500).optional().default('')
}).strict().superRefine((value, context) => {
  if (value.defaultSignatureId && !value.signatures.some((signature: any) => signature.id === value.defaultSignatureId)) {
    (context as any).addIssue({ code: z.ZodIssueCode.custom, path: ['defaultSignatureId'], message: 'Default signature must reference an existing signature.' });
  }
});

export const sendSchema = z.object({
  to: addressList.refine((value: any) => value.length > 0, 'At least one recipient is required'),
  cc: addressList,
  bcc: addressList,
  subject: z.string().max(998).default(''),
  text: z.string().max(5_000_000).optional(),
  html: z.string().max(5_000_000).optional()
}).refine((value: any) => value.text || value.html, { message: 'A message body is required' });

export const folderQuerySchema = z.object({
  folder: z.string().min(1).max(1000).default('INBOX'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const messageQuerySchema = z.object({
  folder: z.string().min(1).max(1000).default('INBOX')
});

export const rackspaceResendSchema = z.object({
  folder: z.string().min(1).max(1000),
  uid: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
  thirdArgument: z.boolean()
}).strict();

export const rackspaceComposeLoadSchema = z.object({
  action: z.enum(['new', 'reply', 'reply_all', 'forward', 'resend', 'restore_draft']),
  folder: z.string().min(1).max(1000).nullable().optional().default(null),
  uid: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).nullable().optional().default(null),
  thirdArgument: z.boolean().default(false)
}).strict().superRefine((value, context) => {
  if (value.action !== 'new' && (!value.folder || value.uid === null)) (context as any).addIssue({ code: z.ZodIssueCode.custom, message: 'Folder and UID are required for this compose action.' });
});

export const rackspaceComposeSchema = z.object({
  identity: z.union([z.string().min(1), z.number()]),
  signature: z.union([z.string(), z.boolean(), z.null()]),
  body: z.string().max(5_000_000),
  action: z.literal('resend'),
  priority: z.union([z.string(), z.number()]),
  read_receipt: z.union([z.boolean(), z.null()]),
  to: z.string().max(100_000),
  cc: z.string().max(100_000),
  bcc: z.string().max(100_000),
  subject: z.string().max(998),
  attachments: z.array(z.unknown()).max(100),
  compose_type: z.string().min(1).max(50)
}).passthrough();

export const rackspaceSendResendSchema = z.object({
  compose: rackspaceComposeSchema,
  originalFolder: z.string().min(1).max(1000),
  originalUid: z.union([z.string().regex(/^\d+$/), z.number().int().positive()])
}).strict();

export const localAttachmentSchema = z.object({
  id: z.string().uuid().optional(),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255).default('application/octet-stream'),
  size: z.number().int().min(0).max(20_000_000),
  contentBase64: z.string().max(27_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/, 'Attachment content is not valid base64')
}).strict().refine((value: any) => Buffer.byteLength(value.contentBase64, 'base64') === value.size, 'Attachment size does not match its content');

export const localMessageSchema = z.object({
  from: z.string().trim().email().max(320).optional().default(''),
  fromName: z.string().trim().min(1).max(120),
  to: addressList.refine((value: any) => value.length > 0, 'At least one recipient is required'),
  cc: addressList,
  bcc: addressList,
  subject: z.string().max(998).default(''),
  html: z.string().max(5_000_000).optional().default(''),
  text: z.string().max(5_000_000).optional().default(''),
  attachments: z.array(localAttachmentSchema).max(25).default([]),
  providerContext: z.record(z.string(), z.any()).optional().default({})
}).refine((value: any) => value.html || value.text, { message: 'A message body is required' });

export const outgoingSchema = z.object({
  provider: z.enum(['smtp', 'rackspace-webmail']),
  operation: z.enum(['new', 'reply', 'reply_all', 'forward', 'resend', 'restore_draft']),
  message: localMessageSchema
}).strict().superRefine((value, context) => {
  if (value.provider === 'smtp' && value.operation !== 'new') {
    (context as any).addIssue({ code: z.ZodIssueCode.custom, message: 'Captured Rackspace compose operations require the Rackspace provider.' });
  }
});

const draftMessageSchema = z.object({
  from: z.string().trim().email().max(320).optional().default(''),
  fromName: z.string().trim().min(1).max(120),
  to: addressList, cc: addressList, bcc: addressList,
  subject: z.string().max(998).default(''),
  html: z.string().max(5_000_000).optional().default(''),
  text: z.string().max(5_000_000).optional().default(''),
  attachments: z.array(localAttachmentSchema).max(25).default([]),
  providerContext: z.record(z.string(), z.any()).optional().default({})
});

export const draftSchema = z.object({
  operation: z.enum(['new', 'reply', 'reply_all', 'forward', 'resend', 'restore_draft']).default('new'),
  message: draftMessageSchema
}).strict();

export const rackspaceComposeMutationSchema = z.object({
  compose: z.record(z.string(), z.any()),
  originalFolder: z.string().min(1).max(1000).nullable().optional().default(null),
  originalUid: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).nullable().optional().default(null),
  draftUid: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).nullable().optional().default(null),
  autosaveId: z.string().max(1000).default('')
}).strict();

export const rackspaceChangeBodyTypeSchema = z.object({
  action: z.literal('new'),
  signature: z.null(),
  type: z.literal('html'),
  body: z.string().max(5_000_000)
}).strict();

export function parse(schema: any, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error: any = new Error('Request validation failed');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = result.error.flatten();
    throw error;
  }
  return result.data;
}
