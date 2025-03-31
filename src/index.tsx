import React from 'react';
import { createRoot } from 'react-dom/client';
import { Buffer } from 'buffer';
import './index.css';
import App from './App';
import { WalletContext } from './WalletContext';

// Add this to ensure proper typing
declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}
// Global polyfills
window.Buffer = Buffer;

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <WalletContext>
      <App />
    </WalletContext>
  </React.StrictMode>
);
