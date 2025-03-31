import { Buffer } from 'buffer';

// Apply Buffer polyfill globally
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}