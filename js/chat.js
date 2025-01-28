/**********************************************************/
/* chat.js - Slack-like bottom-floating chat with         */
/* direct messages and group channels, plus channel invites. */
/* - "Leave Channel" button on the left, "Invite" (+) on right. */
/* - Overlays for accepting/denying channel invites.           */
/* - Multiple minimizable chat containers                 */
/* - Prevents duplicate chat windows, close button, header shading */
/**********************************************************/

// Make sure you’ve loaded supabase.js and have supabaseClient
// Also ensure your channel_members has a column is_accepted BOOLEAN DEFAULT true
// to represent pending (false) vs accepted (true) membership

/******************************************/
/* Inlined CSS for the new features       */
/******************************************/
// Because you want them "cohesive," let's inject minimal additional styling:
const styleEl = document.createElement("style");
styleEl.textContent = `
  /* Modified chat container for multiple instances */
  .chat-container {
    position: fixed;
    bottom: 0;
    right: 25px;
    width: 320px; /* Slightly narrower */
    height: 480px;
    font-family: 'Inter', sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    border-radius: 8px 8px 0 0;
    overflow: hidden;
    z-index: 9999;
    display: flex; /* For minimize button alignment */
    flex-direction: column;
    background-color: #fff;
    transition: all 0.3s ease;
    margin-left: 10px; /* Space between containers */
  }

  .chat-container.base-container {
    right: 25px; /* Base container stays on the right */
    left: auto;
  }

  .additional-chat-container {
    right: auto; /* Additional containers go to the left */
    left: 25px; /* Start from the left */
    margin-left: 330px; /* Adjust based on width + margin */
  }

  /* Shade differentiation */
  .chat-container.shade-1 { background-color: #f9f9f9; }
  .chat-container.shade-2 { background-color: #f2f2f2; }
  .chat-container.shade-3 { background-color: #e8e8e8; }
  .chat-container.shade-4 { background-color: #dfdfdf; }

  .chat-container.chat-minimized {
    height: 42px;
    width: 240px;
    border-radius: 8px;
    overflow: hidden;
  }

  /* Header */
  .chat-header {
    background-color: #606c38;
    color: #fff;
    padding: 10px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between; /* Distribute space to position buttons */
    position: relative; /* For close button positioning */
  }

  /* Header shading */
  .chat-header.header-shade-1 { background-color: rgba(96, 108, 56, 1); } /* Base color */
  .chat-header.header-shade-2 { background-color: rgba(96, 108, 56, 0.8); }
  .chat-header.header-shade-3 { background-color: rgba(96, 108, 56, 0.6); }
  .chat-header.header-shade-4 { background-color: rgba(96, 108, 56, 0.4); }

  .chat-header h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    user-select: none;
    overflow: hidden; /* For long titles */
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 70%; /* Prevent title from pushing minimize button too far */
  }

  .chat-header .chat-minimize-btn {
    background: none;
    border: none;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    margin-right: 5px; /* Add some space between minimize and close */
  }

  .chat-header .chat-close-btn {
    background: none;
    border: none;
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    opacity: 0.7;
  }

  .chat-header .chat-close-btn:hover {
    opacity: 1;
  }


  /* Body: includes mode switcher, top bar, user/channel list, message feed */
  .chat-body {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    background-color: #fff;
  }

  .chat-mode-switcher {
    display: flex;
    gap: 2px;
    background-color: #f7f7f7;
    border-bottom: 1px solid #ccc;
    padding: 6px;
  }

  .chat-mode-btn {
    flex: 1;
    padding: 8px;
    cursor: pointer;
    text-align: center;
    font-size: 14px;
    border: none;
    background-color: #e8e8e8;
    color: #333;
    font-weight: 500;
    transition: background-color 0.2s;
    border-radius: 4px;
  }
  .chat-mode-btn.active {
    background-color: #fff;
    font-weight: 600;
    box-shadow: 0 0 2px rgba(0,0,0,0.1);
  }
  .chat-mode-btn:hover {
    background-color: #ddd;
  }

  /* Body top section: used for searching or channel creation */
  .chat-body-top {
    padding: 8px;
    border-bottom: 1px solid #ddd;
    min-height: 65px; /* Enough space for a search box or create form */
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  /* A more custom search style */
  .chat-search-container {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chat-search-wrapper {
    flex: 1;
    position: relative;
  }

  .chat-search-input {
    width: 100%;
    padding: 8px 40px 8px 12px; /* space for the icon on the right */
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
    outline: none;
  }

  .chat-search-input:focus {
    border-color: #606c38;
  }

  .chat-search-button {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 38px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 15px;
    color: #666;
  }
  .chat-search-button:hover {
    color: #333;
  }

  /* The user/channel list area */
  .chat-body-list {
    flex-shrink: 0;
    overflow-y: auto;
    max-height: 120px;
    border-bottom: 1px solid #ddd;
  }

  .chat-user-item,
  .chat-channel-item {
    padding: 8px;
    font-size: 14px;
    border-bottom: 1px solid #eee;
    cursor: pointer;
  }
  .chat-user-item:hover,
  .chat-channel-item:hover {
    background-color: #fafafa;
  }
  .chat-user-item.active,
  .chat-channel-item.active {
    background-color: #e6f4ea;
  }

  /* The message feed */
  .chat-body-feed {
    flex-grow: 1;
    overflow-y: auto;
    background-color: #f9f9f9;
    display: flex;
    flex-direction: column;
    padding: 8px;
  }

  /* Each message bubble */
  .chat-message {
    max-width: 70%;
    padding: 8px 10px;
    margin-bottom: 6px;
    border-radius: 16px;
    line-height: 1.4;
    font-size: 14px;
    word-wrap: break-word;
    display: inline-block;
  }

  .chat-message.sent {
    align-self: flex-end;
    background-color: #3a5a40;
    color: #fff;
    border-top-right-radius: 4px;
  }

  .chat-message.received {
    align-self: flex-start;
    background-color: #fff;
    border: 1px solid #ddd;
    color: #333;
    border-top-left-radius: 4px;
  }

  /* Chat footer (input area) */
  .chat-footer {
    background-color: #fff;
    padding: 8px;
    border-top: 1px solid #ccc;
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .chat-footer input[type="text"] {
    flex-grow: 1;
    padding: 8px;
    font-size: 14px;
    border-radius: 4px;
    border: 1px solid #ddd;
    outline: none;
  }

  .chat-footer input[type="text"]:focus {
    border-color: #606c38;
  }

  .chat-footer button {
    background-color: #606c38;
    color: #fff;
    border: none;
    padding: 8px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  }
  .chat-footer button:hover {
    background-color: #283618;
  }

  /* Invite autocomplete container */
  .invite-autocomplete-container {
    position: relative;
    margin-top: 8px;
    display: none; /* shown only when user clicks + */
    background-color: #fff;
    padding: 8px;
    border: 1px solid #ddd;
  }
  .invite-autocomplete-container.visible {
    display: block;
  }
  .invite-autocomplete-input {
    width: 100%;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .invite-autocomplete-results {
    position: absolute;
    left: 0; right: 0;
    margin-top: 2px;
    border: 1px solid #ddd;
    background-color: #fff;
    max-height: 150px;
    overflow-y: auto;
    z-index: 9999;
  }
  .invite-autocomplete-item {
    padding: 8px;
    cursor: pointer;
  }
  .invite-autocomplete-item:hover {
    background-color: #f0f0f0;
  }

  /* Accept/Deny Overlay at bottom of chat container */
  .invite-overlay {
    position: absolute;
    bottom: 60px; /* just above chat-footer which is ~40px high */
    left: 0;
    right: 0;
    margin: auto;
    width: 320px;
    background-color: #fff;
    border: 1px solid #ccc;
    box-shadow: 0 2px 8px rgba(0,0,0,.2);
    border-radius: 6px;
    padding: 12px;
    display: none; /* hidden by default */
    z-index: 10000; /* above everything else in the chat container */
    text-align: center;
  }
  .invite-overlay.visible {
    display: block;
  }
  .invite-overlay h3 {
    font-size: 16px;
    margin-bottom: 10px;
  }
  .invite-overlay button {
    margin: 0 8px;
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .invite-overlay button.accept-btn {
    background-color: #3a5a40;
    color: #fff;
  }
  .invite-overlay button.accept-btn:hover {
    background-color: #283618;
  }
  .invite-overlay button.deny-btn {
    background-color: #ccc;
    color: #333;
  }
  .invite-overlay button.deny-btn:hover {
    background-color: #bbb;
  }


  /* Autocomplete box for direct message searching */
  .chat-autocomplete-results {
    position: absolute;
    top: 41px;
    left: 0;
    right: 0;
    background-color: #fff;
    border: 1px solid #ddd;
    z-index: 99999;
    max-height: 150px;
    overflow-y: auto;
    border-radius: 4px;
  }

  .chat-autocomplete-item {
    padding: 8px;
    cursor: pointer;
    font-size: 14px;
  }
  .chat-autocomplete-item:hover {
    background-color: #f0f0f0;
  }
  .chat-no-results {
    padding: 8px;
    color: #999;
    font-style: italic;
  }
`;
document.head.appendChild(styleEl);

