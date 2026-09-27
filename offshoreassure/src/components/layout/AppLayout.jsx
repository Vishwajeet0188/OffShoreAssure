import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from '../common/ErrorBoundary.jsx';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { Toast } from '../common/Blocks.jsx';
import { STAGES } from '../../lib/constants.js';
import { useAssessment } from '../../hooks/useAssessment.js';
import { AssessmentFrame, EmptyStage } from './AssessmentFrame.jsx';

/* Signed-in application shell: sidebar, top bar and the routed page. */
export default function AppLayout() {
  const { pathname } = useLocation();
  return (
    <>
      <div className="app">
        <Sidebar />
        <div className="main">
          <Topbar />
          <main className="content" id="content"><ErrorBoundary resetKey={pathname}><Outlet /></ErrorBoundary></main>
        </div>
      </div>
      <Toast />
    </>
  );
}

/* Wraps an assessment stage page: gated on the earlier stages, framed by the header and assurance path. */
export function StageRoute({ stage, children }) {
  const { a } = useAssessment();
  const st = STAGES.find(x => x.id === stage);
  if (!st.ok(a)) return <EmptyStage stage={st} />;
  return <AssessmentFrame>{children}</AssessmentFrame>;
}
