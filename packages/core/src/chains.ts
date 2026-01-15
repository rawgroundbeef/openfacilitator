import type { ChainConfig } from './types.js';

/**
 * Default supported chains for x402 facilitators
 * RPC URLs can be overridden via environment variables
 */
export const defaultChains: Record<string, ChainConfig> = {
  // ===== MAINNETS =====
  
  // Avalanche C-Chain
  '43114': {
    chainId: 43114,
    name: 'Avalanche',
    network: 'avalanche',
    rpcUrl: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
    blockExplorerUrl: 'https://snowtrace.io',
    isEVM: true,
  },
  // Base Mainnet
  '8453': {
    chainId: 8453,
    name: 'Base',
    network: 'base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    blockExplorerUrl: 'https://basescan.org',
    isEVM: true,
  },
  // Ethereum Mainnet
  '1': {
    chainId: 1,
    name: 'Ethereum',
    network: 'ethereum',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    blockExplorerUrl: 'https://etherscan.io',
    isEVM: true,
  },
  // IoTeX Mainnet
  '4689': {
    chainId: 4689,
    name: 'IoTeX',
    network: 'iotex',
    rpcUrl: process.env.IOTEX_RPC_URL || 'https://babel-api.mainnet.iotex.io',
    blockExplorerUrl: 'https://iotexscan.io',
    isEVM: true,
  },
  // Peaq Mainnet
  '3338': {
    chainId: 3338,
    name: 'Peaq',
    network: 'peaq',
    rpcUrl: process.env.PEAQ_RPC_URL || 'https://peaq.api.onfinality.io/public',
    blockExplorerUrl: 'https://peaq.subscan.io',
    isEVM: true,
  },
  // Polygon Mainnet
  '137': {
    chainId: 137,
    name: 'Polygon',
    network: 'polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    blockExplorerUrl: 'https://polygonscan.com',
    isEVM: true,
  },
  // Sei Mainnet (Pacific-1)
  '1329': {
    chainId: 1329,
    name: 'Sei',
    network: 'sei',
    rpcUrl: process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com',
    blockExplorerUrl: 'https://seitrace.com',
    isEVM: true,
  },
  // XLayer Mainnet (OKX)
  '196': {
    chainId: 196,
    name: 'XLayer',
    network: 'xlayer',
    rpcUrl: process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech',
    blockExplorerUrl: 'https://www.okx.com/explorer/xlayer',
    isEVM: true,
  },
  // Arbitrum One Mainnet
  '42161': {
    chainId: 42161,
    name: 'Arbitrum One',
    network: 'arbitrum',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    blockExplorerUrl: 'https://arbiscan.io',
    isEVM: true,
  },
  // Optimism Mainnet
  '10': {
    chainId: 10,
    name: 'Optimism',
    network: 'optimism',
    rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    blockExplorerUrl: 'https://optimistic.etherscan.io',
    isEVM: true,
  },
  // BNB Chain Mainnet
  '56': {
    chainId: 56,
    name: 'BNB Chain',
    network: 'bnb',
    rpcUrl: process.env.BNB_RPC_URL || 'https://bsc-dataseed1.binance.org',
    blockExplorerUrl: 'https://bscscan.com',
    isEVM: true,
  },
  // Linea Mainnet
  '59144': {
    chainId: 59144,
    name: 'Linea',
    network: 'linea',
    rpcUrl: process.env.LINEA_RPC_URL || 'https://rpc.linea.build',
    blockExplorerUrl: 'https://lineascan.build',
    isEVM: true,
  },
  // Solana Mainnet
  solana: {
    chainId: 'solana',
    name: 'Solana',
    network: 'solana',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    blockExplorerUrl: 'https://solscan.io',
    isEVM: false,
  },

  // ===== TESTNETS =====
  
  // Avalanche Fuji Testnet
  '43113': {
    chainId: 43113,
    name: 'Avalanche Fuji',
    network: 'avalanche-fuji',
    rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc',
    blockExplorerUrl: 'https://testnet.snowtrace.io',
    isEVM: true,
  },
  // Base Sepolia (Testnet)
  '84532': {
    chainId: 84532,
    name: 'Base Sepolia',
    network: 'base-sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    blockExplorerUrl: 'https://sepolia.basescan.org',
    isEVM: true,
  },
  // Polygon Amoy Testnet
  '80002': {
    chainId: 80002,
    name: 'Polygon Amoy',
    network: 'polygon-amoy',
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
    blockExplorerUrl: 'https://amoy.polygonscan.com',
    isEVM: true,
  },
  // Sei Testnet (Atlantic-2)
  '1328': {
    chainId: 1328,
    name: 'Sei Testnet',
    network: 'sei-testnet',
    rpcUrl: process.env.SEI_TESTNET_RPC_URL || 'https://evm-rpc-testnet.sei-apis.com',
    blockExplorerUrl: 'https://testnet.seitrace.com',
    isEVM: true,
  },
  // Sepolia Testnet
  '11155111': {
    chainId: 11155111,
    name: 'Sepolia',
    network: 'sepolia',
    rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    isEVM: true,
  },
  // XLayer Testnet
  '195': {
    chainId: 195,
    name: 'XLayer Testnet',
    network: 'xlayer-testnet',
    rpcUrl: process.env.XLAYER_TESTNET_RPC_URL || 'https://testrpc.xlayer.tech',
    blockExplorerUrl: 'https://www.okx.com/explorer/xlayer-test',
    isEVM: true,
  },
  // Arbitrum Sepolia Testnet
  '421614': {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    network: 'arbitrum-sepolia',
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
    blockExplorerUrl: 'https://sepolia.arbiscan.io',
    isEVM: true,
  },
  // Optimism Sepolia Testnet
  '11155420': {
    chainId: 11155420,
    name: 'Optimism Sepolia',
    network: 'optimism-sepolia',
    rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC_URL || 'https://sepolia.optimism.io',
    blockExplorerUrl: 'https://sepolia-optimism.etherscan.io',
    isEVM: true,
  },
  // BNB Chain Testnet
  '97': {
    chainId: 97,
    name: 'BNB Chain Testnet',
    network: 'bnb-testnet',
    rpcUrl: process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545',
    blockExplorerUrl: 'https://testnet.bscscan.com',
    isEVM: true,
  },
  // Linea Goerli Testnet
  '59140': {
    chainId: 59140,
    name: 'Linea Goerli',
    network: 'linea-goerli',
    rpcUrl: process.env.LINEA_GOERLI_RPC_URL || 'https://rpc.goerli.linea.build',
    blockExplorerUrl: 'https://goerli.lineascan.build',
    isEVM: true,
  },
  // Solana Devnet
  'solana-devnet': {
    chainId: 'solana-devnet',
    name: 'Solana Devnet',
    network: 'solana-devnet',
    rpcUrl: process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com',
    blockExplorerUrl: 'https://solscan.io/?cluster=devnet',
    isEVM: false,
  },
};

