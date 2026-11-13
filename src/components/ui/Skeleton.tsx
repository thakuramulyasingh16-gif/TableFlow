export function Skeleton({ className = 'h-6 w-full' }: { className?: string }) {
  return <div aria-hidden="true" className={`shimmer-mint rounded-[14px] ${className}`} />;
}

