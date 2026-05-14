'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import Shell from '../components/shell';
import { getSessions } from '../../lib/api-client';
import type { SessionResponse } from '../../lib/types';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [status, setStatus]     = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    void getSessions()
      .then((items) => {
        setSessions(items);
        setStatus(items.length === 0 ? 'No sessions yet' : `▸ ${items.length} sessions found`);
        setLoading(false);
      })
      .catch((err) => {
        setStatus(err instanceof Error ? `✕ ${err.message}` : '✕ Failed to load');
        setLoading(false);
      });
  }, []);

  return (
    <Shell>
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">◆ Saved Sessions</p>
          <h1 className="page-title">Stored conversations</h1>
          <p className="page-status">{status}</p>
        </header>

        <div className="card-list">
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className="skeleton" />)
          ) : sessions.length === 0 ? (
            <div className="empty">
              <p className="empty-icon">◆</p>
              <p className="empty-text">No sessions yet. Start chatting to create one.</p>
              <Link className="empty-cta" href="/chat">Open Chat →</Link>
            </div>
          ) : (
            sessions.map((s, idx) => (
              <Link
                key={s.session_id}
                href={`/chat/${s.session_id}`}
                className="session-card"
                style={{ animationDelay: `${idx * 35}ms` }}
              >
                <div className="card-top">
                  <span className="badge">{s.status}</span>
                  <span className="card-date">
                    {new Date(s.last_activity_at).toLocaleString('ko-KR', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <h2 className="card-title">{s.title || 'Untitled session'}</h2>
                <p className="card-id">▸ {s.session_id.slice(0, 20)}…</p>
              </Link>
            ))
          )}
        </div>

        <style>{`
          .page { max-width: 800px; }

          .page-header { margin-bottom: 28px; }

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

          .card-list { display: grid; gap: 10px; }

          .session-card {
            display: grid;
            gap: 8px;
            padding: 18px 20px;
            border-radius: 14px;
            background: #fff;
            border: 1px solid #e2e8f0;
            color: inherit;
            transition: box-shadow 0.15s, border-color 0.15s, transform 0.15s;
            animation: cardIn 0.35s ease-out both;
          }

          .session-card:hover {
            box-shadow: 0 4px 20px rgba(99,102,241,0.12);
            border-color: #c7d2fe;
            transform: translateY(-1px);
          }

          .card-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
          }

          .badge {
            display: inline-flex;
            align-items: center;
            height: 22px;
            padding: 0 9px;
            border-radius: 999px;
            background: #eef2ff;
            color: #6366f1;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }

          .card-date {
            font-size: 12px;
            color: #94a3b8;
          }

          .card-title {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #1e293b;
          }

          .card-id {
            margin: 0;
            font-size: 12px;
            color: #94a3b8;
            font-family: ui-monospace, monospace;
          }

          .skeleton {
            height: 94px;
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
          .empty-text { margin: 0 0 16px; color: #94a3b8; font-size: 15px; }

          .empty-cta {
            display: inline-flex;
            align-items: center;
            height: 38px;
            padding: 0 18px;
            border-radius: 999px;
            background: #6366f1;
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            transition: background 0.15s;
          }

          .empty-cta:hover { background: #4f46e5; }
        `}</style>
      </div>
    </Shell>
  );
}
