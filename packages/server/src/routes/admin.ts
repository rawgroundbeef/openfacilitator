import { Router, type Request, type Response, type IRouter } from 'express';
import { z } from 'zod';
import {
  createFacilitator,
  getFacilitatorById,
  getFacilitatorsByOwner,
  updateFacilitator,
  deleteFacilitator,
} from '../db/facilitators.js';
import { getTransactionsByFacilitator, getTransactionStats } from '../db/transactions.js';
import { 
  defaultTokens, 
  getWalletAddress, 
  getWalletBalance,
  generateSolanaKeypair,
  getSolanaPublicKey,
  getSolanaBalance,
  isValidSolanaPrivateKey,
} from '@openfacilitator/core';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

// Helper to convert SQLite datetime (YYYY-MM-DD HH:MM:SS) to ISO format
function formatSqliteDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    // SQLite datetime format: YYYY-MM-DD HH:MM:SS (in UTC)
    // Convert to ISO format with Z suffix to indicate UTC
    return new Date(dateStr.replace(' ', 'T') + 'Z').toISOString();
  } catch {
    return dateStr;
  }
}
import { 
  addCustomDomain, 
  removeCustomDomain, 
  getDomainStatus, 
  isRailwayConfigured 
} from '../services/railway.js';
import { encryptPrivateKey, decryptPrivateKey, generateWallet } from '../utils/crypto.js';
import { generateWalletForUser, getWalletForUser, getUSDCBalance } from '../services/wallet.js';
import type { Hex } from 'viem';

const router: IRouter = Router();

// Apply optional auth to all routes first to get user context
router.use(optionalAuth);

// Validation schemas - chainId can be number (EVM) or string (Solana)
const chainIdSchema = z.union([z.number(), z.string()]);

const createFacilitatorSchema = z.object({
  name: z.string().min(1).max(100),
  subdomain: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Invalid subdomain format'),
  customDomain: z.string().max(255).optional(),
  ownerAddress: z.string().optional(),
  supportedChains: z.array(chainIdSchema).optional(),
  supportedTokens: z
    .array(
      z.object({
        address: z.string(),
        symbol: z.string(),
        decimals: z.number(),
        chainId: chainIdSchema,
      })
    )
    .optional(),
});

const updateFacilitatorSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  customDomain: z.string().max(255).optional().nullable(),
  additionalDomains: z.array(z.string().max(255)).optional(),
  supportedChains: z.array(chainIdSchema).optional(),
  supportedTokens: z
    .array(
      z.object({
        address: z.string(),
        symbol: z.string(),
        decimals: z.number(),
        chainId: chainIdSchema,
      })
    )
    .optional(),
});

/**
 * GET /api/admin/me - Get current user info
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  res.json({
    id: req.user!.id,
    email: req.user!.email,
    name: req.user!.name,
    emailVerified: req.user!.emailVerified,
    createdAt: req.user!.createdAt,
  });
});

/**
 * GET /api/admin/wallet - Get user's billing wallet info and USDC balance
 */
router.get('/wallet', requireAuth, async (req: Request, res: Response) => {
  try {
    const wallet = getWalletForUser(req.user!.id);
    if (!wallet) {
      res.status(404).json({ error: 'Wallet not found', hasWallet: false });
      return;
    }

    const { formatted } = await getUSDCBalance(wallet.address);

    res.json({
      hasWallet: true,
      address: wallet.address,
      network: wallet.network,
      balance: formatted,
      token: 'USDC',
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ error: 'Failed to get wallet info' });
  }
});

/**
 * POST /api/admin/wallet/create - Create billing wallet for user
 */
router.post('/wallet/create', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await generateWalletForUser(req.user!.id);

    res.json({
      address: result.address,
      network: 'solana',
      created: result.created,
      message: result.created
        ? 'Wallet created successfully. Fund this address with USDC on Solana.'
        : 'Wallet already exists.',
    });
  } catch (error) {
    console.error('Create wallet error:', error);
    res.status(500).json({ error: 'Failed to create wallet' });
  }
});

