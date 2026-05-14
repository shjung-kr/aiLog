'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

import Shell from '../components/shell';
import { getEpisodes, getEpisodeRawlogs } from '../../lib/api-client';
import type { EpisodeResponse, RawLogResponse } from '../../lib/types';

function RawlogPanel({ episodeId, onClose }: { episodeId: string; onClose: () => void }) {
  const [rawlogs, setRawlogs] = useState<RawLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getEpisodeRawlogs(episodeId)
      .then((logs) => {
        if (cancelled) return;
        setRawlogs(logs);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load rawlogs');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [episodeId]);

  return (
    <div className="rawlog-panel">
      <div className="rawlog-panel-header">
        <span className="rawlog-panel-title">◆ Rawlogs</span>
        <span className="rawlog-panel-id">{episodeId.slice(0, 16)}…</span>
        <button className="rawlog-panel-close" onClick={onClose} type="button">✕</button>
      </div>
      {loading && (
        <div className="rawlog-panel-body">
          {[1, 2, 3].map((i) => <div key={i} className="rawlog-skel" />)}
        </div>
      )}
      {error && (
        <div className="rawlog-panel-body">
          <p className="rawlog-error">✕ {error}</p>
        </div>
      )}
      {!loading && !error && (
        <div className="rawlog-panel-body">
          {rawlogs.length === 0 ? (
            <p className="rawlog-empty">No rawlogs linked to this episode.</p>
          ) : (
            rawlogs.map((msg, idx) => (
              <article key={msg.rawlog_id} className={`rl-card ${msg.speaker_type}`}
                style={{ animationDelay: `${idx * 20}ms` }}>
                <div className="rl-card-header">
                  <span className={`rl-badge ${msg.speaker_type}`}>
                    {msg.speaker_type === 'user' ? '▸ User' : '◆ aiLog'}
                  </span>
                  <span className="rl-seq">#{msg.sequence_no}</span>
                  <span className="rl-time">
                    {new Date(msg.occurred_at).toLocaleString('ko-KR', {
                      month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="rl-content">{msg.content}</p>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function MemoriesPage() {
  const [episodes, setEpisodes] = useState<EpisodeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [openEpisodeId, setOpenEpisodeId] = useState<string | null>(null);

  useEffect(() => {
    void getEpisodes(undefined, 100)
      .then((eps) => {
        setEpisodes(eps);
        setStatus(eps.length === 0 ? 'No memories yet' : `▸ ${eps.length} memories`);
        setLoading(false);
      })
      .catch((err) => {
        setStatus(err instanceof Error ? `✕ ${err.message}` : '✕ Failed to load');
        setLoading(false);
      });
  }, []);

  function toggleRawlog(episodeId: string) {
    setOpenEpisodeId((prev) => (prev === episodeId ? null : episodeId));
  }

  return (
    <Shell>
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">◈ Memories</p>
          <h1 className="page-title">Long-term memory index</h1>
          <p className="page-status">{status}</p>
        </header>

        <div className="mem-list">
          {loading ? (
            [1, 2, 3, 4].map((i) => <div key={i} className="skeleton" />)
          ) : episodes.length === 0 ? (
            <div className="empty">
              <p className="empty-icon">◈</p>
              <p className="empty-text">No memories yet. Start chatting to create memories.</p>
            </div>
          ) : (
            episodes.map((ep, idx) => {
              const semanticText = ep.metadata?.semantic_text as string | undefined;
              const isOpen = openEpisodeId === ep.episode_id;
              return (
                <article key={ep.episode_id} className="mem-card"
                  style={{ animationDelay: `${Math.min(idx * 25, 300)}ms` }}>
                  <div className="mem-card-top">
                    <span className="type-badge">◆ {ep.episode_type}</span>
                    {ep.importance_score != null && (
                      <span className="score-badge">✦ {ep.importance_score.toFixed(2)}</span>
                    )}
                    <span className="rawlog-count">▸ {ep.rawlog_ids.length} rawlogs</span>
                    <Link
                      href={`/episodes/${ep.episode_id}`}
                      className="ep-link"
                      title="Open episode detail"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ↗
                    </Link>
                  </div>

                  <h2 className="mem-title">{ep.title}</h2>

                  {semanticText ? (
                    <p className="mem-semantic">{semanticText}</p>
                  ) : (
                    <p className="mem-summary">{ep.summary}</p>
                  )}

                  {ep.keywords && ep.keywords.length > 0 && (
                    <div className="keywords">
                      {ep.keywords.map((kw) => (
                        <span key={kw} className="keyword">◆ {kw}</span>
                      ))}
                    </div>
                  )}

                  <div className="mem-footer">
                    <button
                      className={`rawlog-btn${isOpen ? ' active' : ''}`}
                      type="button"
                      onClick={() => toggleRawlog(ep.episode_id)}
                    >
                      {isOpen ? '▲ Rawlog 닫기' : '▼ Rawlog 보기'}
                    </button>
                    <span className="ep-id-chip">{ep.episode_id.slice(0, 16)}…</span>
                  </div>

                  {isOpen && (
                    <RawlogPanel
                      episodeId={ep.episode_id}
                      onClose={() => setOpenEpisodeId(null)}
                    />
                  )}
                </article>
              );
            })
          )}
        </div>

        <style>{`
          .page { max-width: 860px; }

          .page-header { margin-bottom: 24px; }

          .eyebrow {
            margin: 0 0 6px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #16a34a;
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

          .mem-list { display: grid; gap: 12px; }

          .mem-card {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 18px 20px;
            display: grid;
            gap: 10px;
            animation: cardIn 0.35s ease-out both;
          }

          .mem-card:hover {
            border-color: #a7f3d0;
            box-shadow: 0 4px 20px rgba(22,163,74,0.07);
          }

          .mem-card-top {
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
            background: #f0fdf4;
            color: #16a34a;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.05em;
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

          .rawlog-count {
            font-size: 12px;
            color: #94a3b8;
          }

          .ep-link {
            margin-left: auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 26px;
            border-radius: 8px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            color: #64748b;
            font-size: 13px;
            transition: background 0.12s, border-color 0.12s;
            text-decoration: none;
          }

          .ep-link:hover {
            background: #eef2ff;
            border-color: #c7d2fe;
            color: #6366f1;
          }

          .mem-title {
            margin: 0;
            font-size: 16px;
            font-weight: 700;
            color: #1e293b;
            line-height: 1.3;
          }

          .mem-semantic {
            margin: 0;
            font-size: 13px;
            color: #15803d;
            line-height: 1.65;
            white-space: pre-wrap;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 8px;
            padding: 10px 14px;
          }

          .mem-summary {
            margin: 0;
            font-size: 14px;
            color: #475569;
            line-height: 1.65;
            white-space: pre-wrap;
          }

          .keywords {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
          }

          .keyword {
            display: inline-flex;
            align-items: center;
            height: 22px;
            padding: 0 9px;
            border-radius: 999px;
            background: #f0fdf4;
            color: #16a34a;
            font-size: 11px;
            font-weight: 500;
          }

          .mem-footer {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .rawlog-btn {
            display: inline-flex;
            align-items: center;
            height: 30px;
            padding: 0 12px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            background: #fff;
            color: #64748b;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.12s, border-color 0.12s, color 0.12s;
          }

          .rawlog-btn:hover {
            background: #f0fdf4;
            border-color: #bbf7d0;
            color: #16a34a;
          }

          .rawlog-btn.active {
            background: #16a34a;
            border-color: #16a34a;
            color: #fff;
          }

          .ep-id-chip {
            font-family: ui-monospace, monospace;
            font-size: 10px;
            color: #cbd5e1;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 2px 8px;
          }

          /* Rawlog panel */
          .rawlog-panel {
            border: 1px solid #bbf7d0;
            border-radius: 10px;
            overflow: hidden;
            background: #f0fdf4;
          }

          .rawlog-panel-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            background: #dcfce7;
            border-bottom: 1px solid #bbf7d0;
          }

          .rawlog-panel-title {
            font-size: 12px;
            font-weight: 700;
            color: #16a34a;
          }

          .rawlog-panel-id {
            font-family: ui-monospace, monospace;
            font-size: 10px;
            color: #4ade80;
          }

          .rawlog-panel-close {
            margin-left: auto;
            width: 22px;
            height: 22px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: #86efac;
            font-size: 11px;
            cursor: pointer;
            display: grid;
            place-items: center;
            transition: background 0.1s;
          }

          .rawlog-panel-close:hover {
            background: rgba(0,0,0,0.08);
          }

          .rawlog-panel-body {
            padding: 10px 14px;
            display: grid;
            gap: 8px;
            max-height: 400px;
            overflow-y: auto;
          }

          .rl-card {
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            background: #fff;
            padding: 10px 12px;
            display: grid;
            gap: 6px;
            animation: cardIn 0.2s ease-out both;
          }

          .rl-card.assistant { border-left: 3px solid #6366f1; }
          .rl-card.user { border-left: 3px solid #e2e8f0; background: #fafafa; }

          .rl-card-header {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
          }

          .rl-badge {
            display: inline-flex;
            align-items: center;
            height: 18px;
            padding: 0 7px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 700;
          }

          .rl-badge.assistant { background: #eef2ff; color: #6366f1; }
          .rl-badge.user { background: #f1f5f9; color: #64748b; }

          .rl-seq { font-size: 10px; color: #94a3b8; font-family: ui-monospace, monospace; }
          .rl-time { font-size: 10px; color: #94a3b8; margin-left: auto; }

          .rl-content {
            margin: 0;
            font-size: 13px;
            color: #1e293b;
            line-height: 1.6;
            white-space: pre-wrap;
          }

          .rawlog-skel {
            height: 64px;
            border-radius: 8px;
            background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
            background-size: 200% 100%;
            animation: shimmer 1.4s infinite;
          }

          .rawlog-error {
            margin: 0;
            font-size: 13px;
            color: #ef4444;
          }

          .rawlog-empty {
            margin: 0;
            font-size: 13px;
            color: #94a3b8;
          }

          /* Skeleton */
          .skeleton {
            height: 160px;
            border-radius: 14px;
            background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
            background-size: 200% 100%;
            animation: shimmer 1.4s infinite;
          }

          .empty {
            text-align: center;
            padding: 56px 24px;
          }

          .empty-icon { margin: 0 0 10px; font-size: 36px; color: #a7f3d0; }
          .empty-text { margin: 0; color: #94a3b8; font-size: 15px; }
        `}</style>
      </div>
    </Shell>
  );
}
