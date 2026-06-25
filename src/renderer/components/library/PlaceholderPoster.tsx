import { memo } from 'react';

const TYPE_LABEL: Record<string, string> = {
  series: 'Series',
  movie: 'Movie',
  anime: 'Anime',
  ova: 'OVA',
  special: 'Special',
  unknown: 'Title',
};

interface PlaceholderPosterProps {
  title: string;
  type?: string;
  year?: number;
  provider?: string;
  variant?: 'card' | 'row';
  badge?: string;
}

function subtleInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '•';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase();
}

export const PlaceholderPoster = memo(function PlaceholderPoster(props: PlaceholderPosterProps) {
  const type = props.type ?? 'unknown';
  const initials = subtleInitials(props.title);
  const typeLabel = TYPE_LABEL[type] ?? TYPE_LABEL.unknown;

  return (
    <div
      className={[
        'placeholder-poster',
        `placeholder-poster--${type}`,
        props.variant === 'row' ? 'placeholder-poster--row' : '',
      ].filter(Boolean).join(' ')}
      aria-hidden
    >
      <div className="placeholder-poster__shine" />
      <div className="placeholder-poster__badge">{props.badge ?? typeLabel}</div>
      <div className="placeholder-poster__footer">
        <strong className="placeholder-poster__title">{props.title}</strong>
        {(props.year || props.provider) && (
          <span className="placeholder-poster__meta">
            {[props.year, props.provider?.toUpperCase()].filter(Boolean).join(' · ')}
          </span>
        )}
        <span className="placeholder-poster__initials">{initials}</span>
      </div>
    </div>
  );
});
