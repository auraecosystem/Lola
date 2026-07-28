from lola_voice import speak

script = [
    "In a world where intelligence is no longer bound by reality...",
    "A new architecture emerges — uniting mind, matter, and motion.",
    "SERAI thinks. It moves. It connects. It creates.",
    "At its heart, a living workbook… orchestrating realities.",
    "SERAI is not just software. It is the blueprint of tomorrow.",
    "SERAI — Building realities beyond imagination."
]

for i, line in enumerate(script):
    speak(line, filename=f"scene_{i+1}.mp3")
