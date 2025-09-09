'use client';
import { useEffect, useState } from 'react';

// Minimal type for the (not yet standard) `beforeinstallprompt` event
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      const evt = e as BeforeInstallPromptEvent;
      // prevent auto prompt so we can show our own button
      evt.preventDefault?.();
      setDeferred(evt);
      setVisible(true);
    };

    // The event name is correct; casting the listener keeps TS happy
    window.addEventListener('beforeinstallprompt', onPrompt as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt as EventListener);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={async () => {
        if (!deferred) return;
        await deferred.prompt();
        setVisible(false);
        setDeferred(null);
      }}
      className="px-3 py-2 rounded-xl border"
    >
      Install App
    </button>
  );
}
