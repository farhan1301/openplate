import { useState } from 'react'
import { LogOut, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button, Row, Section, Sheet } from './ui'
import AgentAccessSheet from './AgentAccess'

// Email magic link works on every Supabase project with no extra setup.
// Google is optional: enable the provider in Supabase, then set
// VITE_ENABLE_GOOGLE_AUTH=true (see INSTALL.md).
const GOOGLE_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true'

const signInWithGoogle = () => supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: window.location.origin },
})

const sendMagicLink = (email) => supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: window.location.origin },
})

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function AuthScreen({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
      <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-[22px] bg-gradient-to-br from-orange to-pink text-[40px] shadow-float">🍽</span>
      <h1 className="text-[28px] font-bold tracking-[-0.02em] text-label">OpenPlate</h1>
      {children}
    </div>
  )
}

export function SignInScreen() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')

  const startGoogle = async () => {
    setBusy(true)
    setError('')
    const { error: signInError } = await signInWithGoogle()
    if (signInError) {
      setError(signInError.message)
      setBusy(false)
    }
  }

  const startEmail = async (event) => {
    event.preventDefault()
    const address = email.trim()
    if (!address) return
    setBusy(true)
    setError('')
    const { error: signInError } = await sendMagicLink(address)
    setBusy(false)
    if (signInError) setError(signInError.message)
    else setSentTo(address)
  }

  if (sentTo) {
    return (
      <AuthScreen>
        <p className="mt-1 max-w-xs text-[17px] text-label-2">
          Check <span className="font-medium text-label">{sentTo}</span> for a sign-in link, then open it on this device.
        </p>
        <Button variant="gray" className="mt-10 w-full max-w-xs" onClick={() => setSentTo('')}>Use a Different Email</Button>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen>
      <p className="mt-1 max-w-xs text-[17px] text-label-2">Your meals, pantry, groceries, nutrition and training, in one place your AI can use.</p>
      <form onSubmit={startEmail} className="mt-10 flex w-full max-w-xs flex-col gap-3">
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
          className="h-[50px] w-full rounded-[14px] bg-surface px-4 text-[17px] text-label shadow-card ring-1 ring-separator outline-none placeholder:text-label-3 focus:ring-2 focus:ring-tint"
        />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Sending…' : 'Email Me a Sign-in Link'}</Button>
      </form>
      {GOOGLE_ENABLED && (
        <button
          type="button"
          onClick={startGoogle}
          disabled={busy}
          className="mt-3 flex h-[50px] w-full max-w-xs items-center justify-center gap-2.5 rounded-[14px] bg-surface text-[17px] font-semibold text-label shadow-card ring-1 ring-separator transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <GoogleLogo /> Continue with Google
        </button>
      )}
      {error && <p className="mt-4 max-w-xs text-[15px] text-red">{error}</p>}
    </AuthScreen>
  )
}

export function NoAccessScreen({ email, onSignOut }) {
  return (
    <AuthScreen>
      <p className="mt-1 max-w-xs text-[17px] text-label-2">
        <span className="font-medium text-label">{email}</span> doesn’t have access to this app.
      </p>
      <Button variant="gray" className="mt-10 w-full max-w-xs" onClick={onSignOut}>Use a Different Account</Button>
    </AuthScreen>
  )
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <span className="flex h-16 w-16 animate-pulse items-center justify-center rounded-[18px] bg-gradient-to-br from-orange to-pink text-[32px]">🍽</span>
    </div>
  )
}

export function Avatar({ user, size = 32 }) {
  const url = user?.user_metadata?.avatar_url
  const initial = (user?.user_metadata?.full_name || user?.email || '?').charAt(0).toUpperCase()
  return url ? (
    <img src={url} alt="" referrerPolicy="no-referrer" style={{ width: size, height: size }} className="rounded-full object-cover" />
  ) : (
    <span style={{ width: size, height: size }} className="flex items-center justify-center rounded-full bg-tint text-[14px] font-semibold text-white">
      {initial}
    </span>
  )
}

export function AccountSheet({ user, onClose, onSignOut }) {
  const [aiOpen, setAiOpen] = useState(false)
  if (aiOpen) return <AgentAccessSheet onClose={() => setAiOpen(false)} />

  return (
    <Sheet open onClose={onClose} title="Account">
      <div className="mb-6 flex flex-col items-center pt-2 text-center">
        <Avatar user={user} size={72} />
        <p className="mt-3 text-[20px] font-semibold text-label">{user?.user_metadata?.full_name || 'Signed in'}</p>
        <p className="text-[15px] text-label-2">{user?.email}</p>
      </div>
      <Section>
        <Row
          leading={<span className="flex h-[29px] w-[29px] items-center justify-center rounded-[7px] bg-gradient-to-br from-tint to-pink text-white"><Sparkles size={17} /></span>}
          title="AI Access"
          subtitle="Connect your AI agents"
          onClick={() => setAiOpen(true)}
          chevron
        />
      </Section>
      <Section>
        <button type="button" onClick={onSignOut} className="flex h-11 w-full items-center justify-center gap-2 text-[17px] text-red hover:bg-fill">
          <LogOut size={18} /> Sign Out
        </button>
      </Section>
    </Sheet>
  )
}
