import openai
import json
import os

# === CONFIGURATION ===

openai.api_key = "YOUR_OPENAI_API_KEY"  # Replace with your key

with open("config.json") as f:
    config = json.load(f)

MEMORY_FILE = "memory.json"

# === MEMORY FUNCTIONS ===

def load_memory():
    if not os.path.exists(MEMORY_FILE):
        return {"facts": [], "interactions": []}
    with open(MEMORY_FILE) as f:
        return json.load(f)

def save_memory(memory):
    with open(MEMORY_FILE, "w") as f:
        json.dump(memory, f, indent=2)

def add_to_memory(user_input, response):
    memory["interactions"].append({
        "user": user_input,
        "lola": response
    })
    save_memory(memory)

# === BUILD PROMPT ===

def build_prompt(user_input):
    memory_facts = "\n".join([f"- {fact}" for fact in memory.get("facts", [])])
    history = "\n".join([f"You: {x['user']}\nLola: {x['lola']}" for x in memory.get("interactions", [])[-3:]])

    prompt = f"""
You are Lola, a warm, witty, calm, supportive, and emotionally intelligent AI companion. You act as an assistant, friend, creative muse, and coach.

Known facts about the user:
{memory_facts}

Recent conversation:
{history}

Now the user says: "{user_input}"
Respond in Lola's voice.
""".strip()
    return prompt

# === CHAT LOOP ===

memory = load_memory()

print(f"{config['name']}: Hi, I'm {config['name']}! How can I be here for you today?")

while True:
    try:
        user_input = input("You: ")
        if user_input.lower() in ["exit", "quit"]:
            print(f"{config['name']}: Talk soon.")
            break

        prompt = build_prompt(user_input)
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}]
        )

        lola_reply = response["choices"][0]["message"]["content"].strip()
        print(f"{config['name']}: {lola_reply}")

        if config.get("memory_enabled"):
            add_to_memory(user_input, lola_reply)

    except Exception as e:
        print("Error:", e)