/**********************************************************/
/* The rest of your existing code, plus enhancements      */
/**********************************************************/

let currentUser = null;
let chatMinimized = false;
let currentMode = 'dm';  // or 'channel'
let activeDMUserId = null;
let activeChannelId = null;
let dmSubscription = null;
let channelSubscription = null;

// A cache for user info (as before)
const userInfoCache = {};

// A real project ID that exists in your 'projects' table
const defaultProjectId = "17beb421-6583-4f34-8919-140b60facb05";

// We'll also track invites that the current user might accept/deny
// We'll do a real-time subscription for channel_members changes where is_accepted=false and user_id=the current user

// Track additional chat containers
const additionalContainers = [];
const maxAdditionalContainers = 4;

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (!session || !session.user) {
    console.warn("No user session found");
    return;
  }
  currentUser = session.user;

  initBaseChatWidget(); // Initialize the base chat widget
  initRealtimeSubscriptions();
});

/*********************************************/
/* Create the Base Chat Widget in the DOM      */
/*********************************************/
function initBaseChatWidget() {
  const container = document.createElement("div");
  container.classList.add("chat-container", "base-container"); // Added base-container class
  container.id = "base-chat-container"; // More specific ID

  container.innerHTML = `
    <div class="chat-header" id="base-chat-header">
      <h2>Chats</h2>
      <button class="chat-minimize-btn" id="base-chat-minimize-btn">_</button>
    </div>

    <div class="chat-body">
      <div class="chat-mode-switcher">
        <button class="chat-mode-btn active" id="dm-mode-btn">Direct Messages</button>
        <button class="chat-mode-btn" id="channel-mode-btn">Channels</button>
      </div>

      <div class="chat-body-top" id="base-chat-body-top"></div>

      <!--
        We'll keep the channel list or DM list here,
        plus message feed below
      -->
      <div class="chat-body-list" id="base-chat-body-list"></div>

      <!-- The top area of feed for channel: leave + invite -->
      <div class="channel-action-bar" id="base-channel-action-bar" style="display:none;">
        <button class="leave-channel-btn" id="base-leave-channel-btn">Leave Channel</button>
        <button class="invite-channel-btn" id="base-invite-channel-btn"><i class="fa fa-plus"></i></button>
      </div>

      <!-- The invite autocomplete hidden by default -->
      <div class="invite-autocomplete-container" id="base-invite-container">
        <input type="text" class="invite-autocomplete-input" id="base-invite-input" placeholder="Invite user by name..." />
        <div class="invite-autocomplete-results" id="base-invite-results" style="display:none;"></div>
      </div>

      <div class="chat-body-feed" id="base-chat-body-feed" style="display:none;"></div>
    </div>
  `; // Removed chat-footer from base container

  document.body.appendChild(container);

  // Event listeners for base container
  document.getElementById("base-chat-minimize-btn").addEventListener("click", (e) => onMinimizeClick(e, container));
  document.getElementById("base-chat-header").addEventListener("click", (e) => onHeaderClick(e, container));

  const dmModeBtn = document.getElementById("dm-mode-btn");
  const channelModeBtn = document.getElementById("channel-mode-btn");
  dmModeBtn.addEventListener("click", () => switchMode('dm', container)); // Pass container
  channelModeBtn.addEventListener("click", () => switchMode('channel', container)); // Pass container

  // Channel action bar for base container
  const leaveBtn = document.getElementById("base-leave-channel-btn");
  leaveBtn.addEventListener("click", (e) => onLeaveChannel(e, container)); // Pass container

  const inviteBtn = document.getElementById("base-invite-channel-btn");
  inviteBtn.addEventListener("click", (e) => toggleInviteContainer(e, container)); // Pass container

  // Invite container for base container
  const inviteContainer = document.getElementById("base-invite-container");
  const inviteInput = document.getElementById("base-invite-input");
  const inviteResults = document.getElementById("base-invite-results");

  inviteInput.addEventListener("input", async () => {
    const term = inviteInput.value.trim();
    if (!term) {
      inviteResults.style.display = "none";
      return;
    }
    // search
    const { data, error } = await supabaseClient
      .from("affiliations")
      .select("id, user_id, username, first_name, last_name")
      .or(`username.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
      .neq("user_id", currentUser.id); // exclude self

    if (error) {
      console.error("Error searching for invite:", error);
      return;
    }
    if (!data || !data.length) {
      inviteResults.innerHTML = `<div class="invite-autocomplete-item">No users found</div>`;
      inviteResults.style.display = "block";
      return;
    }
    inviteResults.innerHTML = data.map(u => {
      const displayName = getDisplayName(u);
      return `<div class="invite-autocomplete-item" data-uid="${u.user_id}">${displayName}</div>`;
    }).join("");
    inviteResults.style.display = "block";

    // handle item clicks
    Array.from(inviteResults.querySelectorAll(".invite-autocomplete-item")).forEach(item => {
      item.addEventListener("click", async () => {
        const userId = item.getAttribute("data-uid");
        await inviteUserToChannel(userId, container); // Pass container
      });
    });
  });

  // Invite overlay accept/deny (these are shared, no need to pass container)
  document.getElementById("invite-accept-btn").addEventListener("click", acceptChannelInvite);
  document.getElementById("invite-deny-btn").addEventListener("click", denyChannelInvite);

  // Start in DM mode for base container
  switchMode('dm', container); // Pass container
}

/**************************************************/
/* Open a New Chat Container                     */
/**************************************************/
async function openNewChatContainer(type, targetId) {
  // Check if a container for this chat already exists
  const existingContainerData = additionalContainers.find(c => c.type === type && c.targetId === targetId);
  if (existingContainerData) {
    // Container already exists, maybe focus it or just do nothing
    console.log("Chat window already open for this target.");
    return; // Or focus the existing container if you have a way to track focus
  }

  if (additionalContainers.length >= maxAdditionalContainers) {
    alert("Maximum number of additional chats reached (4).");
    return;
  }

  let container = document.createElement("div");
  container.classList.add("chat-container", "additional-chat-container");
  container.id = `chat-container-${additionalContainers.length + 1}`; // Unique ID

  // Apply shade class to container and header
  const shadeIndex = (additionalContainers.length + 1) % 4 || 4; // Cycle through 1-4
  const shadeClass = `shade-${shadeIndex}`;
  const headerShadeClass = `header-shade-${shadeIndex}`;
  container.classList.add(shadeClass);


  let headerTitle = "";
  if (type === 'dm') {
    const user = await fetchUser(targetId);
    headerTitle = `DM: ${getDisplayName(user)}`;
  } else if (type === 'channel') {
    const channel = await fetchChannel(targetId);
    headerTitle = `#${channel.channel_name}`;
  }

  container.innerHTML = `
    <div class="chat-header ${headerShadeClass}" id="chat-header-${container.id}">
      <button class="chat-minimize-btn" id="chat-minimize-btn-${container.id}">_</button>
      <h2>${headerTitle}</h2>
      <button class="chat-close-btn" id="chat-close-btn-${container.id}">×</button>
    </div>

    <div class="chat-body">
      <div class="chat-body-feed" id="chat-body-feed-${container.id}"></div>
    </div>

    <div class="chat-footer" id="chat-footer-${container.id}">
      <input type="text" id="chat-input-message-${container.id}" placeholder="Type a message..." />
      <button id="chat-send-btn-${container.id}">Send</button>
    </div>
  `;

  document.body.appendChild(container);
  const containerData = { container, type, targetId };
  additionalContainers.push(containerData);

  // Calculate and set left position
  let totalWidth = 25; // Start with base offset
  additionalContainers.forEach(cData => {
    if (cData !== containerData) { // Don't include current container in calculation
      totalWidth += cData.container.offsetWidth + 10; // Container width + margin
    }
  });
  container.style.left = `${totalWidth}px`;


  // Event listeners for new container
  const minimizeBtn = document.getElementById(`chat-minimize-btn-${container.id}`);
  minimizeBtn.addEventListener("click", (e) => onMinimizeClick(e, container));
  const headerEl = document.getElementById(`chat-header-${container.id}`);
  headerEl.addEventListener("click", (e) => onHeaderClick(e, container));
  const sendBtn = document.getElementById(`chat-send-btn-${container.id}`);
  sendBtn.addEventListener("click", (e) => handleSendMessage(e, container));
  const inputMsg = document.getElementById(`chat-input-message-${container.id}`);
  inputMsg.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      handleSendMessage(e, container);
    }
  });
  const closeBtn = document.getElementById(`chat-close-btn-${container.id}`);
  closeBtn.addEventListener("click", (e) => onCloseChatContainer(e, container));


  if (type === 'dm') {
    loadDMConversation(targetId, document.getElementById(`chat-body-feed-${container.id}`));
  } else if (type === 'channel') {
    loadChannelConversation(targetId, document.getElementById(`chat-body-feed-${container.id}`));
  }
}

