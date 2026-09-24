import crypto from 'crypto';
import { getFirestoreDB } from './firebase';

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  authProvider: 'email' | 'apple';
  createdAt: string;
}

export interface StoredSession {
  token: string;
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

export interface VerificationCodeEntry {
  email: string;
  name?: string;
  code: string;
  expiresAt: number;
}

export class PersistentVaultStore {
  private inMemoryUsers: Map<string, StoredUser> = new Map();
  private inMemorySessions: Map<string, StoredSession> = new Map();
  private inMemoryVaults: Map<string, any[]> = new Map();
  private inMemoryPendingCodes: Map<string, VerificationCodeEntry> = new Map();

  // Deterministic unique userId from normalized email
  private getUserId(email: string): string {
    const normalized = email.trim().toLowerCase();
    const hash = crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 12);
    return `usr_${hash}`;
  }

  // Issue 6-digit verification code with 10-minute expiry
  public async createVerificationCode(
    email: string,
    name?: string
  ): Promise<{ code: string; expiresAt: number }> {
    const normalized = email.trim().toLowerCase();
    // 6-digit numeric OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    const entry: VerificationCodeEntry = {
      email: normalized,
      name: name?.trim() || undefined,
      code,
      expiresAt,
    };

    // Cache locally
    this.inMemoryPendingCodes.set(normalized, entry);

    // Save to Firestore via Admin SDK
    try {
      const db = getFirestoreDB();
      await db.collection('verification_codes').doc(encodeURIComponent(normalized)).set(entry);
    } catch (err) {
      console.warn('[VaultStore] Firestore Admin write error for verification code, fell back to local cache:', err);
    }

