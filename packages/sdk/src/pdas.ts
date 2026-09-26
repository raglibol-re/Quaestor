import { PublicKey } from "@solana/web3.js";
import { BUDGET_SEED, PROGRAM_ID, PROJECT_SEED } from "./constants";

/** PDA for a Project: ["project", owner, project_id_le]. */
export function findProjectPda(
  owner: PublicKey,
  projectId: number | bigint,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(projectId));
  return PublicKey.findProgramAddressSync([PROJECT_SEED, owner.toBuffer(), idBuf], programId);
}

/** PDA for a Budget: ["budget", project, agent]. */
export function findBudgetPda(
  project: PublicKey,
  agent: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([BUDGET_SEED, project.toBuffer(), agent.toBuffer()], programId);
}