/**************************************************/
/* Close a Chat Container                         */
/**************************************************/
function onCloseChatContainer(event, currentContainer) {
  event.stopPropagation(); // Stop header click minimize from also firing

  // Remove from DOM
  currentContainer.remove();

  // Remove from additionalContainers array
  const index = additionalContainers.findIndex(cData => cData.container === currentContainer);
  if (index > -1) {
    additionalContainers.splice(index, 1);
  }

  // Re-align remaining containers (optional, if you want to close gaps)
  reAlignChatContainers();
}

/**************************************************/
/* Re-align chat containers after closing one     */
/**************************************************/
function reAlignChatContainers() {
  let totalWidth = 25; // Starting left offset
  additionalContainers.forEach(cData => {
    cData.container.style.left = `${totalWidth}px`;
    totalWidth += cData.container.offsetWidth + 10;
  });
}


/**************************************************/
/* Switch between DM mode and Channel mode        */
/**************************************************/
function switchMode(mode, currentContainer) {
  currentMode = mode;
  activeDMUserId = null;
  activeChannelId = null;

  const dmBtn = currentContainer.querySelector("#dm-mode-btn");
  const chBtn = currentContainer.querySelector("#channel-mode-btn");
  const inviteBar = currentContainer.querySelector(".channel-action-bar");


  if (mode === "dm") {
    dmBtn.classList.add("active");
    chBtn.classList.remove("active");
    setupDMUI(currentContainer);
    inviteBar.style.display = "none";
    currentContainer.querySelector(".invite-autocomplete-container").classList.remove("visible");
  } else {
    chBtn.classList.add("active");
    dmBtn.classList.remove("active");
    setupChannelUI(currentContainer);
    inviteBar.style.display = "flex"; // Show invite button in channel mode
  }
}

