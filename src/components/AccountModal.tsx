import React, { useState } from 'react';
import { UserAccount } from '../types';
import { Mail, Cloud, Check, RefreshCw, X, LogOut, ShieldCheck, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: UserAccount | null;
  onLogin: (acc: UserAccount) => void;
  onLogout: () => void;
  onSyncNow: () => Promise<void>;
  isSyncing: boolean;
  decisionCount: number;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  account,
  onLogin,
  onLogout,
  onSyncNow,
  isSyncing,
  decisionCount,
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [codeStep, setCodeStep] = useState(false);
  const [devPreviewCode, setDevPreviewCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRequestCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = emailInput.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      triggerHaptic('warning');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, name: nameInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to send verification code.');
        triggerHaptic('warning');
      } else {
        triggerHaptic('success');
        setCodeStep(true);
        setStatusNotice(data.message || `Verification code sent to ${cleanEmail}`);
        // Dev preview code is strictly gated behind Vite's development mode
        if (import.meta.env.DEV && data.devCode) {
          setDevPreviewCode(data.devCode);
        } else {
          setDevPreviewCode(null);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error requesting verification code.');
      triggerHaptic('warning');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = codeInput.trim();
    if (!cleanCode) {
      setErrorMessage('Please enter the 6-digit verification code.');
      triggerHaptic('warning');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.trim(),
          code: cleanCode,
          name: nameInput.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Invalid or expired code.');
        triggerHaptic('warning');
      } else {
        triggerHaptic('success');
        const loggedInAccount: UserAccount = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          authProvider: 'email',
          token: data.token,
          isSynced: true,
          lastSyncedAt: new Date().toISOString(),
        };
        onLogin(loggedInAccount);
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error verifying code.');
      triggerHaptic('warning');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoFillCode = () => {
    if (devPreviewCode) {
      setCodeInput(devPreviewCode);
      triggerHaptic('light');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#151619] border border-stone-200 dark:border-stone-800 p-6 shadow-2xl pb-safe transition-colors"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
      >
        <div className="w-10 h-1 bg-stone-300 dark:bg-stone-700 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-stone-100 dark:text-stone-900">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 id="account-modal-title" className="font-brief-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                Cloud Vault & Authentication
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-sf-sans">
                Encrypted token-authenticated decision storage
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {account ? (
          /* Logged In View */
          <div className="space-y-4">
            <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-[#1A1C20] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200">
                    <Mail className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                      {account.name}
                    </h4>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {account.email}
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold border border-emerald-300 dark:border-emerald-800">
                  <Check className="w-3 h-3" />
                  Authenticated
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-700 text-xs text-stone-600 dark:text-stone-400 flex items-center justify-between">
                <span>{decisionCount} briefs in isolated vault</span>
                <span className="font-mono text-[10px]">
                  {account.lastSyncedAt
                    ? `Synced: ${new Date(account.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Synced'}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  triggerHaptic('medium');
                  await onSyncNow();
                }}
                disabled={isSyncing}
                className="flex-1 py-2.5 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 text-stone-100 dark:text-stone-900 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 shadow-xs cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Vault Now'}</span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic('light');
                  onLogout();
                }}
                className="py-2.5 px-4 rounded-xl border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-rose-600 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>

            <div className="pt-2 flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Session verified with cryptographic Bearer token.</span>
            </div>
          </div>
        ) : (
          /* Authentication Form */
          <div className="space-y-4">
            <p className="text-xs text-stone-600 dark:text-stone-400 font-sf-sans leading-relaxed">
              Sign in with a verified session token to back up and synchronize your decision briefs across devices in a private, isolated vault.
            </p>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {statusNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{statusNotice}</span>
              </div>
            )}

            {!codeStep ? (
              /* Step 1: Enter Email & Request Code */
              <form onSubmit={handleRequestCode} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Your Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Alex Chen"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="name@organization.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 text-stone-100 dark:text-stone-900 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Send Verification Code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Step 2: Enter Verification Code */
              <form onSubmit={handleVerifyCode} className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                      6-Digit Security Code
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setCodeStep(false);
                        setErrorMessage(null);
                      }}
                      className="text-[11px] text-stone-500 hover:underline cursor-pointer"
                    >
                      Change email
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-3 text-center tracking-widest font-mono text-base font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-[#1A1C20] text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-100"
                  />
                </div>

                {import.meta.env.DEV && devPreviewCode && (
                  <div
                    onClick={handleAutoFillCode}
                    className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span>[DEV ONLY] Code: <strong className="font-mono font-bold">{devPreviewCode}</strong></span>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber-200/60 dark:bg-amber-800/60 px-2 py-0.5 rounded-md">
                      Auto-fill
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 text-stone-100 dark:text-stone-900 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Verify & Unlock Vault</span>
                      <ShieldCheck className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="pt-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Decisions stored in private, isolated vault.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
