import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getFirestoreDB(): Firestore {
  if (db) return db;

  let config: any = {};
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    console.warn('[Firebase] Could not read firebase-applet-config.json:', err);
  }

  const firebaseConfig = {
    apiKey: config.apiKey || process.env.FIREBASE_API_KEY || '',
    authDomain: config.authDomain || process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: config.projectId || process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0602416583',
    storageBucket: config.storageBucket || process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: config.messagingSenderId || '',
    appId: config.appId || '',
  };

  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  
  const databaseId = config.firestoreDatabaseId || process.env.FIRESTORE_DATABASE_ID;
  if (databaseId) {
    db = getFirestore(app, databaseId);
  } else {
    db = getFirestore(app);
  }

  return db;
}