/**************************************************/
/* Setup DM and Channel UI                       */
/**************************************************/
async function setupDMUI(currentContainer) {
  const topEl = currentContainer.querySelector(".chat-body-top");
  topEl.innerHTML = `
    <div class="chat-search-container">
      <div class="chat-search-wrapper">
        <input type="text" class="chat-search-input" id="dm-search-input" placeholder="Search by username or name..." />
        <button class="chat-search-button" id="dm-search-button"><i class="fa fa-search"></i></button>
        <div class="chat-autocomplete-results" id="dm-autocomplete-results" style="display:none;"></div>
      </div>
    </div>
  `;
  currentContainer.querySelector(".chat-body-feed").style.display = "none"; // Hide feed in base container
  await loadRecentDMs(currentContainer);
}

async function doDMUserSearch(searchInput, resultsBox, currentContainer) {
  const term = searchInput.value.trim();
  if (!term) {
    resultsBox.style.display = "none";
    return;
  }
  const { data, error } = await supabaseClient
    .from("affiliations")
    .select("id, user_id, username, first_name, last_name")
    .or(`username.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`);

  if (error) {
    console.error("Error searching DM users:", error);
    return;
  }
  const filtered = (data||[]).filter(u => u.user_id !== currentUser.id);
  if (!filtered.length) {
    resultsBox.innerHTML = `<div class="chat-no-results">No matching users</div>`;
    resultsBox.style.display = "block";
    return;
  }
  resultsBox.innerHTML = filtered.map(u => {
    const name = getDisplayName(u);
    return `<div class="chat-autocomplete-item" data-userid="${u.user_id}">${name}</div>`;
  }).join("");
  resultsBox.style.display = "block";

  Array.from(resultsBox.querySelectorAll(".chat-autocomplete-item")).forEach(item => {
    item.addEventListener("click", async () => {
      const userId = item.getAttribute("data-userid");
      activeDMUserId = userId;
      searchInput.value = item.innerText;
      resultsBox.style.display = "none";
      openNewChatContainer('dm', userId); // Open new container on DM selection
    });
  });
}

