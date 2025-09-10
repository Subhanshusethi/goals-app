'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { requireAuth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { registerSW } from '@/pwa/registerSW';

// Avoid SSR/hydration issues since the app uses localStorage/Window
const GoalsApp = dynamic(() => import('@/components/GoalApp'), { ssr: false });

export default function Page() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  // Auth guard: redirect to /login when not signed in
  useEffect(() => {
    const auth = requireAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setLoggedIn(!!u);
      setReady(true);
      if (!u) router.replace('/login');
    });
    return () => unsub();
  }, [router]);

  // Optional: register the PWA service worker (production only)
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      try {
        registerSW(); // registerSW returns void; don't chain .catch
      } catch {
        // ignore
      }
    }
  }, []);

  if (!ready) return null;     // waiting for auth state
  if (!loggedIn) return null;  // redirecting to /login

  return <GoalsApp />;
}
