/// <reference types="vite/client" />

import type { PrismApi } from '../shared/prismApi.types';

declare global {
  interface Window {
    prism: PrismApi;
  }
}
