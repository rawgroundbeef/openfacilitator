'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AddressCard } from './address-card';
import { api, type RewardsStatus } from '@/lib/api';
import { Plus } from 'lucide-react';

interface AddressListProps {
  addresses: RewardsStatus['addresses'];
  onAddAddress: () => void;
  onAddressRemoved: () => void;
}

export function AddressList({
  addresses,
  onAddAddress,
  onAddressRemoved,
}: AddressListProps) {
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await api.deleteRewardAddress(id);
      onAddressRemoved();
    } catch (error) {
      console.error('Failed to remove address:', error);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Registered Addresses</h4>
        <Button variant="outline" size="sm" onClick={onAddAddress}>
          <Plus className="h-4 w-4 mr-1" />
          Add Address
        </Button>
      </div>

      {addresses.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          No addresses registered yet.
        </div>
      ) : (
        <div className="space-y-2">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onRemove={handleRemove}
              isRemoving={removingId === address.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
