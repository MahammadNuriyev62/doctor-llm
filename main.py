from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.responses import StreamingResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List
from enum import Enum
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer
import torch
import threading
from datetime import datetime
import uuid
from pymongo import MongoClient
from jose import JWTError, jwt

# Initialize FastAPI app
app = FastAPI()

# Set up templates directory
templates = Jinja2Templates(directory="templates")

# Set up static files (for CSS and JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# MongoDB Connection
try:
    mongo_uri = "mongodb+srv://root:A9Ygi9A_L7PeXz$@cluster0.tmoe7.mongodb.net/"
    client = MongoClient(mongo_uri)
    db = client.llama_chat_db
    # Test connection
    client.admin.command("ping")
    print("MongoDB connection successful!")
except Exception as e:
    print(f"MongoDB connection error: {str(e)}")
    raise

# JWT settings
SECRET_KEY = "your-secret-key"  # Change this in production
ALGORITHM = "HS256"
security = HTTPBearer()

# Replace this with your actual Hugging Face token
token = "hello"

# Model & tokenizer
model_name = "meta-llama/Llama-3.2-1B-Instruct"
tokenizer = AutoTokenizer.from_pretrained(model_name, token=token)
model = AutoModelForCausalLM.from_pretrained(
    model_name, device_map="auto", torch_dtype=torch.bfloat16, token=token
)


class RoleEnum(str, Enum):
    system = "system"
    user = "user"
    assistant = "assistant"


class Message(BaseModel):
    role: RoleEnum
    content: str


class ChatHistory(BaseModel):
    chat_id: str
    title: str
    messages: List[dict]
    user_id: str
    created_at: datetime
    updated_at: datetime


class User(BaseModel):
    username: str


class UserInDB(User):
    user_id: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


# Create JWT token
def create_jwt_token(data: dict):
    to_encode = data.copy()
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token


