import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: string;
}

class SceneErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('[SceneErrorBoundary]', error.message, error.stack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.8125rem',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div>
              <img
                src="/assets-v2/room-preview.webp"
                alt="Blobby in the room"
                style={{ maxHeight: 300, objectFit: 'contain' }}
              />
              <p>The 3D room couldn’t load.</p>
              <button
                style={{ color: 'var(--accent-mint)', padding: 12 }}
                onClick={() => this.setState({ hasError: false, error: '' })}
              >
                Retry 3D
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

export default SceneErrorBoundary;
