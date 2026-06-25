Whisper speech model for subtitle generation
============================================

REQUIRED file (about 150 MB):
  ggml-base.bin

Download:
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

Put ggml-base.bin in THIS folder:
  src-tauri/resources/models/ggml-base.bin

NOT the same as ggml-base.dll — DLL is a library, .bin is the AI model.

Optional: copy ggml.dll, ggml-base.dll, ggml-cpu.dll to ../bin/windows/
(next to whisper-cli.exe) if whisper fails to start.
