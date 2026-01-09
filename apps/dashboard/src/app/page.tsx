'use client';

import Link from 'next/link';
import { ArrowRight, Globe, Github, Check, Copy, Zap, Code, Sparkles, ShieldCheck, Loader2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navbar } from '@/components/navbar';
import { useAuth } from '@/components/auth/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { SubscriptionConfirmDialog } from '@/components/subscription-confirm-dialog';
import { SubscriptionSuccessDialog } from '@/components/subscription-success-dialog';

const FREE_ENDPOINT = 'https://pay.openfacilitator.io';

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium"
    >
      {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
      {label || (copied ? 'Copied!' : 'Copy URL')}
    </button>
  );
}

function SubscribeButton({
  className,
  isPurchasing,
  onSubscribe,
}: {
  className?: string;
  isPurchasing: boolean;
  onSubscribe: () => void;
}) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return (
      <button
        onClick={onSubscribe}
        disabled={isPurchasing}
        className={`${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isPurchasing ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </span>
        ) : (
          'Get Started'
        )}
      </button>
    );
  }

  // Not logged in - go to sign in
  return (
    <Link href="/auth/signin" className={className}>
      Sign in to subscribe
    </Link>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successTxHash, setSuccessTxHash] = useState<string | undefined>();

  const { data: billingWallet } = useQuery({
    queryKey: ['billingWallet'],
    queryFn: () => api.getBillingWallet(),
    enabled: isAuthenticated,
  });

  const purchaseMutation = useMutation({
    mutationFn: () => api.purchaseSubscription(),
    onSuccess: (result) => {
      if (result.success) {
        // Show success dialog
        setSuccessTxHash(result.txHash);
        setSuccessDialogOpen(true);
        queryClient.invalidateQueries({ queryKey: ['subscription'] });
        queryClient.invalidateQueries({ queryKey: ['billingWallet'] });
      } else if (result.insufficientBalance) {
        toast({
          title: 'Insufficient balance',
          description: `You need $${result.required} USDC but only have $${result.available}. Fund your billing wallet first.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Purchase failed',
          description: result.error || 'Something went wrong',
          variant: 'destructive',
        });
      }
      setIsPurchasing(false);
    },
    onError: (error) => {
      toast({
        title: 'Purchase failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
      setIsPurchasing(false);
    },
  });

  // Open confirmation dialog
  const handleSubscribeClick = () => {
    setConfirmDialogOpen(true);
  };

  // Execute purchase after confirmation
  const handleConfirmPurchase = () => {
    setIsPurchasing(true);
    purchaseMutation.mutate();
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-grid scroll-smooth">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 text-foreground">
            Launch <span className="text-primary">your own</span> <span className="whitespace-nowrap">x402 facilitator</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Start free. Add your domain when you&apos;re ready.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => scrollTo('integration')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium"
            >
              Try free
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollTo('pricing')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border hover:bg-secondary transition-colors font-medium"
            >
              Get your domain
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Trust indicators */}
      <section className="py-12 px-6 border-y border-border bg-secondary/30">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-8 text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="font-medium">Non-Custodial</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <span className="font-medium">EVM + Solana</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-medium">x402 v2</span>
          </div>
          <div className="flex items-center gap-2">
            <Github className="w-5 h-5 text-primary" />
            <span className="font-medium">Apache 2.0</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <span className="font-medium">No Rate Limits</span>
          </div>
        </div>
      </section>

      {/* Instant Integration */}
      <section id="integration" className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Or just use ours
          </h2>
          <p className="text-muted-foreground text-center text-balance mb-12 max-w-xl mx-auto">
            Completely free. Start accepting payments in&nbsp;seconds.
          </p>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            <span className="text-gray-900 dark:text-gray-100 flex-1 font-mono text-sm sm:text-lg whitespace-nowrap overflow-hidden text-ellipsis">
              pay.openfacilitator.io
            </span>
            <CopyButton text={FREE_ENDPOINT} />
          </div>

          {/* Quick code example */}
          <div className="mt-6 rounded-xl bg-[#0d1117] border border-border/50 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-[#161b22]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-[#27ca40]"></div>
              </div>
              <span className="text-xs text-muted-foreground ml-2">example.ts</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto font-mono leading-relaxed">
              <code>
                <span className="text-[#ff7b72]">import</span>
                <span className="text-[#c9d1d9]">{" { "}</span>
                <span className="text-[#ffa657]">OpenFacilitator</span>
                <span className="text-[#c9d1d9]">{" } "}</span>
                <span className="text-[#ff7b72]">from</span>
                <span className="text-[#a5d6ff]">{" '@openfacilitator/sdk'"}</span>
                <span className="text-[#c9d1d9]">;</span>
                {"\n\n"}
                <span className="text-[#ff7b72]">const</span>
                <span className="text-[#c9d1d9]"> facilitator = </span>
                <span className="text-[#ff7b72]">new</span>
                <span className="text-[#ffa657]"> OpenFacilitator</span>
                <span className="text-[#c9d1d9]">();</span>
                {"\n\n"}
                <span className="text-[#ff7b72]">const</span>
                <span className="text-[#c9d1d9]">{" requirements = { scheme, network, maxAmountRequired, asset, payTo };"}</span>
                {"\n\n"}
                <span className="text-[#ff7b72]">const</span>
                <span className="text-[#c9d1d9]">{" { "}</span>
                <span className="text-[#c9d1d9]">valid</span>
                <span className="text-[#c9d1d9]">{" } = "}</span>
                <span className="text-[#ff7b72]">await</span>
                <span className="text-[#c9d1d9]"> facilitator.</span>
                <span className="text-[#d2a8ff]">verify</span>
                <span className="text-[#c9d1d9]">(payment, requirements);</span>
                {"\n"}
                <span className="text-[#ff7b72]">const</span>
                <span className="text-[#c9d1d9]">{" { "}</span>
                <span className="text-[#c9d1d9]">transactionHash</span>
                <span className="text-[#c9d1d9]">{" } = "}</span>
                <span className="text-[#ff7b72]">await</span>
                <span className="text-[#c9d1d9]"> facilitator.</span>
                <span className="text-[#d2a8ff]">settle</span>
                <span className="text-[#c9d1d9]">(payment, requirements);</span>
              </code>
            </pre>
          </div>

          <div className="flex items-center justify-center gap-8 mt-8">
            <Link
              href="/docs"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Documentation
            </Link>
            <Link
              href="https://github.com/rawgroundbeef/openfacilitator"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              View Source
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-secondary/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            How it works
          </h2>
          <p className="text-muted-foreground text-center mb-16 max-w-xl mx-auto">
            x402 is an open standard for web payments. The facilitator handles the blockchain stuff.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="relative p-6 rounded-2xl bg-background border border-border">
              <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">1</div>
              <Code className="w-8 h-8 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Add to your app</h3>
              <p className="text-muted-foreground">
                Point your x402 client at the free endpoint. One line of config.
              </p>
            </div>
            <div className="relative p-6 rounded-2xl bg-background border border-border">
              <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">2</div>
              <Sparkles className="w-8 h-8 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">User pays</h3>
              <p className="text-muted-foreground">
                User signs a payment with their wallet. No gas fees for users.
              </p>
            </div>
            <div className="relative p-6 rounded-2xl bg-background border border-border">
              <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">3</div>
              <ShieldCheck className="w-8 h-8 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Facilitator settles</h3>
              <p className="text-muted-foreground">
                We verify and submit the transaction. Funds go directly to your wallet.
              </p>
            </div>
          </div>

          {/* Custom domain CTA */}
          <div className="mt-16 p-6 bg-primary/5 dark:bg-primary/10 rounded-2xl text-center max-w-xl mx-auto border border-primary/20">
            <h3 className="text-lg font-semibold mb-2">
              Ready for your own domain?
            </h3>
            <p className="text-muted-foreground mb-4 text-balance">
              Get your volume tracked on x402 leaderboards, professional branding at pay.yourdomain.com, and full control.
            </p>
            <Link 
              href="/dashboard" 
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              Get your domain — $5/mo
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Discovery */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            x402 Discovery Built In
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto text-balance">
            We&apos;ve partnered with trusted x402 marketplaces like{' '}
            <a href="https://x402.jobs" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              x402.jobs
            </a>{' '}
            to give your facilitator access to discoverable, verified endpoints out of the box. Your agents can find paid APIs programmatically.
          </p>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 mb-6">
            <code className="text-gray-900 dark:text-gray-100 flex-1 font-mono text-sm sm:text-base whitespace-nowrap overflow-hidden text-ellipsis">
              GET /discovery/resources
            </code>
            <CopyButton text="https://api.openfacilitator.io/discovery/resources" label="Copy URL" />
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Hundreds of verified x402-enabled APIs with payment requirements. No auth needed.{' '}
            <Link href="/docs" className="text-primary hover:underline">
              See the docs →
            </Link>
          </p>
        </div>
      </section>

      {/* Make It Yours (Pricing) */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Your brand. Your facilitator.</h2>
          <p className="text-muted-foreground text-center mb-8 max-w-xl mx-auto">
            Show up in x402scan. Build trust with your users.
          </p>

          {/* Wallet Balance (for logged-in users) */}
          {isAuthenticated && billingWallet?.hasWallet && (
            <div className="flex items-center justify-center gap-2 mb-8 text-sm text-muted-foreground">
              <Wallet className="w-4 h-4" />
              <span>Your wallet balance: <strong className="text-foreground">${billingWallet.balance} USDC</strong></span>
              <Link href="/dashboard" className="text-primary hover:underline ml-2">
                Go to dashboard
              </Link>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Free */}
            <div className="p-6 rounded-2xl bg-secondary/30 border border-border">
              <h3 className="text-lg font-semibold mb-2">Free</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold">$0</span>
                <span className="text-muted-foreground">/forever</span>
              </div>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Shared endpoint
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  EVM + Solana mainnet
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  No account needed
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Unlimited requests
                </li>
              </ul>
            </div>

            {/* Starter */}
            <div className="p-6 rounded-2xl bg-background border-2 border-primary">
              <h3 className="text-lg font-semibold mb-2">Starter</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold">$5</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Your own custom domain
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  pay.yourdomain.com
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Dashboard & analytics
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Manage your keys
                </li>
              </ul>
              <SubscribeButton
                className="block w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-center font-medium hover:bg-primary/90 transition-colors text-sm"
                isPurchasing={isPurchasing}
                onSubscribe={handleSubscribeClick}
              />
            </div>
          </div>

          <p className="text-center text-sm text-gray-600 mt-10">
            Want full control? It&apos;s open source.{' '}
            <Link href="https://github.com/rawgroundbeef/openfacilitator" className="hover:text-gray-900 transition-colors">
              View on GitHub &rarr;
            </Link>
          </p>
        </div>
      </section>

      {/* Endpoints Reference */}
      <section className="py-20 px-6 bg-secondary/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">API Reference</h2>
          <p className="text-muted-foreground text-center mb-12">
            Four endpoints. That&apos;s all you need.
          </p>

          <div className="space-y-4">
            <div className="p-5 rounded-xl bg-background border border-border">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-1 rounded text-xs font-bold bg-gray-500/20 text-gray-500">GET</span>
                <code className="text-sm font-mono">/supported</code>
              </div>
              <p className="text-sm text-muted-foreground">Returns supported networks and tokens</p>
            </div>

            <div className="p-5 rounded-xl bg-background border border-border">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-1 rounded text-xs font-bold bg-gray-500/20 text-gray-500">GET</span>
                <code className="text-sm font-mono">/discovery/resources</code>
              </div>
              <p className="text-sm text-muted-foreground">Discover x402-enabled APIs from trusted marketplaces</p>
            </div>

            <div className="p-5 rounded-xl bg-background border border-border">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-1 rounded text-xs font-bold bg-blue-500/20 text-blue-400">POST</span>
                <code className="text-sm font-mono">/verify</code>
              </div>
              <p className="text-sm text-muted-foreground">Verify a payment signature is valid</p>
            </div>

            <div className="p-5 rounded-xl bg-background border border-border">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-1 rounded text-xs font-bold bg-blue-500/20 text-blue-400">POST</span>
                <code className="text-sm font-mono">/settle</code>
              </div>
              <p className="text-sm text-muted-foreground">Submit the transaction to the blockchain</p>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
            >
              Full documentation
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="w-7 h-7" />
            <span className="font-semibold">OpenFacilitator</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Open source under Apache 2.0 license
          </p>
          <div className="flex items-center gap-4">
            <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
              Docs
            </Link>
            <Link href="https://github.com/rawgroundbeef/openfacilitator" className="text-muted-foreground hover:text-foreground transition-colors">
              <Github className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </footer>

      {/* Subscription Confirmation Dialog */}
      <SubscriptionConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        tier="starter"
        balance={billingWallet?.balance ?? null}
        isPurchasing={isPurchasing}
        onConfirm={handleConfirmPurchase}
      />

      {/* Subscription Success Dialog */}
      <SubscriptionSuccessDialog
        open={successDialogOpen}
        onOpenChange={setSuccessDialogOpen}
        tier="starter"
        txHash={successTxHash}
      />
    </div>
  );
}
