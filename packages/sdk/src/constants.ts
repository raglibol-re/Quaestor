import { PublicKey } from "@solana/web3.js";
import { QUAESTOR_IDL } from "./idl/quaestor_json";

/** On-chain program id (from the IDL). */
export const PROGRAM_ID = new PublicKey(QUAESTOR_IDL.address);

export const PROJECT_SEED = Buffer.from("project");
export const BUDGET_SEED = Buffer.from("budget");

/** Root = 0, deepest node = MAX_DEPTH. */
export const MAX_DEPTH = 4;
export const MAX_ALLOWLIST = 8;
export const LABEL_LEN = 32;

/** Default USDC decimals used by the demo/test mint. */
export const USDC_DECIMALS = 6;
