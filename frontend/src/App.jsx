import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import PublicLayout from './components/layout/PublicLayout.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import Home from './pages/site/Home.jsx';
import HowItWorks from './pages/site/HowItWorks.jsx';
import Solutions from './pages/site/Solutions.jsx';
import About from './pages/site/About.jsx';
import AdminFeedback from './pages/admin/AdminFeedback.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import CompleteProfile from './pages/CompleteProfile.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Requirements from './pages/Requirements.jsx';
import RequirementForm from './pages/RequirementForm.jsx';
import StagePage from './pages/StagePage.jsx';
import VendorSelection, { VendorSelectionList } from './pages/VendorSelection.jsx';
import VendorAssessments from './pages/vendor/VendorAssessments.jsx';
import VendorQuestionnaire from './pages/vendor/VendorQuestionnaire.jsx';
import Compliance, { ComplianceList } from './pages/Compliance.jsx';
import ContractAnalysis, { ContractList } from './pages/ContractAnalysis.jsx';
import Obligations, { ObligationsList } from './pages/Obligations.jsx';
import Transfers, { TransfersList } from './pages/Transfers.jsx';
import VendorObligations, { VendorObligationsList } from './pages/vendor/VendorObligations.jsx';
import Organisation from './pages/Organisation.jsx';
import RegisteredUsers from './pages/admin/RegisteredUsers.jsx';
import AdminLayout from './components/admin/AdminLayout.jsx';
import AdminOverview from './pages/admin/AdminOverview.jsx';
import AdminUserDetail from './pages/admin/AdminUserDetail.jsx';
import AuditLog from './pages/admin/AuditLog.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';
import Buyers from './pages/admin/Buyers.jsx';
import AdminTeam from './pages/admin/AdminTeam.jsx';
import ComingStage from './pages/admin/ComingStage.jsx';
import AdminAssessments, { AdminAssessmentDetail } from './pages/admin/AdminAssessments.jsx';
import AdminVendors, { AdminVendorDetail } from './pages/admin/AdminVendors.jsx';
import VendorDashboard from './pages/vendor/VendorDashboard.jsx';
import VendorProfile from './pages/vendor/VendorProfile.jsx';
import VendorStagePage from './pages/vendor/VendorStagePage.jsx';
import { RequireAuth, RequireAdminArea, RequireSignedIn, RequireVendorArea } from './components/auth/Guards.jsx';

/* New page → top of the window. */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return undefined; }
    // "/#feedback" etc.: scroll to the section once the page has rendered (below the fixed navigation bar).
    const t = setTimeout(() => {
      const el = document.getElementById(hash.slice(1)); const nav = document.getElementById('lp-nav');
      if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - (nav ? nav.offsetHeight : 0) - 8) });
    }, 60);
    return () => clearTimeout(t);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="solutions" element={<Solutions />} />
          <Route path="about" element={<About />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="complete-profile" element={<RequireSignedIn><CompleteProfile /></RequireSignedIn>} />
        </Route>
        {/* Buyer workspace: signed-in buyer with a completed profile (Stage 0). */}
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="requirements" element={<Requirements />} />
          <Route path="requirements/:id" element={<RequirementForm />} />
          <Route path="stage/:slug" element={<StagePage />} />
          <Route path="organisation" element={<Organisation />} />
          <Route path="vendor-selection" element={<VendorSelectionList />} />
          <Route path="vendor-selection/:ref" element={<VendorSelection />} />
          <Route path="compliance" element={<ComplianceList />} />
          <Route path="compliance/:ref" element={<Compliance />} />
          <Route path="contract" element={<ContractList />} />
          <Route path="contract/:ref" element={<ContractAnalysis />} />
          <Route path="obligations" element={<ObligationsList />} />
          <Route path="obligations/:ref" element={<Obligations />} />
          <Route path="transfers" element={<TransfersList />} />
          <Route path="transfers/:ref" element={<Transfers />} />
        </Route>
        {/* Vendor (supplier) portal */}
        <Route path="vendor" element={<RequireVendorArea><AppLayout portal="vendor" /></RequireVendorArea>}>
          <Route index element={<VendorDashboard />} />
          <Route path="profile" element={<VendorProfile />} />
          <Route path="assessments" element={<VendorAssessments />} />
          <Route path="assessments/:ref" element={<VendorQuestionnaire />} />
          <Route path="obligations" element={<VendorObligationsList />} />
          <Route path="obligations/:ref" element={<VendorObligations />} />
          <Route path="stage/:slug" element={<VendorStagePage />} />
        </Route>
        {/* Old prototype addresses */}
        <Route path="assessments" element={<Navigate to="/requirements" replace />} />
        <Route path="assessment/*" element={<Navigate to="/requirements" replace />} />
        <Route path="suppliers" element={<Navigate to="/dashboard" replace />} />
        <Route path="settings/*" element={<Navigate to="/dashboard" replace />} />
        {/* OffshoreAssure admin console: separate workspace, admins only */}
        <Route path="admin" element={<RequireAdminArea><AdminLayout /></RequireAdminArea>}>
          <Route index element={<AdminOverview />} />
          <Route path="users" element={<RegisteredUsers />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="buyers" element={<Buyers />} />
          <Route path="team" element={<AdminTeam />} />
          <Route path="feedback" element={<AdminFeedback />} />
          <Route path="assessments" element={<AdminAssessments />} />
          <Route path="assessments/:ref" element={<AdminAssessmentDetail />} />
          <Route path="vendors" element={<AdminVendors />} />
          <Route path="vendors/:id" element={<AdminVendorDetail />} />
          <Route path="suppliers" element={<Navigate to="/admin/vendors" replace />} />
          {['evidence', 'reports', 'rules'].map(k => <Route key={k} path={k} element={<ComingStage page={k} />} />)}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