async function setupChannelUI(currentContainer) {
  const topEl = currentContainer.querySelector(".chat-body-top");
  topEl.innerHTML = `
    <div class="chat-search-container">
      <div class="chat-search-wrapper">
        <input type="text" class="chat-search-input" id="channel-search-input" placeholder="Channel name..." />
        <button class="chat-search-button" id="create-channel-button"><i class="fa fa-plus"></i></button>
      </div>
    </div>
  `;
  currentContainer.querySelector(".chat-body-feed").style.display = "none"; // Hide feed in base container
  await loadRecentChannels(currentContainer);
}

/**************************************************/
/* On channel click, show leave/invite bar, etc.  */
/**************************************************/
function showChannelActionBar(chId, currentContainer) {
  activeChannelId = chId;
  const bar = currentContainer.querySelector(".channel-action-bar");
  bar.style.display = "flex"; // show
  // Hide the invite container if open
  currentContainer.querySelector(".invite-autocomplete-container").classList.remove("visible");
}

/**************************************************/
/* Toggling the invite container in a channel     */
/**************************************************/
function toggleInviteContainer(event, currentContainer) {
  const cont = currentContainer.querySelector(".invite-autocomplete-container");
  cont.classList.toggle("visible");
  // Clear input
  currentContainer.querySelector(".invite-autocomplete-input").value = "";
  currentContainer.querySelector(".invite-autocomplete-results").style.display = "none";
}

/**************************************************/
/* Invite a user to the active channel            */
/**************************************************/
async function inviteUserToChannel(userId, currentContainer) {
  if (!activeChannelId) {
    alert("No active channel selected!");
    return;
  }
  // Insert into channel_members with is_accepted=false
  const { error } = await supabaseClient
    .from("channel_members")
    .insert([
      {
        channel_id: activeChannelId,
        user_id: userId,
        joined_at: new Date().toISOString(),
        // is_accepted: false (if your schema supports it)
        is_accepted: false
      }
    ]);
  if (error) {
    console.error("Error inviting user:", error);
    alert("Failed to invite user!");
    return;
  }
  alert("Invitation sent!");
  toggleInviteContainer(null, currentContainer);
}

