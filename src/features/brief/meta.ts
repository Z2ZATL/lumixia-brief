import type { BriefSections, DimensionKey } from '../../../shared/contracts';
import type { MessageKey } from '../../i18n';

export interface BriefSectionMeta {
  key: keyof BriefSections;
  labelKey: MessageKey;
  mode: 'text' | 'list';
}

export const briefSections: BriefSectionMeta[] = [
  { key: 'summary', labelKey: 'sectionSummary', mode: 'text' },
  { key: 'problemStatement', labelKey: 'sectionProblem', mode: 'text' },
  { key: 'goals', labelKey: 'sectionGoals', mode: 'list' },
  { key: 'successCriteria', labelKey: 'sectionSuccess', mode: 'list' },
  { key: 'audience', labelKey: 'sectionAudience', mode: 'list' },
  { key: 'deliverables', labelKey: 'sectionDeliverables', mode: 'list' },
  { key: 'mustHave', labelKey: 'sectionMustHave', mode: 'list' },
  { key: 'niceToHave', labelKey: 'sectionNiceToHave', mode: 'list' },
  { key: 'nonGoals', labelKey: 'sectionNonGoals', mode: 'list' },
  { key: 'constraints', labelKey: 'sectionConstraints', mode: 'list' },
  { key: 'timeline', labelKey: 'sectionTimeline', mode: 'list' },
  { key: 'risks', labelKey: 'sectionRisks', mode: 'list' },
  { key: 'assumptions', labelKey: 'sectionAssumptions', mode: 'list' },
  { key: 'openQuestions', labelKey: 'sectionOpenQuestions', mode: 'list' },
  { key: 'decisionsRequiringApproval', labelKey: 'sectionDecisions', mode: 'list' },
  { key: 'nextSteps', labelKey: 'sectionNextSteps', mode: 'list' },
];

export const dimensionLabelKeys: Record<DimensionKey, MessageKey> = {
  problem: 'dimensionProblem',
  audience: 'dimensionAudience',
  outcome: 'dimensionOutcome',
  scope: 'dimensionScope',
  constraints: 'dimensionConstraints',
  timeline: 'dimensionTimeline',
  risks: 'dimensionRisks',
  successCriteria: 'dimensionSuccess',
};

export type Translator = (key: MessageKey) => string;
