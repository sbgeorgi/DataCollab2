/**********************************************************
 * chat.js – Slack‑like bottom‑floating chat with DM’s and
 * channels.
 *
 * This version now prevents opening multiple windows for 
 * the same DM/channel and adds a “reply” feature (like in 
 * WhatsApp) so that a user may click a reply button on a 
 * message to show a visual reply preview and send a reply.
 *
 * Assumes supabaseClient is already loaded.
 **********************************************************/

let currentUser = null;
let currentMode = 'dm'; // "dm" or "channel"
let activeDMUserId = null;
let activeChannelId = null;
let dmSubscription = null;
let channelSubscription = null;

// Cache for user info
const userInfoCache = {};

// A real project ID that exists in your 'projects' table
const defaultProjectId = "17beb421-6583-4f34-8919-140b60facb05";

// Track additional chat containers (max 4)
const additionalContainers = [];
const maxAdditionalContainers = 4;

/** Debounce helper (from version 2) */
const debounce = (fn, delay = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

/** Format a timestamp nicely */
const formatTimestamp = ts => new Date(ts).toLocaleString();

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !session || !session.user) {
    console.warn("No user session found or error:", sessionError);
    return;
  }
  currentUser = session.user;
  initBaseChatWidget();
  initRealtimeSubscriptions();
});

/**************************************************
 * Create the Base Chat Widget (no message input)
 **************************************************/
