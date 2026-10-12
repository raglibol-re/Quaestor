// AUTO-GENERATED from contracts/out/QuaestorDesk.sol/QuaestorDesk.json — do not edit by hand.
// Regenerate by rebuilding the contracts (forge build) and re-copying the abi array.
/* eslint-disable */

export const QUAESTOR_DESK_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "trustedForwarder",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "usdc_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "CORE_WRITER",
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
    "name": "L1_READ_PERP_EQUITY",
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
    "name": "MAX_ASSETS",
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
    "name": "cancel",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "asset",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "oidOrCloid",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "byCloid",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createMandate",
    "inputs": [
      {
        "name": "agent",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "assets",
        "type": "uint32[]",
        "internalType": "uint32[]"
      },
      {
        "name": "hasMaxOrder",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "maxNotionalPerOrder",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "hasMaxDay",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "maxNotionalPerDay",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "equityFloor",
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
      }
    ],
    "outputs": [
      {
        "name": "id",
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
        "name": "id",
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
    "name": "fundPerp",
    "inputs": [
      {
        "name": "id",
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
    "name": "getMandate",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct QuaestorDesk.DeskMandate",
        "components": [
          {
            "name": "principal",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "agent",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "deposited",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "allowedAssets",
            "type": "uint32[8]",
            "internalType": "uint32[8]"
          },
          {
            "name": "allowedLen",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "hasMaxOrder",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "maxNotionalPerOrder",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "hasMaxDay",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "maxNotionalPerDay",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "dayStart",
            "type": "int64",
            "internalType": "int64"
          },
          {
            "name": "dayNotionalUsed",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "equityFloor",
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
            "internalType": "enum QuaestorDesk.Status"
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
    "name": "getMandateKeys",
    "inputs": [],
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
    "name": "mandateIdOf",
    "inputs": [
      {
        "name": "principal",
        "type": "address",
        "internalType": "address"
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
    "name": "owner",
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
    "name": "placeOrder",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "asset",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "isBuy",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "px",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "sz",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "tif",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "cloid",
        "type": "uint64",
        "internalType": "uint64"
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
    "name": "revoke",
    "inputs": [
      {
        "name": "id",
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
        "name": "id",
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
    "name": "usdc",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [
      {
        "name": "id",
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
    "name": "Deposited",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "deposited",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MandateCreated",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "principal",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "agent",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderCancelled",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "asset",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "oidOrCloid",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "byCloid",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderPlaced",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "asset",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "isBuy",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "px",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "sz",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "notional",
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
    "name": "PerpFunded",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
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
    "name": "StatusChanged",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "indexed": true,
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
        "name": "id",
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
    "name": "AssetNotAllowed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DayNotionalExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EquityFloorBreached",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Expired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientCustody",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotActive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OrderNotionalExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnerOnly",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PrincipalOnly",
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
    "name": "TooManyAssets",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Unauthorized",
    "inputs": []
  }
] as const;
