export interface AutoDiscoverResult {
  domain: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

export function autoDiscoverConfig(email: string): AutoDiscoverResult {
  const cleanEmail = email.trim().toLowerCase();
  const domain = cleanEmail.includes('@') ? cleanEmail.split('@')[1] : cleanEmail;

  let imapHost = `imap.${domain}`;
  let smtpHost = `smtp.${domain}`;
  let imapPort = 993;
  let smtpPort = 465;
  let imapSecure = true;
  let smtpSecure = true;

  if (domain.includes('gmail.com')) {
    imapHost = 'imap.gmail.com';
    smtpHost = 'smtp.gmail.com';
    imapPort = 993;
    smtpPort = 465;
  } else if (domain.includes('yahoo.com')) {
    imapHost = 'imap.mail.yahoo.com';
    smtpHost = 'smtp.mail.yahoo.com';
    imapPort = 993;
    smtpPort = 465;
  } else if (domain.includes('outlook.com') || domain.includes('hotmail.com') || domain.includes('live.com') || domain.includes('office365.com') || domain.includes('microsoft.com')) {
    imapHost = 'outlook.office365.com';
    smtpHost = 'smtp.office365.com';
    imapPort = 993;
    smtpPort = 587;
    smtpSecure = false;
  } else if (domain.includes('icloud.com') || domain.includes('me.com')) {
    imapHost = 'imap.mail.me.com';
    smtpHost = 'smtp.mail.me.com';
    imapPort = 993;
    smtpPort = 587;
  } else if (domain.includes('bell.net') || domain.includes('sympatico.ca')) {
    imapHost = 'imap.bell.net';
    smtpHost = 'smtp.bell.net';
    imapPort = 993;
    smtpPort = 465;
  } else if (domain.includes('rackspace.com') || domain.includes('emailsrvr.com')) {
    imapHost = 'secure.emailsrvr.com';
    smtpHost = 'secure.emailsrvr.com';
    imapPort = 993;
    smtpPort = 465;
  }

  return {
    domain,
    imapHost,
    imapPort,
    imapSecure,
    smtpHost,
    smtpPort,
    smtpSecure,
  };
}
