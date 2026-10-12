import {
  encodeAbiParameters,
  formatUnits,
  hexToString,
  keccak256,
  parseUnits,
  stringToHex,
} from "viem";
import type { Address, Hex } from "viem";

/**
 * projectKey = keccak256(abi.encode(owner, uint64 id))
 * Mirrors Quaestor.projectKeyOf on-chain.
 */
export function projectKeyOf(owner: Address, id: bigint | number): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint64" }], [owner, BigInt(id)]),
  );
}

/**
 * budgetKey = keccak256(abi.encode(projectKey, agent))
 * Mirrors Quaestor.budgetKeyOf on-chain.
 */
export function budgetKeyOf(project: Hex, agent: Address): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "address" }], [project, agent]),
  );
}

/** Encode a short human label into a right-padded bytes32 (matching the Solidity tests). */
export function labelToBytes32(label: string): Hex {
  return stringToHex(label, { size: 32 });
}

/** Decode a bytes32 label back to a string, trimming trailing NUL padding. */
export function decodeLabel(label: Hex): string {
  const NUL = String.fromCharCode(0);
  try {
    return hexToString(label).split(NUL)[0];
  } catch {
    return "";
  }
}

/** Convert a human USDC amount (e.g. "10", "0.5") into base units (6 decimals by default). */
export function toBaseUnits(x: string | number, decimals = 6): bigint {
  return parseUnits(typeof x === "number" ? x.toString() : x, decimals);
}

/** Convert base units back into a human-readable decimal string. */
export function fromBaseUnits(x: bigint, decimals = 6): string {
  return formatUnits(x, decimals);
}
