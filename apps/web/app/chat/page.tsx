'use client';

import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { getEpisodeRawlogs, getSessionRawLogs, sendChatMessage } from '../../lib/api-client';
import type { RawLogResponse } from '../../lib/types';

/* ── Markdown renderer ───────────────────────────────────────────────── */

function renderInline(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const candidates: { index: number; len: number; node: ReactNode }[] = [];

    const bold = remaining.match(/\*\*(.+?)\*\*/);
    if (bold?.index !== undefined)
      candidates.push({ index: bold.index, len: bold[0].length, node: <strong key={key++}>{bold[1]}</strong> });

    const italic = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);
    if (italic?.index !== undefined)
      candidates.push({ index: italic.index, len: italic[0].length, node: <em key={key++}>{italic[1]}</em> });

    const code = remaining.match(/`([^`]+)`/);
    if (code?.index !== undefined)
      candidates.push({ index: code.index, len: code[0].length, node: <code key={key++} className="md-icode">{code[1]}</code> });

    if (candidates.length === 0) { result.push(remaining); break; }

    const hit = candidates.sort((a, b) => a.index - b.index)[0];
    if (hit.index > 0) result.push(remaining.slice(0, hit.index));
    result.push(hit.node);
    remaining = remaining.slice(hit.index + hit.len);
  }

  return result;
}

function renderMarkdown(raw: string): ReactNode {
  const lines = raw.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0; // independent key counter — never shares a value between siblings

  while (i < lines.length) {
    const line = lines[i];

    /* code block */
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++; }
      out.push(
        <div key={k++} className="md-code-block">
          <div className="md-code-header">
            <span className="md-code-lang">◆ {lang || 'code'}</span>
            <span className="md-code-dots">● ● ●</span>
          </div>
          <pre className="md-code-body"><code>{code.join('\n')}</code></pre>
        </div>,
      );
      i++; continue;
    }

    /* headings */
    const h3m = line.match(/^### (.+)/);
    const h2m = line.match(/^## (.+)/);
    const h1m = line.match(/^# (.+)/);
    if (h1m) { out.push(<h2 key={k++} className="md-h1">{renderInline(h1m[1])}</h2>); i++; continue; }
    if (h2m) { out.push(<h3 key={k++} className="md-h2">{renderInline(h2m[1])}</h3>); i++; continue; }
    if (h3m) { out.push(<h4 key={k++} className="md-h3">{renderInline(h3m[1])}</h4>); i++; continue; }

    /* unordered list — collect consecutive items */
    if (/^[\-\*\+] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\-\*\+] /.test(lines[i])) { items.push(lines[i].slice(2)); i++; }
      out.push(
        <ul key={k++} className="md-ul">
          {items.map((t, j) => (
            <li key={j} className="md-li">
              <span className="md-bullet">•</span>
              <span>{renderInline(t)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    /* ordered list */
    if (/^\d+\. /.test(line)) {
      const items: { n: string; t: string }[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        const m = lines[i].match(/^(\d+)\. (.+)/);
        if (m) items.push({ n: m[1], t: m[2] });
        i++;
      }
      out.push(
        <ol key={k++} className="md-ol">
          {items.map((item, j) => (
            <li key={j} className="md-oli">
              <span className="md-num">{item.n}</span>
              <span>{renderInline(item.t)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    /* horizontal rule */
    if (/^[-*_]{3,}$/.test(line.trim())) {
      out.push(<hr key={k++} className="md-hr" />);
      i++; continue;
    }

    /* blockquote */
    if (line.startsWith('> ')) {
      const qs: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) { qs.push(lines[i].slice(2)); i++; }
      out.push(
        <blockquote key={k++} className="md-bq">
          {qs.map((t, j) => <p key={j} className="md-bq-p">{renderInline(t)}</p>)}
        </blockquote>,
      );
      continue;
    }

    /* blank line */
    if (line.trim() === '') { out.push(<div key={k++} className="md-gap" />); i++; continue; }

    /* paragraph */
    out.push(<p key={k++} className="md-p">{renderInline(line)}</p>);
    i++;
  }

  return <>{out}</>;
}

const STORAGE_KEY = 'ailog.active-session-id';
const STREAM_CHUNK = 7;   // chars per tick
const STREAM_INTERVAL = 12; // ms — ~583 chars/sec

type Msg = RawLogResponse & {
  _optimistic?: boolean;
  _streaming?: boolean;
  _displayed?: string;
};

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clientMeta() {
  if (typeof window === 'undefined') {
    return { client: 'web', device_type: 'unknown', client_message_id: uid() };
  }
  const mobile =
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(max-width: 820px)').matches;
  return {
    client: mobile ? 'mobile_web' : 'desktop_web',
    device_type: mobile ? 'mobile' : 'desktop',
    client_message_id: uid(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    user_agent: window.navigator.userAgent,
  };
}

function getSources(msg: RawLogResponse) {
  const s = msg.metadata?.sources;
  return Array.isArray(s)
    ? s.filter(
        (x): x is { title?: string | null; url: string } =>
          typeof x === 'object' && x !== null && typeof (x as { url?: unknown }).url === 'string',
      )
    : [];
}

function getContext(msg: RawLogResponse) {
  const c = msg.metadata?.context_used;
  return Array.isArray(c)
    ? c.filter(
        (x): x is { episode_id: string; title: string; score: number } =>
          typeof x === 'object' &&
          x !== null &&
          typeof (x as { episode_id?: unknown }).episode_id === 'string' &&
          typeof (x as { score?: unknown }).score === 'number',
      )
    : [];
}

function MemoryBanner({ ctx }: { ctx: { episode_id: string; title: string; score: number }[] }) {
  const [open, setOpen] = useState(false);
  const [rawlogs, setRawlogs] = useState<RawLogResponse[] | null>(null);
  const [rawlogsLoading, setRawlogsLoading] = useState(false);
  const [rawlogsError, setRawlogsError] = useState<string | null>(null);

  if (ctx.length === 0) return null;
  const ep = ctx[0];

  function loadRawlogs(e: React.MouseEvent) {
    e.stopPropagation();
    if (rawlogs !== null || rawlogsLoading) return;
    setRawlogsLoading(true);
    void getEpisodeRawlogs(ep.episode_id)
      .then((logs) => { setRawlogs(logs); setRawlogsLoading(false); })
      .catch((err) => {
        setRawlogsError(err instanceof Error ? err.message : 'Failed to load');
        setRawlogsLoading(false);
      });
  }

  return (
    <div className="mem-banner" onClick={() => setOpen((v) => !v)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setOpen((v) => !v)}>
      <span className="mem-banner-icon">◈</span>
      <span className="mem-banner-text">
        <strong>{ep.title}</strong>
      </span>
      <span className="mem-banner-score">{ep.score.toFixed(2)}</span>
      <span className="mem-banner-toggle">{open ? '▲' : '▼'}</span>
      {open && (
        <div className="mem-banner-detail" onClick={(e) => e.stopPropagation()}>
          <p className="mem-detail-label">연관 기억</p>
          <p className="mem-detail-value">{ep.title}</p>
          <p className="mem-detail-label">ID</p>
          <Link
            href={`/episodes/${ep.episode_id}`}
            className="mem-detail-value mono mem-ep-link"
            onClick={(e) => e.stopPropagation()}
          >
            {ep.episode_id} ↗
          </Link>
          <button
            className="mem-rawlog-btn"
            type="button"
            onClick={loadRawlogs}
          >
            {rawlogsLoading ? '불러오는 중…' : rawlogs !== null ? '대화 내용 로드됨' : '관련 대화 보기 →'}
          </button>
          {rawlogsError && (
            <p className="mem-rawlog-error">✕ {rawlogsError}</p>
          )}
          {rawlogs !== null && (
            <div className="mem-rawlog-list">
              {rawlogs.length === 0 ? (
                <p className="mem-rawlog-empty">No rawlogs linked.</p>
              ) : (
                rawlogs.map((msg) => (
                  <div key={msg.rawlog_id} className={`mem-rl-row ${msg.speaker_type}`}>
                    <span className={`mem-rl-badge ${msg.speaker_type}`}>
                      {msg.speaker_type === 'user' ? '▸' : '◆'}
                    </span>
                    <p className="mem-rl-content">{msg.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [input, setInput]       = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus]     = useState('Ready');
  const [isSending, setIsSending] = useState(false);

  const initializedRef = useRef(false);
  const streamRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const prevLenRef     = useRef(0);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  /* ── viewport height (mobile keyboard) ── */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const set = () =>
      document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
    set();
    window.addEventListener('resize', set);
    window.visualViewport?.addEventListener('resize', set);
    return () => {
      window.removeEventListener('resize', set);
      window.visualViewport?.removeEventListener('resize', set);
    };
  }, []);

  /* ── restore session ── */
  useEffect(() => {
    if (initializedRef.current || typeof window === 'undefined') return;
    initializedRef.current = true;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    setStatus('Restoring conversation…');
    setSessionId(stored);
    void getSessionRawLogs(stored)
      .then((r) => { setMessages(r.messages); setStatus('Conversation restored'); })
      .catch(() => {
        window.localStorage.removeItem(STORAGE_KEY);
        setSessionId(null);
        setStatus('Could not restore session');
      });
  }, []);

  /* ── scroll to bottom on new messages ── */
  useEffect(() => {
    if (messages.length === 0) return;
    const isHistory = prevLenRef.current === 0 && messages.length > 1;
    bottomRef.current?.scrollIntoView({ behavior: isHistory ? 'instant' : 'smooth' });
    prevLenRef.current = messages.length;
  }, [messages.length]);

  /* ── also scroll while streaming ── */
  useEffect(() => {
    if (isSending) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isSending]);

  /* ── cleanup stream on unmount ── */
  useEffect(() => () => { if (streamRef.current) clearInterval(streamRef.current); }, []);

  /* ── stream assistant reply character by character ── */
  function streamReply(msg: RawLogResponse) {
    const full = msg.content;
    setMessages((prev) => [...prev, { ...msg, _streaming: true, _displayed: '' }]);
    let pos = 0;
    streamRef.current = setInterval(() => {
      pos = Math.min(pos + STREAM_CHUNK, full.length);
      setMessages((prev) =>
        prev.map((m) =>
          m.rawlog_id === msg.rawlog_id
            ? { ...m, _displayed: full.slice(0, pos), _streaming: pos < full.length }
            : m,
        ),
      );
      if (pos >= full.length) {
        clearInterval(streamRef.current!);
        streamRef.current = null;
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, STREAM_INTERVAL);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    /* optimistic user message */
    const tempId = uid();
    const optimistic: Msg = {
      rawlog_id: tempId,
      session_id: sessionId || '',
      sequence_no: messages.filter((m) => m.speaker_type === 'user').length,
      speaker_type: 'user',
      content: trimmed,
      occurred_at: new Date().toISOString(),
      message_type: 'question',
      reply_to_rawlog_id: null,
      source_model: null,
      stored_at: null,
      metadata: null,
      _optimistic: true,
    };

    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setIsSending(true);
    setStatus('Generating reply…');

    /* auto-grow textarea reset */
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const res = await sendChatMessage({
        session_id: sessionId,
        title: 'Web chat session',
        content: trimmed,
        metadata: clientMeta(),
      });

      setSessionId(res.session_id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, res.session_id);
      }

      /* replace optimistic with confirmed user message */
      setMessages((prev) => [
        ...prev.filter((m) => m.rawlog_id !== tempId),
        res.user_message,
      ]);

      setIsSending(false);
      setStatus('');
      streamReply(res.assistant_message);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.rawlog_id !== tempId));
      setStatus(err instanceof Error ? `✕ ${err.message}` : '✕ Failed to send');
      setIsSending(false);
    }
  }

  function handleReset() {
    if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; }
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    setSessionId(null);
    setMessages([]);
    setInput('');
    setStatus('New chat started');
    prevLenRef.current = 0;
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  const rawLogHref = sessionId ? `/chat/${sessionId}` : '/sessions';

  return (
    <main className="shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">aL</div>
          <span className="brand-name">aiLog</span>
        </div>

        <button className="new-chat-btn" onClick={handleReset} type="button">
          <span className="new-chat-plus">+</span>
          New chat
        </button>

        <nav className="sidebar-nav">
          <Link className="nav-item active" href={rawLogHref}>
            <span className="nav-sym">◆</span>대화 기록
          </Link>
          <Link className="nav-item" href="/sessions">
            <span className="nav-sym">▸</span>세션
          </Link>
          <Link className="nav-item" href="/episodes">
            <span className="nav-sym">▸</span>메모리
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="footer-dot" />
          <div>
            <p className="footer-title">aiLog</p>
            <p className="footer-id">{sessionId ? `▸ ${sessionId.slice(0, 12)}…` : '▸ No session'}</p>
          </div>
        </div>
      </aside>

      {/* ── Chat panel ── */}
      <section className="chat-panel">
        <header className="topbar">
          <button className="mobile-menu-btn" type="button" aria-label="Open menu">☰</button>
          <div className="topbar-title">
            <div className="topbar-logo">aL</div>
            <span>aiLog</span>
          </div>
          <nav className="topbar-nav">
            <Link className="topbar-link" href={rawLogHref}>대화 기록</Link>
            <Link className="topbar-link" href="/sessions">세션</Link>
            <Link className="topbar-link" href="/episodes">메모리</Link>
          </nav>
        </header>

        <section
          className={messages.length === 0 ? 'conversation empty' : 'conversation'}
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-logo">aL</div>
              <h1 className="empty-title">What can I help with?</h1>
              <p className="empty-sub">대화 내용을 기억하고 자연스럽게 이어갑니다</p>
            </div>
          ) : (
            <div className="msg-list">
              {messages.map((msg) => {
                const ctx = msg.speaker_type === 'assistant' ? getContext(msg) : [];
                const memUsed = ctx.length > 0;
                return (
                  <article
                    key={msg.rawlog_id}
                    className={msg.speaker_type === 'user' ? 'msg-row user-row' : 'msg-row asst-row'}
                  >
                    {msg.speaker_type !== 'user' && (
                      <div className={memUsed ? 'asst-avatar mem-avatar' : 'asst-avatar'}>
                        aL
                        {memUsed && <span className="mem-dot" title="Memory used" />}
                      </div>
                    )}

                    <div className="msg-body">
                      {msg.speaker_type === 'user' ? (
                        <p className="user-bubble">{msg.content}</p>
                      ) : msg._streaming ? (
                        <p className="asst-text">
                          {msg._displayed ?? ''}
                          <span className="cursor">▌</span>
                        </p>
                      ) : (
                        <div className="asst-md">{renderMarkdown(msg.content)}</div>
                      )}

                      {msg.speaker_type === 'assistant' && !msg._streaming && memUsed && (
                        <MemoryBanner ctx={ctx} />
                      )}

                      {msg.speaker_type === 'assistant' && !msg._streaming && getSources(msg).length > 0 && (
                        <div className="msg-meta">
                          <div className="meta-row">
                            <span className="meta-label">◆ Sources</span>
                            {getSources(msg).slice(0, 4).map((s) => (
                              <a className="meta-chip" href={s.url} key={s.url} rel="noreferrer" target="_blank">
                                {s.title || s.url}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}

              {isSending && (
                <article className="msg-row asst-row">
                  <div className="asst-avatar">aL</div>
                  <div className="typing">
                    <span /><span /><span /><span />
                  </div>
                </article>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <div className="composer-wrap">
          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              aria-label="Message aiLog"
              placeholder="Message aiLog…"
              rows={1}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoGrow(e.target); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="composer-footer">
              <div className="composer-left">
                <button className="tool-btn" type="button" aria-label="Attach">+</button>
                <button className="text-tool" type="button">Tools</button>
              </div>
              <button
                className="send-btn"
                type="submit"
                disabled={isSending || !input.trim()}
                aria-label="Send"
              >
                ↑
              </button>
            </div>
          </form>
          <p className="status-line">{status}</p>
        </div>
      </section>

      <style>{`
        html, body {
          margin: 0;
          background: #fff;
          color: #1e293b;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        }

        * { box-sizing: border-box; }

        /* ── Layout ── */
        .shell {
          min-height: var(--app-h, 100vh);
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr);
        }

        /* ── Sidebar ── */
        .sidebar {
          height: var(--app-h, 100vh);
          position: sticky;
          top: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 16px 12px;
          background: #0f172a;
          color: #94a3b8;
          overflow-y: auto;
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 8px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          margin-bottom: 6px;
        }

        .brand-logo {
          width: 32px; height: 32px;
          border-radius: 8px;
          background: #6366f1;
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .brand-name {
          font-size: 15px;
          font-weight: 700;
          color: #e2e8f0;
          letter-spacing: -0.01em;
        }

        .new-chat-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          height: 38px;
          padding: 0 12px;
          border: 0;
          border-radius: 8px;
          background: rgba(99,102,241,0.14);
          color: #a5b4fc;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
          margin-bottom: 4px;
        }

        .new-chat-btn:hover { background: rgba(99,102,241,0.24); }

        .new-chat-plus { font-size: 20px; font-weight: 300; line-height: 1; }

        .sidebar-nav { flex: 1; min-height: 0; overflow-y: auto; }

        .nav-section {
          margin: 10px 8px 4px;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #334155;
          font-weight: 600;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 36px;
          padding: 0 10px;
          border-radius: 8px;
          color: #94a3b8;
          font-size: 14px;
          transition: background 0.12s, color 0.12s;
        }

        .nav-item:hover { background: rgba(255,255,255,0.06); color: #cbd5e1; }
        .nav-item.active { background: rgba(99,102,241,0.16); color: #a5b4fc; }

        .nav-sym { font-size: 9px; width: 12px; text-align: center; flex-shrink: 0; }

        .sidebar-footer {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 8px 4px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        .footer-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #22c55e;
          flex-shrink: 0;
          box-shadow: 0 0 6px #22c55e88;
        }

        .footer-title { margin: 0; font-size: 13px; color: #e2e8f0; font-weight: 600; }
        .footer-id    { margin: 2px 0 0; font-size: 11px; color: #475569; font-family: ui-monospace, monospace; }

        /* ── Chat panel ── */
        .chat-panel {
          min-width: 0;
          min-height: var(--app-h, 100vh);
          max-height: var(--app-h, 100vh);
          display: grid;
          grid-template-rows: 52px minmax(0, 1fr) auto;
          background: #ffffff;
        }

        /* ── Topbar ── */
        .topbar {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 52px;
          padding: 0 16px;
          background: rgba(255,255,255,0.88);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid #f1f5f9;
        }

        .mobile-menu-btn {
          display: none;
          width: 36px; height: 36px;
          border: 0; border-radius: 8px;
          background: transparent;
          color: #1e293b;
          font-size: 18px;
          cursor: pointer;
        }

        .topbar-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 700;
          color: #1e293b;
        }

        .topbar-logo {
          width: 26px; height: 26px;
          border-radius: 6px;
          background: #6366f1;
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 10px;
          font-weight: 700;
        }

        .topbar-nav { display: flex; gap: 6px; }

        .topbar-link {
          height: 32px;
          display: inline-flex;
          align-items: center;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid #e2e8f0;
          font-size: 13px;
          color: #64748b;
          transition: border-color 0.15s, color 0.15s;
        }

        .topbar-link:hover { border-color: #a5b4fc; color: #6366f1; }

        /* ── Conversation ── */
        .conversation {
          overflow-y: auto;
          padding: 20px 16px 180px;
          scroll-behavior: smooth;
        }

        .conversation.empty {
          display: grid;
          place-items: center;
        }

        .empty-state {
          text-align: center;
          padding: 40px 24px;
        }

        .empty-logo {
          width: 56px; height: 56px;
          margin: 0 auto 20px;
          border-radius: 16px;
          background: linear-gradient(135deg, #6366f1, #818cf8);
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 18px;
          font-weight: 800;
          box-shadow: 0 8px 24px rgba(99,102,241,0.3);
        }

        .empty-title {
          margin: 0 0 8px;
          font-size: 26px;
          font-weight: 700;
          color: #1e293b;
          letter-spacing: -0.02em;
        }

        .empty-sub {
          margin: 0;
          font-size: 14px;
          color: #94a3b8;
        }

        /* ── Messages ── */
        .msg-list {
          width: min(100%, 740px);
          margin: 0 auto;
          display: grid;
          gap: 20px;
        }

        .msg-row {
          display: flex;
          gap: 12px;
          font-size: 15px;
          line-height: 1.65;
          animation: msgIn 0.25s ease-out both;
        }

        .user-row {
          justify-content: flex-end;
          animation: userMsgIn 0.22s ease-out both;
        }

        .asst-row { align-items: flex-start; }

        .asst-avatar {
          width: 28px; height: 28px;
          border-radius: 8px;
          background: linear-gradient(135deg, #6366f1, #818cf8);
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 10px;
          font-weight: 700;
          flex-shrink: 0;
          margin-top: 2px;
          box-shadow: 0 2px 8px rgba(99,102,241,0.3);
        }

        .msg-body {
          min-width: 0;
          max-width: 100%;
        }

        .user-row .msg-body {
          max-width: min(72%, 560px);
        }

        .asst-name {
          margin: 0 0 5px;
          font-size: 13px;
          font-weight: 700;
          color: #6366f1;
          letter-spacing: 0.01em;
        }

        .user-bubble {
          display: inline-block;
          margin: 0;
          padding: 10px 16px;
          border-radius: 20px 20px 4px 20px;
          background: #6366f1;
          color: #ffffff;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          box-shadow: 0 2px 12px rgba(99,102,241,0.25);
        }

        .asst-text {
          margin: 0;
          color: #1e293b;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        /* ── Markdown styles ── */
        .asst-md {
          color: #1e293b;
          font-size: 15px;
          line-height: 1.7;
          overflow-wrap: anywhere;
        }

        .asst-md > * + * { margin-top: 10px; }

        .md-p {
          margin: 0;
          line-height: 1.7;
        }

        .md-gap { height: 6px; }

        /* Headings */
        .md-h1 {
          margin: 4px 0 2px;
          font-size: 17px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.01em;
          line-height: 1.3;
        }

        .md-h2 {
          margin: 4px 0 2px;
          font-size: 15px;
          font-weight: 700;
          color: #1e293b;
          line-height: 1.3;
        }

        .md-h3 {
          margin: 4px 0 2px;
          font-size: 14px;
          font-weight: 700;
          color: #475569;
          line-height: 1.3;
        }

        /* Unordered list */
        .md-ul {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 5px;
        }

        .md-li {
          display: flex;
          gap: 9px;
          align-items: baseline;
          line-height: 1.65;
        }

        .md-bullet {
          color: #94a3b8;
          font-size: 14px;
          flex-shrink: 0;
          line-height: 1.65;
        }

        /* Ordered list */
        .md-ol {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 6px;
        }

        .md-oli {
          display: flex;
          gap: 10px;
          align-items: baseline;
          line-height: 1.65;
        }

        .md-num {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #eef2ff;
          color: #6366f1;
          display: grid;
          place-items: center;
          font-size: 10px;
          font-weight: 800;
          flex-shrink: 0;
          line-height: 1;
        }

        /* Code block */
        .md-code-block {
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid #1e293b22;
          background: #0f172a;
        }

        .md-code-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 14px 7px;
          background: #1e293b;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .md-code-lang {
          font-size: 11px;
          font-weight: 700;
          color: #a5b4fc;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .md-code-dots {
          font-size: 8px;
          color: #475569;
          letter-spacing: 2px;
        }

        .md-code-body {
          margin: 0;
          padding: 14px 16px;
          overflow-x: auto;
          font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
          font-size: 13px;
          line-height: 1.6;
          color: #e2e8f0;
        }

        /* Inline code */
        .md-icode {
          display: inline;
          padding: 1px 6px;
          border-radius: 5px;
          background: #f1f5f9;
          color: #6366f1;
          font-family: ui-monospace, monospace;
          font-size: 13px;
          border: 1px solid #e2e8f0;
        }

        /* Blockquote */
        .md-bq {
          margin: 0;
          padding: 10px 14px;
          border-left: 3px solid #6366f1;
          background: #eef2ff;
          border-radius: 0 8px 8px 0;
        }

        .md-bq-p {
          margin: 0;
          color: #4338ca;
          font-style: italic;
          line-height: 1.6;
        }

        .md-hr {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 4px 0;
        }

        .asst-md strong { font-weight: 700; color: #0f172a; }
        .asst-md em    { font-style: italic; color: #475569; }

        .cursor {
          display: inline-block;
          color: #6366f1;
          font-weight: 400;
          animation: blink 0.7s infinite;
          margin-left: 1px;
        }

        .msg-meta {
          display: grid;
          gap: 6px;
          margin-top: 10px;
        }

        .meta-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .meta-label {
          font-size: 11px;
          font-weight: 700;
          color: #6366f1;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .meta-chip {
          display: inline-flex;
          align-items: center;
          height: 24px;
          max-width: 240px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #6366f1;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
          overflow: hidden;
          transition: background 0.12s, border-color 0.12s;
        }

        .meta-chip:hover { background: #eef2ff; border-color: #c7d2fe; }
        .meta-chip.memory { background: #f0fdf4; border-color: #bbf7d0; color: #16a34a; }
        .meta-chip.memory:hover { background: #dcfce7; }

        /* ── Memory avatar dot ── */
        .mem-avatar { position: relative; overflow: visible; }

        .mem-dot {
          position: absolute;
          bottom: -3px; right: -3px;
          width: 10px; height: 10px;
          border-radius: 50%;
          background: #22c55e;
          border: 2px solid #fff;
          box-shadow: 0 0 6px #22c55e99;
          pointer-events: none;
        }

        /* ── Memory banner ── */
        .mem-banner {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
          padding: 6px 10px;
          border-radius: 8px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          cursor: pointer;
          user-select: none;
          position: relative;
          flex-wrap: wrap;
        }

        .mem-banner:hover { background: #dcfce7; }

        .mem-banner-icon {
          font-size: 12px;
          color: #16a34a;
          flex-shrink: 0;
        }

        .mem-banner-text {
          font-size: 12px;
          color: #15803d;
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mem-banner-text strong { font-weight: 700; }

        .mem-banner-score {
          font-size: 11px;
          color: #16a34a;
          font-family: ui-monospace, monospace;
          background: #dcfce7;
          padding: 1px 6px;
          border-radius: 999px;
          flex-shrink: 0;
        }

        .mem-banner-toggle {
          font-size: 9px;
          color: #86efac;
          flex-shrink: 0;
        }

        .mem-banner-detail {
          width: 100%;
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px solid #bbf7d0;
          display: grid;
          gap: 2px;
        }

        .mem-detail-label {
          margin: 0;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #86efac;
        }

        .mem-detail-value {
          margin: 0 0 6px;
          font-size: 12px;
          color: #15803d;
          line-height: 1.5;
        }

        .mem-detail-value.mono {
          font-family: ui-monospace, monospace;
          font-size: 11px;
          color: #4ade80;
          word-break: break-all;
        }

        .mem-ep-link {
          text-decoration: none;
          border-bottom: 1px dashed #4ade8088;
        }
        .mem-ep-link:hover { border-bottom-style: solid; }

        .mem-rawlog-btn {
          display: inline-flex;
          align-items: center;
          margin-top: 4px;
          height: 28px;
          padding: 0 12px;
          border-radius: 8px;
          background: #16a34a;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          border: 0;
          cursor: pointer;
          transition: background 0.12s;
          width: fit-content;
        }
        .mem-rawlog-btn:hover { background: #15803d; }

        .mem-rawlog-error {
          margin: 4px 0 0;
          font-size: 11px;
          color: #ef4444;
        }

        .mem-rawlog-empty {
          margin: 4px 0 0;
          font-size: 11px;
          color: #86efac;
        }

        .mem-rawlog-list {
          margin-top: 8px;
          display: grid;
          gap: 6px;
          max-height: 300px;
          overflow-y: auto;
          border-top: 1px solid #bbf7d0;
          padding-top: 8px;
        }

        .mem-rl-row {
          display: flex;
          gap: 8px;
          align-items: flex-start;
          padding: 6px 8px;
          border-radius: 6px;
          background: rgba(255,255,255,0.6);
        }

        .mem-rl-row.assistant { border-left: 2px solid #6366f1; }
        .mem-rl-row.user { border-left: 2px solid #bbf7d0; }

        .mem-rl-badge {
          font-size: 9px;
          flex-shrink: 0;
          margin-top: 3px;
        }
        .mem-rl-badge.assistant { color: #6366f1; }
        .mem-rl-badge.user { color: #4ade80; }

        .mem-rl-content {
          margin: 0;
          font-size: 11px;
          color: #15803d;
          line-height: 1.55;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        /* ── Typing indicator ── */
        .typing {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 14px 4px;
        }

        .typing span {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: #a5b4fc;
          animation: bounce 0.6s infinite ease-in-out;
        }

        .typing span:nth-child(2) { animation-delay: 0.1s; }
        .typing span:nth-child(3) { animation-delay: 0.2s; }
        .typing span:nth-child(4) { animation-delay: 0.3s; }

        /* ── Composer ── */
        .composer-wrap {
          position: sticky;
          bottom: 0;
          padding: 0 16px calc(16px + env(safe-area-inset-bottom));
          background: linear-gradient(to top, #fff 72%, rgba(255,255,255,0));
        }

        .composer {
          width: min(100%, 740px);
          margin: 0 auto;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 8px;
          background: #fff;
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.02),
            0 4px 20px rgba(0,0,0,0.08),
            0 0 0 3px transparent;
          transition: box-shadow 0.15s, border-color 0.15s;
        }

        .composer:focus-within {
          border-color: #a5b4fc;
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.02),
            0 4px 20px rgba(99,102,241,0.12),
            0 0 0 3px rgba(99,102,241,0.08);
        }

        .composer textarea {
          width: 100%;
          min-height: 42px;
          max-height: 180px;
          display: block;
          border: 0;
          outline: 0;
          resize: none;
          padding: 8px 12px 4px;
          background: transparent;
          color: #1e293b;
          font-size: 15px;
          line-height: 1.55;
        }

        .composer textarea::placeholder { color: #94a3b8; }

        .composer-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 2px 2px 0;
        }

        .composer-left { display: flex; gap: 4px; }

        .tool-btn, .text-tool, .send-btn {
          border: 0;
          cursor: pointer;
          transition: background 0.12s;
        }

        .tool-btn {
          width: 30px; height: 30px;
          border-radius: 50%;
          background: transparent;
          color: #64748b;
          font-size: 20px;
          display: grid;
          place-items: center;
          line-height: 1;
        }

        .tool-btn:hover { background: #f1f5f9; }

        .text-tool {
          height: 30px;
          border-radius: 15px;
          padding: 0 12px;
          background: transparent;
          color: #64748b;
          font-size: 13px;
        }

        .text-tool:hover { background: #f1f5f9; }

        .send-btn {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: #6366f1;
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          display: grid;
          place-items: center;
          box-shadow: 0 2px 8px rgba(99,102,241,0.35);
          transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
        }

        .send-btn:hover:not(:disabled) {
          background: #4f46e5;
          transform: scale(1.06);
          box-shadow: 0 4px 12px rgba(99,102,241,0.45);
        }

        .send-btn:disabled {
          background: #e2e8f0;
          color: #94a3b8;
          cursor: default;
          box-shadow: none;
        }

        .status-line {
          width: min(100%, 740px);
          margin: 6px auto 0;
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
          letter-spacing: 0.02em;
        }

        /* ── Mobile ── */
        @media (max-width: 820px) {
          .shell { grid-template-columns: 1fr; }
          .sidebar { display: none; }
          .mobile-menu-btn { display: grid; place-items: center; }
          .topbar { padding: 0 10px; }
          .conversation { padding: 16px 12px 180px; }
          .topbar-nav { gap: 4px; }
          .topbar-link { padding: 0 10px; font-size: 12px; }
        }
      `}</style>
    </main>
  );
}
