// Global variables
let conversation = [];
let currentChatId = null;
let isNewChat = true;

// DOM elements
const messagesContainer = document.getElementById("messages-container");
const userInput = document.getElementById("user-input");
const chatForm = document.getElementById("chat-form");
const sendButton = document.getElementById("send-btn");
const newChatButton = document.getElementById("new-chat-btn");
const mobileMenuButton = document.getElementById("mobile-menu-btn");
const sidebar = document.querySelector(".sidebar");
const chatTitle = document.getElementById("chat-title");
const chatHistoryList = document.getElementById("chat-history-list");

// Helper for API calls
async function apiCall(endpoint, method = "GET", data = null) {
  const token = localStorage.getItem("auth_token");
  if (!token) {
    window.location.href = "/login";
    return null;
  }

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  if (data) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(data);
    console.log("API Call to", endpoint, "with data:", data);
  }

  try {
    const response = await fetch(endpoint, options);

    if (response.status === 401) {
      // Unauthorized - redirect to login
      localStorage.removeItem("auth_token");
      window.location.href = "/login";
      return null;
    }

    // Handle 500 errors specifically
    if (response.status === 500) {
      let errorMsg = "Internal server error";
      try {
        // Try to get error message from response
        const text = await response.text();
        console.error("Server error:", text);
        if (text.includes("detail")) {
          try {
            const jsonError = JSON.parse(text);
            errorMsg = jsonError.detail || errorMsg;
          } catch (e) {
            // If can't parse JSON, extract from text
            const match = text.match(/"detail":"([^"]+)"/);
            if (match && match[1]) {
              errorMsg = match[1];
            }
          }
        }
      } catch (e) {
        console.error("Error parsing error response:", e);
      }
      throw new Error(errorMsg);
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error("API Error Response:", errorData);
      throw new Error(errorData.detail || "API call failed");
    }

    const responseData = await response.json();
    console.log("API Response from", endpoint, ":", responseData);
    return responseData;
  } catch (error) {
    console.error("API call error:", error);
    return null;
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  // Focus on input
  userInput.focus();

  // Auto resize textarea as user types
  userInput.addEventListener("input", autoResizeTextarea);

  // Check URL for chat ID
  const pathParts = window.location.pathname.split("/");
  if (pathParts.length > 2 && pathParts[1] === "chat") {
    const chatId = pathParts[2];
    loadChat(chatId);
  }
});

// Form submission
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});

// New chat button
newChatButton.addEventListener("click", () => {
  startNewChat();
});

// Mobile menu toggle
mobileMenuButton.addEventListener("click", () => {
  sidebar.classList.toggle("active");
});

// Auto resize textarea
function autoResizeTextarea() {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 200) + "px";
}

// Load chat history
async function loadChatHistory() {
  try {
    const history = await apiCall("/api/chats");

    if (!history || history.length === 0) {
      chatHistoryList.innerHTML =
        '<div class="history-item">No chat history</div>';
      return;
    }

    // Clear loading message
    chatHistoryList.innerHTML = "";

    // Add history items
    history.forEach((chat) => {
      const historyItem = document.createElement("div");
      historyItem.classList.add("history-item");
      // Use chat_id which may come from either id or chat_id field
      historyItem.dataset.chatId = chat.chat_id;

      if (currentChatId === chat.chat_id) {
        historyItem.classList.add("active");
      }

      historyItem.innerHTML = `
              <i class="fa-regular fa-comment"></i>
              ${chat.title}
          `;

      historyItem.addEventListener("click", () => {
        loadChat(chat.chat_id);
      });

      chatHistoryList.appendChild(historyItem);
    });
  } catch (error) {
    console.error("Error loading chat history:", error);
    chatHistoryList.innerHTML =
      '<div class="history-item">Error loading history</div>';
  }
}

// Load specific chat
async function loadChat(chatId) {
  try {
    const chat = await apiCall(`/api/chats/${chatId}`);

    if (!chat) {
      console.error("Chat not found");
      return;
    }

    // Update URL without reloading page
    window.history.pushState({}, "", `/chat/${chatId}`);

    // Update global variables
    currentChatId = chatId;
    isNewChat = false;
    conversation = chat.messages || [];

    // Update chat title
    chatTitle.textContent = chat.title;

    // Clear messages container
    messagesContainer.innerHTML = "";

    // Display messages
    conversation.forEach((msg) => {
      if (msg.role !== "system") {
        addMessageToUI(msg.role, msg.content);
      }
    });

    // Update active state in history list
    const historyItems = document.querySelectorAll(".history-item");
    historyItems.forEach((item) => {
      item.classList.remove("active");
      if (item.dataset.chatId === chatId) {
        item.classList.add("active");
      }
    });

    // Scroll to bottom
    scrollToBottom();

    // Close mobile sidebar
    sidebar.classList.remove("active");
  } catch (error) {
    console.error("Error loading chat:", error);
  }
}

