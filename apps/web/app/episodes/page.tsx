'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getEpisodes, getSessions } from '../../lib/api-client';
import type { EpisodeResponse, SessionResponse } from '../../lib/types';

export default function EpisodesPage() {
  const [episodes, setEpisodes] = useState<EpisodeResponse[]>([]);
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [status, setStatus] = useState('Loading episodes...');

  async function loadEpisodes(sessionId = selectedSessionId) {
    const items = await getEpisodes(sessionId || undefined);
    setEpisodes(items);
    setStatus(items.length === 0 ? 'No episodes yet' : `${items.length} episodes loaded`);
  }

  useEffect(() => {
    void Promise.all([getSessions(), getEpisodes()])
      .then(([sessionItems, episodeItems]) => {
        setSessions(sessionItems);
        setEpisodes(episodeItems);
        setStatus(episodeItems.length === 0 ? 'No episodes yet' : `${episodeItems.length} episodes loaded`);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load episodes');
      });
  }, []);

  async function handleSessionChange(sessionId: string) {
    setSelectedSessionId(sessionId);
    setStatus('Loading episodes...');
    try {
      await loadEpisodes(sessionId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load episodes');
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Episodes</p>
            <h1 style={styles.title}>Automatically extracted Q/A turns.</h1>
          </div>
          <div style={styles.links}>
            <Link href="/sessions" style={styles.secondaryLink}>
              Sessions
            </Link>
            <Link href="/chat" style={styles.primaryLink}>
              Chat
            </Link>
          </div>
        </header>

        <section style={styles.toolbar}>
          <select
            onChange={(event) => void handleSessionChange(event.target.value)}
            style={styles.select}
            value={selectedSessionId}
          >
            <option value="">All sessions</option>
            {sessions.map((session) => (
              <option key={session.session_id} value={session.session_id}>
                {session.title || 'Untitled session'} - {session.session_id.slice(0, 8)}
              </option>
            ))}
          </select>
          <span style={styles.hint}>Episodes are semantic indexes that point back to RawLog.</span>
        </section>

        <p style={styles.status}>{status}</p>

        <section style={styles.list}>
          {episodes.map((episode) => (
            <article key={episode.episode_id} style={styles.card}>
              <div style={styles.cardMeta}>
                <span>{episode.episode_type}</span>
                <span>{episode.rawlog_ids.length} rawlogs</span>
              </div>
              <h2 style={styles.cardTitle}>{episode.title}</h2>
              <p style={styles.summary}>{episode.summary}</p>
              {episode.keywords && episode.keywords.length > 0 ? (
                <div style={styles.keywords}>
                  {episode.keywords.map((keyword) => (
                    <span key={keyword} style={styles.keyword}>
                      {keyword}
                    </span>
                  ))}
                </div>
              ) : null}
              <p style={styles.cardCopy}>{episode.episode_id}</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f7f7f5',
    color: '#1f2937',
    padding: '32px 20px',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  shell: {
    maxWidth: '960px',
    margin: '0 auto',
    display: 'grid',
    gap: '18px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: '16px',
    flexWrap: 'wrap',
  },
  eyebrow: {
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontSize: '12px',
    color: '#475569',
  },
  title: {
    margin: '8px 0 0',
    fontSize: '32px',
    lineHeight: 1.1,
  },
  links: {
    display: 'flex',
    gap: '10px',
  },
  primaryLink: {
    textDecoration: 'none',
    padding: '10px 14px',
    borderRadius: '8px',
    background: '#111827',
    color: '#ffffff',
  },
  secondaryLink: {
    textDecoration: 'none',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    color: '#111827',
  },
  toolbar: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  select: {
    minWidth: '260px',
    minHeight: '40px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    padding: '0 10px',
    background: '#ffffff',
  },
  hint: {
    minHeight: '40px',
    display: 'inline-flex',
    alignItems: 'center',
    color: '#64748b',
    fontSize: '14px',
  },
  status: {
    margin: 0,
    color: '#475569',
  },
  list: {
    display: 'grid',
    gap: '12px',
  },
  card: {
    display: 'grid',
    gap: '10px',
    padding: '16px',
    borderRadius: '8px',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
  },
  cardMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    color: '#64748b',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  cardTitle: {
    margin: 0,
    fontSize: '20px',
  },
  summary: {
    margin: 0,
    color: '#334155',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  keywords: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  keyword: {
    borderRadius: '999px',
    padding: '4px 8px',
    background: '#e0f2fe',
    color: '#075985',
    fontSize: '12px',
  },
  cardCopy: {
    margin: 0,
    color: '#64748b',
    fontSize: '12px',
    wordBreak: 'break-all',
  },
};
