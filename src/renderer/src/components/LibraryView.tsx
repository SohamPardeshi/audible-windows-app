import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DownloadEvent,
  DownloadState,
  LibraryBook,
  LocalBook,
  PlaybackPosition
} from '@shared/types'

interface Props {
  onPlay: (asin: string) => void
  onDeleted?: (asin: string) => void
  playingAsin?: string
}

type Tab = 'all' | 'downloaded'

type SortKey = 'purchased' | 'title' | 'author' | 'released'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'purchased', label: 'Recently added' },
  { key: 'released', label: 'Release date' },
  { key: 'title', label: 'Title (A–Z)' },
  { key: 'author', label: 'Author (A–Z)' }
]

// Parse a date-ish string into a sortable timestamp; unknown/missing dates sort
// last (oldest).
function dateValue(value?: string): number {
  if (!value) return -Infinity
  const t = Date.parse(value)
  return Number.isNaN(t) ? -Infinity : t
}

interface DownloadStatus {
  state: DownloadState
  percent?: number
}

function formatRuntime(min?: number): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatRemaining(positionSec: number, durationSec?: number): string {
  if (!durationSec || durationSec <= positionSec) return ''
  const left = Math.round((durationSec - positionSec) / 60)
  if (left < 60) return `${left}m left`
  const h = Math.floor(left / 60)
  const m = left % 60
  return m > 0 ? `${h}h ${m}m left` : `${h}h left`
}

const LIBRARY_CACHE_KEY = 'audible:library-cache'

function readCachedLibrary(): LibraryBook[] | null {
  try {
    const raw = localStorage.getItem(LIBRARY_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LibraryBook[]
    return Array.isArray(parsed) && parsed.length ? parsed : null
  } catch {
    return null
  }
}

function writeCachedLibrary(books: LibraryBook[]): void {
  try {
    localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(books))
  } catch {
    // Storage may be unavailable or over quota; caching is best-effort.
  }
}

