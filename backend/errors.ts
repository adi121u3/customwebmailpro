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
  const authFailure = /auth|credentials|login|password/i.test(message) ||
    ['EAUTH', 'AUTHENTICATIONFAILED'].includes(error?.code);

  if (authFailure) {
    return new AppError(401, 'MAIL_AUTH_FAILED', 'Mailbox sign-in failed. Check the email address and password.');
  }

  return new AppError(502, 'MAIL_PROVIDER_ERROR', 'The mail server could not complete the request.');
}
