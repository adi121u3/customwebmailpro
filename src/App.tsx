import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Navigation from './components/Navigation';
import Sidebar from './components/Sidebar';
import MailToolbar from './components/MailToolbar';
import MessageList from './components/MessageList';
import MessagePreview from './components/MessagePreview';
import ComposeModal from './components/ComposeModal';
import SettingsModal from './components/SettingsModal';
import api from './api';
import { Folder, Message, Preferences, Settings } from './types';

export default function App() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>('INBOX');
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState<string>('');
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [composeWindows, setComposeWindows] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' | 'success' } | null>(null);

  useEffect(() => {
    const handleToast = (e: any) => {
      setToast(e.detail);
      setTimeout(() => setToast(null), 6000);
    };
    window.addEventListener('app-toast', handleToast);
    return () => window.removeEventListener('app-toast', handleToast);
  }, []);

  const [mailFilter, setMailFilter] = useState<'all' | 'unread' | 'flagged' | 'attachments'>('all');
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try {
      const saved = localStorage.getItem('irumol_mail_prefs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { density: 'comfortable', previewPane: true, mailboxSource: 'imap', theme: 'slate' };
  });

  const [settings, setSettings] = useState<Settings>({
    email: '',
    senderName: '',
    imapHost: 'secure.emailsrvr.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'secure.emailsrvr.com',
    smtpPort: 465,
    smtpSecure: true,
    rejectUnauthorized: true,
    signatures: [],
    defaultSignatureId: '',
    signatureEnabled: false,
    signatureOnReply: false,
    signatureOnForward: false,
    signaturePlacement: 'above',
    defaultPriority: '3',
    defaultReadReceipt: false,
    configured: false
  });

  useEffect(() => {
    try {
      localStorage.setItem('irumol_mail_prefs', JSON.stringify(preferences));
    } catch {}
  }, [preferences]);

  // Fetch settings on mount
  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      if (res.data) {
        setSettings(res.data);
      }
    } catch {}
  };

  // Fetch folders from backend
  const fetchFolders = async () => {
    try {
      const res = await api.get('/folders');
      if (res.data?.folders) {
        const parsedFolders = res.data.folders.map((f: any) => ({
          ...f,
          unreadCount: Number(f.unreadCount || f.unseen || 0),
          messageCount: Number(f.messageCount || f.messages || 0)
        }));
        setFolders(parsedFolders);
        if (parsedFolders.length > 0 && !parsedFolders.some((f: any) => f.path === activeFolder)) {
          setActiveFolder(parsedFolders[0].path);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to fetch folders from backend.');
    }
  };

  // Fetch messages for active folder from backend
  const fetchMessages = async (folderPath: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/messages?folder=${encodeURIComponent(folderPath)}&page=1&limit=100`);
      if (res.data?.messages) {
        setMessages(res.data.messages);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to fetch messages from backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchFolders();
  }, []);

  useEffect(() => {
    if (activeFolder) {
      fetchMessages(activeFolder);
    }
  }, [activeFolder]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        fetchMessages(activeFolder);
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: `Force re-syncing folder: ${activeFolder}`, type: 'success' } }));
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        fetchFolders();
        fetchMessages(activeFolder);
        window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'Syncing all accounts and mailboxes...', type: 'success' } }));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size > 0) {
          e.preventDefault();
          handleBatchAction('delete');
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (selectedMessage) {
          e.preventDefault();
          const sender = typeof selectedMessage.from === 'string'
            ? selectedMessage.from
            : selectedMessage.from?.[0]?.address || '';
          openCompose({
            to: sender,
            subject: `Re: ${selectedMessage.subject || ''}`,
            body: `<br><br>--- Original Message ---<br>${selectedMessage.html || selectedMessage.text || ''}`
          });
        }
      } else if (e.key === 'a' || e.key === 'A') {
        if (selectedIds.size > 0) {
          e.preventDefault();
          handleBatchAction('move', 'Archive');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, selectedMessage, activeFolder]);

  useEffect(() => {
    const intervalVal = settings.syncInterval;
    if (!intervalVal || intervalVal === 'off') return;
    let ms = 300_000;
    if (intervalVal === '1m') ms = 60_000;
    else if (intervalVal === '5m') ms = 300_000;
    else if (intervalVal === '15m') ms = 900_000;
    else if (intervalVal === '30m') ms = 1_800_000;

    const timer = setInterval(() => {
      fetchFolders();
      if (activeFolder) fetchMessages(activeFolder);
    }, ms);
    return () => clearInterval(timer);
  }, [settings.syncInterval, activeFolder]);

  const currentFolderObj = folders.find(f => f.path === activeFolder);
  const isTrash = currentFolderObj?.specialUse === '\\Trash' || /trash|bin/i.test(activeFolder);

  const handleEmptyTrash = async () => {
    if (!messages.length) return;
    if (!window.confirm(`Permanently delete all messages in ${activeFolder}?`)) return;
    const uids = messages.map(m => Number(m.uid || m.id.split(':').pop())).filter(Boolean);
    if (!uids.length) return;
    setBusy(true);
    try {
      await api.post('/messages/bulk', { folder: activeFolder, action: 'delete', uids });
      setMessages([]);
      setSelectedMessage(null);
      setSelectedIds(new Set());
      fetchFolders();
    } catch (err: any) {
      setError(err.message || 'Failed to empty trash.');
    } finally {
      setBusy(false);
    }
  };

  const filteredMessages = messages.filter(m => {
    if (mailFilter === 'unread' && m.read) return false;
    if (mailFilter === 'flagged' && !m.flagged) return false;
    if (mailFilter === 'attachments' && (!m.attachments || m.attachments.length === 0)) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const sub = (m.subject || '').toLowerCase();
    const from = typeof m.from === 'string' ? m.from.toLowerCase() : JSON.stringify(m.from).toLowerCase();
    const text = (m.text || m.body || '').toLowerCase();
    return sub.includes(q) || from.includes(q) || text.includes(q);
  });

  const handleFolderChange = (path: string) => {
    setActiveFolder(path);
    setSelectedMessage(null);
    setSelectedIds(new Set());
  };

  const handleMessageClick = async (message: Message) => {
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, read: true } : m));
    setSelectedMessage(message);

    if (!message.html && !message.text) {
      try {
        const uid = message.uid || message.id.split(':').pop();
        const res = await api.get(`/messages/${uid}?folder=${encodeURIComponent(activeFolder)}`);
        if (res.data) {
          const full = { ...message, ...res.data };
          setSelectedMessage(full);
          setMessages(prev => prev.map(m => m.id === message.id ? full : m));
        }
      } catch {}
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (filteredMessages.every(m => selectedIds.has(m.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMessages.map(m => m.id)));
    }
  };

  const handleFlag = async (message: Message) => {
    const nextFlag = !message.flagged;
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, flagged: nextFlag } : m));
    if (selectedMessage?.id === message.id) {
      setSelectedMessage(curr => curr ? { ...curr, flagged: nextFlag } : null);
    }
    try {
      const uid = message.uid || message.id.split(':').pop();
      await api.post('/messages/bulk', {
        folder: activeFolder,
        action: nextFlag ? 'flag' : 'unflag',
        uids: [uid]
      });
    } catch {}
  };

  const openCompose = (initialData: any = {}) => {
    const id = crypto.randomUUID();
    const signatureHtml = settings.signatures.length > 0
      ? settings.signatures.find(s => s.id === settings.defaultSignatureId)?.html || settings.signatures[0]?.html || ''
      : '';

    const isReply = Boolean(initialData.subject && initialData.subject.startsWith('Re:'));
    const isForward = Boolean(initialData.subject && initialData.subject.startsWith('Fwd:'));
    const shouldAddSig = signatureHtml && (
      settings.signatureEnabled !== false &&
      (!isReply || settings.signatureOnReply !== false) &&
      (!isForward || settings.signatureOnForward !== false)
    );

    let initialBody = initialData.body || '';
    if (shouldAddSig && !initialBody.includes(signatureHtml)) {
      if (settings.signaturePlacement === 'above') {
        initialBody = `<div data-webmail-signature="true">${signatureHtml}</div><br>${initialBody}`;
      } else {
        initialBody = `${initialBody}<br><br><div data-webmail-signature="true">${signatureHtml}</div>`;
      }
    }

    const newWin = {
      windowId: id,
      zIndex: 100 + composeWindows.length,
      initialPosition: { left: 140 + composeWindows.length * 40, top: 120 + composeWindows.length * 40 },
      initialData: {
        from: settings.email,
        identityDisplayName: settings.senderName,
        accountDefaultDisplayName: settings.senderName,
        priority: settings.defaultPriority,
        read_receipt: settings.defaultReadReceipt,
        signatureHtml,
        ...initialData,
        body: initialBody
      }
    };
    setComposeWindows(prev => [...prev, newWin]);
  };

  const closeCompose = (windowId: string) => {
    setComposeWindows(prev => prev.filter(w => w.windowId !== windowId));
  };

  const activateCompose = (windowId: string) => {
    setComposeWindows(prev => prev.map(w => w.windowId === windowId ? { ...w, zIndex: 999 } : w));
  };

  const handleSend = async (windowId: string, form: any) => {
    if (form.operation === 'resend' && form.providerContext?.rackspace) {
      const { originalFolder, originalUid, compose } = form.providerContext.rackspace;
      await api.post('/rackspace/compose/send', {
        compose: {
          ...compose,
          to: form.to,
          cc: form.cc,
          bcc: form.bcc,
          subject: form.subject,
          body: form.body,
          attachments: form.attachments || []
        },
        originalFolder,
        originalUid
      });
    } else {
      const payload = {
        to: typeof form.to === 'string' ? form.to.split(',').map((s: string) => s.trim()).filter(Boolean) : form.to,
        cc: typeof form.cc === 'string' ? form.cc.split(',').map((s: string) => s.trim()).filter(Boolean) : (form.cc || []),
        bcc: typeof form.bcc === 'string' ? form.bcc.split(',').map((s: string) => s.trim()).filter(Boolean) : (form.bcc || []),
        subject: form.subject || '',
        html: form.body || '',
        text: form.body ? form.body.replace(/<[^>]*>?/gm, '') : '',
        fromName: form.fromName || form.senderDisplayName || settings.senderName,
        attachments: form.attachments || [],
        priority: form.priority || '3',
        read_receipt: !!form.read_receipt
      };
      await api.post('/send', payload);
    }
    closeCompose(windowId);
    fetchMessages(activeFolder);
  };

  const handleResend = async () => {
    if (!selectedMessage) return;
    try {
      const uid = selectedMessage.uid || selectedMessage.id.split(':').pop();
      const res = await api.post('/rackspace/compose/get-resend-message', {
        folder: activeFolder,
        uid,
        thirdArgument: false
      });
      if (res.data && res.data.compose) {
        const c = res.data.compose;
        openCompose({
          operation: 'resend',
          originalFolder: activeFolder,
          originalUid: uid,
          from: settings.email,
          senderDisplayName: settings.senderName,
          to: c.to || '',
          cc: c.cc || '',
          bcc: c.bcc || '',
          subject: c.subject || '',
          body: c.body || '',
          attachments: c.attachments || [],
          providerContext: {
            rackspace: {
              originalFolder: activeFolder,
              originalUid: uid,
              compose: c
            }
          }
        });
        return;
      }
    } catch {}

    openCompose({
      operation: 'resend',
      from: settings.email,
      senderDisplayName: settings.senderName,
      to: typeof selectedMessage.to === 'string' ? selectedMessage.to : (selectedMessage.to?.[0]?.address || ''),
      subject: selectedMessage.subject || '',
      body: selectedMessage.html || selectedMessage.text || ''
    });
  };

  const handleSaveDraft = async (windowId: string, form: any, existingDraftId?: string) => {
    const payload = {
      operation: form.operation || 'new',
      message: {
        from: form.from,
        fromName: form.senderDisplayName || settings.senderName,
        to: typeof form.to === 'string' ? form.to.split(',').map((s: string) => s.trim()).filter(Boolean) : form.to,
        cc: typeof form.cc === 'string' ? form.cc.split(',').map((s: string) => s.trim()).filter(Boolean) : (form.cc || []),
        bcc: typeof form.bcc === 'string' ? form.bcc.split(',').map((s: string) => s.trim()).filter(Boolean) : (form.bcc || []),
        subject: form.subject || '',
        html: form.body || '',
        text: form.body ? form.body.replace(/<[^>]*>?/gm, '') : '',
        attachments: form.attachments || []
      }
    };
    if (existingDraftId) {
      const res = await api.put(`/local/drafts/${existingDraftId}`, payload);
      return res.data;
    } else {
      const res = await api.post('/local/drafts', payload);
      return res.data;
    }
  };

  const handleBatchAction = async (action: string, destination?: string) => {
    if (selectedIds.size === 0) return;
    try {
      const uids = [...selectedIds].map(id => {
        const msg = messages.find(m => m.id === id);
        return msg?.uid || id.split(':').pop();
      }).filter(Boolean);

      if (action === 'delete') {
        const trashFolder = folders.find(f => f.specialUse === '\\Trash' || /trash|bin/i.test(f.path))?.path || 'Trash';
        await api.post('/messages/bulk', { folder: activeFolder, action: 'move', destination: trashFolder, uids });
        setMessages(prev => prev.filter(m => !selectedIds.has(m.id)));
        if (selectedMessage && selectedIds.has(selectedMessage.id)) setSelectedMessage(null);
        setSelectedIds(new Set());
        fetchFolders();
      } else if (action === 'read' || action === 'unread') {
        await api.post('/messages/bulk', { folder: activeFolder, action, uids });
        setMessages(prev => prev.map(m => selectedIds.has(m.id) ? { ...m, read: action === 'read' } : m));
      } else if (action === 'move' && destination) {
        await api.post('/messages/bulk', { folder: activeFolder, action: 'move', destination, uids });
        setMessages(prev => prev.filter(m => !selectedIds.has(m.id)));
        setSelectedIds(new Set());
      }
    } catch (err: any) {
      setError(err.message || 'Batch action failed.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      <Navigation
        search={search}
        onSearch={setSearch}
        onSettings={() => setShowSettings(true)}
        account={settings.email}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          folders={folders}
          activeFolder={activeFolder}
          onFolderChange={handleFolderChange}
          onCompose={() => openCompose()}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-white">
          <MailToolbar
            onCheck={() => {
              setBusy(true);
              fetchMessages(activeFolder).finally(() => setBusy(false));
            }}
            onReply={() => {
              if (!selectedMessage) return;
              const sender = typeof selectedMessage.from === 'string'
                ? selectedMessage.from
                : selectedMessage.from?.[0]?.address || '';
              openCompose({
                to: sender,
                subject: `Re: ${selectedMessage.subject || ''}`,
                body: `<br><br>--- Original Message ---<br>${selectedMessage.html || selectedMessage.text || ''}`
              });
            }}
            onReplyAll={() => {
              if (!selectedMessage) return;
              const senderObj = typeof selectedMessage.from === 'string' ? { address: selectedMessage.from } : selectedMessage.from?.[0];
              const sender = senderObj?.address || '';
              const toList = [sender, ...(selectedMessage.to || []).map((a: any) => typeof a === 'string' ? a : a.address)].filter(Boolean);
              const ccList = (selectedMessage.cc || []).map((a: any) => typeof a === 'string' ? a : a.address).filter(Boolean);
              const uniqueTo = Array.from(new Set(toList)).filter(addr => String(addr).toLowerCase() !== settings.email.toLowerCase());
              const uniqueCc = Array.from(new Set(ccList)).filter(addr => String(addr).toLowerCase() !== settings.email.toLowerCase() && !uniqueTo.includes(addr));
              openCompose({
                to: uniqueTo.join(', '),
                cc: uniqueCc.join(', '),
                subject: `Re: ${selectedMessage.subject || ''}`,
                body: `<br><br>--- Original Message ---<br>${selectedMessage.html || selectedMessage.text || ''}`
              });
            }}
            onForward={() => {
              if (!selectedMessage) return;
              openCompose({
                subject: `Fwd: ${selectedMessage.subject || ''}`,
                body: `<br><br>--- Forwarded Message ---<br>${selectedMessage.html || selectedMessage.text || ''}`
              });
            }}
            onResend={handleResend}
            onDelete={() => handleBatchAction('delete')}
            onArchive={() => handleBatchAction('move', 'Archive')}
            onSpam={() => handleBatchAction('move', 'Junk')}
            onRead={() => handleBatchAction('read')}
            onUnread={() => handleBatchAction('unread')}
            onFlag={() => {}}
            onUnflag={() => {}}
            onClearSelection={() => setSelectedIds(new Set())}
            canUseMessage={Boolean(selectedMessage)}
            canResend={Boolean(selectedMessage)}
            selectedCount={selectedIds.size}
            busy={busy}
            filter={mailFilter}
            onFilterChange={setMailFilter}
            isTrash={isTrash}
            onEmptyTrash={handleEmptyTrash}
          />

          <div className="flex-1 flex overflow-hidden">
            <MessageList
              messages={filteredMessages}
              activeFolder={activeFolder}
              onMessageClick={handleMessageClick}
              selectedMessage={selectedMessage}
              selectedIds={selectedIds}
              onToggle={handleToggleSelect}
              onToggleAll={handleToggleAll}
              onFlag={handleFlag}
              loading={loading}
              error={error}
              density={preferences.density}
            />

            {preferences.previewPane && selectedMessage && (
              <MessagePreview
                message={selectedMessage}
                onResend={handleResend}
                onRetry={() => fetchMessages(activeFolder)}
                canResend={true}
                onClose={() => setSelectedMessage(null)}
              />
            )}
          </div>
        </main>
      </div>

      {composeWindows.map(win => (
        <ComposeModal
          key={win.windowId}
          windowId={win.windowId}
          zIndex={win.zIndex}
          initialPosition={win.initialPosition}
          onActivate={activateCompose}
          onClose={closeCompose}
          onSend={handleSend}
          onSaveDraft={handleSaveDraft}
          initialData={win.initialData}
        />
      ))}

      {showSettings && (
        <SettingsModal
          settings={settings}
          preferences={preferences}
          onPreferences={setPreferences}
          onClose={() => setShowSettings(false)}
          onSave={async newSettings => {
            await api.put('/settings', newSettings);
            setSettings(newSettings);
            setShowSettings(false);
            fetchFolders();
            fetchMessages(activeFolder);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md p-4 rounded-2xl shadow-2xl bg-slate-900 border border-slate-700 text-white flex items-center space-x-3 animate-in slide-in-from-bottom-4 duration-300">
          <div className={`w-3 h-3 rounded-full shrink-0 ${toast.type === 'error' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
          <div className="flex-1 text-xs font-medium leading-relaxed">
            {toast.message}
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white p-1">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
