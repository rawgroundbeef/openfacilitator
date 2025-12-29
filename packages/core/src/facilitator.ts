import { createPublicClient, http, type Hex, type Address, type Chain, defineChain } from 'viem';
import { 
  avalanche, 
  avalancheFuji,
  base, 
  baseSepolia, 
  mainnet, 
  polygon,
  polygonAmoy,
  sepolia,
} from 'viem/chains';
import type {
  FacilitatorConfig,
  PaymentRequirements,
  SettleResponse,
  SupportedKind,
  SupportedResponse,
  VerifyResponse,
  X402PaymentPayload,
  ChainId,
} from './types.js';
import { getChainIdFromNetwork, getNetworkFromChainId, defaultChains } from './chains.js';
import { executeERC3009Settlement } from './erc3009.js';
import { executeSolanaSettlement } from './solana.js';

/**
 * Custom chain definitions for chains not in viem
 */
const iotex = defineChain({
  id: 4689,
  name: 'IoTeX',
  nativeCurrency: { name: 'IOTX', symbol: 'IOTX', decimals: 18 },
  rpcUrls: { default: { http: ['https://babel-api.mainnet.iotex.io'] } },
  blockExplorers: { default: { name: 'IoTeXScan', url: 'https://iotexscan.io' } },
});

const peaq = defineChain({
  id: 3338,
  name: 'Peaq',
  nativeCurrency: { name: 'PEAQ', symbol: 'PEAQ', decimals: 18 },
  rpcUrls: { default: { http: ['https://peaq.api.onfinality.io/public'] } },
  blockExplorers: { default: { name: 'Subscan', url: 'https://peaq.subscan.io' } },
});

const sei = defineChain({
  id: 1329,
  name: 'Sei',
  nativeCurrency: { name: 'SEI', symbol: 'SEI', decimals: 18 },
  rpcUrls: { default: { http: ['https://evm-rpc.sei-apis.com'] } },
  blockExplorers: { default: { name: 'SeiTrace', url: 'https://seitrace.com' } },
});

const seiTestnet = defineChain({
  id: 1328,
  name: 'Sei Testnet',
  nativeCurrency: { name: 'SEI', symbol: 'SEI', decimals: 18 },
  rpcUrls: { default: { http: ['https://evm-rpc-testnet.sei-apis.com'] } },
  blockExplorers: { default: { name: 'SeiTrace Testnet', url: 'https://testnet.seitrace.com' } },
  testnet: true,
});

const xlayer = defineChain({
  id: 196,
  name: 'XLayer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.xlayer.tech'] } },
  blockExplorers: { default: { name: 'OKX Explorer', url: 'https://www.okx.com/explorer/xlayer' } },
});

const xlayerTestnet = defineChain({
  id: 195,
  name: 'XLayer Testnet',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: ['https://testrpc.xlayer.tech'] } },
  blockExplorers: { default: { name: 'OKX Explorer', url: 'https://www.okx.com/explorer/xlayer-test' } },
  testnet: true,
});

/**
 * Chain ID to viem chain mapping (EVM chains only)
 */
