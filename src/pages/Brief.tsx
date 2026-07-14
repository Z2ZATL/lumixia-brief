import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { BriefSections, Project } from '../../shared/contracts';
import { dimensionKeys } from '../../shared/domain';
import { useI18n, type MessageKey } from '../i18n';
import { api, projectApi } from '../lib/api';

const sectionMeta: Array<{
  key: keyof BriefSections;
  labelKey: MessageKey;
  mode: 'text' | 'list';
}> = [
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

const dimensionLabelKeys: Record<(typeof dimensionKeys)[number], MessageKey> = {
  problem: 'dimensionProblem',
  audience: 'dimensionAudience',
  outcome: 'dimensionOutcome',
  scope: 'dimensionScope',
  constraints: 'dimensionConstraints',
  timeline: 'dimensionTimeline',
  risks: 'dimensionRisks',
  successCriteria: 'dimensionSuccess',
};

interface BriefActionsProps {
  approved: boolean;
  busy: boolean;
  nextVersion: number;
  approveLabel: string;
  rejectLabel: string;
  reviewLabel: string;
  onApprove: () => Promise<void>;
  onReject: () => void;
  onCreateRevision: () => Promise<void>;
}

function BriefActions(props: BriefActionsProps) {
  if (props.approved) {
    return (
      <button className="button ghost" onClick={props.onCreateRevision} disabled={props.busy}>
        {props.reviewLabel} v{props.nextVersion}
      </button>
    );
  }
  return (
    <>
      <button className="button ghost danger" onClick={props.onReject}>
        {props.rejectLabel}
      </button>
      <button className="button primary" onClick={props.onApprove} disabled={props.busy}>
        {props.approveLabel}
      </button>
    </>
  );
}

function SaveBar({
  dirty,
  busy,
  label,
  statusLabel,
  onSave,
}: {
  dirty: boolean;
  busy: boolean;
  label: string;
  statusLabel: string;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="sticky-save">
      <span>{statusLabel}</span>
      <button className="button primary" onClick={onSave} disabled={!dirty || busy}>
        {label}
      </button>
    </div>
  );
}

export function Brief() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<BriefSections | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [parentId, setParentId] = useState('');
  const [notionPages, setNotionPages] = useState<Array<{ id: string; title: string }>>([]);
  const [notionConnected, setNotionConnected] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { project } = await projectApi.get(id);
        if (!active) return;
        const brief = project.briefVersions.at(-1);
        if (!brief) {
          void navigate(`/projects/${id}/interview`, { replace: true });
          return;
        }
        setProject(project);
        setTitle(brief.title);
        setSections(structuredClone(brief.sections));
        setParentId(project.notionParentId ?? '');
        const status = await api<{ connected: boolean }>('/notion/status');
        if (!active) return;
        setNotionConnected(status.connected);
        if (status.connected) {
          const { pages } = await api<{ pages: Array<{ id: string; title: string }> }>(
            '/notion/pages',
            {},
          );
          if (active) setNotionPages(pages);
        }
      } catch (error) {
        if (active && error instanceof Error) setError(error.message);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, navigate]);

  useEffect(() => {
    if (!rejecting) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setRejecting(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [rejecting]);

  const latest = project?.briefVersions.at(-1);
  const dirty = useMemo(
    () =>
      Boolean(
        latest &&
        sections &&
        (title !== latest.title || JSON.stringify(sections) !== JSON.stringify(latest.sections)),
      ),
    [latest, sections, title],
  );

  function updateSection(key: keyof BriefSections, value: string, mode: 'text' | 'list') {
    if (!sections) return;
    setSaved(false);
    setSections({
      ...sections,
      [key]:
        mode === 'list'
          ? value
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean)
          : value,
    });
  }

  async function save() {
    if (!project || !latest || !sections) return;
    setBusy(true);
    setError('');
    try {
      const result = await projectApi.editBrief(project.id, {
        expectedVersion: latest.version,
        title,
        sections,
      });
      setProject(result.project);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!project || !latest || !sections) return;
    setBusy(true);
    setError('');
    try {
      if (dirty) {
        const savedDraft = await projectApi.editBrief(project.id, {
          expectedVersion: latest.version,
          title,
          sections,
        });
        setProject(savedDraft.project);
        setSaved(true);
      }
      const result = await projectApi.approveBrief(project.id);
      setProject(result.project);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('approvalFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function createRevision() {
    if (!project || !latest || !sections) return;
    setBusy(true);
    setError('');
    try {
      const result = await projectApi.editBrief(project.id, {
        expectedVersion: latest.version,
        title,
        sections,
      });
      setProject(result.project);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('revisionFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function requestChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await projectApi.requestChanges(project.id, {
        section: data.get('section'),
        dimension: data.get('dimension'),
        reason: data.get('reason'),
      });
      void navigate(`/projects/${project.id}/interview`);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('changesFailed'));
      setBusy(false);
    }
  }

  async function setNotionParent() {
    if (!project || !parentId.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await projectApi.selectNotionParent(project.id, parentId.trim());
      setProject(result.project);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('parentFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    if (!project) return;
    setBusy(true);
    setError('');
    try {
      const result = await projectApi.syncNotion(project.id);
      setProject(result.project);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('syncFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!project || !latest || !sections)
    return <main className="center-stage">{error || <div className="spinner" />}</main>;
  const approved = latest.status === 'approved';
  return (
    <main className="brief-page">
      <header className="brief-header">
        <div>
          <Link to="/projects">← {t('projects')}</Link>
          <div className="brief-title-line">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={approved}
              aria-label={t('briefTitle')}
            />
            <span className={`status ${project.workflowStatus}`}>
              {approved ? t('statusApproved') : t('statusNeedsReview')}
            </span>
            {latest.clarificationLabel === 'needs_clarification' && (
              <span className="clarification-label">{t('needsClarification')}</span>
            )}
          </div>
          <p>
            {t('version')} {latest.version} · {t('generatedFrom')} {project.answers.length}{' '}
            {t('interviewAnswers')}
          </p>
        </div>
        <div className="brief-actions">
          <BriefActions
            approved={approved}
            busy={busy}
            nextVersion={latest.version + 1}
            approveLabel={t('approve')}
            rejectLabel={t('reject')}
            reviewLabel={t('review')}
            onApprove={approve}
            onReject={() => setRejecting(true)}
            onCreateRevision={createRevision}
          />
        </div>
      </header>
      {error && (
        <div className="alert error brief-alert" role="alert">
          {error}
        </div>
      )}
      <div className="brief-layout">
        <article className="brief-document">
          <div className="document-kicker">
            <span>{t('structuredBrief')}</span>
            <span>v{latest.version}</span>
          </div>
          {sectionMeta.map(({ key, labelKey, mode }, index) => {
            const value = sections[key];
            return (
              <section className="brief-section" key={key}>
                <div className="section-number">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <label htmlFor={`section-${key}`}>{t(labelKey)}</label>
                  <textarea
                    id={`section-${key}`}
                    rows={
                      mode === 'text' ? 4 : Math.max(3, Array.isArray(value) ? value.length + 1 : 3)
                    }
                    value={Array.isArray(value) ? value.join('\n') : value}
                    onChange={(event) => updateSection(key, event.target.value, mode)}
                    disabled={approved}
                  />
                  <small>{mode === 'list' ? t('oneItemPerLine') : t('decisionReadyProse')}</small>
                </div>
              </section>
            );
          })}
          {!approved && (
            <SaveBar
              dirty={dirty}
              busy={busy}
              label={t('save')}
              statusLabel={
                dirty ? t('unsavedEdits') : saved ? t('allChangesSaved') : t('structuredDraft')
              }
              onSave={save}
            />
          )}
        </article>
        <aside className="brief-sidebar">
          <section className="alignment-card">
            <span className="micro-label">{t('alignment')}</span>
            <div className="delta">
              <strong>+{latest.alignment.delta}</strong>
              <small>{t('points')}</small>
            </div>
            <div className="score-compare">
              <div>
                <span>{t('from')}</span>
                <b>{latest.alignment.initialScore}%</b>
              </div>
              <i>→</i>
              <div>
                <span>{t('to')}</span>
                <b>{latest.alignment.finalScore}%</b>
              </div>
            </div>
            <ul>
              <li>
                <b>{latest.alignment.assumptionsSurfaced}</b> {t('assumptionsSurfacedLabel')}
              </li>
              <li>
                <b>{latest.alignment.contradictionsResolved}</b> {t('contradictionsResolvedLabel')}
              </li>
              <li>
                <b>{latest.alignment.humanDecisionsRemaining}</b> {t('decisions')}
              </li>
            </ul>
          </section>
          <section className="sync-card">
            <span className="micro-label">{t('notionHandoff')}</span>
            <h3>{approved ? t('approvedReady') : t('approvalRequired')}</h3>
            <p>{t('snapshotOnly')}</p>
            {approved && !notionConnected && <Link to="/settings">{t('connectNotion')} →</Link>}
            {approved && notionConnected && (
              <>
                <label>
                  {t('notionParent')}
                  {notionPages.length ? (
                    <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                      <option value="">{t('selectPage')}</option>
                      {notionPages.map((page) => (
                        <option value={page.id} key={page.id}>
                          {page.title}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={parentId}
                      onChange={(event) => setParentId(event.target.value)}
                      placeholder={t('pastePageId')}
                    />
                  )}
                </label>
                <button
                  className="button ghost full"
                  onClick={setNotionParent}
                  disabled={busy || !parentId.trim()}
                >
                  {t('setParent')}
                </button>
                <button
                  className="button primary full"
                  onClick={sync}
                  disabled={busy || !project.notionParentId}
                >
                  {project.syncStatus === 'synced'
                    ? t('synced')
                    : project.syncStatus === 'syncing'
                      ? t('syncing')
                      : t('sync')}
                </button>
                {project.syncStatus === 'error' && (
                  <small className="error-text">{t('safeRetry')}</small>
                )}
                <Link to="/settings">{t('manageNotion')} →</Link>
              </>
            )}
          </section>
          <section className="version-card">
            <span className="micro-label">{t('versions')}</span>
            {[...project.briefVersions].reverse().map((version) => (
              <div key={version.id}>
                <span>v{version.version}</span>
                <b>
                  {version.status === 'approved' ? t('statusApproved') : t('statusNeedsReview')}
                </b>
                <small>{new Date(version.updatedAt).toLocaleString(locale)}</small>
              </div>
            ))}
          </section>
        </aside>
      </div>
      {rejecting && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="reject-modal" onSubmit={requestChanges}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setRejecting(false)}
              aria-label={t('closeRevision')}
              autoFocus
            >
              ×
            </button>
            <span className="eyebrow">{t('focusedRevision')}</span>
            <h2>{t('reject')}</h2>
            <p>{t('revisionBody')}</p>
            <label>
              {t('briefSection')}
              <select name="section" required>
                {sectionMeta.map((item) => (
                  <option key={item.key} value={item.key}>
                    {t(item.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('alignmentDimension')}
              <select name="dimension" required>
                {dimensionKeys.map((item) => (
                  <option key={item} value={item}>
                    {t(dimensionLabelKeys[item])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('whyChange')}
              <textarea name="reason" minLength={5} maxLength={1500} required rows={4} />
            </label>
            <div className="form-actions">
              <button type="button" className="button ghost" onClick={() => setRejecting(false)}>
                {t('cancel')}
              </button>
              <button className="button primary" disabled={busy}>
                {t('askFocused')} →
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
