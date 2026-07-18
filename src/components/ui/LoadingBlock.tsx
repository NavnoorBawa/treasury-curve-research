interface LoadingBlockProps {
  className?: string;
  rows?: number;
}

export function LoadingBlock({ className = "", rows = 3 }: LoadingBlockProps) {
  return (
    <div className={`loading-block ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <span key={index} className="loading-block__line" />
      ))}
    </div>
  );
}