const viemChains: Record<number, Chain> = {
  // Mainnets
  43114: avalanche,
  8453: base,
  1: mainnet,
  4689: iotex,
  3338: peaq,
  137: polygon,
  1329: sei,
  196: xlayer,
  // Testnets
  43113: avalancheFuji,
  84532: baseSepolia,
  80002: polygonAmoy,
  1328: seiTestnet,
  11155111: sepolia,
  195: xlayerTestnet,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPublicClient = ReturnType<typeof createPublicClient<any, any>>;

/**
 * Check if a chain ID is an EVM chain
 */
function isEVMChain(chainId: ChainId): chainId is number {
  return typeof chainId === 'number';
}

/**
 * Facilitator class for handling x402 payment verification and settlement
 */
export class Facilitator {
  private config: FacilitatorConfig;
  private clients: Map<number, AnyPublicClient> = new Map();

  constructor(config: FacilitatorConfig) {
    this.config = config;
    this.initializeClients();
  }

  /**
   * Initialize viem clients for supported EVM chains
   */
  private initializeClients(): void {
    for (const chainId of this.config.supportedChains) {
      // Only initialize clients for EVM chains
      if (!isEVMChain(chainId)) continue;

      const chain = viemChains[chainId];
      const chainConfig = defaultChains[String(chainId)];

      if (chain && chainConfig) {
        const client = createPublicClient({
          chain,
          transport: http(chainConfig.rpcUrl),
        }) as AnyPublicClient;
        this.clients.set(chainId, client);
      }
    }
  }

  /**
   * Get the facilitator configuration
   */
  getConfig(): FacilitatorConfig {
    return this.config;
  }

  /**
   * Get supported payment kinds for this facilitator
   */
  getSupported(): SupportedResponse {
    const kinds: SupportedKind[] = [];

    for (const token of this.config.supportedTokens) {
      const network = getNetworkFromChainId(token.chainId);
      if (network) {
        kinds.push({
          scheme: 'exact',
          network,
          asset: token.address,
        });
      }
    }

    return {
      x402Version: 1,
      kinds,
    };
  }

  /**
   * Verify a payment payload
   */
  async verify(
    paymentPayload: string,
    requirements: PaymentRequirements
  ): Promise<VerifyResponse> {
    try {
      // Parse the base64-encoded payment payload
      const decoded = Buffer.from(paymentPayload, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded);

      // Get chain ID from network
      const chainId = getChainIdFromNetwork(requirements.network);
      if (!chainId) {
        return {
          valid: false,
          invalidReason: `Unsupported network: ${requirements.network}`,
        };
      }

      // Check if chain is supported by this facilitator
      const isSupported = this.config.supportedChains.some(
        (c) => String(c) === String(chainId)
      );
      if (!isSupported) {
        return {
          valid: false,
          invalidReason: `Chain ${chainId} not supported by this facilitator`,
        };
      }

      // Handle Solana verification differently
      if (chainId === 'solana' || chainId === 'solana-devnet') {
        // Solana payloads have transaction in payload.payload.transaction
        const solanaPayload = payload.payload || payload;
        if (!solanaPayload.transaction) {
          return {
            valid: false,
            invalidReason: 'Missing transaction in Solana payment payload',
          };
        }
        // For Solana, we trust the pre-signed transaction
        // The actual verification happens during settlement
        return {
          valid: true,
          payer: 'solana-payer', // Payer is embedded in the transaction
        };
      }

      // EVM verification
      if (isEVMChain(chainId)) {
        const client = this.clients.get(chainId);
        if (!client) {
          return {
            valid: false,
            invalidReason: `No client configured for chain ${chainId}`,
          };
        }

        // Extract authorization - handle both nested (payload.authorization) and flat (authorization) formats
        // Format 1: { authorization: {...}, signature: "..." }
        // Format 2: { payload: { authorization: {...}, signature: "..." } }
        let authorization = (payload as X402PaymentPayload).authorization;
        if (!authorization && payload.payload) {
          authorization = payload.payload.authorization;
        }
        
        if (!authorization) {
          return {
            valid: false,
            invalidReason: 'Missing authorization in EVM payment payload',
          };
        }

        // Check timestamp validity
        const now = Math.floor(Date.now() / 1000);
        if (authorization.validAfter > now) {
          return {
            valid: false,
            invalidReason: 'Payment not yet valid',
          };
        }
        if (authorization.validBefore < now) {
          return {
            valid: false,
            invalidReason: 'Payment has expired',
          };
        }

        // Check amount meets requirements
        const paymentAmount = BigInt(authorization.value);
        const requiredAmount = BigInt(requirements.maxAmountRequired);
        if (paymentAmount < requiredAmount) {
          return {
            valid: false,
            invalidReason: `Payment amount ${paymentAmount} is less than required ${requiredAmount}`,
          };
        }

        return {
          valid: true,
          payer: authorization.from,
        };
      }

      return {
        valid: false,
        invalidReason: `Unknown chain type: ${chainId}`,
      };
    } catch (error) {
      return {
        valid: false,
        invalidReason: error instanceof Error ? error.message : 'Unknown error during verification',
      };
    }
  }

  /**
   * Settle a payment (execute the transfer)
   */
  async settle(
    paymentPayload: string,
    requirements: PaymentRequirements,
    privateKey?: string // Can be Hex for EVM or base58 for Solana
  ): Promise<SettleResponse> {
    try {
      // First verify the payment
      const verification = await this.verify(paymentPayload, requirements);
      if (!verification.valid) {
        return {
          success: false,
          errorMessage: verification.invalidReason,
          network: requirements.network,
        };
      }

      // Parse payload
      const decoded = Buffer.from(paymentPayload, 'base64').toString('utf-8');
      const payload = JSON.parse(decoded);

      const chainId = getChainIdFromNetwork(requirements.network);
      if (!chainId) {
        return {
          success: false,
          errorMessage: `Unsupported network: ${requirements.network}`,
          network: requirements.network,
        };
      }

      if (!privateKey) {
        return {
          success: false,
          errorMessage: 'Private key required for settlement',
          network: requirements.network,
        };
      }

      // Handle Solana chains FIRST (before EVM check)
      if (chainId === 'solana' || chainId === 'solana-devnet') {
        // Solana payload structure: { payload: { transaction: "...", signature: "..." } }
        const solanaPayload = payload.payload || payload;
        const signedTransaction = solanaPayload.transaction;
        
        if (!signedTransaction) {
          return {
            success: false,
            errorMessage: 'Missing transaction in Solana payment payload',
            network: requirements.network,
          };
        }

        // For Solana, private key is base58 encoded (not hex)
        const result = await executeSolanaSettlement({
          network: chainId as 'solana' | 'solana-devnet',
          signedTransaction,
          facilitatorPrivateKey: privateKey,
        });

        if (result.success) {
          return {
            success: true,
            transactionHash: result.transactionHash,
            network: requirements.network,
          };
        } else {
          return {
            success: false,
            errorMessage: result.errorMessage,
            network: requirements.network,
          };
        }
      }

      // Handle EVM chains (Base, Ethereum)
      if (isEVMChain(chainId)) {
        // Extract authorization and signature - handle both nested and flat formats
        // Format 1: { authorization: {...}, signature: "..." }
        // Format 2: { payload: { authorization: {...}, signature: "..." } }
        let authorization = (payload as X402PaymentPayload).authorization;
        let signature = (payload as X402PaymentPayload).signature;
        
        if (!authorization && payload.payload) {
          authorization = payload.payload.authorization;
          signature = payload.payload.signature;
        }
        
        if (!authorization) {
          return {
            success: false,
            errorMessage: 'Missing authorization in EVM payment payload',
            network: requirements.network,
          };
        }

        const result = await executeERC3009Settlement({
          chainId,
          tokenAddress: requirements.asset as Address,
          authorization: {
            from: authorization.from as Address,
            to: authorization.to as Address,
            value: authorization.value,
            validAfter: authorization.validAfter,
            validBefore: authorization.validBefore,
            nonce: authorization.nonce as Hex,
          },
          signature: signature as Hex,
          facilitatorPrivateKey: privateKey as Hex,
        });

        if (result.success) {
          return {
            success: true,
            transactionHash: result.transactionHash,
            network: requirements.network,
          };
        } else {
          return {
            success: false,
            errorMessage: result.errorMessage,
            network: requirements.network,
          };
        }
      }

      return {
        success: false,
        errorMessage: `Unknown chain type: ${chainId}`,
        network: requirements.network,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error during settlement',
        network: requirements.network,
      };
    }
  }
}

/**
 * Create a new facilitator instance
 */
export function createFacilitator(config: FacilitatorConfig): Facilitator {
  return new Facilitator(config);
}
