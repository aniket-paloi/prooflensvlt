import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  setCachedGoogleAccessToken,
} from '../firebase';
import { prooflensApi, setStoredSessionToken } from '../api/client';
import type { AuthSessionPayload } from '../types/prooflens';

interface LoginPageViewProps {
  session: AuthSessionPayload | null;
  onSessionChange: (newSession: AuthSessionPayload | null) => void;
  onContinueToWorkspace: () => void;
  onBackToLanding?: () => void;
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
    if (auth.currentUser) {
      handleFirestoreError(err, OperationType.WRITE, userPath);
    }
  }
}

export function LoginPageView({
  session,
  onSessionChange,
  onContinueToWorkspace,
  onBackToLanding,
}: LoginPageViewProps) {
  const [tab, setTab] = useState<AuthTab>(session ? 'session' : 'login');
  const [email, setEmail] = useState<string>('aniket03a@gmail.com');
  const [password, setPassword] = useState<string>('Investigator#2026');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [displayName, setDisplayName] = useState<string>('Aniket Paloi');
  const [organization, setOrganization] = useState<string>(
    'ProofLens India Financial Forensics'
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [infoBanner, setInfoBanner] = useState<string>('');

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
            'Authenticated with PBKDF2-HMAC-SHA512 cryptographic session manager.'
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
            'Account registered with PBKDF2-HMAC-SHA512 (100,000 iterations + 128-bit cryptographic salt).'
          );
        }
      }

      const { session: newSession } = await prooflensApi.register({
        email: email.trim(),
        password,
        displayName:
          displayName.trim() || email.trim().split('@')[0] || 'Investigator',
        organization:
          organization.trim() || 'ProofLens India Financial Forensics',
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
      const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
      if (oauthCred?.accessToken) {
        setCachedGoogleAccessToken(oauthCred.accessToken);
      }

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
        err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed.'
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
      setCachedGoogleAccessToken(null);
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
      className="min-h-screen w-full relative flex items-center justify-center p-4 sm:p-6 bg-cover bg-center overflow-y-auto"
      style={{
        backgroundImage: `url('/assets/aistudio/image_dc4b4ad2.png')`,
        backgroundColor: '#6ba5e7',
      }}
    >
      {/* Subtle overlay for optimal frosted glass contrast */}
      <div className="absolute inset-0 bg-blue-900/10 backdrop-blur-[2px] pointer-events-none" />

      {/* Floating Glassmorphic Login Card (Exact match to Image 1) */}
      <div className="relative z-10 w-full max-w-[440px] my-8 rounded-[36px] bg-white/75 backdrop-blur-2xl border border-white/80 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] p-8 sm:p-10 transition-all text-center">
        {/* Top Mascot / Logo Badge */}
        <div className="mx-auto w-14 h-14 rounded-full bg-white shadow-sm border border-white flex items-center justify-center p-1">
          <div className="w-full h-full rounded-full bg-black flex items-center justify-center p-2 shadow-inner overflow-hidden">
            <img
              src="/assets/aistudio/image_d1982cd2.png"
              alt="ProofLens Logo"
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Title & Subtitle */}
        <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight mt-4">
          {tab === 'session'
            ? 'Active Session'
            : tab === 'register'
            ? 'Create Account'
            : 'Welcome back'}
        </h1>
        <p className="text-xs text-slate-500 mt-1 mb-6">
          {tab === 'session'
            ? 'Your investigator session is verified and active.'
            : tab === 'register'
            ? 'Register to authenticate evidence actions & PDF exports.'
            : 'Please enter your detail to sign in.'}
        </p>

        {/* Error / Info alerts */}
        {error && (
          <div className="mb-4 p-2.5 rounded-xl border border-red-200 bg-red-50/90 text-xs text-red-800 text-left">
            {error}
          </div>
        )}
        {infoBanner && (
          <div className="mb-4 p-2.5 rounded-xl border border-blue-200 bg-blue-50/90 text-xs text-blue-900 text-left">
            {infoBanner}
          </div>
        )}

        {tab === 'login' && (
          <>
            {/* 3 Social Buttons Row (Apple, Google, LinkedIn) */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {/* Apple Button */}
              <button
                type="button"
                onClick={() =>
                  setError('Apple Sign-In is for iOS Native. Please use Google or Email.')
                }
                className="py-2 px-3 rounded-xl border border-slate-300/80 bg-white/70 hover:bg-white hover:border-slate-400 transition-all flex items-center justify-center cursor-pointer shadow-2xs group"
                title="Sign in with Apple"
              >
                <svg
                  className="w-4 h-4 text-slate-900 group-hover:scale-110 transition-transform"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.84c.64-.78 1.08-1.86.96-2.94-.93.04-2.05.62-2.71 1.4-.58.67-1.09 1.77-.95 2.83 1.04.08 2.08-.52 2.7-1.29z" />
                </svg>
              </button>

              {/* Google Button (Real Firebase Auth) */}
              <button
                type="button"
                disabled={submitting}
                onClick={handleGoogleSignIn}
                className="py-2 px-3 rounded-xl border border-slate-300/80 bg-white/70 hover:bg-white hover:border-slate-400 transition-all flex items-center justify-center cursor-pointer shadow-2xs group"
                title="Sign in with Google (Firebase Auth)"
              >
                <svg
                  className="w-4 h-4 group-hover:scale-110 transition-transform"
                  viewBox="0 0 24 24"
                >
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
              </button>

              {/* LinkedIn Button */}
              <button
                type="button"
                onClick={() =>
                  setError('LinkedIn Sign-In is configured via OAuth. Use Google or Email.')
                }
                className="py-2 px-3 rounded-xl border border-slate-300/80 bg-white/70 hover:bg-white hover:border-slate-400 transition-all flex items-center justify-center cursor-pointer shadow-2xs group"
                title="Sign in with LinkedIn"
              >
                <svg
                  className="w-4 h-4 text-[#0A66C2] group-hover:scale-110 transition-transform"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.5 1.5 0 0 0 0-3 1.5 1.5 0 0 0 0 3m1.4 9.74v-8.37H5.06v8.37h2.8z" />
                </svg>
              </button>
            </div>

            {/* Horizontal Line with "OR" */}
            <div className="relative flex py-2 items-center mb-5">
              <div className="flex-grow border-t border-slate-300/80" />
              <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                OR
              </span>
              <div className="flex-grow border-t border-slate-300/80" />
            </div>

            {/* Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-slate-800 mb-1.5"
                >
                  E-Mail Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300/80 bg-white/80 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/30 transition-all"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-800 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password@123"
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300/80 bg-white/80 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/30 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember me & Forgot password row */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                  />
                  <span>Remember me</span>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    setError(
                      'Default seeded account password is "Investigator#2026". You can reset password by registering a new account.'
                    )
                  }
                  className="text-slate-600 hover:text-slate-900 underline underline-offset-2 cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>

              {/* Black Pill Sign in Button (Matching Image 1) */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 mt-2 rounded-full bg-[#1c1d21] hover:bg-black text-white text-xs font-bold tracking-wide shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>

              {/* Switch to Sign up */}
              <div className="text-center pt-2 text-xs text-slate-600">
                Don&apos;t have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setTab('register');
                    setError('');
                  }}
                  className="font-semibold text-slate-900 hover:underline cursor-pointer"
                >
                  Sign up
                </button>
              </div>

              {/* Quick Demo Autofill Pill */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('aniket03a@gmail.com');
                    setPassword('Investigator#2026');
                  }}
                  className="px-3 py-1 rounded-full border border-slate-300/80 bg-white/60 hover:bg-white text-[11px] font-mono text-slate-600 cursor-pointer"
                >
                  Fill Demo (aniket03a@gmail.com)
                </button>
              </div>
            </form>
          </>
        )}

        {tab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-left">
            <div>
              <label
                htmlFor="reg-name"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Aniket Paloi"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300/80 bg-white/80 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="reg-org"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Organization / Team
              </label>
              <input
                id="reg-org"
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="ProofLens India Forensics"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300/80 bg-white/80 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="reg-email"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Work E-Mail Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="investigator@prooflens.in"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300/80 bg-white/80 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="reg-password"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Password (min. 8 characters)
              </label>
              <input
                id="reg-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password@123"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300/80 bg-white/80 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 mt-2 rounded-full bg-[#1c1d21] hover:bg-black text-white text-xs font-bold tracking-wide shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Create Account'}
            </button>

            <div className="text-center pt-2 text-xs text-slate-600">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError('');
                }}
                className="font-semibold text-slate-900 hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </div>
          </form>
        )}

        {tab === 'session' && (
          <div className="space-y-4 text-left">
            {session ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-white/90 border border-slate-200/90 shadow-2xs space-y-2">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Investigator Session Active</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    {session.user.displayName}
                  </div>
                  <div className="text-xs text-slate-600">
                    {session.user.email}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100">
                    {session.user.organization} · {session.user.authProvider}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onContinueToWorkspace}
                  className="w-full py-3.5 rounded-full bg-[#1c1d21] hover:bg-black text-white text-xs font-bold tracking-wide shadow-md transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Continue to Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setTab('login')}
                    className="text-xs text-slate-600 hover:text-slate-900 underline cursor-pointer"
                  >
                    Switch Account
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleLogout}
                    className="text-xs font-semibold text-red-700 hover:text-red-800 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 space-y-3">
                <p className="text-xs text-slate-600">
                  No active session found.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('login')}
                  className="px-5 py-2.5 rounded-full bg-black text-white text-xs font-bold cursor-pointer"
                >
                  Go to Sign In
                </button>
              </div>
            )}
          </div>
        )}

        {/* Navigation & Return Links */}
        <div className="pt-6 mt-6 border-t border-slate-200/80 flex items-center justify-between">
          {onBackToLanding && (
            <button
              type="button"
              onClick={onBackToLanding}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </button>
          )}
          {session ? (
            <button
              type="button"
              onClick={onContinueToWorkspace}
              className="text-xs font-semibold text-slate-900 hover:text-black inline-flex items-center gap-1 cursor-pointer ml-auto"
            >
              <span>Go to Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 ml-auto">
              Sovereign Evidence Companion
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
