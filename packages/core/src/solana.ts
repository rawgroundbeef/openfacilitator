/**
 * Solana SPL Token settlement implementation
 * 
 * For Solana, the x402 payment flow uses pre-signed transactions:
 * 1. Payer creates and signs a transaction transferring USDC
 * 2. Facilitator receives the signed transaction and submits it
 * 
 * This is different from EVM's ERC-3009 where the facilitator calls
 * receiveWithAuthorization with the payer's signature.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
  SendTransactionError,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
import bs58 from 'bs58';

/**
 * Solana RPC endpoints
 */
const SOLANA_RPC_URLS: Record<string, string> = {
  'solana': 'https://api.mainnet-beta.solana.com',
  'solana-devnet': 'https://api.devnet.solana.com',
};

/**
 * Known USDC mint addresses
 */
export const USDC_MINTS: Record<string, string> = {
  'solana': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana-devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

export interface SolanaSettlementParams {
  network: 'solana' | 'solana-devnet';
  /** Base64 or base58 encoded signed transaction from the payer */
  signedTransaction: string;
  /** Facilitator's private key (base58 encoded) - used as fee payer if needed */
  facilitatorPrivateKey: string;
}

export interface SolanaSettlementResult {
  success: boolean;
  transactionHash?: string;
  errorMessage?: string;
}

/**
 * Submit a pre-signed Solana transaction
 * 
 * The transaction should already be signed by the payer.
 * The facilitator may need to co-sign as fee payer.
 */
export async function executeSolanaSettlement(
  params: SolanaSettlementParams
): Promise<SolanaSettlementResult> {
  const { network, signedTransaction, facilitatorPrivateKey } = params;

  const rpcUrl = SOLANA_RPC_URLS[network];
  if (!rpcUrl) {
    return {
      success: false,
      errorMessage: `Unsupported Solana network: ${network}`,
    };
  }

  try {
    const connection = new Connection(rpcUrl, 'confirmed');

    // Decode the facilitator's keypair
    const facilitatorKeypair = Keypair.fromSecretKey(
      bs58.decode(facilitatorPrivateKey)
    );

    // Try to decode the transaction
    let transaction: Transaction | VersionedTransaction;
    
    try {
      // First try base64 (common for serialized transactions)
      const txBuffer = Buffer.from(signedTransaction, 'base64');
      
      // Try to deserialize as VersionedTransaction first
      try {
        transaction = VersionedTransaction.deserialize(txBuffer);
      } catch {
        // Fall back to legacy Transaction
        transaction = Transaction.from(txBuffer);
      }
    } catch {
      // Try base58 encoding
      try {
        const txBuffer = bs58.decode(signedTransaction);
        try {
          transaction = VersionedTransaction.deserialize(txBuffer);
        } catch {
          transaction = Transaction.from(txBuffer);
        }
      } catch (e) {
        return {
          success: false,
          errorMessage: `Failed to decode transaction: ${e instanceof Error ? e.message : 'Unknown error'}`,
        };
      }
    }

    // Send the transaction
    let signature: string;
    
    if (transaction instanceof VersionedTransaction) {
      // For versioned transactions, the facilitator may need to co-sign as fee payer
      // Check if the facilitator is the fee payer (first static account key)
      const message = transaction.message;
      const staticAccountKeys = message.staticAccountKeys;
      
      // The fee payer is always the first account in the transaction
      if (staticAccountKeys.length > 0) {
        const feePayerPubkey = staticAccountKeys[0];
        
        // If facilitator is the fee payer, we need to sign
        if (feePayerPubkey.equals(facilitatorKeypair.publicKey)) {
          // Add facilitator's signature
          transaction.sign([facilitatorKeypair]);
        }
      }
      
      // Send the transaction with skipPreflight to get better error messages
      try {
        signature = await connection.sendTransaction(transaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      } catch (e) {
        // If simulation fails, try with skipPreflight to see if it's a preflight issue
        console.error('Versioned transaction preflight failed:', e);
        signature = await connection.sendTransaction(transaction, {
          skipPreflight: true,
        });
      }
    } else {
      // For legacy transactions, we might need to add the facilitator as fee payer
      // Check if the transaction needs a fee payer signature
      if (!transaction.feePayer) {
        transaction.feePayer = facilitatorKeypair.publicKey;
      }
      
      // Get recent blockhash if not present
      if (!transaction.recentBlockhash) {
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
      }
      
      // Sign with facilitator if they're the fee payer
      if (transaction.feePayer?.equals(facilitatorKeypair.publicKey)) {
        transaction.partialSign(facilitatorKeypair);
      }
      
      // Use sendRawTransaction for pre-signed transactions
      const rawTransaction = transaction.serialize();
      signature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    }

    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    return {
      success: true,
      transactionHash: signature,
    };
  } catch (error) {
    console.error('Solana settlement error:', error);
    
    let errorMessage = 'Unknown error during Solana settlement';
    if (error instanceof SendTransactionError) {
      errorMessage = `Transaction failed: ${error.message}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      errorMessage,
    };
  }
}

/**
 * Generate a Solana keypair
 */
export function generateSolanaKeypair(): { publicKey: string; privateKey: string } {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    privateKey: bs58.encode(keypair.secretKey),
  };
}

/**
 * Get public key from private key
 */
export function getSolanaPublicKey(privateKey: string): string {
  const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
  return keypair.publicKey.toBase58();
}

/**
 * Get SOL balance for a wallet
 */
export async function getSolanaBalance(
  network: 'solana' | 'solana-devnet',
  address: string
): Promise<{ balance: bigint; formatted: string }> {
  const rpcUrl = SOLANA_RPC_URLS[network];
  if (!rpcUrl) {
    throw new Error(`Unsupported Solana network: ${network}`);
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const publicKey = new PublicKey(address);
  const balance = await connection.getBalance(publicKey);
  
  // SOL has 9 decimals
  const formatted = (balance / 1e9).toFixed(6);
  
  return {
    balance: BigInt(balance),
    formatted,
  };
}

/**
 * Get USDC balance for a wallet
 */
export async function getSolanaUSDCBalance(
  network: 'solana' | 'solana-devnet',
  address: string
): Promise<{ balance: bigint; formatted: string }> {
  const rpcUrl = SOLANA_RPC_URLS[network];
  const usdcMint = USDC_MINTS[network];
  
  if (!rpcUrl || !usdcMint) {
    throw new Error(`Unsupported Solana network: ${network}`);
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const publicKey = new PublicKey(address);
  const mintPublicKey = new PublicKey(usdcMint);
  
  try {
    const tokenAccountAddress = await getAssociatedTokenAddress(
      mintPublicKey,
      publicKey
    );
    
    const tokenAccount = await getAccount(connection, tokenAccountAddress);
    const balance = tokenAccount.amount;
    
    // USDC has 6 decimals
    const formatted = (Number(balance) / 1e6).toFixed(2);
    
    return {
      balance: BigInt(balance.toString()),
      formatted,
    };
  } catch {
    // Token account doesn't exist = 0 balance
    return {
      balance: BigInt(0),
      formatted: '0.00',
    };
  }
}

/**
 * Validate a Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a Solana private key
 */
export function isValidSolanaPrivateKey(privateKey: string): boolean {
  try {
    const decoded = bs58.decode(privateKey);
    // Solana secret keys are 64 bytes (32 bytes private + 32 bytes public)
    return decoded.length === 64;
  } catch {
    return false;
  }
}

