'use client';

import { useState, useEffect } from 'react';

import Shell from '../components/shell';
import { getMemories, promoteMemories } from '../../lib/api-client';
import type { LongTermMemoryResponse } from '../../lib/types';

const MEMORY_TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  decision: { bg: '#eff6ff', text: '#1d4ed8' },
  insight:  { bg: '#fdf4ff', text: '#7e22ce' },
  knowledge:{ bg: '#f0fdf4', text: '#15803d' },
};

function typeStyle(t: string) {
  return MEMORY_TYPE_COLOR[t] ?? { bg: '#f8fafc', text: '#475569' };
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<LongTermMemoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState<string | null>(null);

  function load() {
    setLoading(true);
    void getMemories(100)
      .then((data) => { setMemories(data); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function handlePromote() {
    setPromoting(true);
    setPromoteMsg(null);
    try {
      const res = await promoteMemories();
      setPromoteMsg(`+${res.promoted} promoted, ${res.updated} updated — total ${res.total_long_term_memories}`);
      load();
    } catch {
      setPromoteMsg('Promotion failed');
    } finally {
      setPromoting(false);
    }
  }

  return (
    <Shell>
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">Long-term Memory</p>
          <div className="title-row">
            <h1 className="page-title">What I remember</h1>
            <button
              className={`promote-btn${promoting ? ' loading' : ''}`}
              onClick={handlePromote}
              disabled={promoting}
              type="button"
            >
              {promoting ? '…' : '↑ Promote'}
            </button>
          </div>
          <p className="page-sub">
            {loading ? 'Loading…' : memories.length === 0 ? 'No memories yet.' : `${memories.length} memories`}
            {promoteMsg && <span className="promote-msg"> · {promoteMsg}</span>}
          </p>
        </header>

        <div className="mem-grid">
          {loading ? (
            [1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton" />)
          ) : memories.length === 0 ? (
            <div className="empty">
              <p className="empty-icon">◈</p>
              <p className="empty-text">Important moments from your conversations will be remembered here.</p>
              <button className="promote-btn" onClick={handlePromote} type="button">
                ↑ Run promotion
              </button>
            </div>
          ) : (
            memories.map((m, idx) => {
              const style = typeStyle(m.memory_type);
              const keywords = (m.metadata?.keywords as string[] | null) ?? [];
              return (
                <article
                  key={m.memory_id}
                  className="mem-card"
                  style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                >
                  <div className="card-top">
                    <span
                      className="type-badge"
                      style={{ background: style.bg, color: style.text }}
                    >
                      {m.memory_type}
                    </span>
                    {m.importance_score != null && (
                      <span className="score">✦ {m.importance_score.toFixed(2)}</span>
                    )}
                    <span className="date">
                      {new Date(m.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </span>
                  </div>

                  <h2 className="mem-title">{m.title}</h2>
                  <p className="mem-text">{m.memory_text}</p>

                  {keywords.length > 0 && (
                    <div className="keywords">
                      {keywords.map((kw) => (
                        <span key={kw} className="keyword">{kw}</span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        <style>{`
          .page { max-width: 960px; }

          .page-header { margin-bottom: 28px; }

          .eyebrow {
            margin: 0 0 6px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #7c3aed;
          }

          .title-row {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 6px;
          }

          .page-title {
            margin: 0;
            font-size: 28px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.02em;
          }

          .promote-btn {
            display: inline-flex;
            align-items: center;
            height: 34px;
            padding: 0 16px;
            border-radius: 999px;
            border: 1px solid #ddd6fe;
            background: #f5f3ff;
            color: #7c3aed;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s, border-color 0.15s;
            white-space: nowrap;
          }

          .promote-btn:hover:not(:disabled) {
            background: #ede9fe;
            border-color: #c4b5fd;
          }

          .promote-btn.loading { opacity: 0.6; cursor: default; }

          .page-sub {
            margin: 0;
            font-size: 13px;
            color: #94a3b8;
          }

          .promote-msg {
            color: #7c3aed;
            font-weight: 500;
          }

          .mem-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 14px;
          }

          .mem-card {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 18px 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            animation: cardIn 0.35s ease-out both;
            transition: box-shadow 0.15s, border-color 0.15s;
          }

          .mem-card:hover {
            box-shadow: 0 4px 20px rgba(124,58,237,0.08);
            border-color: #ddd6fe;
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
            padding: 0 10px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: capitalize;
          }

          .score {
            font-size: 11px;
            font-weight: 700;
            color: #a16207;
            background: #fefce8;
            border-radius: 999px;
            padding: 0 9px;
            height: 22px;
            display: inline-flex;
            align-items: center;
          }

          .date {
            font-size: 11px;
            color: #94a3b8;
            margin-left: auto;
          }

          .mem-title {
            margin: 0;
            font-size: 15px;
            font-weight: 700;
            color: #1e293b;
            line-height: 1.35;
          }

          .mem-text {
            margin: 0;
            font-size: 13px;
            color: #475569;
            line-height: 1.7;
            white-space: pre-wrap;
            flex: 1;
          }

          .keywords {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin-top: 2px;
          }

          .keyword {
            display: inline-flex;
            align-items: center;
            height: 20px;
            padding: 0 8px;
            border-radius: 999px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            color: #64748b;
            font-size: 11px;
          }

          .skeleton {
            height: 160px;
            border-radius: 14px;
            background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
            background-size: 200% 100%;
            animation: shimmer 1.4s infinite;
          }

          .empty {
            grid-column: 1 / -1;
            text-align: center;
            padding: 56px 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
          }

          .empty-icon { font-size: 36px; color: #ddd6fe; }
          .empty-text { color: #94a3b8; font-size: 15px; margin: 0; }

          @keyframes cardIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }

          @keyframes shimmer {
            0%   { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    </Shell>
  );
}
