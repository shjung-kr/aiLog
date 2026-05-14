'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import Shell from '../../components/shell';
import { getEpisode, getEpisodeRawlogs } from '../../../lib/api-client';
import type { EpisodeResponse, RawLogResponse } from '../../../lib/types';

export default function EpisodeDetailPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const [episode, setEpisode]   = useState<EpisodeResponse | null>(null);
  const [rawlogs, setRawlogs]   = useState<RawLogResponse[]>([]);
  const [status, setStatus]     = useState('Loading…');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!episodeId) return;
    let cancelled = false;

    void Promise.all([getEpisode(episodeId), getEpisodeRawlogs(episodeId)])
      .then(([ep, logs]) => {
        if (cancelled) return;
        setEpisode(ep);
        setRawlogs(logs);
        setStatus(`▸ ${logs.length} rawlogs`);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(err instanceof Error ? `✕ ${err.message}` : '✕ Failed to load');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [episodeId]);

  const semanticText = episode?.metadata?.semantic_text as string | undefined;

  return (
    <Shell>
      <div className="page">
        <header className="page-header">
          <div className="breadcrumb">
            <Link href="/episodes" className="bc-link">◆ Episodes</Link>
            <span className="bc-sep">▸</span>
            <span className="bc-current">Detail</span>
          </div>

          {loading ? (
            <div className="skeleton-title" />
          ) : episode ? (
            <>
              <div className="ep-badge-row">
                <span className="type-badge">◆ {episode.episode_type}</span>
                {episode.importance_score != null && (
                  <span className="score-badge">✦ {episode.importance_score.toFixed(2)}</span>
                )}
              </div>
              <h1 className="page-title">{episode.title}</h1>
              <p className="ep-id">▸ {episode.episode_id}</p>
            </>
          ) : (
            <h1 className="page-title">Episode not found</h1>
          )}
          <p className="page-status">{status}</p>
        </header>

        {!loading && episode && (
          <div className="ep-body">
            {/* Summary */}
            <section className="section">
              <p className="section-label">Summary</p>
              <p className="section-text">{episode.summary}</p>
            </section>

            {/* Semantic text */}
            {semanticText && (
              <section className="section mem-section">
                <p className="section-label">◈ Memory context (semantic text)</p>
                <p className="section-text semantic">{semanticText}</p>
              </section>
            )}

            {/* Keywords */}
            {episode.keywords && episode.keywords.length > 0 && (
              <section className="section">
                <p className="section-label">Keywords</p>
                <div className="keywords">
                  {episode.keywords.map((kw) => (
                    <span key={kw} className="keyword">◆ {kw}</span>
                  ))}
                </div>
              </section>
            )}

            {/* Rawlogs */}
            <section className="section">
              <p className="section-label">Rawlogs ({rawlogs.length})</p>
              <div className="rawlog-list">
                {rawlogs.length === 0 ? (
                  <p className="empty-text">No rawlogs linked.</p>
                ) : (
                  rawlogs.map((msg, idx) => (
                    <article
                      key={msg.rawlog_id}
                      id={msg.rawlog_id}
                      className={`rawlog-card ${msg.speaker_type}`}
                      style={{ animationDelay: `${Math.min(idx * 20, 200)}ms` }}
                    >
                      <div className="rawlog-header">
                        <span className={`speaker-badge ${msg.speaker_type}`}>
                          {msg.speaker_type === 'user' ? '▸ User' : '◆ aiLog'}
                        </span>
                        <span className="rawlog-seq">#{msg.sequence_no}</span>
                        <span className="rawlog-time">
                          {new Date(msg.occurred_at).toLocaleString('ko-KR', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        <span className="rawlog-id-chip">{msg.rawlog_id.slice(0, 12)}…</span>
                      </div>
                      <p className="rawlog-content">{msg.content}</p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {loading && (
          <div className="ep-body">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" />)}
          </div>
        )}

        <style>{`
          .page { max-width: 800px; }

          /* Breadcrumb */
          .breadcrumb {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 12px;
          }
          .bc-link {
            font-size: 13px;
            color: #6366f1;
            text-decoration: none;
            font-weight: 600;
          }
          .bc-link:hover { text-decoration: underline; }
          .bc-sep { font-size: 11px; color: #cbd5e1; }
          .bc-current { font-size: 13px; color: #94a3b8; }

          /* Header */
          .page-header { margin-bottom: 24px; }
          .ep-badge-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }

          .type-badge {
            display: inline-flex; align-items: center;
            height: 22px; padding: 0 9px;
            border-radius: 999px;
            background: #eef2ff; color: #6366f1;
            font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
          }

          .score-badge {
            display: inline-flex; align-items: center;
            height: 22px; padding: 0 9px;
            border-radius: 999px;
            background: #fefce8; color: #a16207;
            font-size: 11px; font-weight: 700;
          }

          .page-title {
            margin: 0 0 4px;
            font-size: 26px; font-weight: 800;
            color: #0f172a; letter-spacing: -0.02em; line-height: 1.2;
          }

          .ep-id {
            margin: 0 0 4px;
            font-size: 11px; color: #94a3b8;
            font-family: ui-monospace, monospace;
          }

          .page-status { margin: 0; font-size: 13px; color: #94a3b8; }

          .skeleton-title {
            height: 36px; width: 70%; border-radius: 8px;
            background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
            background-size: 200% 100%;
            animation: shimmer 1.4s infinite;
            margin-bottom: 16px;
          }

          /* Body */
          .ep-body { display: grid; gap: 20px; }

          .section { display: grid; gap: 8px; }

          .section-label {
            margin: 0;
            font-size: 11px; font-weight: 700;
            letter-spacing: 0.10em; text-transform: uppercase;
            color: #94a3b8;
          }

          .section-text {
            margin: 0;
            font-size: 14px; color: #475569; line-height: 1.7;
            white-space: pre-wrap;
          }

          .section-text.semantic {
            font-size: 14px; color: #15803d;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 10px;
            padding: 12px 16px;
          }

          .mem-section .section-label { color: #16a34a; }

          .keywords { display: flex; flex-wrap: wrap; gap: 6px; }

          .keyword {
            display: inline-flex; align-items: center;
            height: 24px; padding: 0 10px;
            border-radius: 999px;
            background: #eef2ff; color: #6366f1;
            font-size: 12px; font-weight: 500;
          }

          /* Rawlogs */
          .rawlog-list { display: grid; gap: 8px; }

          .rawlog-card {
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            background: #fff;
            padding: 14px 16px;
            display: grid; gap: 8px;
            animation: cardIn 0.3s ease-out both;
          }

          .rawlog-card.assistant { border-left: 3px solid #6366f1; }
          .rawlog-card.user      { border-left: 3px solid #e2e8f0; background: #fafafa; }

          .rawlog-header {
            display: flex; align-items: center;
            gap: 8px; flex-wrap: wrap;
          }

          .speaker-badge {
            display: inline-flex; align-items: center;
            height: 20px; padding: 0 8px;
            border-radius: 999px;
            font-size: 11px; font-weight: 700;
          }
          .speaker-badge.assistant { background: #eef2ff; color: #6366f1; }
          .speaker-badge.user      { background: #f1f5f9; color: #64748b; }

          .rawlog-seq  { font-size: 11px; color: #94a3b8; font-family: ui-monospace, monospace; }
          .rawlog-time { font-size: 11px; color: #94a3b8; margin-left: auto; }

          .rawlog-id-chip {
            font-size: 10px; color: #cbd5e1;
            font-family: ui-monospace, monospace;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 1px 6px;
          }

          .rawlog-content {
            margin: 0;
            font-size: 14px; color: #1e293b;
            line-height: 1.65; white-space: pre-wrap;
          }

          /* Skeletons */
          .skeleton {
            height: 120px; border-radius: 12px;
            background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
            background-size: 200% 100%;
            animation: shimmer 1.4s infinite;
          }

          .empty-text { margin: 0; font-size: 14px; color: #94a3b8; }
        `}</style>
      </div>
    </Shell>
  );
}
