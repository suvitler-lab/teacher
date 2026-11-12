import "../styles/scan.css";
import {
  ended, session, recvDate, handleScan, undo, excusedAsk, startSession, loadSubs, pollSubs, startPolling, POLL_MS, RESUME_GAP_MS,
  commitStudent, submitTypedScore, lastScore, effSub, subsBox, feedback, recent, pending, hidTestOn, hidLog, testHid,
} from "../components/scan/state";
import { SessionSetup } from "../components/scan/SessionSetup";
import { ScanView } from "../components/scan/ScanView";
import { ScanSummary } from "../components/scan/RoundSummary";

// The scan page is split into src/components/scan/*: state.ts (the round controller — plain functions over signals),
// SessionSetup (pick work / room / how to score), ScanView (the round), RoundSummary (end of round), ScanSummary (TV view), ScanParts, widgets.
export { startSetupRefresh } from "../components/scan/state";

export function ScanPage() {
  if (ended.value) return <ScanSummary s={ended.value} />;
  if (!session.value) return <SessionSetup />;
  return <ScanView />;
}

// Test seam: the round controller is plain functions over signals, so a test can drive it without rendering.
export const __scan = { ended, recvDate, handleScan, undo, excusedAsk, startSession, loadSubs, pollSubs, startPolling, POLL_MS, RESUME_GAP_MS, commitStudent, submitTypedScore, lastScore, effSub, session, subsBox, feedback, recent, pending, hidTestOn, hidLog, testHid };
