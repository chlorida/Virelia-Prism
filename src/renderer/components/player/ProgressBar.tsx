import { formatDuration } from '../../lib/search';

import type { SubtitleCoverageRange } from '../../../shared/subtitleTypes';

import { PrismRange } from './PrismRange';

import { useScrubRange } from './useScrubRange';



interface ProgressBarProps {

  currentTime: number;

  duration: number;

  bufferedEnd?: number;

  coverageRanges?: SubtitleCoverageRange[];

  disabled?: boolean;

  showTimes?: boolean;

  className?: string;

  onSeek: (value: number) => void;

  onSeekStart?: () => void;

  onSeekEnd?: () => void;

}



export function ProgressBar(props: ProgressBarProps) {

  const max = Math.max(props.duration, props.currentTime, 0);

  const bufferPercent = max > 0 ? Math.min(100, ((props.bufferedEnd ?? 0) / max) * 100) : 0;

  const { displayTime, bind, railBind } = useScrubRange({

    currentTime: props.currentTime,

    duration: props.duration,

    onSeek: props.onSeek,

    onSeekStart: props.onSeekStart,

    onSeekEnd: props.onSeekEnd,

  });

  const showTimes = props.showTimes !== false;



  return (

    <div className={props.className ?? 'playback-progress progress-bar'} data-video-control>

      {showTimes && <span>{formatDuration(displayTime)}</span>}

      <div className="seek-rail progress-bar__rail">

        <div className="progress-bar__track" aria-hidden>

          {max > 0 && props.coverageRanges?.map((range, index) => {

            const width = Math.max(0, ((range.end - range.start) / max) * 100);

            const left = Math.max(0, (range.start / max) * 100);

            if (width <= 0) return null;

            return (

              <div

                key={`${range.status}-${range.start}-${index}`}

                className={`progress-bar__coverage progress-bar__coverage--${range.status}`}

                style={{ left: `${left}%`, width: `${width}%` }}

              />

            );

          })}

        </div>

        <PrismRange
          variant="seek"
          disabled={props.disabled || max <= 0}
          bufferedPercent={bufferPercent}
          previewFormatter={formatDuration}
          railBind={railBind}
          {...bind}
        />

      </div>

      {showTimes && <span>{formatDuration(max)}</span>}

    </div>

  );

}