function initBaseChatWidget() {
  const container = document.createElement("section");
  container.classList.add("chat-container", "base-container");
  container.id = "base-chat-container";
  container.setAttribute("role", "complementary");

  container.innerHTML = `
    <header class="chat-header" id="base-chat-header">
      <h2>Chats</h2>
      <div class="header-buttons">
        <button class="chat-close-btn" id="base-chat-close-btn" title="Close Chats" aria-label="Close Chats">×</button>
      </div>
    </header>
    <div class="chat-body">
      <div class="chat-mode-switcher">
        <button class="chat-mode-btn active" id="dm-mode-btn" title="Direct Messages" aria-label="Direct Messages">Direct Messages</button>
        <button class="chat-mode-btn" id="channel-mode-btn" title="Channels" aria-label="Channels">Channels</button>
      </div>
      <div class="chat-body-top" id="base-chat-body-top"></div>
      <div class="chat-body-list" id="base-chat-body-list">
        <div style="padding:8px; font-size:14px;">Loading...</div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // Event listeners for the base container
  const baseHeader = container.querySelector("#base-chat-header");
  const closeBtn = container.querySelector("#base-chat-close-btn");
  const dmModeBtn = container.querySelector("#dm-mode-btn");
  const chModeBtn = container.querySelector("#channel-mode-btn");

  baseHeader.addEventListener("click", e => onHeaderClick(e, container));
  closeBtn.addEventListener("click", e => onCloseChatContainer(e, container, false));
  dmModeBtn.addEventListener("click", () => switchMode('dm', container));
  chModeBtn.addEventListener("click", () => switchMode('channel', container));

  // Start in DM mode
  switchMode('dm', container);
}

/**************************************************
 * Open a New Chat Container (DM or Channel)
 * – Prevents duplicate windows for the same target.
 **************************************************/
async function openNewChatContainer(type, targetId) {
  // Check if a container for this target is already open.
  const existing = additionalContainers.find(c => c.type === type && c.targetId === targetId);
  if (existing) {
    console.log("Chat window already open for this target.");
    // Optionally, bring that container to focus
    existing.container.classList.add("active-chat");
    setTimeout(() => existing.container.classList.remove("active-chat"), 1000);
    return;
  }
  if (additionalContainers.length >= maxAdditionalContainers) {
    alert("Maximum number of additional chats reached (4).");
    return;
  }

  const container = document.createElement("section");
  container.classList.add("chat-container", "additional-chat-container");
  container.id = `chat-container-${additionalContainers.length + 1}`;
  // Cycle through shade classes (1–4)
  const shadeIndex = ((additionalContainers.length + 1) % 4) || 4;
  container.classList.add(`shade-${shadeIndex}`);

  let headerHTML = "";
  if (type === 'dm') {
    const user = await fetchUser(targetId);
    const title = `DM: ${getDisplayName(user)}`;
    // DM header: centered title with close button (right‑aligned)
    headerHTML = `
      <header class="chat-header header-shade-${shadeIndex}" id="chat-header-${container.id}">
        <h2>${title}</h2>
        <div class="header-buttons">
          <button class="chat-close-btn" id="chat-close-btn-${container.id}" title="Close Chat" aria-label="Close Chat">×</button>
        </div>
      </header>
    `;
  } else if (type === 'channel') {
    const channel = await fetchChannel(targetId);
    const title = `#${channel.channel_name}`;
    // Channel header: leave arrow (left), centered title, close button (right)
    headerHTML = `
      <header class="chat-header header-shade-${shadeIndex}" id="chat-header-${container.id}">
        <button class="chat-leave-btn" id="chat-leave-btn-${container.id}" title="Leave Channel" aria-label="Leave Channel"><i class="fa fa-arrow-left"></i></button>
        <h2>${title}</h2>
        <div class="header-buttons">
          <button class="chat-close-btn" id="chat-close-btn-${container.id}" title="Close Chat" aria-label="Close Chat">×</button>
        </div>
      </header>
    `;
  }

  // Additional containers include a message input footer with a reply preview area.
  container.innerHTML = `
    ${headerHTML}
    <div class="chat-body">
      <div class="chat-body-feed" id="chat-body-feed-${container.id}">
        <div style="padding:8px;">Loading messages...</div>
      </div>
      <footer class="chat-footer" id="chat-footer-${container.id}">
        <div class="chat-reply-preview" id="chat-reply-preview-${container.id}" style="display:none;">
          <span class="chat-reply-text"></span>
          <button class="chat-reply-cancel" title="Cancel reply">x</button>
        </div>
        <input type="text" id="chat-input-message-${container.id}" placeholder="Type a message..." aria-label="Message Input" />
        <button id="chat-send-btn-${container.id}" aria-label="Send Message">Send</button>
      </footer>
    </div>
  `;
  document.body.appendChild(container);

  const containerData = { container, type, targetId };
  additionalContainers.push(containerData);
  reAlignChatContainers();

  // Event listeners for additional container:
  const headerEl = container.querySelector(`#chat-header-${container.id}`);
  headerEl.addEventListener("click", e => onHeaderClick(e, container));
  const closeBtn = container.querySelector(`#chat-close-btn-${container.id}`);
  closeBtn.addEventListener("click", e => onCloseChatContainer(e, container, false));
  if (type === 'channel') {
    const leaveBtn = container.querySelector(`#chat-leave-btn-${container.id}`);
    leaveBtn.addEventListener("click", e => onLeaveChannel(targetId, container));
  }
  const sendBtn = container.querySelector(`#chat-send-btn-${container.id}`);
  sendBtn.addEventListener("click", e => handleSendMessage(e, container));
  const inputMsg = container.querySelector(`#chat-input-message-${container.id}`);
  inputMsg.addEventListener("keyup", e => {
    if (e.key === "Enter") handleSendMessage(e, container);
  });
  // Cancel reply button
  const cancelReplyBtn = container.querySelector(".chat-reply-cancel");
  cancelReplyBtn.addEventListener("click", () => clearReplyMessage(container));

  // Load the conversation using the proven (v1) logic.
  if (type === 'dm') {
    loadDMConversation(targetId, container.querySelector('.chat-body-feed'));
  } else if (type === 'channel') {
    await ensureChannelMembership(targetId);
    loadChannelConversation(targetId, container.querySelector('.chat-body-feed'));
    // Also refresh the base container channel list
    const baseContainer = document.getElementById('base-chat-container');
    await loadRecentChannels(baseContainer);
    switchMode('channel', baseContainer);
  }
}

/**************************************************
 * Ensure Channel Membership (from v1)
 **************************************************/
