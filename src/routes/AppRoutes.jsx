import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Home from '../pages/Home/Home';
import BuyerLogin from '../pages/BuyerLogin/BuyerLogin';
import BuyerRegistration from '../pages/BuyerRegistration/BuyerRegistration';
import BuyerDashboard from '../pages/BuyerDashboard/BuyerDashboard';
import VendorDiscovery from '../pages/VendorDiscovery/VendorDiscovery';
import VendorProfile from '../pages/VendorProfile/VendorProfile';
import VendorAssessment from '../pages/VendorAssessment/VendorAssessment';
import ComplianceAssessment from '../pages/VendorAssessment/ComplianceAssessment';
import ContractAssessment from '../pages/VendorAssessment/ContractAssessment';
import DataTransferAssessment from '../pages/VendorAssessment/DataTransfer';
import DeliveryAssurance from '../pages/VendorAssessment/DeliveryAssurance';
import GovernanceEvidence from '../pages/VendorAssessment/GovernanceEvidence';
import FinalAssessment from '../pages/VendorAssessment/FinalAssessment';



function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/buyer/login" element={<BuyerLogin />}/>

        <Route path="/buyer/register" element={<BuyerRegistration />} />

        <Route path="/buyer/dashboard" element={<BuyerDashboard/>}/>

        <Route path="/vendors" element={<VendorDiscovery />}/>

        <Route path="/vendors/:vendorId" element={<VendorProfile />}/>

        <Route path="/vendors/:vendorId/assessment" element={<VendorAssessment />}/>

        <Route path="/vendors/:vendorId/compliance" element={<ComplianceAssessment />}/>

        <Route path="/vendors/:vendorId/contract" element={<ContractAssessment />}/>

        <Route path="/vendors/:vendorId/data-transfer" element={<DataTransferAssessment />}/>

        <Route path="/vendors/:vendorId/delivery" element={<DeliveryAssurance />}/>

        <Route path="/vendors/:vendorId/evidence" element={<GovernanceEvidence />}/>

        <Route path="/vendors/:vendorId/final-assessment" element={<FinalAssessment />}/>

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRoutes