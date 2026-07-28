import speech_recognition as sr
import pyttsx3

def record_audio():
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        print("🎤 Listening...")
        recognizer.adjust_for_ambient_noise(source)
        audio = recognizer.listen(source)
    return audio

def transcribe_audio(audio):
    recognizer = sr.Recognizer()
    try:
        print("📝 Transcribing...")
        text = recognizer.recognize_google(audio)
        print(f"🗣️ You said: {text}")
        return text
    except sr.UnknownValueError:
        print("❌ Sorry, I couldn't understand the audio.")
        return ""
    except sr.RequestError as e:
        print(f"⚠️ Could not request results; {e}")
        return ""

def speak_text(text):
    engine = pyttsx3.init()
    engine.say(text)
    engine.runAndWait()

# Main execution
audio_data = record_audio()
user_input = transcribe_audio(audio_data)

if user_input:
    # Replace this with your assistant's response logic
    lola_reply = f"You said: {user_input}"
    speak_text(lola_reply)
