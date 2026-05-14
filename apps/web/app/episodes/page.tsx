'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import Shell from '../components/shell';
import { getEpisodes, getSessions } from '../../lib/api-client';
import type { EpisodeResponse, SessionResponse } from '../../lib/types';

export default function EpisodesPage() {
  const router = useRouter();
  const [episodes, setEpisodes] = useState<EpisodeResponse[]>([]);
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus]     = useState('');
  const [loading, setLoading]   = useState(true);

  async function load(sessionId = selected) {
    const items = await getEpisodes(sessionId || undefined);
    setEpisodes(items);
    setStatus(items.length === 0 ? 'No episodes yet' : `▸ ${items.length} episodes`);
  }

  useEffect(() => {
    void Promise.all([getSessions(), getEpisodes()])
      .then(([sess, eps]) => {
        setSessions(sess);
        setEpisodes(eps);
        setStatus(eps.length === 0 ? 'No episodes yet' : `▸ ${eps.length} episodes`);
        setLoading(false);
      })
      .catch((err) => {
        setStatus(err instanceof Error ? `✕ ${err.message}` : '✕ Failed to load');
        setLoading(false);
      });
  }, []);

  async function handleFilter(sid: string) {
    setSelected(sid);
    setStatus('Loading…');
    try {
      await load(sid);
    } catch (err) {
      setStatus(err instanceof Error ? `✕ ${err.message}` : '✕ Failed');
    }
  }

  return (
    <Shell>
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">◆ Episodes</p>
          <h1 className="page-title">Semantic memory index</h1>
          <p className="page-status">{status}</p>
        </header>

        <div className="toolbar">
          <select
            className="filter-select"
            value={selected}
            onChange={(e) => void handleFilter(e.target.value)}
          >
            <option value="">▸ All sessions</option>
            {sessions.map((s) => (
              <option key={s.session_id} value={s.session_id}>
                {s.title || 'Untitled'} — {s.session_id.slice(0, 8)}
              </option>
            ))}
          </select>
          <p className="toolbar-hint">◆ Episodes point back to RawLog entries</p>
        </div>

        <div className="card-list">
          {loading ? (
            [1, 2, 3, 4].map((i) => <div key={i} className="skeleton" />)
          ) : episodes.length === 0 ? (
            <div className="empty">
              <p className="empty-icon">◆</p>
              <p className="empty-text">No episodes generated yet. Keep chatting!</p>
            </div>
          ) : (
            episodes.map((ep, idx) => (
              <article
                key={ep.episode_id}
                className="ep-card"
                style={{ animationDelay: `${idx * 30}ms` }}
                onClick={() => router.push(`/episodes/${ep.episode_id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/episodes/${ep.episode_id}`); }}
              >
                <div className="card-top">
                  <span className="type-badge">◆ {ep.episode_type}</span>
                  <span className="rawlog-count">▸ {ep.rawlog_ids.length} rawlogs</span>
                  {ep.importance_score != null && (
                    <span className="score-badge">
                      ✦ {ep.importance_score.toFixed(2)}
                    </span>
                  )}
                </div>

                <h2 className="card-title">{ep.title}</h2>
                <p className="card-summary">{ep.summary}</p>

                {ep.keywords && ep.keywords.length > 0 && (
                  <div className="keywords">
                    {ep.keywords.map((kw) => (
                      <span key={kw} className="keyword">◆ {kw}</span>
                    ))}
                  </div>
                )}

                <p className="card-id">▸ {ep.episode_id.slice(0, 24)}… <span className="card-arrow">→</span></p>
              </article>
            ))
          )}
        </div>

        <style>{`
          .page { max-width: 800px; }

          .page-header { margin-bottom: 20px; }

          .eyebrow {
            margin: 0 0 6px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #6366f1;
          }

          .page-title {
            margin: 0 0 4px;
            font-size: 28px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.02em;
            line-height: 1.15;
          }

          .page-status {
            margin: 0;
            font-size: 13px;
            color: #94a3b8;
          }

          .toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 20px;
          }

          .filter-select {
            height: 38px;
            min-width: 260px;
            padding: 0 12px;
            border-radius: 10px;
            border: 1px solid #e2e8f0;
            background: #fff;
            font-size: 14px;
            color: #1e293b;
            cursor: pointer;
            transition: border-color 0.15s;
          }

          .filter-select:focus {
            outline: none;
            border-color: #a5b4fc;
            box-shadow: 0 0 0 3px rgba(99,102,241,0.08);
          }

          .toolbar-hint {
            margin: 0;
            font-size: 13px;
            color: #94a3b8;
          }

          .card-list { display: grid; gap: 10px; }

          .ep-card {
            display: grid;
            gap: 10px;
            padding: 18px 20px;
            border-radius: 14px;
            background: #fff;
            border: 1px solid #e2e8f0;
            transition: box-shadow 0.15s, border-color 0.15s;
            animation: cardIn 0.35s ease-out both;
            cursor: pointer;
          }

          .ep-card:hover {
            box-shadow: 0 4px 20px rgba(99,102,241,0.10);
            border-color: #c7d2fe;
          }

          .card-top {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
          }

          .type-badge {
            display: inline-flex;
            align-items: center;
            height: 22px;
            padding: 0 9px;
            border-radius: 999px;
            background: #eef2ff;
            color: #6366f1;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.05em;
          }

          .rawlog-count {
            font-size: 12px;
            color: #94a3b8;
          }

          .score-badge {
            display: inline-flex;
            align-items: center;
            height: 22px;
            padding: 0 9px;
            border-radius: 999px;
            background: #fefce8;
            color: #a16207;
            font-size: 11px;
            font-weight: 700;
          }

          .card-title {
            margin: 0;
            font-size: 16px;
            font-weight: 700;
            color: #1e293b;
            line-height: 1.3;
          }

          .card-summary {
            margin: 0;
            font-size: 14px;
            color: #475569;
            line-height: 1.65;
            white-space: pre-wrap;
          }

          .keywords {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }

          .keyword {
            display: inline-flex;
            align-items: center;
            height: 24px;
            padding: 0 10px;
            border-radius: 999px;
            background: #eef2ff;
            color: #6366f1;
            font-size: 12px;
            font-weight: 500;
          }

          .card-id {
            margin: 0;
            font-size: 11px;
            color: #cbd5e1;
            font-family: ui-monospace, monospace;
          }

          .card-arrow { color: #a5b4fc; margin-left: 4px; }

          .skeleton {
            height: 140px;
            border-radius: 14px;
            background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
            background-size: 200% 100%;
            animation: shimmer 1.4s infinite;
          }

          .empty {
            text-align: center;
            padding: 56px 24px;
          }

          .empty-icon { margin: 0 0 10px; font-size: 36px; color: #c7d2fe; }
          .empty-text { margin: 0; color: #94a3b8; font-size: 15px; }
        `}</style>
      </div>
    </Shell>
  );
}
