import React, { useEffect, useState } from 'react';
import { Circle, Wifi, WifiOff } from 'lucide-react';
import api from '../api';

export default function ConnectionIndicator() {
  const [connected, setConnected] = useState<boolean>(true);

  useEffect(() => {
    let timer: any;
    const checkHeartbeat = async () => {
      try {
        await api.get('/health', { timeout: 4000 });
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    checkHeartbeat();
    timer = setInterval(checkHeartbeat, 10_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center space-x-2">
      {connected ? (
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 shadow-2xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <Wifi size={13} className="text-emerald-600" />
          <span>Online</span>
        </div>
      ) : (
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-xs text-red-700 shadow-2xs font-semibold animate-pulse">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <WifiOff size={13} className="text-red-600" />
          <span>Offline</span>
        </div>
      )}
    </div>
  );
}
