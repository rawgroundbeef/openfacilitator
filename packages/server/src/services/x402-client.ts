/**
 * x402 Client - Makes x402 payments using a Solana wallet
 *
 * This is the client side of x402 - we sign and send payments
 * to access resources behind x402 paywalls.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';
import bs58 from 'bs58';

// USDC mint addresses
const USDC_MINTS: Record<string, string> = {
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana-mainnet': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana-devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo?: string;
  description?: string;
  extra?: Record<string, unknown>;
}

interface X402Response {
  success: boolean;
  data?: unknown;
  error?: string;
  insufficientBalance?: boolean;
  required?: string;
  available?: string;
}

/**
 * Get Solana RPC URL
 */
function getSolanaRpcUrl(network: string): string {
  if (network === 'solana' || network === 'solana-mainnet') {
    return process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  }
  if (network === 'solana-devnet') {
    return process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
  }
  return 'https://api.mainnet-beta.solana.com';
}

/**
 * Parse 402 response to get payment requirements
 */
function parse402Response(body: unknown): PaymentRequirements | null {
  if (!body || typeof body !== 'object') return null;

  const data = body as Record<string, unknown>;

  // Handle different 402 response formats
  // Format 1: Direct requirements object
  if (data.network && data.maxAmountRequired) {
    return data as unknown as PaymentRequirements;
  }

  // Format 2: Nested in paymentRequirements
  if (data.paymentRequirements) {
    return data.paymentRequirements as PaymentRequirements;
  }

  // Format 3: x402 accepts array format
  if (data.accepts && Array.isArray(data.accepts) && data.accepts.length > 0) {
    const first = data.accepts[0] as PaymentRequirements;
    return first;
  }

  return null;
}

/**
 * Create a signed Solana USDC transfer transaction
 */
async function createSignedTransferTransaction(
  privateKey: string,
  recipient: string,
  amount: bigint,
  network: string
): Promise<string> {
  const rpcUrl = getSolanaRpcUrl(network);
  const connection = new Connection(rpcUrl, 'confirmed');

  // Decode the private key and create keypair
  const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
  const senderPubkey = keypair.publicKey;
  const recipientPubkey = new PublicKey(recipient);

  // Get USDC mint
  const usdcMint = USDC_MINTS[network];
  if (!usdcMint) {
    throw new Error(`Unsupported network: ${network}`);
  }
  const mintPubkey = new PublicKey(usdcMint);

  // Get associated token accounts
  const senderATA = await getAssociatedTokenAddress(mintPubkey, senderPubkey);
  const recipientATA = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

  // Create transfer instruction
  const transferIx = createTransferInstruction(
    senderATA,
    recipientATA,
    senderPubkey,
    amount,
    [],
    TOKEN_PROGRAM_ID
  );

  // Create transaction with compute budget for better landing
  const transaction = new Transaction();

  // Add priority fee for faster confirmation
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 50000, // 0.00005 SOL per compute unit
    })
  );

  transaction.add(transferIx);

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = senderPubkey;

  // Sign the transaction
  transaction.sign(keypair);

  // Serialize to base64
  const serialized = transaction.serialize();
  return Buffer.from(serialized).toString('base64');
}

/**
 * Get USDC balance for a wallet
 */
async function getUSDCBalance(address: string, network: string): Promise<bigint> {
  const rpcUrl = getSolanaRpcUrl(network);
  const usdcMint = USDC_MINTS[network];

  if (!usdcMint) {
    throw new Error(`Unsupported network: ${network}`);
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const publicKey = new PublicKey(address);
  const mintPublicKey = new PublicKey(usdcMint);

  try {
    const tokenAccountAddress = await getAssociatedTokenAddress(mintPublicKey, publicKey);
    const tokenAccount = await getAccount(connection, tokenAccountAddress);
    return BigInt(tokenAccount.amount.toString());
  } catch {
    // Token account doesn't exist = 0 balance
    return BigInt(0);
  }
}

/**
 * Make an x402 payment to access a resource
 *
 * @param url - The x402 protected endpoint
 * @param body - The request body to send
 * @param privateKey - The Solana wallet private key (base58)
 * @param walletAddress - The wallet address for balance checks
 */
export async function makeX402Payment(
  url: string,
  body: Record<string, unknown>,
  privateKey: string,
  walletAddress: string
): Promise<X402Response> {
  console.log('[x402Client] Making payment to:', url);

  try {
    // Step 1: Make initial request to get 402 response
    const initialResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // If not 402, return the response
    if (initialResponse.status !== 402) {
      if (initialResponse.ok) {
        const data = await initialResponse.json();
        return { success: true, data };
      } else {
        const error = await initialResponse.text();
        console.error('[x402Client] Non-402 error:', initialResponse.status, error);
        return { success: false, error: `HTTP ${initialResponse.status}: ${error}` };
      }
    }

    // Step 2: Parse 402 response
    const paymentInfo = await initialResponse.json();
    console.log('[x402Client] Got 402 response:', JSON.stringify(paymentInfo, null, 2));

    const requirements = parse402Response(paymentInfo);
    if (!requirements) {
      console.error('[x402Client] Could not parse payment requirements');
      return { success: false, error: 'Could not parse payment requirements from 402 response' };
    }

    console.log('[x402Client] Payment requirements:', requirements);

    // Step 3: Check balance
    const network = requirements.network || 'solana';
    const requiredAmount = BigInt(requirements.maxAmountRequired);
    const balance = await getUSDCBalance(walletAddress, network);

    console.log('[x402Client] Balance check:', {
      required: requiredAmount.toString(),
      available: balance.toString(),
    });

    if (balance < requiredAmount) {
      return {
        success: false,
        error: 'Insufficient USDC balance',
        insufficientBalance: true,
        required: (Number(requiredAmount) / 1e6).toFixed(2),
        available: (Number(balance) / 1e6).toFixed(2),
      };
    }

    // Step 4: Get recipient address
    const recipient = requirements.payTo || (requirements.extra?.payTo as string);
    if (!recipient) {
      console.error('[x402Client] No recipient address in payment requirements');
      return { success: false, error: 'No recipient address in payment requirements' };
    }

    // Step 5: Create and sign the transfer transaction
    console.log('[x402Client] Creating signed transaction...');
    const signedTransaction = await createSignedTransferTransaction(
      privateKey,
      recipient,
      requiredAmount,
      network
    );

    // Step 6: Create x402 payment payload
    // For Solana, the payload contains the signed transaction
    const paymentPayload = {
      x402Version: 1,
      payload: {
        transaction: signedTransaction,
      },
    };

    // Encode as base64
    const encodedPayload = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

    // Step 7: Retry request with payment
    console.log('[x402Client] Sending payment...');
    const paymentResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': encodedPayload,
      },
      body: JSON.stringify(body),
    });

    if (!paymentResponse.ok) {
      const error = await paymentResponse.text();
      console.error('[x402Client] Payment failed:', paymentResponse.status, error);
      return { success: false, error: `Payment failed: ${error}` };
    }

    const data = await paymentResponse.json();
    console.log('[x402Client] Payment successful:', data);
    return { success: true, data };
  } catch (error) {
    console.error('[x402Client] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
