'use client';

import axios from 'axios';
import QRCode from 'react-qr-code';
import { useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain, useChainId, useWatchAsset, useSignTypedData } from 'wagmi';
import { getAddress } from 'viem';
import { base } from 'wagmi/chains';

type Step = 'idle' | 'signing' | 'needpay' | 'verifying' | 'done' | 'err';
type MintTab = 'manual' | 'qr' | 'gasless';

type GaslessConfig = {
  facilitator: string;
  authorizationDomain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  authorizationTypes: Record<string, { name: string; type: string }[]>;
  authorizationWindowSeconds: number;
  clockDriftAllowanceSeconds: number;
};

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
  gasless?: GaslessConfig;
};

const spark = (value?: string) => {
  if (!value) return '0';
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const generateNonce = () => {
  const bytes = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
};

const sectionClass = 'rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur shadow-xl shadow-black/40';
const pillButton = 'px-4 py-2 rounded-full font-semibold border transition-all duration-200 hover:scale-105';
const inputClass = 'w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 transition-all';
const buttonPrimary = 'w-full bg-gradient-to-r from-cyan-400 to-sky-500 text-black font-semibold py-4 rounded-xl hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none';

export default function Page() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [activeTab, setActiveTab] = useState<MintTab>('gasless');
  const [payTo, setPayTo] = useState('');
  const [amount6, setAmount6] = useState('1000000');
  const [txHashManual, setTxHashManual] = useState('');
  const [addrManual, setAddrManual] = useState('');
  const [msg, setMsg] = useState('');
  const [gaslessResult, setGaslessResult] = useState<{ paymentTx?: string; distributorTx?: string; nonce?: string } | null>(null);
  const [isAddingToken, setIsAddingToken] = useState(false);

  const { address, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { signTypedDataAsync } = useSignTypedData();
  const { switchChainAsync } = useSwitchChain();
  const currentChainId = useChainId();
  const { watchAsset } = useWatchAsset();


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

  const handleGaslessTransfer = async () => {
    if (!address || !isConnected) {
      setStep('err');
      setMsg('Please connect your wallet first');
      return;
    }

    if (!stats || !stats.gasless) {
      setStep('err');
      setMsg('Gasless configuration not loaded yet');
      return;
    }

    const fromAddress = getAddress(address);
    const toAddress = getAddress(stats.treasury);
    const targetChainId = stats.gasless.authorizationDomain.chainId;
    const valueRaw = stats.mintUnitUsdc6 || amount6;

    let transferAmount: bigint;
    try {
      transferAmount = BigInt(valueRaw);
    } catch {
      setStep('err');
      setMsg('Invalid mint amount configuration');
      return;
    }

    setGaslessResult(null);

    if (switchChainAsync && targetChainId && currentChainId && currentChainId !== targetChainId) {
      try {
        setMsg('Attempting to switch network to match authorization domain...');
        await switchChainAsync({ chainId: targetChainId });
      } catch (switchError: any) {
        console.warn('Network switch error:', switchError);
        if (switchError?.message?.includes('User rejected') || switchError?.code === 4001) {
          setStep('err');
          setMsg('Please switch your wallet to the required network to continue');
          return;
        }
        setMsg('Unable to auto-switch network. Please verify your wallet is on the correct chain before continuing.');
      }
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const driftAllowance = stats.gasless.clockDriftAllowanceSeconds ?? 120;
    const windowSeconds = stats.gasless.authorizationWindowSeconds ?? 900;
    const effectiveDrift = Math.max(0, Math.min(driftAllowance, windowSeconds - 1));
    const validAfter = BigInt(Math.max(0, nowSeconds - effectiveDrift));
    const validBefore = validAfter + BigInt(windowSeconds);
    const nonce = generateNonce();

    const typedMessage = {
      from: fromAddress,
      to: toAddress,
      value: transferAmount,
      validAfter,
      validBefore,
      nonce,
    };

    const typedDomain = {
      ...stats.gasless.authorizationDomain,
      verifyingContract: getAddress(stats.gasless.authorizationDomain.verifyingContract) as `0x${string}`,
    };

    setStep('signing');
    setMsg('Check your wallet to sign the gasless authorization');

    let signature: `0x${string}`;
    try {
      signature = await signTypedDataAsync({
        domain: typedDomain,
        primaryType: 'TransferWithAuthorization',
        types: stats.gasless.authorizationTypes as Record<string, { name: string; type: string }[]>,
        message: typedMessage,
      });
    } catch (error: any) {
      console.error('signTypedData error:', error);
      setStep('err');
      if (error?.message?.includes('User rejected') || error?.code === 4001) {
        setMsg('Signature request was rejected in wallet');
      } else {
        setMsg(error?.message || 'Failed to sign authorization');
      }
      return;
    }

    setStep('verifying');
    setMsg('Facilitator is submitting your gasless transfer...');

    try {
      const response = await axios.post(
        '/api/gasless/transfer',
        {
          authorization: {
            from: fromAddress,
            to: toAddress,
            value: transferAmount.toString(),
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce,
          },
          signature,
        },
        { timeout: 120_000 }
      );

      if (response.data.ok) {
        setStep('done');
        setGaslessResult({
          paymentTx: response.data.paymentTx,
          distributorTx: response.data.distributorTx,
          nonce,
        });
        setMsg('Gasless transfer completed! Facilitator covered the gas.');
        fetchStats();
      } else {
        setStep('err');
        setMsg(response.data.error || 'Gasless transfer failed');
      }
    } catch (error: any) {
      console.error('gasless transfer error:', error);
      setStep('err');
      setMsg(error?.response?.data?.error || error?.message || 'Gasless transfer failed');
    }
  };

  const addTokenToWallet = async () => {
    if (!isConnected) {
      setMsg('Please connect your wallet first');
      return;
    }
    
    if (!stats?.tokenAddress) {
      setMsg('Token address not loaded yet');
      return;
    }
    
    setIsAddingToken(true);
    
    try {
      const tokenAddress = getAddress(stats.tokenAddress);
      console.log(tokenAddress)
      
      setMsg('Adding LICODE token to wallet...');
      
      await watchAsset({
        type: 'ERC20',
        options: {
          address: tokenAddress,
          symbol: 'LICODE',
          decimals: 18,
          // image: 'https://example.com/token-logo.png' // optional: add token logo URL
        }
      });

      setMsg('LICODE token added to wallet successfully!');
    } catch (err: any) {
      console.error('Add token error:', err);
      // Better error handling for common issues
      if (err?.message?.includes('User rejected')) {
        setMsg('You cancelled adding the token to your wallet');
      } else if (err?.message?.includes('already been added')) {
        setMsg('LICODE token is already in your wallet');
      } else {
        setMsg(err?.message || 'Failed to add token to wallet');
      }
    } finally {
      setIsAddingToken(false);
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
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-400 to-sky-500 flex items-center justify-center text-2xl font-bold text-black shadow-lg shadow-cyan-500/30">L</div>
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-sky-500 bg-clip-text text-transparent">LICODE Mint</h1>
            <p className="text-base text-white/70 mt-2">Mint LICODE tokens on Base blockchain</p>
            <div className="mt-3 inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 rounded-full px-4 py-2 text-sm">
              <span className="text-white/60">Exchange Rate:</span>
              <span className="font-semibold text-cyan-400">1 USDC = 5,000 LICODE</span>
            </div>
          </div>
        </header>

        <div className="flex justify-center -mt-8 mb-4">
          <button
            className="px-3 py-2 rounded-full border border-white/10 bg-white/5 text-sm text-white/80 hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={addTokenToWallet}
            type="button"
            disabled={isAddingToken}
          >
            {isAddingToken ? '⏳ Adding...' : '🔖 Add LICODE to Wallet'}
          </button>
        </div>

        <section className={sectionClass}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span>📊</span> Mint Progress
            </h2>
            <button
              className="text-sm flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full transition-all duration-200 disabled:opacity-50"
              onClick={fetchStats}
              disabled={statsLoading}
            >
              <svg className={`w-4 h-4 ${statsLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {statsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div className="space-y-4 text-sm text-white/80">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="font-medium text-white">Minting Progress</p>
                <p className="text-xs text-white/60">{(stats?.mintedPercent || 0).toFixed(2)}% Complete</p>
              </div>
              <div className="h-3 rounded-full bg-white/10 overflow-hidden shadow-inner">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-all duration-500 shadow-lg shadow-cyan-500/50"
                  style={{ width: `${Math.min(100, Math.max(0, stats?.mintedPercent || 0))}%` }}
                />
              </div>
              <p className="text-xs text-white/60">
                {spark(stats?.mintedTokens)} / {spark(stats?.totalSupplyTokens)} LICODE minted
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/10">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/60 text-xs uppercase tracking-wide mb-1">USDC Collected</p>
                <p className="font-semibold text-lg text-cyan-400">{spark(stats?.usdcCollected)}</p>
                <p className="text-xs text-white/50">of {spark(stats?.totalUsdcCap)} cap</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/60 text-xs uppercase tracking-wide mb-1">Per-Wallet Limit</p>
                <p className="font-semibold text-lg text-cyan-400">{spark(stats?.perWalletUsdcCap)}</p>
                <p className="text-xs text-white/50">USDC max per wallet</p>
              </div>
            </div>
          </div>
        </section>

        {/* Contract Information section - commented out */}
        {/* <section className={sectionClass}>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>📄</span> Contract Information
          </h2>
          {renderContractInfo()}
        </section> */}

        {/* Always show payment section, no need for "Start Minting Process" button */}
        <section className={sectionClass}>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>💳</span> Payment Methods
          </h2>
          <div className="flex gap-2 mb-6 flex-wrap">
              {(['gasless', 'qr', 'manual'] as MintTab[]).map((tab) => (
                <button
                  key={tab}
                  className={`${pillButton} ${
                    activeTab === tab
                      ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-black border-transparent shadow-lg shadow-cyan-500/30'
                      : 'border-white/20 text-white/70 hover:border-white/40 hover:text-white'
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'manual' && '📝 Manual Entry'}
                  {tab === 'qr' && '📱 QR Code'}
                  {tab === 'gasless' && '⚡ Gasless Transfer'}
                </button>
              ))}
            </div>

          {activeTab === 'manual' && (
            <div className="space-y-6 text-sm">
              <StepHeading number={1} title="Send Payment" subtitle="Send USDC to the treasury address" />
              <div className="rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/20 p-5 space-y-4">
                <div>
                  <p className="text-white/70 text-xs uppercase tracking-wide mb-2">Payment Address (Treasury)</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-black/40 border border-white/20 rounded-lg px-4 py-3 text-white font-mono text-xs"
                      value={payTo}
                      readOnly
                    />
                    <button
                      className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg px-4 transition-all"
                      onClick={() => copyToClipboard(payTo)}
                    >
                      📋 Copy
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <span className="text-white/70 text-xs uppercase tracking-wide">Amount to Send</span>
                  <span className="font-semibold text-2xl text-cyan-400">{Number(amountReadable).toLocaleString()} USDC</span>
                </div>
              </div>

              <StepHeading number={2} title="Verify & Receive" subtitle="Enter your payment details to claim tokens" />
              <div className="space-y-4">
                <input
                  className={inputClass}
                  placeholder="Your wallet address (e.g., 0x...)"
                  value={addrManual}
                  onChange={(e) => setAddrManual(e.target.value)}
                />
                <input
                  className={inputClass}
                  placeholder="USDC payment transaction hash (0x...)"
                  value={txHashManual}
                  onChange={(e) => setTxHashManual(e.target.value)}
                />
                <button
                  className={buttonPrimary}
                  onClick={() => handleVerify(txHashManual, addrManual)}
                  disabled={!txHashManual.trim() || !addrManual.trim() || step === 'verifying'}
                >
                  {step === 'verifying' ? '⏳ Verifying Payment...' : '✅ Verify & Receive Tokens'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="space-y-5 text-sm">
              <StepHeading number={1} title="Scan QR Code" subtitle="Open your mobile wallet and scan" />
              <div className="bg-white rounded-2xl p-6 flex justify-center shadow-xl">
                {qrValue ? (
                  <QRCode value={qrValue} size={240} level="M" />
                ) : (
                  <div className="w-60 h-60 flex items-center justify-center">
                    <p className="text-black">Loading QR Code...</p>
                  </div>
                )}
              </div>
              <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-xl p-5 space-y-3">
                <p className="text-white/70 text-xs uppercase tracking-wide mb-2">Payment Details</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-white/60">Amount:</span>
                    <span className="font-semibold text-cyan-400">{Number(amountReadable).toLocaleString()} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Network:</span>
                    <span className="font-semibold">Base (Chain ID: {stats?.chainId})</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-white/60">Treasury:</span>
                    <span className="font-mono text-xs text-right break-all max-w-[200px]">{stats?.treasury}</span>
                  </div>
                </div>
              </div>
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                <p className="text-xs text-white/80">
                  💡 <strong>Tip:</strong> After the payment confirms, return to the <strong>Manual Entry</strong> tab to paste your transaction hash, or use the <strong>Gasless Transfer</strong> tab for the facilitated flow.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'gasless' && (
            <div className="space-y-5 text-sm">
              <StepHeading number={1} title="Connect Wallet" subtitle="Connect your EVM-compatible wallet" />

              {connectors.length === 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div>
                      <p className="font-semibold mb-1">No Wallet Detected</p>
                      <p className="text-xs text-white/80 mb-3">
                        We couldn't detect any compatible wallet in your browser. Please install MetaMask or another EVM wallet to continue.
                      </p>
                      <a
                        href="https://metamask.io/download/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-gradient-to-r from-orange-400 to-orange-500 text-black font-semibold px-4 py-2 rounded-lg text-sm hover:shadow-lg transition-all"
                      >
                        Install MetaMask
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {isConnected && stats && currentChainId !== stats.chainId && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div className="flex-1">
                      <p className="font-semibold mb-1">Wrong Network</p>
                      <p className="text-xs text-white/80 mb-3">
                        Your wallet is connected to Chain ID {currentChainId}, but this app requires Base mainnet (Chain ID: 8453).
                        Please switch networks or click the Gasless Transfer button and we'll help you switch automatically.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {connectError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">❌</span>
                    <div className="flex-1">
                      <p className="font-semibold mb-1">Connection Error</p>
                      <p className="text-xs text-white/80 break-words">{connectError.message}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 flex-wrap">
                {isConnected ? (
                  <div className="w-full space-y-3">
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                          ✅
                        </div>
                        <div>
                          <p className="text-xs text-white/60">Connected Wallet</p>
                          <p className="font-mono font-semibold">
                            {address?.slice(0, 10)}...{address?.slice(-8)}
                          </p>
                        </div>
                      </div>
                      <button
                        className={`${pillButton} bg-red-500/20 border-red-500/50 hover:bg-red-500/30`}
                        onClick={() => disconnect()}
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    <div className="grid gap-3">
                      {connectors.map((connector) => (
                        <button
                          key={connector.uid}
                          className="w-full bg-gradient-to-r from-cyan-400 to-sky-500 text-black font-semibold py-4 rounded-xl hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => {
                            setMsg('');
                            connect({ connector });
                          }}
                          disabled={connectStatus === 'pending'}
                        >
                          {connectStatus === 'pending' ? '🔄 Connecting...' : `🦊 Connect with ${connector.name}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <StepHeading number={2} title="Sign Gasless Transfer" subtitle="Authorise a USDC transfer; facilitator pays the gas" />
              <div className="bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-xl p-5 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-white/60">You authorise:</span>
                  <span className="font-semibold text-2xl text-cyan-400">{Number(amountReadable).toLocaleString()} USDC</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/60">Sent to treasury:</span>
                  <span className="font-mono text-xs">{stats?.treasury}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/60">Facilitator:</span>
                  <span className="font-mono text-xs">
                    {stats?.gasless?.facilitator ? `${stats.gasless.facilitator.slice(0, 10)}...${stats.gasless.facilitator.slice(-6)}` : 'Loading...'}
                  </span>
                </div>
              </div>
              <button
                className={buttonPrimary}
                disabled={!isConnected || step === 'signing' || step === 'verifying'}
                onClick={handleGaslessTransfer}
              >
                {step === 'signing'
                  ? '✍️ Waiting for wallet signature...'
                  : step === 'verifying'
                  ? '⏳ Facilitator submitting transfer...'
                  : `⚡ Sign & Send ${Number(amountReadable).toLocaleString()} USDC`}
              </button>
              {gaslessResult && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-xs space-y-2">
                  <p className="font-semibold text-sm text-green-300">Gasless transfer complete</p>
                  {gaslessResult.paymentTx && (
                    <AddressRow label="Payment Tx" value={gaslessResult.paymentTx} onCopy={() => copyToClipboard(gaslessResult.paymentTx!)} />
                  )}
                  {gaslessResult.distributorTx && (
                    <AddressRow label="Distributor Tx" value={gaslessResult.distributorTx} onCopy={() => copyToClipboard(gaslessResult.distributorTx!)} />
                  )}
                  {gaslessResult.nonce && (
                    <AddressRow label="Nonce" value={gaslessResult.nonce} onCopy={() => copyToClipboard(gaslessResult.nonce!)} />
                  )}
                </div>
              )}
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                <p className="text-xs text-white/80">
                  💡 <strong>Tip:</strong> We submit the signed authorization on-chain and cover the gas. After two confirmations (USDC transfer + LICODE distribution) you will see both transaction hashes above.
                </p>
              </div>
            </div>
          )}
        </section>

        {msg && (
          <div
            className={`rounded-xl border p-4 ${
              step === 'done'
                ? 'bg-green-500/10 border-green-500/30'
                : step === 'err'
                ? 'bg-red-500/10 border-red-500/30'
                : step === 'verifying'
                ? 'bg-yellow-500/10 border-yellow-500/30'
                : 'bg-cyan-500/10 border-cyan-500/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">
                {step === 'done'
                  ? '✅'
                  : step === 'err'
                  ? '❌'
                  : step === 'verifying'
                  ? '⏳'
                  : step === 'signing'
                  ? '✍️'
                  : 'ℹ️'}
              </span>
              <div className="flex-1">
                <p className="font-semibold mb-1">
                  {step === 'done'
                    ? 'Success!'
                    : step === 'err'
                    ? 'Error'
                    : step === 'verifying'
                    ? 'Processing...'
                    : step === 'signing'
                    ? 'Awaiting Signature'
                    : 'Info'}
                </p>
                <p className="text-sm text-white/80 break-words">{msg}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function StepHeading({ number, title, subtitle }: { number: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-400 to-sky-500 text-black flex items-center justify-center font-bold text-lg shadow-lg shadow-cyan-500/30">
        {number}
      </div>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="text-xs text-white/60">{subtitle}</p>
      </div>
    </div>
  );
}

function AddressRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-white/60 text-xs uppercase tracking-wide font-semibold">{label}</span>
      <div className="flex-1 bg-black/40 border border-white/20 rounded-lg px-4 py-3 text-xs font-mono break-all hover:bg-black/50 transition-all">
        {value || '—'}
      </div>
      <button
        className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg px-4 py-3 text-xs transition-all whitespace-nowrap"
        onClick={onCopy}
      >
        📋 Copy
      </button>
    </div>
  );
}
