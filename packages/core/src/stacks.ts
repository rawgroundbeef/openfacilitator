/**
 * Stacks settlement implementation
 *
 * For Stacks, the x402 payment flow uses pre-signed transactions:
 * 1. Payer creates and signs a transaction (STX transfer or SIP-010 contract call)
 * 2. Facilitator receives the signed transaction hex and broadcasts via Hiro API
 * 3. Facilitator polls for confirmation and verifies recipient/amount
 *
 * This mirrors the Solana settlement pattern (pre-signed broadcast),
 * not the EVM pattern (ERC-3009 authorization).
 */
import {
  deserializeTransaction,
  PayloadType,
  cvToString,
  ClarityType,
} from '@stacks/transactions';
import type {
  TokenTransferPayloadWire,
  ContractCallPayload,
  AddressWire,
} from '@stacks/transactions';

// ===== Types =====

export interface StacksSettlementParams {
  network: 'stacks' | 'stacks-testnet';
  /** Hex-encoded signed transaction from the payer */
  signedTransaction: string;
  /** Not used for broadcast (payer pre-signs), but kept for interface consistency */
  facilitatorPrivateKey: string;
}

export interface StacksSettlementResult {
  success: boolean;
  transactionHash?: string;
  payer?: string;
  errorMessage?: string;
}

// ===== Hiro API =====

/**
 * Get Hiro API base URL for a Stacks network
 */
function getHiroApiUrl(network: string): string {
  if (network === 'stacks-testnet') {
    return process.env.STACKS_TESTNET_RPC_URL || 'https://api.testnet.hiro.so';
  }
  return process.env.STACKS_RPC_URL || 'https://api.hiro.so';
}

/**
 * Build headers for Hiro API requests
 */
function getHiroHeaders(contentType = 'application/json'): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
  };
  const apiKey = process.env.STACKS_API_KEY;
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}

/**
 * Fetch with retry and rate-limit handling for Hiro API
 */
