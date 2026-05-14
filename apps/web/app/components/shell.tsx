'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/chat',     label: 'Chat'     },
  { href: '/sessions', label: 'Sessions' },
  { href: '/episodes', label: 'Episodes' },
  { href: '/memories', label: 'Memories' },
  { href: '/search',   label: 'Search'   },
];

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();

  return (
    <div className="pg-shell">
      <aside className="pg-sidebar">
        <div className="pg-brand">
          <div className="pg-logo">aL</div>
          <span className="pg-brand-name">aiLog</span>
        </div>

        <Link href="/chat" className="pg-new-chat">
          <span className="pg-plus">+</span>
          New chat
        </Link>

        <nav>
          <p className="pg-nav-label">◆ Navigate</p>
          {NAV.map((item) => {
            const active =
              path === item.href ||
              (item.href !== '/chat' && path.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'pg-nav-item active' : 'pg-nav-item'}
              >
                <span className="pg-nav-sym">{active ? '◆' : '▸'}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="pg-sidebar-footer">
          <span className="pg-status-dot" />
          <span>Memory System</span>
        </div>
      </aside>

      <main className="pg-content">{children}</main>

      <style>{`
        .pg-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 240px 1fr;
          background: #f1f5f9;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
          color: #1e293b;
        }

        .pg-sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 16px 12px;
          background: #0f172a;
          color: #94a3b8;
          overflow-y: auto;
        }

        .pg-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 8px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 6px;
        }

        .pg-logo {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #6366f1;
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .pg-brand-name {
          font-size: 15px;
          font-weight: 700;
          color: #e2e8f0;
          letter-spacing: -0.01em;
        }

        .pg-new-chat {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 38px;
          padding: 0 12px;
          border-radius: 8px;
          background: rgba(99, 102, 241, 0.14);
          color: #a5b4fc;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.15s;
          margin-bottom: 4px;
        }

        .pg-new-chat:hover {
          background: rgba(99, 102, 241, 0.24);
        }

        .pg-plus {
          font-size: 20px;
          font-weight: 300;
          line-height: 1;
        }

        .pg-nav-label {
          margin: 10px 8px 4px;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #334155;
          font-weight: 600;
        }

        .pg-nav-item {
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

        .pg-nav-item:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #cbd5e1;
        }

        .pg-nav-item.active {
          background: rgba(99, 102, 241, 0.16);
          color: #a5b4fc;
        }

        .pg-nav-sym {
          font-size: 9px;
          width: 12px;
          text-align: center;
          flex-shrink: 0;
        }

        .pg-sidebar-footer {
          margin-top: auto;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          font-size: 12px;
          color: #334155;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .pg-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
          flex-shrink: 0;
          box-shadow: 0 0 6px #22c55e88;
        }

        .pg-content {
          min-width: 0;
          padding: 36px 28px;
        }

        @media (max-width: 768px) {
          .pg-shell {
            grid-template-columns: 1fr;
          }
          .pg-sidebar {
            display: none;
          }
          .pg-content {
            padding: 20px 16px;
          }
        }
      `}</style>
    </div>
  );
}
