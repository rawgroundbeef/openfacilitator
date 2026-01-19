import type { TokenConfig, ChainId } from './types.js';

/**
 * Well-known token addresses across chains
 */
export const knownTokens: Record<string, Record<ChainId, string>> = {
  // USDC addresses
  USDC: {
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet
    84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum
    11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum One
    421614: '0x75faf114eafb1BDbe2F0316DF893fd58cE9AF907', // Arbitrum Sepolia
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism
    11155420: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', // Optimism Sepolia
    56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // BNB Chain
    97: '0x64544969ed7EBf5f083679233325356EbE738930', // BNB Chain Testnet
    59144: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', // Linea
    59140: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', // Linea Goerli
    solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Solana Mainnet
    'solana-devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Solana Devnet
  },
  // WETH addresses (EVM only)
  WETH: {
    8453: '0x4200000000000000000000000000000000000006', // Base
    84532: '0x4200000000000000000000000000000000000006', // Base Sepolia
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Ethereum
    11155111: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', // Sepolia
  },
  // SOL (wrapped, for Solana)
  SOL: {
    solana: 'So11111111111111111111111111111111111111112', // Native SOL (wrapped)
  },
};

/**
 * Default token configurations for facilitators (production)
 */
export const defaultTokens: TokenConfig[] = [
  // USDC on Base Mainnet
  {
    address: knownTokens.USDC[8453],
    symbol: 'USDC',
    decimals: 6,
    chainId: 8453,
  },
  // USDC on Solana Mainnet
  {
    address: knownTokens.USDC['solana'],
    symbol: 'USDC',
    decimals: 6,
    chainId: 'solana',
  },
];

/**
 * Test token configurations
 */
export const testTokens: TokenConfig[] = [
  // USDC on Base Sepolia
  {
    address: knownTokens.USDC[84532],
    symbol: 'USDC',
    decimals: 6,
    chainId: 84532,
  },
  // USDC on Solana Devnet
  {
    address: knownTokens.USDC['solana-devnet'],
    symbol: 'USDC',
    decimals: 6,
    chainId: 'solana-devnet',
  },
];

/**
 * All available tokens (production + test)
 */
export const allTokens: TokenConfig[] = [...defaultTokens, ...testTokens];

/**
 * Get token config for a specific chain and address
 */
export function getTokenConfig(chainId: ChainId, address: string): TokenConfig | undefined {
  return allTokens.find(
    (t) => t.chainId === chainId && t.address.toLowerCase() === address.toLowerCase()
  );
}

/**
 * Get all tokens for a specific chain
 */
export function getTokensForChain(chainId: ChainId): TokenConfig[] {
  return allTokens.filter((t) => t.chainId === chainId);
}

/**
 * Check if a token is supported on a chain
 */
export function isTokenSupported(chainId: ChainId, address: string): boolean {
  return allTokens.some(
    (t) => t.chainId === chainId && t.address.toLowerCase() === address.toLowerCase()
  );
}

/**
 * Get production tokens only
 */
export function getProductionTokens(): TokenConfig[] {
  return defaultTokens;
}

/**
 * Get test tokens only
 */
export function getTestTokens(): TokenConfig[] {
  return testTokens;
}
