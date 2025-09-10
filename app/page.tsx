'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { requireAuth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { registerSW } from '@/pwa/registerSW';

const GoalsApp = dynamic(() => import('@/components/GoalApp'), { ssr: false });

export default function Page() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const auth = requireAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setLoggedIn(!!u);
      setReady(true);
      if (!u) router.replace('/login');
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      void registerSW().catch(() => {});
    }
  }, []);

  if (!ready || !loggedIn) return null;
  return <GoalsApp />;
}
