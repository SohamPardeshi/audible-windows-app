import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Chapter, MediaInfo } from '@shared/types'
import {
  SkipBack30Icon,
  SkipForward30Icon,
  PlayIcon,
  PauseIcon,
  PrevChapterIcon,
  NextChapterIcon
} from './PlayerIcons'

interface Props {
  asin: string
  minimized: boolean
  onMinimize: () => void
  onExpand: () => void
  onClose: () => void
}

const SKIP_SECONDS = 30

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Playback speed is remembered per book (and the last value used becomes the
// default for new books) so resuming from "Continue listening" keeps your pace.
const RATE_CACHE_KEY = 'audible:playback-rates'
const LAST_RATE_KEY = 'audible:last-rate'

function readRateCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RATE_CACHE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function getSavedRate(asin: string): number {
  const cache = readRateCache()
  const raw = typeof cache[asin] === 'number' ? cache[asin] : Number(localStorage.getItem(LAST_RATE_KEY))
  const value = Number.isFinite(raw) && raw > 0 ? raw : 1
  // Clamp into the supported range in case an older, wider range was saved.
  return Math.min(2, Math.max(0.5, value))
}

function saveRate(asin: string, rate: number): void {
  try {
    const cache = readRateCache()
    cache[asin] = rate
    localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(cache))
    localStorage.setItem(LAST_RATE_KEY, String(rate))
  } catch {
    // localStorage may be unavailable; speed just won't persist.
  }
}

