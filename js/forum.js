// ----------------------------
// Global state variables
// ----------------------------
let currentProjectId = null;
let currentCategoryId = null;
let currentThreadId = null;
let postsPage = 1;
const postsPerPage = 10; // For pagination

// ----------------------------
// Utility Functions
// ----------------------------

// Toggle section visibility
const toggleSection = (sectionId, show) => {
  const sectionEl = document.getElementById(sectionId);
  if (!sectionEl) return;
  sectionEl.classList.remove('show-section', 'hide-section');
  sectionEl.classList.add(show ? 'show-section' : 'hide-section');
};

// Show/hide loading spinner
const showSpinner = () => toggleSection('loading-spinner', true);
const hideSpinner = () => toggleSection('loading-spinner', false);

// Simple HTML sanitizer to escape HTML tags (note: for production use a library like DOMPurify)
const sanitizeHTML = (str) => {
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
};

// Display a temporary notification message
const showNotification = (message, type = 'success') => {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
};

// Format "time ago"
const timeAgo = (date) => {
  const now = new Date();
  const seconds = Math.round((now - date) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  return `${days} day${days !== 1 ? 's' : ''} ago`;
};

// ----------------------------
// Initialization
// ----------------------------
window.addEventListener('DOMContentLoaded', async () => {
  // Add search functionality
  document.getElementById('search-btn').addEventListener('click', () => {
    const term = document.getElementById('forum-search').value.toLowerCase();
    filterForumList(term);
  });

  // Check if a specific project forum is requested
  const urlParams = new URLSearchParams(window.location.search);
  const specificProjectId = urlParams.get('forumForProjectId');
  if (specificProjectId) {
    currentProjectId = specificProjectId;
    await showForumCategories(specificProjectId);
  } else {
    await showAllForums();
  }
});

// ----------------------------
// Search / Filter Function
// ----------------------------
const filterForumList = (term) => {
  // Filter cards in the forum list container by text content
  const container = document.getElementById('forum-list-container');
  if (!container) return;
  const cards = container.querySelectorAll('.forum-card');
  cards.forEach(card => {
    card.style.display = card.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
};

// ----------------------------
// 1) Show All Forums
// ----------------------------
const showAllForums = async () => {
  try {
    showSpinner();
    toggleSection('forum-list-container', true);
    toggleSection('category-list-container', false);
    toggleSection('thread-list-container', false);
    toggleSection('post-list-container', false);

    const forumListContainer = document.getElementById('forum-list-container');
    forumListContainer.innerHTML = `
      <h2 class="forum-section-header">All Forums</h2>
      <div id="all-forums-list"></div>
    `;

    const allForumsList = document.getElementById('all-forums-list');
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      alert('You must be logged in to view forums.');
      hideSpinner();
      return;
    }

    const { data: forums, error } = await supabaseClient
      .from('forums')
      .select(`
        id,
        forum_name,
        description,
        project_id,
        projects!inner (
          project_name,
          user_id
        )
      `);

    if (error) {
      console.error('Error fetching forums:', error);
      allForumsList.innerHTML = `<p>Failed to load forums.</p>`;
      hideSpinner();
      return;
    }

    if (!forums || forums.length === 0) {
      allForumsList.innerHTML = `<p>No forums found.</p>`;
      hideSpinner();
      return;
    }

    // Render forum cards with sanitized text
    allForumsList.innerHTML = forums.map(forum => `
      <div class="forum-card" tabindex="0" onclick="showForumCategories('${forum.project_id}')">
        <div class="forum-card-title">${sanitizeHTML(forum.forum_name)}</div>
        <div class="forum-card-desc">${sanitizeHTML(forum.description || '')}</div>
        <small>Project: ${sanitizeHTML(forum.projects.project_name)}</small>
      </div>
    `).join('');
    hideSpinner();
  } catch (err) {
    console.error(err);
    hideSpinner();
  }
};

// ----------------------------
// 2) Show Forum Categories for a Given Forum
// ----------------------------
const showForumCategories = async (projectId) => {
  try {
    showSpinner();
    toggleSection('forum-list-container', false);
    toggleSection('category-list-container', true);
    toggleSection('thread-list-container', false);
    toggleSection('post-list-container', false);

    const categoryListContainer = document.getElementById('category-list-container');
    categoryListContainer.innerHTML = `
      <div class="navigation-bar">
        <button class="back-button" onclick="goBackToForums()">← Back to Forums</button>
        <h2 class="forum-section-header">Forum Categories</h2>
      </div>
      <div id="categories-list"></div>
      <div class="new-category-form">
        <h3>Create New Category</h3>
        <input type="text" id="new-category-name" placeholder="Category Name" aria-label="Category Name" />
        <textarea id="new-category-description" placeholder="Category Description" aria-label="Category Description"></textarea>
        <button onclick="createCategory('${projectId}')">Create Category</button>
      </div>
    `;
    currentProjectId = projectId;

    const { data: forum, error: forumError } = await supabaseClient
      .from('forums')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (forumError || !forum) {
      console.error('Error or forum not found:', forumError);
      categoryListContainer.innerHTML += `<p>Forum not found for this project.</p>`;
      hideSpinner();
      return;
    }
    const forumId = forum.id;

    let { data: categories, error: catError } = await supabaseClient
      .from('categories')
      .select('*')
      .eq('forum_id', forumId)
      .order('display_order', { ascending: true });

    if (catError) {
      console.error('Error fetching categories:', catError);
      categoryListContainer.innerHTML += `<p>Failed to load categories.</p>`;
      hideSpinner();
      return;
    }

    // Create default categories if none exist
    if (!categories || categories.length === 0) {
      const defaultCategories = [
        {
          forum_id: forumId,
          category_name: 'General Discussion',
          description: 'Talk about anything related to this project.',
          display_order: 1
        },
        {
          forum_id: forumId,
          category_name: 'Announcements',
          description: 'Official updates and announcements.',
          display_order: 2
        },
        {
          forum_id: forumId,
          category_name: 'Q&A',
          description: 'Questions and answers for the community.',
          display_order: 3
        }
      ];
      const { error: insertError } = await supabaseClient
        .from('categories')
        .insert(defaultCategories);
      if (insertError) {
        console.error('Error inserting default categories:', insertError);
        categoryListContainer.innerHTML += `<p>Failed to create default categories.</p>`;
        hideSpinner();
        return;
      }
      const { data: categoriesAfterInsert } = await supabaseClient
        .from('categories')
        .select('*')
        .eq('forum_id', forumId)
        .order('display_order', { ascending: true });
      categories = categoriesAfterInsert;
    }

    const categoriesList = document.getElementById('categories-list');
    if (!categories.length) {
      categoriesList.innerHTML = `<p>No categories found for this forum.</p>`;
      hideSpinner();
      return;
    }

    categoriesList.innerHTML = categories.map(cat => `
      <div class="forum-card category-card" tabindex="0" onclick="showThreads('${cat.id}')">
        <div class="forum-card-title">${sanitizeHTML(cat.category_name)}</div>
        <div class="forum-card-desc">${sanitizeHTML(cat.description || '')}</div>
      </div>
    `).join('');
    hideSpinner();
  } catch (err) {
    console.error(err);
    hideSpinner();
  }
};

// ----------------------------
// 2b) Create a New Category
// ----------------------------
const createCategory = async (projectId) => {
  const categoryName = document.getElementById('new-category-name').value.trim();
  const categoryDescription = document.getElementById('new-category-description').value.trim();

  if (!categoryName) {
    alert('Please enter a category name.');
    return;
  }

  const { data: forum, error: forumError } = await supabaseClient
    .from('forums')
    .select('id')
    .eq('project_id', projectId)
    .single();

  if (forumError || !forum) {
    console.error('Error or forum not found:', forumError);
    alert('Forum not found for this project.');
    return;
  }
  const forumId = forum.id;

  const { error } = await supabaseClient
    .from('categories')
    .insert([{
      forum_id: forumId,
      category_name: categoryName,
      description: categoryDescription,
      display_order: 999
    }]);

  if (error) {
    console.error('Error creating category:', error);
    alert('Failed to create category.');
    return;
  }
  document.getElementById('new-category-name').value = '';
  document.getElementById('new-category-description').value = '';
  showNotification('Category created successfully.');
  showForumCategories(projectId);
};

// ----------------------------
// 3) Show Threads for a Given Category
// ----------------------------
const showThreads = async (categoryId) => {
  try {
    showSpinner();
    toggleSection('forum-list-container', false);
    toggleSection('category-list-container', false);
    toggleSection('thread-list-container', true);
    toggleSection('post-list-container', false);

    const threadListContainer = document.getElementById('thread-list-container');
    threadListContainer.innerHTML = `
      <div class="navigation-bar">
        <button class="back-button" onclick="goBackToCategories()">← Back to Categories</button>
        <h2 class="forum-section-header">Threads</h2>
      </div>
      <div id="threads-list"></div>
      <div class="new-thread-form">
        <h3>Create New Thread</h3>
        <input type="text" id="new-thread-title" placeholder="Thread Title" aria-label="Thread Title" />
        <button onclick="createThread('${categoryId}')">Create Thread</button>
      </div>
    `;
    currentCategoryId = categoryId;
    const threadsList = document.getElementById('threads-list');

    const { data: threads, error } = await supabaseClient
      .from('threads')
      .select(`
        id,
        title,
        created_at,
        is_locked,
        is_pinned,
        view_count,
        posts ( id, created_at )
      `)
      .eq('category_id', categoryId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching threads:', error);
      threadsList.innerHTML = `<p>Failed to load threads.</p>`;
      hideSpinner();
      return;
    }

    if (!threads || threads.length === 0) {
      threadsList.innerHTML = `<p>No threads found in this category.</p>`;
    } else {
      threadsList.innerHTML = threads.map(thread => {
        const replyCount = thread.posts.length;
        const lastActivity = thread.posts.length > 0
          ? new Date(Math.max(...thread.posts.map(post => new Date(post.created_at).getTime())))
          : new Date(thread.created_at);
        return `
          <div class="forum-card thread-card" tabindex="0" onclick="showPosts('${thread.id}')">
            <div class="thread-main">
              <div class="forum-card-title">${sanitizeHTML(thread.title)}</div>
              <div class="thread-counters">
                <span class="counter"><i class="fas fa-reply"></i> ${replyCount}</span>
                <span class="counter"><i class="fas fa-eye"></i> ${thread.view_count}</span>
                <span class="counter"><i class="fas fa-clock"></i> <span title="${new Date(lastActivity).toLocaleString()}">${timeAgo(new Date(lastActivity))}</span></span>
              </div>
            </div>
            <div class="forum-card-desc">
              Created: ${new Date(thread.created_at).toLocaleString()}<br/>
              ${thread.is_locked ? '<span class="badge locked">Locked</span>' : ''}
              ${thread.is_pinned ? '<span class="badge pinned">Pinned</span>' : ''}
            </div>
          </div>
        `;
      }).join('');
    }
    hideSpinner();
  } catch (err) {
    console.error(err);
    hideSpinner();
  }
};

// ----------------------------
// 3b) Create a New Thread
// ----------------------------
const createThread = async (categoryId) => {
  const threadTitle = document.getElementById('new-thread-title').value.trim();
  if (!threadTitle) {
    alert('Please enter a thread title.');
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    alert('You must be logged in to create a thread.');
    return;
  }

  const { error } = await supabaseClient
    .from('threads')
    .insert([{
      category_id: categoryId,
      user_id: session.user.id,
      title: threadTitle
    }]);

  if (error) {
    console.error('Error creating thread:', error);
    alert('Failed to create thread.');
    return;
  }

  document.getElementById('new-thread-title').value = '';
  showNotification('Thread created successfully.');
  showThreads(categoryId);
};

// ----------------------------
// 4) Show Posts for a Given Thread
// ----------------------------
const showPosts = async (threadId) => {
  try {
    showSpinner();
    // Reset pagination for new thread view
    postsPage = 1;
    toggleSection('forum-list-container', false);
    toggleSection('category-list-container', false);
    toggleSection('thread-list-container', false);
    toggleSection('post-list-container', true);

    const postListContainer = document.getElementById('post-list-container');
    postListContainer.innerHTML = `
      <div class="navigation-bar">
        <button class="back-button" onclick="goBackToThreads()">← Back to Threads</button>
        <h2 class="forum-section-header">Posts</h2>
      </div>
      <div id="posts-list"></div>
      <div class="new-post-form">
        <h3>Reply to This Thread</h3>
        <div class="text-styling-buttons">
          <button type="button" title="Bold" onclick="applyStyle('bold', 'new-post-content')"><i class="fas fa-bold"></i></button>
          <button type="button" title="Italic" onclick="applyStyle('italic', 'new-post-content')"><i class="fas fa-italic"></i></button>
          <button type="button" title="Underline" onclick="applyStyle('underline', 'new-post-content')"><i class="fas fa-underline"></i></button>
          <button type="button" title="Strikethrough" onclick="applyStyle('strikethrough', 'new-post-content')"><i class="fas fa-strikethrough"></i></button>
          <button type="button" title="Link" onclick="openLinkDialog('new-post-content')"><i class="fas fa-link"></i></button>
        </div>
        <textarea id="new-post-content" rows="3" placeholder="Write your reply here..." aria-label="New Post Content"></textarea>
        <button onclick="createPost('${threadId}', null)">Submit Reply</button>
      </div>
      <div id="load-more-container" class="hide-section">
        <button id="load-more-btn" onclick="loadMorePosts('${threadId}')">Load More Posts</button>
      </div>
    `;
    currentThreadId = threadId;

    // Increment view count using stored procedure
    await incrementViewCount(threadId);

    loadPosts(threadId, postsPage);
  } catch (err) {
    console.error(err);
    hideSpinner();
  }
};

// Load posts with pagination
const loadPosts = async (threadId, page) => {
  try {
    const postsList = document.getElementById('posts-list');
    const { data: posts, error } = await supabaseClient
      .from('posts_with_usernames')
      .select(`
        id,
        content,
        created_at,
        updated_at,
        user_id,
        thread_id,
        reply_to_post_id,
        username
      `)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .range((page - 1) * postsPerPage, page * postsPerPage - 1);

    if (error) {
      console.error('Error fetching posts:', error);
      postsList.innerHTML = `<p>Failed to load posts.</p>`;
      hideSpinner();
      return;
    }

    if (!posts || posts.length === 0) {
      if (page === 1) {
        postsList.innerHTML = `<p>No posts yet. Be the first to reply!</p>`;
      }
      toggleSection('load-more-container', false);
      hideSpinner();
      return;
    }

    // Get current user for button visibility
    const { data: { session } } = await supabaseClient.auth.getSession();
    const currentUserId = session?.user?.id;

    // Build nested posts recursively
    const buildNestedPosts = (postsArr, parentId = null, level = 0) => {
      return postsArr.filter(post => post.reply_to_post_id === parentId)
        .map(post => ({ ...post, replies: buildNestedPosts(postsArr, post.id, level + 1), level }));
    };

    const nestedPosts = buildNestedPosts(posts);

    const renderPosts = (postsArray) => {
      return postsArray.map(post => {
        const isAuthor = currentUserId === post.user_id;
        const isEdited = new Date(post.created_at).getTime() !== new Date(post.updated_at).getTime();
        const username = sanitizeHTML(post.username || post.user_id);
        return `
          <div class="post-card" style="margin-left: ${post.level * 20}px;" tabindex="0">
            ${isAuthor ? `<div class="post-actions">
              <button class="edit-post-button" title="Edit Post" onclick="editPost('${post.id}')"><i class="fas fa-edit"></i></button>
              <button class="delete-post-button" title="Delete Post" onclick="deletePost('${post.id}')"><i class="fas fa-times"></i></button>
            </div>` : ''}
            <div class="post-author">User: ${username}</div>
            <div class="post-date" title="${new Date(post.created_at).toLocaleString()}">${timeAgo(new Date(post.created_at))}</div>
            <div class="post-content" id="post-content-${post.id}">
              ${post.content}
            </div>
            ${isEdited ? `<i class="edited-text">This post has been edited</i>` : ''}
            <div id="edit-form-${post.id}" class="edit-form" style="display:none;">
              <div class="text-styling-buttons">
                <button type="button" title="Bold" onclick="applyStyle('bold', 'edit-content-${post.id}')"><i class="fas fa-bold"></i></button>
                <button type="button" title="Italic" onclick="applyStyle('italic', 'edit-content-${post.id}')"><i class="fas fa-italic"></i></button>
                <button type="button" title="Underline" onclick="applyStyle('underline', 'edit-content-${post.id}')"><i class="fas fa-underline"></i></button>
                <button type="button" title="Strikethrough" onclick="applyStyle('strikethrough', 'edit-content-${post.id}')"><i class="fas fa-strikethrough"></i></button>
                <button type="button" title="Link" onclick="openLinkDialog('edit-content-${post.id}')"><i class="fas fa-link"></i></button>
              </div>
              <textarea id="edit-content-${post.id}" rows="3">${post.content}</textarea>
              <div class="edit-form-buttons">
                <button onclick="savePost('${post.id}')">Save</button>
                <button onclick="cancelEdit('${post.id}', '${sanitizeHTML(post.content)}')">Cancel</button>
              </div>
            </div>
            <button class="reply-button" onclick="showReplyForm('${post.id}')">Reply</button>
            <div id="reply-form-${post.id}" class="reply-form" style="display:none;">
              <div class="text-styling-buttons">
                <button type="button" title="Bold" onclick="applyStyle('bold', 'reply-content-${post.id}')"><i class="fas fa-bold"></i></button>
                <button type="button" title="Italic" onclick="applyStyle('italic', 'reply-content-${post.id}')"><i class="fas fa-italic"></i></button>
                <button type="button" title="Underline" onclick="applyStyle('underline', 'reply-content-${post.id}')"><i class="fas fa-underline"></i></button>
                <button type="button" title="Strikethrough" onclick="applyStyle('strikethrough', 'reply-content-${post.id}')"><i class="fas fa-strikethrough"></i></button>
                <button type="button" title="Link" onclick="openLinkDialog('reply-content-${post.id}')"><i class="fas fa-link"></i></button>
              </div>
              <textarea id="reply-content-${post.id}" rows="2" placeholder="Write your reply..." aria-label="Reply Content"></textarea>
              <button onclick="createPost('${threadId}', '${post.id}')">Submit Reply</button>
              <button onclick="hideReplyForm('${post.id}')">Cancel</button>
            </div>
            ${post.replies && post.replies.length ? renderPosts(post.replies) : ''}
          </div>
        `;
      }).join('');
    };

    // Append the new posts
    postsList.innerHTML += renderPosts(nestedPosts);

    // Show "Load More" if we received a full page of posts
    if (posts.length === postsPerPage) {
      toggleSection('load-more-container', true);
    } else {
      toggleSection('load-more-container', false);
    }
    hideSpinner();
  } catch (err) {
    console.error(err);
    hideSpinner();
  }
};

// ----------------------------
// Load More Posts (Pagination)
// ----------------------------
const loadMorePosts = async (threadId) => {
  postsPage++;
  await loadPosts(threadId, postsPage);
};

// ----------------------------
// Increment View Count via Stored Procedure
// ----------------------------
const incrementViewCount = async (threadId) => {
  const { error } = await supabaseClient.rpc('increment_view_count', { thread_id: threadId });
  if (error) console.error('Error incrementing view count:', error);
};

// ----------------------------
// Post Edit/Delete Functions
// ----------------------------
const editPost = (postId) => {
  document.getElementById(`post-content-${postId}`).style.display = 'none';
  document.getElementById(`edit-form-${postId}`).style.display = 'block';
};

const savePost = async (postId) => {
  const textarea = document.getElementById(`edit-content-${postId}`);
  const contentDiv = document.getElementById(`post-content-${postId}`);
  const editForm = document.getElementById(`edit-form-${postId}`);
  if (textarea && contentDiv && editForm) {
    const newContent = textarea.value;
    const { error } = await supabaseClient
      .from('posts')
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) {
      console.error('Error updating post:', error);
      alert('Failed to update post.');
    } else {
      contentDiv.innerHTML = newContent;
      contentDiv.style.display = 'block';
      editForm.style.display = 'none';
      showPosts(currentThreadId);
      showNotification('Post updated successfully.');
    }
  }
};

const cancelEdit = (postId, originalContent) => {
  const contentDiv = document.getElementById(`post-content-${postId}`);
  const editForm = document.getElementById(`edit-form-${postId}`);
  if (contentDiv && editForm) {
    contentDiv.innerHTML = originalContent;
    contentDiv.style.display = 'block';
    editForm.style.display = 'none';
  }
};

const deletePost = async (postId) => {
  if (confirm('Are you sure you want to delete this post?')) {
    const { error } = await supabaseClient
      .from('posts')
      .delete()
      .eq('id', postId);
    if (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post.');
    } else {
      showNotification('Post deleted successfully.', 'error');
      showPosts(currentThreadId);
    }
  }
};

const showReplyForm = (postId) => {
  document.getElementById(`reply-form-${postId}`).style.display = 'block';
};

const hideReplyForm = (postId) => {
  document.getElementById(`reply-form-${postId}`).style.display = 'none';
};

// ----------------------------
// Create a New Post (Reply)
// ----------------------------
const createPost = async (threadId, parentPostId) => {
  const textareaId = parentPostId ? `reply-content-${parentPostId}` : 'new-post-content';
  const postContent = document.getElementById(textareaId).value.trim();
  if (!postContent) {
    alert('Please write some content.');
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    alert('You must be logged in to create a post.');
    return;
  }

  const newPost = {
    thread_id: threadId,
    user_id: session.user.id,
    content: postContent
  };

  if (parentPostId) newPost.reply_to_post_id = parentPostId;

  const { error } = await supabaseClient
    .from('posts')
    .insert([newPost]);

  if (error) {
    console.error('Error creating post:', error);
    alert('Failed to create post.');
    return;
  }
  document.getElementById(textareaId).value = '';
  if (parentPostId) {
    hideReplyForm(parentPostId);
  } else {
    document.getElementById('new-post-content').focus();
  }
  showNotification('Post submitted successfully.');
  showPosts(threadId);
};

// ----------------------------
// Text Styling Functions
// ----------------------------
const applyStyle = (style, textareaId) => {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selection = textarea.value.substring(start, end);
  let replacement = selection;
  switch (style) {
    case 'bold':
      replacement = `<b>${selection}</b>`;
      break;
    case 'italic':
      replacement = `<i>${selection}</i>`;
      break;
    case 'underline':
      replacement = `<u>${selection}</u>`;
      break;
    case 'strikethrough':
      replacement = `<del>${selection}</del>`;
      break;
  }
  textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
  textarea.focus();
  textarea.selectionStart = start + replacement.length;
  textarea.selectionEnd = start + replacement.length;
};

const openLinkDialog = (textareaId) => {
  const textarea = document.getElementById(textareaId);
  if (!textarea) return;
  const url = prompt('Enter the URL:');
  if (url) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = textarea.value.substring(start, end);
    const link = `<a href="${url}" target="_blank" rel="noopener noreferrer">${selection}</a>`;
    textarea.value = textarea.value.substring(0, start) + link + textarea.value.substring(end);
    textarea.focus();
    textarea.selectionStart = start + link.length;
    textarea.selectionEnd = start + link.length;
  }
};

// ----------------------------
// Back Navigation Functions
// ----------------------------
const goBackToForums = () => {
  showAllForums();
  currentProjectId = null;
  currentCategoryId = null;
  currentThreadId = null;
};

const goBackToCategories = () => {
  if (currentProjectId) {
    showForumCategories(currentProjectId);
    currentThreadId = null;
  } else {
    showAllForums();
  }
};

const goBackToThreads = () => {
  if (currentCategoryId) {
    showThreads(currentCategoryId);
    currentThreadId = null;
  } else if (currentProjectId) {
    showForumCategories(currentProjectId);
  } else {
    showAllForums();
  }
};
