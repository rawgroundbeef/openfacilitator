'use client';

import { useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, type Facilitator } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const SUBSCRIPTION_PAYMENT_URL = process.env.NEXT_PUBLIC_SUBSCRIPTION_PAYMENT_URL || 'https://pay.openfacilitator.io/pay/9H_WKcSOnPAQNJlglx348';

interface CreateFacilitatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (facilitator: Facilitator) => void;
  walletBalance?: string;
}

export function CreateFacilitatorModal({
  open,
  onOpenChange,
  onSuccess,
  walletBalance,
}: CreateFacilitatorModalProps) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const { toast } = useToast();

  const pendingMutation = useMutation({
    mutationFn: async (data: { name: string; customDomain: string }) => {
      // Save pending facilitator request
      await api.createPendingFacilitator(data);
    },
    onSuccess: () => {
      // Open payment link - webhook will create the facilitator after payment
      window.open(SUBSCRIPTION_PAYMENT_URL, '_blank');

      toast({
        title: 'Complete payment to create facilitator',
        description: 'Your facilitator will be created automatically after payment.',
      });

      // Close modal and reset form
      onOpenChange(false);
      setName('');
      setDomain('');
    },
    onError: (error) => {
      toast({
        title: 'Failed to start facilitator creation',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    },
  });

  const handlePayAndCreate = () => {
    if (!name.trim() || !domain.trim()) return;
    pendingMutation.mutate({
      name: name.trim(),
      customDomain: domain.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Facilitator</DialogTitle>
          <DialogDescription>
            Set up a new x402 facilitator with your own domain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My Project"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Internal name for your reference
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <Input
              id="domain"
              placeholder="pay.yourdomain.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
            />
            <p className="text-xs text-muted-foreground">
              You'll need to configure DNS after creation
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Cost</span>
              <span className="font-semibold">$5.00 USDC/month</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Pay via x402 to activate your facilitator. Your facilitator will be created automatically after payment.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePayAndCreate}
            disabled={!name.trim() || !domain.trim() || pendingMutation.isPending}
          >
            {pendingMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Preparing...
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 mr-2" />
                Pay $5 & Create
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
