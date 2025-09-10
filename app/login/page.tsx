'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  type Auth,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Import firebase client module only in the browser at call time.
      const { auth } = await import('@/lib/firebase');
      const a = auth; // narrow to a local var so TS can refine the type

      if (!a) {
        throw new Error('Firebase not initialized. Check your public env vars.');
      }

      if (mode === 'signin') {
        await signInWithEmailAndPassword(a as Auth, email, password);
      } else {
        await createUserWithEmailAndPassword(a as Auth, email, password);
      }

      router.push('/'); // go to app home after auth
    } catch (err) {
      const fe = err as FirebaseError;
      // Friendlier common messages
      const msg =
        fe.code === 'auth/invalid-api-key'
          ? 'Invalid Firebase API key. Verify NEXT_PUBLIC_FIREBASE_* env vars.'
          : fe.code === 'auth/invalid-credential'
          ? 'Invalid email or password.'
          : fe.code === 'auth/user-not-found'
          ? 'No account found for that email.'
          : fe.code === 'auth/wrong-password'
          ? 'Incorrect password.'
          : fe.message || 'Authentication failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] grid place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'signin' ? 'Sign in' : 'Create account'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
                required
              />
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex items-center justify-between">
              <Button type="submit" disabled={loading}>
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
              >
                {mode === 'signin' ? 'Need an account?' : 'Have an account?'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
