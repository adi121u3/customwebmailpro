import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, FileSignature, Italic, List, ListOrdered, Minimize2, Paperclip, Save, Send, Trash2, Underline, X } from 'lucide-react';
import { getStoredSenderName, resolveSenderDisplayName, SENDER_DISPLAY_NAME_MAX_LENGTH, setStoredSenderName } from '../services/senderDisplayName';
import { uploadRackspaceComposeAttachment } from '../services/rackspaceCompose';
import { useAutoSaveDraft } from '../hooks/useAutoSaveDraft';

interface ComposeModalProps {
  key?: string | number;
  windowId: string;
  zIndex: number;
  initialPosition: { left: number; top: number };
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onSend: (id: string, form: any) => Promise<void>;
  onSaveDraft: (id: string, form: any) => Promise<any>;
  initialData: any;
}

export default function ComposeModal({
  windowId,
  zIndex,
  initialPosition,
  onActivate,
  onClose,
  onSend,
  onSaveDraft,
  initialData
}: ComposeModalProps) {
  const [form, setForm] = useState(() => {
    const draftName = String(initialData.senderDisplayName ?? initialData.fromName ?? '').trim();
    return {
      from: '',
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: '',
      compose_type: 'html',
      priority: '3',
      read_receipt: false,
      attachments: [],
      operation: 'new',
      draftId: null,
      ...initialData,
      senderDisplayName: draftName || getStoredSenderName() || initialData.identityDisplayName || initialData.accountDefaultDisplayName || ''
    };
  });

  const [position, setPosition] = useState(initialPosition);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showCopies, setShowCopies] = useState(Boolean(initialData.cc || initialData.bcc));

  const editor = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const safeWindowId = String(windowId).replace(/[^a-zA-Z0-9_-]/g, '');
  const senderNameId = `sender-display-name-${safeWindowId}`;
  const senderNameHelpId = `${senderNameId}-help`;

  useEffect(() => {
    if (!editor.current) return;
    const nextHtml = DOMPurify.sanitize(form.body || '', { USE_PROFILES: { html: true } });
    if (editor.current.innerHTML !== nextHtml) {
      editor.current.innerHTML = nextHtml;
    }
  }, [form.body]);

  const patch = (name: string, value: any) => setForm(current => ({ ...current, [name]: value }));

  const resolvedSenderName = (currentName: string) =>
    resolveSenderDisplayName({
      current: currentName,
      identityDefault: form.identityDisplayName,
      accountDefault: form.accountDefaultDisplayName,
      email: form.from
    });

  const handleSenderNameChange = (value: string) => {
    const next = value.slice(0, SENDER_DISPLAY_NAME_MAX_LENGTH);
    if (next === form.senderDisplayName) return;
    patch('senderDisplayName', next);
    setStoredSenderName(next);
    setDirty(true);
  };

  const prepareForm = () => ({
    ...form,
    senderDisplayName: resolvedSenderName(form.senderDisplayName)
  });

  const syncHtml = () => patch('body', editor.current?.innerHTML || '');

  const toggleSignature = () => {
    if (!editor.current || !form.signatureHtml) return;
    const existing = editor.current.querySelector('[data-webmail-signature="true"]');
    if (existing) {
      existing.remove();
    } else {
      editor.current.insertAdjacentHTML(
        'beforeend',
        DOMPurify.sanitize(form.signatureHtml, { USE_PROFILES: { html: true } })
      );
    }
    syncHtml();
    setDirty(true);
  };

  const format = (command: string) => {
    editor.current?.focus();
    document.execCommand(command, false);
    syncHtml();
  };

  const startDrag = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button')) return;
    onActivate(windowId);
    drag.current = { x: event.clientX, y: event.clientY, left: position.left, top: position.top };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent) => {
    if (drag.current) {
      setPosition({
        left: Math.max(16, drag.current.left + event.clientX - drag.current.x),
        top: Math.max(16, drag.current.top + event.clientY - drag.current.y)
      });
    }
  };

  const addFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const files = input.files ? Array.from(input.files) : [];
    if (!files.length) return;

    setBusy(true);
    setStatus(form.rackspace ? 'Uploading attachment to Rackspace…' : 'Adding attachment…');
    try {
      const payloads = await Promise.all(files.map(readFilePayload));
      const additions = form.rackspace ? await Promise.all(payloads.map(uploadRackspaceComposeAttachment)) : payloads;
      setForm(current => ({ ...current, attachments: [...current.attachments, ...additions] }));
      setDirty(true);
      setStatus(form.rackspace ? 'Attachment uploaded to Rackspace.' : 'Attachment added.');
    } catch (error: any) {
      setStatus(error.message || 'Attachment upload failed.');
    } finally {
      setBusy(false);
      input.value = '';
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus('Preparing secure delivery…');
    try {
      await onSend(windowId, prepareForm());
    } catch (error: any) {
      setStatus(error.message || 'Send failed.');
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setStatus('Saving draft…');
    try {
      const prepared = prepareForm();
      const draft = await onSaveDraft(windowId, prepared);
      setForm(current => ({
        ...current,
        senderDisplayName: prepared.senderDisplayName,
        draftId: draft.id,
        ...(draft.providerContext?.rackspace ? { rackspace: draft.providerContext.rackspace } : {})
      }));
      setDirty(false);
      setStatus('Draft saved automatically (30s inactivity).');
    } catch (error: any) {
      setStatus(error.message || 'Draft save failed.');
    } finally {
      setBusy(false);
    }
  };

  // Auto-save draft hook on 30 seconds of inactivity in the editor
  useAutoSaveDraft(save, [form.to, form.cc, form.bcc, form.subject, form.body, dirty], 30_000);

  return (
    <div
      onMouseDown={() => onActivate(windowId)}
      style={{ left: position.left, top: position.top, zIndex }}
      className="fixed w-[680px] bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <header
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => { drag.current = null; }}
        className="h-12 bg-slate-900 text-white px-5 flex items-center justify-between cursor-move select-none"
      >
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          <strong className="text-sm font-bold tracking-tight">
            {form.operation === 'resend' ? 'Re-send Message' : form.draftId ? 'Edit Draft' : 'New Message'}
          </strong>
        </div>
        <div className="flex items-center space-x-1">
          <button type="button" disabled className="p-1.5 rounded-lg text-slate-400 hover:text-white"><Minimize2 size={15} /></button>
          <button type="button" onClick={() => onClose(windowId)} className="p-1.5 rounded-lg text-slate-400 hover:text-white"><X size={17} /></button>
        </div>
      </header>

      <form onSubmit={submit} className="flex flex-col flex-1">
        <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center space-x-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all"
          >
            <Send size={14} />
            <span>Send</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-xs transition-all"
          >
            <Save size={14} />
            <span>Save draft</span>
          </button>
          <label className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-xs cursor-pointer transition-all ${busy ? 'opacity-50' : ''}`}>
            <Paperclip size={14} />
            <span>Attach</span>
            <input type="file" multiple disabled={busy} onChange={addFiles} className="hidden" />
          </label>
          {form.signatureHtml && !form.rackspace && (
            <button
              type="button"
              onClick={toggleSignature}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-xs transition-all"
            >
              <FileSignature size={14} />
              <span>Signature</span>
            </button>
          )}
          <div className="ml-auto">
            <select
              aria-label="Priority"
              value={String(form.priority || '3').charAt(0)}
              onChange={e => patch('priority', e.target.value)}
              className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="1">Highest priority</option>
              <option value="2">High priority</option>
              <option value="3">Normal priority</option>
              <option value="4">Low priority</option>
              <option value="5">Lowest priority</option>
            </select>
          </div>
        </div>

        <div className="p-5 space-y-3.5 border-b border-slate-200">
          <div className="flex flex-col space-y-1.5 pb-2 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <label htmlFor={senderNameId} className="text-xs font-bold uppercase tracking-wider text-slate-500">From Name</label>
              <span id={senderNameHelpId} className="text-[11px] text-slate-400">Appears beside your fixed email address</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="relative flex-1">
                <input
                  id={senderNameId}
                  type="text"
                  value={form.senderDisplayName || ''}
                  onChange={e => handleSenderNameChange(e.target.value)}
                  placeholder="Your Name"
                  maxLength={SENDER_DISPLAY_NAME_MAX_LENGTH}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  {(form.senderDisplayName || '').length}/{SENDER_DISPLAY_NAME_MAX_LENGTH}
                </span>
              </div>
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200">
                &lt;{form.from || 'sender@irumol.io'}&gt;
              </span>
            </div>
          </div>

          <RecipientRow
            label="To"
            required
            value={form.to}
            onChange={(val: string) => patch('to', val)}
            placeholder="recipient@example.com"
            action={
              <button
                type="button"
                onClick={() => setShowCopies(v => !v)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1"
              >
                <span>Cc & Bcc</span>
                <ChevronDown size={13} />
              </button>
            }
          />

          {showCopies && (
            <>
              <RecipientRow label="Cc" value={form.cc} onChange={(val: string) => patch('cc', val)} placeholder="cc@example.com" />
              <RecipientRow label="Bcc" value={form.bcc} onChange={(val: string) => patch('bcc', val)} placeholder="bcc@example.com" />
            </>
          )}

          <RecipientRow label="Subject" value={form.subject} onChange={(val: string) => patch('subject', val)} placeholder="Message subject" />
        </div>

        <div className="flex items-center space-x-1 px-4 py-2 bg-slate-100 border-b border-slate-200 text-slate-600">
          <ToolButton icon={Bold} command="bold" onRun={format} title="Bold" />
          <ToolButton icon={Italic} command="italic" onRun={format} title="Italic" />
          <ToolButton icon={Underline} command="underline" onRun={format} title="Underline" />
          <span className="w-px h-4 bg-slate-300 mx-1" />
          <ToolButton icon={AlignLeft} command="justifyLeft" onRun={format} title="Align left" />
          <ToolButton icon={AlignCenter} command="justifyCenter" onRun={format} title="Align center" />
          <ToolButton icon={AlignRight} command="justifyRight" onRun={format} title="Align right" />
          <span className="w-px h-4 bg-slate-300 mx-1" />
          <ToolButton icon={List} command="insertUnorderedList" onRun={format} title="Bullet list" />
          <ToolButton icon={ListOrdered} command="insertOrderedList" onRun={format} title="Numbered list" />
        </div>

        <div
          ref={editor}
          contentEditable
          suppressContentEditableWarning
          onInput={syncHtml}
          className="p-5 min-h-[180px] max-h-[300px] overflow-y-auto focus:outline-none text-sm text-slate-800 leading-relaxed font-sans"
          role="textbox"
          aria-label="Message body"
          aria-multiline="true"
          tabIndex={0}
          data-placeholder="Write your professional message here..."
        />

        {form.attachments.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-2">
            {form.attachments.map((att: any, idx: number) => (
              <span key={att.id || idx} className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 shadow-xs">
                <Paperclip size={13} className="text-slate-400" />
                <span>{att.filename || att.name}</span>
                {!form.rackspace && (
                  <button
                    type="button"
                    onClick={() => patch('attachments', form.attachments.filter((item: any) => item !== att))}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <footer className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <label className="flex items-center space-x-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={Boolean(form.read_receipt)}
              onChange={e => patch('read_receipt', e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
            />
            <span>Request read receipt</span>
          </label>
          <span className="truncate max-w-[240px] font-medium text-slate-500">
            {status || (dirty ? 'Unsaved changes' : 'Draft synced locally')}
          </span>
          <button
            type="button"
            className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Discard"
            onClick={() => onClose(windowId)}
          >
            <Trash2 size={17} />
          </button>
        </footer>
      </form>
    </div>
  );
}

function RecipientRow({ label, action, onChange, ...props }: any) {
  return (
    <div className="flex items-center space-x-3">
      <span className="w-16 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex-1 flex items-center space-x-2 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 focus-within:ring-2 focus-within:ring-blue-500">
        <input
          {...props}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-transparent text-sm text-slate-800 focus:outline-none"
        />
        {action}
      </div>
    </div>
  );
}

function ToolButton({ icon: Icon, command, onRun, title }: any) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onRun(command)}
      className="p-2 rounded-lg hover:bg-slate-200/80 text-slate-600 transition-colors"
    >
      <Icon size={17} />
    </button>
  );
}

function readFilePayload(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        id: crypto.randomUUID(),
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        contentBase64: String(reader.result).split(',')[1]
      });
    reader.onerror = () => reject(reader.error || new Error('Unable to read attachment.'));
    reader.readAsDataURL(file);
  });
}
