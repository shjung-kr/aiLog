'use client';

import { useState, useEffect } from 'react';

import Shell from '../components/shell';
import { getMemories, promoteMemories, analyzeStyle } from '../../lib/api-client';
import type { LongTermMemoryResponse } from '../../lib/types';

const MEMORY_TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  decision: { bg: '#eff6ff', text: '#1d4ed8' },
  insight:  { bg: '#fdf4ff', text: '#7e22ce' },
  knowledge:{ bg: '#f0fdf4', text: '#15803d' },
};

function typeStyle(t: string) {
  return MEMORY_TYPE_COLOR[t] ?? { bg: '#f8fafc', text: '#475569' };
}

type StyleProfile = {
  tone?: string;
  logic_structure?: string;
  vocabulary?: string[];
  response_preference?: string;
  domain_expertise?: string[];
  updated_at?: string;
};

function StyleProfileCard({ profile, updatedAt }: { profile: StyleProfile; updatedAt: string }) {
  const rows: { label: string; value: string }[] = [
    profile.tone              ? { label: '어투',       value: profile.tone } : null,
    profile.logic_structure   ? { label: '논리 전개',   value: profile.logic_structure } : null,
    profile.response_preference ? { label: '응답 형식', value: profile.response_preference } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const date = updatedAt
    ? new Date(updatedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="style-card">
      <div className="style-card-header">
        <span className="style-icon">◈</span>
        <span className="style-title">내 스타일 프로파일</span>
        {date && <span className="style-date">{date} 업데이트</span>}
      </div>

      <div className="style-body">
        <div className="style-rows">
          {rows.map((r) => (
            <div key={r.label} className="style-row">
              <span className="style-label">{r.label}</span>
              <span className="style-value">{r.value}</span>
            </div>
          ))}
        </div>

        {(profile.vocabulary?.length || profile.domain_expertise?.length) ? (
          <div className="style-tags-section">
            {profile.vocabulary && profile.vocabulary.length > 0 && (
              <div className="style-tag-group">
                <span className="style-tag-label">주요 어휘</span>
                <div className="style-tags">
                  {profile.vocabulary.map((v) => (
                    <span key={v} className="style-tag vocab">{v}</span>
                  ))}
                </div>
              </div>
            )}
            {profile.domain_expertise && profile.domain_expertise.length > 0 && (
              <div className="style-tag-group">
                <span className="style-tag-label">전문 도메인</span>
                <div className="style-tags">
                  {profile.domain_expertise.map((d) => (
                    <span key={d} className="style-tag domain">{d}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<LongTermMemoryResponse[]>([]);
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [styleUpdatedAt, setStyleUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState<string | null>(null);
  const [analyzingStyle, setAnalyzingStyle] = useState(false);
  const [styleMsg, setStyleMsg] = useState<string | null>(null);

  function load() {
    setLoading(true);
    void getMemories(100)
      .then((data) => {
        const styleRecord = data.find((m) => m.memory_type === 'user_style');
        if (styleRecord) {
          try {
            const parsed = JSON.parse(styleRecord.memory_text) as StyleProfile;
            setStyleProfile(parsed);
            setStyleUpdatedAt(parsed.updated_at ?? styleRecord.created_at);
          } catch { /* ignore */ }
        }
        setMemories(data.filter((m) => m.memory_type !== 'user_style'));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAnalyzeStyle() {
    setAnalyzingStyle(true);
    setStyleMsg(null);
    try {
      const res = await analyzeStyle();
      setStyleMsg(res.status === 'ok' ? '스타일 프로파일 업데이트 완료' : '메시지가 충분하지 않습니다');
      load();
    } catch {
      setStyleMsg('분석 실패');
    } finally {
      setAnalyzingStyle(false);
    }
  }

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
              className={`promote-btn${analyzingStyle ? ' loading' : ''}`}
              onClick={handleAnalyzeStyle}
              disabled={analyzingStyle}
              type="button"
            >
              {analyzingStyle ? '…' : '◈ 스타일 분석'}
            </button>
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
            {styleMsg && <span className="promote-msg"> · {styleMsg}</span>}
            {promoteMsg && <span className="promote-msg"> · {promoteMsg}</span>}
          </p>
        </header>

        {styleProfile && (
          <StyleProfileCard profile={styleProfile} updatedAt={styleUpdatedAt} />
        )}

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

          /* ── Style profile card ── */
          .style-card {
            margin-bottom: 28px;
            border: 1px solid #c7d2fe;
            border-radius: 16px;
            background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
            overflow: hidden;
          }

          .style-card-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 14px 20px;
            border-bottom: 1px solid #c7d2fe;
          }

          .style-icon { font-size: 15px; color: #6366f1; }

          .style-title {
            font-size: 14px;
            font-weight: 700;
            color: #3730a3;
            flex: 1;
          }

          .style-date {
            font-size: 11px;
            color: #818cf8;
          }

          .style-body {
            padding: 16px 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .style-rows { display: flex; flex-direction: column; gap: 8px; }

          .style-row {
            display: flex;
            gap: 12px;
            align-items: baseline;
            font-size: 13px;
          }

          .style-label {
            width: 72px;
            flex-shrink: 0;
            font-weight: 600;
            color: #6366f1;
            font-size: 12px;
          }

          .style-value { color: #1e293b; line-height: 1.5; }

          .style-tags-section { display: flex; flex-direction: column; gap: 10px; }

          .style-tag-group { display: flex; align-items: flex-start; gap: 10px; }

          .style-tag-label {
            width: 72px;
            flex-shrink: 0;
            font-size: 12px;
            font-weight: 600;
            color: #6366f1;
            padding-top: 3px;
          }

          .style-tags { display: flex; flex-wrap: wrap; gap: 5px; }

          .style-tag {
            display: inline-flex;
            align-items: center;
            height: 22px;
            padding: 0 10px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 500;
          }

          .style-tag.vocab  { background: #e0e7ff; color: #3730a3; }
          .style-tag.domain { background: #ede9fe; color: #6d28d9; }

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
