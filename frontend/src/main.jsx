import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import './styles.css';

// The Phase 1 prototype kept sample assessments in the browser; remove them now that data comes from the API.
try { localStorage.removeItem('offshoreassure-proto-v2'); } catch { /* storage unavailable */ }

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
