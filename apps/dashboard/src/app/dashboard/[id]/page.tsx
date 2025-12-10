'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Download,
  Activity,
  Globe,
  Key,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { api, type Transaction } from '@/lib/api';
import { formatDate, formatAddress } from '@/lib/utils';

const networkNames: Record<string | number, string> = {
  8453: 'Base',
  84532: 'Base Sepolia',
  1: 'Ethereum',
  11155111: 'Sepolia',
  'solana': 'Solana',
  'solana-devnet': 'Solana Devnet',
};

export default function FacilitatorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: facilitator, isLoading } = useQuery({
    queryKey: ['facilitator', id],
    queryFn: () => api.getFacilitator(id),
  });

  const { data: transactionsData } = useQuery({
    queryKey: ['transactions', id],
    queryFn: () => api.getTransactions(id),
    enabled: !!id,
  });

  const { data: exportConfig, refetch: fetchExport } = useQuery({
    queryKey: ['export', id],
    queryFn: () => api.exportConfig(id),
    enabled: false,
  });

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleExport = async () => {
    await fetchExport();
    setIsExportOpen(true);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!facilitator) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Facilitator not found</h1>
          <Link href="/dashboard" className="text-primary hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl">OpenFacilitator</span>
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium">{facilitator.name}</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        {/* Facilitator header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-bold mb-2">{facilitator.name}</h1>
            <div className="flex items-center gap-2">
              <span className="font-mono text-muted-foreground">{facilitator.url}</span>
              <button
                onClick={() => copyToClipboard(facilitator.url)}
                className="text-muted-foreground hover:text-foreground"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
              </button>
              <a
                href={facilitator.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" />
                  Export for Self-Host
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Self-Host Configuration</DialogTitle>
                  <DialogDescription>
                    Download the configuration files to run this facilitator on your own infrastructure.
                  </DialogDescription>
                </DialogHeader>
                {exportConfig && (
                  <div className="space-y-4 py-4">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadFile(exportConfig.dockerCompose, 'docker-compose.yml')}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        docker-compose.yml
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadFile(exportConfig.envFile, '.env')}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        .env
                      </Button>
                    </div>
                    <div className="bg-muted rounded-lg p-4">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {exportConfig.instructions}
                      </pre>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-4 gap-6 mb-10">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <span className="font-medium">Active</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Verifications</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">
                {transactionsData?.transactions.filter((t) => t.type === 'verify').length || 0}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Settlements</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">
                {transactionsData?.transactions.filter((t) => t.type === 'settle').length || 0}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Networks</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{facilitator.supportedChains.length}</span>
            </CardContent>
          </Card>
        </div>

        {/* Configuration & Transactions */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Configuration */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Subdomain</Label>
                  <p className="font-mono">{facilitator.subdomain}.openfacilitator.io</p>
                </div>
                {facilitator.customDomain && (
                  <div>
                    <Label className="text-muted-foreground">Custom Domain</Label>
                    <p className="font-mono">{facilitator.customDomain}</p>
                  </div>
                )}
                <div>
                  <Label className="text-muted-foreground">Owner Address</Label>
                  <p className="font-mono text-sm">{formatAddress(facilitator.ownerAddress)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p>{formatDate(facilitator.createdAt)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Supported Networks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {facilitator.supportedChains.map((chainId) => (
                    <div
                      key={chainId}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted"
                    >
                      <span>{networkNames[chainId] || `Chain ${chainId}`}</span>
                      <span className="text-xs text-muted-foreground font-mono">{chainId}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  API Endpoints
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-muted-foreground text-xs">Verify</Label>
                  <p className="font-mono text-xs bg-muted p-2 rounded">POST {facilitator.url}/verify</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Settle</Label>
                  <p className="font-mono text-xs bg-muted p-2 rounded">POST {facilitator.url}/settle</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Supported</Label>
                  <p className="font-mono text-xs bg-muted p-2 rounded">GET {facilitator.url}/supported</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transactions */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Recent Transactions
              </CardTitle>
              <CardDescription>Payment verifications and settlements</CardDescription>
            </CardHeader>
            <CardContent>
              {!transactionsData?.transactions.length ? (
                <div className="text-center py-12">
                  <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No transactions yet</p>
                  <p className="text-sm text-muted-foreground">
                    Transactions will appear here when payments are processed.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactionsData.transactions.map((tx: Transaction) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            tx.type === 'verify' ? 'bg-blue-500/20' : 'bg-primary/20'
                          }`}
                        >
                          {tx.type === 'verify' ? (
                            <Check className="w-4 h-4 text-blue-500" />
                          ) : (
                            <ShieldCheck className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium capitalize">{tx.type}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatAddress(tx.fromAddress)} → {formatAddress(tx.toAddress)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono">{tx.amount}</p>
                        <p className="text-sm text-muted-foreground">{formatDate(tx.createdAt)}</p>
                      </div>
                      <div
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          tx.status === 'success'
                            ? 'bg-primary/20 text-primary'
                            : tx.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-500'
                              : 'bg-destructive/20 text-destructive'
                        }`}
                      >
                        {tx.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

