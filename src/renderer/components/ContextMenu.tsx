import type { CinemaContextMenuIcon } from './PrismCinemaContextMenu';
import { PrismCinemaContextMenu, type CinemaContextMenuSection } from './PrismCinemaContextMenu';

export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

function resolveContextIcon(id: string): CinemaContextMenuIcon | undefined {
  if (id === 'play') return 'play';
  if (id === 'queue') return 'queue';
  if (id === 'favorite') return 'heart';
  if (id.startsWith('playlist:')) return 'playlist';
  return undefined;
}

export function ContextMenu(props: ContextMenuProps) {
  const sections: CinemaContextMenuSection[] = [
    {
      id: 'main',
      layout: 'list',
      items: props.items.map((item) => ({
        ...item,
        icon: resolveContextIcon(item.id),
      })),
    },
  ];

  return (
    <PrismCinemaContextMenu
      open={props.open}
      x={props.x}
      y={props.y}
      sections={sections}
      onSelect={props.onSelect}
      onClose={props.onClose}
    />
  );
}
