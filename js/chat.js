/**********************************************************/
/* chat.js - Slack-like bottom-floating chat with         */
/* direct messages and group channels, simplified.         */
/* - Initials next to chats for identification.           */
/* - Streamlined channel join on typing.                  */
/* - Leave channel functionality in channel list.          */
/* - Create channel functionality in search.               */
/**********************************************************/

// Make sure you’ve loaded supabase.js and have supabaseClient

/******************************************/
/*  CSS moved to chat.css                  */
/******************************************/


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

// A cache for user info
const userInfoCache = {};

// A real project ID that exists in your 'projects' table
const defaultProjectId = "17beb421-6583-4f34-8919-140b60facb05";

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
/* Create the Base Chat Widget in the DOM    */
/*********************************************/
function initBaseChatWidget() {
  const container = document.createElement("div");
  container.classList.add("chat-container", "base-container");
  container.id = "base-chat-container";

  container.innerHTML = `
    <div class="chat-header" id="base-chat-header">
      <h2>Chats</h2>
      <button class="chat-minimize-btn" id="base-chat-minimize-btn">_</button>
      <button class="chat-close-btn" id="base-chat-close-btn">×</button>
    </div>

    <div class="chat-body">
      <div class="chat-mode-switcher">
        <button class="chat-mode-btn active" id="dm-mode-btn">Direct Messages</button>
        <button class="chat-mode-btn" id="channel-mode-btn">Channels</button>
      </div>

      <div class="chat-body-top" id="base-chat-body-top"></div>

      <!-- Channel and DM lists will be here -->
      <div class="chat-body-list" id="base-chat-body-list"></div>

      <div class="chat-body-feed" id="base-chat-body-feed" style="display:none;"></div>

    </div>
    <div class="chat-footer" id="base-chat-footer">
      <input type="text" id="chat-input-message-base-chat-container" placeholder="Type a message..." />
      <button id="chat-send-btn-base-chat-container">Send</button>
    </div>
  `;

  document.body.appendChild(container);

  // Event listeners for base container
  document.getElementById("base-chat-minimize-btn").addEventListener("click", (e) => onMinimizeClick(e, container));
  document.getElementById("base-chat-header").addEventListener("click", (e) => onHeaderClick(e, container));
  document.getElementById("base-chat-close-btn").addEventListener("click", (e) => onCloseChatContainer(e, container));


  const dmModeBtn = document.getElementById("dm-mode-btn");
  const channelModeBtn = document.getElementById("channel-mode-btn");
  dmModeBtn.addEventListener("click", () => switchMode('dm', container));
  channelModeBtn.addEventListener("click", () => switchMode('channel', container));

  // Send message in base container
  const baseSendBtn = document.getElementById(`chat-send-btn-base-chat-container`);
  baseSendBtn.addEventListener("click", (e) => handleSendMessage(e, container));
  const baseInputMsg = document.getElementById(`chat-input-message-base-chat-container`);
  baseInputMsg.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      handleSendMessage(e, container);
    }
  });

  // Start in DM mode for base container
  switchMode('dm', container);
}

