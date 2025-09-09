'use client';
import { useEffect, useState } from 'react';

export default function InstallPrompt(){
  const [deferred, setDeferred] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    // @ts-ignore
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={async () => {
        const choice = await deferred.prompt();
        setVisible(false);
        setDeferred(null);
        console.log('install choice', choice);
      }}
      className="px-3 py-2 rounded-xl border"
    >
      Install App
    </button>
  );
}