// Create a new chat
async function createNewChat(title) {
  try {
    console.log("Creating new chat with title:", title);
    const result = await apiCall("/api/chats", "POST", { title: title });

    if (!result) {
      throw new Error("Failed to create new chat");
    }

    currentChatId = result.chat_id;
    isNewChat = false;

    // Update URL
    window.history.pushState({}, "", `/chat/${currentChatId}`);

    // Update chat title
    chatTitle.textContent = title;

    // Refresh history list
    loadChatHistory();

    return result.chat_id;
  } catch (error) {
    console.error("Error creating new chat:", error);
    // Display error to user
    addMessageToUI("system", `Error: ${error.message}`);
    return null;
  }
}

// Update chat in database
async function updateChat() {
  if (!currentChatId) return;

  try {
    console.log("Updating chat with ID:", currentChatId);
    await apiCall(`/api/chats/${currentChatId}`, "PUT", {
      messages: conversation,
    });
  } catch (error) {
    console.error("Error updating chat:", error);
  }
}

// Send message function
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // Clear and reset input
  userInput.value = "";
  userInput.style.height = "auto";
  userInput.focus();

  // Disable input while processing
  userInput.disabled = true;
  sendButton.disabled = true;

  // Remove welcome screen if present
  const welcomeScreen = document.querySelector(".welcome-screen");
  if (welcomeScreen) {
    welcomeScreen.remove();
  }

  // Add user message to conversation
  conversation.push({ role: "user", content: text });

  // Display user message
  addMessageToUI("user", text);

  // Check if this is a new chat and create it in the database
  if (isNewChat) {
    const title = text.length > 30 ? text.substring(0, 30) + "..." : text;
    const chatId = await createNewChat(title);

    if (!chatId) {
      // If chat creation failed, show error and enable input
      addMessageToUI(
        "system",
        "Error: Could not create a new chat. Please try again."
      );
      userInput.disabled = false;
      sendButton.disabled = false;
      return;
    }
  }

  // Scroll to bottom
  scrollToBottom();

  try {
    // Show typing indicator
    const assistantId = Date.now();
    addTypingIndicator(assistantId);

    // Prepare request to the server
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
      },
      body: JSON.stringify(conversation),
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    // Remove typing indicator
    removeTypingIndicator(assistantId);

    // Create empty assistant message
    let assistantMessage = { role: "assistant", content: "" };

    // Add to conversation
    conversation.push(assistantMessage);

    // Add empty message to UI
    const messageId = addMessageToUI("assistant", "");

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Convert chunk to string
      const chunk = decoder.decode(value, { stream: true });

      // Update assistant message
      assistantMessage.content += chunk;

      // Update UI
      updateMessageInUI(messageId, assistantMessage.content);

      // Scroll to bottom as new content arrives
      scrollToBottom();
    }

    // Update chat in database
    updateChat();
  } catch (error) {
    console.error("Error:", error);
    addMessageToUI(
      "system",
      `Error: ${error.message || "Could not connect to the assistant"}`
    );
  } finally {
    // Re-enable input
    userInput.disabled = false;
    sendButton.disabled = false;

    // Scroll to bottom once more
    scrollToBottom();
  }
}

