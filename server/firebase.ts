import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let app: App | null = null;
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

  const databaseId =
    process.env.FIRESTORE_DATABASE_ID ||
    config.firestoreDatabaseId ||
    'ai-studio-verdictdesk-e40523ec-cbd3-4155-aee4-721ba6ca9366';

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    let serviceAccount: any;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (err: any) {
      throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${err.message}`);
    }

    app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
    db = getFirestore(app, databaseId);
    return db;
  }

  // If FIREBASE_SERVICE_ACCOUNT_JSON is not yet provided in Secrets, initialize with default project credentials
  console.warn(
    '[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_JSON secret is not set. To bypass rules, add FIREBASE_SERVICE_ACCOUNT_JSON to Secrets.'
  );

  const projectId = process.env.FIREBASE_PROJECT_ID || config.projectId || 'gen-lang-client-0602416583';
  app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId });
  db = getFirestore(app, databaseId);
  return db;
}
