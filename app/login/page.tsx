'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { requireAuth } from '@/lib/firebase';
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
      const auth = requireAuth(); // ← concrete Auth instance on the client
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      router.push('/');
    } catch (err) {
      const fe = err as FirebaseError;
      // friendlier messages for common cases:
      const map: Record<string, string> = {
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/user-not-found': 'No account found for that email.',
        'auth/wrong-password': 'Invalid email or password.',
        'auth/invalid-api-key': 'Invalid Firebase API key (check env vars).',
        'auth/network-request-failed': 'Network error. Please try again.',
      };
      setError(map[fe.code] ?? (fe.message || 'Authentication failed'));
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
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
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
