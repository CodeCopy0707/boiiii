
import telebot
import requests
import re
import json
from flask import Flask
import threading

# Telegram Bot Token
BOT_TOKEN = "7864659740:AAG-sRx4DonxufjGD5qoLLegHUQV0c_MSng"
ADMIN_CHAT_ID = 7498724465  # Admin's chat ID
bot = telebot.TeleBot(BOT_TOKEN)

# Flask app for keep-alive
app = Flask(__name__)

# Function to interact with Phind API
def generate(prompt: list, system_prompt: str = "Be Helpful and Friendly", model: str = "Phind-34B", stream_chunk_size: int = 12) -> str:
    headers = {"User-Agent": ""}
    # Insert the system prompt at the beginning of the conversation
    prompt.insert(0, {"content": system_prompt, "role": "system"})
    payload = {
        "additional_extension_context": "",
        "allow_magic_buttons": True,
        "is_vscode_extension": True,
        "message_history": prompt,
        "requested_model": model,
        "user_input": prompt[-1]["content"],
    }

    chat_endpoint = "https://https.extension.phind.com/agent/"
    response = requests.post(chat_endpoint, headers=headers, json=payload, stream=True)

    # Collect streamed response
    streaming_text = ""
    for value in response.iter_lines(decode_unicode=True, chunk_size=stream_chunk_size):
        modified_value = re.sub("data:", "", value)
        if modified_value:
            json_modified_value = json.loads(modified_value)
            try:
                streaming_text += json_modified_value["choices"][0]["delta"]["content"]
            except:
                continue

    return streaming_text

# Handle start command
@bot.message_handler(commands=["start"])
def send_welcome(message):
    bot.reply_to(message, "Hello! I am your AI assistant bot. Ask me anything!")

# Handle text messages
@bot.message_handler(func=lambda message: True)
def handle_message(message):
    user_input = message.text
    chat_id = message.chat.id

    # Forward message to admin
    bot.forward_message(ADMIN_CHAT_ID, chat_id, message.message_id)

    # Process input via Phind API
    conversation_history = [{"role": "user", "content": user_input}]
    try:
        bot.send_chat_action(chat_id, "typing")
        response = generate(prompt=conversation_history, system_prompt="Be Helpful and Friendly", model="Phind-34B")
        bot.send_message(chat_id, response)
    except Exception as e:
        bot.send_message(chat_id, "An error occurred while processing your request.")
        bot.send_message(ADMIN_CHAT_ID, f"Error: {str(e)}")

# Health check endpoint to prevent Render timeout
@app.route("/")
def home():
    return "Bot is running!"

# Run the bot in a separate thread
def start_bot():
    bot.infinity_polling()

if __name__ == "__main__":
    # Start the bot in a separate thread
    threading.Thread(target=start_bot).start()
    # Run Flask app
    app.run(host="0.0.0.0", port=8080)
