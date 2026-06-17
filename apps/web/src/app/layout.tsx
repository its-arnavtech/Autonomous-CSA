import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Autonomous CSA Operator Console',
    template: '%s | Autonomous CSA',
  },
  description:
    'Operator console for Autonomous CSA, a multi-tenant customer-support platform with routing, guardrails, and approval workflows.',
  applicationName: 'Autonomous CSA',
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%237c5cff'/%3E%3Cpath d='M16 7l8 4.5v9L16 25l-8-4.5v-9z' fill='none' stroke='%23a5f3ff' stroke-width='2' stroke-linejoin='round'/%3E%3Ccircle cx='16' cy='16' r='2.6' fill='%23a5f3ff'/%3E%3C/svg%3E",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#07080f',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
