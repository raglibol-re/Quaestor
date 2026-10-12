import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { MAX_DEPTH } from "./constants";
import { QUAESTOR_IDL } from "./idl/quaestor_json";
import type { Quaestor } from "./idl/quaestor";
import { findBudgetPda, findProjectPda } from "./pdas";
import {
  BudgetData,
  BudgetTreeNode,
  ProjectData,
  fetchBudgetTree,
  fetchProjectBudgets,
  getAncestorChain,
} from "./tree";
import { labelBytes } from "./util";

export interface AllocateChildParams {
  authority: PublicKey;
  feePayer: PublicKey;
  project: PublicKey;
  parent: PublicKey;
  childAgent: PublicKey;
  label: string;
  amount: BN;
  perTxLimit?: BN | null;
  periodLimit?: BN | null;
  periodSeconds?: number | BN;
  expiresAt?: BN | null;
  canDelegate?: boolean;
  maxChildDepth?: number;
  allowlist?: PublicKey[];
}

/**
 * High-level client around the Quaestor Anchor program.
 * Instruction methods return an Anchor MethodsBuilder — call `.rpc()`,
 * `.transaction()`, `.instruction()`, or add `.signers([...])` as needed.
 */
export class QuaestorClient {
  readonly program: Program<Quaestor>;

  constructor(program: Program<Quaestor>) {
    this.program = program;
  }

  static fromProvider(provider: AnchorProvider): QuaestorClient {
    return new QuaestorClient(new Program(QUAESTOR_IDL, provider));
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  // ---------- reads ----------

  getProject(project: PublicKey): Promise<ProjectData> {
    return this.program.account.project.fetch(project);
  }

  getBudget(budget: PublicKey): Promise<BudgetData> {
    return this.program.account.budget.fetch(budget);
  }

  fetchBudgetTree(project: PublicKey): Promise<BudgetTreeNode | null> {
    return fetchBudgetTree(this.program, project);
  }

  fetchProjectBudgets(project: PublicKey) {
    return fetchProjectBudgets(this.program, project);
  }

  getAncestorChain(budget: PublicKey): Promise<PublicKey[]> {
    return getAncestorChain(this.program, budget);
  }

  // ---------- instruction builders ----------

  createProject(p: {
    owner: PublicKey;
    mint: PublicKey;
    projectId: number | bigint;
    label: string;
    feePayer: PublicKey;
  }) {
    const [project] = findProjectPda(p.owner, p.projectId, this.programId);
    const [rootBudget] = findBudgetPda(project, p.owner, this.programId);
    const vault = getAssociatedTokenAddressSync(p.mint, project, true);
    return this.program.methods
      .createProject(new BN(p.projectId.toString()), labelBytes(p.label), p.feePayer)
      .accountsPartial({
        owner: p.owner,
        project,
        mint: p.mint,
        vault,
        rootBudget,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      });
  }

  async deposit(p: {
    depositor: PublicKey;
    project: PublicKey;
    from: PublicKey;
    amount: BN;
  }) {
    const proj = await this.getProject(p.project);
    return this.program.methods.deposit(p.amount).accountsPartial({
      depositor: p.depositor,
      project: p.project,
      rootBudget: proj.rootBudget,
      mint: proj.mint,
      from: p.from,
      vault: proj.vault,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
  }

  allocateChild(p: AllocateChildParams) {
    const [child] = findBudgetPda(p.project, p.childAgent, this.programId);
    return this.program.methods
      .allocateChild(
        labelBytes(p.label),
        p.amount,
        p.perTxLimit ?? null,
        p.periodLimit ?? null,
        new BN((p.periodSeconds ?? 0).toString()),
        p.expiresAt ?? null,
        p.canDelegate ?? true,
        p.maxChildDepth ?? MAX_DEPTH,
        p.allowlist ?? []
      )
      .accountsPartial({
        authority: p.authority,
        feePayer: p.feePayer,
        project: p.project,
        parent: p.parent,
        childAgent: p.childAgent,
        child,
        systemProgram: SystemProgram.programId,
      });
  }

  increaseAllocation(p: {
    authority: PublicKey;
    project: PublicKey;
    parent: PublicKey;
    child: PublicKey;
    amount: BN;
  }) {
    return this.program.methods.increaseAllocation(p.amount).accountsPartial({
      authority: p.authority,
      project: p.project,
      parent: p.parent,
      child: p.child,
    });
  }

  async spend(p: {
    agent: PublicKey;
    project: PublicKey;
    budget: PublicKey;
    recipient: PublicKey;
    amount: BN;
  }) {
    const proj = await this.getProject(p.project);
    const chain = await this.getAncestorChain(p.budget);
    return this.program.methods
      .spend(p.amount)
      .accountsPartial({
        agent: p.agent,
        project: p.project,
        budget: p.budget,
        mint: proj.mint,
        recipient: p.recipient,
        vault: proj.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(chain.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })));
  }

  setStatus(p: { owner: PublicKey; project: PublicKey; budget: PublicKey; freeze: boolean }) {
    return this.program.methods.setStatus(p.freeze).accountsPartial({
      owner: p.owner,
      project: p.project,
      budget: p.budget,
    });
  }

  /**
   * Ancestor-*agent* freeze/unfreeze: `authority` must be an ancestor agent of `budget`
   * (any level up to the root). Appends the budget's ancestor chain as remaining accounts.
   */
  async agentSetStatus(p: {
    authority: PublicKey;
    project: PublicKey;
    budget: PublicKey;
    freeze: boolean;
  }) {
    const chain = await this.getAncestorChain(p.budget);
    return this.program.methods
      .agentSetStatus(p.freeze)
      .accountsPartial({
        authority: p.authority,
        project: p.project,
        budget: p.budget,
      })
      .remainingAccounts(chain.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })));
  }

  revoke(p: { owner: PublicKey; project: PublicKey; budget: PublicKey }) {
    return this.program.methods.revoke().accountsPartial({
      owner: p.owner,
      project: p.project,
      budget: p.budget,
    });
  }

  async reclaim(p: {
    authority: PublicKey;
    project: PublicKey;
    parent: PublicKey;
    child: PublicKey;
  }) {
    const chain = await this.getAncestorChain(p.parent);
    return this.program.methods
      .reclaim()
      .accountsPartial({
        authority: p.authority,
        project: p.project,
        parent: p.parent,
        child: p.child,
      })
      .remainingAccounts(chain.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })));
  }

  async withdraw(p: {
    owner: PublicKey;
    project: PublicKey;
    to: PublicKey;
    amount: BN;
  }) {
    const proj = await this.getProject(p.project);
    return this.program.methods.withdraw(p.amount).accountsPartial({
      owner: p.owner,
      project: p.project,
      rootBudget: proj.rootBudget,
      mint: proj.mint,
      to: p.to,
      vault: proj.vault,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
  }
}
