import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LogIn, User, Lock, Loader2, ChevronLeft } from 'lucide-react';
import { ADMIN_DEMO_EMAIL, ADMIN_DEMO_PASSWORD } from '../constants';
import { cn } from '../lib/utils';

type AuthMode = 'signin' | 'signup';

function getAuthErrorMessage(err: unknown, mode: AuthMode): string {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : '';
  const msg = err instanceof Error ? err.message : '';

  if (code === 'auth/admin-shortcut-disabled') {
    return 'Hard refresh (Ctrl+Shift+R) or redeploy, then sign in with admin@gmail.com / admin123.';
  }

  switch (code) {
    case 'auth/email-already-in-use':
    case 'auth/email-exists':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return mode === 'signup'
        ? 'Could not create account. Check your details or try Google.'
        : 'Wrong email or password. Create the user in Firebase Authentication, or use Google.';
    case 'auth/invalid-email':
      return 'Invalid email. Use admin@gmail.com for the built-in admin, or a full address like you@gmail.com.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a few minutes.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is turned off. In Firebase Console → Authentication → Sign-in method, enable Email/Password.';
    case 'auth/weak-password':
      return 'Password too weak for Firebase. Use at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/configuration-error':
      return msg || 'App configuration error. Check Firebase project settings.';
    case 'auth/unauthorized-domain':
      return 'This domain is not allowed to sign in. In Firebase Console → Authentication → Settings → Authorized domains, add your site host (e.g. your Cloud Run URL).';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before finishing.';
    case 'auth/popup-blocked':
      return 'The browser blocked the Google sign-in popup. Allow popups for this site and try again.';
    default:
      if (msg && !msg.startsWith('Firebase:')) return msg;
      return mode === 'signup'
        ? 'Sign-up failed. Try Google or a different email.'
        : 'Sign-in failed. Use Google or an email/password user that exists in Firebase Authentication.';
  }
}

