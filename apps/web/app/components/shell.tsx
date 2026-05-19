'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV_MAIN = [
  { href: '/chat',     label: 'Chat'     },
  { href: '/sessions', label: 'Sessions' },
  { href: '/memories', label: 'Memories' },
];

const NAV_DEV = [
  { href: '/episodes', label: 'Episodes' },
  { href: '/search',   label: 'Search'   },
];

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();

  function isActive(href: string) {
    if (href === '/chat') return path === href;
    return path.startsWith(href);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">aL</div>
          <span className="brand-name">aiLog</span>
        </div>

        <Link href="/chat" className="new-chat">
          + New chat
        </Link>

        <nav className="nav">
          {NAV_MAIN.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? 'nav-item active' : 'nav-item'}
            >
              {item.label}
            </Link>
          ))}

          <div className="nav-divider" />

          {NAV_DEV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(item.href) ? 'nav-item nav-dev active' : 'nav-item nav-dev'}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          <span>online</span>
        </div>
      </aside>

      <main className="content">{children}</main>

      <style>{`
        .shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 200px 1fr;
          background: #f8fafc;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
          color: #1e293b;
        }

        .sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          display: flex;
          flex-direction: column;
          padding: 20px 12px;
          background: #0f172a;
          overflow-y: auto;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 6px 20px;
          margin-bottom: 4px;
        }

        .logo {
          width: 28px;
          height: 28px;
          border-radius: 7px;
          background: #6366f1;
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 11px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .brand-name {
          font-size: 14px;
          font-weight: 600;
          color: #e2e8f0;
          letter-spacing: -0.01em;
        }

        .new-chat {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 34px;
          border-radius: 8px;
          background: rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 16px;
          transition: background 0.15s;
        }

        .new-chat:hover {
          background: rgba(99, 102, 241, 0.25);
        }

        .nav {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          height: 34px;
          padding: 0 10px;
          border-radius: 7px;
          color: #64748b;
          font-size: 13px;
          font-weight: 500;
          transition: background 0.1s, color 0.1s;
        }

        .nav-item:hover {
          background: rgba(255,255,255,0.05);
          color: #94a3b8;
        }

        .nav-item.active {
          background: rgba(99, 102, 241, 0.14);
          color: #a5b4fc;
        }

        .nav-dev {
          font-size: 12px;
          color: #334155;
        }

        .nav-dev:hover { color: #475569; }
        .nav-dev.active { color: #818cf8; }

        .nav-divider {
          height: 1px;
          background: rgba(255,255,255,0.05);
          margin: 10px 4px;
        }

        .sidebar-footer {
          margin-top: auto;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 0 8px;
          font-size: 11px;
          color: #1e293b;
        }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          flex-shrink: 0;
        }

        .content {
          min-width: 0;
          padding: 40px 32px;
        }

        @media (max-width: 768px) {
          .shell { grid-template-columns: 1fr; }
          .sidebar { display: none; }
          .content { padding: 20px 16px; }
        }
      `}</style>
    </div>
  );
}
