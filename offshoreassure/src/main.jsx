import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AssessmentProvider } from './context/AssessmentContext.jsx';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <BrowserRouter>
      <AssessmentProvider>
        <App />
      </AssessmentProvider>
    </BrowserRouter>
  </StrictMode>
);