const inputClass = (isRTL: boolean) =>
  cn(
    'w-full rounded-2xl border border-neutral-200 bg-neutral-50/80 py-3.5 text-[15px] text-catchy-dark outline-none transition-[border,box-shadow] placeholder:text-neutral-400 focus:border-catchy/40 focus:ring-2 focus:ring-catchy/15 disabled:cursor-not-allowed disabled:opacity-50',
    isRTL ? 'pr-11 pl-4' : 'pl-11 pr-4'
  );

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const { user, role, login, loginWithCredentials, signUpWithCredentials, loading, sessionResolving } = useAuth();
  const { t, isRTL } = useLanguage();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === 'signup';

  useEffect(() => {
    if (!loading && !sessionResolving && user && role !== null) {
      const fallback = role === 'admin' ? '/admin' : '/';
      const destination =
        returnTo && returnTo.startsWith('/') && !returnTo.startsWith('/admin') ? returnTo : fallback;
      navigate(destination, { replace: true });
    }
  }, [loading, sessionResolving, navigate, returnTo, role, user]);

  if (!loading && !sessionResolving && user && role !== null) {
    return null;
  }

  const authDisabled = submitting || sessionResolving;

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError('');
    setConfirmPassword('');
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSignUp) {
      if (!displayName.trim()) {
        setError(t('login.nameRequired'));
        return;
      }
      if (password.length < 6) {
        setError(t('login.passwordTooShort'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('login.passwordMismatch'));
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUpWithCredentials(email, password, displayName);
      } else {
        await loginWithCredentials(email, password);
      }
    } catch (err) {
      setError(getAuthErrorMessage(err, mode));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setSubmitting(true);
    try {
      await login();
    } catch (err) {
      setError(getAuthErrorMessage(err, mode));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="flex min-h-[70vh] flex-col items-center justify-center bg-gradient-to-b from-neutral-50 to-white px-4 py-14 md:py-20"
    >
      <div className="w-full max-w-[420px]">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-catchy-dark/55 transition-colors hover:text-catchy"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden />
          {t('login.backToStore')}
        </Link>

        <div className="rounded-3xl border border-neutral-200/90 bg-white p-8 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.12)] md:p-10">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-catchy text-lg font-bold text-white shadow-md shadow-catchy/25">
              C
            </div>
            <h1
              className={cn(
                'text-2xl font-semibold tracking-tight text-catchy-dark md:text-[1.65rem]',
                isRTL ? 'font-arabic' : 'font-serif'
              )}
            >
              {isSignUp ? t('login.signUpWelcome') : t('login.welcome')}
            </h1>
            <p className="mx-auto mt-2 max-w-[320px] text-[13px] leading-relaxed text-catchy-dark/55">
              {isSignUp ? t('login.signUpSubtitle') : t('login.subtitle')}
            </p>
          </div>

          {!isSignUp ? (
            <button
              type="button"
              disabled={authDisabled}
              onClick={() => {
                setEmail(ADMIN_DEMO_EMAIL);
                setPassword(ADMIN_DEMO_PASSWORD);
                setError('');
              }}
              className="mb-6 w-full rounded-2xl border border-catchy/25 bg-catchy/[0.06] py-3 text-[11px] font-semibold uppercase tracking-wider text-catchy-dark transition-colors hover:bg-catchy/[0.1] disabled:pointer-events-none disabled:opacity-40"
            >
              {t('login.fillAdmin')}
            </button>
          ) : null}

          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            {isSignUp ? (
              <div className="relative">
                <User
                  className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-neutral-400', isRTL ? 'right-4' : 'left-4')}
                  size={18}
                  strokeWidth={1.75}
                />
                <input
                  type="text"
                  autoComplete="name"
                  placeholder={t('login.namePlaceholder')}
                  value={displayName}
                  disabled={sessionResolving}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClass(isRTL)}
                />
              </div>
            ) : null}

            <div className="relative">
              <User
                className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-neutral-400', isRTL ? 'right-4' : 'left-4')}
                size={18}
                strokeWidth={1.75}
              />
              <input
                type="email"
                autoComplete={isSignUp ? 'email' : 'email'}
                placeholder={t('login.emailPlaceholder')}
                value={email}
                disabled={sessionResolving}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass(isRTL)}
              />
            </div>

            <div className="relative">
              <Lock
                className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-neutral-400', isRTL ? 'right-4' : 'left-4')}
                size={18}
                strokeWidth={1.75}
              />
              <input
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                disabled={sessionResolving}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass(isRTL)}
              />
            </div>

            {isSignUp ? (
              <div className="relative">
                <Lock
                  className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-neutral-400', isRTL ? 'right-4' : 'left-4')}
                  size={18}
                  strokeWidth={1.75}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('login.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  disabled={sessionResolving}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass(isRTL)}
                />
              </div>
            ) : null}

            {error ? (
              <p className="rounded-xl border border-red-100 bg-red-50/80 px-3 py-2.5 text-start text-[12px] font-medium leading-snug text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={authDisabled}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-catchy py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white shadow-lg shadow-catchy/20 transition hover:bg-catchy-dark disabled:pointer-events-none disabled:opacity-45"
            >
              {authDisabled ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
              <span>
                {submitting
                  ? isSignUp
                    ? t('login.signingUp')
                    : t('login.signingIn')
                  : sessionResolving
                    ? t('login.preparing')
                    : isSignUp
                      ? t('login.signUp')
                      : t('login.signIn')}
              </span>
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-100" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                {t('login.orContinue')}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={authDisabled}
            onClick={handleGoogleAuth}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white py-3.5 text-[13px] font-semibold text-catchy-dark transition hover:bg-neutral-50 disabled:pointer-events-none disabled:opacity-45"
          >
            {authDisabled ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-catchy" aria-hidden />
            ) : (
              <LogIn className="h-4 w-4 text-neutral-500" strokeWidth={1.75} />
            )}
            {isSignUp ? t('login.googleSignUp') : t('login.google')}
          </button>

          <p className={cn('mt-8 text-center text-[13px] text-catchy-dark/55', isRTL && 'font-arabic')}>
            {isSignUp ? t('login.switchToSignIn') : t('login.switchToSignUp')}{' '}
            <button
              type="button"
              onClick={() => switchMode(isSignUp ? 'signin' : 'signup')}
              className="font-semibold text-catchy underline-offset-2 hover:underline"
            >
              {isSignUp ? t('login.switchToSignInAction') : t('login.switchToSignUpAction')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
