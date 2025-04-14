// Global variables
let conversation = [];
let currentChatId = null;
let isNewChat = true;
let unsavedMessages = []; // Track messages that haven't been saved to DB yet
// dualResponseProbability and enableDualResponses is now injected from the server

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

// Add this function to generate a random boolean based on probability
function shouldGenerateDualResponses() {
  if (!enableDualResponses) return false;
  return Math.random() < dualResponseProbability;
}

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
    unsavedMessages = []; // Reset unsaved messages

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

// Add a single message to the database
async function saveMessage(message) {
  if (!currentChatId) return false;

  try {
    const endpoint = `/api/chats/${currentChatId}/messages`;
    await apiCall(endpoint, "POST", { message });
    return true;
  } catch (error) {
    console.error("Error saving message:", error);
    return false;
  }
}

// Process and save unsaved messages
async function processUnsavedMessages() {
  if (unsavedMessages.length === 0) return;

  // Process one message at a time to maintain order
  const message = unsavedMessages[0];
  const success = await saveMessage(message);

  if (success) {
    // Remove from unsaved list if successfully saved
    unsavedMessages.shift();

    // Continue processing remaining messages
    if (unsavedMessages.length > 0) {
      await processUnsavedMessages();
    }
  } else {
    console.error("Failed to save message, will retry later:", message);
  }
}

// Extract signature and message ID from assistant response
function extractSignatureData(response) {
  // Look for the special signature block at the end of the message
  const signatureMatch = response.match(
    /__MESSAGE_ID__:([^\n]+)\n__SIGNATURE__:([^\n]+)/
  );

  if (signatureMatch && signatureMatch.length === 3) {
    // Remove the signature block from the visible message
    const cleanContent = response
      .replace(/__MESSAGE_ID__:[^\n]+\n__SIGNATURE__:[^\n]+/, "")
      .trim();

    return {
      content: cleanContent,
      message_id: signatureMatch[1],
      signature: signatureMatch[2],
    };
  }

  // If no signature found (should not happen)
  return {
    content: response,
    message_id: null,
    signature: null,
  };
}

// Add functions to handle the dual responses UI
function addDualResponsesContainer(id) {
  const container = document.createElement("div");
  container.id = `dual-responses-${id}`;
  container.classList.add("dual-responses-container");

  container.innerHTML = `
    <div class="dual-responses-header">
      <i class="fa-solid fa-robot"></i>
      <span>Which response do you like most?...</span>
    </div>
    <div class="dual-responses-content">
      <div class="response-column" id="response1-${id}">
        <div class="response-header">Option A</div>
        <div class="response-content">Generating...</div>
      </div>
      <div class="response-column" id="response2-${id}">
        <div class="response-header">Option B</div>
        <div class="response-content">Generating...</div>
      </div>
    </div>
    <div class="dual-responses-footer" id="choice-buttons-${id}" style="display: none;">
      <p>Which response do you prefer?</p>
      <div class="choice-buttons">
        <button class="choice-button" id="choose-response1-${id}">Choose A</button>
        <button class="choice-button" id="choose-response2-${id}">Choose B</button>
      </div>
    </div>
  `;

  messagesContainer.appendChild(container);
  scrollToBottom();
}

function enhanceMarkdownFormatting(content) {
  if (!content) return content;

  let enhanced = content;

  // if you see "punctuation" + "1 space" + only 1 ("*" or "-") or ("Number" + "."), replace space with newline
  // enhanced = enhanced.replace(/([.,;:!?])\s+([*+-]|\d+\.)/g, "$1\n$2");

  // if there is no new line then "**" then "some text" then "**" and then "new line", add new line in the beginning
  // enhanced = enhanced.replace(/(^|\n)(\*\*.*?\*\*)\n/g, "$1\n$2\n");

  return enhanced;
}

function updateResponseInDualContainer(elementId, content) {
  const responseElement = document.getElementById(elementId);
  if (responseElement) {
    const contentElement = responseElement.querySelector(".response-content");
    if (contentElement) {
      contentElement.innerHTML = marked.parse(
        enhanceMarkdownFormatting(content)
      );
    }
  }
}

function showResponseChoiceButtons(id, response1, response2) {
  const buttonsContainer = document.getElementById(`choice-buttons-${id}`);
  if (buttonsContainer) {
    buttonsContainer.style.display = "block";

    // Add event listeners to the buttons
    const button1 = document.getElementById(`choose-response1-${id}`);
    const button2 = document.getElementById(`choose-response2-${id}`);

    if (button1 && button2) {
      button1.addEventListener("click", () => {
        window.chooseResponse(id, response1, response2);
      });

      button2.addEventListener("click", () => {
        window.chooseResponse(id, response2, response1);
      });
    }
  }
}

function removeDualResponsesContainer(id) {
  const container = document.getElementById(`dual-responses-${id}`);
  if (container) {
    container.remove();
  }
}

// Function to submit pairwise feedback to the backend
async function submitPairwiseFeedback(
  prompt,
  chosenResponse,
  rejectedResponse
) {
  try {
    const feedbackData = {
      prompt: prompt,
      chosen_response: chosenResponse,
      rejected_response: rejectedResponse,
      chat_id: currentChatId,
    };

    await apiCall("/api/feedback/pairwise", "POST", feedbackData);
    console.log("Feedback submitted successfully");
  } catch (error) {
    console.error("Error submitting feedback:", error);
  }
}