/**************************************************/
/* Let user leave the channel                     */
/**************************************************/
async function onLeaveChannel(event, currentContainer) {
  if (!activeChannelId) {
    alert("No active channel selected.");
    return;
  }
  const confirmLeave = confirm("Are you sure you want to leave this channel?");
  if (!confirmLeave) return;

  // Delete from channel_members
  const { error } = await supabaseClient
    .from("channel_members")
    .delete()
    .eq("channel_id", activeChannelId)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("Error leaving channel:", error);
    alert("Failed to leave channel!");
    return;
  }
  alert("You have left the channel.");
  // Reload channel list
  await loadRecentChannels(currentContainer);
  currentContainer.querySelector(".channel-action-bar").style.display = "none";
  currentContainer.querySelector(".chat-body-feed").style.display = "none";
  activeChannelId = null;
}

/**************************************************/
/* Accept or deny channel invite overlay          */
/**************************************************/
let pendingInviteRow = null; // store the row that the user is responding to

async function acceptChannelInvite() {
  if (!pendingInviteRow) return;
  // Update is_accepted = true
  const { error } = await supabaseClient
    .from("channel_members")
    .update({ is_accepted: true })
    .eq("channel_id", pendingInviteRow.channel_id)
    .eq("user_id", pendingInviteRow.user_id);
  if (error) {
    console.error("Error accepting invite:", error);
    alert("Failed to accept invite!");
    return;
  }
  closeInviteOverlay();
  pendingInviteRow = null;
  alert("Invite accepted! You have joined the channel.");
  // Optionally reload channels
  await loadRecentChannels(document.getElementById('base-chat-container')); // Reload in base container
}

async function denyChannelInvite() {
  if (!pendingInviteRow) return;
  // Remove row entirely
  const { error } = await supabaseClient
    .from("channel_members")
    .delete()
    .eq("channel_id", pendingInviteRow.channel_id)
    .eq("user_id", pendingInviteRow.user_id);
  if (error) {
    console.error("Error denying invite:", error);
    alert("Failed to deny invite!");
    return;
  }
  closeInviteOverlay();
  pendingInviteRow = null;
  alert("Invite denied.");
}

/**************************************************/
/* Show the accept/deny overlay                   */
/**************************************************/
function showInviteOverlay(row) {
  pendingInviteRow = row;
  const overlay = document.getElementById("invite-overlay");
  overlay.classList.toggle('visible', currentMode === 'channel'); // Only show if in channel mode
  if (currentMode === 'channel') {
      overlay.querySelector("#invite-overlay-text").textContent =
        `You have been invited to channel ${row.channel_id}. Accept?`;
      overlay.classList.add("visible");
  } else {
      overlay.classList.remove("visible");
  }
}


/**************************************************/
/* Hide the accept/deny overlay                   */
/**************************************************/
function closeInviteOverlay() {
  document.getElementById("invite-overlay").classList.remove("visible");
}

/**************************************************/
/* Subscriptions & detect channel invites         */
/**************************************************/
function initRealtimeSubscriptions() {
  // Direct messages as before ...
  dmSubscription = supabaseClient
    .channel("direct-messages-changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "direct_messages" },
      payload => {
        const newMsg = payload.new;
        if (currentMode === "dm" && activeDMUserId) {
          const relevant =
            (newMsg.sender_id === currentUser.id && newMsg.recipient_id === activeDMUserId) ||
            (newMsg.recipient_id === currentUser.id && newMsg.sender_id === activeDMUserId);
          if (relevant) {
            // Find the relevant container and load conversation there if open, otherwise base container
            const existingContainer = additionalContainers.find(c => c.type === 'dm' && c.targetId === activeDMUserId);
            const feedElement = existingContainer ? document.getElementById(`chat-body-feed-${existingContainer.container.id}`) : null; // Do not load in base container
            if(feedElement) loadDMConversation(activeDMUserId, feedElement);
          }
        }
      }
    )
    .subscribe();

  // Channel messages as before ...
  channelSubscription = supabaseClient
    .channel("channel-messages-changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      payload => {
        const newMsg = payload.new;
        if (currentMode === "channel" && activeChannelId && newMsg.channel_id === activeChannelId) {
          // Find the relevant container and load conversation there if open, otherwise base container
          const existingContainer = additionalContainers.find(c => c.type === 'channel' && c.targetId === activeChannelId);
          const feedElement = existingContainer ? document.getElementById(`chat-body-feed-${existingContainer.container.id}`) : null; // Do not load in base container
          if(feedElement) loadChannelConversation(activeChannelId, feedElement);
        }
      }
    )
    .subscribe();

  // 3) **Channel membership** subscription for invites
  // If a new row is inserted with user_id = currentUser.id and is_accepted=false, show overlay
  supabaseClient
    .channel("channel-invites")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "channel_members" },
      async payload => {
        const row = payload.new;
        // If this row belongs to me, and is_accepted=false => overlay
        if (row.user_id === currentUser.id && row.is_accepted === false) {
          showInviteOverlay(row);
        }
      }
    )
    .subscribe();
}