async function hiroFetch(
  url: string,
  options?: RequestInit & { maxRetries?: number }
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status !== 429) {
      return response;
    }

    if (attempt === maxRetries) {
      return response;
    }

    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : baseDelay * Math.pow(2, attempt) + Math.random() * 1000;

    console.log(`[StacksSettlement] Rate limited, retrying in ${Math.round(delay)}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Unreachable, but TypeScript needs it
  throw new Error('Exhausted retries');
}

// ===== Transaction Parsing =====

interface ParsedStacksTransfer {
  sender: string;
  recipient: string;
  amount: string;
  asset: string; // 'STX' or contract principal
  memo?: string;
}

/**
 * Convert AddressWire to string format
 */
function addressWireToString(address: AddressWire): string {
  // AddressWire has version and hash160
  // Format as version prefix (1 char) + hash160 (base58)
  // For simplicity, we'll use the hash160 directly
  return address.hash160;
}

/**
 * Parse a signed Stacks transaction to extract transfer details
 */
function parseStacksTransaction(txHex: string): ParsedStacksTransfer {
  const cleanHex = txHex.startsWith('0x') ? txHex.slice(2) : txHex;
  const tx = deserializeTransaction(cleanHex);

  const sender = tx.auth.spendingCondition.signer;

  if (tx.payload.payloadType === PayloadType.TokenTransfer) {
    const payload = tx.payload as TokenTransferPayloadWire;
    return {
      sender,
      recipient: cvToString(payload.recipient),
      amount: payload.amount.toString(),
      asset: 'STX',
      memo: payload.memo.content ? payload.memo.content.replace(/\0/g, '').trim() : undefined,
    };
  }

  if (tx.payload.payloadType === PayloadType.ContractCall) {
    const payload = tx.payload as ContractCallPayload;
    const contractAddress = addressWireToString(payload.contractAddress);
    const contractId = `${contractAddress}.${payload.contractName.content}`;

    // SIP-010 transfer function args: (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34)))
    if (payload.functionName.content === 'transfer') {
      const args = payload.functionArgs;
      let amount = '0';
      let recipient = '';

      for (const arg of args) {
        if (arg.type === ClarityType.UInt) {
          amount = arg.value.toString();
        }
        if (arg.type === ClarityType.PrincipalStandard || arg.type === ClarityType.PrincipalContract) {
          // The recipient is typically the third arg in SIP-010 transfer
          // (amount, sender, recipient, memo?) - we take the last principal
          recipient = cvToString(arg);
        }
      }

      return {
        sender,
        recipient,
        amount,
        asset: contractId,
      };
    }

    // Unknown contract call
    return {
      sender,
      recipient: '',
      amount: '0',
      asset: contractId,
    };
  }

  throw new Error(`Unsupported Stacks transaction payload type: ${tx.payload.payloadType}`);
}

// ===== Hiro API Transaction Types =====

interface HiroTransaction {
  tx_id: string;
  tx_status: string;
  tx_type: string;
  sender_address: string;
  block_height: number;
  token_transfer?: {
    recipient_address: string;
    amount: string;
    memo: string;
  };
  contract_call?: {
    contract_id: string;
    function_name: string;
    function_args: Array<{
      hex: string;
      repr: string;
      name: string;
      type: string;
    }>;
  };
}

// ===== Settlement =====

/**
 * Broadcast a pre-signed Stacks transaction and wait for confirmation
 */
export async function executeStacksSettlement(
  params: StacksSettlementParams
): Promise<StacksSettlementResult> {
  const { network, signedTransaction } = params;

  console.log('[StacksSettlement] Starting settlement:', {
    network,
    txLength: signedTransaction?.length,
  });

  const apiUrl = getHiroApiUrl(network);

  try {
    // Parse the transaction to extract sender
    let sender = '';
    try {
      const parsed = parseStacksTransaction(signedTransaction);
      sender = parsed.sender;
      console.log('[StacksSettlement] Parsed tx:', {
        sender: parsed.sender,
        recipient: parsed.recipient,
        amount: parsed.amount,
        asset: parsed.asset,
      });
    } catch (parseError) {
      console.warn('[StacksSettlement] Could not parse transaction:', parseError);
    }

    // Broadcast the signed transaction via Hiro API
    // The API expects raw transaction bytes as octet-stream
    const cleanHex = signedTransaction.startsWith('0x')
      ? signedTransaction.slice(2)
      : signedTransaction;
    const txBytes = Buffer.from(cleanHex, 'hex');

    console.log('[StacksSettlement] Broadcasting transaction...');
    const broadcastResponse = await hiroFetch(`${apiUrl}/v2/transactions`, {
      method: 'POST',
      headers: getHiroHeaders('application/octet-stream'),
      body: txBytes,
    });

    if (!broadcastResponse.ok) {
      const errorText = await broadcastResponse.text();
      console.error('[StacksSettlement] Broadcast failed:', broadcastResponse.status, errorText);

      // Parse Hiro error format
      let errorReason = `Broadcast failed (${broadcastResponse.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
          errorReason = errorJson.error;
        }
        if (errorJson.reason) {
          errorReason = errorJson.reason;
        }
      } catch {
        if (errorText) {
          errorReason = errorText;
        }
      }

      return {
        success: false,
        payer: sender,
        errorMessage: errorReason,
      };
    }

    // Broadcast returns the txid as a JSON string (quoted)
    const txidRaw = await broadcastResponse.text();
    const txid = txidRaw.replace(/^"|"$/g, '');
    console.log('[StacksSettlement] Transaction broadcast! txid:', txid);

    // Poll for confirmation
    const confirmed = await pollForConfirmation(apiUrl, txid);

    if (confirmed.success) {
      console.log('[StacksSettlement] SUCCESS! Transaction confirmed:', txid);
      return {
        success: true,
        transactionHash: txid,
        payer: confirmed.sender || sender,
      };
    } else {
      console.error('[StacksSettlement] Transaction failed:', confirmed.errorMessage);
      return {
        success: false,
        transactionHash: txid,
        payer: confirmed.sender || sender,
        errorMessage: confirmed.errorMessage,
      };
    }
  } catch (error) {
    console.error('[StacksSettlement] ERROR:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error during Stacks settlement',
    };
  }
}

/**
 * Poll Hiro API for transaction confirmation
 */
async function pollForConfirmation(
  apiUrl: string,
  txid: string,
  maxAttempts = 30,
  intervalMs = 10000
): Promise<{ success: boolean; sender?: string; errorMessage?: string }> {
  const cleanTxid = txid.startsWith('0x') ? txid : `0x${txid}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await hiroFetch(
        `${apiUrl}/extended/v1/tx/${cleanTxid}`,
        { headers: getHiroHeaders() }
      );

      if (!response.ok) {
        // 404 means not yet indexed — keep polling
        if (response.status === 404) {
          console.log(`[StacksSettlement] Tx not yet indexed (attempt ${attempt + 1}/${maxAttempts})`);
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
          continue;
        }
        console.warn(`[StacksSettlement] Unexpected status: ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }

      const txData = (await response.json()) as HiroTransaction;

      // Check for failure statuses
      if (
        txData.tx_status === 'abort_by_response' ||
        txData.tx_status === 'abort_by_post_condition'
      ) {
        return {
          success: false,
          sender: txData.sender_address,
          errorMessage: `Transaction aborted: ${txData.tx_status}`,
        };
      }

      // Check for success
      if (txData.tx_status === 'success' && txData.block_height > 0) {
        return {
          success: true,
          sender: txData.sender_address,
        };
      }

      // Still pending
      console.log(`[StacksSettlement] Tx status: ${txData.tx_status} (attempt ${attempt + 1}/${maxAttempts})`);
    } catch (error) {
      console.warn(`[StacksSettlement] Poll error (attempt ${attempt + 1}):`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    success: false,
    errorMessage: `Transaction confirmation timed out after ${maxAttempts} attempts`,
  };
}