/**************************************************/
/* Open a New Chat Container                      */
/**************************************************/
async function openNewChatContainer(type, targetId) {
  // Check if a container for this chat already exists
  const existingContainerData = additionalContainers.find(c => c.type === type && c.targetId === targetId);
  if (existingContainerData) {
    // Container already exists
    console.log("Chat window already open for this target.");
    return;
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
  let headerButtons = `
      <button class="chat-leave-btn" id="chat-leave-btn-${container.id}" title="Leave Channel"><i class="fa fa-arrow-right"></i></button>
      <button class="chat-close-btn" id="chat-close-btn-${container.id}">×</button>
    `; // Added Leave button back for channel

  if (type === 'dm') {
    const user = await fetchUser(targetId);
    headerTitle = `DM: ${getDisplayName(user)}`;
    headerButtons = `<button class="chat-close-btn" id="chat-close-btn-${container.id}">×</button>`; // DM style buttons - Minimize removed
  } else if (type === 'channel') {
    const channel = await fetchChannel(targetId);
    headerTitle = `#${channel.channel_name}`;
    headerButtons = `<button class="chat-leave-btn" id="chat-leave-btn-${container.id}" title="Leave Channel"><i class="fa fa-arrow-right"></i></button>
      <button class="chat-close-btn" id="chat-close-btn-${container.id}">×</button>`; // Channel style buttons - Minimize removed
  }

  container.innerHTML = `
    <div class="chat-header ${headerShadeClass}" id="chat-header-${container.id}">
      ${headerButtons}
      <h2>${headerTitle}</h2>
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

  // Calculate and set left position so they line up side-by-side
  let totalWidth = 25; // Start with base offset
  additionalContainers.forEach(cData => {
    if (cData !== containerData) {
      totalWidth += cData.container.offsetWidth + 10; // container width + margin
    }
  });
  container.style.left = `${totalWidth}px`;

  // Event listeners for new container
  if (type === 'dm') {
    const headerEl = document.getElementById(`chat-header-${container.id}`);
    headerEl.addEventListener("click", (e) => onHeaderClick(e, container)); // Still allow header click even without minimize for consistent behavior
  } else if (type === 'channel') {
    const leaveBtn = document.getElementById(`chat-leave-btn-${container.id}`);
    leaveBtn.addEventListener("click", (e) => onLeaveChannel(targetId, container));
    const headerEl = document.getElementById(`chat-header-${container.id}`);
    headerEl.addEventListener("click", (e) => onHeaderClickChannel(e, container)); // Keeping separate header click for channel
  }

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
    // Ensure membership, then load messages
    await ensureChannelMembership(targetId);
    loadChannelConversation(targetId, document.getElementById(`chat-body-feed-${container.id}`));

    // IMPORTANT: Refresh the channel list in the base container so it appears for the user
    const baseContainer = document.getElementById('base-chat-container');
    await loadRecentChannels(baseContainer);
    // Optionally switch the base container to 'channel' mode so user sees it right away:
    switchMode('channel', baseContainer);
  }
}

/**************************************************/
/* Ensure Channel Membership                      */
/**************************************************/
async function ensureChannelMembership(channelId) {
  // 1. Query without .single() or .maybeSingle()
  const { data: rows, error } = await supabaseClient
    .from('channel_members')
    .select('*')
    .eq('channel_id', channelId)
    .eq('user_id', currentUser.id);

  if (error) {
    console.error("ensureChannelMembership - Error checking membership:", error);
    return;
  }

  // 2. If we already have a row, do nothing
  if (rows && rows.length > 0) {
    return; // Already a membership row
  }

  // 3. Insert a new membership row if none found
  const { error: joinError } = await supabaseClient
    .from('channel_members')
    .insert([{
      channel_id: channelId,
      user_id: currentUser.id,
      joined_at: new Date().toISOString(),
      is_accepted: true
    }]);

  if (joinError) {
    console.error("Failed to join channel:", joinError);
    alert("Failed to join channel!");
  }
}

/**************************************************/
/* Close a Chat Container                         */
/**************************************************/
function onCloseChatContainer(event, currentContainer) {
  event.stopPropagation(); // Stop header click-minimize

  // Remove from DOM
  currentContainer.remove();

  // Remove from additionalContainers array
  const index = additionalContainers.findIndex(cData => cData.container === currentContainer);
  if (index > -1) {
    additionalContainers.splice(index, 1);
  }

  // Re-align remaining containers
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

  if (!currentContainer) return;
  const dmBtn = currentContainer.querySelector("#dm-mode-btn");
  const chBtn = currentContainer.querySelector("#channel-mode-btn");
  if (dmBtn && chBtn) {
    if (mode === "dm") {
      dmBtn.classList.add("active");
      chBtn.classList.remove("active");
      setupDMUI(currentContainer);
    } else {
      chBtn.classList.add("active");
      dmBtn.classList.remove("active");
      setupChannelUI(currentContainer);
    }
  }
}

/**************************************************/
/* Setup DM and Channel UI                        */
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
  currentContainer.querySelector(".chat-body-feed").style.display = "none";
  await loadRecentDMs(currentContainer);

  const searchInput = currentContainer.querySelector("#dm-search-input");
  const searchBtn = currentContainer.querySelector("#dm-search-button");
  const resultsBox = currentContainer.querySelector("#dm-autocomplete-results");

  searchInput.addEventListener("input", async () => {
    await doDMUserSearch(searchInput, resultsBox, currentContainer);
  });
  searchBtn.addEventListener("click", async () => {
    await doDMUserSearch(searchInput, resultsBox, currentContainer);
  });
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
  const filtered = (data || []).filter(u => u.user_id !== currentUser.id);
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
      openNewChatContainer('dm', userId);
    });
  });
}

async function setupChannelUI(currentContainer) {
  const topEl = currentContainer.querySelector(".chat-body-top");
  topEl.innerHTML = `
    <div class="chat-search-container">
      <div class="chat-search-wrapper">
        <input type="text" class="chat-search-input" id="channel-search-input" placeholder="Search or create channels..." />
        <button class="chat-search-button" id="channel-search-button"><i class="fa fa-plus"></i></button>
        <div class="chat-autocomplete-results" id="channel-autocomplete-results" style="display:none;"></div>
      </div>
    </div>
  `;
  currentContainer.querySelector(".chat-body-feed").style.display = "none";
  await loadRecentChannels(currentContainer);

  // handle channel search and create
  const searchInput = currentContainer.querySelector("#channel-search-input");
  const searchBtn = currentContainer.querySelector("#channel-search-button");
  const resultsBox = currentContainer.querySelector("#channel-autocomplete-results");

  searchInput.addEventListener("input", async () => {
    await doChannelSearch(searchInput, resultsBox, currentContainer);
  });
  searchBtn.addEventListener("click", async () => {
    await doChannelSearch(searchInput, resultsBox, currentContainer);
  });
}

async function doChannelSearch(searchInput, resultsBox, currentContainer) {
  const term = searchInput.value.trim();
  if (!term) {
    resultsBox.style.display = "none";
    resultsBox.innerHTML = "";
    return;
  }

  const { data, error } = await supabaseClient
    .from("channels")
    .select("*")
    .ilike("channel_name", `%${term}%`);

  if (error) {
    console.error("Error searching channels:", error);
    return;
  }

  resultsBox.innerHTML = "";
  if (!data || !data.length) {
    // Option to create a new channel
    const createOption = document.createElement('div');
    createOption.classList.add("chat-autocomplete-item");
    createOption.textContent = `Create new channel '#${term}'`;
    createOption.addEventListener('click', async () => {
      const name = term;
      if (!name) {
        alert("Channel name is required");
        return;
      }
      const { data: channelData, error: createError } = await supabaseClient
        .from("channels")
        .insert([{
          channel_name: name,
          creator_id: currentUser.id,
          project_id: defaultProjectId
        }])
        .select();

      if (createError) {
        console.error("Error creating channel:", createError);
        alert("Failed to create channel!");
        return;
      }
      searchInput.value = `#${name}`;
      resultsBox.style.display = "none";

      // Refresh channel listing, open the new channel
      await loadRecentChannels(currentContainer);
      if (channelData && channelData.length > 0) {
        openNewChatContainer('channel', channelData[0].id);

        // Also refresh the base container list so the user sees new channel:
        const baseContainer = document.getElementById('base-chat-container');
        await loadRecentChannels(baseContainer);
        switchMode('channel', baseContainer);
      }
    });
    resultsBox.appendChild(createOption);
    resultsBox.style.display = "block";
    return;
  }

  // Show channels that match
  data.forEach(ch => {
    const channelItem = document.createElement('div');
    channelItem.classList.add("chat-autocomplete-item");
    channelItem.dataset.channelid = ch.id;
    channelItem.textContent = `#${ch.channel_name}`;
    channelItem.addEventListener('click', async () => {
      const channelId = channelItem.dataset.channelid;
      activeChannelId = channelId;
      searchInput.value = channelItem.textContent;
      resultsBox.style.display = "none";

      // Open the existing channel
      openNewChatContainer('channel', channelId);

      // Also refresh the base container channels so it appears
      const baseContainer = document.getElementById('base-chat-container');
      await loadRecentChannels(baseContainer);
      switchMode('channel', baseContainer);
    });
    resultsBox.appendChild(channelItem);
  });
  resultsBox.style.display = "block";
}

