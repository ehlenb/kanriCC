import type { VercelRequest, VercelResponse } from "@vercel/node";

import advancedSearch from "../lib/ai-handlers/advanced-search.js";
import applyCandidateNotes from "../lib/ai-handlers/apply-candidate-notes.js";
import batchCvSend from "../lib/ai-handlers/batch-cv-send.js";
import callPriority from "../lib/ai-handlers/call-priority.js";
import ccmFeedbackBrief from "../lib/ai-handlers/ccm-feedback-brief.js";
import ccmNextStep from "../lib/ai-handlers/ccm-next-step.js";
import chatEnrichClient from "../lib/ai-handlers/chat-enrich-client.js";
import clientDraft from "../lib/ai-handlers/client-draft.js";
import clientMeetingPrep from "../lib/ai-handlers/client-meeting-prep.js";
import clientRejectionDiagnosis from "../lib/ai-handlers/client-rejection-diagnosis.js";
import clientSnapshot from "../lib/ai-handlers/client-snapshot.js";
import closingScript from "../lib/ai-handlers/closing-script.js";
import competingAnalysis from "../lib/ai-handlers/competing-analysis.js";
import competingBrief from "../lib/ai-handlers/competing-brief.js";
import dailyAgenda from "../lib/ai-handlers/daily-agenda.js";
import enrichClient from "../lib/ai-handlers/enrich-client.js";
import extractCandidate from "../lib/ai-handlers/extract-candidate.js";
import extractCompensation from "../lib/ai-handlers/extract-compensation.js";
import extractConditions from "../lib/ai-handlers/extract-conditions.js";
import extractContract from "../lib/ai-handlers/extract-contract.js";
import extractReqFields from "../lib/ai-handlers/extract-req-fields.js";
import formatInterviewNotes from "../lib/ai-handlers/format-interview-notes.js";
import inferStatus from "../lib/ai-handlers/infer-status.js";
import interviewPrep from "../lib/ai-handlers/interview-prep.js";
import inviteRecallBot from "../lib/ai-handlers/invite-recall-bot.js";
import jobSpecMessage from "../lib/ai-handlers/job-spec-message.js";
import matchCandidates from "../lib/ai-handlers/match-candidates.js";
import mergeStrategyNotes from "../lib/ai-handlers/merge-strategy-notes.js";
import placedCheckinMessage from "../lib/ai-handlers/placed-checkin-message.js";
import polishCallNotes from "../lib/ai-handlers/polish-call-notes.js";
import positioning from "../lib/ai-handlers/positioning.js";
import preCallBriefing from "../lib/ai-handlers/pre-call-briefing.js";
import processTranscript from "../lib/ai-handlers/process-transcript.js";
import refreshContext from "../lib/ai-handlers/refresh-context.js";
import rejectionEmail from "../lib/ai-handlers/rejection-email.js";
import reqStrategicContext from "../lib/ai-handlers/req-strategic-context.js";
import specEmail from "../lib/ai-handlers/spec-email.js";
import submissionNote from "../lib/ai-handlers/submission-note.js";
import translate from "../lib/ai-handlers/translate.js";
import updateClientStrategy from "../lib/ai-handlers/update-client-strategy.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

const routes: Record<string, Handler> = {
  "advanced-search": advancedSearch,
  "apply-candidate-notes": applyCandidateNotes,
  "batch-cv-send": batchCvSend,
  "call-priority": callPriority,
  "ccm-feedback-brief": ccmFeedbackBrief,
  "ccm-next-step": ccmNextStep,
  "chat-enrich-client": chatEnrichClient,
  "client-draft": clientDraft,
  "client-meeting-prep": clientMeetingPrep,
  "client-rejection-diagnosis": clientRejectionDiagnosis,
  "client-snapshot": clientSnapshot,
  "closing-script": closingScript,
  "competing-analysis": competingAnalysis,
  "competing-brief": competingBrief,
  "daily-agenda": dailyAgenda,
  "enrich-client": enrichClient,
  "extract-candidate": extractCandidate,
  "extract-compensation": extractCompensation,
  "extract-conditions": extractConditions,
  "extract-contract": extractContract,
  "extract-req-fields": extractReqFields,
  "format-interview-notes": formatInterviewNotes,
  "infer-status": inferStatus,
  "interview-prep": interviewPrep,
  "invite-recall-bot": inviteRecallBot,
  "job-spec-message": jobSpecMessage,
  "match-candidates": matchCandidates,
  "merge-strategy-notes": mergeStrategyNotes,
  "placed-checkin-message": placedCheckinMessage,
  "polish-call-notes": polishCallNotes,
  "positioning": positioning,
  "pre-call-briefing": preCallBriefing,
  "process-transcript": processTranscript,
  "refresh-context": refreshContext,
  "rejection-email": rejectionEmail,
  "req-strategic-context": reqStrategicContext,
  "spec-email": specEmail,
  "submission-note": submissionNote,
  "translate": translate,
  "update-client-strategy": updateClientStrategy,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const type = req.query.type as string | undefined;
  if (!type) return res.status(400).json({ error: "Missing ?type= param" });

  const fn = routes[type];
  if (!fn) return res.status(404).json({ error: `Unknown AI type: ${type}` });

  return fn(req, res);
}
