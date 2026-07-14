import {
  dimensionLabels,
  type DimensionKey,
  type InterviewAnalysis,
  type NextQuestion,
} from '../../shared/contracts.js';
import {
  blockingContradictions,
  essentialDimensions,
  isReadyToBrief,
  levelPoints,
  lowestPriorityDimension,
} from './confidence.js';

const fallbackQuestions: Record<DimensionKey, string> = {
  problem: 'What specific problem should this project solve, and what happens if it is not solved?',
  audience: 'Who is the primary user, and what situation are they in when they need this?',
  outcome: 'What concrete outcome should this project create for that user?',
  scope: 'What must be included in the first usable version, and what is explicitly out of scope?',
  constraints: 'What constraints—budget, technology, privacy, or policy—must the project respect?',
  timeline: 'When does this need to be usable, and are there any immovable milestones?',
  risks: 'What could make this project fail or create harm, and what should we guard against?',
  successCriteria: 'What observable result would prove that this project succeeded?',
};

export function initialQuestion(locale: 'en' | 'th'): NextQuestion {
  return {
    text:
      locale === 'th'
        ? 'ไอเดียนี้กำลังแก้ปัญหาอะไรให้ใคร และปัจจุบันปัญหานี้ส่งผลอย่างไร?'
        : 'What problem is this idea solving, for whom, and what happens today because it is unresolved?',
    dimension: 'problem',
    rationale: 'A shared problem definition anchors every later decision.',
  };
}

export function chooseNextQuestion(
  analysis: InterviewAnalysis,
  answerCount: number,
): NextQuestion | null {
  if (isReadyToBrief(analysis, answerCount) || answerCount >= 12) return null;

  const blocker = blockingContradictions(analysis)[0];
  if (blocker) {
    return {
      text: `I found a conflict between “${blocker.statementA}” and “${blocker.statementB}”. Which should the brief treat as authoritative?`,
      dimension: analysis.nextQuestion?.dimension ?? 'scope',
      rationale: 'A blocking contradiction must be resolved before adding more scope.',
    };
  }

  const levels = new Map(
    analysis.dimensionAssessments.map((assessment) => [assessment.dimension, assessment.level]),
  );
  const missingEssential = essentialDimensions.find(
    (dimension) => levelPoints[levels.get(dimension) ?? 'missing'] < 2,
  );
  const target = missingEssential ?? lowestPriorityDimension(analysis.dimensionAssessments);

  if (analysis.nextQuestion?.dimension === target) return analysis.nextQuestion;
  if (target === 'risks' && analysis.nextQuestion?.dimension === 'risks')
    return analysis.nextQuestion;

  return {
    text: fallbackQuestions[target],
    dimension: target,
    rationale: `${dimensionLabels[target]} is currently the highest-priority information gap.`,
  };
}

export function enforceStopRules(
  analysis: InterviewAnalysis,
  answerCount: number,
): InterviewAnalysis {
  const ready = isReadyToBrief(analysis, answerCount);
  const atLimit = answerCount >= 12;
  const shouldStop = ready || atLimit;
  return {
    ...analysis,
    shouldStop,
    stopReason: ready ? 'ready' : atLimit ? 'max_questions' : 'continue',
    nextQuestion: shouldStop ? null : chooseNextQuestion(analysis, answerCount),
  };
}
