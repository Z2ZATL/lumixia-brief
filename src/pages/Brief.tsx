import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { dimensionKeys, type BriefSections, type Project } from '../../shared/contracts';
import { useI18n } from '../i18n';
import { api, projectApi } from '../lib/api';

const sectionMeta: Array<{ key: keyof BriefSections; label: string; mode: 'text' | 'list' }> = [
  { key: 'summary', label: 'Summary', mode: 'text' },
  { key: 'problemStatement', label: 'Problem statement', mode: 'text' },
  { key: 'goals', label: 'Goals', mode: 'list' },
  { key: 'successCriteria', label: 'Success criteria', mode: 'list' },
  { key: 'audience', label: 'Audience', mode: 'list' },
  { key: 'deliverables', label: 'Deliverables', mode: 'list' },
  { key: 'mustHave', label: 'Must-have', mode: 'list' },
  { key: 'niceToHave', label: 'Nice-to-have', mode: 'list' },
  { key: 'nonGoals', label: 'Non-goals', mode: 'list' },
  { key: 'constraints', label: 'Constraints', mode: 'list' },
  { key: 'timeline', label: 'Timeline', mode: 'list' },
  { key: 'risks', label: 'Risks', mode: 'list' },
  { key: 'assumptions', label: 'Assumptions', mode: 'list' },
  { key: 'openQuestions', label: 'Open questions', mode: 'list' },
  { key: 'decisionsRequiringApproval', label: 'Decisions requiring approval', mode: 'list' },
  { key: 'nextSteps', label: 'Next steps', mode: 'list' },
];

export function Brief() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<BriefSections | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [parentId, setParentId] = useState('');
  const [notionPages, setNotionPages] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    projectApi
      .get(id)
      .then(({ project }) => {
        const brief = project.briefVersions.at(-1);
        if (!brief) return navigate(`/projects/${id}/interview`, { replace: true });
        setProject(project);
        setTitle(brief.title);
        setSections(structuredClone(brief.sections));
        setParentId(project.notionParentId ?? '');
        api<{ pages: Array<{ id: string; title: string }> }>('/notion/pages')
          .then(({ pages }) => setNotionPages(pages))
          .catch(() => undefined);
      })
      .catch((error: Error) => setError(error.message));
  }, [id, navigate]);

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
      setError(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!project) return;
    setBusy(true);
    setError('');
    try {
      if (dirty) await save();
      const result = await projectApi.approveBrief(project.id);
      setProject(result.project);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Approval failed.');
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
      setError(error instanceof Error ? error.message : 'Could not create revision.');
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
      navigate(`/projects/${project.id}/interview`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not request changes.');
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
      setError(error instanceof Error ? error.message : 'Could not set parent page.');
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
      setError(error instanceof Error ? error.message : 'Sync failed.');
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
              aria-label="Brief title"
            />
            <span className={`status ${project.workflowStatus}`}>
              {approved ? 'Approved' : 'Needs review'}
            </span>
            {latest.clarificationLabel === 'needs_clarification' && (
              <span className="clarification-label">Needs clarification</span>
            )}
          </div>
          <p>
            Version {latest.version} · Generated from {project.answers.length} interview answers
          </p>
        </div>
        <div className="brief-actions">
          {!approved && (
            <>
              <button className="button ghost danger" onClick={() => setRejecting(true)}>
                {t('reject')}
              </button>
              <button className="button primary" onClick={approve} disabled={busy}>
                {t('approve')}
              </button>
            </>
          )}
          {approved && (
            <button className="button ghost" onClick={createRevision} disabled={busy}>
              {t('review')} v{latest.version + 1}
            </button>
          )}
        </div>
      </header>
      {error && <div className="alert error brief-alert">{error}</div>}
      <div className="brief-layout">
        <article className="brief-document">
          <div className="document-kicker">
            <span>LUMIXIA / STRUCTURED BRIEF</span>
            <span>v{latest.version}</span>
          </div>
          {sectionMeta.map(({ key, label, mode }, index) => {
            const value = sections[key];
            return (
              <section className="brief-section" key={key}>
                <div className="section-number">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <label htmlFor={`section-${key}`}>{label}</label>
                  <textarea
                    id={`section-${key}`}
                    rows={
                      mode === 'text' ? 4 : Math.max(3, Array.isArray(value) ? value.length + 1 : 3)
                    }
                    value={Array.isArray(value) ? value.join('\n') : value}
                    onChange={(event) => updateSection(key, event.target.value, mode)}
                    disabled={approved}
                  />
                  <small>
                    {mode === 'list' ? 'One item per line' : 'Short, decision-ready prose'}
                  </small>
                </div>
              </section>
            );
          })}
          {!approved && (
            <div className="sticky-save">
              <span>
                {dirty ? 'Unsaved edits' : saved ? 'All changes saved' : 'Structured draft'}
              </span>
              <button className="button primary" onClick={save} disabled={!dirty || busy}>
                {t('save')}
              </button>
            </div>
          )}
        </article>
        <aside className="brief-sidebar">
          <section className="alignment-card">
            <span className="micro-label">{t('alignment')}</span>
            <div className="delta">
              <strong>+{latest.alignment.delta}</strong>
              <small>points</small>
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
                <b>{latest.alignment.assumptionsSurfaced}</b> assumptions surfaced
              </li>
              <li>
                <b>{latest.alignment.contradictionsResolved}</b> contradictions resolved
              </li>
              <li>
                <b>{latest.alignment.humanDecisionsRemaining}</b> {t('decisions')}
              </li>
            </ul>
          </section>
          <section className="sync-card">
            <span className="micro-label">NOTION HANDOFF</span>
            <h3>{approved ? 'Approved and ready to sync' : 'Approval required'}</h3>
            <p>Only an immutable approved snapshot can leave Lumixia.</p>
            {approved && (
              <>
                <label>
                  {t('notionParent')}
                  {notionPages.length ? (
                    <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                      <option value="">Select a page…</option>
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
                      placeholder="Paste a shared page ID"
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
                    ? '✓ Synced'
                    : project.syncStatus === 'syncing'
                      ? 'Syncing…'
                      : t('sync')}
                </button>
                {project.syncStatus === 'error' && (
                  <small className="error-text">Safe to retry; no new page will be created.</small>
                )}
                <Link to="/settings">Manage Notion connection →</Link>
              </>
            )}
          </section>
          <section className="version-card">
            <span className="micro-label">{t('versions')}</span>
            {[...project.briefVersions].reverse().map((version) => (
              <div key={version.id}>
                <span>v{version.version}</span>
                <b>{version.status}</b>
                <small>{new Date(version.updatedAt).toLocaleString()}</small>
              </div>
            ))}
          </section>
        </aside>
      </div>
      {rejecting && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="reject-modal" onSubmit={requestChanges}>
            <button type="button" className="modal-close" onClick={() => setRejecting(false)}>
              ×
            </button>
            <span className="eyebrow">FOCUSED REVISION</span>
            <h2>{t('reject')}</h2>
            <p>
              Identify exactly what is wrong. Lumixia will reopen the interview only for that gap.
            </p>
            <label>
              Brief section
              <select name="section" required>
                {sectionMeta.map((item) => (
                  <option key={item.key} value={item.label}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Alignment dimension
              <select name="dimension" required>
                {dimensionKeys.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Why does this need to change?
              <textarea name="reason" minLength={5} maxLength={1500} required rows={4} />
            </label>
            <div className="form-actions">
              <button type="button" className="button ghost" onClick={() => setRejecting(false)}>
                {t('cancel')}
              </button>
              <button className="button primary" disabled={busy}>
                Ask one focused question →
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
