"""Quick smoke test for AssemblyAI API connectivity."""
import os
import io
import struct
import wave
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("ASSEMBLYAI_API_KEY", "")
if not api_key:
    print("FAIL: ASSEMBLYAI_API_KEY not set in .env")
    raise SystemExit(1)

print(f"Key found: {api_key[:6]}…{api_key[-4:]}")

import assemblyai as aai

aai.settings.api_key = api_key

# Generate a 1-second silent WAV (8 kHz mono) without extra deps.
buf = io.BytesIO()
with wave.open(buf, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(8000)
    w.writeframes(struct.pack("<" + "h" * 8000, *([0] * 8000)))
wav_bytes = buf.getvalue()

tmp_path = Path("_test_audio.wav")
tmp_path.write_bytes(wav_bytes)

config = aai.TranscriptionConfig(
    speech_models=["universal-3-pro", "universal-2"],
    language_detection=False,
    language_code="en",
)

try:
    print("Sending 1-second silent WAV to AssemblyAI…")
    result = aai.Transcriber().transcribe(str(tmp_path), config)

    if result.status == aai.TranscriptStatus.error:
        print(f"FAIL: API returned error — {result.error}")
    else:
        print(f"OK: status={result.status}, text={repr(result.text)}")
finally:
    tmp_path.unlink(missing_ok=True)
