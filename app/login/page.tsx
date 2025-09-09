'use client';
import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { if (u) router.replace('/'); });
    return () => unsub();
  }, [router]);

  const submit = async () => {
    setErr('');
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, pass);
      } else {
        await createUserWithEmailAndPassword(auth, email, pass);
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed');
    }
  };

  return (
    <div className="min-h-[70vh] grid place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>{mode === 'login' ? 'Log in' : 'Create account'}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Email</Label><Input value={email} onChange={e=>setEmail(e.target.value)} /></div>
          <div><Label>Password</Label><Input type="password" value={pass} onChange={e=>setPass(e.target.value)} /></div>
          {err ? <div className="text-sm text-red-500">{err}</div> : null}
          <Button className="w-full" onClick={submit}>{mode === 'login' ? 'Log in' : 'Sign up'}</Button>
          <Button variant="outline" className="w-full" onClick={()=>setMode(m=> m==='login'?'signup':'login')}>
            {mode === 'login' ? 'Create an account' : 'Have an account? Log in'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