// ===== Verification =====

/**
 * Verify a Stacks transaction after confirmation
 * Checks recipient and amount match payment requirements
 */
export async function verifyStacksTransaction(
  network: 'stacks' | 'stacks-testnet',
  txid: string,
  expectedRecipient: string,
  expectedAmount: string,
  expectedAsset: string
): Promise<{ isValid: boolean; invalidReason?: string; payer?: string }> {
  const apiUrl = getHiroApiUrl(network);
  const cleanTxid = txid.startsWith('0x') ? txid : `0x${txid}`;

  const response = await hiroFetch(
    `${apiUrl}/extended/v1/tx/${cleanTxid}`,
    { headers: getHiroHeaders() }
  );

  if (!response.ok) {
    return {
      isValid: false,
      invalidReason: `Failed to fetch transaction: ${response.status}`,
    };
  }

  const txData = (await response.json()) as HiroTransaction;

  // Check status
  if (txData.tx_status !== 'success') {
    return {
      isValid: false,
      invalidReason: `Transaction status: ${txData.tx_status}`,
      payer: txData.sender_address,
    };
  }

  // Verify STX native transfer
  if (expectedAsset === 'STX' && txData.tx_type === 'token_transfer' && txData.token_transfer) {
    const transfer = txData.token_transfer;

    if (transfer.recipient_address !== expectedRecipient) {
      return {
        isValid: false,
        invalidReason: `Recipient mismatch: expected ${expectedRecipient}, got ${transfer.recipient_address}`,
        payer: txData.sender_address,
      };
    }

    if (BigInt(transfer.amount) < BigInt(expectedAmount)) {
      return {
        isValid: false,
        invalidReason: `Amount too low: expected ${expectedAmount}, got ${transfer.amount}`,
        payer: txData.sender_address,
      };
    }

    return {
      isValid: true,
      payer: txData.sender_address,
    };
  }

  // Verify SIP-010 token transfer (contract call)
  if (txData.tx_type === 'contract_call' && txData.contract_call) {
    const call = txData.contract_call;

    if (call.function_name !== 'transfer') {
      return {
        isValid: false,
        invalidReason: `Unexpected function: ${call.function_name}`,
        payer: txData.sender_address,
      };
    }

    // Extract amount and recipient from function args
    let amount = '0';
    let recipient = '';

    for (const arg of call.function_args) {
      if (arg.name === 'amount' && arg.type === 'uint') {
        // repr format: "u1000000"
        amount = arg.repr.replace(/^u/, '');
      }
      if ((arg.name === 'to' || arg.name === 'recipient') && arg.type === 'principal') {
        // repr format: "'SP2..."
        recipient = arg.repr.replace(/^'/, '');
      }
    }

    if (recipient !== expectedRecipient) {
      return {
        isValid: false,
        invalidReason: `Recipient mismatch: expected ${expectedRecipient}, got ${recipient}`,
        payer: txData.sender_address,
      };
    }

    if (BigInt(amount) < BigInt(expectedAmount)) {
      return {
        isValid: false,
        invalidReason: `Amount too low: expected ${expectedAmount}, got ${amount}`,
        payer: txData.sender_address,
      };
    }

    return {
      isValid: true,
      payer: txData.sender_address,
    };
  }

  return {
    isValid: false,
    invalidReason: `Unexpected transaction type: ${txData.tx_type}`,
    payer: txData.sender_address,
  };
}

// ===== Utility Functions =====

/**
 * Get STX balance for a Stacks address
 */
export async function getStacksBalance(
  network: 'stacks' | 'stacks-testnet',
  address: string
): Promise<{ balance: bigint; formatted: string }> {
  const apiUrl = getHiroApiUrl(network);

  const response = await hiroFetch(
    `${apiUrl}/v2/accounts/${address}?proof=0`,
    { headers: getHiroHeaders() }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Stacks balance: ${response.status}`);
  }

  const data = (await response.json()) as { balance: string; locked: string };
  // Balance is returned as hex string (e.g., "0x0000000000000000")
  const balance = BigInt(data.balance);

  // STX has 6 decimals
  const formatted = (Number(balance) / 1e6).toFixed(6);

  return { balance, formatted };
}

/**
 * Validate a Stacks address format
 * Standard addresses start with SP (mainnet) or ST (testnet)
 * Contract addresses start with SM or SN (mainnet/testnet multi-sig)
 */
export function isValidStacksAddress(address: string): boolean {
  return /^S[PTMN][A-Z0-9]{38,128}$/.test(address);
}

/**
 * Validate a Stacks private key (hex format)
 * Stacks private keys are 64 or 66 hex characters (with optional compression suffix)
 */
export function isValidStacksPrivateKey(privateKey: string): boolean {
  const clean = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  return /^[a-fA-F0-9]{64,66}$/.test(clean);
}
