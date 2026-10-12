// AUTO-GENERATED from contracts/out/Quaestor.sol/Quaestor.json — do not edit by hand.
// Regenerate by rebuilding the contracts (forge build) and re-running the SDK ABI generator.
/* eslint-disable */

export const QUAESTOR_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "trustedForwarder",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "MAX_ALLOWLIST",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_DEPTH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "agentSetStatus",
    "inputs": [
      {
        "name": "budgetKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "freeze",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allocateChild",
    "inputs": [
      {
        "name": "parentKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "childAgent",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "label",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "hasPerTx",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "perTx",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "hasPeriod",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "period",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "periodSeconds",
        "type": "int64",
        "internalType": "int64"
      },
      {
        "name": "hasExpiry",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "expiresAt",
        "type": "int64",
        "internalType": "int64"
      },
      {
        "name": "canDelegate",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "maxChildDepth",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "allowlist",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [
      {
        "name": "childKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "available",
    "inputs": [
      {
        "name": "key",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "budgetKeyOf",
    "inputs": [
      {
        "name": "project",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "agent",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "createProject",
    "inputs": [
      {
        "name": "projectId",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "label",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "mint",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "feePayer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "projectKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "rootBudget",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {
        "name": "projectKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getBudget",
    "inputs": [
      {
        "name": "key",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct Quaestor.Budget",
        "components": [
          {
            "name": "project",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "parent",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "agent",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "label",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "depth",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "canDelegate",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "maxChildDepth",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "allocated",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "spent",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "reservedForChildren",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "hasPerTxLimit",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "perTxLimit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "hasPeriodLimit",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "periodLimit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "periodSeconds",
            "type": "int64",
            "internalType": "int64"
          },
          {
            "name": "periodStart",
            "type": "int64",
            "internalType": "int64"
          },
          {
            "name": "periodSpent",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "hasExpiry",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "expiresAt",
            "type": "int64",
            "internalType": "int64"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum Quaestor.Status"
          },
          {
            "name": "allowlist",
            "type": "address[8]",
            "internalType": "address[8]"
          },
          {
            "name": "allowlistLen",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "childrenCount",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "exists",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProject",
    "inputs": [
      {
        "name": "key",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct Quaestor.Project",
        "components": [
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "projectId",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "mint",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vaultBalance",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "rootBudget",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "feePayer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "label",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "exists",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProjectBudgetKeys",
    "inputs": [
      {
        "name": "projectKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "increaseAllocation",
    "inputs": [
      {
        "name": "parentKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "childKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "isTrustedForwarder",
    "inputs": [
      {
        "name": "forwarder",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "projectKeyOf",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "id",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "reclaim",
    "inputs": [
      {
        "name": "parentKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "childKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revoke",
    "inputs": [
      {
        "name": "budgetKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setStatus",
    "inputs": [
      {
        "name": "budgetKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "freeze",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "spend",
    "inputs": [
      {
        "name": "budgetKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "taskId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "reasonHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "trustedForwarder",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [
      {
        "name": "projectKey",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "BudgetAllocated",
    "inputs": [
      {
        "name": "project",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "parent",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "child",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "depth",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Deposited",
    "inputs": [
      {
        "name": "project",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "from",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "rootAllocated",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProjectCreated",
    "inputs": [
      {
        "name": "project",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "mint",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "projectId",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "rootBudget",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Reclaimed",
    "inputs": [
      {
        "name": "project",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "parent",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "child",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Spent",
    "inputs": [
      {
        "name": "project",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "budget",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "taskId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "reasonHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StatusChanged",
    "inputs": [
      {
        "name": "project",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "budget",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "status",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Withdrawn",
    "inputs": [
      {
        "name": "project",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AllowlistFull",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AllowlistNotSubset",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyExists",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyRevoked",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AncestorNotActive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CannotDelegate",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ChainTooDeep",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Expired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExpiryTooLate",
    "inputs": []
  },
  {
    "type": "error",
    "name": "HasReservedChildren",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientAvailable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LimitTooLoose",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MaxChildDepthExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MaxDepthExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotActive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAnAncestor",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotReclaimable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnerOnly",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PerTxLimitExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PeriodLimitExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RecipientNotAllowed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "Unauthorized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WrongParent",
    "inputs": []
  }
] as const;

export const ERC2771_FORWARDER_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "execute",
    "inputs": [
      {
        "name": "request",
        "type": "tuple",
        "internalType": "struct ERC2771Forwarder.ForwardRequestData",
        "components": [
          {
            "name": "from",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "to",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "value",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "gas",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "data",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "signature",
            "type": "bytes",
            "internalType": "bytes"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "verify",
    "inputs": [
      {
        "name": "request",
        "type": "tuple",
        "internalType": "struct ERC2771Forwarder.ForwardRequestData",
        "components": [
          {
            "name": "from",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "to",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "value",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "gas",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deadline",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "data",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "signature",
            "type": "bytes",
            "internalType": "bytes"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nonces",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "eip712Domain",
    "inputs": [],
    "outputs": [
      {
        "name": "fields",
        "type": "bytes1",
        "internalType": "bytes1"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "chainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verifyingContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "extensions",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  }
] as const;

export const ERC20_ABI = [
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;
