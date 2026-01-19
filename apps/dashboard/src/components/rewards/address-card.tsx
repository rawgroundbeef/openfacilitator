'use client';

import { Button } from '@/components/ui/button';
import { Wallet, X, Loader2, CheckCircle, Clock } from 'lucide-react';

interface AddressCardProps {
  address: {
    id: string;
    address: string;
    chain_type: 'solana' | 'evm';
    verification_status: 'pending' | 'verified';
    created_at: string;
  };
  onRemove?: (id: string) => void;
  isRemoving?: boolean;
}

export function AddressCard({ address, onRemove, isRemoving }: AddressCardProps) {
  // Truncate address: first 6...last 4 chars
  const truncatedAddress = `${address.address.slice(0, 6)}...${address.address.slice(-4)}`;

  // Format date
  const dateAdded = new Date(address.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const isVerified = address.verification_status === 'verified';

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-primary/10">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{truncatedAddress}</span>
            {isVerified ? (
              <span className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                <CheckCircle className="h-3 w-3" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded">
                <Clock className="h-3 w-3" />
                Pending
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Added {dateAdded}
          </p>
        </div>
      </div>

      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(address.id)}
          disabled={isRemoving}
        >
          {isRemoving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}