async function ensureChannelMembership(channelId) {
  const { data: rows, error } = await supabaseClient
    .from('channel_members')
    .select('*')
    .eq('channel_id', channelId)
    .eq('user_id', currentUser.id);

  if (error) {
    console.error("ensureChannelMembership - Error checking membership:", error);
    return;
  }
  if (rows && rows.length > 0) return; // Already a member

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

/**************************************************
 * Close a Chat Container
 **************************************************/
function onCloseChatContainer(event, currentContainer, requireConfirm = false) {
  event.stopPropagation();
  currentContainer.remove();
  const index = additionalContainers.findIndex(cData => cData.container === currentContainer);
  if (index > -1) {
    additionalContainers.splice(index, 1);
  }
  reAlignChatContainers();
}

/**************************************************
 * Re-align chat containers after one is closed
 **************************************************/
function reAlignChatContainers() {
  let totalWidth = 25;
  additionalContainers.forEach(cData => {
    cData.container.style.left = `${totalWidth}px`;
    totalWidth += cData.container.offsetWidth + 10;
  });
}

/**************************************************
 * Switch between DM and Channel mode in base container
 **************************************************/
function switchMode(mode, currentContainer) {
  currentMode = mode;
  activeDMUserId = null;
  activeChannelId = null;
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

/**************************************************
 * Setup DM UI in Base Container (uses v2 markup)
 **************************************************/
async function setupDMUI(currentContainer) {
  const topEl = currentContainer.querySelector(".chat-body-top");
  topEl.innerHTML = `
    <div class="chat-search-container">
      <div class="chat-search-wrapper">
        <input type="text" class="chat-search-input" id="dm-search-input" placeholder="Search by username or name..." aria-label="Search DM Users" />
        <button class="chat-search-button" id="dm-search-button" title="Search" aria-label="Search"><i class="fa fa-search"></i></button>
        <div class="chat-autocomplete-results" id="dm-autocomplete-results" style="display:none;"></div>
      </div>
    </div>
  `;
  const listEl = currentContainer.querySelector(".chat-body-list");
  listEl.innerHTML = `<div style="padding:8px; font-size:14px;">Loading recent DMs...</div>`;
  await loadRecentDMs(currentContainer);

  const searchInput = currentContainer.querySelector("#dm-search-input");
  const resultsBox = currentContainer.querySelector("#dm-autocomplete-results");
  const debouncedDMSearch = debounce(() => doDMUserSearch(searchInput, resultsBox, currentContainer));
  searchInput.addEventListener("input", debouncedDMSearch);
  currentContainer.querySelector("#dm-search-button")
    .addEventListener("click", () => doDMUserSearch(searchInput, resultsBox, currentContainer));
}

/**************************************************
 * DM User Search – uses v1 query logic
 **************************************************/
async function doDMUserSearch(searchInput, resultsBox, currentContainer) {
  const term = searchInput.value.trim();
  if (!term) {
    resultsBox.style.display = "none";
    resultsBox.innerHTML = "";
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

/**************************************************
 * Setup Channel UI in Base Container
 **************************************************/
async function setupChannelUI(currentContainer) {
  const topEl = currentContainer.querySelector(".chat-body-top");
  topEl.innerHTML = `
    <div class="chat-search-container">
      <div class="chat-search-wrapper">
        <input type="text" class="chat-search-input" id="channel-search-input" placeholder="Search or create channels..." aria-label="Search Channels" />
        <button class="chat-search-button" id="channel-search-button" title="Search or Create Channel" aria-label="Search or Create Channel"><i class="fa fa-plus"></i></button>
        <div class="chat-autocomplete-results" id="channel-autocomplete-results" style="display:none;"></div>
      </div>
    </div>
  `;
  const listEl = currentContainer.querySelector(".chat-body-list");
  listEl.innerHTML = `<div style="padding:8px; font-size:14px;">Loading channels...</div>`;
  await loadRecentChannels(currentContainer);

  const searchInput = currentContainer.querySelector("#channel-search-input");
  const resultsBox = currentContainer.querySelector("#channel-autocomplete-results");
  const debouncedChannelSearch = debounce(() => doChannelSearch(searchInput, resultsBox, currentContainer));
  searchInput.addEventListener("input", debouncedChannelSearch);
  currentContainer.querySelector("#channel-search-button")
    .addEventListener("click", () => doChannelSearch(searchInput, resultsBox, currentContainer));
  resultsBox.addEventListener("click", async e => {
    const target = e.target.closest(".chat-autocomplete-item");
    if (!target) return;
    if (target.dataset.create) {
      const name = searchInput.value.trim();
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
      await loadRecentChannels(currentContainer);
      if (channelData && channelData.length > 0) {
        openNewChatContainer('channel', channelData[0].id);
        const baseContainer = document.getElementById('base-chat-container');
        await loadRecentChannels(baseContainer);
        switchMode('channel', baseContainer);
      }
    } else if (target.dataset.channelid) {
      const channelId = target.dataset.channelid;
      activeChannelId = channelId;
      searchInput.value = target.innerText;
      resultsBox.style.display = "none";
      openNewChatContainer('channel', channelId);
      const baseContainer = document.getElementById('base-chat-container');
      await loadRecentChannels(baseContainer);
      switchMode('channel', baseContainer);
    }
  });
}

/**************************************************
 * Channel Search – similar to v1 channel search logic.
 **************************************************/
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
    resultsBox.innerHTML = `<div class="chat-autocomplete-item" data-create="true">Create new channel '#${term}'</div>`;
    resultsBox.style.display = "block";
    return;
  }
  resultsBox.innerHTML = data.map(ch => {
    return `<div class="chat-autocomplete-item" data-channelid="${ch.id}">#${ch.channel_name} <small>(${formatTimestamp(ch.updated_at || Date.now())})</small></div>`;
  }).join("");
  resultsBox.style.display = "block";
}

/**************************************************
 * Let User Leave a Channel (v1 logic)
 **************************************************/
async function onLeaveChannel(channelId, currentContainer) {
  if (!channelId) {
    alert("No channel selected.");
    return;
  }
  if (!confirm("Are you sure you want to leave this channel?")) return;
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
  await loadRecentChannels(currentContainer);
  currentContainer.querySelector(".chat-body-feed").style.display = "none";
  activeChannelId = null;
  const containerData = additionalContainers.find(c => c.type === 'channel' && c.targetId === channelId);
  if (containerData) {
    onCloseChatContainer(new Event('manualClose'), containerData.container);
  }
}

/**************************************************
 * Realtime Subscriptions for DM and Channel Messages
 **************************************************/
function initRealtimeSubscriptions() {
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
            const existingContainer = additionalContainers.find(c => c.type === 'dm' && c.targetId === activeDMUserId);
            const feedElement = existingContainer ? existingContainer.container.querySelector('.chat-body-feed') : null;
            if (feedElement) loadDMConversation(activeDMUserId, feedElement);
          }
        }
      }
    )
    .subscribe();

  channelSubscription = supabaseClient
    .channel("channel-messages-changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      payload => {
        const newMsg = payload.new;
        if (currentMode === "channel" && activeChannelId && newMsg.channel_id === activeChannelId) {
          const existingContainer = additionalContainers.find(c => c.type === 'channel' && c.targetId === activeChannelId);
          const feedElement = existingContainer ? existingContainer.container.querySelector('.chat-body-feed') : null;
          if (feedElement) loadChannelConversation(activeChannelId, feedElement);
        }
      }
    )
    .subscribe();
}

