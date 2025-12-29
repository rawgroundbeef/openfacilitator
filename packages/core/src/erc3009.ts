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

  // Get chain config
  const config = chainConfigs[chainId];
  if (!config) {
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
    const { v, r, s } = parseSignature(signature);
    console.log('[ERC3009Settlement] Parsed signature: v=%d, r=%s..., s=%s...', Number(v), r.slice(0, 10), s.slice(0, 10));

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
      return {
        success: false,
        errorMessage: 'Facilitator has insufficient ETH for gas',
      };
    }

    // Send transaction directly without gas estimation
    // Gas estimation can fail due to clock skew between server and blockchain
    // The actual transaction will succeed because block timestamp moves forward
    console.log('[ERC3009Settlement] Sending transaction...');
    const hash = await walletClient.sendTransaction({
      to: tokenAddress,
      data,
      gas: 100000n, // ERC-3009 transfers use ~65k gas, 100k is safe
      gasPrice,
    });
    console.log('[ERC3009Settlement] Transaction sent! Hash:', hash);

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
      // Transaction was mined but reverted
      console.error('[ERC3009Settlement] Transaction REVERTED! Hash:', hash);
      console.error('[ERC3009Settlement] Possible causes:');
      console.error('  1. Nonce already used (authorization was already executed)');
      console.error('  2. Insufficient USDC balance in payer wallet:', authorization.from);
      console.error('  3. validAfter/validBefore time constraints not met');
      console.error('  4. Invalid signature');
      return {
        success: false,
        transactionHash: hash,
        errorMessage: `Transaction reverted. Check if nonce was already used or payer has insufficient USDC. TX: ${hash}`,
      };
    }
  } catch (error) {
    console.error('[ERC3009Settlement] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error during settlement';
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