/**************************************************/
/* Let user leave the channel                     */
/**************************************************/
async function onLeaveChannel(channelId, currentContainer) {
  if (!channelId) {
    alert("No channel selected.");
    return;
  }
  const confirmLeave = confirm("Are you sure you want to leave this channel?");
  if (!confirmLeave) return;

  // Delete from channel_members
  const { error } = await supabaseClient
    .from("channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("Error leaving channel:", error);
    alert("Failed to leave channel!");
    return;
  }
  alert("You have left the channel.");

  // Reload channel list in whichever container is passed
  await loadRecentChannels(currentContainer);
  currentContainer.querySelector(".chat-body-feed").style.display = "none";
  activeChannelId = null;

  // If the current open chat is the channel left, close it
  const containerData = additionalContainers.find(c => c.type === 'channel' && c.targetId === channelId);
  if (containerData) {
    onCloseChatContainer(new Event('manualClose'), containerData.container);
  }
}

/**************************************************/
/* Subscriptions for DM + Channel messages        */
/**************************************************/
function initRealtimeSubscriptions() {
  // Direct messages ...
  dmSubscription = supabaseClient
    .channel("direct-messages-changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "direct_messages" },
      payload => {
        const newMsg = payload.new;
        // If we are in DM mode and watching a particular user, refresh
        if (currentMode === "dm" && activeDMUserId) {
          const relevant =
            (newMsg.sender_id === currentUser.id && newMsg.recipient_id === activeDMUserId) ||
            (newMsg.recipient_id === currentUser.id && newMsg.sender_id === activeDMUserId);
          if (relevant) {
            const existingContainer = additionalContainers.find(c => c.type === 'dm' && c.targetId === activeDMUserId);
            const feedElement = existingContainer
              ? document.getElementById(`chat-body-feed-${existingContainer.container.id}`)
              : null;
            if (feedElement) loadDMConversation(activeDMUserId, feedElement);
          }
        }
      }
    )
    .subscribe();

  // Channel messages ...
  channelSubscription = supabaseClient
    .channel("channel-messages-changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      payload => {
        const newMsg = payload.new;
        // If we are in channel mode and watching a particular channel, refresh
        if (currentMode === "channel" && activeChannelId && newMsg.channel_id === activeChannelId) {
          const existingContainer = additionalContainers.find(c => c.type === 'channel' && c.targetId === activeChannelId);
          const feedElement = existingContainer
              ? document.getElementById(`chat-body-feed-${existingContainer.container.id}`)
              : null;
          if (feedElement) loadChannelConversation(activeChannelId, feedElement);
        }
      }
    )
    .subscribe();
}

