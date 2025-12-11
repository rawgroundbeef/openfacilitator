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
  encodeFunctionData,
  parseSignature,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';

/**
 * ERC-3009 receiveWithAuthorization ABI
 */
const RECEIVE_WITH_AUTHORIZATION_ABI = [
  {
    name: 'receiveWithAuthorization',
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
 * Chain configuration for settlement
 */
const chainConfigs = {
  8453: { chain: base, rpcUrl: 'https://mainnet.base.org' },
  84532: { chain: baseSepolia, rpcUrl: 'https://sepolia.base.org' },
  1: { chain: mainnet, rpcUrl: 'https://eth.llamarpc.com' },
  11155111: { chain: sepolia, rpcUrl: 'https://rpc.sepolia.org' },
} as const;

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

  // Get chain config
  const config = chainConfigs[chainId as keyof typeof chainConfigs];
  if (!config) {
    return {
      success: false,
      errorMessage: `Unsupported chain ID: ${chainId}`,
    };
  }

  try {
    // Create account from private key
    const account = privateKeyToAccount(facilitatorPrivateKey);

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

    // Encode function data
    const data = encodeFunctionData({
      abi: RECEIVE_WITH_AUTHORIZATION_ABI,
      functionName: 'receiveWithAuthorization',
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

    // Estimate gas
    const gasEstimate = await publicClient.estimateGas({
      account: account.address,
      to: tokenAddress,
      data,
    });

    // Get gas price
    const gasPrice = await publicClient.getGasPrice();

    // Send transaction
    const hash = await walletClient.sendTransaction({
      to: tokenAddress,
      data,
      gas: gasEstimate + (gasEstimate / 10n), // Add 10% buffer
      gasPrice,
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });

    if (receipt.status === 'success') {
      return {
        success: true,
        transactionHash: hash,
        gasUsed: receipt.gasUsed,
      };
    } else {
      return {
        success: false,
        transactionHash: hash,
        errorMessage: 'Transaction reverted',
      };
    }
  } catch (error) {
    console.error('ERC-3009 settlement error:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error during settlement',
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
  const config = chainConfigs[chainId as keyof typeof chainConfigs];
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

