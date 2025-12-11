const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Facilitator {
  id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  ownerAddress: string;
  supportedChains: number[];
  supportedTokens: TokenConfig[];
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
}

export interface Transaction {
  id: string;
  type: 'verify' | 'settle';
  network: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset: string;
  transactionHash?: string;
  status: 'pending' | 'success' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

export interface CreateFacilitatorRequest {
  name: string;
  subdomain: string;
  customDomain?: string;
  ownerAddress?: string;
  supportedChains?: number[];
  supportedTokens?: TokenConfig[];
}

export interface ExportConfig {
  dockerCompose: string;
  envFile: string;
  instructions: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface WalletInfo {
  hasWallet: boolean;
  address: string | null;
  balances: Record<string, { balance: string; formatted: string }>;
}

export interface WalletGenerateResponse {
  success: boolean;
  address: string;
  message: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      credentials: 'include', // Include cookies for auth
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // User
  async getMe(): Promise<User> {
    return this.request('/api/admin/me');
  }

  // Facilitators - now uses authenticated user, owner param is optional
  async getFacilitators(): Promise<Facilitator[]> {
    return this.request('/api/admin/facilitators');
  }

  async getFacilitator(id: string): Promise<Facilitator> {
    return this.request(`/api/admin/facilitators/${id}`);
  }

  async createFacilitator(data: CreateFacilitatorRequest): Promise<Facilitator> {
    return this.request('/api/admin/facilitators', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateFacilitator(
    id: string,
    data: Partial<{
      name: string;
      customDomain: string | null;
      supportedChains: number[];
      supportedTokens: TokenConfig[];
    }>
  ): Promise<Facilitator> {
    return this.request(`/api/admin/facilitators/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteFacilitator(id: string): Promise<void> {
    return this.request(`/api/admin/facilitators/${id}`, {
      method: 'DELETE',
    });
  }

  // Transactions
  async getTransactions(
    facilitatorId: string,
    limit = 50,
    offset = 0
  ): Promise<{ transactions: Transaction[]; pagination: { limit: number; offset: number } }> {
    return this.request(
      `/api/admin/facilitators/${facilitatorId}/transactions?limit=${limit}&offset=${offset}`
    );
  }

  // Export
  async exportConfig(facilitatorId: string): Promise<ExportConfig> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/export`, {
      method: 'POST',
    });
  }

  // Domain Management
  async setupDomain(facilitatorId: string): Promise<{ success: boolean; domain?: string; status?: string; message?: string; error?: string }> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/domain`, {
      method: 'POST',
    });
  }

  async removeDomain(facilitatorId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/domain`, {
      method: 'DELETE',
    });
  }

  async getDomainStatus(facilitatorId: string): Promise<{
    domain: string;
    status: 'pending' | 'active' | 'not_added' | 'unconfigured' | 'manual_setup';
    railwayConfigured: boolean;
    message?: string;
    dnsRecords?: { type: string; name: string; value: string }[];
  }> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/domain/status`);
  }

  // Wallet Management
  async getWallet(facilitatorId: string): Promise<WalletInfo> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/wallet`);
  }

  async generateWallet(facilitatorId: string): Promise<WalletGenerateResponse> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/wallet`, {
      method: 'POST',
    });
  }

  async importWallet(facilitatorId: string, privateKey: string): Promise<WalletGenerateResponse> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/wallet/import`, {
      method: 'POST',
      body: JSON.stringify({ privateKey }),
    });
  }

  async deleteWallet(facilitatorId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/wallet`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient(API_BASE);

