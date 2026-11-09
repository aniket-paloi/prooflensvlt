import { useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  firebaseProjectId,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { prooflensApi, setStoredSessionToken } from '../api/client';
import type { AuthSessionPayload } from '../types/prooflens';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: AuthSessionPayload | null;
  onSessionChange: (newSession: AuthSessionPayload | null) => void;
}

type AuthTab = 'login' | 'register' | 'session';

async function syncUserToFirestore(params: {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'investigator' | 'reviewer';
  authProvider: 'email-password' | 'google';
}) {
  const userPath = `users/${params.uid}`;
  try {
    const userRef = doc(db, 'users', params.uid);
    const snap = await getDoc(userRef);
    const now = new Date().toISOString();
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: params.uid,
        email: params.email,
        displayName: params.displayName,
        role: params.role,
        authProvider: params.authProvider,
        createdAt: now,
        lastLoginAt: now,
      });
    } else {
      const existing = snap.data();
      await setDoc(userRef, {
        uid: params.uid,
        email: params.email,
        displayName: params.displayName || existing.displayName,
        role: existing.role || params.role,
        authProvider: existing.authProvider || params.authProvider,
        createdAt: existing.createdAt || now,
        lastLoginAt: now,
      });
    }
  } catch (err) {
    // Only throw structured FirestoreErrorInfo if signed into Firebase Auth
    if (auth.currentUser) {
      handleFirestoreError(err, OperationType.WRITE, userPath);
    }
  }
}

