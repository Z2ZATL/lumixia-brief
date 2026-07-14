import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BriefHeader } from '../features/brief/BriefHeader';
import { BriefSidebar } from '../features/brief/BriefSidebar';
import { RevisionModal } from '../features/brief/RevisionModal';
import { SectionEditor } from '../features/brief/SectionEditor';
import {
  updateBriefSection,
  useBriefActions,
  useBriefState,
  useNotionActions,
  useRevisionRequest,
} from '../features/brief/useBrief';
import { useI18n } from '../i18n';

export function Brief() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const state = useBriefState(id, navigate);
  const actions = useBriefActions(state, t);
  const notion = useNotionActions(state, t);
  const requestChanges = useRevisionRequest(state, navigate, t);
  const [rejecting, setRejecting] = useState(false);
  const closeRevision = useCallback(() => setRejecting(false), []);

  if (!state.project || !state.latest || !state.sections) {
    return <main className="center-stage">{state.error || <div className="spinner" />}</main>;
  }
  const approved = state.latest.status === 'approved';
  return (
    <main className="brief-page">
      <BriefHeader
        project={state.project}
        latest={state.latest}
        title={state.title}
        approved={approved}
        busy={state.busy}
        t={t}
        onTitleChange={state.setTitle}
        onApprove={actions.approve}
        onReject={() => setRejecting(true)}
        onCreateRevision={actions.createRevision}
      />
      {state.error && (
        <div className="alert error brief-alert" role="alert">
          {state.error}
        </div>
      )}
      <div className="brief-layout">
        <SectionEditor
          version={state.latest.version}
          sections={state.sections}
          approved={approved}
          dirty={state.dirty}
          busy={state.busy}
          saved={state.saved}
          t={t}
          onChange={(key, value, mode) => updateBriefSection(state, key, value, mode)}
          onSave={actions.save}
        />
        <BriefSidebar
          project={state.project}
          brief={state.latest}
          approved={approved}
          connected={state.notionConnected}
          pages={state.notionPages}
          parentId={state.parentId}
          busy={state.busy}
          locale={locale}
          t={t}
          onParentChange={state.setParentId}
          onSetParent={notion.setNotionParent}
          onSync={notion.sync}
        />
      </div>
      {rejecting && (
        <RevisionModal busy={state.busy} t={t} onClose={closeRevision} onSubmit={requestChanges} />
      )}
    </main>
  );
}
