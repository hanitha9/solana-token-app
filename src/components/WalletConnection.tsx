import React, { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAccount,
  createTransferInstruction,
} from '@solana/spl-token';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface TransactionHistory {
  type: string;
  signature: string;
  timestamp: Date;
  amount?: number;
  recipient?: string;
  status: 'pending' | 'confirmed' | 'failed';
  tokenName?: string; // Added token name to transaction history
}

const tabs = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'studio', label: 'Studio', icon: '⚒️' },
  { id: 'transfer', label: 'Transfer', icon: '✈️' },
  { id: 'history', label: 'History', icon: '📜' },
];

export const WalletConnection: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [activeTab, setActiveTab] = useState('overview');
  const [solBalance, setSolBalance] = useState<number>(0);
  const [tokenMint, setTokenMint] = useState<PublicKey | null>(null);
  const [tokenAccount, setTokenAccount] = useState<PublicKey | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [mintAmount, setMintAmount] = useState<string>('');
  const [tokenName, setTokenName] = useState<string>(''); // New state for token name
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [transactionHistory, setTransactionHistory] = useState<TransactionHistory[]>([]);

  // ... (keep all existing utility functions like fetchSolBalance, fetchTokenBalance, etc.)

  const createToken = async () => {
    if (!publicKey || !signTransaction) {
      toast.error('Wallet not connected');
      return;
    }
    
    if (!tokenName) {
      toast.error('Please enter a token name');
      return;
    }

    setIsLoading(true);
    try {
      const mintKeypair = Keypair.generate();
      const lamports = await getMinimumBalanceForRentExemptMint(connection);
      const { blockhash: recentBlockhash } = await connection.getLatestBlockhash();
      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          9,
          publicKey,
          publicKey,
          TOKEN_PROGRAM_ID
        )
      );
      transaction.recentBlockhash = recentBlockhash;
      transaction.feePayer = publicKey;
      const signed = await signTransaction(transaction);
      signed.partialSign(mintKeypair);
      const signature = await connection.sendRawTransaction(signed.serialize());

      setTransactionHistory(prev => [...prev, { 
        type: 'Token Creation', 
        signature, 
        timestamp: new Date(), 
        status: 'pending',
        tokenName // Include token name in history
      }]);

      await connection.confirmTransaction(signature, 'confirmed');
      const ata = await getAssociatedTokenAddress(mintKeypair.publicKey, publicKey);
      const { blockhash: ataBlockhash } = await connection.getLatestBlockhash();
      const ataTransaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mintKeypair.publicKey)
      );
      ataTransaction.recentBlockhash = ataBlockhash;
      ataTransaction.feePayer = publicKey;
      const signedAta = await signTransaction(ataTransaction);
      const ataSignature = await connection.sendRawTransaction(signedAta.serialize());
      await connection.confirmTransaction(ataSignature, 'confirmed');

      setTokenMint(mintKeypair.publicKey);
      setTokenAccount(ata);
      await fetchTokenBalance();
      setTransactionHistory(prev => prev.map(tx => 
        tx.signature === signature ? { ...tx, status: 'confirmed' } : tx
      ));
      toast.success(`"${tokenName}" token created successfully!`);
      setTokenName(''); // Reset token name after creation
    } catch (error) {
      toast.error(`Token creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTransactionHistory(prev => prev.map(tx => 
        tx.type === 'Token Creation' ? { ...tx, status: 'failed' } : tx
      ));
    } finally {
      setIsLoading(false);
    }
  };

  // ... (keep all other functions like mintTokens, transferTokens unchanged)

  return (
    <div className="min-h-screen min-w-screen bg-gradient-to-br from-gray-900 via-indigo-900 to-purple-900 flex flex-col overflow-hidden">
      {/* ... (keep all existing ToastContainer and header code) */}

      {/* Studio Tab Content - Updated with Token Name Input */}
      {activeTab === 'studio' && (
        <div className="h-full bg-gray-800/50 backdrop-blur-lg rounded-2xl p-6 md:p-8 shadow-xl border border-gray-700/20 animate-scale-in">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Token Studio</h2>
          <div className="space-y-6 h-[calc(100%-3rem)] flex flex-col">
            {!tokenMint ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">Token Name</label>
                  <input
                    type="text"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="My Awesome Token"
                    className="w-full p-3 bg-gray-900/50 border border-gray-700/50 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                  />
                </div>
                <button
                  onClick={createToken}
                  disabled={isLoading || !tokenName}
                  className={`w-full py-3 px-4 rounded-full font-semibold text-white transition-all duration-300 ${
                    isLoading || !tokenName ? 'bg-gray-600/50 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 shadow-md hover:shadow-lg'
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating...
                    </span>
                  ) : (
                    'Create Token'
                  )}
                </button>
              </>
            ) : (
              <>
                <div className="p-4 bg-gray-900/30 rounded-lg">
                  <p className="text-sm opacity-70">Token Name</p>
                  <p className="text-xl font-semibold mt-1">{tokenName || 'Unnamed Token'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">Mint Amount</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={mintAmount}
                      onChange={(e) => setMintAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.000000001"
                      className="w-full p-3 bg-gray-900/50 border border-gray-700/50 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60">Tokens</span>
                  </div>
                </div>
                <button
                  onClick={mintTokens}
                  disabled={isLoading || !mintAmount}
                  className={`w-full py-3 px-4 rounded-full font-semibold text-white transition-all duration-300 ${
                    isLoading || !mintAmount ? 'bg-gray-600/50 cursor-not-allowed' : 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 shadow-md hover:shadow-lg'
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Minting...
                    </span>
                  ) : (
                    'Mint Tokens'
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Update Transaction History Table to Show Token Name */}
      {activeTab === 'history' && (
        <div className="h-full bg-gray-800/50 backdrop-blur-lg rounded-2xl p-6 md:p-8 shadow-xl border border-gray-700/20 animate-fade-in">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Transaction History</h2>
          <div className="h-[calc(100%-3rem)] overflow-y-auto">
            {transactionHistory.length > 0 ? (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-white">
                  <thead className="sticky top-0 bg-gray-800/70">
                    <tr className="text-left text-sm opacity-70 border-b border-gray-700/50">
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Token</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Recipient</th>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionHistory.map((tx, index) => (
                      <tr key={index} className="hover:bg-gray-700/30 transition-all duration-200">
                        <td className="py-3 px-4">{tx.type}</td>
                        <td className="py-3 px-4">{tx.tokenName || '-'}</td>
                        <td className="py-3 px-4">{tx.amount ? tx.amount.toFixed(6) : '-'}</td>
                        <td className="py-3 px-4 font-mono">{tx.recipient ? `${tx.recipient.slice(0, 4)}...${tx.recipient.slice(-4)}` : '-'}</td>
                        <td className="py-3 px-4">{tx.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            tx.status === 'confirmed' ? 'bg-green-500/20 text-green-300' : 
                            tx.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300' : 
                            'bg-red-500/20 text-red-300'
                          }`}>
                            {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <a href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`} 
                             target="_blank" 
                             rel="noopener noreferrer" 
                             className="text-indigo-400 hover:text-indigo-300 transition-colors">
                            View
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <svg className="mx-auto h-20 w-20 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="mt-4 text-xl font-bold text-white">No Transactions Yet</h3>
                  <p className="mt-2 text-white/70">Start by creating or minting some tokens!</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ... (keep all other existing code) */}
    </div>
  );
};
