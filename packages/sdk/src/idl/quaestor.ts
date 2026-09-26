/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/quaestor.json`.
 */
export type Quaestor = {
  "address": "FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP",
  "metadata": {
    "name": "quaestor",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Hierarchical on-chain budgets for AI agents"
  },
  "instructions": [
    {
      "name": "allocateChild",
      "docs": [
        "Parent (agent) or owner allocates a new child budget, reserving `amount` in the parent."
      ],
      "discriminator": [
        251,
        151,
        113,
        60,
        198,
        153,
        105,
        104
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Must be parent.agent OR project.owner (checked in handler)."
          ],
          "signer": true
        },
        {
          "name": "feePayer",
          "docs": [
            "Relayer that pays rent for the new child account (needs no authority)."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "project",
          "relations": [
            "parent"
          ]
        },
        {
          "name": "parent",
          "writable": true
        },
        {
          "name": "childAgent"
        },
        {
          "name": "child",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  100,
                  103,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "childAgent"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "label",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "perTxLimit",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "periodLimit",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "periodSeconds",
          "type": "i64"
        },
        {
          "name": "expiresAt",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "canDelegate",
          "type": "bool"
        },
        {
          "name": "maxChildDepth",
          "type": "u8"
        },
        {
          "name": "allowlist",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "createProject",
      "docs": [
        "Owner creates a project: initializes the Project, its vault (ATA of the Project PDA),",
        "and the root Budget (agent == owner, can_delegate = true)."
      ],
      "discriminator": [
        148,
        219,
        181,
        42,
        221,
        114,
        145,
        190
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "projectId"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "rootBudget",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  100,
                  103,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "projectId",
          "type": "u64"
        },
        {
          "name": "label",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "feePayer",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "deposit",
      "docs": [
        "Anyone transfers tokens into the vault; the root budget's `allocated` grows."
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "project"
        },
        {
          "name": "rootBudget",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "from",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "increaseAllocation",
      "docs": [
        "Increase an existing child's allocation (reserves more in the parent)."
      ],
      "discriminator": [
        243,
        104,
        235,
        24,
        238,
        122,
        199,
        92
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Must be parent.agent OR project.owner."
          ],
          "signer": true
        },
        {
          "name": "project",
          "relations": [
            "parent",
            "child"
          ]
        },
        {
          "name": "parent",
          "writable": true
        },
        {
          "name": "child",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reclaim",
      "docs": [
        "Reclaim a revoked/expired child's unused funds back to its parent (bottom-up).",
        "remaining_accounts = the parent's own ancestor chain (to detect a revoked ancestor)."
      ],
      "discriminator": [
        44,
        177,
        236,
        249,
        145,
        109,
        163,
        186
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Must be project.owner OR parent.agent."
          ],
          "signer": true
        },
        {
          "name": "project",
          "relations": [
            "parent",
            "child"
          ]
        },
        {
          "name": "parent",
          "writable": true
        },
        {
          "name": "child",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "revoke",
      "docs": [
        "Owner permanently revokes a budget."
      ],
      "discriminator": [
        170,
        23,
        31,
        34,
        133,
        173,
        93,
        242
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "project",
          "relations": [
            "budget"
          ]
        },
        {
          "name": "budget",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "setStatus",
      "docs": [
        "Owner freezes (true) or unfreezes (false) a budget."
      ],
      "discriminator": [
        181,
        184,
        224,
        203,
        193,
        29,
        177,
        224
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "project",
          "relations": [
            "budget"
          ]
        },
        {
          "name": "budget",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "freeze",
          "type": "bool"
        }
      ]
    },
    {
      "name": "spend",
      "docs": [
        "Agent spends from its budget; transfers vault -> recipient. Ancestor chain in remaining_accounts."
      ],
      "discriminator": [
        242,
        205,
        255,
        87,
        101,
        217,
        245,
        57
      ],
      "accounts": [
        {
          "name": "agent",
          "signer": true
        },
        {
          "name": "project",
          "relations": [
            "budget"
          ]
        },
        {
          "name": "budget",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  100,
                  103,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "mint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "recipient",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "Owner withdraws from the root's available balance."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "project"
        },
        {
          "name": "rootBudget",
          "writable": true
        },
        {
          "name": "mint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "to",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "budget",
      "discriminator": [
        35,
        151,
        58,
        65,
        187,
        148,
        119,
        218
      ]
    },
    {
      "name": "project",
      "discriminator": [
        205,
        168,
        189,
        202,
        181,
        247,
        142,
        19
      ]
    }
  ],
  "events": [
    {
      "name": "budgetAllocated",
      "discriminator": [
        41,
        69,
        19,
        23,
        8,
        16,
        174,
        219
      ]
    },
    {
      "name": "deposited",
      "discriminator": [
        111,
        141,
        26,
        45,
        161,
        35,
        100,
        57
      ]
    },
    {
      "name": "projectCreated",
      "discriminator": [
        192,
        10,
        163,
        29,
        185,
        31,
        67,
        168
      ]
    },
    {
      "name": "reclaimed",
      "discriminator": [
        230,
        25,
        32,
        135,
        40,
        167,
        137,
        130
      ]
    },
    {
      "name": "spent",
      "discriminator": [
        43,
        51,
        164,
        100,
        191,
        244,
        174,
        98
      ]
    },
    {
      "name": "statusChanged",
      "discriminator": [
        146,
        235,
        222,
        125,
        145,
        246,
        34,
        240
      ]
    },
    {
      "name": "withdrawn",
      "discriminator": [
        20,
        89,
        223,
        198,
        194,
        124,
        219,
        13
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized: signer is not the required agent or owner"
    },
    {
      "code": 6001,
      "name": "ownerOnly",
      "msg": "Only the project owner may perform this action"
    },
    {
      "code": 6002,
      "name": "notActive",
      "msg": "Budget is not active (frozen or revoked)"
    },
    {
      "code": 6003,
      "name": "ancestorNotActive",
      "msg": "An ancestor budget is frozen, revoked, or expired"
    },
    {
      "code": 6004,
      "name": "expired",
      "msg": "Budget has expired"
    },
    {
      "code": 6005,
      "name": "cannotDelegate",
      "msg": "Parent budget is not allowed to delegate"
    },
    {
      "code": 6006,
      "name": "maxDepthExceeded",
      "msg": "Maximum tree depth exceeded"
    },
    {
      "code": 6007,
      "name": "maxChildDepthExceeded",
      "msg": "Depth exceeds parent's max_child_depth"
    },
    {
      "code": 6008,
      "name": "insufficientAvailable",
      "msg": "Amount exceeds available balance"
    },
    {
      "code": 6009,
      "name": "perTxLimitExceeded",
      "msg": "Amount exceeds per-transaction limit"
    },
    {
      "code": 6010,
      "name": "periodLimitExceeded",
      "msg": "Amount exceeds period limit"
    },
    {
      "code": 6011,
      "name": "limitTooLoose",
      "msg": "Child limit is looser than the parent limit"
    },
    {
      "code": 6012,
      "name": "expiryTooLate",
      "msg": "Child expiry is later than the parent expiry"
    },
    {
      "code": 6013,
      "name": "recipientNotAllowed",
      "msg": "Recipient is not in the allowlist"
    },
    {
      "code": 6014,
      "name": "allowlistNotSubset",
      "msg": "Child allowlist is not a subset of the parent allowlist"
    },
    {
      "code": 6015,
      "name": "allowlistFull",
      "msg": "Allowlist exceeds the maximum number of entries"
    },
    {
      "code": 6016,
      "name": "invalidChain",
      "msg": "Ancestor chain is invalid (broken link, wrong PDA, or wrong depth)"
    },
    {
      "code": 6017,
      "name": "chainLengthMismatch",
      "msg": "Ancestor chain length does not match the node depth"
    },
    {
      "code": 6018,
      "name": "wrongProject",
      "msg": "Account belongs to a different project"
    },
    {
      "code": 6019,
      "name": "invalidPda",
      "msg": "Provided account is not the expected PDA"
    },
    {
      "code": 6020,
      "name": "hasReservedChildren",
      "msg": "Budget still has funds reserved for children"
    },
    {
      "code": 6021,
      "name": "notReclaimable",
      "msg": "Budget is not reclaimable (not revoked/expired and no revoked ancestor)"
    },
    {
      "code": 6022,
      "name": "wrongParent",
      "msg": "Child is not linked to the provided parent"
    },
    {
      "code": 6023,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6024,
      "name": "invalidMint",
      "msg": "Invalid mint"
    },
    {
      "code": 6025,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6026,
      "name": "alreadyRevoked",
      "msg": "Budget is already revoked"
    }
  ],
  "types": [
    {
      "name": "budget",
      "docs": [
        "A budget node in the tree. Pure accounting; money lives in the project vault.",
        "PDA: [\"budget\", project, agent]  (one node per agent key per project)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "parent",
            "docs": [
              "None == root."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "agent",
            "docs": [
              "The key that authorizes `spend` and `allocate_child` for this node."
            ],
            "type": "pubkey"
          },
          {
            "name": "label",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "depth",
            "docs": [
              "Root = 0."
            ],
            "type": "u8"
          },
          {
            "name": "canDelegate",
            "docs": [
              "Whether this node may create children."
            ],
            "type": "bool"
          },
          {
            "name": "maxChildDepth",
            "docs": [
              "Maximum absolute depth allowed anywhere in this node's subtree."
            ],
            "type": "u8"
          },
          {
            "name": "allocated",
            "docs": [
              "Total allocated to this node."
            ],
            "type": "u64"
          },
          {
            "name": "spent",
            "docs": [
              "Spent by this node itself."
            ],
            "type": "u64"
          },
          {
            "name": "reservedForChildren",
            "docs": [
              "Reserved (allocated out) to children."
            ],
            "type": "u64"
          },
          {
            "name": "perTxLimit",
            "docs": [
              "None == no per-transaction cap."
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "periodLimit",
            "docs": [
              "None == no rolling-period cap."
            ],
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "periodSeconds",
            "docs": [
              "Length of the rolling period in seconds (<= 0 means no period cap)."
            ],
            "type": "i64"
          },
          {
            "name": "periodStart",
            "docs": [
              "Start of the current rolling window (unix seconds)."
            ],
            "type": "i64"
          },
          {
            "name": "periodSpent",
            "docs": [
              "Spent within the current rolling window."
            ],
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "docs": [
              "None == never expires."
            ],
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "budgetStatus"
              }
            }
          },
          {
            "name": "allowlist",
            "docs": [
              "Allowed recipient wallets. `allowlist_len == 0` means any recipient allowed."
            ],
            "type": {
              "array": [
                "pubkey",
                8
              ]
            }
          },
          {
            "name": "allowlistLen",
            "type": "u8"
          },
          {
            "name": "childrenCount",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "budgetAllocated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "parent",
            "type": "pubkey"
          },
          {
            "name": "child",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "depth",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "budgetStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "frozen"
          },
          {
            "name": "revoked"
          }
        ]
      }
    },
    {
      "name": "deposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "rootAllocated",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "project",
      "docs": [
        "A funding project. Owns one vault (token account) and a root budget.",
        "PDA: [\"project\", owner, project_id_le]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "Human owner. Has override rights over the whole tree."
            ],
            "type": "pubkey"
          },
          {
            "name": "projectId",
            "docs": [
              "Caller-chosen id, unique per owner."
            ],
            "type": "u64"
          },
          {
            "name": "mint",
            "docs": [
              "USDC (or test) mint used by this project."
            ],
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "Vault token account (ATA of this Project PDA for `mint`)."
            ],
            "type": "pubkey"
          },
          {
            "name": "rootBudget",
            "docs": [
              "The root Budget PDA (agent == owner)."
            ],
            "type": "pubkey"
          },
          {
            "name": "feePayer",
            "docs": [
              "Relayer that pays fees/rent so agents need no SOL. Never an authority."
            ],
            "type": "pubkey"
          },
          {
            "name": "label",
            "docs": [
              "Human-readable label."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "projectCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "projectId",
            "type": "u64"
          },
          {
            "name": "rootBudget",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "reclaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "parent",
            "type": "pubkey"
          },
          {
            "name": "child",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "spent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "budget",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "statusChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "budget",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "withdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "budgetSeed",
      "docs": [
        "PDA seed for a Budget account: [\"budget\", project, agent]."
      ],
      "type": "bytes",
      "value": "[98, 117, 100, 103, 101, 116]"
    },
    {
      "name": "projectSeed",
      "docs": [
        "PDA seed for a Project account: [\"project\", owner, project_id_le]."
      ],
      "type": "bytes",
      "value": "[112, 114, 111, 106, 101, 99, 116]"
    }
  ]
};
