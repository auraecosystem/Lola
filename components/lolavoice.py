# serai_trailer_voiceover.py
# Use Lola's voice engine to narrate the SERAI cinematic trailer

from lola_voice import speak  # adjust import if Lola uses a different module

# Full cinematic script lines
script_lines = [
    "In a world where intelligence is no longer bound by reality...",
    "A new architecture emerges — uniting mind, matter, and motion.",
    "SERAI thinks. It moves. It connects. It creates.",
    "At its heart, a living workbook… orchestrating realities.",
    "SERAI is not just software. It is the blueprint of tomorrow.",
    "SERAI — Building realities beyond imagination."
]

# Generate audio files for each scene
for i, line in enumerate(script_lines, start=1):
    filename = f"scene_{i}.mp3"
    print(f"Generating narration for Scene {i}: {line}")
    speak(line, filename=filename)   # Lola's TTS saves each line as an mp3
