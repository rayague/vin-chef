interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullscreen?: boolean;
}

export default function LoadingSpinner({
  message = 'Génération en cours...',
  size = 'md',
  fullscreen = false,
}: LoadingSpinnerProps) {
  const sizeMap: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 flex flex-col items-center justify-center bg-white/80 z-50'
          : 'flex flex-col items-center justify-center'
      }
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <div className={`${sizeMap[size]} animate-spin rounded-full border-2 border-primary border-t-transparent`} />
        <div className="text-sm text-muted-foreground">{message}</div>
      </div>
    </div>
  );
}
