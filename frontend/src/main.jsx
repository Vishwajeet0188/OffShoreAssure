import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import './styles.css';
import { captureUtm } from './lib/utm.js';

// The Phase 1 prototype kept sample assessments in the browser; remove them now that data comes from the API.
try { localStorage.removeItem('offshoreassure-proto-v2'); } catch { /* storage unavailable */ }

// Remember where the visitor came from (UTM tags), to record it if they sign up.
captureUtm();

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
