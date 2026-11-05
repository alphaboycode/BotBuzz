# BotBuzz 🐝

A simple, robust, full-stack decentralized news app built on the **BOT Testnet** using Foundry (smart contracts) and Vite + React + TypeScript + viem (frontend).

BotBuzz stores all news items, community votes, and tips directly onchain. Anyone can publish news items with a title and description, like or dislike posts, and tip authors in native BOT tokens. Everything is stored as plain strings with zero external dependencies, no IPFS, and no centralized backend.

---

## 🌐 Network Information

### BOT Mainnet
| Property | Details |
| :--- | :--- |
| **Network Name** | BOT Mainnet |
| **Chain ID** | `677` |
| **RPC Endpoint** | `https://rpc.botchain.ai` |
| **Native Token** | BOT (18 decimals) |
| **Total Supply** | 150 Million |
| **Official Website** | [https://www.botchain.ai/en/](https://www.botchain.ai/en/) |
| **Block Explorer** | [https://scan.botchain.ai/](https://scan.botchain.ai/) |

### BOT Testnet
| Property | Details |
| :--- | :--- |
| **Network Name** | BOT Testnet |
| **Chain ID** | `968` |
| **RPC Endpoint** | `https://rpc.bohr.life` |
| **Native Token** | BOT (18 decimals) |
| **Block Explorer** | [https://scan.bohr.life/](https://scan.bohr.life/) |

---

## 🚀 Deployed Contracts

### Mainnet (Chain ID 677)
- **Contract Name**: `BotBuzz`
- **Contract Address**: [`0x8939Fd5d0c4E6aB2A1B26222BECF809e30B19ae7`](https://scan.botchain.ai/address/0x8939Fd5d0c4E6aB2A1B26222BECF809e30B19ae7)
- **Deployment Transaction**: [`0x42434f6046af450ecfb49fead67416a58a224e248482ea492a2ef7813838722b`](https://scan.botchain.ai/tx/0x42434f6046af450ecfb49fead67416a58a224e248482ea492a2ef7813838722b)

### Testnet (Chain ID 968)
- **Contract Name**: `BotBuzz`
- **Contract Address**: [`0x8939Fd5d0c4E6aB2A1B26222BECF809e30B19ae7`](https://scan.bohr.life/address/0x8939fd5d0c4e6ab2a1b26222becf809e30b19ae7)
- **Deployment Transaction**: [`0x043e2c53e52d1595039e9238d149c1ac574915e17270445ebb3039903f6f3ece`](https://scan.bohr.life/tx/0x043e2c53e52d1595039e9238d149c1ac574915e17270445ebb3039903f6f3ece)

---

## 📁 Project Structure

```text
BotBuzz/
├── contracts/               # Foundry smart contract project
│   ├── src/
│   │   └── BotBuzz.sol      # Core BotBuzz contract (OpenZeppelin 5.x ReentrancyGuard)
│   ├── test/
│   │   └── BotBuzz.t.sol    # Comprehensive unit and invariant fuzz test suite
│   ├── script/
│   │   └── Deploy.s.sol     # Foundry deployment script
│   └── foundry.toml         # Foundry configuration with BOT testnet RPC endpoint
├── frontend/                # Vite + React + TypeScript + viem frontend
│   ├── src/
│   │   ├── contracts/       # Deployed address, ABI, and custom viem chain definition
│   │   │   ├── address.json
│   │   │   ├── abi.ts
│   │   │   ├── BotBuzz.json
│   │   │   ├── chain.ts
│   │   │   └── index.ts
│   │   ├── types.ts         # TypeScript data structures
│   │   ├── utils.ts         # Formatters (addresses, relative time, BOT currency)
│   │   ├── App.tsx          # Single-page UI with dark theme, voting, tipping, posting
│   │   ├── App.css          # Custom dark-mode styles
│   │   └── main.tsx         # React root entry
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── README.md
```

---

## ⚙️ Smart Contract Details (`BotBuzz.sol`)

- **Post Struct**:
  ```solidity
  struct Post {
      uint256 id;
      address author;
      string title;
      string description;
      uint64 createdAt;
      uint256 likes;
      uint256 dislikes;
      uint256 totalTips;
  }
  ```
- **Byte Length Validation**: Title must be 1–100 bytes; Description must be 1–500 bytes. Reverts with `InvalidTitleLength()` or `InvalidDescriptionLength()`.
- **Voting Logic**: One vote per wallet per post (`1` for like, `-1` for dislike, `0` for none).
  - Switching vote updates both `likes` and `dislikes` counters accurately.
  - Repeating the same vote reverts with `AlreadyVoted(postId, vote)`.
  - `removeVote(postId)` clears the caller's vote and decrements the appropriate counter.
- **Tipping**: Native BOT tips sent via `tip(postId) payable`:
  - Enforces `nonReentrant` (OpenZeppelin) and checks-effects-interactions.
  - Tips transfer immediately to `post.author`. Contract never holds BOT.
  - Reverts if `msg.value == 0` (`ZeroTipValue`), post doesn't exist (`PostNotFound`), or author attempts self-tipping (`CannotTipOwnPost`).
- **Views & Pagination**:
  - `getPost(postId)`: Fetch a single post.
  - `postCount()`: Total number of posts.
  - `getPosts(offset, limit)`: Paginated reading ordered newest-first (descending post ID). Safely handles boundary conditions (zero limit, large offsets, empty posts).
  - `getVote(postId, voter)`: Returns `1`, `-1`, or `0`.
- **Pure Custom Errors**: All errors use Solidity custom errors for gas optimization and clarity.
- **No Admin / No Moderation**: Unstoppable, ownerless, and immutable.

---

## 🧪 Testing

The Foundry test suite in `contracts/test/BotBuzz.t.sol` covers 23 comprehensive unit and fuzz tests.

### Run Tests:

```bash
cd contracts
forge test -vvv
```

### Test Coverage Highlights:
- **`createPost` Validation**: Reverts on empty title (0 bytes), over-length title (>100 bytes), empty description (0 bytes), over-length description (>500 bytes); tests exact boundary conditions (100-byte title, 500-byte description).
- **Vote State Transitions**: Verifies like/dislike counter increments, switching from like to dislike and vice versa, duplicate vote reverts, and vote removal.
- **Independent Votes**: Confirms voter states on different posts do not interfere with each other.
- **Tipping & Accounting**: Validates exact tip transfer to author, `totalTips` increment, contract balance remaining `0`, and reverts on 0-value, nonexistent post, or self-tipping.
- **Cross-Function Reentrancy Protection**: Employs a malicious author contract attempting to re-enter `tip` or `like` during tip delivery; asserts that `ReentrancyGuard` blocks the attack.
- **Author Payment Rejection**: Confirms an author contract that rejects native BOT causes `tip` to revert cleanly (`TipTransferFailed`) without corrupting state or impacting other posts.
- **Pagination**: Tests newest-first ordering, pagination offsets, limit clamps, offset out-of-bounds, and zero limits.
- **Invariant Fuzzing (`testFuzz_RandomVotingSequences`)**: Runs 256 randomized permutations of 15 sequential voting actions across 4 voters; asserts that stored votes strictly match `likes` and `dislikes` counters and never underflow.

---

## 🚢 Deployment

To redeploy or deploy to another environment:

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.bohr.life \
  --account <YOUR_CAST_WALLET> \
  --password <PASSWORD> \
  --broadcast
```

---

## 💻 Running the Frontend

The frontend is built with React, TypeScript, Vite, and `viem` (no heavy component libraries, ultra-fast load times).

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Dev Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Production Build
```bash
npm run build
```

---

## 🎨 Frontend Features

1. **Dark Mode UI**: Clean, responsive layout with high-contrast elements and smooth hover states.
2. **Injected Wallet Integration**: Connect via MetaMask or any EIP-1193 injected provider. Includes automatic chain detection and one-click "Switch to BOT Testnet" / "Add Network" handling.
3. **News Publishing Form**:
   - Live character counters for Title (`0 / 100`) and Description (`0 / 500`).
   - Dynamic form validation with disabled submit state for invalid inputs.
4. **Live News Feed**:
   - Shortened author addresses with a distinctive `"You"` badge on posts created by the connected wallet.
   - Relative timestamps (e.g. `"just now"`, `"5m ago"`, `"2h ago"`).
   - Real-time score indicator (`likes - dislikes`).
   - Total tips accumulated in BOT.
5. **Interactive Actions**:
   - Like (`👍`) and Dislike (`👎`) buttons with active highlight on user's current choice; clicking an active vote removes it.
   - Tip popout with quick preset buttons (`0.05`, `0.1`, `0.5`, `1` BOT) and custom amount input. Disabled on author's own posts.
6. **Feed Sorting**: Toggle between **Newest**, **Top** (highest net score), and **Most Tipped**.
7. **Transaction Feedback**: Non-intrusive status banners with direct links to the BohrScan explorer (`https://scan.bohr.life/tx/<hash>`).
8. **Plain-Text Security**: All user-submitted content is strictly rendered as plain text (no HTML or markdown parsing) to eliminate XSS risks.