/**************************************************
 * Load Recent Direct Messages (v1 logic)
 **************************************************/
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

  // Get the most recent DM with each user.
  const recentMap = new Map();
  for (const dm of allDMs) {
    const otherUser = (dm.sender_id === currentUser.id) ? dm.recipient_id : dm.sender_id;
    if (!recentMap.has(otherUser)) {
      recentMap.set(otherUser, dm);
    }
  }
  const recentList = Array.from(recentMap.values())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  let html = "";
  for (const dmRow of recentList) {
    const otherUser = (dmRow.sender_id === currentUser.id) ? dmRow.recipient_id : dmRow.sender_id;
    html += `
      <div class="chat-user-item" data-userid="${otherUser}" tabindex="0">
        <span id="dm-name-${otherUser}">DM with: ${otherUser}</span>
        <br/><small>${formatTimestamp(dmRow.created_at)}</small>
      </div>
    `;
  }
  listEl.innerHTML = html;

  listEl.querySelectorAll(".chat-user-item").forEach(item => {
    item.addEventListener("click", () => {
      const userId = item.getAttribute("data-userid");
      activeDMUserId = userId;
      openNewChatContainer('dm', userId);
    });
  });

  // Fill in display names using cached user info.
  const uniqueUserIds = Array.from(recentMap.keys());
  await fetchAndCacheMultipleUsers(uniqueUserIds);
  uniqueUserIds.forEach(userId => {
    const labelEl = document.getElementById(`dm-name-${userId}`);
    if (labelEl && userInfoCache[userId]) {
      labelEl.textContent = "DM with: " + getDisplayName(userInfoCache[userId]);
    }
  });
}

