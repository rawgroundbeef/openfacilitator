'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Link2,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  MoreVertical,
  Trash2,
  Pencil,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, type PaymentLink, type Facilitator } from '@/lib/api';
import { formatAddress } from '@/lib/utils';

interface PaymentLinksSectionProps {
  facilitatorId: string;
  facilitator: Facilitator;
}

// Common token/network configs
const NETWORK_OPTIONS = [
  { value: 'base', label: 'Base', chainId: 8453 },
  { value: 'solana', label: 'Solana', chainId: 'solana' },
];

const TOKEN_OPTIONS: Record<string, { address: string; symbol: string; decimals: number }[]> = {
  base: [
    { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6 },
  ],
  solana: [
    { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 },
  ],
};

function formatAmount(amount: string, decimals: number = 6): string {
  const num = parseFloat(amount) / Math.pow(10, decimals);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseAmountToAtomic(amount: string, decimals: number = 6): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0';
  return Math.floor(num * Math.pow(10, decimals)).toString();
}

export function PaymentLinksSection({ facilitatorId, facilitator }: PaymentLinksSectionProps) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<PaymentLink | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [network, setNetwork] = useState('base');
  const [asset, setAsset] = useState(TOKEN_OPTIONS['base'][0].address);
  const [payToAddress, setPayToAddress] = useState('');
  const [successRedirectUrl, setSuccessRedirectUrl] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['payment-links', facilitatorId],
    queryFn: () => api.getPaymentLinks(facilitatorId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createPaymentLink(facilitatorId, {
        name,
        description: description || undefined,
        amount: parseAmountToAtomic(amount),
        asset,
        network,
        payToAddress,
        successRedirectUrl: successRedirectUrl || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links', facilitatorId] });
      setIsCreateOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { linkId: string; updates: Parameters<typeof api.updatePaymentLink>[2] }) =>
      api.updatePaymentLink(facilitatorId, data.linkId, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links', facilitatorId] });
      setIsEditOpen(false);
      setEditingLink(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (linkId: string) => api.deletePaymentLink(facilitatorId, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-links', facilitatorId] });
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setAmount('');
    setNetwork('base');
    setAsset(TOKEN_OPTIONS['base'][0].address);
    setPayToAddress('');
    setSuccessRedirectUrl('');
  };

  const handleNetworkChange = (newNetwork: string) => {
    setNetwork(newNetwork);
    const tokens = TOKEN_OPTIONS[newNetwork];
    if (tokens && tokens.length > 0) {
      setAsset(tokens[0].address);
    }
  };

  const copyUrl = (link: PaymentLink) => {
    navigator.clipboard.writeText(link.url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openEditDialog = (link: PaymentLink) => {
    setEditingLink(link);
    setName(link.name);
    setDescription(link.description || '');
    setAmount(formatAmount(link.amount));
    setNetwork(link.network);
    setAsset(link.asset);
    setPayToAddress(link.payToAddress);
    setSuccessRedirectUrl(link.successRedirectUrl || '');
    setIsEditOpen(true);
  };

  const handleUpdateLink = () => {
    if (!editingLink) return;
    updateMutation.mutate({
      linkId: editingLink.id,
      updates: {
        name,
        description: description || null,
        amount: parseAmountToAtomic(amount),
        asset,
        network,
        payToAddress,
        successRedirectUrl: successRedirectUrl || null,
      },
    });
  };

  const toggleActive = (link: PaymentLink) => {
    updateMutation.mutate({
      linkId: link.id,
      updates: { active: !link.active },
    });
  };

  const getTokenSymbol = (network: string, asset: string): string => {
    const tokens = TOKEN_OPTIONS[network];
    if (!tokens) return 'USDC';
    const token = tokens.find((t) => t.address.toLowerCase() === asset.toLowerCase());
    return token?.symbol || 'USDC';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Payment Links
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Payment Links
            </CardTitle>
            <CardDescription>
              Create shareable links to collect payments
            </CardDescription>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Create Link
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Payment Link</DialogTitle>
                <DialogDescription>
                  Create a shareable link to collect payments.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Product Purchase"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="What is this payment for?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (USDC)</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="10.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="network">Network</Label>
                    <Select value={network} onValueChange={handleNetworkChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NETWORK_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payToAddress">Payment Address</Label>
                  <Input
                    id="payToAddress"
                    placeholder={network === 'solana' ? 'Solana wallet address' : '0x...'}
                    value={payToAddress}
                    onChange={(e) => setPayToAddress(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Wallet address to receive payments (separate from facilitator wallet)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redirectUrl">Success Redirect URL (optional)</Label>
                  <Input
                    id="redirectUrl"
                    type="url"
                    placeholder="https://yoursite.com/thank-you"
                    value={successRedirectUrl}
                    onChange={(e) => setSuccessRedirectUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Redirect users here after successful payment
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!name || !amount || !payToAddress || createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Link'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {data?.links.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No payment links yet</p>
            <p className="text-sm">Create your first link to start collecting payments</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data?.links.map((link) => (
              <div
                key={link.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  link.active ? 'bg-background' : 'bg-muted/30 opacity-60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{link.name}</span>
                    {!link.active && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded">Inactive</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span className="font-mono">
                      ${formatAmount(link.amount)} {getTokenSymbol(link.network, link.asset)}
                    </span>
                    <span className="capitalize">{link.network}</span>
                    {link.stats && (
                      <span>
                        {link.stats.successfulPayments} payment{link.stats.successfulPayments !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyUrl(link)}
                    className="h-8 px-2"
                  >
                    {copiedId === link.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(link)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleActive(link)}>
                        {link.active ? (
                          <>
                            <ToggleLeft className="w-4 h-4 mr-2" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <ToggleRight className="w-4 h-4 mr-2" />
                            Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => {
                          if (confirm(`Delete "${link.name}"? This cannot be undone.`)) {
                            deleteMutation.mutate(link.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats summary */}
        {data?.stats && data.stats.totalLinks > 0 && (
          <div className="mt-4 pt-4 border-t flex items-center gap-6 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">{data.stats.activeLinks}</span> active links
            </div>
            <div>
              <span className="font-medium text-foreground">{data.stats.totalPayments}</span> total payments
            </div>
            <div>
              <span className="font-medium text-foreground">${formatAmount(data.stats.totalAmountCollected)}</span> collected
            </div>
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) setEditingLink(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Payment Link</DialogTitle>
            <DialogDescription>
              Update your payment link settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-amount">Amount (USDC)</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-network">Network</Label>
                <Select value={network} onValueChange={handleNetworkChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NETWORK_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-payToAddress">Payment Address</Label>
              <Input
                id="edit-payToAddress"
                placeholder={network === 'solana' ? 'Solana wallet address' : '0x...'}
                value={payToAddress}
                onChange={(e) => setPayToAddress(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Wallet address to receive payments
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-redirectUrl">Success Redirect URL (optional)</Label>
              <Input
                id="edit-redirectUrl"
                type="url"
                placeholder="https://yoursite.com/thank-you"
                value={successRedirectUrl}
                onChange={(e) => setSuccessRedirectUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateLink}
              disabled={!name || !amount || !payToAddress || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
