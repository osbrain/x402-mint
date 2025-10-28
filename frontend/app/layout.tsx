import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'LICODE Mint',
  description: 'Mint LICODE via the x402 flow on Base',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
