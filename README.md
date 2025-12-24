# VaultGrid

VaultGrid is a confidential document workflow built on Zama FHEVM. It keeps encrypted document keys and encrypted
document bodies on-chain, while encryption and decryption happen locally in the browser. The system is designed for
collaboration without exposing plaintext data to the chain or to any server.

## Project Summary

VaultGrid solves the problem of shared document collaboration on a public blockchain by splitting key management and
content encryption:

- A random EVM address acts as a per-document symmetric key.
- The key is encrypted using FHE and stored on-chain.
- The document body is encrypted client-side using the key and stored on-chain.
- Access is controlled on-chain by allowing specific addresses to decrypt the key.

This makes the chain a secure, verifiable storage layer for encrypted content, while keeping plaintext entirely in the
user's browser.

## Problems Addressed

- Confidential data should never be revealed on a public chain.
- Collaboration should not require a trusted off-chain service.
- Document access should be auditable and enforced by smart contracts.
- Users should own their encryption keys and control access at the wallet level.

## Advantages

- On-chain confidentiality for keys and content with Zama FHEVM.
- End-to-end encryption where plaintext never leaves the browser.
- Owner-controlled sharing using explicit on-chain access grants.
- Immutable audit trail for document creation and updates.
- Minimal off-chain dependencies: the chain is the source of truth.
- No local storage usage in the client, reducing leak risk.

## How It Works (End-to-End Flow)

1. The user generates a random EVM address locally (this is the document key).
2. The key is encrypted with Zama FHE and submitted on-chain with:
   - Document name
   - Empty encrypted body
   - Encrypted key and proof
3. The user retrieves the encrypted key from the chain and decrypts it locally.
4. The user edits the document body and encrypts it locally using AES-GCM with the key.
5. The encrypted body is saved on-chain.
6. The owner can grant access to other addresses:
   - The contract allows those addresses to decrypt the encrypted key.
   - Authorized users can decrypt the key and update the encrypted body.

## On-Chain Data Model

Each document stores:

- `name`: user-provided document label
- `encryptedBody`: ciphertext of the document body (string)
- `encryptedKey`: FHE-encrypted key (eaddress)
- `owner`: document owner address
- `createdAt`: block timestamp
- `updatedAt`: block timestamp

Events:

- `DocumentCreated`
- `DocumentUpdated`
- `AccessGranted`

## Cryptography Model

- Key generation: random EVM address generated in the browser.
- Key protection: encrypted using Zama FHE and stored on-chain.
- Body encryption: AES-GCM in the browser using a SHA-256 derived key from the address.
- Key sharing: contract uses `FHE.allow` to authorize decryption per address.

Plaintext data never leaves the browser.

## Access Control Rules

- Only the owner can grant access to other users.
- Only authorized editors can update the encrypted body.
- The encrypted key is only decryptable by allowed addresses.

## Frontend Behavior and Constraints

- Contract writes use ethers; reads use viem.
- ABI must be copied from `deployments/sepolia` into `frontend/src/config/contracts.ts`.
- Frontend does not use environment variables.
- Frontend does not use localStorage.
- Frontend must not target localhost networks.
- Frontend does not use Tailwind; styling is CSS.
- Frontend should not import files from the repo root.
- Frontend must not use JSON files for config or data.

## Technology Stack

- Smart contracts: Solidity, Hardhat
- FHE: Zama FHEVM and relayer SDK
- Frontend: React, Vite, wagmi, RainbowKit
- Contract read: viem
- Contract write: ethers
- Cryptography: Web Crypto (AES-GCM, SHA-256)
- Tooling: npm

## Repository Structure

```
VaultGrid/
├── contracts/              # Solidity contracts
│   └── VaultGrid.sol       # Confidential document registry
├── deploy/                 # Deployment scripts
├── tasks/                  # Hardhat tasks
├── test/                   # Contract tests
├── docs/                   # Protocol and integration notes
├── frontend/               # React client
├── hardhat.config.ts       # Hardhat configuration
└── README.md               # Project documentation
```

## Setup and Usage

### Prerequisites

- Node.js 20+
- npm
- A wallet with Sepolia ETH for deployment and interaction

### Install Dependencies

```bash
npm install
```

Frontend dependencies are separate:

```bash
cd frontend
npm install
```

### Configure Deployment Credentials

Create or update `.env` in the project root:

```bash
PRIVATE_KEY=your_private_key_without_0x
INFURA_API_KEY=your_infura_api_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```

Deployment must use `PRIVATE_KEY` and must not use a mnemonic.

### Compile and Test

```bash
npm run compile
npm run test
```

### Deploy

Local node (contracts only):

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

Sepolia deployment:

```bash
npx hardhat deploy --network sepolia
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

Sepolia tests:

```bash
npx hardhat test --network sepolia
```

### Configure the Frontend Contract Address and ABI

1. After deployment, open `deployments/sepolia/VaultGrid.json`.
2. Copy the `address` and `abi` into `frontend/src/config/contracts.ts`.
3. Replace the placeholder contract address.

Do not use environment variables for this step.

### Run the Frontend

```bash
cd frontend
npm run dev
```

The frontend is configured for Sepolia. Do not point it to a localhost network.

## Available Scripts

| Script             | Description              |
| ------------------ | ------------------------ |
| `npm run compile`  | Compile all contracts    |
| `npm run test`     | Run all tests            |
| `npm run coverage` | Generate coverage report |
| `npm run lint`     | Run linting checks       |
| `npm run clean`    | Clean build artifacts    |

## Conventions and Rules

- Contract view methods must not use `msg.sender`.
- All code and comments are written in English.
- Do not modify `package.json`, `package-lock.json`, or `.gitignore` unless explicitly instructed.
- No git operations are required for development or deployment.

## Future Roadmap

Near term:

- Document version history with encrypted diffs.
- Key rotation and re-encryption workflow.
- Rich editor support with inline encryption previews.
- Batch grant and revoke for collaborators.

Mid term:

- Search over encrypted metadata (client-side index).
- Optional off-chain caching for large documents (still encrypted).
- Gas optimization for large document updates.
- Role-based access tiers beyond owner/editor.

Long term:

- Multi-chain deployments with shared access policies.
- Delegated access via smart contract wallets.
- Formal verification of access control rules.
- Policy-driven encryption, including time locks and expirations.

## License

This project is licensed under the BSD-3-Clause-Clear License. See `LICENSE`.
