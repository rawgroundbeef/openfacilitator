const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';

export interface Facilitator {
  id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  additionalDomains?: string[];
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

export interface SolanaWalletInfo {
  hasWallet: boolean;
  address: string | null;
  balance: { sol: string; lamports: string } | null;
}

export interface WalletGenerateResponse {
  success: boolean;
  address: string;
  message: string;
}

export interface BillingWallet {
  hasWallet: boolean;
  address: string;
  network: string;
  balance: string;
  token: string;
}

export interface BillingWalletCreateResponse {
  address: string;
  network: string;
  created: boolean;
  message: string;
}

export interface SubscriptionStatus {
  active: boolean;
  tier: 'basic' | 'pro' | null;
  expires: string | null;
}

export interface SubscriptionPricing {
  basic: { price: number; priceFormatted: string; currency: string; period: string };
  pro: { price: number; priceFormatted: string; currency: string; period: string };
}

export interface PurchaseResult {
  success: boolean;
  message?: string;
  tier?: 'basic' | 'pro';
  error?: string;
  insufficientBalance?: boolean;
  required?: string;
  available?: string;
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
      additionalDomains: string[];
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
  ): Promise<{ 
    transactions: Transaction[]; 
    stats: { 
      totalVerifications: number; 
      totalSettlements: number; 
      totalFailed: number; 
      total: number;
      totalAmountSettled: string;
    };
    pagination: { limit: number; offset: number } 
  }> {
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

  // Solana Wallet Management
  async getSolanaWallet(facilitatorId: string): Promise<SolanaWalletInfo> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/wallet/solana`);
  }

  async generateSolanaWallet(facilitatorId: string): Promise<WalletGenerateResponse> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/wallet/solana`, {
      method: 'POST',
    });
  }

  async importSolanaWallet(facilitatorId: string, privateKey: string): Promise<WalletGenerateResponse> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/wallet/solana/import`, {
      method: 'POST',
      body: JSON.stringify({ privateKey }),
    });
  }

  async deleteSolanaWallet(facilitatorId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/admin/facilitators/${facilitatorId}/wallet/solana`, {
      method: 'DELETE',
    });
  }

  // Billing Wallet (user's subscription wallet)
  async getBillingWallet(): Promise<BillingWallet> {
    return this.request('/api/admin/wallet');
  }

  async createBillingWallet(): Promise<BillingWalletCreateResponse> {
    return this.request('/api/admin/wallet/create', {
      method: 'POST',
    });
  }

  // Subscription Management
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    return this.request('/api/subscriptions/status');
  }

  async getSubscriptionPricing(): Promise<SubscriptionPricing> {
    return this.request('/api/subscriptions/pricing');
  }

  async purchaseSubscription(tier: 'basic' | 'pro'): Promise<PurchaseResult> {
    const response = await fetch(`${this.baseUrl}/api/subscriptions/purchase`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });

    const data = await response.json();

    if (response.status === 402) {
      return {
        success: false,
        insufficientBalance: true,
        required: data.required,
        available: data.available,
        error: data.message || 'Insufficient balance',
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || `HTTP ${response.status}`,
      };
    }

    return data;
  }
}

export const api = new ApiClient(API_BASE);