/**************************************************
 * Load Recent Channels (v1 logic)
 **************************************************/
async function loadRecentChannels(currentContainer) {
  const listEl = currentContainer.querySelector(".chat-body-list");
  listEl.innerHTML = `<div style="padding:8px; font-size:14px;">Loading channels...</div>`;

  // Use relationship syntax so Supabase recognizes the join.
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
    console.error("loadRecentChannels - Error loading channels:", error);
    listEl.innerHTML = `<div style="padding:8px;">Failed to load channels</div>`;
    return;
  }

  const acceptedRows = (data || []).filter(row => row.is_accepted !== false);
  if (!acceptedRows.length) {
    listEl.innerHTML = `<div style="padding:8px;">No joined channels. Create one!</div>`;
    return;
  }

  const channelsWithTime = acceptedRows.map(r => {
    if (!r.channels) return null;
    let lastMessageTime = 0;
    if (r.channels.messages && r.channels.messages.length) {
      lastMessageTime = Math.max(...r.channels.messages.map(m => new Date(m.created_at).getTime()));
    }
    return {
      id: r.channels.id,
      channel_name: r.channels.channel_name,
      lastMessageTime
    };
  }).filter(Boolean);

  channelsWithTime.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

  const html = channelsWithTime.map(ch => {
    const lastDate = ch.lastMessageTime ? formatTimestamp(ch.lastMessageTime) : "No messages yet";
    return `
      <div class="chat-channel-item" data-ch-id="${ch.id}" tabindex="0">
        #${ch.channel_name}
        <br/><small>${lastDate}</small>
      </div>
    `;
  }).join("");
  listEl.innerHTML = html;

  listEl.querySelectorAll(".chat-channel-item").forEach(item => {
    item.addEventListener("click", () => {
      const chId = item.getAttribute("data-ch-id");
      openNewChatContainer('channel', chId);
    });
  });
}

/**************************************************
 * Load DM Conversation (v1 logic with reply join)
 **************************************************/
async function loadDMConversation(userId, feedElement) {
  feedElement.innerHTML = `<div style="padding:8px;">Loading messages...</div>`;
  const orClause = `and(sender_id.eq.${currentUser.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${currentUser.id})`;
  const { data, error } = await supabaseClient
    .from("direct_messages")
    .select("*, reply_to ( id, sender_id, content )")
    .or(orClause)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Error loading DMs:", error);
    feedElement.innerHTML = `<div style="padding:8px;">Failed to load messages</div>`;
    return;
  }
  renderMessages(data, 'dm', feedElement);
}

/**************************************************
 * Load Channel Conversation (v1 logic with reply join)
 **************************************************/
async function loadChannelConversation(chId, feedElement) {
  feedElement.innerHTML = `<div style="padding:8px;">Loading channel messages...</div>`;
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*, reply_to ( id, user_id, content )")
    .eq("channel_id", chId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Error loading channel messages:", error);
    feedElement.innerHTML = `<div style="padding:8px;">Failed to load messages</div>`;
    return;
  }
  renderMessages(data, 'channel', feedElement);
}

/**************************************************
 * Render Messages – now adds reply buttons and,
 * if a message is a reply, shows a reference.
 **************************************************/
async function renderMessages(arr, mode, feedElement) {
  feedElement.innerHTML = "";
  for (const msg of arr) {
    const div = document.createElement("div");
    div.classList.add("chat-message");
    const senderId = mode === 'dm' ? msg.sender_id : msg.user_id;
    if (senderId === currentUser.id) {
      div.classList.add("sent");
    } else {
      div.classList.add("received");
    }
    const userInfo = await fetchUser(senderId);
    const initials = getInitials(userInfo);

    // Build reply reference block if this message is a reply.
    let replyReferenceHTML = "";
    if (msg.reply_to) {
      const originalSenderId = mode === 'dm' ? msg.reply_to.sender_id : msg.reply_to.user_id;
      const originalSender = await fetchUser(originalSenderId);
      replyReferenceHTML = `<div class="chat-reply-reference">
        <strong>${getDisplayName(originalSender)}:</strong> ${msg.reply_to.content || "[No text]"}
      </div>`;
    }
    // Build the main message content with a reply button.
    div.innerHTML = `
      ${replyReferenceHTML}
      <div class="chat-message-main">
        <span class="user-initials">${initials}</span>
        <span class="chat-message-content">${msg.content || "[No text]"}</span>
        <button class="chat-reply-btn" title="Reply" data-msg-id="${msg.id}">↩</button>
      </div>
    `;
    // Attach event listener for the reply button.
    const replyBtn = div.querySelector(".chat-reply-btn");
    replyBtn.addEventListener("click", () => {
      const container = feedElement.closest(".chat-container");
      setReplyMessage(container, msg);
    });
    feedElement.appendChild(div);
  }
  feedElement.scrollTop = feedElement.scrollHeight;
}

