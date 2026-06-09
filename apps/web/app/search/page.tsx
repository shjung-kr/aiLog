'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useState } from 'react';

import Shell from '../components/shell';
import { retrieveMemory } from '../../lib/api-client';
import type { RetrievalResponse } from '../../lib/types';

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RetrievalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    try {
      setResult(await retrieveMemory({ query: trimmed }));
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <main className="search-page">
        <header className="search-header">
          <p className="eyebrow">Memory Search</p>
          <h1 className="page-title">Search past conversations</h1>
          <p className="page-sub">Find remembered topics, decisions, phrases, and context from previous sessions.</p>
        </header>

        <form className="search-form" onSubmit={handleSubmit}>
          <input
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 지난번 특허성 이야기 핵심이 뭐였지?"
          />
          <button className="search-button" disabled={loading || !query.trim()} type="submit">
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {error && <div className="search-error">{error}</div>}

        {result && (
          <section className="search-results">
            <div className="result-summary">
              <div>
                <p className="result-label">Query</p>
                <h2>{result.query}</h2>
              </div>
              <span className="result-count">{result.episodes.length} matches</span>
            </div>

            {result.semantic_text ? (
              <article className="memory-context">
                <p className="result-label">Injected Context</p>
                <p>{result.semantic_text}</p>
              </article>
            ) : (
              <div className="empty-result">No memory context matched this query.</div>
            )}

            <div className="episode-list">
              {result.episodes.map((episode) => {
                const date = formatDate(episode.start_at);
                return (
                  <Link
                    key={episode.episode_id}
                    className="episode-hit"
                    href={`/episodes/${episode.episode_id}`}
                  >
                    <div>
                      <h3>{episode.title}</h3>
                      {date && <p>{date}</p>}
                    </div>
                    <span>{episode.score.toFixed(3)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <style>{`
        .search-page { max-width: 920px; margin: 0 auto; padding: 42px 22px 80px; }
        .search-header { margin-bottom: 24px; }
        .eyebrow { margin: 0 0 8px; color: #64748b; font-size: 13px; font-weight: 700; text-transform: uppercase; }
        .page-title { margin: 0; color: #111827; font-size: 36px; line-height: 1.15; }
        .page-sub { margin: 10px 0 0; color: #64748b; font-size: 15px; }
        .search-form { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-bottom: 18px; }
        .search-input { min-width: 0; border: 1px solid #cbd5e1; border-radius: 8px; padding: 13px 14px; font-size: 15px; outline: none; }
        .search-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
        .search-button { border: 0; border-radius: 8px; background: #111827; color: white; padding: 0 18px; font-weight: 700; cursor: pointer; }
        .search-button:disabled { cursor: not-allowed; opacity: 0.55; }
        .search-error { border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 8px; padding: 12px 14px; }
        .search-results { display: grid; gap: 14px; margin-top: 24px; }
        .result-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 14px; }
        .result-summary h2 { margin: 3px 0 0; font-size: 22px; color: #111827; }
        .result-label { margin: 0; color: #64748b; font-size: 12px; font-weight: 800; text-transform: uppercase; }
        .result-count { flex: 0 0 auto; color: #334155; background: #f1f5f9; border-radius: 999px; padding: 6px 10px; font-size: 13px; }
        .memory-context { border: 1px solid #dbeafe; background: #eff6ff; border-radius: 8px; padding: 16px; }
        .memory-context p:last-child { margin: 8px 0 0; color: #1e293b; line-height: 1.65; white-space: pre-wrap; }
        .empty-result { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 24px; color: #64748b; text-align: center; }
        .episode-list { display: grid; gap: 10px; }
        .episode-hit { display: flex; align-items: center; justify-content: space-between; gap: 14px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; color: inherit; text-decoration: none; }
        .episode-hit:hover { border-color: #93c5fd; background: #f8fafc; }
        .episode-hit h3 { margin: 0; color: #111827; font-size: 16px; }
        .episode-hit p { margin: 5px 0 0; color: #64748b; font-size: 13px; }
        .episode-hit span { color: #1d4ed8; font-size: 13px; font-weight: 800; }
        @media (max-width: 680px) {
          .search-page { padding: 28px 16px 64px; }
          .page-title { font-size: 28px; }
          .search-form { grid-template-columns: 1fr; }
          .search-button { height: 44px; }
          .result-summary, .episode-hit { align-items: stretch; flex-direction: column; }
        }
      `}</style>
    </Shell>
  );
}