// Add message to UI
function addMessageToUI(role, content) {
  const messageId = Date.now();

  const messageWrapper = document.createElement("div");
  messageWrapper.classList.add("message-wrapper", role);
  messageWrapper.id = `message-${messageId}`;

  const messageContent = document.createElement("div");
  messageContent.classList.add("message-content");

  // Create avatar
  const avatar = document.createElement("div");
  avatar.classList.add("avatar", role);

  if (role === "user") {
    // User avatar with icon
    const icon = document.createElement("i");
    icon.classList.add("fa-solid", "fa-user");
    avatar.appendChild(icon);
  } else if (role === "assistant") {
    // Assistant avatar with logo
    const img = document.createElement("img");
    img.src = "/static/img/llama-logo.png";
    img.onerror = function () {
      // Fallback to icon if image can't load
      this.remove();
      const icon = document.createElement("i");
      icon.classList.add("fa-solid", "fa-user-doctor");
      avatar.appendChild(icon);
    };
    avatar.appendChild(img);
  } else if (role === "system") {
    // System message avatar
    const icon = document.createElement("i");
    icon.classList.add("fa-solid", "fa-shield-alt");
    avatar.appendChild(icon);
  }

  // Check for urgent medical content
  let isUrgent = false;
  if (
    role === "assistant" &&
    (content.toLowerCase().includes("emergency") ||
      content.toLowerCase().includes("urgent") ||
      content.toLowerCase().includes("call 911") ||
      content.toLowerCase().includes("immediate medical attention"))
  ) {
    isUrgent = true;
    messageWrapper.classList.add("urgent");
  }

  // Message text container
  const messageText = document.createElement("div");
  messageText.classList.add("message-text");

  // Create message bubble
  const messageBubble = document.createElement("div");
  messageBubble.classList.add("message-bubble");

  // Add urgent warning if needed
  if (isUrgent) {
    const urgentLabel = document.createElement("div");
    urgentLabel.classList.add("urgent-label");
    urgentLabel.innerHTML =
      '<i class="fas fa-exclamation-triangle"></i> Urgent Medical Information';
    messageText.appendChild(urgentLabel);
  }

  messageBubble.textContent = content;

  // Add disclaimer for certain medical advice
  if (
    role === "assistant" &&
    (content.toLowerCase().includes("treatment") ||
      content.toLowerCase().includes("diagnosis") ||
      content.toLowerCase().includes("medication") ||
      content.toLowerCase().includes("therapy"))
  ) {
    const disclaimer = document.createElement("div");
    disclaimer.classList.add("message-disclaimer");
    disclaimer.innerHTML =
      '<i class="fas fa-info-circle"></i> This information is for educational purposes only and does not constitute medical advice.';
    messageText.appendChild(disclaimer);
  }

  messageText.appendChild(messageBubble);
  messageContent.appendChild(avatar);
  messageContent.appendChild(messageText);
  messageWrapper.appendChild(messageContent);
  messagesContainer.appendChild(messageWrapper);

  return messageId;
}

// Update existing message in UI
function updateMessageInUI(messageId, content) {
  const messageBubble = document.querySelector(
    `#message-${messageId} .message-bubble`
  );
  if (messageBubble) {
    messageBubble.textContent = content;
  }
}

// Add typing indicator
function addTypingIndicator(id) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message-wrapper", "assistant");
  wrapper.id = `typing-${id}`;

  const content = document.createElement("div");
  content.classList.add("message-content");

  // Create avatar
  const avatar = document.createElement("div");
  avatar.classList.add("avatar", "assistant");

  // Assistant avatar with logo
  const img = document.createElement("img");
  img.src = "/static/img/llama-logo.png";
  img.onerror = function () {
    // Fallback to icon if image can't load
    this.remove();
    const icon = document.createElement("i");
    icon.classList.add("fa-solid", "fa-user-doctor");
    avatar.appendChild(icon);
  };
  avatar.appendChild(img);

  // Message text container
  const messageText = document.createElement("div");
  messageText.classList.add("message-text");

  const indicator = document.createElement("div");
  indicator.classList.add("typing-indicator");
  indicator.innerHTML = "<span>LLM Doctor is analyzing</span>";

  messageText.appendChild(indicator);
  content.appendChild(avatar);
  content.appendChild(messageText);
  wrapper.appendChild(content);
  messagesContainer.appendChild(wrapper);

  scrollToBottom();
}

// Remove typing indicator
function removeTypingIndicator(id) {
  const indicator = document.getElementById(`typing-${id}`);
  if (indicator) {
    indicator.remove();
  }
}

// Scroll to bottom of messages
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Start a new chat
function startNewChat() {
  // Reset conversation
  conversation = [];

  // Reset variables
  currentChatId = null;
  isNewChat = true;

  // Update URL
  window.history.pushState({}, "", "/chat");

  // Update chat title
  chatTitle.textContent = "New Medical Consultation";

  // Clear UI
  messagesContainer.innerHTML = `
      <div class="welcome-screen">
          <img src="/static/img/llama-logo.png" alt="LLM Doctor Logo" class="welcome-logo" onerror="this.src='https://via.placeholder.com/100'">
          <h2>How can I help you with your health today?</h2>
      </div>
  `;

  // Update active state in history list
  const historyItems = document.querySelectorAll(".history-item");
  historyItems.forEach((item) => {
    item.classList.remove("active");
  });

  // Close mobile sidebar if open
  sidebar.classList.remove("active");

  // Focus on input
  userInput.focus();
}

// Handle Enter key for sending message
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Load chat history when page loads
loadChatHistory();