/**************************************************
 * Send a Message – now includes any reply reference.
 **************************************************/
async function handleSendMessage(event, currentContainer) {
  const inp = currentContainer.querySelector(".chat-footer input[type='text']");
  const text = inp.value.trim();
  if (!text) return;

  const containerData = additionalContainers.find(c => c.container === currentContainer);
  if (!containerData) return;

  let replyId = currentContainer.replyMessage ? currentContainer.replyMessage.id : null;

  if (containerData.type === 'dm') {
    const { error } = await supabaseClient
      .from("direct_messages")
      .insert([{
        sender_id: currentUser.id,
        recipient_id: containerData.targetId,
        content: text,
        reply_to: replyId
      }]);
    if (error) {
      console.error("Error sending DM:", error);
      return;
    }
    loadDMConversation(containerData.targetId, currentContainer.querySelector('.chat-body-feed'));
  } else if (containerData.type === 'channel') {
    await ensureChannelMembership(containerData.targetId);
    const { error } = await supabaseClient
      .from("messages")
      .insert([{
        channel_id: containerData.targetId,
        user_id: currentUser.id,
        content: text,
        reply_to: replyId
      }]);
    if (error) {
      console.error("Error sending channel message:", error);
      return;
    }
    loadChannelConversation(containerData.targetId, currentContainer.querySelector('.chat-body-feed'));
  }
  inp.value = "";
  clearReplyMessage(currentContainer);
}

/**************************************************
 * Toggle Minimization when the header is clicked
 **************************************************/
function onHeaderClick(e, currentContainer) {
  if (e.target.classList.contains("chat-close-btn") || e.target.classList.contains("chat-leave-btn")) return;
  currentContainer.classList.toggle("chat-minimized");
}

/**************************************************
 * Utility: Get User Initials
 **************************************************/
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

/**************************************************
 * Fetch & Cache Multiple Users
 **************************************************/
async function fetchAndCacheMultipleUsers(userIds) {
  const needed = userIds.filter(id => !userInfoCache[id]);
  if (!needed.length) return;
  const { data, error } = await supabaseClient
    .from("affiliations")
    .select("id, user_id, username, first_name, last_name")
    .in("user_id", needed);
  if (error) {
    console.error("Error fetching multiple users:", error);
    return;
  }
  for (const row of data || []) {
    userInfoCache[row.user_id] = row;
  }
}

/**************************************************
 * Fetch a Single User
 **************************************************/
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

/**************************************************
 * Fetch Channel Information
 **************************************************/
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

/**************************************************
 * Utility: Get Display Name
 **************************************************/
function getDisplayName(u) {
  if (!u) return "[Unknown]";
  return u.username || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "[No name]";
}

/**************************************************
 * Set Reply Message – shows a reply preview in the UI.
 **************************************************/
function setReplyMessage(container, msg) {
  container.replyMessage = msg;
  const preview = container.querySelector(`#chat-reply-preview-${container.id}`);
  if (preview) {
    const replyTextSpan = preview.querySelector(".chat-reply-text");
    // Determine the original sender (sender_id for DM; user_id for channel)
    const senderId = msg.sender_id || msg.user_id;
    const senderInfo = userInfoCache[senderId] || { username: "Unknown" };
    // Show a truncated version of the original message
    replyTextSpan.textContent = `Replying to ${getDisplayName(senderInfo)}: ${msg.content.substring(0, 30)}...`;
    preview.style.display = "block";
  }
}

/**************************************************
 * Clear Reply Message – hides the reply preview.
 **************************************************/
function clearReplyMessage(container) {
  container.replyMessage = null;
  const preview = container.querySelector(`#chat-reply-preview-${container.id}`);
  if (preview) {
    preview.style.display = "none";
  }
}
