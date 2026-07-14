import { Link } from 'react-router-dom';
import type { BriefVersion, Project } from '../../../shared/contracts';
import type { Translator } from './meta';

interface NotionPanelProps {
  project: Project;
  approved: boolean;
  connected: boolean;
  pages: Array<{ id: string; title: string }>;
  parentId: string;
  busy: boolean;
  t: Translator;
  onParentChange: (parentId: string) => void;
  onSetParent: () => Promise<void>;
  onSync: () => Promise<void>;
}

function AlignmentPanel({ brief, t }: { brief: BriefVersion; t: Translator }) {
  return (
    <section className="alignment-card">
      <span className="micro-label">{t('alignment')}</span>
      <div className="delta">
        <strong>+{brief.alignment.delta}</strong>
        <small>{t('points')}</small>
      </div>
      <div className="score-compare">
        <div>
          <span>{t('from')}</span>
          <b>{brief.alignment.initialScore}%</b>
        </div>
        <i>→</i>
        <div>
          <span>{t('to')}</span>
          <b>{brief.alignment.finalScore}%</b>
        </div>
      </div>
      <ul>
        <li>
          <b>{brief.alignment.assumptionsSurfaced}</b> {t('assumptionsSurfacedLabel')}
        </li>
        <li>
          <b>{brief.alignment.contradictionsResolved}</b> {t('contradictionsResolvedLabel')}
        </li>
        <li>
          <b>{brief.alignment.humanDecisionsRemaining}</b> {t('decisions')}
        </li>
      </ul>
    </section>
  );
}

function ParentSelector(props: NotionPanelProps) {
  if (props.pages.length) {
    return (
      <select value={props.parentId} onChange={(event) => props.onParentChange(event.target.value)}>
        <option value="">{props.t('selectPage')}</option>
        {props.pages.map((page) => (
          <option value={page.id} key={page.id}>
            {page.title}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      value={props.parentId}
      onChange={(event) => props.onParentChange(event.target.value)}
      placeholder={props.t('pastePageId')}
    />
  );
}

function SyncControls(props: NotionPanelProps) {
  const syncLabel =
    props.project.syncStatus === 'synced'
      ? props.t('synced')
      : props.project.syncStatus === 'syncing'
        ? props.t('syncing')
        : props.t('sync');
  return (
    <>
      <label>
        {props.t('notionParent')}
        <ParentSelector {...props} />
      </label>
      <button
        className="button ghost full"
        onClick={props.onSetParent}
        disabled={props.busy || !props.parentId.trim()}
      >
        {props.t('setParent')}
      </button>
      <button
        className="button primary full"
        onClick={props.onSync}
        disabled={props.busy || !props.project.notionParentId}
      >
        {syncLabel}
      </button>
      {props.project.syncStatus === 'error' && (
        <small className="error-text">{props.t('safeRetry')}</small>
      )}
      <Link to="/settings">{props.t('manageNotion')} →</Link>
    </>
  );
}

function NotionPanel(props: NotionPanelProps) {
  return (
    <section className="sync-card">
      <span className="micro-label">{props.t('notionHandoff')}</span>
      <h3>{props.approved ? props.t('approvedReady') : props.t('approvalRequired')}</h3>
      <p>{props.t('snapshotOnly')}</p>
      {props.approved && !props.connected && (
        <Link to="/settings">{props.t('connectNotion')} →</Link>
      )}
      {props.approved && props.connected && <SyncControls {...props} />}
    </section>
  );
}

function VersionPanel({ project, locale, t }: { project: Project; locale: string; t: Translator }) {
  return (
    <section className="version-card">
      <span className="micro-label">{t('versions')}</span>
      {[...project.briefVersions].reverse().map((version) => (
        <div key={version.id}>
          <span>v{version.version}</span>
          <b>{version.status === 'approved' ? t('statusApproved') : t('statusNeedsReview')}</b>
          <small>{new Date(version.updatedAt).toLocaleString(locale)}</small>
        </div>
      ))}
    </section>
  );
}

interface BriefSidebarProps extends NotionPanelProps {
  brief: BriefVersion;
  locale: string;
}

export function BriefSidebar(props: BriefSidebarProps) {
  return (
    <aside className="brief-sidebar">
      <AlignmentPanel brief={props.brief} t={props.t} />
      <NotionPanel {...props} />
      <VersionPanel project={props.project} locale={props.locale} t={props.t} />
    </aside>
  );
}
