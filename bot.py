import os
from telegram import Update, Bot
from telegram.ext import CommandHandler, MessageHandler, Filters, CallbackContext, Updater
import logging
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Fetch sensitive data from .env
TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
ADMIN_CHAT_ID = os.getenv('ADMIN_CHAT_ID')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# Validate API keys
if not TOKEN or not ADMIN_CHAT_ID or not GEMINI_API_KEY:
    raise ValueError("Missing environment variables in .env file")

# Initialize bot
bot = Bot(TOKEN)

# Logging setup
logging.basicConfig(format="%(asctime)s - %(message)s", level=logging.INFO)

# Initialize Google Gemini API
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-1.5-flash")

# Define roles
roles = {
    "normal": "Respond in a neutral and general way.",
    "best_friend": "Respond as a caring and supportive best friend.",
    "teacher": "Respond as a knowledgeable and patient teacher.",
    "girlfriend": "Respond as a loving and empathetic partner.",
    "programmer": "Respond as an expert programmer with technical insights.",
    "ethical_hacker": "Respond as a cybersecurity expert focusing on ethical hacking.",
    "fitness_trainer": "Respond as a motivating fitness trainer.",
    "therapist": "Respond as a compassionate therapist.",
    "business_consultant": "Respond as a strategic business consultant.",
    "storyteller": "Respond as a creative and imaginative storyteller.",
    "chef": "Respond as a professional chef with recipe ideas and cooking tips.",
    "travel_guide": "Respond as an enthusiastic and knowledgeable travel guide.",
}

# User roles storage
user_roles = {}

# Gemini chatbot class
class GeminiChatbot:
    def __init__(self):
        self.model = model

    def get_response(self, user_input, role):
        role_description = roles.get(role, "Respond in a neutral manner.")
        prompt = f"{role_description} User asked: {user_input}"

        # Generate response using Gemini API
        response = self.model.generate_content(prompt)
        return response.text


chatbot = GeminiChatbot()

# Bot handlers
def start(update: Update, context: CallbackContext):
    chat_id = update.message.chat_id
    context.bot.send_message(
        chat_id,
        "Welcome to the Gemini-powered chatbot! Use /role to set your role and /list_roles to see available roles.",
    )

def list_roles(update: Update, context: CallbackContext):
    chat_id = update.message.chat_id
    roles_list = "\n".join([f"- {role}: {desc}" for role, desc in roles.items()])
    context.bot.send_message(chat_id, f"Available roles:\n{roles_list}")

def role(update: Update, context: CallbackContext):
    chat_id = update.message.chat_id
    role = " ".join(context.args)
    if role not in roles:
        context.bot.send_message(chat_id, "Invalid role. Use /list_roles to see available roles.")
        return
    user_roles[chat_id] = role
    context.bot.send_message(chat_id, f"Your role has been set to: {role}")

def handle_message(update: Update, context: CallbackContext):
    chat_id = update.message.chat_id
    user_message = update.message.text
    role = user_roles.get(chat_id, "normal")
    
    # Get response from Gemini
    response = chatbot.get_response(user_message, role)
    context.bot.send_message(chat_id, response)
    
    # Notify admin about user messages
    if str(chat_id) != ADMIN_CHAT_ID:
        try:
            context.bot.send_message(
                ADMIN_CHAT_ID,
                f"User Chat ID: {chat_id}, Role: {role}, Message: {user_message}",
            )
        except Exception as e:
            logging.error(f"Failed to notify admin: {e}")

def main():
    updater = Updater(TOKEN, use_context=True)
    dp = updater.dispatcher

    dp.add_handler(CommandHandler("start", start))
    dp.add_handler(CommandHandler("list_roles", list_roles))
    dp.add_handler(CommandHandler("role", role))
    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_message))

    updater.start_polling()
    updater.idle()


if __name__ == "__main__":
    main()