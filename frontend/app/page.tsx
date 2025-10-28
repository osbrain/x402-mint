'use client';

import axios from 'axios';
import QRCode from 'react-qr-code';
import { useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';

const erc20Abi = [
  {
    inputs: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

type Step = 'idle' | 'needpay' | 'verifying' | 'done' | 'err';
type MintTab = 'manual' | 'qr' | 'connect';

type Stats = {
  tokenAddress: string;
  treasury: string;
  distributor: string;
  owner: string;
  chainId: number;
  usdcAddress: string;
  totalSupplyTokens: string;
  mintedTokens: string;
  remainingTokens: string;
  mintedPercent: number;
  usdcCollected: string;
  totalUsdcCap: string;
  perWalletUsdcCap: string;
  mintUnitUsdc: string;
  mintUnitUsdc6: string;
};

const spark = (value?: string) => {
  if (!value) return '0';
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const sectionClass = 'rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur shadow-xl shadow-black/40';
const pillButton = 'px-4 py-2 rounded-full font-semibold border transition-colors';

export default function Page() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [activeTab, setActiveTab] = useState<MintTab>('manual');
  const [payTo, setPayTo] = useState('');
  const [amount6, setAmount6] = useState('1000000');
  const [txHashManual, setTxHashManual] = useState('');
  const [addrManual, setAddrManual] = useState('');
  const [msg, setMsg] = useState('');
  const [autoTxHash, setAutoTxHash] = useState<`0x${string}` | undefined>(undefined);

  const { address, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();
  const { data: receipt, isLoading: waitingReceipt } = useWaitForTransactionReceipt({ hash: autoTxHash, chainId: stats?.chainId });

  const amountReadable = useMemo(() => {
    if (stats) return stats.mintUnitUsdc;
    return (Number(amount6) / 1_000_000).toString();
  }, [stats, amount6]);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const r = await axios.get('/api/stats');
      setStats(r.data);
      setAmount6(r.data.mintUnitUsdc6 || '1000000');
      if (!payTo) setPayTo(r.data.treasury);
    } catch (error) {
      console.error('Failed to fetch stats', error);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (receipt && receipt.status === 'success' && autoTxHash && address) {
      handleVerify(autoTxHash, address, true);
      setAutoTxHash(undefined);
    }
  }, [receipt, autoTxHash, address]);

  const handleVerify = async (hash: string, wallet: string, auto?: boolean) => {
    const trimmedHash = hash.trim();
    const trimmedWallet = wallet.trim();
    if (!trimmedHash || !trimmedWallet) {
      setMsg('Wallet and transaction hash are required');
      return;
    }
    setStep('verifying');
    try {
      const r = await axios.post('/api/verify', { txHash: trimmedHash, user: trimmedWallet });
      if (r.data.ok) {
        setStep('done');
        setMsg(`Minted! Distributor tx: ${r.data.tx}`);
        fetchStats();
      } else {
        setStep('err');
        setMsg(r.data.error || 'Verification failed');
      }
    } catch (error: any) {
      setStep('err');
      setMsg(error?.response?.data?.error || error.message);
    } finally {
      if (!auto) setTxHashManual('');
    }
  };

  const askToMint = async () => {
    try {
      const r = await axios.get('/api/mint', { validateStatus: () => true });
      if (r.status === 402) {
        setPayTo(r.data.payTo);
        setAmount6(r.data.amount6);
        setStep('needpay');
        setMsg('Send the payment using the steps below.');
      } else {
        setStep('err');
        setMsg(r.data?.error || `Mint endpoint returned ${r.status}`);
      }
    } catch (error: any) {
      setStep('err');
      setMsg(error.message);
    }
  };

  const copyToClipboard = async (value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMsg('Copied to clipboard');
    } catch {
      setMsg('Copy failed, please copy manually');
    }
  };

  const qrValue = useMemo(() => {
    if (!stats) return '';
    return `ethereum:${stats.usdcAddress}@${stats.chainId}/transfer?address=${stats.treasury}&uint256=${stats.mintUnitUsdc6}`;
  }, [stats]);

  const handleWalletPayment = async () => {
    if (!stats || !address) {
      setMsg('Connect wallet first');
      return;
    }
    try {
      const hash = await writeContractAsync({
        address: stats.usdcAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [stats.treasury as `0x${string}`, parseUnits(stats.mintUnitUsdc, 6)],
        chainId: stats.chainId
      });
      setAutoTxHash(hash);
      setMsg('Payment sent. Waiting for confirmation...');
    } catch (error: any) {
      setMsg(error?.shortMessage || error?.message || 'Payment failed');
    }
  };

  const renderContractInfo = () => (
    <div className="space-y-3 text-sm">
      <AddressRow label="Treasury" value={stats?.treasury || payTo} onCopy={() => copyToClipboard(stats?.treasury || payTo)} />
      <AddressRow label="Distributor" value={stats?.distributor || ''} onCopy={() => copyToClipboard(stats?.distributor || '')} />
      <AddressRow label="Owner" value={stats?.owner || ''} onCopy={() => copyToClipboard(stats?.owner || '')} />
    </div>
  );

  return (
    <main className="min-h-screen px-4 py-10 text-white">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/30 flex items-center justify-center text-xl font-bold">L</div>
            <div>
              <h1 className="text-3xl font-bold">LICODE Mint</h1>
              <p className="text-sm text-white/70">Mint 1 USDC ➝ 5,000 LICODE on Base</p>
            </div>
          </div>
        </header>

        <section className={sectionClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Mint Progress</h2>
            <button className="text-sm flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full" onClick={fetchStats}>
              {statsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div className="space-y-3 text-sm text-white/80">
            <div className="space-y-2">
              <p>Progress</p>
              <div className="h-2 rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full bg-cyan-400"
                  style={{ width: `${Math.min(100, Math.max(0, stats?.mintedPercent || 0))}%` }}
                />
              </div>
              <p className="text-xs text-white/60">
                {spark(stats?.mintedTokens)} / {spark(stats?.totalSupplyTokens)} LICODE ({(stats?.mintedPercent || 0).toFixed(2)}%)
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="text-white/60 text-xs">USDC received</p>
                <p className="font-semibold">{spark(stats?.usdcCollected)} / {spark(stats?.totalUsdcCap)}</p>
              </div>
              <div>
                <p className="text-white/60 text-xs">Per-wallet cap</p>
                <p className="font-semibold">{spark(stats?.perWalletUsdcCap)} USDC</p>
              </div>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-lg font-semibold mb-3">Contract Information</h2>
          {renderContractInfo()}
        </section>

        <button className="w-full bg-gradient-to-r from-cyan-400 to-sky-500 text-black font-semibold py-3 rounded-2xl" onClick={askToMint}>
          Mint {Number(amountReadable).toLocaleString()} USDC
        </button>

        <section className={sectionClass}>
          <div className="flex gap-2 mb-4">
            {(['manual', 'qr', 'connect'] as MintTab[]).map((tab) => (
              <button
                key={tab}
                className={`${pillButton} ${activeTab === tab ? 'bg-cyan-500 text-black border-transparent' : 'border-white/20 text-white/70'}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'manual' ? 'Manual' : tab === 'qr' ? 'QR Code' : 'Connect' }
              </button>
            ))}
          </div>

          {activeTab === 'manual' && (
            <div className="space-y-5 text-sm">
              <StepHeading number={1} title="Send Payment" subtitle="Send USDC to the treasury address" />
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
                <p className="text-white/70 text-xs">PayTo (Treasury)</p>
                <div className="flex gap-2">
                  <input className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white" value={payTo}
                    readOnly />
                  <button className="bg-white/10 rounded-lg px-3" onClick={() => copyToClipboard(payTo)}>Copy</button>
                </div>
                <p className="text-white/70 text-xs">Amount</p>
                <p className="font-semibold">{Number(amountReadable).toLocaleString()} USDC</p>
              </div>

              <StepHeading number={2} title="Verify & Receive" subtitle="Enter your payment details" />
              <div className="space-y-3">
                <input
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
                  placeholder="Your wallet address"
                  value={addrManual}
                  onChange={(e) => setAddrManual(e.target.value)}
                />
                <input
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white"
                  placeholder="USDC payment tx hash"
                  value={txHashManual}
                  onChange={(e) => setTxHashManual(e.target.value)}
                />
                <button
                  className="w-full bg-gradient-to-r from-cyan-400 to-sky-500 text-black font-semibold py-3 rounded-2xl"
                  onClick={() => handleVerify(txHashManual, addrManual)}
                >
                  {step === 'verifying' ? 'Verifying…' : 'Verify & Receive'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="space-y-4 text-sm">
              <StepHeading number={1} title="Scan QR Code" subtitle="Open your mobile wallet and scan" />
              <div className="bg-white rounded-2xl p-5 flex justify-center">
                {qrValue ? <QRCode value={qrValue} size={220} /> : <p className="text-black">Loading…</p>}
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1">
                <p className="text-white/70 text-xs">Payment Details</p>
                <p>Amount: {Number(amountReadable).toLocaleString()} USDC</p>
                <p>Network: Base / Chain ID {stats?.chainId}</p>
                <p>Treasury: {stats?.treasury}</p>
              </div>
              <p className="text-xs text-white/60">After the payment confirms, return to Manual tab to paste your tx hash or use the Connect tab for automatic verification.</p>
            </div>
          )}

          {activeTab === 'connect' && (
            <div className="space-y-4 text-sm">
              <StepHeading number={1} title="Connect Wallet" subtitle="Connect your EVM wallet" />
              <div className="flex gap-3 flex-wrap">
                {isConnected ? (
                  <button className={`${pillButton} bg-white/10 border-white/20`} onClick={() => disconnect()}>
                    Disconnect {address?.slice(0, 6)}…{address?.slice(-4)}
                  </button>
                ) : (
                  connectors.map((connector) => (
                    <button
                      key={connector.uid}
                      className={`${pillButton} bg-gradient-to-r from-cyan-400 to-sky-500 text-black border-transparent`}
                      onClick={() => connect({ connector })}
                      disabled={!connector.ready || connectStatus === 'connecting'}
                    >
                      {connector.name}
                    </button>
                  ))
                )}
              </div>

              <StepHeading number={2} title="Pay & Auto-Verify" subtitle="Wallet will prompt you to approve" />
              <button
                className="w-full bg-gradient-to-r from-cyan-400 to-sky-500 text-black font-semibold py-3 rounded-2xl disabled:opacity-50"
                disabled={!isConnected || waitingReceipt}
                onClick={handleWalletPayment}
              >
                {waitingReceipt ? 'Waiting for confirmation…' : `Pay ${Number(amountReadable).toLocaleString()} USDC`}
              </button>
              <p className="text-xs text-white/60">Once the transaction confirms, we’ll auto-verify it and distribute LICODE to your wallet.</p>
            </div>
          )}
        </section>

        {msg && <p className="text-center text-sm text-white/80">{msg}</p>}
      </div>
    </main>
  );
}

function StepHeading({ number, title, subtitle }: { number: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-full bg-cyan-500/30 text-cyan-200 flex items-center justify-center font-semibold">{number}</div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-white/60">{subtitle}</p>
      </div>
    </div>
  );
}

function AddressRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-white/60 text-xs uppercase tracking-wide">{label}</span>
      <div className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono break-all">{value || '—'}</div>
      <button className="bg-white/10 rounded-lg px-3 py-2 text-xs" onClick={onCopy}>
        Copy
      </button>
    </div>
  );
}
