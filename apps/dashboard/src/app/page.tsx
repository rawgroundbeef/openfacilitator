'use client';

import Link from 'next/link';
import { ArrowRight, Globe, Github, Check, Copy, Zap, Code, Sparkles, ShieldCheck, Loader2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navbar } from '@/components/navbar';
import { useAuth } from '@/components/auth/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

const FREE_ENDPOINT = 'https://x402.openfacilitator.io';

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

function PricingButton({
  tier,
  className,
  isPurchasing,
  onPurchase,
}: {
  tier: 'basic' | 'pro';
  className?: string;
  isPurchasing: boolean;
  onPurchase: (tier: 'basic' | 'pro') => void;
}) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return (
      <button
        onClick={() => onPurchase(tier)}
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
  const [purchasingTier, setPurchasingTier] = useState<'basic' | 'pro' | null>(null);

  const { data: billingWallet } = useQuery({
    queryKey: ['billingWallet'],
    queryFn: () => api.getBillingWallet(),
    enabled: isAuthenticated,
  });

  const purchaseMutation = useMutation({
    mutationFn: (tier: 'basic' | 'pro') => api.purchaseSubscription(tier),
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: 'Subscription activated!',
          description: `Your ${result.tier} subscription is now active.`,
        });
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
      setPurchasingTier(null);
    },
    onError: (error) => {
      toast({
        title: 'Purchase failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
      setPurchasingTier(null);
    },
  });

  const handlePurchase = (tier: 'basic' | 'pro') => {
    setPurchasingTier(tier);
    purchaseMutation.mutate(tier);
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
            Start free. Add your brand when you&apos;re ready.
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
            <span className="font-medium">Base + Solana</span>
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
          <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
            Completely free. One line of code. Start accepting payments in seconds.
          </p>

          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 font-mono text-lg break-all mb-4">
              <span className="text-gray-900 dark:text-gray-100 flex-1">{FREE_ENDPOINT}</span>
              <CopyButton text={FREE_ENDPOINT} />
            </div>

            <div className="flex items-center justify-center gap-8 text-xs text-gray-500 dark:text-gray-400">
              <span>Base</span>
              <span>Solana</span>
              <span>USDC</span>
            </div>
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
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-[#c9d1d9]">
{`import { createPaymentHandler } from '@x402/facilitator';

const handler = createPaymentHandler({
  facilitatorUrl: '${FREE_ENDPOINT}'
});`}
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
              <Link href="/dashboard/account" className="text-primary hover:underline ml-2">
                Fund wallet
              </Link>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6">
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
                  Base + Solana mainnet
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

            {/* Basic */}
            <div className="p-6 rounded-2xl bg-background border-2 border-primary">
              <h3 className="text-lg font-semibold mb-2">Basic</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold">$5</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  your.openfacilitator.io
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Dashboard & analytics
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Manage your keys
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Email support
                </li>
              </ul>
              <PricingButton
                tier="basic"
                className="block w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-center font-medium hover:bg-primary/90 transition-colors text-sm"
                isPurchasing={purchasingTier === 'basic'}
                onPurchase={handlePurchase}
              />
            </div>

            {/* Pro */}
            <div className="p-6 rounded-2xl bg-background border border-border">
              <h3 className="text-lg font-semibold mb-2">Pro</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold">$25</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Custom domain
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  pay.yourbrand.com
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Auto SSL
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary" />
                  Priority support
                </li>
              </ul>
              <PricingButton
                tier="pro"
                className="block w-full py-2.5 rounded-lg border border-border text-center font-medium hover:bg-secondary transition-colors text-sm"
                isPurchasing={purchasingTier === 'pro'}
                onPurchase={handlePurchase}
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
            Three endpoints. That&apos;s all you need.
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
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-primary-foreground" />
            </div>
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
    </div>
  );
}
