import { useEffect, useRef, useState } from 'react'
import type { LoginEvent } from '@shared/types'

const MARKETPLACES: { key: string; label: string }[] = [
  { key: 'us', label: 'United States (.com)' },
  { key: 'uk', label: 'United Kingdom (.co.uk)' },
  { key: 'de', label: 'Germany (.de)' },
  { key: 'fr', label: 'France (.fr)' },
  { key: 'ca', label: 'Canada (.ca)' },
  { key: 'au', label: 'Australia (.com.au)' },
  { key: 'jp', label: 'Japan (.co.jp)' },
  { key: 'in', label: 'India (.in)' },
  { key: 'it', label: 'Italy (.it)' },
  { key: 'es', label: 'Spain (.es)' },
  { key: 'br', label: 'Brazil (.com.br)' }
]

interface Props {
  onAuthenticated: () => void | Promise<void>
}

export default function LoginView({ onAuthenticated }: Props): JSX.Element {
  const [marketplace, setMarketplace] = useState('us')
  const [username, setUsername] = useState('')
  const [preAmazon, setPreAmazon] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const onAuthRef = useRef(onAuthenticated)
  onAuthRef.current = onAuthenticated

  useEffect(() => {
    const off = window.audible.onLoginEvent((event: LoginEvent) => {
      if (event.type === 'status') {
        setStatusMsg(event.message)
      } else if (event.type === 'done') {
        if (event.success) {
          void onAuthRef.current()
        } else {
          setBusy(false)
          setStatusMsg(null)
          setError(event.error || 'Sign-in failed.')
        }
      }
    })
    return off
  }, [])

  const handleLogin = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!username.trim()) {
      setError('Please enter your Amazon email.')
      return
    }
    setError(null)
    setStatusMsg('Opening the Amazon sign-in window…')
    setBusy(true)
    window.audible.startExternalLogin({
      countryCode: marketplace,
      username: username.trim(),
      preAmazon
    })
  }

  const cancel = (): void => {
    window.audible.cancelLogin()
    setBusy(false)
    setStatusMsg(null)
  }

  return (
    <div className="login-view">
      <div className="login-card">
        <h1 className="login-title">
          Audible<span className="brand-accent"> Desktop</span>
        </h1>
        <p className="login-sub">
          An unofficial desktop player for the audiobooks you already own. Sign in with your
          Amazon account to load your library.
        </p>

        <form onSubmit={handleLogin} className="login-form">
          <label className="field-label" htmlFor="marketplace">
            Your Audible marketplace
          </label>
          <select
            id="marketplace"
            className="select"
            value={marketplace}
            onChange={(e) => setMarketplace(e.target.value)}
            disabled={busy}
          >
            {MARKETPLACES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="username">
            Amazon email
          </label>
          <input
            id="username"
            className="text-input"
            type="email"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            placeholder="you@example.com"
          />

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preAmazon}
              onChange={(e) => setPreAmazon(e.target.checked)}
              disabled={busy}
            />
            <span>This is a legacy Audible account (not linked to Amazon)</span>
          </label>

          <button className="primary-btn" type="submit" disabled={busy || !username.trim()}>
            {busy ? 'Waiting for sign-in…' : 'Sign in'}
          </button>
          {busy && (
            <button className="link-btn" type="button" onClick={cancel}>
              Cancel
            </button>
          )}

          <p className="login-hint">
            A secure Amazon sign-in window opens — log in there (Amazon handles any two-factor
            code or captcha). As soon as you finish, this app signs you in automatically. Your
            password is entered only on Amazon&apos;s own page, never here.
          </p>
        </form>

        {statusMsg && <div className="status-box">{statusMsg}</div>}
        {error && <div className="error-box">{error}</div>}

        <p className="login-note">
          This is an unofficial player for audiobooks you already own. Only the resulting device
          authorization is stored locally — never your Amazon password.
        </p>
      </div>
    </div>
  )
}
