/**
 * ERC-3009 (transferWithAuthorization / receiveWithAuthorization) implementation
 *
 * This is used for gasless USDC transfers where the payer signs an authorization
 * and the facilitator submits the transaction.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type Chain,
  encodeFunctionData,
  parseSignature,
  defineChain,
} from 'viem';

/**
 * In-memory nonce deduplication cache
 * Tracks nonces that are currently being processed to prevent double-submissions
 * Key: `${chainId}:${from}:${nonce}` - Value: timestamp when added
 */
const processingNonces = new Map<string, number>();

// Clean up old entries every 5 minutes (nonces older than 10 minutes are removed)
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of processingNonces.entries()) {
    if (now - timestamp > NONCE_TTL_MS) {
      processingNonces.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if a nonce is already being processed and mark it if not
 * Returns true if nonce is new (not a duplicate), false if duplicate
 */
function tryAcquireNonce(chainId: number, from: string, nonce: string): boolean {
  const key = `${chainId}:${from.toLowerCase()}:${nonce.toLowerCase()}`;
  if (processingNonces.has(key)) {
    return false; // Duplicate
  }
  processingNonces.set(key, Date.now());
  return true;
}

/**
 * Release a nonce from the processing cache (call after tx completes or fails)
 */
function releaseNonce(chainId: number, from: string, nonce: string): void {
  const key = `${chainId}:${from.toLowerCase()}:${nonce.toLowerCase()}`;
  processingNonces.delete(key);
}
import { privateKeyToAccount } from 'viem/accounts';
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

/**
 * ERC-3009 transferWithAuthorization ABI
 * Note: We use transferWithAuthorization instead of receiveWithAuthorization
 * because receiveWithAuthorization requires the caller to be the payee,
 * but we want the facilitator to be able to call it.
 */
const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

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
 * Chain configuration for settlement
 */
const chainConfigs: Record<number, { chain: Chain; rpcUrl: string }> = {
  // Mainnets
  43114: { chain: avalanche, rpcUrl: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc' },
  8453: { chain: base, rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org' },
  1: { chain: mainnet, rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com' },
  4689: { chain: iotex, rpcUrl: process.env.IOTEX_RPC_URL || 'https://babel-api.mainnet.iotex.io' },
  3338: { chain: peaq, rpcUrl: process.env.PEAQ_RPC_URL || 'https://peaq.api.onfinality.io/public' },
  137: { chain: polygon, rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com' },
  1329: { chain: sei, rpcUrl: process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com' },
  196: { chain: xlayer, rpcUrl: process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech' },
  // Testnets
  43113: { chain: avalancheFuji, rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc' },
  84532: { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org' },
  80002: { chain: polygonAmoy, rpcUrl: process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology' },
  1328: { chain: seiTestnet, rpcUrl: process.env.SEI_TESTNET_RPC_URL || 'https://evm-rpc-testnet.sei-apis.com' },
  11155111: { chain: sepolia, rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org' },
  195: { chain: xlayerTestnet, rpcUrl: process.env.XLAYER_TESTNET_RPC_URL || 'https://testrpc.xlayer.tech' },
};

export interface ERC3009Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: Hex;
}

export interface SettlementParams {
  chainId: number;
  tokenAddress: Address;
  authorization: ERC3009Authorization;
  signature: Hex;
  facilitatorPrivateKey: Hex;
}

export interface SettlementResult {
  success: boolean;
  transactionHash?: Hex;
  errorMessage?: string;
  gasUsed?: bigint;
}

/**
 * Execute an ERC-3009 receiveWithAuthorization transaction
 */
export async function executeERC3009Settlement(
  params: SettlementParams
): Promise<SettlementResult> {
  const { chainId, tokenAddress, authorization, signature, facilitatorPrivateKey } = params;

  console.log('[ERC3009Settlement] Starting settlement:', {
    chainId,
    tokenAddress,
    from: authorization.from,
    to: authorization.to,
    value: authorization.value,
    nonce: authorization.nonce,
    validAfter: authorization.validAfter,
    validBefore: authorization.validBefore,
  });

  // Deduplication: prevent double-submission of same nonce
  if (!tryAcquireNonce(chainId, authorization.from, authorization.nonce)) {
    console.warn('[ERC3009Settlement] DUPLICATE BLOCKED: Nonce already being processed:', authorization.nonce);
    return {
      success: false,
      errorMessage: 'Duplicate submission: this authorization is already being processed',
    };
  }

  // Get chain config
  const config = chainConfigs[chainId];
  if (!config) {
    releaseNonce(chainId, authorization.from, authorization.nonce);
    return {
      success: false,
      errorMessage: `Unsupported chain ID: ${chainId}`,
    };
  }

  try {
    // Create account from private key
    const account = privateKeyToAccount(facilitatorPrivateKey);
    console.log('[ERC3009Settlement] Facilitator wallet:', account.address);

    // Create clients
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    // Parse signature into v, r, s
    console.log('[ERC3009Settlement] Raw signature:', signature);
    console.log('[ERC3009Settlement] Signature length:', signature.length);
    const { v, r, s } = parseSignature(signature);
    console.log('[ERC3009Settlement] Parsed signature: v=%d, r=%s, s=%s', Number(v), r, s);

    // Encode function data - using transferWithAuthorization (can be called by anyone)
    const data = encodeFunctionData({
      abi: TRANSFER_WITH_AUTHORIZATION_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        authorization.from,
        authorization.to,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce,
        Number(v),
        r,
        s,
      ],
    });

    // Get current gas price
    const gasPrice = await publicClient.getGasPrice();
    console.log('[ERC3009Settlement] Gas price:', gasPrice.toString());

    // Check facilitator ETH balance
    const ethBalance = await publicClient.getBalance({ address: account.address });
    console.log('[ERC3009Settlement] Facilitator ETH balance:', ethBalance.toString());
    
    if (ethBalance < 100000n * gasPrice) {
      console.error('[ERC3009Settlement] Insufficient ETH for gas!');
      releaseNonce(chainId, authorization.from, authorization.nonce);
      return {
        success: false,
        errorMessage: 'Facilitator has insufficient ETH for gas',
      };
    }

    // Get nonce with 'pending' blockTag to include mempool transactions
    // This prevents "replacement transaction underpriced" errors when multiple
    // settlements are sent in quick succession
    const nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    });
    console.log('[ERC3009Settlement] Using nonce (pending):', nonce);

    // Send transaction with explicit nonce and retry logic for underpriced errors
    console.log('[ERC3009Settlement] Sending transaction...');
    let hash: Hex;
    let attempts = 0;
    const maxAttempts = 3;
    let currentGasPrice = gasPrice;

    while (attempts < maxAttempts) {
      try {
        hash = await walletClient.sendTransaction({
          to: tokenAddress,
          data,
          gas: 100000n, // ERC-3009 transfers use ~65k gas, 100k is safe
          gasPrice: currentGasPrice,
          nonce,
        });
        console.log('[ERC3009Settlement] Transaction sent! Hash:', hash);
        break;
      } catch (sendError: unknown) {
        const errMsg = sendError instanceof Error ? sendError.message : String(sendError);
        attempts++;

        // Check if it's an underpriced error (nonce collision with pending tx)
        if (errMsg.toLowerCase().includes('underpriced') || errMsg.toLowerCase().includes('nonce')) {
          if (attempts < maxAttempts) {
            // Bump gas price by 20% and retry
            currentGasPrice = (currentGasPrice * 120n) / 100n;
            console.warn(`[ERC3009Settlement] Retry ${attempts}/${maxAttempts}: Bumping gas price to ${currentGasPrice}`);
            continue;
          }
        }

        // Not an underpriced error or max attempts reached
        throw sendError;
      }
    }

    // TypeScript: hash is definitely assigned if we get here
    hash = hash!;

    // Wait for confirmation
    console.log('[ERC3009Settlement] Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });
    console.log('[ERC3009Settlement] Receipt received:', {
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber.toString(),
    });

    if (receipt.status === 'success') {
      console.log('[ERC3009Settlement] SUCCESS!');
      return {
        success: true,
        transactionHash: hash,
        gasUsed: receipt.gasUsed,
      };
    } else {
      // Transaction was mined but reverted - try to get revert reason
      console.error('[ERC3009Settlement] Transaction REVERTED! Hash:', hash);

      let revertReason = 'Unknown';
      try {
        // Simulate the call to get the revert reason
        await publicClient.call({
          to: tokenAddress,
          data,
          account: account.address,
        });
      } catch (simError: unknown) {
        const errMessage = simError instanceof Error ? simError.message : String(simError);
        // Extract revert reason from error message
        const match = errMessage.match(/reverted with.*?["']([^"']+)["']/i)
          || errMessage.match(/reason:\s*([^\n,]+)/i)
          || errMessage.match(/FiatToken[^:]*:\s*([^\n]+)/i);
        revertReason = match?.[1] || errMessage.slice(0, 200);
        console.error('[ERC3009Settlement] Revert reason:', revertReason);
      }

      console.error('[ERC3009Settlement] Possible causes:');
      console.error('  1. Nonce already used (authorization was already executed)');
      console.error('  2. Insufficient USDC balance in payer wallet:', authorization.from);
      console.error('  3. validAfter/validBefore time constraints not met');
      console.error('  4. Invalid signature');
      return {
        success: false,
        transactionHash: hash,
        errorMessage: `Transaction reverted: ${revertReason}. TX: ${hash}`,
      };
    }
  } catch (error) {
    console.error('[ERC3009Settlement] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error during settlement';
    // Release nonce on error so user can retry with same auth if it wasn't submitted
    releaseNonce(chainId, authorization.from, authorization.nonce);
    return {
      success: false,
      errorMessage: errMsg,
    };
  }
}

/**
 * Get the facilitator wallet address from private key
 */
export function getWalletAddress(privateKey: Hex): Address {
  const account = privateKeyToAccount(privateKey);
  return account.address;
}

/**
 * Get the ETH balance for a wallet on a chain
 */
export async function getWalletBalance(
  chainId: number,
  address: Address
): Promise<{ balance: bigint; formatted: string }> {
  const config = chainConfigs[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });

  const balance = await publicClient.getBalance({ address });
  const formatted = (Number(balance) / 1e18).toFixed(6);

  return { balance, formatted };
}

