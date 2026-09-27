import { useContext } from 'react';
import { AssessmentContext } from '../context/AssessmentContext.jsx';

/* Returns { S, a, D, route, me, act }:
   S = stored prototype state, a = current assessment (or null), D = engine output for it (compute(a)),
   route = { view, assessmentId, segment }, me = signed-in demo user, act = state actions. */
export function useAssessment() {
  const ctx = useContext(AssessmentContext);
  if (!ctx) throw new Error('useAssessment must be used inside <AssessmentProvider>');
  return ctx;
}
