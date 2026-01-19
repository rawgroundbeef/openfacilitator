'use client';

import { useState } from 'react';
import {
  Server,
  Plus,
  Copy,
  Check,
  MoreVertical,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { RegisteredServer } from './types';

interface RegisteredServersProps {
  servers: RegisteredServer[];
  onRegisterServer: (url: string, name?: string) => Promise<{ apiKey?: string }>;
  onDeleteServer: (serverId: string) => Promise<void>;
  onRegenerateApiKey: (serverId: string) => Promise<{ apiKey?: string }>;
}

export function RegisteredServers({
  servers,
  onRegisterServer,
  onDeleteServer,
  onRegenerateApiKey,
}: RegisteredServersProps) {
  const [isAddServerOpen, setIsAddServerOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [serverName, setServerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegister = async () => {
    setIsSubmitting(true);
    try {
      const result = await onRegisterServer(serverUrl, serverName || undefined);
      setIsAddServerOpen(false);
      setServerUrl('');
      setServerName('');
      if (result.apiKey) {
        setNewApiKey(result.apiKey);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegenerate = async (serverId: string) => {
    const result = await onRegenerateApiKey(serverId);
    if (result.apiKey) {
      setNewApiKey(result.apiKey);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Registered Servers
              </CardTitle>
              <CardDescription>
                Servers that can report failures and create refund claims.
              </CardDescription>
            </div>
            <Button onClick={() => setIsAddServerOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Server
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {servers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No servers registered</p>
              <p className="text-sm">Add a server to enable failure reporting.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-lg border",
                    !server.active && "opacity-60"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{server.name || 'Unnamed Server'}</span>
                      <Badge variant={server.active ? "default" : "secondary"}>
                        {server.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {server.url}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleRegenerate(server.id)}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Regenerate API Key
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDeleteServer(server.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Server Dialog */}
      <Dialog open={isAddServerOpen} onOpenChange={setIsAddServerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Server</DialogTitle>
            <DialogDescription>
              Add a server that can report payment failures.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="serverUrl">Server URL</Label>
              <Input
                id="serverUrl"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://api.example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="serverName">Name (optional)</Label>
              <Input
                id="serverName"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                placeholder="Production Server"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddServerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegister} disabled={!serverUrl || isSubmitting}>
              {isSubmitting ? 'Registering...' : 'Register'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New API Key Dialog */}
      <Dialog open={!!newApiKey} onOpenChange={() => setNewApiKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Server API Key</DialogTitle>
            <DialogDescription>
              Copy this API key now. You won&apos;t be able to see it again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={newApiKey || ''}
                  readOnly
                  className="font-mono pr-20"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(newApiKey || '', 'api-key')}
                  >
                    {copiedId === 'api-key' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Store this key securely. Use it as the <code className="bg-muted px-1 rounded">REFUND_API_KEY</code> environment variable in your server.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewApiKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