/**************************************************/
/* Load & Render DM & Channel logic              */
/**************************************************/
async function loadRecentDMs(currentContainer) {
  const listEl = currentContainer.querySelector(".chat-body-list");
  listEl.innerHTML = `<div style="padding:8px; font-size:14px;">Loading recent DMs...</div>`;

  const { data: allDMs, error } = await supabaseClient
    .from("direct_messages")
    .select("*")
    .or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadRecentDMs - Error loading DMs:", error);
    listEl.innerHTML = `<div style="padding:8px;">Failed to load DMs</div>`;
    return;
  }

  if (!allDMs || !allDMs.length) {
    listEl.innerHTML = `<div style="padding:8px;">No recent direct messages yet!</div>`;
    return;
  }

  // Grab the most recent DM with each user
  const recentMap = new Map();
  for (const dm of allDMs) {
    const otherUser = (dm.sender_id === currentUser.id)
      ? dm.recipient_id
      : dm.sender_id;
    if (!recentMap.has(otherUser)) {
      recentMap.set(otherUser, dm);
    }
  }
  const recentList = Array.from(recentMap.values())
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  let html = "";
  for (const dmRow of recentList) {
    const otherUser = (dmRow.sender_id === currentUser.id)
      ? dmRow.recipient_id
      : dmRow.sender_id;
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
      openNewChatContainer('dm', userId);
    });
  });

  // Fill in known user info
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

  // -----------------------------------------------------
  // IMPORTANT FIX: Use messages!channel_id(...) so Supabase
  // recognizes the relationship to messages by channel_id.
  // -----------------------------------------------------
  const { data, error } = await supabaseClient
    .from("channel_members")
    .select(`
      channel_id,
      is_accepted,
      channels (
        id,
        channel_name,
        messages!channel_id (
          created_at
        )
      )
    `)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("loadRecentChannels - Error loading user channels:", error);
    listEl.innerHTML = `<div style="padding:8px;">Failed to load channels</div>`;
    return;
  }

  // Filter out rows where is_accepted === false if that matters
  const acceptedRows = (data || []).filter(row => row.is_accepted !== false);

  if (!acceptedRows.length) {
    listEl.innerHTML = `<div style="padding:8px;">No joined channels. Create one!</div>`;
    return;
  }

  // gather last message times
  const channelsWithTime = acceptedRows.map(r => {
    if (!r.channels) return null;
    let lastMessageTime = 0;
    if (r.channels.messages && r.channels.messages.length) {
      lastMessageTime = Math.max(
        ...r.channels.messages.map(m => new Date(m.created_at).getTime())
      );
    }
    return {
      id: r.channels.id,
      channel_name: r.channels.channel_name,
      lastMessageTime
    };
  }).filter(Boolean);

  channelsWithTime.sort((a,b) => b.lastMessageTime - a.lastMessageTime);

  const html = channelsWithTime.map(ch => {
    const lastDate = ch.lastMessageTime
      ? new Date(ch.lastMessageTime).toLocaleString()
      : "No messages yet";
    return `
      <div class="chat-channel-item" data-ch-id="${ch.id}">
        #${ch.channel_name}
        <br/><small>${lastDate}</small>
      </div>
    `;
  }).join("");
  listEl.innerHTML = html;

  Array.from(listEl.querySelectorAll(".chat-channel-item")).forEach(item => {
    item.addEventListener("click", (e) => {
      const chId = item.getAttribute("data-ch-id");
      openNewChatContainer('channel', chId);
    });
  });
}

