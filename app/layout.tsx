import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Investment Calculator API',
  description: 'API server for InvestLongTerm app',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
