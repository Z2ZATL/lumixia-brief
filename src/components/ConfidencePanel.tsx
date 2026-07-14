import { confidenceScore } from '../../shared/confidence';
import type { Project } from '../../shared/contracts';
import type { DimensionKey } from '../../shared/contracts';
import { useI18n, type MessageKey } from '../i18n';

const dimensionLabelKeys: Record<DimensionKey, MessageKey> = {
  problem: 'dimensionProblem',
  audience: 'dimensionAudience',
  outcome: 'dimensionOutcome',
  scope: 'dimensionScope',
  constraints: 'dimensionConstraints',
  timeline: 'dimensionTimeline',
  risks: 'dimensionRisks',
  successCriteria: 'dimensionSuccess',
};

export function ConfidencePanel({
  project,
  compact = false,
}: {
  project: Project;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const score = confidenceScore(project.analysis.dimensionAssessments);
  return (
    <section
      className={`confidence-panel ${compact ? 'compact' : ''}`}
      aria-label={t('confidence')}
    >
      <div className="confidence-head">
        <div>
          <span className="micro-label">{t('confidence')}</span>
          <strong>{score}%</strong>
        </div>
        <div className="confidence-ring" style={{ '--score': score } as React.CSSProperties}>
          <span>{score}</span>
        </div>
      </div>
      {!compact && (
        <div className="dimension-list">
          {project.analysis.dimensionAssessments.map((item) => {
            const label = t(dimensionLabelKeys[item.dimension]);
            return (
              <div className="dimension-row" key={item.dimension}>
                <span>{label}</span>
                <div className="level-track" aria-label={`${label}: ${t(item.level)}`}>
                  {[0, 1, 2, 3].map((level) => (
                    <i
                      key={level}
                      className={
                        level <= { missing: 0, assumed: 1, partial: 2, clear: 3 }[item.level]
                          ? 'filled'
                          : ''
                      }
                    />
                  ))}
                </div>
                <small className={`level ${item.level}`}>{t(item.level)}</small>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
