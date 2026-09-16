import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { CheckCircle2, FileSignature, Forward, Globe, HelpCircle, LockKeyhole, LogOut, Palette, PenLine, Plus, Puzzle, RefreshCw, Server, SlidersHorizontal, Trash2, UserPlus, UserRound, X } from 'lucide-react';
import api from '../api';
import { Settings, Preferences } from '../types';

const tabs = [
  ['addAccount', UserPlus, 'Add Email Account'],
  ['general', Globe, 'General'],
  ['account', UserRound, 'Identity & Account'],
  ['composing', PenLine, 'Composing Email'],
  ['forward', Forward, 'Incoming & Forward'],
  ['signatures', FileSignature, 'Signatures'],
  ['servers', Server, 'Server'],
  ['sync', RefreshCw, 'Sync & Push'],
  ['extensions', Puzzle, 'Extensions (Calendar & Contacts)'],
  ['rackspace', SlidersHorizontal, 'Rackspace Integration'],
  ['appearance', Palette, 'Appearance'],
  ['help', HelpCircle, 'Help & Troubleshooting'],
  ['security', LockKeyhole, 'Security & Tokens']
] as const;

const settingsDefaults = {
  language: 'en-US',
  timezone: 'UTC',
  defaultFont: 'Inter',
  defaultBodyFormat: 'html' as const,
  signatures: [],
  defaultSignatureId: '',
  signatureEnabled: false,
  signatureOnReply: false,
  signatureOnForward: false,
  signaturePlacement: 'above' as const,
  defaultPriority: '3',
  defaultReadReceipt: false,
  forwardEnabled: false,
  forwardSaveCopy: true,
  forwardEmails: ['', '', '', '']
};

interface SettingsModalProps {
  settings: Settings;
  preferences: Preferences;
  onPreferences: (prefs: Preferences) => void;
  onClose: () => void;
  onSave: (settings: Settings) => Promise<void>;
}