export default function Player({
  asin,
  minimized,
  onMinimize,
  onExpand,
  onClose
}: Props): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showChapters, setShowChapters] = useState(false)
  const [rate, setRate] = useState(() => getSavedRate(asin))
  const lastSavedRef = useRef(0)
  const resumeRef = useRef(0)
  const resumedRef = useRef(false)

  // Load media info + the saved position. The position is applied once the
  // audio element reports its metadata (see onLoadedMetadata).
  useEffect(() => {
    let cancelled = false
    setInfo(null)
    setError(null)
    resumedRef.current = false
    resumeRef.current = 0
    lastSavedRef.current = 0
    // Restore the speed this book was last played at (or the last-used speed).
    setRate(getSavedRate(asin))
    ;(async () => {
      try {
        // Load the media info and the saved position together, and apply the
        // resume offset *before* setting info (which mounts the audio source).
        // Otherwise onLoadedMetadata can fire before the position resolves and
        // playback would start from the beginning.
        const [media, pos] = await Promise.all([
          window.audible.getMediaInfo(asin),
          window.audible.getPosition(asin)
        ])
        if (cancelled) return
        if (pos) {
          resumeRef.current = pos.positionSec
          setCurrent(pos.positionSec)
        }
        setInfo(media)
        if (media.durationSec) setDuration(media.durationSec)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open audio.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [asin])

  const persistPosition = useCallback(
    (sec: number) => {
      // Throttle writes to roughly once every 5 seconds of playback.
      if (Math.abs(sec - lastSavedRef.current) < 5) return
      lastSavedRef.current = sec
      void window.audible.setPosition(asin, sec)
    },
    [asin]
  )

  // Save position on unmount.
  useEffect(() => {
    return () => {
      const el = audioRef.current
      if (el && Number.isFinite(el.currentTime)) {
        void window.audible.setPosition(asin, el.currentTime)
      }
    }
  }, [asin])

  const onTimeUpdate = (): void => {
    const el = audioRef.current
    if (!el) return
    setCurrent(el.currentTime)
    persistPosition(el.currentTime)
  }

  const onLoadedMetadata = (): void => {
    const el = audioRef.current
    if (!el) return
    if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration)
    // Preserve the chosen playback speed across track/source changes.
    el.playbackRate = rate
    // Apply the saved resume position once, then start playing.
    if (!resumedRef.current) {
      resumedRef.current = true
      if (resumeRef.current > 0 && resumeRef.current < el.duration) {
        el.currentTime = resumeRef.current
      }
      void el.play().catch(() => {
        // Autoplay may be blocked; the user can press play manually.
      })
    }
  }

  const togglePlay = (): void => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  const seekTo = (sec: number): void => {
    const el = audioRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(sec, duration || el.duration || sec))
    el.currentTime = clamped
    setCurrent(clamped)
  }

  const skip = (delta: number): void => {
    const el = audioRef.current
    if (!el) return
    seekTo(el.currentTime + delta)
  }

  const changeRate = (value: number): void => {
    const next = Math.min(2, Math.max(0.5, value))
    setRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
    saveRate(asin, next)
  }

  // Dispatch for hardware media keys (forwarded from main) and the OS
  // mediaSession overlay. Uses the audio element directly so it never goes
  // stale, and works the same whether the player is full-screen or minimized.
  const mediaAction = useCallback(
    (action: string): void => {
      const el = audioRef.current
      if (!el) return
      switch (action) {
        case 'play':
          void el.play()
          break
        case 'pause':
          el.pause()
          break
        case 'playpause':
          if (el.paused) void el.play()
          else el.pause()
          break
        case 'next':
        case 'seekforward': {
          const max = el.duration || el.currentTime + SKIP_SECONDS
          el.currentTime = Math.min(el.currentTime + SKIP_SECONDS, max)
          setCurrent(el.currentTime)
          break
        }
        case 'previous':
        case 'seekbackward':
          el.currentTime = Math.max(el.currentTime - SKIP_SECONDS, 0)
          setCurrent(el.currentTime)
          break
        case 'stop':
          onClose()
          break
      }
    },
    [onClose]
  )

  // Subscribe to hardware media keys forwarded from the main process. These
  // fire regardless of which window is focused, so they work even when the
  // player is minimized.
  useEffect(() => window.audible.onMediaKey(mediaAction), [mediaAction])

  const chapters: Chapter[] = info?.chapters ?? []
  const currentChapterIndex = useMemo(() => {
    if (!chapters.length) return -1
    let idx = 0
    for (let i = 0; i < chapters.length; i++) {
      if (current >= chapters[i].startSec) idx = i
      else break
    }
    return idx
  }, [chapters, current])

  const currentChapter = currentChapterIndex >= 0 ? chapters[currentChapterIndex] : null

  // Wire up the OS media overlay (Windows media controls, lock-screen, etc.):
  // metadata + action handlers so play/pause/skip keys map to the player.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (info) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: info.title,
        artist: info.authors.join(', '),
        album: currentChapter?.title ?? '',
        artwork: info.coverUrl
          ? [{ src: info.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
          : []
      })
    }
    navigator.mediaSession.setActionHandler('play', () => mediaAction('play'))
    navigator.mediaSession.setActionHandler('pause', () => mediaAction('pause'))
    navigator.mediaSession.setActionHandler('seekbackward', () => mediaAction('seekbackward'))
    navigator.mediaSession.setActionHandler('seekforward', () => mediaAction('seekforward'))
    navigator.mediaSession.setActionHandler('previoustrack', () => mediaAction('previous'))
    navigator.mediaSession.setActionHandler('nexttrack', () => mediaAction('next'))
  }, [info, currentChapter, mediaAction])

  // Keep the OS overlay's play/pause state in sync.
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    }
  }, [playing])

  // Boundaries of the current chapter. The scrubber works within these so it
  // reflects progress through the chapter rather than the whole book.
  const chapterStart = currentChapter ? currentChapter.startSec : 0
  const chapterEnd = currentChapter
    ? currentChapter.lengthSec > 0
      ? currentChapter.startSec + currentChapter.lengthSec
      : chapters[currentChapterIndex + 1]?.startSec ?? (duration || current)
    : duration || 0
  const chapterDuration = Math.max(0, chapterEnd - chapterStart)
  const chapterElapsed = Math.max(0, Math.min(current - chapterStart, chapterDuration))

  const goToChapter = (index: number): void => {
    if (index < 0 || index >= chapters.length) return
    seekTo(chapters[index].startSec)
  }

  const audio = (
    <audio
      ref={audioRef}
      src={info?.src}
      onTimeUpdate={onTimeUpdate}
      onLoadedMetadata={onLoadedMetadata}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onError={() => setError('Playback error — the audio file could not be read.')}
    />
  )

  // Overall progress as a fraction, used by the mini-player's slim bar.
  const overallFraction = duration > 0 ? Math.min(current / duration, 1) : 0

  if (minimized) {
    return (
      <>
        {audio}
        <div className="mini-player">
        <button
          className="mini-open"
          onClick={onExpand}
          title="Open player"
          aria-label="Open player"
        >
          {info?.coverUrl && (
            <img className="mini-cover" src={info.coverUrl} alt={info.title} />
          )}
          <div className="mini-text">
            <div className="mini-title">{info?.title ?? 'Loading…'}</div>
            <div className="mini-sub">
              {currentChapter ? currentChapter.title : info?.authors.join(', ')}
            </div>
          </div>
        </button>

        <div className="mini-controls">
          <button
            className="transport-btn small-tb"
            onClick={() => skip(-SKIP_SECONDS)}
            title="Back 30 seconds"
            aria-label="Back 30 seconds"
          >
            <SkipBack30Icon className="transport-icon skip-mini" />
          </button>
          <button
            className="transport-btn play small-tb"
            onClick={togglePlay}
            disabled={!info}
            title={playing ? 'Pause' : 'Play'}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <PauseIcon className="transport-icon" />
            ) : (
              <PlayIcon className="transport-icon" />
            )}
          </button>
          <button
            className="transport-btn small-tb"
            onClick={() => skip(SKIP_SECONDS)}
            title="Forward 30 seconds"
            aria-label="Forward 30 seconds"
          >
            <SkipForward30Icon className="transport-icon skip-mini" />
          </button>
        </div>

        <div className="mini-time">
          {formatTime(current)} / {formatTime(duration)}
        </div>

        <button
          className="mini-close"
          onClick={onClose}
          title="Stop and close"
          aria-label="Stop and close"
        >
          ×
        </button>

        <div className="mini-progress">
          <div className="mini-progress-fill" style={{ width: `${overallFraction * 100}%` }} />
        </div>
        </div>
      </>
    )
  }

  return (
    <>
      {audio}
      <div className="player-fs">

      <header className="player-fs-top">
        <button
          className="player-fs-back"
          onClick={onMinimize}
          title="Back to library"
          aria-label="Back to library"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="player-fs-top-right">
          <div className="speed-control" title="Playback speed">
            <span className="speed-icon">⏩</span>
            <input
              className="speed-slider"
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={rate}
              onChange={(e) => changeRate(Number(e.target.value))}
              aria-label="Playback speed"
            />
            <span className="speed-value">{rate.toFixed(2).replace(/\.?0+$/, '')}×</span>
          </div>
          {chapters.length > 0 && (
            <button
              className={`ghost-btn small${showChapters ? ' active' : ''}`}
              onClick={() => setShowChapters((v) => !v)}
              title="Chapters"
            >
              ☰ Chapters
            </button>
          )}
          <button className="ghost-btn small" onClick={onClose} title="Stop and close">
            ✕ Stop
          </button>
        </div>
      </header>

      <div className="player-fs-body">
        <div className="player-fs-stage">
          {info?.coverUrl && (
            <img className="player-fs-cover" src={info.coverUrl} alt={info.title} />
          )}
          <div className="player-fs-meta">
            <div className="player-fs-title">{info?.title ?? 'Loading…'}</div>
            <div className="player-fs-author">{info?.authors.join(', ')}</div>
          </div>

          {currentChapter && (
            <div className="player-fs-chapter">
              <div className="player-fs-chapter-name">{currentChapter.title}</div>
              <div className="player-fs-chapter-count">
                Chapter {currentChapterIndex + 1} of {chapters.length}
              </div>
            </div>
          )}

          <div className="player-fs-scrubber">
            <span className="time">{formatTime(chapterElapsed)}</span>
            <input
              className="seek"
              type="range"
              min={chapterStart}
              max={chapterEnd || chapterStart + 1}
              step={1}
              value={Math.min(Math.max(current, chapterStart), chapterEnd || chapterStart)}
              onChange={(e) => seekTo(Number(e.target.value))}
            />
            <span className="time">-{formatTime(chapterDuration - chapterElapsed)}</span>
          </div>

          <div className="player-fs-overall">
            {formatTime(current)} / {formatTime(duration)}
          </div>

          <div className="player-fs-controls">
            <button
              className="transport-btn"
              onClick={() => goToChapter(currentChapterIndex - 1)}
              disabled={currentChapterIndex <= 0}
              title="Previous chapter"
              aria-label="Previous chapter"
            >
              <PrevChapterIcon className="transport-icon" />
            </button>
            <button
              className="transport-btn"
              onClick={() => skip(-SKIP_SECONDS)}
              title="Back 30 seconds"
              aria-label="Back 30 seconds"
            >
              <SkipBack30Icon className="transport-icon skip" />
            </button>
            <button
              className="transport-btn play"
              onClick={togglePlay}
              disabled={!info}
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <PauseIcon className="transport-icon" />
              ) : (
                <PlayIcon className="transport-icon" />
              )}
            </button>
            <button
              className="transport-btn"
              onClick={() => skip(SKIP_SECONDS)}
              title="Forward 30 seconds"
              aria-label="Forward 30 seconds"
            >
              <SkipForward30Icon className="transport-icon skip" />
            </button>
            <button
              className="transport-btn"
              onClick={() => goToChapter(currentChapterIndex + 1)}
              disabled={currentChapterIndex < 0 || currentChapterIndex >= chapters.length - 1}
              title="Next chapter"
              aria-label="Next chapter"
            >
              <NextChapterIcon className="transport-icon" />
            </button>
          </div>

          {error && <div className="player-error">{error}</div>}
        </div>

        {showChapters && chapters.length > 0 && (
          <aside className="player-fs-chapters">
            <div className="chapter-panel-head">
              <span>Chapters</span>
              <button className="link-btn" onClick={() => setShowChapters(false)}>
                Close
              </button>
            </div>
            <ul className="chapter-list">
              {chapters.map((ch, i) => (
                <li key={i}>
                  <button
                    className={`chapter-item${i === currentChapterIndex ? ' active' : ''}`}
                    onClick={() => seekTo(ch.startSec)}
                  >
                    <span className="chapter-name">{ch.title}</span>
                    <span className="chapter-time">{formatTime(ch.startSec)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
    </>
  )
}