/**************************************************/
/* Load & Render DM & Channel logic from before   */
/**************************************************/
async function loadRecentDMs(currentContainer) {
  // (same logic as you had for listing recent DMs sorted by date)
  // plus post-processing to replace userId with username
  const listEl = currentContainer.querySelector(".chat-body-list");
  listEl.innerHTML = `<div style="padding:8px; font-size:14px;">Loading recent DMs...</div>`;

  const { data: allDMs, error } = await supabaseClient
    .from("direct_messages")
    .select("*")
    .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading DMs:", error);
    listEl.innerHTML = `<div style="padding:8px;">Failed to load DMs</div>`;
    return;
  }

  if (!allDMs || !allDMs.length) {
    listEl.innerHTML = `<div style="padding:8px;">No recent direct messages yet!</div>`;
    return;
  }

  const recentMap = new Map();
  for (const dm of allDMs) {
    const otherUser = (dm.sender_id === currentUser.id) ? dm.recipient_id : dm.sender_id;
    if (!recentMap.has(otherUser)) {
      recentMap.set(otherUser, dm);
    }
  }
  const recentList = Array.from(recentMap.values()).sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));

  let html = "";
  for (const dmRow of recentList) {
    const otherUser = (dmRow.sender_id === currentUser.id) ? dmRow.recipient_id : dmRow.sender_id;
    html += `
      <div class="chat-user-item" data-userid="${otherUser}">
        <span id="dm-name-${otherUser}">DM with user: ${otherUser}</span>
        <br/>
        <small>${new Date(dmRow.created_at).toLocaleString()}</small>
      </div>
    `;
  }
  listEl.innerHTML = html;
  const items = listEl.querySelectorAll(".chat-user-item");
  items.forEach(item => {
    item.addEventListener("click", async () => {
      const userId = item.getAttribute("data-userid");
      activeDMUserId = userId;
      openNewChatContainer('dm', userId); // Open new container on DM selection
    });
  });

  const uniqueUserIds = Array.from(recentMap.keys());
  await fetchAndCacheMultipleUsers(uniqueUserIds);
  for (const userId of uniqueUserIds) {
    const labelEl = document.getElementById(`dm-name-${userId}`);
    if (labelEl && userInfoCache[userId]) {
      labelEl.textContent = "DM with: " + getDisplayName(userInfoCache[userId]);
    }
  }
}

async function loadRecentChannels(currentContainer) {
  const listEl = currentContainer.querySelector(".chat-body-list");
  listEl.innerHTML = `<div style="padding:8px; font-size:14px;">Loading channels...</div>`;

  const { data, error } = await supabaseClient
    .from("channel_members")
    .select(`
      channel_id,
      is_accepted,
      channels (
        id,
        channel_name,
        messages (
          created_at
        )
      )
    `)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("Error loading user channels:", error);
    listEl.innerHTML = `<div style="padding:8px;">Failed to load channels</div>`;
    return;
  }

  // Filter out the ones where is_accepted=false => not accepted yet
  const acceptedRows = (data||[]).filter(row => row.is_accepted !== false);

  if (!acceptedRows.length) {
    listEl.innerHTML = `<div style="padding:8px;">No joined channels. Create or accept an invite!</div>`;
    return;
  }

  // gather last message times
  const channelsWithTime = acceptedRows.map(r => {
    if (!r.channels) return null;
    let lastMessageTime=0;
    if (r.channels.messages && r.channels.messages.length) {
      lastMessageTime = Math.max(...r.channels.messages.map(m=> new Date(m.created_at).getTime()));
    }
    return {
      id: r.channels.id,
      channel_name: r.channels.channel_name,
      lastMessageTime
    };
  }).filter(Boolean);

  channelsWithTime.sort((a,b)=> b.lastMessageTime - a.lastMessageTime);

  const html = channelsWithTime.map(ch => {
    const lastDate = ch.lastMessageTime? new Date(ch.lastMessageTime).toLocaleString() : "No messages yet";
    return `
      <div class="chat-channel-item" data-ch-id="${ch.id}">
        #${ch.channel_name}
        <br/><small>${lastDate}</small>
      </div>
    `;
  }).join("");
  listEl.innerHTML = html;

  Array.from(listEl.querySelectorAll(".chat-channel-item")).forEach(item => {
    item.addEventListener("click", () => {
      const chId = item.getAttribute("data-ch-id");
      openNewChatContainer('channel', chId); // Open new container on channel selection
    });
  });
}

