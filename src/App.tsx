import React from 'react';
import { WalletConnection } from './components/WalletConnection';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100">
      {/* Global toast container */}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      
      <main className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Solana Token Manager
          </h1>
          <p className="text-gray-600">
            Create, mint, and transfer custom SPL tokens
          </p>
        </header>
        
        <div className="max-w-3xl mx-auto">
          <WalletConnection />
        </div>
      </main>

      <footer className="text-center py-4 text-gray-500 text-sm">
        <p>Connected to Solana Devnet</p>
      </footer>
    </div>
  );
};

export default App;