    return { code, expiresAt };
  }

  // Verify code and generate authenticated session token
  public async verifyCode(
    email: string,
    submittedCode: string,
    name?: string
  ): Promise<{ success: boolean; token?: string; user?: StoredUser; error?: string }> {
    const normalized = email.trim().toLowerCase();
    let pending = this.inMemoryPendingCodes.get(normalized);

    // Read from Firestore via Admin SDK if not in local memory
    if (!pending) {
      try {
        const db = getFirestoreDB();
        const docSnap = await db.collection('verification_codes').doc(encodeURIComponent(normalized)).get();
        if (docSnap.exists) {
          pending = docSnap.data() as VerificationCodeEntry;
          this.inMemoryPendingCodes.set(normalized, pending);
        }
      } catch (err) {
        console.warn('[VaultStore] Firestore Admin read error for verification code:', err);
      }
    }

    if (!pending) {
      return { success: false, error: 'No verification code was requested for this email. Please request a new code.' };
    }

    if (Date.now() > pending.expiresAt) {
      this.inMemoryPendingCodes.delete(normalized);
      try {
        const db = getFirestoreDB();
        await db.collection('verification_codes').doc(encodeURIComponent(normalized)).delete();
      } catch {}
      return { success: false, error: 'Verification code has expired. Please request a new one.' };
    }

    if (pending.code !== submittedCode.trim()) {
      return { success: false, error: 'Invalid verification code. Please check your code and try again.' };
    }

    // Code is valid! Consume code
    this.inMemoryPendingCodes.delete(normalized);
    try {
      const db = getFirestoreDB();
      await db.collection('verification_codes').doc(encodeURIComponent(normalized)).delete();
    } catch {}

    const userId = this.getUserId(normalized);
    let user = await this.getUser(userId);

    if (!user) {
      const displayName = name?.trim() || pending.name || normalized.split('@')[0];
      user = {
        id: userId,
        email: normalized,
        name: displayName,
        authProvider: 'email',
        createdAt: new Date().toISOString(),
      };
      await this.saveUser(user);
    } else if (name && name.trim() && user.name !== name.trim()) {
      user.name = name.trim();
      await this.saveUser(user);
    }

    // Issue cryptographic 64-char hex session token (30 days validity)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const session: StoredSession = {
      token,
      userId,
      email: normalized,
      createdAt: new Date().toISOString(),
      expiresAt,
    };

    await this.saveSession(session);

    return { success: true, token, user };
  }

  // Retrieve user by ID via Admin SDK
  public async getUser(userId: string): Promise<StoredUser | undefined> {
    if (this.inMemoryUsers.has(userId)) {
      return this.inMemoryUsers.get(userId);
    }

    try {
      const db = getFirestoreDB();
      const docSnap = await db.collection('users').doc(userId).get();
      if (docSnap.exists) {
        const u = docSnap.data() as StoredUser;
        this.inMemoryUsers.set(userId, u);
        return u;
      }
    } catch (err) {
      console.warn('[VaultStore] Error fetching user from Firestore Admin:', err);
    }

    return undefined;
  }

  // Save or update user via Admin SDK
  public async saveUser(user: StoredUser): Promise<void> {
    this.inMemoryUsers.set(user.id, user);

    try {
      const db = getFirestoreDB();
      await db.collection('users').doc(user.id).set(user, { merge: true });
    } catch (err) {
      console.warn('[VaultStore] Error saving user to Firestore Admin:', err);
    }
  }

  // Save session via Admin SDK
  public async saveSession(session: StoredSession): Promise<void> {
    this.inMemorySessions.set(session.token, session);

    try {
      const db = getFirestoreDB();
      await db.collection('sessions').doc(session.token).set(session);
    } catch (err) {
      console.warn('[VaultStore] Error saving session to Firestore Admin:', err);
    }
  }

  // Retrieve and validate session via Admin SDK
  public async getSession(
    token: string
  ): Promise<{ valid: boolean; session?: StoredSession; user?: StoredUser }> {
    if (!token) return { valid: false };

    let session = this.inMemorySessions.get(token);
    if (!session) {
      try {
        const db = getFirestoreDB();
        const docSnap = await db.collection('sessions').doc(token).get();
        if (docSnap.exists) {
          session = docSnap.data() as StoredSession;
          this.inMemorySessions.set(token, session);
        }
      } catch (err) {
        console.warn('[VaultStore] Error fetching session from Firestore Admin:', err);
      }
    }

    if (!session) return { valid: false };

    // Check expiry
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await this.revokeSession(token);
      return { valid: false };
    }

    const user = await this.getUser(session.userId);
    return { valid: true, session, user };
  }

  // Revoke session on logout via Admin SDK
  public async revokeSession(token: string): Promise<boolean> {
    this.inMemorySessions.delete(token);

    try {
      const db = getFirestoreDB();
      await db.collection('sessions').doc(token).delete();
      return true;
    } catch (err) {
      console.warn('[VaultStore] Error deleting session from Firestore Admin:', err);
      return false;
    }
  }

  // Clear all sessions (session rotation) via Admin SDK
  public async clearAllSessions(): Promise<void> {
    this.inMemorySessions.clear();

    try {
      const db = getFirestoreDB();
      const snapshot = await db.collection('sessions').get();
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`[VaultStore] Cleared ${snapshot.size} legacy session(s) in Firestore.`);
      }
    } catch (err) {
      console.warn('[VaultStore] Error clearing sessions collection in Firestore Admin:', err);
    }
  }

  // Vault data isolation per userId via Admin SDK
  public async getDecisions(userId: string): Promise<any[]> {
    if (this.inMemoryVaults.has(userId)) {
      return this.inMemoryVaults.get(userId) || [];
    }

    try {
      const db = getFirestoreDB();
      const docSnap = await db.collection('vaults').doc(userId).get();
      if (docSnap.exists) {
        const data = docSnap.data();
        const decisions = data && Array.isArray(data.decisions) ? data.decisions : [];
        this.inMemoryVaults.set(userId, decisions);
        return decisions;
      }
    } catch (err) {
      console.warn('[VaultStore] Error fetching vault from Firestore Admin:', err);
    }

    return [];
  }

  public async saveDecisions(userId: string, decisions: any[]): Promise<void> {
    this.inMemoryVaults.set(userId, decisions);

    try {
      const db = getFirestoreDB();
      await db.collection('vaults').doc(userId).set({
        userId,
        decisions,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[VaultStore] Error saving vault to Firestore Admin:', err);
    }
  }
}

// In-Memory Sliding Window Rate Limiter
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMinutes: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMinutes * 60 * 1000;
  }

  public check(key: string): { allowed: boolean; remaining: number; resetSec: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.requests.get(key) || [];
    // Discard timestamps older than window
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0];
      const resetSec = Math.ceil((oldestInWindow + this.windowMs - now) / 1000);
      return { allowed: false, remaining: 0, resetSec: Math.max(1, resetSec) };
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);

    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetSec: Math.ceil(this.windowMs / 1000),
    };
  }
}