/**************************************************/
/* Load DM or Channel conversation as before      */
/**************************************************/
async function loadDMConversation(userId, feedElement) {
  feedElement.innerHTML = `<div style="padding:8px;">Loading messages...</div>`;
  const orClause = `and(sender_id.eq.${currentUser.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${currentUser.id})`;
  const { data, error } = await supabaseClient
    .from("direct_messages")
    .select("*")
    .or(orClause)
    .order("created_at",{ ascending: true});
  if (error) {
    console.error("Error loading DMs:", error);
    feedElement.innerHTML = `<div style="padding:8px;">Failed to load messages</div>`;
    return;
  }
  renderMessages(data, 'dm', feedElement);
}

async function loadChannelConversation(chId, feedElement) {
  feedElement.innerHTML = `<div style="padding:8px;">Loading channel messages...</div>`;
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("channel_id", chId)
    .order("created_at",{ ascending: true});
  if (error) {
    console.error("Error loading channel messages:", error);
    feedElement.innerHTML = `<div style="padding:8px;">Failed to load messages</div>`;
    return;
  }
  renderMessages(data,'channel', feedElement);
}

/**************************************************/
/* Render messages, handle send, etc.            */
/**************************************************/
function renderMessages(arr, mode, feedElement) {
  feedElement.innerHTML="";
  arr.forEach(msg => {
    const div = document.createElement("div");
    div.classList.add("chat-message");
    const senderId = mode==='dm'? msg.sender_id : msg.user_id;
    if (senderId===currentUser.id) {
      div.classList.add("sent");
    } else {
      div.classList.add("received");
    }
    div.innerHTML = msg.content || "[No text]";
    feedElement.appendChild(div);
  });
  feedElement.scrollTop = feedElement.scrollHeight;
}

async function handleSendMessage(event, currentContainer) {
  const inp = currentContainer.querySelector(".chat-footer input[type='text']");
  const text = inp.value.trim();
  if (!text) return;

  const containerData = additionalContainers.find(c => c.container === currentContainer);
  if (!containerData) return;

  if (containerData.type === 'dm') {
    const { error } = await supabaseClient
      .from("direct_messages")
      .insert([{ sender_id: currentUser.id, recipient_id: containerData.targetId, content: text }]);
    if (error) {
      console.error("Error sending DM:", error);
      return;
    }
    loadDMConversation(containerData.targetId, currentContainer.querySelector('.chat-body-feed'));
  } else if (containerData.type === 'channel') {
    const { error } = await supabaseClient
      .from("messages")
      .insert([{ channel_id: containerData.targetId, user_id: currentUser.id, content: text }]);
    if (error) {
      console.error("Error sending channel msg:", error);
      return;
    }
    loadChannelConversation(containerData.targetId, currentContainer.querySelector('.chat-body-feed'));
  }
  inp.value = "";
}


/**************************************************/
/* Minimization, etc.                             */
/**************************************************/
function onMinimizeClick(e, currentContainer) {
  e.stopPropagation();
  chatMinimized = !chatMinimized;
  if (chatMinimized) {
    currentContainer.classList.add("chat-minimized");
  } else {
    currentContainer.classList.remove("chat-minimized");
  }
}

function onHeaderClick(e, currentContainer) {
  if (e.target.classList.contains("chat-minimize-btn") || e.target.classList.contains("chat-close-btn")) return;
  const minimized = currentContainer.classList.contains("chat-minimized");
  currentContainer.classList.toggle("chat-minimized", !minimized);
}


/**************************************************/
/* Utility fetch & cache user info               */
/**************************************************/
async function fetchAndCacheMultipleUsers(userIds) {
  const needed = userIds.filter(id=> !userInfoCache[id]);
  if (!needed.length) return;
  const { data, error } = await supabaseClient
    .from("affiliations")
    .select("id, user_id, username, first_name, last_name")
    .in("user_id", needed);
  if (error) {
    console.error("Error fetch users:", error);
    return;
  }
  for (const row of data||[]) {
    userInfoCache[row.user_id] = row;
  }
}

async function fetchUser(userId) {
  if (userInfoCache[userId]) return userInfoCache[userId];
  const { data, error } = await supabaseClient
    .from("affiliations")
    .select("id, user_id, username, first_name, last_name")
    .eq("user_id", userId)
    .single();
  if (error) {
    console.error("Error fetching user:", error);
    return null;
  }
  userInfoCache[userId] = data;
  return data;
}

async function fetchChannel(channelId) {
  const { data, error } = await supabaseClient
    .from("channels")
    .select("id, channel_name")
    .eq("id", channelId)
    .single();
  if (error) {
    console.error("Error fetching channel:", error);
    return null;
  }
  return data;
}


function getDisplayName(u) {
  if (!u) return "[Unknown]";
  const { username, first_name, last_name } = u;
  if (username) return username;
  const full = (first_name||"") + " " + (last_name||"");
  return full.trim() || "[No name]";
}