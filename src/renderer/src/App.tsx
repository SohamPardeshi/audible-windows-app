import { useCallback, useEffect, useState } from 'react'
import type { AuthStatus } from '@shared/types'
import LoginView from './components/LoginView'
import LibraryView from './components/LibraryView'
import Player from './components/Player'

export default function App(): JSX.Element {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [playingAsin, setPlayingAsin] = useState<string | null>(null)
  const [playerMinimized, setPlayerMinimized] = useState(false)

  const refreshStatus = useCallback(async () => {
    const s = await window.audible.getAuthStatus()
    setStatus(s)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const playBook = useCallback((asin: string) => {
    setPlayingAsin(asin)
    setPlayerMinimized(false)
  }, [])

  const closePlayer = useCallback(() => {
    setPlayingAsin(null)
    setPlayerMinimized(false)
  }, [])

  const handleBookDeleted = useCallback((asin: string) => {
    // If the book being deleted is the one currently playing, stop playback
    // so the player doesn't keep streaming a file that's gone.
    setPlayingAsin((current) => {
      if (current === asin) {
        setPlayerMinimized(false)
        return null
      }
      return current
    })
  }, [])

  const handleLogout = useCallback(async () => {
    await window.audible.logout()
    closePlayer()
    await refreshStatus()
  }, [refreshStatus, closePlayer])

  if (loading) {
    return (
      <div className="app-center">
        <div className="spinner" />
      </div>
    )
  }

  if (!status?.authenticated) {
    return <LoginView onAuthenticated={refreshStatus} />
  }

  return (
    <div className={`app-shell${playingAsin && playerMinimized ? ' has-mini-player' : ''}`}>
      <header className="app-header">
        <div className="brand">
          Audible<span className="brand-accent"> Desktop</span>
        </div>
        <div className="header-right">
          {status.customerName && <span className="greeting">Hi, {status.customerName}</span>}
          <button className="ghost-btn" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <LibraryView
          onPlay={playBook}
          onDeleted={handleBookDeleted}
          playingAsin={playingAsin ?? undefined}
        />
      </main>
      {playingAsin && (
        <Player
          asin={playingAsin}
          minimized={playerMinimized}
          onMinimize={() => setPlayerMinimized(true)}
          onExpand={() => setPlayerMinimized(false)}
          onClose={closePlayer}
        />
      )}
    </div>
  )
}
