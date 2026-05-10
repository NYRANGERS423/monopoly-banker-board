import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          background: '#1a2030',
          color: '#e6ebf2',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
        },
      }}
    />
  </StrictMode>,
);
