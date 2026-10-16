/**
 * SplitStack Group Expense Splitting Domain Module (Review 2, Step P5).
 * Implements deterministic equal splits with integer paise remainder allocation,
 * and custom split validation.
 *
 * All amounts are integer paise (1 Rupee = 100 paise).
 * No floating-point arithmetic is used for financial totals.
 */

/**
 * Calculate equal split among participating members with deterministic remainder allocation.
 *
 * Remainder Rule:
 * When an amount in integer paise cannot be evenly divided by the number of participants,
 * the leftover remainder paise (amount % participantCount) is deterministically assigned
 * to the payer (if the payer is among participants), or to the first participant in the list.
 * This guarantees:
 * 1. Every participant's share is an exact integer number of paise.
 * 2. The sum of all shares equals the total expense amount identically.
 *
 * @param {Object} params
 * @param {number} params.amount - Total amount in integer paise (must be positive integer)
 * @param {Array<string|{userId: string}>} params.participants - Participating member IDs or objects
 * @param {string} [params.payerId] - User ID of the paying member
 * @returns {Array<{ userId: string, amount: number }>} Exact member shares in paise
 * @throws {Error} If amount is invalid or participants array is empty
 */
export function calculateEqualSplit({ amount, participants, payerId = null }) {
  if (amount === null || amount === undefined || !Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be positive integer paise');
  }

  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error('At least one participant is required for split');
  }

  // Extract clean list of unique user IDs
  const rawIds = participants.map((p) => (typeof p === 'string' ? p.trim() : p.userId?.trim()));
  const participantIds = [];
  const seen = new Set();

  for (const id of rawIds) {
    if (!id) throw new Error('Invalid participant ID in split');
    if (seen.has(id)) {
      throw new Error(`Duplicate participant "${id}" in split`);
    }
    seen.add(id);
    participantIds.push(id);
  }

  const count = participantIds.length;
  const baseShare = Math.floor(amount / count);
  const remainder = amount % count;

  // Remainder allocation: assign leftover paise to payer if participating, else to the first participant
  const remainderRecipientId = payerId && participantIds.includes(payerId)
    ? payerId
    : participantIds[0];

  const shares = participantIds.map((userId) => ({
    userId,
    amount: userId === remainderRecipientId ? baseShare + remainder : baseShare
  }));

  // Invariant verification: sum of shares must equal total amount exactly
  const sum = shares.reduce((acc, s) => acc + s.amount, 0);
  if (sum !== amount) {
    throw new Error(`Internal split error: shares sum ${sum} does not equal expense amount ${amount}`);
  }

  return shares;
}

/**
 * Validate custom split shares against the total expense amount.
 *
 * Rules:
 * 1. Total amount must be positive integer paise.
 * 2. Each share must be non-negative integer paise (>= 0).
 * 3. The sum of all shares must equal the total amount exactly.
 * 4. Participants must be unique and (if allowedMemberIds is provided) belong to the group.
 *
 * @param {Object} params
 * @param {number} params.amount - Total amount in integer paise
 * @param {Array<{ userId: string, amount: number }>} params.shares - Member allocations in paise
 * @param {string[]} [params.allowedMemberIds] - Optional whitelist of group member IDs
 * @returns {{ isValid: boolean, totalAssigned: number, remaining: number, error: string|null }}
 */
export function validateCustomShares({ amount, shares, allowedMemberIds = null }) {
  if (amount === null || amount === undefined || !Number.isInteger(amount) || amount <= 0) {
    return {
      isValid: false,
      totalAssigned: 0,
      remaining: 0,
      error: 'Total amount must be positive integer paise'
    };
  }

  if (!Array.isArray(shares) || shares.length === 0) {
    return {
      isValid: false,
      totalAssigned: 0,
      remaining: amount,
      error: 'Custom shares array is required'
    };
  }

  const allowedSet = allowedMemberIds ? new Set(allowedMemberIds) : null;
  const seen = new Set();
  let totalAssigned = 0;

  for (const s of shares) {
    if (!s || !s.userId) {
      return {
        isValid: false,
        totalAssigned,
        remaining: amount - totalAssigned,
        error: 'Each share must contain a valid userId'
      };
    }

    if (seen.has(s.userId)) {
      return {
        isValid: false,
        totalAssigned,
        remaining: amount - totalAssigned,
        error: `Duplicate participant "${s.userId}" in custom split`
      };
    }
    seen.add(s.userId);

    if (allowedSet && !allowedSet.has(s.userId)) {
      return {
        isValid: false,
        totalAssigned,
        remaining: amount - totalAssigned,
        error: `User "${s.userId}" is not a member of this group`
      };
    }

    const shareAmt = s.amount;
    if (shareAmt === null || shareAmt === undefined || !Number.isInteger(shareAmt) || shareAmt < 0) {
      return {
        isValid: false,
        totalAssigned,
        remaining: amount - totalAssigned,
        error: `Share for "${s.userId}" must be a non-negative integer in paise`
      };
    }

    totalAssigned += shareAmt;
  }

  const remaining = amount - totalAssigned;
  const isValid = remaining === 0;

  let error = null;
  if (!isValid) {
    const diffPaise = Math.abs(remaining);
    const diffRupees = (diffPaise / 100).toFixed(2);
    const assignedRupees = (totalAssigned / 100).toFixed(2);
    const totalRupees = (amount / 100).toFixed(2);
    error = `Custom shares sum to ₹${assignedRupees}, but total is ₹${totalRupees} (difference: ₹${diffRupees})`;
  }

  return {
    isValid,
    totalAssigned,
    remaining,
    error
  };
}
