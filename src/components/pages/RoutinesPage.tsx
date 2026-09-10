import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';
import { ROUTINE_TEMPLATES, CATEGORY_NAMES } from '@/domain/routineTemplates';
import type { Routine, RoutineInput } from '@/types';
import RoutineForm from '@/components/forms/RoutineForm';
import RoutineDialog from '@/components/app/RoutineDialog';
export default function RoutinesPage() {
  const data = useAppStore((s) => s.data),
    [params] = useSearchParams(),
    navigate = useNavigate();
  const welcome = params.has('welcome');
  const [form, setForm] = useState<{ routine?: Routine; template?: Partial<RoutineInput> } | null>(
      null,
    ),
    [archive, setArchive] = useState<Routine | null>(null),
    [error, setError] = useState('');
  const active = data.selfCare.routines.filter((r) => !r.archived),
    archived = data.selfCare.routines.filter((r) => r.archived);
  const report = (result: { ok: boolean; error?: string }) => {
    setError(result.ok ? '' : (result.error ?? 'Could not save.'));
    return result.ok;
  };
  const finish = () => {
    if (report(useAppStore.getState().dismissRoutineIntroduction())) navigate('/');
  };
  return (
    <>
      <div className="page-heading">
        <h1>{welcome ? 'A little time for you' : 'Your routines'}</h1>
        <Link className="text-link" to="/">
          Back to Today
        </Link>
      </div>
      <section className="panel routine-page">
        <p>
          {welcome
            ? 'Choose up to two to start, or skip. You can change them any time.'
            : 'Self-care, separate from your medication.'}
        </p>
        {welcome && (
          <div className="routine-actions">
            <button className="button primary" onClick={finish}>
              Continue to Today
            </button>
            <Link className="text-link" to="/meds/new">
              Add medication
            </Link>
          </div>
        )}
        <h2>{active.length ? 'Your plan' : 'Add a routine'}</h2>
        <div className="routine-management">
          {active.map((r) => (
            <article key={r.id} aria-label={r.title} className="routine-card">
              <h3>{r.title}</h3>
              <p>
                {CATEGORY_NAMES[r.category]} · {r.schedules.at(-1)?.active ? 'Active' : 'Paused'}
              </p>
              <div className="routine-actions">
                <button className="button secondary" onClick={() => setForm({ routine: r })}>
                  Edit
                </button>
                <button
                  className="button ghost"
                  onClick={() =>
                    report(
                      useAppStore
                        .getState()
                        .setRoutineStatus(r.id, r.schedules.at(-1)?.active ? 'paused' : 'active'),
                    )
                  }
                >
                  {r.schedules.at(-1)?.active ? 'Pause' : 'Resume'}
                </button>
                <button className="text-link" onClick={() => setArchive(r)}>
                  Archive
                </button>
              </div>
            </article>
          ))}
        </div>
        {(!welcome || active.length < 2) && (
          <>
            <h2>Start with an idea</h2>
            <div className="routine-templates">
              {ROUTINE_TEMPLATES.map((template) => (
                <button
                  key={template.title}
                  className="routine-template"
                  onClick={() => setForm({ template })}
                >
                  <span>{CATEGORY_NAMES[template.category]}</span>
                  <strong>{template.title}</strong>
                  <span aria-hidden="true">＋</span>
                </button>
              ))}
            </div>
            <button className="button secondary" onClick={() => setForm({})}>
              Create your own routine
            </button>
          </>
        )}
        {archived.length > 0 && (
          <details className="routine-archive">
            <summary>Archived routines ({archived.length})</summary>
            {archived.map((r) => (
              <div key={r.id} className="routine-card">
                <h3>{r.title}</h3>
                <button
                  className="text-link"
                  onClick={() => report(useAppStore.getState().setRoutineStatus(r.id, 'active'))}
                >
                  Restore routine
                </button>
              </div>
            ))}
          </details>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </section>
      {form && <RoutineForm {...form} close={() => setForm(null)} />}
      {archive && (
        <RoutineDialog title="Archive this routine?" close={() => setArchive(null)}>
          <p>
            {archive.title} will leave your optional plan. Past records are kept, and you can
            restore it later.
          </p>
          <div className="routine-actions">
            <button
              className="button primary"
              onClick={() => {
                if (report(useAppStore.getState().setRoutineStatus(archive.id, 'archived')))
                  setArchive(null);
              }}
            >
              Archive routine
            </button>
            <button className="button secondary" onClick={() => setArchive(null)}>
              Cancel
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </RoutineDialog>
      )}
    </>
  );
}