export function AuthModal({
  isOpen,
  onClose,
  session,
  onSessionChange,
}: AuthModalProps) {
  const [tab, setTab] = useState<AuthTab>(session ? 'session' : 'login');
  const [email, setEmail] = useState<string>('demo@prooflens.local');
  const [password, setPassword] = useState<string>('Investigator#2026');
  const [displayName, setDisplayName] = useState<string>('');
  const [organization, setOrganization] = useState<string>(
    'ProofLens Demo Workspace'
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [infoBanner, setInfoBanner] = useState<string>('');

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setInfoBanner('');
    try {
      let firebaseUid: string | undefined;
      try {
        const cred = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        firebaseUid = cred.user.uid;
      } catch (fbErr) {
        const code = (fbErr as { code?: string })?.code || '';
        if (
          code === 'auth/operation-not-allowed' ||
          code === 'auth/configuration-not-found'
        ) {
          setInfoBanner(
            'Authenticated with PBKDF2-SHA512 cryptographic session manager. Note: To also mirror Email/Password credentials in Firebase Auth Console, enable the Email/Password provider in your Firebase project.'
          );
        }
      }

      const { session: activeSession } = await prooflensApi.login({
        email: email.trim(),
        password,
      });
      setStoredSessionToken(activeSession.token);

      if (firebaseUid) {
        await syncUserToFirestore({
          uid: firebaseUid,
          email: activeSession.user.email,
          displayName: activeSession.user.displayName,
          role: 'investigator',
          authProvider: 'email-password',
        });
      }

      onSessionChange(activeSession);
      setTab('session');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Invalid email or password.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setInfoBanner('');
    try {
      let firebaseUid: string | undefined;
      try {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        firebaseUid = cred.user.uid;
      } catch (fbErr) {
        const code = (fbErr as { code?: string })?.code || '';
        if (
          code === 'auth/operation-not-allowed' ||
          code === 'auth/configuration-not-found'
        ) {
          setInfoBanner(
            'Account registered with PBKDF2-HMAC-SHA512 (100,000 iterations + 128-bit cryptographic salt). Note: To also enable Firebase client Email/Password provider, toggle Email/Password in Firebase Console.'
          );
        }
      }

      const { session: newSession } = await prooflensApi.register({
        email: email.trim(),
        password,
        displayName:
          displayName.trim() || email.trim().split('@')[0] || 'Investigator',
        organization: organization.trim() || 'ProofLens India Financial Forensics',
      });
      setStoredSessionToken(newSession.token);

      if (firebaseUid) {
        await syncUserToFirestore({
          uid: firebaseUid,
          email: newSession.user.email,
          displayName: newSession.user.displayName,
          role: 'investigator',
          authProvider: 'email-password',
        });
      }

      onSessionChange(newSession);
      setTab('session');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setError('');
    setInfoBanner('');
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const userEmail = cred.user.email || `${cred.user.uid}@google-auth.local`;
      const userName =
        cred.user.displayName || userEmail.split('@')[0] || 'Investigator';

      const { session: syncedSession } = await prooflensApi.syncFirebaseAuth({
        uid: cred.user.uid,
        email: userEmail,
        displayName: userName,
        provider: 'firebase-google',
      });
      setStoredSessionToken(syncedSession.token);

      await syncUserToFirestore({
        uid: cred.user.uid,
        email: syncedSession.user.email,
        displayName: syncedSession.user.displayName,
        role: 'investigator',
        authProvider: 'google',
      });

      onSessionChange(syncedSession);
      setTab('session');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Google Sign-In did not complete.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setSubmitting(true);
    setError('');
    try {
      await prooflensApi.logout();
      try {
        await firebaseSignOut(auth);
      } catch {
        // Non-fatal
      }
      setStoredSessionToken(null);
      onSessionChange(null);
      setTab('login');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full overflow-hidden shadow-xl">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0" />
            <div>
              <h2
                id="auth-modal-title"
                className="text-sm font-semibold text-slate-900"
              >
                Investigator Authentication & Session Security
              </h2>
              <p className="text-[11px] text-slate-500">
                PBKDF2-HMAC-SHA512 (100k iterations) + Firebase Auth & Firestore RBAC
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 px-5 gap-1">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setError('');
            }}
            className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              tab === 'login'
                ? 'border-blue-700 text-blue-700 bg-white font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setError('');
              if (email === 'demo@prooflens.local') {
                setEmail('');
                setPassword('');
              }
            }}
            className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              tab === 'register'
                ? 'border-blue-700 text-blue-700 bg-white font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register Account</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('session');
              setError('');
            }}
            className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              tab === 'session'
                ? 'border-blue-700 text-blue-700 bg-white font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Active Session {session ? '●' : ''}</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {infoBanner && (
            <div className="p-3 rounded border border-blue-200 bg-blue-50 text-xs text-blue-900 space-y-1">
              <div>{infoBanner}</div>
              <a
                href={`https://console.firebase.google.com/project/${firebaseProjectId}/authentication/providers`}
                target="_blank"
                rel="noreferrer"
                className="inline-block font-mono text-[11px] text-blue-700 underline"
              >
                Open Firebase Auth Providers ({firebaseProjectId})
              </a>
            </div>
          )}

          {error && (
            <div className="p-3 rounded border border-red-200 bg-red-50 text-xs text-red-800">
              {error}
            </div>
          )}

          {tab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="investigator@prooflens.in"
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password (min 8 chars)"
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                <div>
                  <span className="font-semibold text-slate-800">
                    Demo Reviewer:
                  </span>{' '}
                  <span className="font-mono">demo@prooflens.local</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('demo@prooflens.local');
                    setPassword('Investigator#2026');
                  }}
                  className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-800 cursor-pointer shrink-0"
                >
                  Fill Demo
                </button>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 rounded bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? 'Verifying Password Digest & Issuing Token...'
                    : 'Sign In with Email & Password'}
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGoogleSignIn}
                  className="w-full py-2 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 cursor-pointer"
                >
                  Continue with Google (Firebase Auth)
                </button>
              </div>
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-name"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Priya Nair"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-org"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Organization / Unit
                  </label>
                  <input
                    id="reg-org"
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="e.g. ProofLens India Underwriting"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-email"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Work Email Address
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya.nair@prooflens.in"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-password"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Password (minimum 8 characters)
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Strong password (hashed via PBKDF2-SHA512)"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded bg-white text-slate-900"
                />
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-2.5">
                Passwords are never stored in plaintext. The server generates a unique 128-bit cryptographic salt and derives a 512-bit key using <span className="font-mono">PBKDF2-HMAC-SHA512</span> (100,000 iterations) verified with constant-time <span className="font-mono">crypto.timingSafeEqual</span>.
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 rounded bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
              >
                {submitting
                  ? 'Deriving PBKDF2 Hash & Creating Account...'
                  : 'Create Account & Start Session'}
              </button>
            </form>
          )}

          {tab === 'session' && (
            <div className="space-y-4">
              {session ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded border border-emerald-200 bg-emerald-50/60 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        <span>Authenticated Investigator Session</span>
                      </div>
                      <div className="text-xs text-slate-900 font-medium">
                        {session.user.displayName} ({session.user.email})
                      </div>
                      <div className="text-[11px] font-mono text-slate-600">
                        Org: {session.user.organization} · Provider:{' '}
                        {session.user.authProvider}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleLogout}
                      className="px-3 py-1.5 rounded border border-red-200 bg-white hover:bg-red-50 text-xs font-medium text-red-700 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-2 text-xs font-mono">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">User ID:</span>
                      <span className="text-slate-800">{session.user.id}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Session Token:</span>
                      <span className="text-slate-800">
                        {session.token.slice(0, 18)}…
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Issued At:</span>
                      <span className="text-slate-800">
                        {session.createdAt.replace('T', ' ').slice(0, 19)} UTC
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Expires At:</span>
                      <span className="text-slate-800">
                        {session.expiresAt.replace('T', ' ').slice(0, 19)} UTC
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Password KDF:</span>
                      <span className="text-slate-800">
                        {session.user.passwordHashAlgo}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded space-y-2">
                  <div className="text-xs font-semibold text-slate-900">
                    No Active Investigator Session
                  </div>
                  <p className="text-xs text-slate-600">
                    Sign in with your email and password or register a new investigator account to attribute document uploads, folder organization, field edits, and audit trail actions to your identity.
                  </p>
                  <div className="pt-2 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTab('login')}
                      className="px-3 py-1.5 rounded bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 cursor-pointer"
                    >
                      Go to Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('register')}
                      className="px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      Register Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
