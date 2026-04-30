'use client';

import type { FormEvent } from 'react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { getSessionRawLogs, sendChatMessage } from '../../lib/api-client';
import type { RawLogResponse } from '../../lib/types';

const STORAGE_KEY = 'ailog.active-session-id';

function createClientMessageId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getClientMetadata() {
  if (typeof window === 'undefined') {
    return {
      client: 'web',
      input_method: 'keyboard',
      device_type: 'unknown',
      network_retry: false,
      client_message_id: createClientMessageId(),
    };
  }

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const isNarrow = window.matchMedia('(max-width: 820px)').matches;
  const deviceType = isTouch || isNarrow ? 'mobile' : 'desktop';

  return {
    client: deviceType === 'mobile' ? 'mobile_web' : 'desktop_web',
    input_method: 'keyboard',
    device_type: deviceType,
    network_retry: false,
    client_message_id: createClientMessageId(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    user_agent: window.navigator.userAgent,
  };
}

function getMessageSources(message: RawLogResponse) {
  const sources = message.metadata?.sources;
  return Array.isArray(sources)
    ? sources.filter((source): source is { title?: string | null; url: string } => {
        return typeof source === 'object' && source !== null && typeof (source as { url?: unknown }).url === 'string';
      })
    : [];
}

function getMessageContext(message: RawLogResponse) {
  const context = message.metadata?.context_used;
  return Array.isArray(context)
    ? context.filter((item): item is { episode_id: string; title: string; score: number } => {
        return (
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { episode_id?: unknown }).episode_id === 'string' &&
          typeof (item as { title?: unknown }).title === 'string' &&
          typeof (item as { score?: unknown }).score === 'number'
        );
      })
    : [];
}

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<RawLogResponse[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready');
  const [isSending, setIsSending] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const setAppHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    };

    setAppHeight();
    window.addEventListener('resize', setAppHeight);
    window.visualViewport?.addEventListener('resize', setAppHeight);

    return () => {
      window.removeEventListener('resize', setAppHeight);
      window.visualViewport?.removeEventListener('resize', setAppHeight);
    };
  }, []);

  useEffect(() => {
    if (initializedRef.current || typeof window === 'undefined') {
      return;
    }

    initializedRef.current = true;
    const storedSessionId = window.localStorage.getItem(STORAGE_KEY);
    if (!storedSessionId) {
      return;
    }

    setStatus('Loading previous conversation...');
    setSessionId(storedSessionId);
    void getSessionRawLogs(storedSessionId)
      .then((response) => {
        setMessages(response.messages);
        setStatus('Previous conversation restored');
      })
      .catch(() => {
        window.localStorage.removeItem(STORAGE_KEY);
        setSessionId(null);
        setMessages([]);
        setStatus('Previous session could not be restored');
      });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    setIsSending(true);
    setStatus('Generating reply...');

    try {
      const response = await sendChatMessage({
        session_id: sessionId,
        title: 'Web chat session',
        content: trimmed,
        metadata: getClientMetadata(),
      });
      setSessionId(response.session_id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, response.session_id);
      }
      setMessages((prev) => [...prev, response.user_message, response.assistant_message]);
      setInput('');
      setStatus('Conversation saved');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save conversation');
    } finally {
      setIsSending(false);
    }
  }

  function handleReset() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setSessionId(null);
    setMessages([]);
    setInput('');
    setStatus('Started a new chat');
  }

  const rawLogHref = sessionId ? `/chat/${sessionId}` : '/sessions';

  return (
    <main className="chatgpt-shell">
      <aside className="sidebar" aria-label="Conversation navigation">
        <div className="sidebar-top">
          <button className="icon-button" type="button" aria-label="Toggle sidebar">
            ☰
          </button>
          <button className="icon-button" type="button" aria-label="Search chats">
            ⌕
          </button>
        </div>

        <button className="new-chat" onClick={handleReset} type="button">
          <span className="new-chat-icon">+</span>
          <span>New chat</span>
        </button>

        <nav className="history" aria-label="aiLog navigation">
          <p className="history-label">Navigate</p>
          <Link className="history-item active" href={rawLogHref}>
            RawLog
          </Link>
          <Link className="history-item" href="/sessions">
            Sessions
          </Link>
          <Link className="history-item" href="/episodes">
            Episodes
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="workspace-mark">aL</div>
          <div>
            <p className="workspace-title">aiLog</p>
            <p className="workspace-subtitle">{sessionId ? sessionId.slice(0, 8) : 'No session'}</p>
          </div>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Open menu">
            ☰
          </button>
          <button className="model-button" type="button">
            <span>aiLog</span>
            <span className="model-chevron">⌄</span>
          </button>
          <nav className="topbar-links" aria-label="aiLog pages">
            <Link className="share-button" href={rawLogHref}>
              RawLog
            </Link>
            <Link className="share-button" href="/sessions">
              Sessions
            </Link>
            <Link className="share-button" href="/episodes">
              Episodes
            </Link>
          </nav>
        </header>

        <section className={messages.length === 0 ? 'conversation empty' : 'conversation'} aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty-state">
              <h1>What can I help with?</h1>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article
                  className={message.speaker_type === 'user' ? 'message-row user-row' : 'message-row assistant-row'}
                  key={message.rawlog_id}
                >
                  {message.speaker_type !== 'user' ? <div className="assistant-avatar">aL</div> : null}
                  <div className="message-content">
                    {message.speaker_type !== 'user' ? <div className="message-author">aiLog</div> : null}
                    <p className={message.speaker_type === 'user' ? 'user-bubble' : 'assistant-text'}>
                      {message.content}
                    </p>
                    {message.speaker_type === 'assistant' ? (
                      <div className="message-meta">
                        {getMessageSources(message).length > 0 ? (
                          <div className="meta-block">
                            <span className="meta-label">Sources</span>
                            {getMessageSources(message).slice(0, 4).map((source) => (
                              <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
                                {source.title || source.url}
                              </a>
                            ))}
                          </div>
                        ) : null}
                        {getMessageContext(message).length > 0 ? (
                          <div className="meta-block">
                            <span className="meta-label">Memory</span>
                            {getMessageContext(message)
                              .slice(0, 3)
                              .map((item) => (
                                <Link href="/episodes" key={item.episode_id}>
                                  {item.title} · {item.score.toFixed(2)}
                                </Link>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
              {isSending ? (
                <article className="message-row assistant-row">
                  <div className="assistant-avatar">aL</div>
                  <div className="typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </article>
              ) : null}
            </div>
          )}
        </section>

        <div className="composer-wrap">
          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              aria-label="Message aiLog"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Message aiLog"
              rows={1}
              value={input}
            />
            <div className="composer-actions">
              <div className="left-actions">
                <button className="tool-button" type="button" aria-label="Attach file">
                  +
                </button>
                <button className="text-tool" type="button">
                  Tools
                </button>
              </div>
              <button className="send-button" disabled={isSending || !input.trim()} type="submit" aria-label="Send">
                ↑
              </button>
            </div>
          </form>
          <p className="status-line">{status}</p>
        </div>
      </section>

      <style>{`
        html,
        body {
          margin: 0;
          min-height: 100%;
          background: #ffffff;
          color: #0d0d0d;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        button,
        textarea {
          font: inherit;
        }

        .chatgpt-shell {
          min-height: var(--app-height, 100vh);
          display: grid;
          grid-template-columns: 260px minmax(0, 1fr);
          background: #ffffff;
          color: #0d0d0d;
        }

        .sidebar {
          height: var(--app-height, 100vh);
          position: sticky;
          top: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 12px;
          background: #171717;
          color: #f9f9f9;
        }

        .sidebar-top,
        .composer-actions,
        .left-actions,
        .topbar {
          display: flex;
          align-items: center;
        }

        .sidebar-top {
          justify-content: space-between;
        }

        .icon-button,
        .mobile-menu {
          width: 36px;
          height: 36px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: inherit;
          cursor: pointer;
          font-size: 18px;
        }

        .icon-button:hover,
        .mobile-menu:hover,
        .new-chat:hover,
        .history-item:hover {
          background: #2f2f2f;
        }

        .new-chat {
          width: 100%;
          height: 44px;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 0;
          border-radius: 10px;
          padding: 0 10px;
          background: transparent;
          color: #f9f9f9;
          cursor: pointer;
          text-align: left;
        }

        .new-chat-icon {
          width: 24px;
          height: 24px;
          display: inline-grid;
          place-items: center;
          border-radius: 6px;
          background: #ffffff;
          color: #171717;
          font-weight: 600;
        }

        .history {
          min-height: 0;
          flex: 1;
          overflow: auto;
          padding-top: 8px;
        }

        .history-label {
          margin: 12px 8px 6px;
          color: #b4b4b4;
          font-size: 12px;
        }

        .history-item {
          width: 100%;
          height: 36px;
          display: block;
          overflow: hidden;
          border: 0;
          border-radius: 8px;
          padding: 0 10px;
          background: transparent;
          color: #ececec;
          cursor: pointer;
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
          line-height: 36px;
          text-decoration: none;
        }

        .history-item.active {
          background: #2f2f2f;
        }

        .sidebar-footer {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 52px;
          border-radius: 10px;
          padding: 8px;
        }

        .workspace-mark,
        .assistant-avatar {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 50%;
          background: #10a37f;
          color: #ffffff;
          font-weight: 700;
        }

        .workspace-mark {
          width: 32px;
          height: 32px;
          font-size: 12px;
        }

        .workspace-title,
        .workspace-subtitle {
          margin: 0;
        }

        .workspace-title {
          font-size: 14px;
        }

        .workspace-subtitle {
          color: #b4b4b4;
          font-size: 12px;
        }

        .chat-panel {
          min-width: 0;
          min-height: var(--app-height, 100vh);
          max-height: var(--app-height, 100vh);
          display: grid;
          grid-template-rows: 56px minmax(0, 1fr) auto;
          background: #ffffff;
        }

        .topbar {
          position: sticky;
          top: 0;
          z-index: 2;
          justify-content: space-between;
          height: 56px;
          padding: 0 16px;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(12px);
        }

        .mobile-menu {
          display: none;
          color: #0d0d0d;
        }

        .model-button,
        .share-button {
          height: 38px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #0d0d0d;
          cursor: pointer;
        }

        .model-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 10px;
          font-size: 18px;
          font-weight: 600;
        }

        .topbar-links {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .model-button:hover,
        .share-button:hover,
        .tool-button:hover,
        .text-tool:hover {
          background: #f4f4f4;
        }

        .model-chevron {
          color: #6b6b6b;
          font-size: 18px;
        }

        .share-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #d9d9d9;
          padding: 0 14px;
          font-size: 14px;
          text-decoration: none;
        }

        .conversation {
          min-height: 0;
          overflow-y: auto;
          padding: 18px 18px 150px;
        }

        .conversation.empty {
          display: grid;
          align-items: end;
          padding-bottom: 24px;
        }

        .empty-state {
          width: min(100%, 760px);
          margin: 0 auto;
          padding-bottom: 112px;
          text-align: center;
        }

        .empty-state h1 {
          margin: 0;
          color: #2f2f2f;
          font-size: 28px;
          line-height: 1.2;
          font-weight: 600;
          letter-spacing: 0;
        }

        .message-list {
          width: min(100%, 760px);
          margin: 0 auto;
          display: grid;
          gap: 24px;
        }

        .message-row {
          display: flex;
          gap: 14px;
          line-height: 1.65;
          font-size: 16px;
        }

        .user-row {
          justify-content: flex-end;
        }

        .assistant-row {
          align-items: flex-start;
        }

        .assistant-avatar {
          width: 28px;
          height: 28px;
          margin-top: 3px;
          font-size: 11px;
        }

        .message-content {
          min-width: 0;
          max-width: 100%;
        }

        .user-row .message-content {
          max-width: min(70%, 560px);
        }

        .message-author {
          margin-bottom: 4px;
          font-size: 14px;
          font-weight: 600;
          color: #0d0d0d;
        }

        .user-bubble,
        .assistant-text {
          margin: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .user-bubble {
          border-radius: 22px;
          padding: 10px 16px;
          background: #f4f4f4;
          color: #0d0d0d;
        }

        .assistant-text {
          color: #0d0d0d;
        }

        .message-meta {
          display: grid;
          gap: 8px;
          margin-top: 12px;
          color: #5f6368;
          font-size: 12px;
          line-height: 1.35;
        }

        .meta-block {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }

        .meta-label {
          color: #7a7f87;
          font-weight: 600;
        }

        .meta-block a {
          max-width: 260px;
          overflow: hidden;
          border: 1px solid #e3e5e8;
          border-radius: 999px;
          padding: 3px 8px;
          color: #0f6b57;
          text-decoration: none;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .meta-block a:hover {
          background: #f3faf7;
        }

        .typing {
          display: flex;
          align-items: center;
          gap: 4px;
          min-height: 28px;
        }

        .typing span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #8f8f8f;
          animation: pulse 1.2s infinite ease-in-out;
        }

        .typing span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .typing span:nth-child(3) {
          animation-delay: 0.3s;
        }

        .composer-wrap {
          position: sticky;
          bottom: 0;
          padding: 0 18px calc(18px + env(safe-area-inset-bottom));
          background: linear-gradient(to top, #ffffff 78%, rgba(255, 255, 255, 0));
        }

        .composer {
          width: min(100%, 760px);
          margin: 0 auto;
          border: 1px solid #d9d9d9;
          border-radius: 28px;
          padding: 10px;
          background: #ffffff;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.02), 0 8px 28px rgba(0, 0, 0, 0.12);
        }

        .composer textarea {
          width: 100%;
          min-height: 44px;
          max-height: 180px;
          display: block;
          border: 0;
          outline: 0;
          resize: none;
          padding: 10px 12px 6px;
          background: transparent;
          color: #0d0d0d;
          font-size: 16px;
          line-height: 1.5;
        }

        .composer textarea::placeholder {
          color: #8f8f8f;
        }

        .composer-actions {
          justify-content: space-between;
          gap: 10px;
          padding: 2px 2px 0;
        }

        .left-actions {
          gap: 6px;
        }

        .tool-button,
        .text-tool,
        .send-button {
          border: 0;
          cursor: pointer;
        }

        .tool-button,
        .send-button {
          width: 32px;
          height: 32px;
          border-radius: 50%;
        }

        .tool-button {
          background: transparent;
          color: #5d5d5d;
          font-size: 22px;
          line-height: 1;
        }

        .text-tool {
          height: 32px;
          border-radius: 16px;
          padding: 0 12px;
          background: transparent;
          color: #5d5d5d;
          font-size: 14px;
        }

        .send-button {
          display: grid;
          place-items: center;
          background: #0d0d0d;
          color: #ffffff;
          font-size: 18px;
          font-weight: 700;
        }

        .send-button:disabled {
          background: #d7d7d7;
          color: #ffffff;
          cursor: default;
        }

        .status-line {
          width: min(100%, 760px);
          margin: 8px auto 0;
          color: #6b6b6b;
          font-size: 12px;
          line-height: 1.35;
          text-align: center;
        }

        @keyframes pulse {
          0%,
          80%,
          100% {
            opacity: 0.35;
            transform: translateY(0);
          }
          40% {
            opacity: 1;
            transform: translateY(-2px);
          }
        }

        @media (max-width: 820px) {
          .chatgpt-shell {
            grid-template-columns: 1fr;
          }

          .sidebar {
            display: none;
          }

          .mobile-menu {
            display: inline-grid;
            place-items: center;
          }

          .topbar {
            padding: 0 10px;
          }

          .model-button {
            font-size: 17px;
          }

          .conversation {
            padding: 14px 12px 150px;
          }

          .empty-state {
            padding-bottom: 96px;
          }

          .empty-state h1 {
            font-size: 26px;
          }

          .message-list {
            gap: 22px;
          }

          .user-row .message-content {
            max-width: 82%;
          }

          .composer-wrap {
            padding: 0 10px calc(12px + env(safe-area-inset-bottom));
          }

          .share-button {
            height: 36px;
            padding: 0 10px;
            font-size: 13px;
          }

          .topbar-links {
            gap: 4px;
          }
        }
      `}</style>
    </main>
  );
}