/**************************************************/
/* Load DM or Channel conversation                */
/**************************************************/
async function loadDMConversation(userId, feedElement) {
  feedElement.innerHTML = `<div style="padding:8px;">Loading messages...</div>`;
  const orClause = `and(sender_id.eq.${currentUser.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${currentUser.id})`;
  const { data, error } = await supabaseClient
    .from("direct_messages")
    .select("*")
    .or(orClause)
    .order("created_at", { ascending: true });

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
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading channel messages:", error);
    feedElement.innerHTML = `<div style="padding:8px;">Failed to load messages</div>`;
    return;
  }
  renderMessages(data, 'channel', feedElement);
}

/**************************************************/
/* Render messages, handle send, etc.            */
/**************************************************/
async function renderMessages(arr, mode, feedElement) {
  feedElement.innerHTML = "";
  for (const msg of arr) {
    const div = document.createElement("div");
    div.classList.add("chat-message");
    const senderId = (mode === 'dm') ? msg.sender_id : msg.user_id;
    if (senderId === currentUser.id) {
      div.classList.add("sent");
    } else {
      div.classList.add("received");
    }

    // Fetch user info for initials
    const userInfo = await fetchUser(senderId);
    const initials = getInitials(userInfo);

    div.innerHTML = `<span class="user-initials">${initials}</span> ${msg.content || "[No text]"}`;
    feedElement.appendChild(div);
  }
  feedElement.scrollTop = feedElement.scrollHeight;
}

