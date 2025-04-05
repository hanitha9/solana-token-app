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
}

export const WalletConnection: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [solBalance, setSolBalance] = useState<number>(0);
  const [tokenMint, setTokenMint] = useState<PublicKey | null>(null);
  const [tokenAccount, setTokenAccount] = useState<PublicKey | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [mintAmount, setMintAmount] = useState<string>(''); // User-specified mint amount
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [transactionHistory, setTransactionHistory] = useState<TransactionHistory[]>([]);

  const fetchSolBalance = useCallback(async () => {
    if (!publicKey) return;
    try {
      const balance = await connection.getBalance(publicKey);
      setSolBalance(balance / 1e9);
    } catch (error) {
      toast.error(`Failed to fetch balance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [publicKey, connection]);

  const fetchTokenBalance = useCallback(async () => {
    if (!publicKey || !tokenAccount) return;
    try {
      const accountInfo = await getAccount(connection, tokenAccount);
      setTokenBalance(Number(accountInfo.amount) / 1e9);
    } catch {
      setTokenBalance(0);
    }
  }, [publicKey, tokenAccount, connection]);

  useEffect(() => {
    const interval = setInterval(fetchSolBalance, 15000);
    fetchSolBalance();
    return () => clearInterval(interval);
  }, [fetchSolBalance]);

  useEffect(() => {
    fetchTokenBalance();
  }, [fetchTokenBalance]);

  const createToken = async () => {
    if (!publicKey || !signTransaction) {
      toast.error('Wallet not connected');
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
        status: 'pending'
      }]);

      await connection.confirmTransaction(signature, 'confirmed');
      
      const ata = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        publicKey
      );

      const { blockhash: ataBlockhash } = await connection.getLatestBlockhash();
      const ataTransaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          publicKey,
          ata,
          publicKey,
          mintKeypair.publicKey
        )
      );

      ataTransaction.recentBlockhash = ataBlockhash;
      ataTransaction.feePayer = publicKey;

      const signedAta = await signTransaction(ataTransaction);
      const ataSignature = await connection.sendRawTransaction(signedAta.serialize());
      await connection.confirmTransaction(ataSignature, 'confirmed');

      setTokenMint(mintKeypair.publicKey);
      setTokenAccount(ata);
      await fetchTokenBalance();

      setTransactionHistory(prev => 
        prev.map(tx => 
          tx.signature === signature ? { ...tx, status: 'confirmed' } : tx
        )
      );

      toast.success('Token created successfully!');
    } catch (error) {
      toast.error(`Token creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTransactionHistory(prev => 
        prev.map(tx => 
          tx.type === 'Token Creation' ? { ...tx, status: 'failed' } : tx
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const mintTokens = async () => {
    if (!publicKey || !signTransaction || !tokenMint || !tokenAccount) {
      toast.error('Missing required parameters');
      return;
    }

    const amount = parseFloat(mintAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount greater than 0');
      return;
    }

    setIsLoading(true);
    try {
      const transaction = new Transaction().add(
        createMintToInstruction(
          tokenMint,
          tokenAccount,
          publicKey,
          BigInt(Math.floor(amount * 1e9))
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signed = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize());

      setTransactionHistory(prev => [...prev, {
        type: 'Token Mint',
        signature,
        timestamp: new Date(),
        amount: amount,
        status: 'pending'
      }]);

      await connection.confirmTransaction(signature, 'confirmed');
      await fetchTokenBalance();

      setTransactionHistory(prev => 
        prev.map(tx => 
          tx.signature === signature ? { ...tx, status: 'confirmed' } : tx
        )
      );

      toast.success(`Successfully minted ${amount} tokens!`);
      setMintAmount('');
    } catch (error) {
      toast.error(`Failed to mint tokens: ${error instanceof Error ? error.message : String(error)}`);
      setTransactionHistory(prev => 
        prev.map(tx => 
          tx.type === 'Token Mint' ? { ...tx, status: 'failed' } : tx
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const transferTokens = async () => {
    if (!publicKey || !signTransaction || !tokenMint || !tokenAccount || !recipientAddress || !transferAmount) {
      toast.error('Please connect wallet and fill all fields');
      return;
    }

    const amount = parseFloat(transferAmount);
    if (isNaN(amount)) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (amount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }

    if (amount > tokenBalance) {
      toast.error(`Insufficient balance. You only have ${tokenBalance} tokens`);
      return;
    }

    setIsLoading(true);
    try {
      const recipientPubkey = new PublicKey(recipientAddress);
      const recipientTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        recipientPubkey
      );

      const transaction = new Transaction();

      try {
        await getAccount(connection, recipientTokenAccount);
      } catch {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            recipientTokenAccount,
            recipientPubkey,
            tokenMint
          )
        );
      }

      transaction.add(
        createTransferInstruction(
          tokenAccount,
          recipientTokenAccount,
          publicKey,
          BigInt(Math.floor(amount * 1e9)),
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signed = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize());

      setTransactionHistory(prev => [...prev, {
        type: 'Token Transfer',
        signature,
        timestamp: new Date(),
        amount: amount,
        recipient: recipientAddress,
        status: 'pending'
      }]);

      await connection.confirmTransaction(signature, 'confirmed');
      await fetchTokenBalance();

      setTransactionHistory(prev => 
        prev.map(tx => 
          tx.signature === signature ? { ...tx, status: 'confirmed' } : tx
        )
      );

      toast.success(`Transferred ${amount} tokens successfully!`);
      setTransferAmount('');
    } catch (error) {
      toast.error(`Transfer failed: ${error instanceof Error ? error.message : String(error)}`);
      setTransactionHistory(prev => 
        prev.map(tx => 
          tx.type === 'Token Transfer' ? { ...tx, status: 'failed' } : tx
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-6 font-sans">
      <ToastContainer 
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
        toastStyle={{
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          color: '#fff'
        }}
      />
      
      <div className="max-w-7xl mx-auto">
        <header className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-t-3xl shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-center md:text-left">
              <h1 className="text-4xl font-extrabold text-white tracking-tight">
                Solana Token Studio
              </h1>
              <p className="mt-2 text-indigo-100 text-lg">
                Craft, mint, and manage your SPL tokens with ease
              </p>
            </div>
            <WalletMultiButton 
              className="!bg-gradient-to-r !from-indigo-500 !to-purple-500 hover:!from-indigo-600 hover:!to-purple-600 !text-white !font-semibold !py-3 !px-8 !rounded-full !transition-all !shadow-md hover:!shadow-lg"
            />
          </div>
        </header>

        <main className="mt-6">
          {publicKey ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-xl border border-white/20">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                  Wallet Overview
                </h2>
                <div className="space-y-4 text-white">
                  <div>
                    <p className="text-sm opacity-70">Address</p>
                    <p className="font-mono text-sm bg-black/20 p-2 rounded-lg mt-1 break-all">
                      {publicKey.toBase58()}
                    </p>
                  </div>
                  <div className="flex justify-between items-center py-2 border-t border-white/10">
                    <p className="text-sm opacity-70">SOL Balance</p>
                    <p className="font-semibold">{solBalance.toFixed(6)} SOL</p>
                  </div>
                  {tokenMint && (
                    <>
                      <div className="py-2 border-t border-white/10">
                        <p className="text-sm opacity-70">Token Mint</p>
                        <p className="font-mono text-sm bg-black/20 p-2 rounded-lg mt-1 break-all">
                          {tokenMint.toBase58()}
                        </p>
                      </div>
                      <div className="flex justify-between items-center py-2 border-t border-white/10">
                        <p className="text-sm opacity-70">Token Balance</p>
                        <p className="font-semibold">{tokenBalance.toFixed(6)}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-xl border border-white/20">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse"></span>
                  Token Studio
                </h2>
                <div className="space-y-6">
                  <button
                    onClick={createToken}
                    disabled={isLoading}
                    className={`w-full py-3 px-4 rounded-full font-semibold text-white transition-all duration-300 ${
                      isLoading
                        ? 'bg-gray-600/50 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 shadow-md hover:shadow-lg'
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
                  
                  {tokenMint && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-white/80 mb-1">
                          Mint Amount
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={mintAmount}
                            onChange={(e) => setMintAmount(e.target.value)}
                            placeholder="0.00"
                            min="0"
                            step="0.000000001"
                            className="w-full p-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60">
                            Tokens
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={mintTokens}
                        disabled={isLoading || !mintAmount}
                        className={`w-full py-3 px-4 rounded-full font-semibold text-white transition-all duration-300 ${
                          isLoading || !mintAmount
                            ? 'bg-gray-600/50 cursor-not-allowed'
                            : 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 shadow-md hover:shadow-lg'
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
                    </div>
                  )}
                </div>
              </div>

              {tokenMint && (
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-xl border border-white/20">
                  <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2 animate-pulse"></span>
                    Transfer Tokens
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">
                        Recipient Address
                      </label>
                      <input
                        type="text"
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        placeholder="Enter wallet address"
                        className="w-full p-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">
                        Amount
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="0.000000001"
                          className="w-full p-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60">
                          Tokens
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={transferTokens}
                      disabled={isLoading || !transferAmount || !recipientAddress}
                      className={`w-full py-3 px-4 rounded-full font-semibold text-white transition-all duration-300 ${
                        isLoading || !transferAmount || !recipientAddress
                          ? 'bg-gray-600/50 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-md hover:shadow-lg'
                      }`}
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Sending...
                        </span>
                      ) : (
                        'Send Tokens'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-white/20 text-center">
              <svg
                className="mx-auto h-20 w-20 text-white/50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <h3 className="mt-6 text-2xl font-bold text-white">Connect Your Wallet</h3>
              <p className="mt-3 text-white/70">
                Link your Solana wallet to start managing your tokens.
              </p>
              <div className="mt-8">
                <WalletMultiButton 
                  className="!bg-gradient-to-r !from-indigo-500 !to-purple-500 hover:!from-indigo-600 hover:!to-purple-600 !text-white !font-semibold !py-3 !px-8 !rounded-full !transition-all !shadow-md hover:!shadow-lg"
                />
              </div>
            </div>
          )}

          {publicKey && (
            <div className="mt-6 bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-xl border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                <span className="w-2 h-2 bg-purple-400 rounded-full mr-2 animate-pulse"></span>
                Transaction History
              </h2>
              {transactionHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-white">
                    <thead>
                      <tr className="text-left text-sm opacity-70 border-b border-white/10">
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Recipient</th>
                        <th className="py-3 px-4">Time</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactionHistory.map((tx, index) => (
                        <tr key={index} className="hover:bg-white/5 transition-all duration-200">
                          <td className="py-3 px-4">{tx.type}</td>
                          <td className="py-3 px-4">{tx.amount ? tx.amount.toFixed(6) : '-'}</td>
                          <td className="py-3 px-4 font-mono">
                            {tx.recipient ? `${tx.recipient.slice(0, 4)}...${tx.recipient.slice(-4)}` : '-'}
                          </td>
                          <td className="py-3 px-4">
                            {tx.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              tx.status === 'confirmed' 
                                ? 'bg-green-500/20 text-green-300'
                                : tx.status === 'pending'
                                ? 'bg-yellow-500/20 text-yellow-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}>
                              {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <a
                              href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              View
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg
                    className="mx-auto h-20 w-20 text-white/50"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3 className="mt-4 text-xl font-bold text-white">No Transactions Yet</h3>
                  <p className="mt-2 text-white/70">
                    Start by creating or minting some tokens!
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