export default function LibraryView({ onPlay, onDeleted, playingAsin }: Props): JSX.Element {
  const [books, setBooks] = useState<LibraryBook[]>([])
  const [local, setLocal] = useState<Record<string, LocalBook>>({})
  const [downloads, setDownloads] = useState<Record<string, DownloadStatus>>({})
  const [positions, setPositions] = useState<Record<string, PlaybackPosition>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [sort, setSort] = useState<SortKey>('purchased')
  const loadedRef = useRef(false)

  const refreshLocal = useCallback(async () => {
    const list = await window.audible.listDownloads()
    const map: Record<string, LocalBook> = {}
    for (const b of list) map[b.asin] = b
    setLocal(map)
    return list
  }, [])

  const refreshPositions = useCallback(async () => {
    const map = await window.audible.listPositions()
    setPositions(map)
  }, [])

  // Pull Audible's server-side positions for downloaded books so the "Continue
  // listening" row and remaining-time badges are accurate without having to open
  // each book first. Best-effort: failures leave the local positions in place.
  const syncServerPositions = useCallback(async (asins: string[]) => {
    if (asins.length === 0) return
    try {
      const map = await window.audible.syncLibraryPositions(asins)
      setPositions(map)
    } catch {
      // Ignore — local positions stay as they are.
    }
  }, [])

  // Load the library with a stale-while-revalidate strategy: show the cached
  // copy instantly (if any), then fetch fresh in the background and update the
  // cache. A network failure keeps the cached list visible rather than blanking.
  const loadLibrary = useCallback(async () => {
    const cached = readCachedLibrary()
    if (cached) {
      setBooks(cached)
      setLoading(false)
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const [lib, localList] = await Promise.all([
        window.audible.fetchLibrary(),
        refreshLocal(),
        refreshPositions()
      ])
      setBooks(lib)
      writeCachedLibrary(lib)
      // Reconcile downloaded books' positions with Audible's servers so progress
      // is accurate even for titles started on another device.
      void syncServerPositions(localList.filter((b) => b.state === 'ready').map((b) => b.asin))
    } catch (err) {
      // Only surface the error if there's nothing cached to fall back on.
      if (!cached) {
        setError(err instanceof Error ? err.message : 'Failed to load library.')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [refreshLocal, refreshPositions, syncServerPositions])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void loadLibrary()
  }, [loadLibrary])

  // Keep the "Continue listening" row fresh: re-read saved positions whenever
  // the active book changes (play start / stop) and after the initial load.
  useEffect(() => {
    void refreshPositions()
  }, [playingAsin, refreshPositions])

  useEffect(() => {
    const off = window.audible.onDownloadEvent((event: DownloadEvent) => {
      if (event.type === 'progress') {
        setDownloads((prev) => ({
          ...prev,
          [event.asin]: { state: event.state, percent: event.percent }
        }))
      } else if (event.type === 'done') {
        setDownloads((prev) => {
          const next = { ...prev }
          delete next[event.asin]
          return next
        })
        setLocal((prev) => ({ ...prev, [event.asin]: event.book }))
        // The download flow pulls Audible's saved position; reflect it so a book
        // started on another device shows correct progress and resumes properly.
        void refreshPositions()
      } else if (event.type === 'error') {
        setDownloads((prev) => {
          const next = { ...prev }
          delete next[event.asin]
          return next
        })
        setError(event.error)
      }
    })
    return off
  }, [refreshPositions])

  const handleDownload = (book: LibraryBook): void => {
    setError(null)
    setDownloads((prev) => ({ ...prev, [book.asin]: { state: 'downloading', percent: 0 } }))
    window.audible.startDownload(book)
  }

  const handleDelete = async (asin: string): Promise<void> => {
    // Stop playback first so the player isn't left streaming a file we're
    // about to remove from disk.
    onDeleted?.(asin)
    await window.audible.deleteDownload(asin)
    setLocal((prev) => {
      const next = { ...prev }
      delete next[asin]
      return next
    })
    setPositions((prev) => {
      const next = { ...prev }
      delete next[asin]
      return next
    })
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matched = books.filter((b) => {
      if (tab === 'downloaded' && local[b.asin]?.state !== 'ready') return false
      if (!q) return true
      return (
        b.title.toLowerCase().includes(q) ||
        b.authors.some((a) => a.name.toLowerCase().includes(q)) ||
        b.narrators.some((n) => n.toLowerCase().includes(q))
      )
    })

    const byTitle = (b: LibraryBook): string => b.title.toLowerCase()
    const byAuthor = (b: LibraryBook): string =>
      (b.authors[0]?.name ?? '').toLowerCase()

    const sorted = [...matched]
    switch (sort) {
      case 'purchased':
        sorted.sort((a, b) => dateValue(b.purchaseDate) - dateValue(a.purchaseDate))
        break
      case 'released':
        sorted.sort((a, b) => dateValue(b.releaseDate) - dateValue(a.releaseDate))
        break
      case 'title':
        sorted.sort((a, b) => byTitle(a).localeCompare(byTitle(b)))
        break
      case 'author':
        sorted.sort((a, b) => byAuthor(a).localeCompare(byAuthor(b)) || byTitle(a).localeCompare(byTitle(b)))
        break
    }
    return sorted
  }, [books, local, search, tab, sort])

  const downloadedCount = useMemo(
    () => Object.values(local).filter((b) => b.state === 'ready').length,
    [local]
  )

  const booksByAsin = useMemo(() => {
    const map: Record<string, LibraryBook> = {}
    for (const b of books) map[b.asin] = b
    return map
  }, [books])

  // "Continue listening": downloaded, ready books that have a saved position
  // and aren't essentially finished, most recently played first.
  const continueListening = useMemo(() => {
    return Object.values(positions)
      .filter((p) => {
        const lb = local[p.asin]
        if (!lb || lb.state !== 'ready') return false
        if (p.positionSec < 5) return false
        const dur = lb.durationSec
        if (dur && p.positionSec > dur - 30) return false
        return true
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
      .map((p) => ({ pos: p, book: booksByAsin[p.asin], localBook: local[p.asin] }))
  }, [positions, local, booksByAsin])

  const showContinue = continueListening.length > 0 && tab === 'all' && !search.trim()

  return (
    <div className="library">
      <div className="library-toolbar">
        <div className="tabs">
          <button
            className={`tab${tab === 'all' ? ' active' : ''}`}
            onClick={() => setTab('all')}
          >
            All titles ({books.length})
          </button>
          <button
            className={`tab${tab === 'downloaded' ? ' active' : ''}`}
            onClick={() => setTab('downloaded')}
          >
            Downloaded ({downloadedCount})
          </button>
        </div>
        <div className="search-wrap">
          <input
            className="search-input"
            placeholder="Search title, author, narrator…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="search-clear"
              onClick={() => setSearch('')}
              title="Clear search"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <select
          className="sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          title="Sort library"
          aria-label="Sort library"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              Sort: {o.label}
            </option>
          ))}
        </select>
        {refreshing && <span className="refresh-pill">Updating…</span>}
      </div>

      {error && (
        <div className="error-box">
          <span className="error-text">{error}</span>
          <div className="error-actions">
            <button className="ghost-btn small" onClick={() => void loadLibrary()}>
              Try again
            </button>
            <button
              className="error-dismiss"
              onClick={() => setError(null)}
              title="Dismiss"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showContinue && (
        <section className="continue-section">
          <h2 className="continue-heading">Continue listening</h2>
          <div className="continue-row">
            {continueListening.map(({ pos, book, localBook }) => {
              const title = book?.title ?? localBook?.title ?? 'Unknown title'
              const author =
                book?.authors.map((a) => a.name).join(', ') ??
                localBook?.authors.join(', ') ??
                ''
              const cover = book?.coverUrl ?? localBook?.coverUrl
              const dur = localBook?.durationSec
              const pct = dur ? Math.min(100, (pos.positionSec / dur) * 100) : 0
              return (
                <button
                  key={pos.asin}
                  className={`continue-card${playingAsin === pos.asin ? ' playing' : ''}`}
                  onClick={() => onPlay(pos.asin)}
                  title={`Resume ${title}`}
                >
                  <div className="continue-cover-wrap">
                    {cover ? (
                      <img className="continue-cover" src={cover} alt={title} loading="lazy" />
                    ) : (
                      <div className="continue-cover placeholder">{title.slice(0, 1)}</div>
                    )}
                    <span className="continue-play">▶</span>
                  </div>
                  <div className="continue-info">
                    <div className="continue-title" title={title}>
                      {title}
                    </div>
                    <div className="continue-author">{author}</div>
                    <div className="continue-progress">
                      <div className="continue-progress-bar">
                        <div
                          className="continue-progress-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="continue-remaining">
                        {formatRemaining(pos.positionSec, dur)}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {loading ? (
        <div className="app-center small">
          <div className="spinner" />
        </div>
      ) : (
        <div className="book-grid">
          {filtered.map((book) => {
            const localBook = local[book.asin]
            const dl = downloads[book.asin]
            const isReady = localBook?.state === 'ready'
            const isBusy = dl?.state === 'downloading' || dl?.state === 'decrypting'
            return (
              <div
                key={book.asin}
                className={`book-card${playingAsin === book.asin ? ' playing' : ''}`}
              >
                <div className="cover-wrap">
                  {book.coverUrl ? (
                    <img className="cover" src={book.coverUrl} alt={book.title} loading="lazy" />
                  ) : (
                    <div className="cover placeholder">{book.title.slice(0, 1)}</div>
                  )}
                  {typeof book.percentComplete === 'number' && book.percentComplete > 0 && (
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.min(100, book.percentComplete)}%` }}
                      />
                    </div>
                  )}
                  {isReady && <span className="downloaded-badge" title="Downloaded">●</span>}
                </div>
                <div className="book-title" title={book.title}>
                  {book.title}
                </div>
                <div className="book-author">{book.authors.map((a) => a.name).join(', ')}</div>
                <div className="book-meta">{formatRuntime(book.runtimeLengthMin)}</div>

                <div className="book-actions">
                  {isReady ? (
                    <>
                      <button className="primary-btn small" onClick={() => onPlay(book.asin)}>
                        ▶ Play
                      </button>
                      <button
                        className="ghost-btn small"
                        onClick={() => void handleDelete(book.asin)}
                        title="Remove download"
                      >
                        🗑
                      </button>
                    </>
                  ) : isBusy ? (
                    <div className="dl-progress">
                      <div className="dl-bar">
                        <div
                          className="dl-bar-fill"
                          style={{ width: `${dl?.percent ?? 0}%` }}
                        />
                      </div>
                      <span className="dl-label">
                        {dl?.state === 'decrypting'
                          ? 'Decrypting…'
                          : `Downloading ${dl?.percent ?? 0}%`}
                      </span>
                      <button
                        className="link-btn"
                        onClick={() => window.audible.cancelDownload(book.asin)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="ghost-btn small" onClick={() => handleDownload(book)}>
                      ⬇ Download
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="empty-state">
          {tab === 'downloaded'
            ? 'No downloaded titles yet. Download a book to play it offline.'
            : 'No audiobooks found in your library.'}
        </div>
      )}
    </div>
  )
}
