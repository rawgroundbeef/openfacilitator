'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  ExternalLink,
  Settings,
  ShieldCheck,
  Activity,
  Copy,
  Check,
  Sparkles,
  Crown,
  Loader2,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { api, type Facilitator } from '@/lib/api';
import { formatDate, formatAddress } from '@/lib/utils';
import { useAuth } from '@/components/auth/auth-provider';
import { Navbar } from '@/components/navbar';
import { useToast } from '@/hooks/use-toast';

export default function DashboardPage() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [domainType, setDomainType] = useState<'subdomain' | 'custom'>('subdomain');
  const [newFacilitator, setNewFacilitator] = useState({
    name: '',
    subdomain: '',
    customDomain: '',
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [purchasingTier, setPurchasingTier] = useState<'basic' | 'pro' | null>(null);
  const queryClient = useQueryClient();

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/signin');
    }
  }, [authLoading, isAuthenticated, router]);

  const { data: facilitators, isLoading } = useQuery({
    queryKey: ['facilitators'],
    queryFn: () => api.getFacilitators(),
    enabled: isAuthenticated,
  });

  const { data: subscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.getSubscriptionStatus(),
    enabled: isAuthenticated,
  });

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

  const createMutation = useMutation({
    mutationFn: (data: { name: string; subdomain: string; customDomain?: string }) =>
      api.createFacilitator(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilitators'] });
      setIsCreateOpen(false);
      setNewFacilitator({ name: '', subdomain: '', customDomain: '' });
      setDomainType('subdomain');
    },
  });

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 pt-24 pb-10 min-h-screen">
        {/* Stats */}
        <div className="grid sm:grid-cols-3 gap-6 mb-10">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Facilitators</CardDescription>
              <CardTitle className="text-3xl">{facilitators?.length || 0}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Activity className="w-3 h-3" />
                All running
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Transactions</CardDescription>
              <CardTitle className="text-3xl">0</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Activity className="w-3 h-3" />
                Last 30 days
              </div>
            </CardContent>
          </Card>
          <Card className={subscription?.tier === 'pro' ? 'border-primary/50' : ''}>
            <CardHeader className="pb-2">
              <CardDescription>Current Plan</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                {subscription?.active ? (
                  <>
                    {subscription.tier === 'pro' ? (
                      <>
                        <Crown className="w-6 h-6 text-primary" />
                        Pro
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-6 h-6 text-primary" />
                        Basic
                      </>
                    )}
                  </>
                ) : (
                  'Free'
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Wallet Balance */}
              {billingWallet?.hasWallet && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Wallet className="w-3 h-3" />
                  <span>Balance: ${billingWallet.balance} USDC</span>
                </div>
              )}

              {subscription?.active ? (
                <>
                  <div className="text-xs text-muted-foreground">
                    Expires {subscription.expires ? formatDate(subscription.expires) : 'N/A'}
                  </div>
                  {subscription.tier === 'basic' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handlePurchase('pro')}
                      disabled={purchasingTier !== null}
                    >
                      {purchasingTier === 'pro' ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Upgrading...
                        </>
                      ) : (
                        'Upgrade to Pro $25'
                      )}
                    </Button>
                  )}
                  {subscription.tier === 'pro' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handlePurchase('pro')}
                      disabled={purchasingTier !== null}
                    >
                      {purchasingTier === 'pro' ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Renewing...
                        </>
                      ) : (
                        'Renew $25'
                      )}
                    </Button>
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground">
                    Upgrade to create facilitators
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => handlePurchase('basic')}
                      disabled={purchasingTier !== null}
                    >
                      {purchasingTier === 'basic' ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Basic $5/mo'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => handlePurchase('pro')}
                      disabled={purchasingTier !== null}
                    >
                      {purchasingTier === 'pro' ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Pro $25/mo'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Facilitators */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Your Facilitators</h2>
            <p className="text-muted-foreground">Manage your x402 payment facilitators</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Facilitator
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Facilitator</DialogTitle>
                <DialogDescription>
                  Set up a new x402 payment facilitator.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="My Facilitator"
                    value={newFacilitator.name}
                    onChange={(e) =>
                      setNewFacilitator((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>

                {/* Domain Type Toggle */}
                <div className="space-y-3">
                  <Label>Domain Type</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDomainType('subdomain')}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        domainType === 'subdomain'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className="font-medium text-sm">Subdomain</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        yourname.openfacilitator.io
                      </div>
                      <div className="text-xs text-primary mt-2 font-medium">Starter — $10/mo</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDomainType('custom')}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        domainType === 'custom'
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className="font-medium text-sm">Custom Domain</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        facilitator.yourdomain.com
                      </div>
                      <div className="text-xs text-primary mt-2 font-medium">Pro — $20/mo</div>
                    </button>
                  </div>
                </div>

                {domainType === 'subdomain' ? (
                  <div className="space-y-2">
                    <Label htmlFor="subdomain">Subdomain</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="subdomain"
                        placeholder="my-facilitator"
                        value={newFacilitator.subdomain}
                        onChange={(e) =>
                          setNewFacilitator((prev) => ({
                            ...prev,
                            subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                          }))
                        }
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        .openfacilitator.io
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="customDomain">Your Domain</Label>
                      <Input
                        id="customDomain"
                        placeholder="facilitator.yourdomain.com"
                        value={newFacilitator.customDomain}
                        onChange={(e) =>
                          setNewFacilitator((prev) => ({
                            ...prev,
                            customDomain: e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''),
                          }))
                        }
                      />
                    </div>
                    <div className="rounded-lg bg-muted/50 p-4 text-sm">
                      <div className="font-medium mb-2">DNS Setup Required</div>
                      <div className="text-muted-foreground space-y-1">
                        <p>Add a CNAME record pointing to:</p>
                        <code className="block bg-background px-2 py-1 rounded text-xs font-mono mt-1">
                          custom.openfacilitator.io
                        </code>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const data = {
                      name: newFacilitator.name,
                      subdomain: domainType === 'subdomain' 
                        ? newFacilitator.subdomain 
                        : newFacilitator.customDomain.replace(/\./g, '-'),
                      customDomain: domainType === 'custom' ? newFacilitator.customDomain : undefined,
                    };
                    createMutation.mutate(data);
                  }}
                  disabled={
                    !newFacilitator.name || 
                    (domainType === 'subdomain' && !newFacilitator.subdomain) ||
                    (domainType === 'custom' && !newFacilitator.customDomain) ||
                    createMutation.isPending
                  }
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 bg-muted rounded w-32" />
                  <div className="h-4 bg-muted rounded w-48 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : facilitators?.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No facilitators yet</h3>
              <p className="text-muted-foreground text-center mb-6 max-w-sm">
                Create your first x402 payment facilitator to start accepting payments.
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Facilitator
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {facilitators?.map((facilitator: Facilitator) => (
              <Card key={facilitator.id} className="group">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{facilitator.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <span className="font-mono text-xs">{facilitator.url}</span>
                        <button
                          onClick={() => copyToClipboard(facilitator.url, facilitator.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {copiedId === facilitator.id ? (
                            <Check className="w-3 h-3 text-primary" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Networks</span>
                      <span>
                        {facilitator.supportedChains.length} chain
                        {facilitator.supportedChains.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Created</span>
                      <span>{formatDate(facilitator.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button variant="outline" size="sm" className="flex-1" asChild>
                        <Link href={`/dashboard/${facilitator.id}`}>
                          <Settings className="w-4 h-4 mr-1" />
                          Manage
                        </Link>
                      </Button>
                      <Button variant="outline" size="icon" asChild>
                        <a href={facilitator.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

