'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import Shell from '../../components/shell';
import { getSession, getSessionRawLogs } from '../../../lib/api-client';
import type { RawLogResponse, SessionResponse } from '../../../lib/types';

export default function SessionHistoryPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [messages, setMessages] = useState<RawLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    Promise.all([
      getSession(sessionId),
      getSessionRawLogs(sessionId),
    ])
      .then(([sess, rawlogs]) => {
        if (cancelled) return;
        setSession(sess);
        setMessages(rawlogs.messages);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const title = session?.title || 'Conversation';
  const dateStr = session
    ? new Date(session.last_activity_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : '';

  return (
    <Shell>
      <div className="page">
        <header className="hist-header">
          <Link href="/sessions" className="back-btn">← Sessions</Link>
          <div className="hist-title-row">
            <h1 className="hist-title">{loading ? '…' : title}</h1>
            {dateStr && <span className="hist-date">{dateStr}</span>}
          </div>
          <p className="hist-count">
            {loading ? '' : `${messages.length} messages`}
          </p>
        </header>

        <div className="chat-log">
          {loading ? (
            <div className="loading-bubbles">
              {[80, 60, 90, 50].map((w, i) => (
                <div
                  key={i}
                  className={`bubble-skel ${i % 2 === 0 ? 'left' : 'right'}`}
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="empty">No messages in this session.</div>
          ) : (
            messages
              .filter((m) => m.speaker_type === 'user' || m.speaker_type === 'assistant')
              .map((msg) => {
                const isUser = msg.speaker_type === 'user';
                return (
                  <div key={msg.rawlog_id} className={`bubble-row ${isUser ? 'right' : 'left'}`}>
                    {!isUser && <div className="avatar ai-avatar">aL</div>}
                    <div className={`bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`}>
                      <p className="bubble-text">{msg.content}</p>
                      <span className="bubble-time">
                        {new Date(msg.occurred_at).toLocaleTimeString('en-US', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {isUser && <div className="avatar user-avatar">me</div>}
                  </div>
                );
              })
          )}
          <div ref={bottomRef} />
        </div>

        <style>{`
          .page { max-width: 760px; display: flex; flex-direction: column; gap: 0; }

          .hist-header {
            padding-bottom: 20px;
            border-bottom: 1px solid #e2e8f0;
            margin-bottom: 24px;
          }

          .back-btn {
            display: inline-flex;
            align-items: center;
            font-size: 13px;
            color: #6366f1;
            font-weight: 500;
            margin-bottom: 10px;
            opacity: 0.8;
            transition: opacity 0.12s;
          }
          .back-btn:hover { opacity: 1; }

          .hist-title-row {
            display: flex;
            align-items: baseline;
            gap: 12px;
            flex-wrap: wrap;
          }

          .hist-title {
            margin: 0;
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
            letter-spacing: -0.01em;
          }

          .hist-date {
            font-size: 13px;
            color: #94a3b8;
          }

          .hist-count {
            margin: 4px 0 0;
            font-size: 12px;
            color: #94a3b8;
          }

          .chat-log {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding-bottom: 40px;
          }

          .bubble-row {
            display: flex;
            align-items: flex-end;
            gap: 8px;
          }

          .bubble-row.right { flex-direction: row-reverse; }

          .avatar {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            font-size: 11px;
            font-weight: 700;
            flex-shrink: 0;
          }

          .ai-avatar  { background: #eef2ff; color: #6366f1; }
          .user-avatar{ background: #dcfce7; color: #16a34a; }

          .bubble {
            max-width: 75%;
            padding: 10px 14px;
            border-radius: 16px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .ai-bubble {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-bottom-left-radius: 4px;
          }

          .user-bubble {
            background: #6366f1;
            border-bottom-right-radius: 4px;
          }

          .bubble-text {
            margin: 0;
            font-size: 14px;
            line-height: 1.65;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }

          .ai-bubble .bubble-text   { color: #1e293b; }
          .user-bubble .bubble-text { color: #fff; }

          .bubble-time {
            font-size: 10px;
            align-self: flex-end;
          }

          .ai-bubble .bubble-time   { color: #94a3b8; }
          .user-bubble .bubble-time { color: rgba(255,255,255,0.6); }

          .loading-bubbles { display: flex; flex-direction: column; gap: 12px; padding: 8px 0; }

          .bubble-skel {
            height: 52px;
            border-radius: 16px;
            background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
            background-size: 200% 100%;
            animation: shimmer 1.4s infinite;
          }

          .bubble-skel.right { align-self: flex-end; }
          .bubble-skel.left  { align-self: flex-start; }

          .empty {
            text-align: center;
            padding: 56px 24px;
            color: #94a3b8;
            font-size: 15px;
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
