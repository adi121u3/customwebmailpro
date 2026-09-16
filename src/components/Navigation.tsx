import React from 'react';
import { LogOut, Mail, Search, Settings, Sparkles } from 'lucide-react';
import ConnectionIndicator from './ConnectionIndicator';
import api from '../api';

interface NavigationProps {
  search: string;
  onSearch: (value: string) => void;
  onSettings: () => void;
  account: string;
}

export default function Navigation({ search, onSearch, onSettings, account }: NavigationProps) {
  const handleLogout = async () => {
    try {
      await api.post('/logout');
    } catch {}
    localStorage.removeItem('customwebmail_app_token');
    window.location.reload();
  };

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 text-white px-6 flex items-center justify-between shadow-sm sticky top-0 z-30">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
          <Mail size={22} className="text-white" strokeWidth={2.2} />
        </div>
        <div>
          <span className="text-xs font-semibold tracking-widest text-blue-400 uppercase">Enterprise Mail</span>
          <h1 className="text-lg font-bold tracking-tight text-white leading-none">IRUMOL</h1>
        </div>
      </div>

      <div className="flex-1 max-w-xl mx-8">
        <div className="relative group">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
          <input
            type="text"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Search mail by sender, subject, or keywords..."
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-inner"
          />
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <ConnectionIndicator />

        <div className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-slate-800/90 border border-slate-700/60 text-xs text-slate-300">
          <Sparkles size={13} className="text-blue-400 animate-pulse" />
          <span className="font-medium truncate max-w-[150px]">{account || 'Connected Workspace'}</span>
        </div>

        <button
          onClick={onSettings}
          className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all shadow-sm cursor-pointer"
          title="Settings"
        >
          <Settings size={18} />
        </button>

        <button
          onClick={handleLogout}
          className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-red-900/60 text-slate-300 hover:text-red-200 border border-slate-700/60 transition-all shadow-sm cursor-pointer"
          title="Log out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
