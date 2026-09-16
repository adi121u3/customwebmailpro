import { createRequire } from 'module';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { AppError } from './errors.js';

const require = createRequire(import.meta.url);
const MailComposer = require('nodemailer/lib/mail-composer');

function imapOptions(config: any) {
  return {
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapSecure,
    auth: { user: config.email, pass: config.password },
    tls: { rejectUnauthorized: config.rejectUnauthorized },
    logger: false as any
  };
}

function smtpTransport(config: any) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.email, pass: config.password },
    tls: { rejectUnauthorized: config.rejectUnauthorized },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true
  } as any);
}

async function withImap(config: any, operation: any) {
  const client = new ImapFlow(imapOptions(config));
  try {
    await client.connect();
    return await operation(client);
  } finally {
    if (client.usable) await client.logout().catch(() => {});
    else client.close();
  }
}

function addresses(list: any[] = []) {
  return list.map((item: any) => ({ name: item.name || '', address: item.address || '' }));
}

function summary(message: any, { folder = '', uidValidity = '' }: any = {}) {
  const validity = String(uidValidity || 'unknown');
  return {
    id: `imap:${folder}:${validity}:${message.uid}`,
    source: 'remote',
    uid: message.uid,
    uidValidity: validity,
    remoteFolder: folder,
    messageId: message.envelope?.messageId || '',
    subject: message.envelope?.subject || '',
    from: addresses(message.envelope?.from),
    to: addresses(message.envelope?.to),
    cc: addresses(message.envelope?.cc),
    date: message.internalDate || message.envelope?.date || null,
    size: message.size || 0,
    read: message.flags?.has('\\Seen') || false,
    flagged: message.flags?.has('\\Flagged') || false
  };
}

export async function verifySettings(config: any) {
  await Promise.all([
    withImap(config, async (client: any) => client.noop()),
    smtpTransport(config).verify()
  ]);
}

export async function listFolders(config: any) {
  return withImap(config, async (client: any) => {
    const folders = await client.list();
    const result = [];
    for (const folder of folders) {
      let unreadCount = 0;
      let messageCount = 0;
      try {
        const st = await client.status(folder.path, { messages: true, unseen: true });
        if (st) {
          unreadCount = Number(st.unseen || st.unread || 0);
          messageCount = Number(st.messages || 0);
        }
      } catch {}
      result.push({
        path: folder.path,
        name: folder.name || folder.path.split(folder.delimiter || '/').pop(),
        delimiter: folder.delimiter,
        specialUse: folder.specialUse || null,
        listed: folder.listed !== false,
        unreadCount,
        messageCount
      });
    }
    return result;
  });
}

export async function listMessages(config: any, folder: string, page: number, limit: number) {
  return withImap(config, async (client: any) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const total = client.mailbox.exists;
      const uidValidity = client.mailbox.uidValidity;
      const end = total - ((page - 1) * limit);
      if (end < 1) return { messages: [], page, limit, total };
      const start = Math.max(1, end - limit + 1);
      const messages = [];
      for await (const message of client.fetch(`${start}:${end}`, {
        uid: true,
        envelope: true,
        internalDate: true,
        size: true,
        flags: true
      })) {
        messages.push(summary(message, { folder, uidValidity }));
      }
      return { messages: messages.reverse(), page, limit, total };
    } finally {
      lock.release();
    }
  });
}

export async function getMessage(config: any, folder: string, uid: number) {
  return withImap(config, async (client: any) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const message = await client.fetchOne(uid, {
        uid: true,
        envelope: true,
        internalDate: true,
        flags: true,
        source: true
      }, { uid: true });
      if (!message) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
      const parsed = await simpleParser(message.source);
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
      return {
        ...summary(message, { folder, uidValidity: client.mailbox.uidValidity }),
        messageId: parsed.messageId || message.envelope?.messageId || '',
        replyTo: addresses(parsed.replyTo && 'value' in parsed.replyTo ? parsed.replyTo.value : []),
        text: parsed.text || '',
        html: typeof parsed.html === 'string' ? parsed.html : '',
        attachments: (parsed.attachments || []).map((item: any) => ({
          filename: item.filename || 'attachment',
          contentType: item.contentType,
          size: item.size,
          contentId: item.cid || null
        }))
      };
    } finally {
      lock.release();
    }
  });
}

export async function sendMessage(config: any, message: any) {
  const fallbackName = String(config.senderName || config.email.split('@')[0] || 'Mailbox user').trim();
  const fromName = String(message.fromName || fallbackName).trim().slice(0, 120) || 'Mailbox user';
  const mail = {
    from: { name: fromName, address: config.email },
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments || []
  };
  const raw = await new MailComposer(mail).compile().build();
  const info: any = await smtpTransport(config).sendMail(mail);

  let savedToSent = false;
  try {
    await withImap(config, async (client: any) => {
      const folders = await client.list();
      const sent = folders.find((folder: any) => folder.specialUse === '\\Sent') ||
        folders.find((folder: any) => /(^|\/)sent( items| mail)?$/i.test(folder.path));
      if (sent) {
        await client.append(sent.path, raw, ['\\Seen'], new Date());
        savedToSent = true;
      }
    });
  } catch {
    // Sending succeeded. A failure to copy to Sent must not report a false send failure.
  }

  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, savedToSent };
}

export async function setReadState(config: any, folder: string, uid: number, read: boolean) {
  return withImap(config, async (client: any) => {
    const lock = await client.getMailboxLock(folder);
    try {
      if (read) await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
      else await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
      return { uid, read };
    } finally {
      lock.release();
    }
  });
}

export async function moveMessage(config: any, folder: string, uid: number, destination: string) {
  return withImap(config, async (client: any) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const result = await client.messageMove(uid, destination, { uid: true });
      if (!result) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
      return { uid, from: folder, to: destination };
    } finally {
      lock.release();
    }
  });
}

export async function bulkMessageAction(config: any, folder: string, uids: number[], action: string, destination?: string) {
  return withImap(config, async (client: any) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const range = uids.map(Number).join(',');
      if (action === 'read') await client.messageFlagsAdd(range, ['\\Seen'], { uid: true });
      else if (action === 'unread') await client.messageFlagsRemove(range, ['\\Seen'], { uid: true });
      else if (action === 'flag') await client.messageFlagsAdd(range, ['\\Flagged'], { uid: true });
      else if (action === 'unflag') await client.messageFlagsRemove(range, ['\\Flagged'], { uid: true });
      else if (action === 'move') await client.messageMove(range, destination!, { uid: true });
      else if (action === 'delete') await client.messageDelete(range, { uid: true });
      else throw new AppError(400, 'BULK_ACTION_INVALID', 'Unsupported bulk message action.');
      return { changed: uids.length, action, destination: destination || null };
    } finally { lock.release(); }
  });
}
