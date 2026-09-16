export class AppError extends Error {
  status: number;
  code: string;
  details?: any;

  constructor(status: number, code: string, message: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function publicError(error: any): AppError {
  if (error instanceof AppError) return error;

  const message = String(error?.message || 'Unexpected server error');
  const code = String(error?.code || '').toUpperCase();

  // DNS & Network errors
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /getaddrinfo enotfound|dns lookup/i.test(message)) {
    return new AppError(503, 'DNS_LOOKUP_FAILED', 'DNS lookup temporarily failed—retrying');
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ESOCKET' || /timeout|socket|connection refused|reset/i.test(message)) {
    return new AppError(504, 'NETWORK_TIMEOUT_OR_BLOCKED', 'Cannot reach mail server port. Check network connection, firewall, or port settings (e.g. 465/993).');
  }

  // Authentication errors
  if (code === 'EAUTH' || code === 'AUTHENTICATIONFAILED' || /auth|credentials|login|password|535/i.test(message)) {
    return new AppError(401, 'MAIL_AUTH_FAILED', 'Mailbox password or authentication rejected.');
  }

  // TLS errors
  if (/cert|tls|ssl|self signed|certificate verify failed/i.test(message) || ['DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED'].includes(code)) {
    return new AppError(502, 'TLS_VALIDATION_FAILED', 'TLS certificate validation failed. Check server certificate settings.');
  }

  // Recipient rejection (5xx)
  if (/5\d\d|rejected|mailbox unavailable|spam/i.test(message)) {
    return new AppError(400, 'MESSAGE_REJECTED', 'Message rejected by recipient server.');
  }

  return new AppError(502, 'MAIL_PROVIDER_ERROR', message || 'The mail server could not complete the request.');
}