function getInitials(user) {
  if (!user) return '??';
  let name = user.username || user.first_name || user.last_name || 'User';
  const parts = name.split(' ');
  let initials = '';
  if (parts.length >= 2) {
    initials = (parts[0][0] || '') + (parts[1][0] || '');
  } else if (parts.length === 1) {
    initials = (parts[0].substring(0, 2) || '??');
  } else {
    return '??';
  }
  return initials.toUpperCase();
}

async function handleSendMessage(event, currentContainer) {
  const inp = currentContainer.querySelector(".chat-footer input[type='text']");
  const text = inp.value.trim();
  if (!text) return;

  const containerData = additionalContainers.find(c => c.container === currentContainer);
  // If it's actually the base container sending a message, find that
  // (the base container won't be in additionalContainers)
  let isBaseContainer = false;
  if (!containerData && currentContainer.id === 'base-chat-container') {
    isBaseContainer = true;
  }

  if (!containerData && !isBaseContainer) {
    return;
  }

  if (containerData) {
    // Additional container
    if (containerData.type === 'dm') {
      const { error } = await supabaseClient
        .from("direct_messages")
        .insert([{
          sender_id: currentUser.id,
          recipient_id: containerData.targetId,
          content: text
        }]);
      if (error) {
        console.error("Error sending DM:", error);
        return;
      }
      loadDMConversation(containerData.targetId, currentContainer.querySelector('.chat-body-feed'));
    } else if (containerData.type === 'channel') {
      await ensureChannelMembership(containerData.targetId); // ensure membership
      const { error } = await supabaseClient
        .from("messages")
        .insert([{
          channel_id: containerData.targetId,
          user_id: currentUser.id,
          content: text
        }]);
      if (error) {
        console.error("Error sending channel msg:", error);
        return;
      }
      loadChannelConversation(containerData.targetId, currentContainer.querySelector('.chat-body-feed'));
    }
  } else {
    // If needed, handle base container message sending here
    console.log("Base container: no active conversation to send to in this simplified code.");
  }

  inp.value = "";
}

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
  if (
    e.target.classList.contains("chat-close-btn")
  ) return; // Removed minimize button class check

  const minimized = currentContainer.classList.contains("chat-minimized");
  currentContainer.classList.toggle("chat-minimized", !minimized);
}

function onHeaderClickChannel(e, currentContainer) {
  if (
    e.target.classList.contains("chat-leave-btn") ||
    e.target.classList.contains("chat-close-btn")
  ) return; // Removed minimize button class check

  const minimized = currentContainer.classList.contains("chat-minimized");
  currentContainer.classList.toggle("chat-minimized", !minimized);
}


/**************************************************/
/* Utility fetch & cache user info               */
/**************************************************/
async function fetchAndCacheMultipleUsers(userIds) {
  const needed = userIds.filter(id => !userInfoCache[id]);
  if (!needed.length) return;
  const { data, error } = await supabaseClient
    .from("affiliations")
    .select("id, user_id, username, first_name, last_name")
    .in("user_id", needed);
  if (error) {
    console.error("Error fetch users:", error);
    return;
  }
  for (const row of data || []) {
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
  const full = (first_name || "") + " " + (last_name || "");
  return full.trim() || "[No name]";
}