import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
export default function SettingsSection({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#' + id && ref.current) ref.current.open = true;
  }, [hash, id]);
  return (
    <details className="panel settings-section" id={id} ref={ref}>
      <summary>{title}</summary>
      <div className="settings-content">{children}</div>
    </details>
  );
}
