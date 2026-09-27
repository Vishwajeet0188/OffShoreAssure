import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import PublicLayout from './components/layout/PublicLayout.jsx';
import AppLayout, { StageRoute } from './components/layout/AppLayout.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Suppliers from './pages/Suppliers.jsx';
import Assessments from './pages/Assessments.jsx';
import RuleBase from './pages/RuleBase.jsx';
import Assessment from './pages/Assessment.jsx';
import Requirements from './pages/Requirements.jsx';
import Compliance from './pages/Compliance.jsx';
import Contract from './pages/Contract.jsx';
import Obligations from './pages/Obligations.jsx';
import RuleMapping from './pages/RuleMapping.jsx';
import DataTransfer from './pages/DataTransfer.jsx';
import DeliveryAssurance from './pages/DeliveryAssurance.jsx';
import Risk from './pages/Risk.jsx';
import Actions from './pages/Actions.jsx';
import Evidence from './pages/Evidence.jsx';
import AuditTrail from './pages/AuditTrail.jsx';
import FinalAssessment from './pages/FinalAssessment.jsx';
import Reports from './pages/Reports.jsx';

/* New page → top of the window (tab switches within a page keep the scroll position). */
function ScrollToTop() {
  const { pathname, state } = useLocation();
  useEffect(() => { if (!(state && state.lpTarget)) window.scrollTo(0, 0); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* Assessment stage routes: /assessment/:assessmentId[/segment]. Each stage is gated on the one before it. */
const STAGE_ROUTES = [
  ['', 'setup', Assessment], ['requirements', 'reqs', Requirements], ['compliance', 'compliance', Compliance],
  ['contract', 'contract', Contract], ['obligations', 'obligations', Obligations], ['rule-mapping', 'mapping', RuleMapping],
  ['data-transfer', 'transfer', DataTransfer], ['delivery', 'delivery', DeliveryAssurance], ['risk', 'risk', Risk],
  ['actions', 'actions', Actions], ['evidence', 'evidence', Evidence], ['audit-trail', 'evidence', AuditTrail],
  ['final-assessment', 'final', FinalAssessment], ['reports', 'final', Reports]
];

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
        </Route>
        <Route element={<AppLayout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="assessments" element={<Assessments />} />
          <Route path="settings/rules" element={<RuleBase />} />
          <Route path="assessment/:assessmentId">
            {STAGE_ROUTES.map(([seg, stage, Page]) => seg
              ? <Route key={seg} path={seg} element={<StageRoute stage={stage}><Page /></StageRoute>} />
              : <Route key="index" index element={<StageRoute stage={stage}><Page /></StageRoute>} />)}
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
