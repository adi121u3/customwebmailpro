import { AppError } from '../../backend/errors.js';
import { loadMailConfig } from '../../backend/config-store.js';
import { sendMessage } from '../../backend/mail-service.js';
import { sendComposeOperation } from '../../rackspace/router/compose.js';
import { updateRecentContacts } from '../../rackspace/router/contacts.js';

export class SmtpDeliveryAdapter {
  name = 'smtp';

  async deliver(localMessage: any) {
    const config = await loadMailConfig();
    if (!config) throw new AppError(428, 'MAIL_NOT_CONFIGURED', 'SMTP mailbox settings are not configured.');
    return sendMessage(config, {
      to: localMessage.to,
      cc: localMessage.cc,
      bcc: localMessage.bcc,
      subject: localMessage.subject,
      fromName: localMessage.fromName,
      text: localMessage.text,
      html: localMessage.html,
      attachments: localMessage.attachments.map((attachment: any) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: Buffer.from(attachment.contentBase64, 'base64')
      }))
    });
  }
}

export class RackspaceWebmailAdapter {
  name = 'rackspace-webmail';

  async deliver(localMessage: any) {
    if (localMessage.attachments.some((item: any) => item.contentBase64)) {
      throw new AppError(400, 'RACKSPACE_ATTACHMENT_NOT_UPLOADED', 'Rackspace attachments must be uploaded before delivery.');
    }
    const context = localMessage.providerContext;
    const result = await sendComposeOperation({
      compose: { ...context.compose, to: localMessage.to.join(', '), cc: localMessage.cc.join(', '), bcc: localMessage.bcc.join(', '), subject: localMessage.subject, body: localMessage.html },
      originalFolder: context.originalFolder,
      originalUid: context.originalUid,
      draftUid: context.draftUid ?? null,
      autosaveId: context.autosaveId || ''
    });
    if (!result.confirmedSuccess) {
      throw new AppError(502, 'RACKSPACE_SEND_UNCONFIRMED', 'Rackspace returned a response whose success format has not been verified.');
    }
    const contacts = [...localMessage.to, ...localMessage.cc, ...localMessage.bcc].map((email: string) => ({ email, name: false }));
    if (contacts.length) await updateRecentContacts(contacts).catch(() => {});
    return { messageId: null, providerResponse: result.response };
  }
}

export class MailDeliveryService {
  adapters: Map<string, any>;
  constructor(adapters = [new SmtpDeliveryAdapter(), new RackspaceWebmailAdapter()]) {
    this.adapters = new Map(adapters.map(adapter => [adapter.name, adapter]));
  }

  deliver(message: any) {
    const adapter = this.adapters.get(message.provider);
    if (!adapter) throw new AppError(400, 'DELIVERY_PROVIDER_UNKNOWN', 'The delivery provider is not supported.');
    return adapter.deliver(message);
  }
}
