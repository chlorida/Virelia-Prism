import type { ReactNode } from 'react';

interface LibraryPageEnterProps {
  routeKey: string;
  back?: boolean;
  children: ReactNode;
}

export function LibraryPageEnter(props: LibraryPageEnterProps) {
  const className = props.back
    ? 'prism-page-enter prism-page-enter--back'
    : 'prism-page-enter';

  return (
    <div key={props.routeKey} className={className}>
      {props.children}
    </div>
  );
}
