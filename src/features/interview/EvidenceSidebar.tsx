import type { Project } from '../../../shared/contracts';
import { ConfidencePanel } from '../../components/ConfidencePanel';
import type { Translator } from '../brief/meta';

interface EvidenceSidebarProps {
  project: Project;
  t: Translator;
}

function FactEvidence({ project, t }: EvidenceSidebarProps) {
  return (
    <section className="evidence-card">
      <h3>
        {t('facts')} <span>{project.analysis.facts.length}</span>
      </h3>
      {project.analysis.facts.slice(-3).map((fact, index) => (
        <p key={index}>“{fact.statement}”</p>
      ))}
      {!project.analysis.facts.length && <p className="muted">{t('evidenceEmpty')}</p>}
    </section>
  );
}

function AssumptionEvidence({ project, t }: EvidenceSidebarProps) {
  return (
    <section className="evidence-card assumptions">
      <h3>
        {t('assumptions')} <span>{project.analysis.assumptions.length}</span>
      </h3>
      {project.analysis.assumptions.slice(-3).map((item, index) => (
        <p key={index}>{item.statement}</p>
      ))}
      {!project.analysis.assumptions.length && <p className="muted">{t('assumptionsEmpty')}</p>}
    </section>
  );
}

function ContradictionEvidence({ project, t }: EvidenceSidebarProps) {
  return (
    <section className="evidence-card contradictions">
      <h3>
        {t('contradictions')} <span>{project.analysis.contradictions.length}</span>
      </h3>
      {project.analysis.contradictions.slice(-3).map((item) => (
        <p key={item.id}>
          {item.statementA} ↔ {item.statementB}
          {item.resolved ? ' ✓' : item.blocking ? ` · ${t('blocking')}` : ''}
        </p>
      ))}
      {!project.analysis.contradictions.length && (
        <p className="muted">{t('contradictionsEmpty')}</p>
      )}
    </section>
  );
}

export function EvidenceSidebar(props: EvidenceSidebarProps) {
  return (
    <aside className="alignment-sidebar">
      <ConfidencePanel project={props.project} />
      <FactEvidence {...props} />
      <AssumptionEvidence {...props} />
      <ContradictionEvidence {...props} />
    </aside>
  );
}
