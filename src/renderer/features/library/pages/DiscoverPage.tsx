import { memo, useCallback } from 'react';

import type { MediaItem } from '../../../../shared/types';

import type { LibraryTitle } from '../../../lib/mediaIntelligence/types';

import { useLibraryDerivedContext } from '../../../app/LibraryDerivedContext';

import { DiscoverFeed } from '../../../components/library/DiscoverFeed';

import type { RecommendationItem } from '../../../lib/metadata/types';

import {

  navigateToCatalogTitle,

  navigateToLocalTitle,

} from '../libraryRouterStore';

import { resolveTitlePlayTarget } from '../../../lib/mediaIntelligence/titlePlaybackService';

import { playUiSound } from '../../../services/uiAudioService';



interface DiscoverPageProps {

  libraryTitles: LibraryTitle[];

  mediaItems: MediaItem[];

  onPlay: (item: MediaItem) => void;

}



export const DiscoverPage = memo(function DiscoverPage(props: DiscoverPageProps) {

  const derived = useLibraryDerivedContext();



  const openItem = useCallback((item: RecommendationItem) => {

    playUiSound('open');

    if (item.localTitleId) {

      navigateToLocalTitle(item.localTitleId);

      return;

    }

    if (item.catalogId) {

      navigateToCatalogTitle(item.catalogId);

    }

  }, []);



  const continueItem = useCallback((item: RecommendationItem, localTitle?: LibraryTitle) => {

    if (localTitle) {

      const target = resolveTitlePlayTarget(localTitle);

      if (target) {

        props.onPlay(target.item);

        return;

      }

    }

    openItem(item);

  }, [openItem, props.onPlay]);



  return (

    <section className="discover-page title-media-grid">

      <DiscoverFeed

        libraryTitles={props.libraryTitles}

        mediaItems={props.mediaItems}

        favoriteIds={derived.favoriteIds}

        onOpenItem={openItem}

        onContinueItem={continueItem}

      />

    </section>

  );

});

