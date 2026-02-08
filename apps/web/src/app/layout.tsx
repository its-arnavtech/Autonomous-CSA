import './globals.css';

export const metadata = {
  title: 'Agentic Support SaaS',
  description: 'AI-powered customer support platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100">
        {children}
      </body>
    </html>
  );
}
