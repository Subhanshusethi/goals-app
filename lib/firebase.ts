// lib/firebase.ts
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';

const isClient = typeof window !== 'undefined';

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`[Firebase] Missing env var ${name}`);
  }
  return value;
}

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

export function initFirebase(): void {
  if (!isClient || app) return;

  const config = {
    apiKey: required('NEXT_PUBLIC_FIREBASE_API_KEY', process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: required('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: required('NEXT_PUBLIC_FIREBASE_PROJECT_ID', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    // measurementId is optional; only needed if you use Analytics (browser-only)
  };

  app = getApps().length ? getApp() : initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);

  // Browser-only persistence (ignore benign errors like multi-tab)
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  enableIndexedDbPersistence(db).catch(() => {});
}

export function requireApp(): FirebaseApp {
  initFirebase();
  if (!app) throw new Error('[Firebase] App not initialized (client-only).');
  return app;
}
export function requireAuth(): Auth {
  initFirebase();
  if (!auth) throw new Error('[Firebase] Auth not available (client-only).');
  return auth;
}
export function requireDb(): Firestore {
  initFirebase();
  if (!db) throw new Error('[Firebase] Firestore not available (client-only).');
  return db;
}

// Legacy named exports: will be undefined on the server until init runs on the client.
export { app, auth, db };
