import React from 'react'; // v18.2.0
import classNames from 'classnames'; // v2.3.2

interface LoaderProps {
  size?: 'small' | 'medium' | 'large';
  variant?: 'circular' | 'linear';
  color?: 'primary' | 'secondary';
  className?: string;
  ariaLabel?: string;
  testId?: string;
}

const Loader: React.FC<LoaderProps> = React.memo(({
  size = 'medium',
  variant = 'circular',
  color = 'primary',
  className,
  ariaLabel = 'Loading...',
  testId = 'loader'
}) => {
  // Performance optimization for animations
  React.useEffect(() => {
    performance.mark('loader-start');
    return () => {
      performance.mark('loader-end');
      performance.measure('loader-duration', 'loader-start', 'loader-end');
    };
  }, []);

  // Check for reduced motion preference
  const prefersReducedMotion = React.useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const loaderClasses = classNames(
    'loader',
    `loader--${variant}`,
    `loader--${size}`,
    `loader--${color}`,
    {
      'loader--reduced-motion': prefersReducedMotion
    },
    className
  );

  // Error boundary for animation failures
  const [hasAnimationError, setHasAnimationError] = React.useState(false);
  React.useEffect(() => {
    const handleAnimationError = () => setHasAnimationError(true);
    window.addEventListener('error', handleAnimationError);
    return () => window.removeEventListener('error', handleAnimationError);
  }, []);

  if (variant === 'circular') {
    return (
      <div
        className={loaderClasses}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={null}
        data-testid={testId}
        style={{
          // Hardware acceleration optimization
          transform: hasAnimationError ? 'none' : 'translate3d(0, 0, 0)',
          willChange: 'transform'
        }}
      >
        <svg
          className="loader__svg"
          viewBox="0 0 50 50"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="loader__circle"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            strokeWidth="5"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={loaderClasses}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={null}
      data-testid={testId}
    >
      <div className="loader__bar">
        <div className="loader__bar-inner" />
      </div>
    </div>
  );
});

// Display name for debugging
Loader.displayName = 'Loader';

// Default props type checking
Loader.defaultProps = {
  size: 'medium',
  variant: 'circular',
  color: 'primary',
  ariaLabel: 'Loading...',
  testId: 'loader'
};

export default Loader;

// CSS Module styles (to be imported separately)
const styles = `
.loader {
  display: inline-flex;
  position: relative;
  box-sizing: border-box;
}

/* Size variants */
.loader--small {
  width: 24px;
  height: 24px;
}

.loader--medium {
  width: 40px;
  height: 40px;
}

.loader--large {
  width: 56px;
  height: 56px;
}

/* Color variants */
.loader--primary {
  --loader-color: var(--md-sys-color-primary);
}

.loader--secondary {
  --loader-color: var(--md-sys-color-secondary);
}

/* Circular variant */
.loader--circular .loader__svg {
  animation: loader-rotate 1.4s linear infinite;
}

.loader--circular .loader__circle {
  stroke: var(--loader-color);
  stroke-dasharray: 80, 200;
  stroke-dashoffset: 0;
  animation: loader-dash 1.4s ease-in-out infinite;
}

@keyframes loader-rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes loader-dash {
  0% {
    stroke-dasharray: 1, 200;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 89, 200;
    stroke-dashoffset: -35px;
  }
  100% {
    stroke-dasharray: 89, 200;
    stroke-dashoffset: -124px;
  }
}

/* Linear variant */
.loader--linear {
  width: 100%;
  height: 4px;
  overflow: hidden;
}

.loader--linear .loader__bar {
  width: 100%;
  height: 100%;
  background-color: var(--loader-color);
  opacity: 0.24;
}

.loader--linear .loader__bar-inner {
  width: 100%;
  height: 100%;
  background-color: var(--loader-color);
  animation: loader-progress 2s infinite linear;
}

@keyframes loader-progress {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .loader--circular .loader__svg {
    animation-duration: 20s;
  }
  
  .loader--circular .loader__circle {
    animation-duration: 20s;
  }
  
  .loader--linear .loader__bar-inner {
    animation-duration: 5s;
  }
}

/* Fallback for animation errors */
.loader--reduced-motion .loader__svg,
.loader--reduced-motion .loader__circle,
.loader--reduced-motion .loader__bar-inner {
  animation: none;
}
`;