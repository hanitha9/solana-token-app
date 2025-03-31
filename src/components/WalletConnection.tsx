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

      // Get fresh blockhash for token creation
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

      // Get fresh blockhash for ATA creation
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

    setIsLoading(true);
    try {
      const transaction = new Transaction().add(
        createMintToInstruction(
          tokenMint,
          tokenAccount,
          publicKey,
          1000000000 // Minting 1 token (with 9 decimals)
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
        amount: 1,
        status: 'pending'
      }]);

      await connection.confirmTransaction(signature, 'confirmed');
      await fetchTokenBalance();

      setTransactionHistory(prev => 
        prev.map(tx => 
          tx.signature === signature ? { ...tx, status: 'confirmed' } : tx
        )
      );

      toast.success('Successfully minted 1 token!');
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
    <div className="min-h-screen bg-gray-100 p-4">
      <ToastContainer position="top-right" autoClose={5000} />
      
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Solana Token Manager</h1>
          <div className="mt-4 md:mt-0">
            <WalletMultiButton className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors" />
          </div>
        </div>

        {publicKey ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h2 className="text-lg font-semibold mb-4">Wallet Info</h2>
                <p className="text-sm text-gray-600 mb-1">Address: <span className="font-mono break-all">{publicKey.toBase58()}</span></p>
                <p className="text-sm text-gray-600">SOL Balance: <span className="font-medium">{solBalance.toFixed(6)} SOL</span></p>
                
                {tokenMint && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-600">Token Mint: <span className="font-mono break-all">{tokenMint.toBase58()}</span></p>
                    <p className="text-sm text-gray-600">Token Balance: <span className="font-medium">{tokenBalance.toFixed(6)}</span></p>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h2 className="text-lg font-semibold mb-4">Token Actions</h2>
                <div className="space-y-3">
                  <button
                    onClick={createToken}
                    disabled={isLoading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded disabled:opacity-50"
                  >
                    {isLoading ? 'Processing...' : 'Create Token'}
                  </button>
                  
                  {tokenMint && (
                    <button
                      onClick={mintTokens}
                      disabled={isLoading}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded disabled:opacity-50"
                    >
                      {isLoading ? 'Processing...' : 'Mint 1 Token'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {tokenMint && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4">Transfer Tokens</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <input
                      type="text"
                      value={recipientAddress}
                      onChange={(e) => setRecipientAddress(e.target.value)}
                      placeholder="Recipient Wallet Address"
                      className="w-full p-2 border rounded"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="Amount"
                      min="0"
                      step="0.000000001"
                      className="flex-1 p-2 border rounded"
                    />
                    <button
                      onClick={transferTokens}
                      disabled={isLoading || !transferAmount || !recipientAddress}
                      className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded disabled:opacity-50"
                    >
                      {isLoading ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <h2 className="text-lg font-semibold mb-4">Transaction History</h2>
              {transactionHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Link</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {transactionHistory.map((tx, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{tx.type}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                            {tx.amount ? tx.amount.toFixed(6) : '-'}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                            {tx.recipient ? `${tx.recipient.slice(0, 4)}...${tx.recipient.slice(-4)}` : '-'}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                            {tx.timestamp.toLocaleTimeString()}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              tx.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                              tx.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm text-blue-600">
                            <a 
                              href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="hover:underline"
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
                <p className="text-gray-500">No transactions yet</p>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">Please connect your wallet to continue</p>
          </div>
        )}
      </div>
    </div>
  );
};