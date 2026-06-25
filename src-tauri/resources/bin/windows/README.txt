Place these binaries in this folder for subtitle generation:

1. ffmpeg.exe and ffprobe.exe - extract audio from video
2. whisper-cli.exe (CPU) or whisper-cli-cuda.exe (NVIDIA GPU)

GPU setup (recommended for NVIDIA):
  From repo root run:
    powershell -ExecutionPolicy Bypass -File .\scripts\setup-whisper-gpu.ps1
  Downloads official whisper.cpp CUDA build (CUDA 12.4 runtime DLLs bundled).
  Works with RTX GPUs and current drivers. Full CUDA Toolkit is NOT required.

Manual: whisper-cublas-12.4.0-bin-x64.zip from
  https://github.com/ggml-org/whisper.cpp/releases
  Copy whisper-cli.exe as whisper-cli-cuda.exe plus all *.dll here.

Also add the Whisper model to ../models/ (e.g. ggml-base.bin).

Settings -> Subtitles -> GPU acceleration: Auto (recommended), On, or Off.
