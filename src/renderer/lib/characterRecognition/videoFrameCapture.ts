/** Capture current video frame via canvas — no ffmpeg. */

export async function captureVideoFrame(video: HTMLVideoElement | null): Promise<Blob | null> {

  if (!video) return null;

  if (video.readyState < 2) return null;

  try {

    const width = video.videoWidth;

    const height = video.videoHeight;

    if (!width || !height) return null;



    const canvas = document.createElement('canvas');

    canvas.width = width;

    canvas.height = height;

    const ctx = canvas.getContext('2d');

    if (!ctx) return null;



    ctx.drawImage(video, 0, 0, width, height);

    return await new Promise<Blob | null>((resolve) => {

      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);

    });

  } catch {

    return null;

  }

}



export function describeCaptureFailure(video: HTMLVideoElement | null): string {

  if (!video) return 'characterRecognition.capture.noVideoElement';

  if (video.readyState < 2) return 'characterRecognition.capture.notReady';

  if (!video.videoWidth || !video.videoHeight) return 'characterRecognition.capture.noDimensions';

  try {

    const canvas = document.createElement('canvas');

    canvas.width = video.videoWidth;

    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');

    if (!ctx) return 'characterRecognition.capture.noCanvas';

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toDataURL('image/jpeg');

  } catch {

    return 'characterRecognition.capture.tainted';

  }

  return 'characterRecognition.frameFailed';

}