/**
 * POST /api/admin/facilitators - Create a new facilitator
 */
router.post('/facilitators', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = createFacilitatorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
      return;
    }

    const { name, subdomain, customDomain, supportedChains, supportedTokens } = parsed.data;
    // Use the authenticated user's ID as owner, or wallet address if provided
    const ownerAddress = parsed.data.ownerAddress || req.user!.id;

    // Default to production chains: Base Mainnet + Solana Mainnet
    const chains = supportedChains || [8453, 'solana'];
    const tokens = supportedTokens || defaultTokens.filter((t) => chains.includes(t.chainId));

    const facilitator = createFacilitator({
      name,
      subdomain,
      custom_domain: customDomain,
      owner_address: ownerAddress,
      supported_chains: JSON.stringify(chains),
      supported_tokens: JSON.stringify(tokens),
    });

    if (!facilitator) {
      res.status(409).json({
        error: 'Subdomain already exists',
      });
      return;
    }

    // Register subdomain with Railway
    const subdomainFull = `${subdomain}.openfacilitator.io`;
    let railwayStatus: { success: boolean; error?: string } = { success: false };

    if (isRailwayConfigured()) {
      console.log(`Registering subdomain with Railway: ${subdomainFull}`);
      railwayStatus = await addCustomDomain(subdomainFull);
      if (railwayStatus.success) {
        console.log(`Successfully registered ${subdomainFull} with Railway`);
      } else {
        console.error(`Failed to register ${subdomainFull} with Railway:`, railwayStatus.error);
      }
    } else {
      console.log('Railway not configured, skipping subdomain registration');
    }

    res.status(201).json({
      id: facilitator.id,
      name: facilitator.name,
      subdomain: facilitator.subdomain,
      ownerAddress: facilitator.owner_address,
      supportedChains: JSON.parse(facilitator.supported_chains),
      supportedTokens: JSON.parse(facilitator.supported_tokens),
      url: `https://${facilitator.subdomain}.openfacilitator.io`,
      createdAt: formatSqliteDate(facilitator.created_at),
      railwayRegistered: railwayStatus.success,
      railwayError: railwayStatus.error,
    });
  } catch (error) {
    console.error('Create facilitator error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/facilitators - List facilitators for the authenticated user
 */
router.get('/facilitators', requireAuth, async (req: Request, res: Response) => {
  try {
    // Use authenticated user's ID, or allow owner query param for backwards compatibility
    const ownerAddress = (req.query.owner as string) || req.user!.id;

    const facilitators = getFacilitatorsByOwner(ownerAddress);

    res.json(
      facilitators.map((f) => ({
        id: f.id,
        name: f.name,
        subdomain: f.subdomain,
        customDomain: f.custom_domain,
        additionalDomains: JSON.parse(f.additional_domains || '[]'),
        ownerAddress: f.owner_address,
        supportedChains: JSON.parse(f.supported_chains),
        supportedTokens: JSON.parse(f.supported_tokens),
        url: f.custom_domain
          ? `https://${f.custom_domain}`
          : `https://${f.subdomain}.openfacilitator.io`,
        createdAt: formatSqliteDate(f.created_at),
        updatedAt: formatSqliteDate(f.updated_at),
      }))
    );
  } catch (error) {
    console.error('List facilitators error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/facilitators/:id - Get a specific facilitator
 */
router.get('/facilitators/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    res.json({
      id: facilitator.id,
      name: facilitator.name,
      subdomain: facilitator.subdomain,
      customDomain: facilitator.custom_domain,
      additionalDomains: JSON.parse(facilitator.additional_domains || '[]'),
      ownerAddress: facilitator.owner_address,
      supportedChains: JSON.parse(facilitator.supported_chains),
      supportedTokens: JSON.parse(facilitator.supported_tokens),
      url: facilitator.custom_domain
        ? `https://${facilitator.custom_domain}`
        : `https://${facilitator.subdomain}.openfacilitator.io`,
      createdAt: formatSqliteDate(facilitator.created_at),
      updatedAt: formatSqliteDate(facilitator.updated_at),
    });
  } catch (error) {
    console.error('Get facilitator error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/facilitators/:id - Update a facilitator
 */
router.patch('/facilitators/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = updateFacilitatorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
      return;
    }

    const updates: Record<string, string> = {};
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.customDomain !== undefined) {
      updates.custom_domain = parsed.data.customDomain || '';
    }
    if (parsed.data.additionalDomains !== undefined) {
      updates.additional_domains = JSON.stringify(parsed.data.additionalDomains);
    }
    if (parsed.data.supportedChains) {
      updates.supported_chains = JSON.stringify(parsed.data.supportedChains);
    }
    if (parsed.data.supportedTokens) {
      updates.supported_tokens = JSON.stringify(parsed.data.supportedTokens);
    }

    const facilitator = updateFacilitator(req.params.id, updates);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    res.json({
      id: facilitator.id,
      name: facilitator.name,
      subdomain: facilitator.subdomain,
      customDomain: facilitator.custom_domain,
      additionalDomains: JSON.parse(facilitator.additional_domains || '[]'),
      ownerAddress: facilitator.owner_address,
      supportedChains: JSON.parse(facilitator.supported_chains),
      supportedTokens: JSON.parse(facilitator.supported_tokens),
      url: facilitator.custom_domain
        ? `https://${facilitator.custom_domain}`
        : `https://${facilitator.subdomain}.openfacilitator.io`,
      createdAt: formatSqliteDate(facilitator.created_at),
      updatedAt: formatSqliteDate(facilitator.updated_at),
    });
  } catch (error) {
    console.error('Update facilitator error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/facilitators/:id - Delete a facilitator
 */
router.delete('/facilitators/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    // Get facilitator first to know the subdomain for Railway cleanup
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    const deleted = deleteFacilitator(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    // Remove subdomain from Railway
    if (isRailwayConfigured()) {
      const subdomainFull = `${facilitator.subdomain}.openfacilitator.io`;
      console.log(`Removing subdomain from Railway: ${subdomainFull}`);
      const result = await removeCustomDomain(subdomainFull);
      if (result.success) {
        console.log(`Successfully removed ${subdomainFull} from Railway`);
      } else {
        // Log but don't fail the delete - the facilitator is already deleted
        console.error(`Failed to remove ${subdomainFull} from Railway:`, result.error);
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Delete facilitator error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/facilitators/:id/transactions - Get transaction history
 */
router.get('/facilitators/:id/transactions', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const transactions = getTransactionsByFacilitator(req.params.id, limit, offset);
    const stats = getTransactionStats(req.params.id);

    res.json({
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        network: t.network,
        fromAddress: t.from_address,
        toAddress: t.to_address,
        amount: t.amount,
        asset: t.asset,
        transactionHash: t.transaction_hash,
        status: t.status,
        errorMessage: t.error_message,
        createdAt: formatSqliteDate(t.created_at),
      })),
      stats: {
        totalVerifications: stats.verified,
        totalSettlements: stats.settled,
        totalFailed: stats.failed,
        total: stats.total,
        totalAmountSettled: stats.totalAmountSettled,
      },
      pagination: {
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/facilitators/:id/wallet - Generate a new wallet for the facilitator
 */
router.post('/facilitators/:id/wallet', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    // Check if wallet already exists
    if (facilitator.encrypted_private_key) {
      res.status(409).json({ error: 'Wallet already exists. Delete it first to generate a new one.' });
      return;
    }

    // Generate new wallet
    const wallet = generateWallet();
    
    // Get the address from the private key
    const address = getWalletAddress(wallet.privateKey as Hex);
    
    // Encrypt and store
    const encryptedKey = encryptPrivateKey(wallet.privateKey);
    const updated = updateFacilitator(req.params.id, { encrypted_private_key: encryptedKey });
    
    if (!updated) {
      res.status(500).json({ error: 'Failed to save wallet' });
      return;
    }

    res.status(201).json({
      success: true,
      address,
      message: 'Wallet generated. Fund this address with ETH for gas fees.',
    });
  } catch (error) {
    console.error('Generate wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/facilitators/:id/wallet/import - Import an existing private key
 */
router.post('/facilitators/:id/wallet/import', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    const { privateKey } = req.body;
    if (!privateKey || typeof privateKey !== 'string') {
      res.status(400).json({ error: 'Private key is required' });
      return;
    }

    // Validate private key format
    if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
      res.status(400).json({ error: 'Invalid private key format. Must be 0x-prefixed 64 hex characters.' });
      return;
    }

    // Get address from private key
    const address = getWalletAddress(privateKey as Hex);
    
    // Encrypt and store
    const encryptedKey = encryptPrivateKey(privateKey);
    const updated = updateFacilitator(req.params.id, { encrypted_private_key: encryptedKey });
    
    if (!updated) {
      res.status(500).json({ error: 'Failed to save wallet' });
      return;
    }

    res.status(201).json({
      success: true,
      address,
      message: 'Wallet imported successfully.',
    });
  } catch (error) {
    console.error('Import wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/facilitators/:id/wallet - Get wallet info (address, balances)
 */
router.get('/facilitators/:id/wallet', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    if (!facilitator.encrypted_private_key) {
      res.json({
        hasWallet: false,
        address: null,
        balances: {},
      });
      return;
    }

    // Decrypt private key to get address
    const privateKey = decryptPrivateKey(facilitator.encrypted_private_key);
    const address = getWalletAddress(privateKey as Hex);

    // Get balances for supported EVM chains
    const balances: Record<string, { balance: string; formatted: string }> = {};
    const supportedChains = JSON.parse(facilitator.supported_chains) as (number | string)[];
    
    for (const chainId of supportedChains) {
      // Only get balances for EVM chains (number chainIds)
      if (typeof chainId === 'number') {
        try {
          const result = await getWalletBalance(chainId, address);
          balances[String(chainId)] = {
            balance: result.balance.toString(),
            formatted: result.formatted,
          };
        } catch (e) {
          // Skip chains that fail to fetch balance
          console.error(`Failed to get balance for chain ${chainId}:`, e);
        }
      }
    }

    res.json({
      hasWallet: true,
      address,
      balances,
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/facilitators/:id/wallet - Remove EVM wallet
 */
router.delete('/facilitators/:id/wallet', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    if (!facilitator.encrypted_private_key) {
      res.status(404).json({ error: 'No EVM wallet configured' });
      return;
    }

    // Remove wallet
    const updated = updateFacilitator(req.params.id, { encrypted_private_key: '' });
    
    if (!updated) {
      res.status(500).json({ error: 'Failed to remove wallet' });
      return;
    }

    res.json({ success: true, message: 'Wallet removed' });
  } catch (error) {
    console.error('Delete wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============= SOLANA WALLET ENDPOINTS =============

/**
 * POST /api/admin/facilitators/:id/wallet/solana - Generate a new Solana wallet
 */
router.post('/facilitators/:id/wallet/solana', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    // Check if Solana wallet already exists
    if (facilitator.encrypted_solana_private_key) {
      res.status(409).json({ error: 'Solana wallet already exists. Delete it first to generate a new one.' });
      return;
    }

    // Generate new Solana wallet
    const wallet = generateSolanaKeypair();
    
    // Encrypt and store
    const encryptedKey = encryptPrivateKey(wallet.privateKey);
    const updated = updateFacilitator(req.params.id, { encrypted_solana_private_key: encryptedKey });
    
    if (!updated) {
      res.status(500).json({ error: 'Failed to save Solana wallet' });
      return;
    }

    res.status(201).json({
      success: true,
      address: wallet.publicKey,
      message: 'Solana wallet generated. Fund this address with SOL for transaction fees.',
    });
  } catch (error) {
    console.error('Generate Solana wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/facilitators/:id/wallet/solana/import - Import an existing Solana private key
 */
router.post('/facilitators/:id/wallet/solana/import', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    const { privateKey } = req.body;
    if (!privateKey || typeof privateKey !== 'string') {
      res.status(400).json({ error: 'Private key is required' });
      return;
    }

    // Validate Solana private key format (base58, 64 bytes when decoded)
    if (!isValidSolanaPrivateKey(privateKey)) {
      res.status(400).json({ error: 'Invalid Solana private key format. Must be base58-encoded 64-byte key.' });
      return;
    }

    // Get public key from private key
    const address = getSolanaPublicKey(privateKey);
    
    // Encrypt and store
    const encryptedKey = encryptPrivateKey(privateKey);
    const updated = updateFacilitator(req.params.id, { encrypted_solana_private_key: encryptedKey });
    
    if (!updated) {
      res.status(500).json({ error: 'Failed to save Solana wallet' });
      return;
    }

    res.status(201).json({
      success: true,
      address,
      message: 'Solana wallet imported successfully.',
    });
  } catch (error) {
    console.error('Import Solana wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/facilitators/:id/wallet/solana - Get Solana wallet info
 */
router.get('/facilitators/:id/wallet/solana', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    if (!facilitator.encrypted_solana_private_key) {
      res.json({
        hasWallet: false,
        address: null,
        balance: null,
      });
      return;
    }

    // Decrypt private key to get address
    const privateKey = decryptPrivateKey(facilitator.encrypted_solana_private_key);
    const address = getSolanaPublicKey(privateKey);

    // Get SOL balance
    let balance = null;
    try {
      const result = await getSolanaBalance('solana', address);
      balance = {
        sol: result.formatted,
        lamports: result.balance.toString(),
      };
    } catch (e) {
      console.error('Failed to get Solana balance:', e);
    }

    res.json({
      hasWallet: true,
      address,
      balance,
    });
  } catch (error) {
    console.error('Get Solana wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/facilitators/:id/wallet/solana - Remove Solana wallet
 */
router.delete('/facilitators/:id/wallet/solana', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    if (!facilitator.encrypted_solana_private_key) {
      res.status(404).json({ error: 'No Solana wallet configured' });
      return;
    }

    // Remove wallet
    const updated = updateFacilitator(req.params.id, { encrypted_solana_private_key: '' });
    
    if (!updated) {
      res.status(500).json({ error: 'Failed to remove Solana wallet' });
      return;
    }

    res.json({ success: true, message: 'Solana wallet removed' });
  } catch (error) {
    console.error('Delete Solana wallet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/facilitators/:id/export - Generate self-host config
 */
router.post('/facilitators/:id/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    // Generate Docker Compose configuration for self-hosting
    const dockerCompose = `version: '3.8'

services:
  openfacilitator:
    image: ghcr.io/rawgroundbeef/openfacilitator:latest
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - FACILITATOR_NAME=${facilitator.name}
      - FACILITATOR_SUBDOMAIN=${facilitator.subdomain}
      - OWNER_ADDRESS=${facilitator.owner_address}
      - SUPPORTED_CHAINS=${facilitator.supported_chains}
      - DATABASE_PATH=/data/openfacilitator.db
    volumes:
      - openfacilitator-data:/data
    restart: unless-stopped

volumes:
  openfacilitator-data:
`;

    const envFile = `# OpenFacilitator Configuration
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Facilitator Settings
FACILITATOR_NAME="${facilitator.name}"
FACILITATOR_SUBDOMAIN="${facilitator.subdomain}"
OWNER_ADDRESS="${facilitator.owner_address}"
SUPPORTED_CHAINS='${facilitator.supported_chains}'
SUPPORTED_TOKENS='${facilitator.supported_tokens}'

# Database
DATABASE_PATH=./data/openfacilitator.db

# Optional: Custom RPC endpoints
# BASE_RPC_URL=https://mainnet.base.org
# BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
`;

    res.json({
      dockerCompose,
      envFile,
      instructions: `
# Self-hosting Instructions

1. Save the docker-compose.yml file
2. Save the .env file in the same directory
3. Run: docker compose up -d
4. Your facilitator will be available at http://localhost:3001

For production:
- Set up a reverse proxy (nginx, caddy) with SSL
- Point your domain to the server
- Update the HOST environment variable
      `.trim(),
    });
  } catch (error) {
    console.error('Export facilitator error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/facilitators/:id/domain - Setup custom domain via Railway
 */
router.post('/facilitators/:id/domain', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    if (!facilitator.custom_domain) {
      res.status(400).json({ error: 'No custom domain configured for this facilitator' });
      return;
    }

    if (!isRailwayConfigured()) {
      // Return manual setup instructions when Railway API is not configured
      res.json({
        success: true,
        domain: facilitator.custom_domain,
        status: 'manual_setup',
        message: 'Please add this domain manually in Railway: Settings → Networking → Custom Domains',
        dnsRecords: [
          {
            type: 'CNAME',
            name: facilitator.custom_domain.split('.')[0],
            value: 'api.openfacilitator.io',
          },
        ],
      });
      return;
    }

    const result = await addCustomDomain(facilitator.custom_domain);
    
    if (!result.success) {
      // If Railway API fails, return manual instructions
      console.error('Railway API failed:', result.error);
      res.json({
        success: true,
        domain: facilitator.custom_domain,
        status: 'manual_setup',
        message: `Railway API error. Please add domain manually in Railway Dashboard. Error: ${result.error}`,
        dnsRecords: [
          {
            type: 'CNAME',
            name: facilitator.custom_domain.split('.')[0],
            value: 'api.openfacilitator.io',
          },
        ],
      });
      return;
    }

    res.json({
      success: true,
      domain: result.domain,
      status: result.status,
      message: 'Domain added to Railway. Configure your DNS records.',
    });
  } catch (error) {
    console.error('Setup domain error:', error);
    // Return manual instructions on any error
    const facilitator = getFacilitatorById(req.params.id);
    res.json({
      success: true,
      domain: facilitator?.custom_domain,
      status: 'manual_setup',
      message: 'Please add this domain manually in Railway Dashboard.',
      dnsRecords: [
        {
          type: 'CNAME',
          name: facilitator?.custom_domain?.split('.')[0] || '',
          value: 'api.openfacilitator.io',
        },
      ],
    });
  }
});

/**
 * DELETE /api/admin/facilitators/:id/domain - Remove custom domain from Railway
 */
router.delete('/facilitators/:id/domain', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    if (!facilitator.custom_domain) {
      res.status(400).json({ error: 'No custom domain configured for this facilitator' });
      return;
    }

    if (!isRailwayConfigured()) {
      res.status(503).json({ error: 'Railway integration not configured' });
      return;
    }

    const result = await removeCustomDomain(facilitator.custom_domain);
    
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Domain removed from Railway' });
  } catch (error) {
    console.error('Remove domain error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/facilitators/:id/domain/status - Check domain DNS status
 */
router.get('/facilitators/:id/domain/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const facilitator = getFacilitatorById(req.params.id);
    if (!facilitator) {
      res.status(404).json({ error: 'Facilitator not found' });
      return;
    }

    if (!facilitator.custom_domain) {
      res.status(400).json({ error: 'No custom domain configured for this facilitator' });
      return;
    }

    if (!isRailwayConfigured()) {
      // Return basic status without Railway integration
      res.json({
        domain: facilitator.custom_domain,
        status: 'unconfigured',
        railwayConfigured: false,
        dnsRecords: [
          {
            type: 'CNAME',
            name: facilitator.custom_domain,
            value: 'api.openfacilitator.io',
          },
        ],
      });
      return;
    }

    const status = await getDomainStatus(facilitator.custom_domain);
    
    if (!status) {
      res.json({
        domain: facilitator.custom_domain,
        status: 'not_added',
        railwayConfigured: true,
        message: 'Domain not yet added to Railway. Click "Setup Domain" to add it.',
        dnsRecords: [
          {
            type: 'CNAME',
            name: facilitator.custom_domain,
            value: 'api.openfacilitator.io',
          },
        ],
      });
      return;
    }

    res.json({
      ...status,
      railwayConfigured: true,
    });
  } catch (error) {
    console.error('Get domain status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as adminRouter };