/**
 * Get chain configuration by chain ID or network name
 */
export function getChainConfig(chainIdOrNetwork: number | string): ChainConfig | undefined {
  const key = String(chainIdOrNetwork);
  return defaultChains[key] || Object.values(defaultChains).find(c => c.network === key);
}

/**
 * Get all supported chain IDs/networks
 */
export function getSupportedChains(): (number | string)[] {
  return Object.values(defaultChains).map(c => c.chainId);
}

/**
 * Check if a chain is supported
 */
export function isChainSupported(chainIdOrNetwork: number | string): boolean {
  return !!getChainConfig(chainIdOrNetwork);
}

/**
 * Network name to chain ID mapping
 */
export const networkToChainId: Record<string, number | string> = {
  // Mainnets
  avalanche: 43114,
  base: 8453,
  ethereum: 1,
  iotex: 4689,
  peaq: 3338,
  polygon: 137,
  sei: 1329,
  xlayer: 196,
  arbitrum: 42161,
  optimism: 10,
  bnb: 56,
  linea: 59144,
  solana: 'solana',
  'solana-mainnet': 'solana', // Alias for compatibility
  // Testnets
  'avalanche-fuji': 43113,
  'base-sepolia': 84532,
  'polygon-amoy': 80002,
  'sei-testnet': 1328,
  sepolia: 11155111,
  'xlayer-testnet': 195,
  'arbitrum-sepolia': 421614,
  'optimism-sepolia': 11155420,
  'bnb-testnet': 97,
  'linea-goerli': 59140,
  'solana-devnet': 'solana-devnet',
};

/**
 * Chain ID to network name mapping
 */
export const chainIdToNetwork: Record<string | number, string> = {
  // Mainnets
  43114: 'avalanche',
  8453: 'base',
  1: 'ethereum',
  4689: 'iotex',
  3338: 'peaq',
  137: 'polygon',
  1329: 'sei',
  196: 'xlayer',
  42161: 'arbitrum',
  10: 'optimism',
  56: 'bnb',
  59144: 'linea',
  solana: 'solana',
  'solana-mainnet': 'solana', // Alias
  // Testnets
  43113: 'avalanche-fuji',
  84532: 'base-sepolia',
  80002: 'polygon-amoy',
  1328: 'sei-testnet',
  11155111: 'sepolia',
  195: 'xlayer-testnet',
  421614: 'arbitrum-sepolia',
  11155420: 'optimism-sepolia',
  97: 'bnb-testnet',
  59140: 'linea-goerli',
  'solana-devnet': 'solana-devnet',
};

/**
 * Get chain ID from network name (supports both v1 human-readable and v2 CAIP-2 formats)
 */
export function getChainIdFromNetwork(network: string): number | string | undefined {
  // First try direct lookup (v1 human-readable format)
  const direct = networkToChainId[network.toLowerCase()];
  if (direct !== undefined) return direct;

  // Try CAIP-2 format - parse and extract chain ID
  if (network.startsWith('eip155:')) {
    const chainIdStr = network.slice(7); // Remove 'eip155:' prefix
    const chainId = parseInt(chainIdStr, 10);
    if (!isNaN(chainId) && chainIdToNetwork[chainId]) {
      return chainId;
    }
  }

  // Try Solana CAIP-2 format
  if (network.startsWith('solana:')) {
    const genesisHash = network.slice(7); // Remove 'solana:' prefix
    // Check known genesis hashes
    if (genesisHash === '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp') {
      return 'solana';
    }
    if (genesisHash === 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1') {
      return 'solana-devnet';
    }
  }

  return undefined;
}