export default function SettingsModal({
  settings,
  preferences,
  onPreferences,
  onClose,
  onSave
}: SettingsModalProps) {
  const [active, setActive] = useState<typeof tabs[number][0]>('general');
  const [form, setForm] = useState<Settings>({
    email: '',
    senderName: '',
    password: '',
    imapHost: 'secure.emailsrvr.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'secure.emailsrvr.com',
    smtpPort: 465,
    smtpSecure: true,
    rejectUnauthorized: true,
    ...settingsDefaults,
    ...settings,
    forwardEmails: settings.forwardEmails || ['', '', '', '']
  });

  const [selectedSignatureId, setSelectedSignatureId] = useState(
    settings.defaultSignatureId || settings.signatures?.[0]?.id || ''
  );
  const [rackspace, setRackspace] = useState<any>(null);
  const [token, setToken] = useState(() => localStorage.getItem('customwebmail_app_token') || '');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  useEffect(() => {
    api.get('/rackspace/status')
      .then(res => setRackspace(res.data))
      .catch(() => setRackspace({ configured: false }));
  }, []);

  const update = (name: keyof Settings, value: any) => setForm(current => ({ ...current, [name]: value }));

  const handleOAuthLogin = async (provider: 'google' | 'microsoft') => {
    try {
      const res = await api.get(`/auth/${provider}/url`);
      const authUrl = res.data.url;
      const popup = window.open(authUrl, `${provider}_oauth`, 'width=600,height=700');
      if (!popup) {
        alert('Please allow popups to sign in with ' + provider);
        return;
      }
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === provider) {
          window.removeEventListener('message', handleMessage);
          update('authType', `${provider}_oauth`);
          if (provider === 'google') {
            update('imapHost', 'imap.gmail.com');
            update('smtpHost', 'smtp.gmail.com');
            update('imapPort', 993);
            update('smtpPort', 465);
          } else {
            update('imapHost', 'outlook.office365.com');
            update('smtpHost', 'smtp.office365.com');
            update('imapPort', 993);
            update('smtpPort', 587);
          }
          window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `Successfully authorized with ${provider === 'google' ? 'Google' : 'Microsoft'}!`, type: 'success' } }));
        }
      };
      window.addEventListener('message', handleMessage);
    } catch (err: any) {
      window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `OAuth initialization failed: ${err.message || err}`, type: 'error' } }));
    }
  };

  const autoDiscoverHost = async (val: string) => {
    update('email', val);
    if (val.includes('@') && val.includes('.')) {
      try {
        const res = await api.get(`/autodiscover?email=${encodeURIComponent(val)}`);
        if (res.data && res.data.success) {
          update('imapHost', res.data.imapHost);
          update('imapPort', res.data.imapPort);
          update('imapSecure', res.data.imapSecure);
          update('smtpHost', res.data.smtpHost);
          update('smtpPort', res.data.smtpPort);
          update('smtpSecure', res.data.smtpSecure);
        }
      } catch (err) {}
    }
  };


  const selectedSignature = form.signatures.find(s => s.id === selectedSignatureId);

  const addSignature = () => {
    const signature = { id: crypto.randomUUID(), name: `Signature ${form.signatures.length + 1}`, html: '' };
    setForm(current => ({
      ...current,
      signatures: [...current.signatures, signature],
      defaultSignatureId: current.defaultSignatureId || signature.id
    }));
    setSelectedSignatureId(signature.id);
  };

  const updateSignature = (name: string, value: string) => {
    setForm(current => ({
      ...current,
      signatures: current.signatures.map(sig => sig.id === selectedSignatureId ? { ...sig, [name]: value } : sig)
    }));
  };

  const deleteSignature = () => {
    if (!selectedSignature) return;
    setForm(current => {
      const signatures = current.signatures.filter(sig => sig.id !== selectedSignatureId);
      return {
        ...current,
        signatures,
        defaultSignatureId: current.defaultSignatureId === selectedSignatureId ? signatures[0]?.id || '' : current.defaultSignatureId,
        signatureEnabled: signatures.length ? current.signatureEnabled : false
      };
    });
    const remaining = form.signatures.filter(sig => sig.id !== selectedSignatureId);
    setSelectedSignatureId(remaining[0]?.id || '');
  };

  async function run(work: () => Promise<any>) {
    setBusy(true);
    setStatus('');
    try {
      await work();
    } catch (error: any) {
      setStatus(error.response?.data?.error?.message || error.message);
    } finally {
      setBusy(false);
    }
  }

  const payload = () => {
    const { configured: _, ...clean } = form as any;
    return clean;
  };

  const test = () =>
    run(async () => {
      await api.post('/settings/test', payload());
      setStatus('Connection successful — IMAP and SMTP are fully operational.');
    });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    localStorage.setItem('customwebmail_app_token', token.trim());
    await run(() => onSave(payload()));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[800px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-slate-900">
        <header className="px-8 py-6 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Workspace Settings</span>
            <h2 className="text-2xl font-extrabold text-white tracking-tight mt-0.5">Configuration & Preferences</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all shadow-xs"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <nav className="w-72 bg-slate-50 border-r border-slate-200 p-4 space-y-1.5 overflow-y-auto">
            {tabs.map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all ${
                  active === id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'text-slate-800 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <form onSubmit={save} className="flex-1 flex flex-col overflow-y-auto p-8 bg-white text-slate-900">
            <div className="flex-1 space-y-6">
              {active === 'addAccount' && !selectedProvider && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Choose your email provider</h3>
                    <p className="text-xs text-slate-600 mt-1">Select a provider, then enter your account details and custom server settings.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { name: 'Rackspace', desc: 'SMTP + IMAP', badge: 'Popular' },
                      { name: 'Bell / Sympatico', desc: 'SMTP + IMAP' },
                      { name: 'ZeptoMail', desc: 'SMTP sending' },
                      { name: 'Virgin Media', desc: 'Email app password' },
                      { name: 'Terra.com.br', desc: 'Your server settings' },
                      { name: 'Custom webmail', desc: 'Manual SMTP + IMAP', badge: 'Custom' },
                      { name: 'Google / Gmail', desc: 'Browser sign-in' },
                      { name: 'Microsoft', desc: 'Browser sign-in' },
                      { name: 'AgentMail', desc: 'API key + inbox ID' }
                    ].map(p => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          setSelectedProvider(p.name);
                          if (p.name === 'Rackspace') {
                            update('imapHost', 'secure.emailsrvr.com');
                            update('smtpHost', 'secure.emailsrvr.com');
                          } else if (p.name === 'Google / Gmail') {
                            update('imapHost', 'imap.gmail.com');
                            update('smtpHost', 'smtp.gmail.com');
                            update('imapPort', 993);
                            update('smtpPort', 465);
                          } else if (p.name === 'Bell / Sympatico') {
                            update('imapHost', 'imap.bell.net');
                            update('smtpHost', 'smtp.bell.net');
                          } else if (p.name === 'Virgin Media') {
                            update('imapHost', 'imap.virginmedia.com');
                            update('smtpHost', 'smtp.virginmedia.com');
                          } else if (p.name === 'Terra.com.br') {
                            update('imapHost', 'imap.terra.com.br');
                            update('smtpHost', 'smtp.terra.com.br');
                          } else if (p.name === 'ZeptoMail') {
                            update('smtpHost', 'smtp.zeptomail.com');
                          }
                        }}
                        className="p-5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-500 hover:shadow-lg transition-all text-left flex flex-col justify-between group cursor-pointer relative"
                      >
                        {p.badge && (
                          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[10px] font-bold">
                            {p.badge}
                          </span>
                        )}
                        <div>
                          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center mb-3 shadow-sm group-hover:bg-blue-600 transition-colors">
                            {p.name[0]}
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{p.name}</h4>
                          <p className="text-xs text-slate-600 mt-1">{p.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {active === 'addAccount' && selectedProvider && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Configure {selectedProvider} Account</h3>
                      <p className="text-xs text-slate-600 mt-0.5">Enter your email address, password, and custom SMTP/IMAP server settings.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedProvider(null)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                    >
                      ← Back to Providers
                    </button>
                  </div>

                  {selectedProvider === 'Google / Gmail' && (
                    <div className="p-6 rounded-2xl bg-blue-50 border border-blue-200 space-y-4">
                      <h4 className="text-sm font-bold text-blue-900">Google OAuth & Custom Client Credentials</h4>
                      <p className="text-xs text-blue-700">Configure your Google Cloud project OAuth credentials (Desktop App / Web App) for Gmail, Calendar, and Contacts integration.</p>
                      <FormField label="Google OAuth Client ID">
                        <input
                          value={form.googleClientId || ''}
                          onChange={e => update('googleClientId', e.target.value)}
                          placeholder="e.g. 123456-abc.apps.googleusercontent.com"
                          className="w-full px-4 py-3 rounded-xl border border-blue-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                        />
                      </FormField>
                      <FormField label="Google OAuth Client Secret">
                        <input
                          type="password"
                          value={form.googleClientSecret || ''}
                          onChange={e => update('googleClientSecret', e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-3 rounded-xl border border-blue-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                        />
                      </FormField>
                      <button
                        type="button"
                        onClick={() => handleOAuthLogin('google')}
                        className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-md cursor-pointer transition-all"
                      >
                        <span>Sign in with Google / Re-authorize</span>
                      </button>
                    </div>
                  )}

                  {selectedProvider === 'Microsoft' && (
                    <div className="p-6 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-4">
                      <h4 className="text-sm font-bold text-indigo-900">Microsoft OAuth Credentials</h4>
                      <p className="text-xs text-indigo-700">Enter your Azure AD / Microsoft Entra ID client credentials for Outlook, Hotmail, and Office 365.</p>
                      <FormField label="Microsoft OAuth Client ID">
                        <input
                          value={form.microsoftClientId || ''}
                          onChange={e => update('microsoftClientId', e.target.value)}
                          placeholder="e.g. 8d4b3c2a-..."
                          className="w-full px-4 py-3 rounded-xl border border-indigo-300 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                        />
                      </FormField>
                      <FormField label="Microsoft OAuth Client Secret">
                        <input
                          type="password"
                          value={form.microsoftClientSecret || ''}
                          onChange={e => update('microsoftClientSecret', e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-3 rounded-xl border border-indigo-300 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                        />
                      </FormField>
                      <button
                        type="button"
                        onClick={() => handleOAuthLogin('microsoft')}
                        className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-md cursor-pointer transition-all"
                      >
                        <span>Sign in with Microsoft / Re-authorize</span>
                      </button>
                    </div>
                  )}

                  <FormField label="Email Address" hint="Automatically detects IMAP/SMTP server settings based on your domain.">
                    <input
                      type="email"
                      required
                      value={form.email || ''}
                      onChange={e => autoDiscoverHost(e.target.value)}
                      placeholder="name@domain.com"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                    />
                  </FormField>

                  <FormField label="Sender Display Name">
                    <input
                      value={form.senderName || ''}
                      onChange={e => update('senderName', e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                    />
                  </FormField>

                  <FormField label="Password / App Password" hint="Encrypted and stored securely for mail operations.">
                    <input
                      type="password"
                      value={form.password || ''}
                      onChange={e => update('password', e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                    />
                  </FormField>

                  <div className="space-y-6 pt-4 border-t border-slate-200">
                    <h4 className="text-sm font-bold text-slate-900">Incoming Mail Server (IMAP)</h4>
                    <ServerFields prefix="imap" form={form} update={update} />
                  </div>

                  <div className="space-y-6 pt-4 border-t border-slate-200">
                    <h4 className="text-sm font-bold text-slate-900">Outgoing Mail Server (SMTP)</h4>
                    <ServerFields prefix="smtp" form={form} update={update} />
                  </div>
                </div>
              )}

              {active === 'general' && (
                <Section title="General Settings" description="Configure display language, regional timezone, and message display density.">
                  <FormField label="Display Language">
                    <select
                      value={form.language || 'en-US'}
                      onChange={e => update('language', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium shadow-2xs"
                    >
                      <option value="en-US">English (United States)</option>
                      <option value="es">Español (Spanish)</option>
                      <option value="fr">Français (French)</option>
                      <option value="de">Deutsch (German)</option>
                      <option value="ja">日本語 (Japanese)</option>
                      <option value="zh-CN">简体中文 (Chinese)</option>
                    </select>
                  </FormField>
                  <FormField label="Timezone">
                    <select
                      value={form.timezone || 'UTC'}
                      onChange={e => update('timezone', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium shadow-2xs"
                    >
                      <option value="UTC">UTC (Coordinated Universal Time)</option>
                      <option value="America/New_York">Eastern Time (US & Canada)</option>
                      <option value="America/Chicago">Central Time (US & Canada)</option>
                      <option value="America/Denver">Mountain Time (US & Canada)</option>
                      <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                      <option value="Europe/London">London (GMT/BST)</option>
                      <option value="Europe/Paris">Paris (Central European Time)</option>
                      <option value="Asia/Tokyo">Tokyo (Japan Standard Time)</option>
                      <option value="Australia/Sydney">Sydney (Australian Eastern Time)</option>
                    </select>
                  </FormField>
                  <FormField label="Message Density" hint="Adjust how much vertical space each message takes in the message list.">
                    <select
                      value={preferences.density || 'standard'}
                      onChange={e => onPreferences({ ...preferences, density: e.target.value as any })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium shadow-2xs"
                    >
                      <option value="micro">Micro - Minimal spacing, maximum messages visible</option>
                      <option value="compact">Compact - Reduced spacing</option>
                      <option value="standard">Standard - Default comfortable spacing</option>
                      <option value="large">Large - Generous spacing, easier to read</option>
                    </select>
                  </FormField>
                </Section>
              )}

              {active === 'account' && (
                <Section title="Sender Identity & Credentials" description="Configure your primary email address, sender display name, and mailbox authentication method (Password vs Google/Microsoft OAuth).">
                  <FormField label="Sender Display Name">
                    <input
                      value={form.senderName || ''}
                      onChange={e => update('senderName', e.target.value)}
                      placeholder="e.g. Eleanor Vance"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                    />
                  </FormField>
                  <FormField label="Email Address" hint="Automatically detects IMAP/SMTP server settings based on your domain.">
                    <input
                      type="email"
                      required
                      value={form.email || ''}
                      onChange={e => autoDiscoverHost(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                    />
                  </FormField>

                  <FormField label="Authentication Method">
                    <select
                      value={form.authType || 'password'}
                      onChange={e => update('authType', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                    >
                      <option value="password">Standard Password / App Password</option>
                      <option value="google_oauth">Google OAuth (Gmail / Workspace)</option>
                      <option value="microsoft_oauth">Microsoft OAuth (Outlook / 365)</option>
                    </select>
                  </FormField>

                  {form.authType === 'google_oauth' && (
                    <div className="p-5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-4">
                      <h4 className="text-sm font-bold text-blue-900">Google OAuth Credentials & Authentication</h4>
                      <FormField label="Google OAuth Client ID">
                        <input
                          value={form.googleClientId || ''}
                          onChange={e => update('googleClientId', e.target.value)}
                          placeholder="e.g. 123456-abc.apps.googleusercontent.com"
                          className="w-full px-4 py-3 rounded-xl border border-blue-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                        />
                      </FormField>
                      <FormField label="Google OAuth Client Secret">
                        <input
                          type="password"
                          value={form.googleClientSecret || ''}
                          onChange={e => update('googleClientSecret', e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-3 rounded-xl border border-blue-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                        />
                      </FormField>
                      <button
                        type="button"
                        onClick={() => handleOAuthLogin('google')}
                        className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-md cursor-pointer transition-all"
                      >
                        <span>Sign in with Google / Re-authorize Account</span>
                      </button>
                    </div>
                  )}

                  {form.authType === 'microsoft_oauth' && (
                    <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-4">
                      <h4 className="text-sm font-bold text-indigo-900">Microsoft OAuth Credentials & Authentication</h4>
                      <FormField label="Microsoft OAuth Client ID">
                        <input
                          value={form.microsoftClientId || ''}
                          onChange={e => update('microsoftClientId', e.target.value)}
                          placeholder="e.g. 8d4b3c2a-..."
                          className="w-full px-4 py-3 rounded-xl border border-indigo-300 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                        />
                      </FormField>
                      <FormField label="Microsoft OAuth Client Secret">
                        <input
                          type="password"
                          value={form.microsoftClientSecret || ''}
                          onChange={e => update('microsoftClientSecret', e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-3 rounded-xl border border-indigo-300 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                        />
                      </FormField>
                      <button
                        type="button"
                        onClick={() => handleOAuthLogin('microsoft')}
                        className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-md cursor-pointer transition-all"
                      >
                        <span>Sign in with Microsoft / Re-authorize Account</span>
                      </button>
                    </div>
                  )}

                  {(!form.authType || form.authType === 'password') && (
                    <FormField
                      label="Mailbox Password"
                      hint={settings.configured ? 'Leave blank to keep the encrypted password currently stored.' : 'Required for secure IMAP/SMTP login.'}
                    >
                      <input
                        type="password"
                        required={!settings.configured}
                        value={form.password || ''}
                        onChange={e => update('password', e.target.value)}
                        placeholder={settings.configured ? '•••••••• (unchanged)' : 'Enter password'}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                      />
                    </FormField>
                  )}
                </Section>
              )}

              {active === 'composing' && (
                <Section title="Composing Email" description="Set default font family, body format, message priority levels, and delivery receipt options for outgoing mail.">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Default Font Family">
                      <select
                        value={form.defaultFont || 'Inter'}
                        onChange={e => update('defaultFont', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                      >
                        <option value="Inter">Inter (Sans-Serif)</option>
                        <option value="Arial">Arial</option>
                        <option value="Georgia">Georgia (Serif)</option>
                        <option value="Courier New">Courier New (Monospace)</option>
                        <option value="Verdana">Verdana</option>
                        <option value="Times New Roman">Times New Roman</option>
                      </select>
                    </FormField>
                    <FormField label="Default Body Format">
                      <select
                        value={form.defaultBodyFormat || 'html'}
                        onChange={e => update('defaultBodyFormat', e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                      >
                        <option value="html">Rich HTML Editor</option>
                        <option value="plain">Plain Text</option>
                      </select>
                    </FormField>
                  </div>

                  <FormField label="Default Priority">
                    <select
                      value={form.defaultPriority}
                      onChange={e => update('defaultPriority', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                    >
                      <option value="1">Highest Priority</option>
                      <option value="2">High Priority</option>
                      <option value="3">Normal Priority</option>
                      <option value="4">Low Priority</option>
                      <option value="5">Lowest Priority</option>
                    </select>
                  </FormField>
                  <Toggle
                    label="Request Read Receipts by Default"
                    description="You can toggle read receipts on or off in any individual compose window."
                    checked={form.defaultReadReceipt}
                    onChange={val => update('defaultReadReceipt', val)}
                  />
                </Section>
              )}

              {active === 'forward' && (
                <Section title="Incoming Email & Forwarding" description="Automatically forward incoming email to a maximum of 4 other addresses.">
                  <Toggle
                    label="Automatic Forwarding Status"
                    description="Turn automatic email forwarding On or Off."
                    checked={form.forwardEnabled}
                    onChange={val => update('forwardEnabled', val)}
                  />
                  <Toggle
                    label="Save a copy of forwarded email"
                    description="Keep a copy of forwarded messages in your Inbox."
                    checked={form.forwardSaveCopy}
                    onChange={val => update('forwardSaveCopy', val)}
                  />
                  <div className="space-y-3 pt-4 border-t border-slate-200">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800 block">Forward To (Maximum 4 Addresses)</span>
                    {[0, 1, 2, 3].map(idx => (
                      <div key={idx} className="flex items-center space-x-2">
                        <input
                          type="email"
                          value={form.forwardEmails?.[idx] || ''}
                          onChange={e => {
                            const list = [...(form.forwardEmails || ['', '', '', ''])];
                            list[idx] = e.target.value;
                            update('forwardEmails', list);
                          }}
                          placeholder={`Recipient email address ${idx + 1}`}
                          className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                        />
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {active === 'signatures' && (
                <Section title="Email Signatures" description="Create and manage professional HTML signatures for outbound messages.">
                  <div className="flex items-center space-x-3 mb-4">
                    <button
                      type="button"
                      onClick={addSignature}
                      className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all"
                    >
                      <Plus size={16} />
                      <span>New Signature</span>
                    </button>
                    {selectedSignature && (
                      <button
                        type="button"
                        onClick={deleteSignature}
                        className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors border border-red-200"
                      >
                        <Trash2 size={16} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>

                  {form.signatures.length > 0 ? (
                    <div className="grid grid-cols-3 gap-6">
                      <div className="col-span-1 border border-slate-200 rounded-2xl p-2.5 space-y-1.5 bg-slate-50">
                        {form.signatures.map(sig => (
                          <button
                            type="button"
                            key={sig.id}
                            onClick={() => setSelectedSignatureId(sig.id)}
                            className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                              selectedSignatureId === sig.id
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-800 hover:bg-slate-200/70'
                            }`}
                          >
                            <span className="truncate">{sig.name}</span>
                            {form.defaultSignatureId === sig.id && <small className="opacity-90">Default</small>}
                          </button>
                        ))}
                      </div>

                      {selectedSignature && (
                        <div className="col-span-2 space-y-4">
                          <FormField label="Signature Name">
                            <input
                              maxLength={80}
                              value={selectedSignature.name}
                              onChange={e => updateSignature('name', e.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                          </FormField>
                          <FormField label="HTML Content" hint="HTML formatting supported. Unsafe scripts are sanitized automatically.">
                            <textarea
                              rows={5}
                              value={selectedSignature.html}
                              onChange={e => updateSignature('html', e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-xs"
                            />
                          </FormField>
                          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                            <span className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">Live Preview</span>
                            <div className="text-sm text-slate-900" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedSignature.html) }} />
                          </div>
                          <button
                            type="button"
                            onClick={() => update('defaultSignatureId', selectedSignature.id)}
                            className="text-xs font-bold text-blue-600 hover:underline"
                          >
                            ★ Set as default signature
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl text-slate-500">
                      <FileSignature size={38} className="mx-auto mb-2 text-slate-400" />
                      <p className="text-sm font-semibold">No signatures created yet</p>
                    </div>
                  )}

                  <div className="space-y-4 pt-4 border-t border-slate-200 mt-6">
                    <Toggle
                      label="Insert Signature in New Messages"
                      checked={form.signatureEnabled}
                      onChange={val => update('signatureEnabled', val)}
                    />
                    <Toggle
                      label="Insert Signature in Replies"
                      checked={form.signatureOnReply}
                      onChange={val => update('signatureOnReply', val)}
                    />
                    <Toggle
                      label="Insert Signature in Forwards"
                      checked={form.signatureOnForward}
                      onChange={val => update('signatureOnForward', val)}
                    />
                  </div>
                </Section>
              )}

              {active === 'servers' && (
                <div className="space-y-6">
                  <Section title="Incoming Mail Server (IMAP)" description="Configure incoming IMAP server hostname, port, and security protocols.">
                    <ServerFields prefix="imap" form={form} update={update} />
                  </Section>
                  <Section title="Outgoing Mail Server (SMTP)" description="Configure outgoing SMTP server hostname, port, and authentication.">
                    <ServerFields prefix="smtp" form={form} update={update} />
                  </Section>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={test}
                    className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-md transition-all"
                  >
                    <CheckCircle2 size={16} />
                    <span>Test IMAP & SMTP Connections</span>
                  </button>
                </div>
              )}

              {active === 'rackspace' && (
                <Section title="Rackspace Router Integration" description="Backend session router and proxy integration details.">
                  <div className="space-y-3">
                    <StatusRow label="Integration Status" value={rackspace?.configured ? 'Configured & Active' : 'Not Configured'} good={rackspace?.configured} />
                    <StatusRow label="Session Extension" value={rackspace?.sessionExtension?.active ? 'Active' : 'Inactive'} good={rackspace?.sessionExtension?.active} />
                    <StatusRow label="Router Base URL" value={rackspace?.routerBaseUrl || 'Not available'} />
                  </div>
                </Section>
              )}

              {active === 'appearance' && (
                <Section title="Appearance & Display Preferences" description="Customize message density and reading pane layout.">
                  <div className="space-y-6">
                    <Choice
                      label="Message List Density"
                      value={preferences.density}
                      options={[['comfortable', 'Comfortable Spacing'], ['compact', 'Compact View']]}
                      onChange={val => onPreferences({ ...preferences, density: val })}
                    />
                    <Toggle
                      label="Reading Preview Pane"
                      description="Display message content in a side pane when clicked."
                      checked={preferences.previewPane}
                      onChange={val => onPreferences({ ...preferences, previewPane: val })}
                    />
                  </div>
                </Section>
              )}

              {active === 'extensions' && (
                <Section title="Calendar & Contacts Extensions" description="Enable Google and Microsoft Workspace extensions for calendar scheduling and contact auto-complete sync.">
                  <div className="space-y-6">
                    <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4 shadow-2xs">
                      <Toggle
                        label="Enable Google Calendar Extension"
                        description="Synchronize meetings and events from Google Calendar."
                        checked={form.calendarExtensionEnabled}
                        onChange={val => update('calendarExtensionEnabled', val)}
                      />
                      {form.calendarExtensionEnabled && (
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                          <FormField label="Google OAuth Client ID (Calendar)" hint="Custom Google OAuth Client ID for Calendar API access">
                            <input
                              value={form.calendarClientId || ''}
                              onChange={e => update('calendarClientId', e.target.value)}
                              placeholder="e.g. 123456-abc.apps.googleusercontent.com"
                              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                            />
                          </FormField>
                          <FormField label="Google OAuth Client Secret (Calendar)">
                            <input
                              type="password"
                              value={form.calendarClientSecret || ''}
                              onChange={e => update('calendarClientSecret', e.target.value)}
                              placeholder="••••••••"
                              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                            />
                          </FormField>
                        </div>
                      )}
                    </div>

                    <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4 shadow-2xs">
                      <Toggle
                        label="Enable Contacts Extension (Google People API / Microsoft Graph)"
                        description="Sync address book contacts for autocomplete during email composition."
                        checked={form.contactsExtensionEnabled}
                        onChange={val => update('contactsExtensionEnabled', val)}
                      />
                      {form.contactsExtensionEnabled && (
                        <div className="space-y-4 pt-4 border-t border-slate-100">
                          <FormField label="OAuth Client ID (Contacts)" hint="Client ID for Google People API / Microsoft Graph contacts sync">
                            <input
                              value={form.contactsClientId || ''}
                              onChange={e => update('contactsClientId', e.target.value)}
                              placeholder="e.g. client-id.apps.googleusercontent.com"
                              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                            />
                          </FormField>
                          <FormField label="OAuth Client Secret (Contacts)">
                            <input
                              type="password"
                              value={form.contactsClientSecret || ''}
                              onChange={e => update('contactsClientSecret', e.target.value)}
                              placeholder="••••••••"
                              className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                            />
                          </FormField>
                        </div>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {active === 'sync' && (
                <Section title="Sync Options & Push Email" description="Configure automatic background polling, IMAP IDLE push connections, and manual sync hotkeys.">
                  <FormField label="Automatic Sync Interval" description="Periodically checks for new mail in background.">
                    <select
                      value={form.syncInterval || '5m'}
                      onChange={e => update('syncInterval', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                    >
                      <option value="off">Manual Only (Off)</option>
                      <option value="1m">Every 1 Minute</option>
                      <option value="5m">Every 5 Minutes</option>
                      <option value="15m">Every 15 Minutes</option>
                      <option value="30m">Every 30 Minutes</option>
                    </select>
                  </FormField>

                  <Toggle
                    label="IMAP IDLE Push Email"
                    description="Holds IDLE connections for real-time push email notifications when new mail arrives."
                    checked={form.pushEmailIdle !== false}
                    onChange={val => update('pushEmailIdle', val)}
                  />

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2 mt-4">
                    <p className="font-bold text-slate-900">Sync Commands & Keyboard Shortcuts:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong className="text-slate-900">Ctrl + Shift + S</strong>: Manual Sync / Force Re-sync active folder (re-downloads messages from server).</li>
                      <li><strong className="text-slate-900">Ctrl + Shift + A</strong>: Sync All Accounts and folders at once.</li>
                    </ul>
                  </div>
                </Section>
              )}

              {active === 'help' && (
                <Section title="Troubleshooting & Pre-Configured Providers" description="Resolving common IMAP/SMTP connection errors and pre-configured server guides.">
                  <div className="space-y-4 text-xs text-slate-700">
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2">
                      <h4 className="font-bold text-red-900 text-sm">"Connection Refused" Error</h4>
                      <p>• Verify the server hostname is correct.</p>
                      <p>• Check if the port is correct (993 for IMAP SSL, 465 or 587 for SMTP).</p>
                      <p>• Ensure your firewall allows outbound connections on these ports.</p>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                      <h4 className="font-bold text-amber-900 text-sm">"Authentication Failed" Error</h4>
                      <p>• Confirm your username (usually your full email address).</p>
                      <p>• Ensure you are using an app password if 2FA is enabled.</p>
                      <p>• Check if your provider requires enabling IMAP access in settings.</p>
                    </div>

                    <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                      <h4 className="font-bold text-blue-900 text-sm">"Certificate Error"</h4>
                      <p>• Ensure the security setting matches your server (SSL/TLS).</p>
                      <p>• For self-signed certificates, you may need to add an exception or disable strict verification.</p>
                    </div>
                  </div>
                </Section>
              )}

              {active === 'security' && (
                <Section title="Security & Token Protection" description="Manage access tokens and TLS verification standards.">
                  <FormField label="Application Access Token" hint="Saved securely in browser local storage and transmitted via x-app-token header.">
                    <input
                      type="password"
                      value={token}
                      onChange={e => setToken(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
                    />
                  </FormField>
                  <Toggle
                    label="Verify TLS Certificates"
                    description="Recommended for secure production email server connections."
                    checked={form.rejectUnauthorized}
                    onChange={val => update('rejectUnauthorized', val)}
                  />
                  <div className="pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await api.post('/auth/logout');
                        } catch {}
                        localStorage.removeItem('customwebmail_app_token');
                        window.location.reload();
                      }}
                      className="flex items-center space-x-2 px-5 py-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors border border-red-200 shadow-xs cursor-pointer"
                    >
                      <LogOut size={16} />
                      <span>Log Out & Clear Session</span>
                    </button>
                  </div>
                </Section>
              )}

              {status && (
                <div className={`p-4 rounded-xl text-sm font-semibold ${
                  status.startsWith('Connection successful')
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  {status}
                </div>
              )}
            </div>

            <footer className="pt-6 border-t border-slate-200 flex items-center justify-end space-x-3 mt-8">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/25 transition-all"
              >
                {busy ? 'Saving changes…' : 'Save Changes'}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }: any) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-600 mt-0.5">{description}</p>
      </div>
      <div className="space-y-4 pt-1">{children}</div>
    </div>
  );
}

function FormField({ label, hint, children }: any) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-800">{label}</span>
      {children}
      {hint && <small className="block text-[11px] text-slate-600">{hint}</small>}
    </label>
  );
}

function ServerFields({ prefix, form, update }: any) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2">
        <FormField label="Server Host">
          <input
            required
            value={form[`${prefix}Host`]}
            onChange={e => update(`${prefix}Host`, e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
          />
        </FormField>
      </div>
      <div>
        <FormField label="Port">
          <input
            required
            type="number"
            min="1"
            max="65535"
            value={form[`${prefix}Port`]}
            onChange={e => update(`${prefix}Port`, Number(e.target.value))}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
          />
        </FormField>
      </div>
      <div className="col-span-3 pt-1">
        <Toggle
          label="Secure TLS Connection"
          checked={form[`${prefix}Secure`]}
          onChange={val => update(`${prefix}Secure`, val)}
        />
      </div>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: any) {
  return (
    <label className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/80 transition-colors">
      <div>
        <strong className="block text-sm font-bold text-slate-900">{label}</strong>
        {description && <span className="text-xs text-slate-700 mt-0.5 block">{description}</span>}
      </div>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={e => onChange(e.target.checked)}
        className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
      />
    </label>
  );
}

function Choice({ label, value, options, onChange }: any) {
  return (
    <div className="space-y-2.5">
      <strong className="text-xs font-bold uppercase tracking-wider text-slate-800 block">{label}</strong>
      <div className="grid grid-cols-2 gap-3">
        {options.map(([id, text]: any) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`py-3 px-4 rounded-xl text-xs font-bold border transition-all text-center ${
              value === id
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
                : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusRow({ label, value, good }: any) {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900">
      <span className="text-slate-700">{label}</span>
      <span className={good ? 'text-emerald-700 font-extrabold' : 'text-slate-800'}>{value}</span>
    </div>
  );
}