# Verify JWT token
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    try:
        payload = jwt.decode(
            credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM]
        )
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = db.users.find_one({"username": username})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        # Convert ObjectId to string to make it JSON serializable
        if "_id" in user:
            user["_id"] = str(user["_id"])

        return user
    except JWTError as e:
        print(f"JWT Error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        print(f"Authentication error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Authentication error: {str(e)}")


def chat_stream(prompt: str):
    """
    Generator that yields tokens as they are generated by the model.
    """
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    streamer = TextIteratorStreamer(tokenizer, skip_prompt=True)
    generation_kwargs = dict(**inputs, streamer=streamer, max_new_tokens=500)

    thread = threading.Thread(target=model.generate, kwargs=generation_kwargs)
    thread.start()
    for token in streamer:
        yield token


@app.post("/api/register", response_model=TokenResponse)
async def register(user: User):
    # Check if username already exists
    existing_user = db.users.find_one({"username": user.username})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )

    # Create new user
    user_id = str(uuid.uuid4())
    new_user = {
        "user_id": user_id,
        "username": user.username,
        "created_at": datetime.utcnow(),
    }

    # Insert into database
    db.users.insert_one(new_user)

    # Create and return JWT token
    access_token = create_jwt_token({"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/api/login", response_model=TokenResponse)
async def login(user: User):
    # Find the user
    db_user = db.users.find_one({"username": user.username})
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username"
        )

    # Create and return JWT token
    access_token = create_jwt_token({"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/api/chat")
async def chat_endpoint(messages: List[Message], user=Depends(get_current_user)):
    """
    Accepts a list of conversation messages:
        [ {role: "system"|"user"|"assistant", content: "..."} ]
    Returns streaming tokens for the assistant's newest response.
    """
    # Build the prompt from all previous messages
    prompt = ""
    for msg in messages:
        if msg.role == RoleEnum.system:
            prompt += f"System: {msg.content}\n"
        elif msg.role == RoleEnum.user:
            prompt += f"User: {msg.content}\n"
        elif msg.role == RoleEnum.assistant:
            prompt += f"Assistant: {msg.content}\n"
    # The model should continue with an Assistant reply
    prompt += "Assistant:"

    return StreamingResponse(chat_stream(prompt), media_type="text/plain")


class ChatCreate(BaseModel):
    title: str


@app.post("/api/chats")
async def create_chat(chat_data: ChatCreate, user=Depends(get_current_user)):
    """Create a new chat"""
    chat_id = str(uuid.uuid4())
    chat = {
        "id": chat_id,  # Use 'id' instead of 'chat_id' to match existing index
        "title": chat_data.title,
        "messages": [{"role": "system", "content": "You are a helpful assistant."}],
        "user_id": user["user_id"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    try:
        db.chats.insert_one(chat)
        return {"chat_id": chat_id, "title": chat_data.title}
    except Exception as e:
        print(f"Error creating chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/chats")
async def get_chats(user=Depends(get_current_user)):
    """Get all chats for the current user"""
    chats = list(db.chats.find({"user_id": user["user_id"]}).sort("updated_at", -1))

    # Convert ObjectId to string for JSON serialization
    for chat in chats:
        if "_id" in chat:
            chat["_id"] = str(chat["_id"])
        if "created_at" in chat:
            chat["created_at"] = chat["created_at"].isoformat()
        if "updated_at" in chat:
            chat["updated_at"] = chat["updated_at"].isoformat()

        # Add chat_id for backward compatibility if using id field
        if "id" in chat and "chat_id" not in chat:
            chat["chat_id"] = chat["id"]

    return chats


@app.get("/api/chats/{chat_id}")
async def get_chat(chat_id: str, user=Depends(get_current_user)):
    """Get a specific chat by ID"""
    chat = db.chats.find_one(
        {
            "$or": [
                {"chat_id": chat_id, "user_id": user["user_id"]},
                {"id": chat_id, "user_id": user["user_id"]},
            ]
        }
    )

    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Convert ObjectId to string for JSON serialization
    if "_id" in chat:
        chat["_id"] = str(chat["_id"])
    if "created_at" in chat:
        chat["created_at"] = chat["created_at"].isoformat()
    if "updated_at" in chat:
        chat["updated_at"] = chat["updated_at"].isoformat()

    # Add chat_id for backward compatibility if using id field
    if "id" in chat and "chat_id" not in chat:
        chat["chat_id"] = chat["id"]

    return chat


class ChatUpdate(BaseModel):
    messages: List[dict]


@app.put("/api/chats/{chat_id}")
async def update_chat(
    chat_id: str, chat_data: ChatUpdate, user=Depends(get_current_user)
):
    """Update chat messages"""
    # Verify the chat belongs to the user
    chat = db.chats.find_one(
        {
            "$or": [
                {"chat_id": chat_id, "user_id": user["user_id"]},
                {"id": chat_id, "user_id": user["user_id"]},
            ]
        }
    )
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Determine which field to use in update
    id_field = "id" if "id" in chat else "chat_id"

    # Update messages and timestamp
    db.chats.update_one(
        {id_field: chat_id},
        {"$set": {"messages": chat_data.messages, "updated_at": datetime.utcnow()}},
    )

    return {"status": "updated"}


@app.get("/")
async def root():
    """Redirect to login page"""
    return RedirectResponse(url="/login")


@app.get("/login")
async def login_page(request: Request):
    """Serve login page"""
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/register")
async def register_page(request: Request):
    """Serve registration page"""
    return templates.TemplateResponse("register.html", {"request": request})


@app.get("/chat")
async def chat_ui(request: Request):
    """Serve main chat UI"""
    return templates.TemplateResponse("chat.html", {"request": request})


@app.get("/chat/{chat_id}")
async def chat_by_id(request: Request, chat_id: str):
    """Serve specific chat by ID"""
    return templates.TemplateResponse(
        "chat.html", {"request": request, "chat_id": chat_id}
    )
