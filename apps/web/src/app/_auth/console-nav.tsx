'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const NAV_ITEMS: NavItem[] = [
  {
    href: '/tickets',
    label: 'Tickets',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 5h16v9a2 2 0 0 1-2 2h-6l-4 3v-3H6a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    href: '/knowledge',
    label: 'Knowledge',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" />
        <path d="M4 19a2 2 0 0 0 2 2h12" />
      </svg>
    ),
  },
  {
    href: '/channels',
    label: 'Channels',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M5 12a7 7 0 0 1 7-7m0 14a7 7 0 0 1-7-7" />
        <path d="M9 12a3 3 0 0 1 3-3m0 6a3 3 0 0 1-3-3" />
        <circle cx="12" cy="12" r="1" />
        <path d="M16 5a10 10 0 0 1 0 14" />
      </svg>
    ),
  },
  {
    href: '/operations',
    label: 'Operations',
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 12h4l2 6 4-14 2 8h6" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    ),
  },
];

export function ConsoleNav({
  orientation = 'vertical',
}: {
  orientation?: 'vertical' | 'horizontal';
}) {
  const pathname = usePathname();

  return (
    <nav
      className={
        orientation === 'horizontal'
          ? 'flex flex-row gap-1'
          : 'flex flex-col gap-1'
      }
    >
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`nav-item ${active ? 'nav-item-active' : ''}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