// Function to handle dual response generation
async function generateDualResponses(userPrompt) {
  // Show a container for the two responses
  const dualResponsesId = Date.now();
  addDualResponsesContainer(dualResponsesId);

  // Generate two responses in parallel
  const response1Promise = generateSingleResponse(
    userPrompt,
    `response1-${dualResponsesId}`
  );
  const response2Promise = generateSingleResponse(
    userPrompt,
    `response2-${dualResponsesId}`
  );

  // Wait for both to complete
  const [response1, response2] = await Promise.all([
    response1Promise,
    response2Promise,
  ]);

  if (!response1 || !response2) {
    // If either response failed, fall back to single response
    removeDualResponsesContainer(dualResponsesId);

    // Start over with single response if we had a failure
    if (!response1 && !response2) {
      return await generateSingleResponse(userPrompt);
    }

    // Use whichever response succeeded
    return response1 || response2;
  }

  // Show choice buttons
  showResponseChoiceButtons(dualResponsesId, response1, response2);

  // Return a promise that will resolve when the user makes a choice
  return new Promise((resolve) => {
    // Store the resolve function on the container for later use
    const container = document.getElementById(
      `dual-responses-${dualResponsesId}`
    );
    container.dataset.resolveFunction = true;

    // Set up event handler to resolve when choice is made
    window.chooseResponse = (responseId, chosenResponse, rejectedResponse) => {
      // Remove the container once a choice is made
      removeDualResponsesContainer(responseId);

      // Submit feedback about which response was chosen/rejected
      submitPairwiseFeedback(userPrompt, chosenResponse, rejectedResponse);

      // Return the chosen response
      resolve(chosenResponse);
    };
  });
}

// Function to generate a single response
async function generateSingleResponse(userPrompt, responseElementId = null) {
  try {
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

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    // Variables to collect the response
    let assistantResponse = "";

    // If we're generating for dual responses, update the corresponding element
    // Otherwise, add a new message to UI
    const messageId = responseElementId || addMessageToUI("assistant", "");

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Convert chunk to string
      const chunk = decoder.decode(value, { stream: true });

      // Update assistant message
      assistantResponse += chunk;

      // Extract signature and update UI
      const { content } = extractSignatureData(assistantResponse);

      // Update UI with the clean content (without signature)
      if (responseElementId) {
        // Update in dual response container
        updateResponseInDualContainer(responseElementId, content);
      } else {
        // Normal update in message UI
        updateMessageInUI(messageId, content);
      }

      // Scroll to bottom as new content arrives
      scrollToBottom();
    }

    // Process the full response with signature
    const { content, message_id, signature } =
      extractSignatureData(assistantResponse);

    // Create the assistant message with verification data
    const assistantMessage = {
      role: "assistant",
      content: content,
      message_id: message_id,
      signature: signature,
    };

    // If this is a regular response (not part of dual), add it to conversation
    if (!responseElementId) {
      // Add to conversation array
      conversation.push(assistantMessage);

      // Add to unsaved messages
      unsavedMessages.push(assistantMessage);

      // Save the assistant message to database
      await processUnsavedMessages();
    }

    return assistantMessage;
  } catch (error) {
    console.error("Error generating response:", error);

    if (!responseElementId) {
      // Only show error for main responses, not dual ones
      addMessageToUI(
        "system",
        `Error: ${error.message || "Could not connect to the assistant"}`
      );
    }

    return null;
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

  // Create user message
  const userMessage = {
    role: "user",
    content: text,
  };

  // Add user message to conversation
  conversation.push(userMessage);

  // Add user message to unsaved list
  unsavedMessages.push(userMessage);

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

  // Save user message to database
  await processUnsavedMessages();

  // Scroll to bottom
  scrollToBottom();

  try {
    let assistantMessage;

    // Determine if we should show dual responses
    if (shouldGenerateDualResponses()) {
      // Show typing indicator initially
      const assistantId = Date.now();
      addTypingIndicator(assistantId);

      // Generate dual responses
      assistantMessage = await generateDualResponses(text);

      // Remove typing indicator after dual responses are complete
      removeTypingIndicator(assistantId);

      // Add the chosen message to the chat
      addMessageToUI("assistant", assistantMessage.content);

      // Add to conversation array
      conversation.push(assistantMessage);

      // Add to unsaved messages
      unsavedMessages.push(assistantMessage);

      // Save the assistant message to database
      await processUnsavedMessages();
    } else {
      // Normal single response flow
      // Show typing indicator
      const assistantId = Date.now();
      addTypingIndicator(assistantId);

      // Generate single response
      assistantMessage = await generateSingleResponse(text);

      // Remove typing indicator
      removeTypingIndicator(assistantId);
    }
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

  messageBubble.innerHTML = marked.parse(enhanceMarkdownFormatting(content));

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
      '<i class="fas fa-info-circle"></i> It is always better to consult a healthcare professional for personalized medical advice.';
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
    messageBubble.innerHTML = marked.parse(enhanceMarkdownFormatting(content));
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

function scrollToBottom() {
  // messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Start a new chat
function startNewChat() {
  // Reset conversation
  conversation = [];
  unsavedMessages = [];

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
