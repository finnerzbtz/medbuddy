import { cloudConfig } from '@/cloud/config';
import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Leaf } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
export default function WelcomePage() {
  const onboarded = useAppStore((s) => s.data.onboarded);
  const destination = useRef('/');
  const [name, setName] = useState(''),
    [petName, setPetName] = useState('Blobby'),
    [error, setError] = useState('');
  if (onboarded) return <Navigate to={destination.current} replace />;
  return (
    <main className="welcome-page" id="main-content" tabIndex={-1}>
      <div className="welcome-art">
        <Link to="/studio" className="brand">
          reminduh.
        </Link>
        <img src="/assets-v2/room-preview.webp" alt="Blobby waiting in a peaceful little room" />
        <div className="welcome-caption">
          <Leaf aria-hidden="true" focusable="false" size={22} />
          <span>Small steps. A little company.</span>
        </div>
      </div>
      <section className="welcome-copy">
        <Link className="text-link welcome-help" to="/help">
          Help & accessibility settings
        </Link>
        <span className="eyebrow">Your routine, with a little heart</span>
        <h1>
          A little care.
          <br />A little company.
        </h1>
        <p>
          Meet Blobby, your companion for everyday medication check-ins. Make a routine that feels
          like yours.
        </p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            destination.current = '/meds/new?welcome=1';
            const result = useAppStore.getState().completeWelcome(name, petName);
            if (!result.ok) setError(result.error!);
          }}
        >
          <label className="field">
            What should we call you? <span className="optional">(optional)</span>
            <input
              autoComplete="given-name"
              value={name}
              maxLength={40}
              placeholder="Your first name"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            Your companion’s name
            <input
              value={petName}
              maxLength={40}
              placeholder="Blobby"
              onChange={(e) => setPetName(e.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full large" type="submit">
            Make yourself at home <ArrowRight aria-hidden="true" focusable="false" size={19} />
          </button>
        </form>
        {cloudConfig.enabled && (
          <Link className="button secondary full" to="/account">
            Sign in to my account
          </Link>
        )}
        <p className="privacy-note">
          Saved on this device. No account needed. You can export a backup whenever you like.
        </p>
        <Link className="text-link" to="/profile#your-data">
          Already have a backup? Restore it
        </Link>
      </section>
    </main>
  );
}
