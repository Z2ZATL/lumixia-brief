import { dimensionLabels, type Project } from '../../shared/contracts';
import { confidenceScore } from '../../server/domain/confidence';
import { useI18n } from '../i18n';

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
          {project.analysis.dimensionAssessments.map((item) => (
            <div className="dimension-row" key={item.dimension}>
              <span>{dimensionLabels[item.dimension]}</span>
              <div
                className="level-track"
                aria-label={`${dimensionLabels[item.dimension]}: ${item.level}`}
              >
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
          ))}
        </div>
      )}
    </section>
  );
}
