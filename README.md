# Solana Token Manager 🪙

![Solana](https://img.shields.io/badge/Solana-3E5EBC?style=for-the-badge&logo=solana&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

A full-stack dApp for creating, minting, and transferring SPL tokens on the Solana blockchain with Phantom wallet integration.

## 🌟 Features
- **Wallet Integration**: Connect Phantom/Solflare wallets
- **Token Operations**:
  - Create new SPL tokens
  - Mint tokens (fixed supply)
  - Transfer tokens between wallets
- **Real-time Tracking**:
  - SOL and token balances
  - Transaction history with Solana Explorer links
- **Responsive UI**: Mobile-friendly interface

## 💁️ Project Structure
```
solana-token-app/
├── public/               # Static assets
├── src/
│   ├── components/       # React components
│   │   └── WalletConnection.tsx  # Main interaction logic
│   ├── contexts/         # Wallet provider
│   │   └── WalletContext.tsx
│   ├── App.tsx           # Root component
│   ├── index.tsx         # Entry point
│   ├── index.css         # Global styles
├── config-overrides.js   # Webpack polyfill config
├── package.json         # Dependencies
└── tsconfig.json        # TypeScript config
```

## 🚀 Quick Start

### Prerequisites
- Node.js v16+
- Yarn/npm
- Phantom Wallet (Browser Extension)

### Installation
```bash
git clone https://github.com/yourusername/solana-token-app.git
cd solana-token-app
npm install
```

### Running Locally
```bash
npm start  # Starts dev server on http://localhost:3000
```

### Building for Production
```bash
npm run build
```

## 🛠 Key Configuration Files

### config-overrides.js
Handles polyfills for Solana web3.js:
```javascript
module.exports = function override(config) {
  config.resolve.fallback = {
    "crypto": require.resolve("crypto-browserify"),
    "stream": require.resolve("stream-browserify")
  };
  return config;
}
```

### WalletContext.tsx
Wallet connection provider:
```typescript
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';

export const WalletContext = ({ children }) => {
  const endpoint = useMemo(() => clusterApiUrl('devnet'), []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);
  
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
};
```

## 💊 Core Functionality

### Token Creation
```typescript
const createToken = async () => {
  const mintKeypair = Keypair.generate();
  const lamports = await getMinimumBalanceForRentExemptMint(connection);
  
  const transaction = new Transaction().add(
    SystemProgram.createAccount({...}),
    createInitializeMintInstruction(...)
  );
  
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.feePayer = publicKey;
};
```

### Token Transfer
```typescript
const transferTokens = async () => {
  const transaction = new Transaction().add(
    createTransferInstruction(
      sourceAccount,
      destAccount,
      publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    )
  );
  
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.feePayer = publicKey;
};
```

## 🔧 Troubleshooting

| Error                          | Solution |
|--------------------------------|----------|
| Transaction recentBlockhash required | Ensure every transaction sets recentBlockhash and feePayer |
| WalletNotConnectedError        | Wrap wallet calls in `if (publicKey && signTransaction)` |
| Failed to fetch token balance  | Verify token account exists with `getAccount()` |

## 🌐 Deployment

### Deploy with Vercel
```bash
npm install -g vercel
vercel
```

## 📚 Learning Resources
- [Solana Cookbook](https://solanacookbook.com/)
- [SPL Token Docs](https://spl.solana.com/)
- [Wallet Adapter Docs](https://github.com/solana-labs/wallet-adapter)

## 📝 License
MIT © 2025 [Your Name]

