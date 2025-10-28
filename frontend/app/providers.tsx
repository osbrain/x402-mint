'use client';

import { ReactNode, useMemo } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpcBase = process.env.NEXT_PUBLIC_BASE_RPC || 'https://mainnet.base.org';
const rpcBaseSepolia = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || 'https://sepolia.base.org';

const config = createConfig({
  chains: [base, baseSepolia],
  connectors: [injected()],
  transports: {
    [base.id]: http(rpcBase),
    [baseSepolia.id]: http(rpcBaseSepolia)
  }
});

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