/**
 * Get network name from chain ID
 */
export function getNetworkFromChainId(chainId: number | string): string | undefined {
  return chainIdToNetwork[chainId];
}

/**
 * Production chains (mainnet only)
 */
export const productionChains = [
  43114, // Avalanche
  8453,  // Base
  1,     // Ethereum
  4689,  // IoTeX
  3338,  // Peaq
  137,   // Polygon
  1329,  // Sei
  196,   // XLayer
  42161, // Arbitrum
  10,    // Optimism
  56,    // BNB Chain
  59144, // Linea
  'solana',
] as const;

/**
 * Test chains
 */
export const testChains = [
  43113,    // Avalanche Fuji
  84532,    // Base Sepolia
  80002,    // Polygon Amoy
  1328,     // Sei Testnet
  11155111, // Sepolia
  195,      // XLayer Testnet
  421614,   // Arbitrum Sepolia
  11155420, // Optimism Sepolia
  97,       // BNB Chain Testnet
  59140,    // Linea Goerli
  'solana-devnet',
] as const;

// ===== CAIP-2 Network Identifiers =====
// https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md

/**
 * Solana genesis hash prefixes for CAIP-2
 */
export const solanaGenesisHashes = {
  mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  testnet: '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
} as const;

/**
 * Network name to CAIP-2 identifier mapping
 */
export const networkToCaip2: Record<string, string> = {
  // EVM Mainnets
  avalanche: 'eip155:43114',
  base: 'eip155:8453',
  ethereum: 'eip155:1',
  iotex: 'eip155:4689',
  peaq: 'eip155:3338',
  polygon: 'eip155:137',
  sei: 'eip155:1329',
  xlayer: 'eip155:196',
  arbitrum: 'eip155:42161',
  optimism: 'eip155:10',
  bnb: 'eip155:56',
  linea: 'eip155:59144',
  // Solana
  solana: `solana:${solanaGenesisHashes.mainnet}`,
  // EVM Testnets
  'avalanche-fuji': 'eip155:43113',
  'base-sepolia': 'eip155:84532',
  'polygon-amoy': 'eip155:80002',
  'sei-testnet': 'eip155:1328',
  sepolia: 'eip155:11155111',
  'xlayer-testnet': 'eip155:195',
  'arbitrum-sepolia': 'eip155:421614',
  'optimism-sepolia': 'eip155:11155420',
  'bnb-testnet': 'eip155:97',
  'linea-goerli': 'eip155:59140',
  'solana-devnet': `solana:${solanaGenesisHashes.devnet}`,
};

/**
 * CAIP-2 identifier to network name mapping
 */
export const caip2ToNetwork: Record<string, string> = {
  // EVM Mainnets
  'eip155:43114': 'avalanche',
  'eip155:8453': 'base',
  'eip155:1': 'ethereum',
  'eip155:4689': 'iotex',
  'eip155:3338': 'peaq',
  'eip155:137': 'polygon',
  'eip155:1329': 'sei',
  'eip155:196': 'xlayer',
  'eip155:42161': 'arbitrum',
  'eip155:10': 'optimism',
  'eip155:56': 'bnb',
  'eip155:59144': 'linea',
  // Solana
  [`solana:${solanaGenesisHashes.mainnet}`]: 'solana',
  // EVM Testnets
  'eip155:43113': 'avalanche-fuji',
  'eip155:84532': 'base-sepolia',
  'eip155:80002': 'polygon-amoy',
  'eip155:1328': 'sei-testnet',
  'eip155:11155111': 'sepolia',
  'eip155:195': 'xlayer-testnet',
  'eip155:421614': 'arbitrum-sepolia',
  'eip155:11155420': 'optimism-sepolia',
  'eip155:97': 'bnb-testnet',
  'eip155:59140': 'linea-goerli',
  [`solana:${solanaGenesisHashes.devnet}`]: 'solana-devnet',
};

/**
 * Get CAIP-2 identifier from network name
 */
export function getCaip2FromNetwork(network: string): string | undefined {
  return networkToCaip2[network.toLowerCase()];
}

/**
 * Get network name from CAIP-2 identifier
 */
export function getNetworkFromCaip2(caip2: string): string | undefined {
  return caip2ToNetwork[caip2];
}

/**
 * Get CAIP-2 namespace prefix from network (e.g., "eip155:*" or "solana:*")
 */
export function getCaip2Namespace(network: string): string {
  const config = getChainConfig(network);
  if (!config) return 'eip155:*';
  return config.isEVM ? 'eip155:*' : 'solana:*';
}

/**
 * Check if a network identifier is CAIP-2 format
 */
export function isCaip2Format(identifier: string): boolean {
  return identifier.includes(':') && (identifier.startsWith('eip155:') || identifier.startsWith('solana:'));
}
