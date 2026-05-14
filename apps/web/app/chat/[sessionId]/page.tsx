'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import Shell from '../../components/shell';
import { getSessionRawLogs } from '../../../lib/api-client';
import type { RawLogResponse } from '../../../lib/types';

export default function SessionChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [messages, setMessages] = useState<RawLogResponse[]>([]);
  const [status, setStatus]     = useState('Loading…');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    void getSessionRawLogs(sessionId)
      .then((r) => {
        if (cancelled) return;
        setMessages(r.messages);
        setStatus(`▸ ${r.messages.length} messages`);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(err instanceof Error ? `✕ ${err.message}` : '✕ Failed to load');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <Shell>
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">◆ RawLog Session</p>
          <h1 className="page-title">Stored conversation</h1>
          <p className="session-id">▸ {sessionId}</p>
          <p className="page-status">{status}</p>
        </header>

        <div className="msg-list">
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className="skeleton" />)
          ) : messages.length === 0 ? (
            <div className="empty">
              <p className="empty-icon">◆</p>
              <p className="empty-text">No messages stored for this session.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <article
                key={msg.rawlog_id}
                className="msg-card"
                style={{ animationDelay: `${Math.min(idx * 25, 300)}ms` }}
              >
                <div className="card-top">
                  <span className={msg.speaker_type === 'user' ? 'badge user-badge' : 'badge asst-badge'}>
                    {msg.speaker_type === 'user' ? '▸ User' : '◆ aiLog'}
                  </span>
                  <span className="seq">#{msg.sequence_no}</span>
                  <span className="date">
                    {new Date(msg.occurred_at).toLocaleString('ko-KR', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>

                <p className="msg-text">{msg.content}</p>

                <div className="card-footer">
                  <span className="msg-type">◆ {msg.message_type || 'message'}</span>
                  <span className="rawlog-id">▸ {msg.rawlog_id.slice(0, 20)}…</span>
                </div>
              </article>
            ))
          )}
        </div>

        <style>{`
          .page { max-width: 800px; }

          .page-header { margin-bottom: 24px; }

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

          .session-id {
            margin: 0 0 4px;
            font-size: 12px;
            color: #94a3b8;
            font-family: ui-monospace, monospace;
            word-break: break-all;
          }

          .page-status {
            margin: 0;
            font-size: 13px;
            color: #94a3b8;
          }

          .msg-list { display: grid; gap: 10px; }

          .msg-card {
            display: grid;
            gap: 10px;
            padding: 16px 20px;
            border-radius: 14px;
            background: #fff;
            border: 1px solid #e2e8f0;
            transition: box-shadow 0.15s;
            animation: cardIn 0.3s ease-out both;
          }

          .msg-card:hover {
            box-shadow: 0 2px 12px rgba(99,102,241,0.08);
            border-color: #c7d2fe;
          }

          .card-top {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
          }

          .badge {
            display: inline-flex;
            align-items: center;
            height: 22px;
            padding: 0 9px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
          }

          .user-badge { background: #dcfce7; color: #16a34a; }
          .asst-badge { background: #eef2ff; color: #6366f1; }

          .seq { font-size: 12px; color: #94a3b8; }
          .date { font-size: 12px; color: #94a3b8; margin-left: auto; }

          .msg-text {
            margin: 0;
            font-size: 15px;
            line-height: 1.65;
            color: #334155;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }

          .card-footer {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            padding-top: 6px;
            border-top: 1px solid #f1f5f9;
          }

          .msg-type {
            font-size: 11px;
            color: #6366f1;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }

          .rawlog-id {
            font-size: 11px;
            color: #cbd5e1;
            font-family: ui-monospace, monospace;
          }

          .skeleton {
            height: 110px;
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
