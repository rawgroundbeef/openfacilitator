import { Router, type Request, type Response, type IRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { isAdmin } from '../utils/admin.js';
import {
  createRewardAddress,
  getRewardAddressesByUser,
  getRewardAddressByAddress,
  getRewardAddressById,
  verifyRewardAddress,
  isUserEnrolledInRewards,
} from '../db/reward-addresses.js';
import { isFacilitatorOwner } from '../db/facilitators.js';
import {
  verifySolanaSignature,
  createVerificationMessage,
} from '../utils/solana-verify.js';

const router: IRouter = Router();

/**
 * GET /status
 * Get the current user's rewards status
 */
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const isEnrolled = isUserEnrolledInRewards(userId);
    const isUserAdmin = isAdmin(userId);
    const isOwner = isFacilitatorOwner(userId);
    const addresses = getRewardAddressesByUser(userId);

    res.json({
      isEnrolled,
      isAdmin: isUserAdmin,
      isFacilitatorOwner: isOwner,
      addresses,
    });
  } catch (error) {
    console.error('Error getting rewards status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get rewards status',
    });
  }
});

// Maximum addresses per user (per RESEARCH.md recommendation)
const MAX_ADDRESSES_PER_USER = 5;

// Validation schema for enrollment
const enrollSchema = z.object({
  chain_type: z.enum(['solana', 'evm']),
  address: z.string().min(1, 'Address is required'),
  signature: z.string().min(1, 'Signature is required'),
  message: z.string().min(1, 'Message is required'),
});

/**
 * POST /enroll
 * Enroll a wallet address for rewards tracking
 *
 * Requires cryptographic proof of address ownership via signature verification.
 * Flow: client signs verification message -> server verifies -> address saved as verified
 */
router.post('/enroll', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Validate request body
    const parseResult = enrollSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation error',
        message: parseResult.error.errors[0]?.message || 'Invalid request body',
      });
      return;
    }

    const { chain_type, address, signature, message } = parseResult.data;

    // Only Solana addresses supported in this phase
    if (chain_type !== 'solana') {
      res.status(400).json({
        error: 'Validation error',
        message: 'Only Solana addresses supported currently',
      });
      return;
    }

    // Verify expected message matches what client signed
    const expectedMessage = createVerificationMessage(address);
    if (message !== expectedMessage) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Message format mismatch',
      });
      return;
    }

    // Verify signature proves ownership of address
    if (!verifySolanaSignature(address, signature, message)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Invalid signature - could not verify address ownership',
      });
      return;
    }

    // Check global uniqueness - one address per user globally
    const existingAddress = getRewardAddressByAddress(address, chain_type);
    if (existingAddress) {
      res.status(409).json({
        error: 'Conflict',
        message: 'This address is already registered',
      });
      return;
    }

    // Check address limit per user
    const userAddresses = getRewardAddressesByUser(userId);
    if (userAddresses.length >= MAX_ADDRESSES_PER_USER) {
      res.status(400).json({
        error: 'Limit reached',
        message: `You've reached the maximum number of addresses (${MAX_ADDRESSES_PER_USER})`,
      });
      return;
    }

    // Create the reward address
    const created = createRewardAddress({
      user_id: userId,
      chain_type,
      address,
    });

    if (!created) {
      res.status(409).json({
        error: 'Conflict',
        message: 'Address already enrolled or duplicate entry',
      });
      return;
    }

    // Immediately mark as verified (atomic flow per CONTEXT.md)
    verifyRewardAddress(created.id);

    // Re-fetch to get updated verification status
    const verified = getRewardAddressById(created.id);

    res.status(201).json(verified);
  } catch (error) {
    console.error('Error enrolling address:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to enroll address',
    });
  }
});

export const rewardsRouter = router;
