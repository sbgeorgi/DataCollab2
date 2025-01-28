// js/forum.js
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const specificProjectId = urlParams.get('forumForProjectId');

    // If a specific project's forum is requested, show categories for that project
    if (specificProjectId) {
        currentProjectId = specificProjectId;
        await showForumCategories(specificProjectId);
    } else {
        // Otherwise, show list of all forums
        await showAllForums();
    }
});

// State variables to keep track of current navigation
let currentProjectId = null;
let currentCategoryId = null;
let currentThreadId = null;

// Helper to show/hide sections
function toggleSection(sectionId, show) {
    const sectionEl = document.getElementById(sectionId);
    if (!sectionEl) return;
    sectionEl.classList.remove('show-section', 'hide-section');
    sectionEl.classList.add(show ? 'show-section' : 'hide-section');
}

// 1) Show all forums if user did not come from a project link
async function showAllForums() {
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

    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (!session) {
        alert('You must be logged in to view forums.');
        return;
    }

    // Fetch all forums joined with projects
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
        return;
    }

    if (!forums || !forums.length) {
        allForumsList.innerHTML = `<p>No forums found.</p>`;
        return;
    }

    // Render each forum as a clickable card
    const html = forums.map(forum => {
        return `
      <div class="forum-card" onclick="showForumCategories('${forum.project_id}')">
        <div class="forum-card-title">${forum.forum_name}</div>
        <div class="forum-card-desc">${forum.description || ''}</div>
        <small>Project: ${forum.projects.project_name}</small>
      </div>
    `;
    }).join('');

    allForumsList.innerHTML = html;
}

// 2) Show categories for a given forum, identified by projectId
async function showForumCategories(projectId) {
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
    <div class="new-category-form"> <!-- ADDED NEW CATEGORY FORM -->
      <h3>Create New Category</h3>
      <input type="text" id="new-category-name" placeholder="Category Name" />
      <textarea id="new-category-description" placeholder="Category Description"></textarea>
      <button onclick="createCategory('${projectId}')">Create Category</button>
    </div>
  `;

    // Update currentProjectId
    currentProjectId = projectId;

    // Find the forum row for the given projectId
    const { data: forum, error: forumError } = await supabaseClient
        .from('forums')
        .select('*')
        .eq('project_id', projectId)
        .single();

    if (forumError || !forum) {
        console.error('Error or forum not found:', forumError);
        categoryListContainer.innerHTML += `<p>Forum not found for this project.</p>`;
        return;
    }

    const forumId = forum.id;

    // Now fetch categories
    let { data: categories, error: catError } = await supabaseClient
        .from('categories')
        .select('*')
        .eq('forum_id', forumId)
        .order('display_order', { ascending: true });

    if (catError) {
        console.error('Error fetching categories:', catError);
        categoryListContainer.innerHTML += `<p>Failed to load categories.</p>`;
        return;
    }

    // ----- NEW CODE: Create default categories if none exist -----
    if (!categories || !categories.length) {
        // Insert some default categories
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
            return;
        }

        // Reload categories
        const { data: categoriesAfterInsert } = await supabaseClient
            .from('categories')
            .select('*')
            .eq('forum_id', forumId)
            .order('display_order', { ascending: true });
        categories = categoriesAfterInsert;
    }
    // -----------------------------------------------------------

    const categoriesList = document.getElementById('categories-list');

    if (!categories.length) {
        categoriesList.innerHTML = `<p>No categories found for this forum.</p>`;
        return;
    }

    const html = categories.map(cat => {
        return `
      <div class="forum-card category-card" onclick="showThreads('${cat.id}')">
        <div class="forum-card-title">${cat.category_name}</div>
        <div class="forum-card-desc">${cat.description || ''}</div>
      </div>
    `;
    }).join('');

    categoriesList.innerHTML = html;
}

// 2b) Create a new category
async function createCategory(projectId) {
    const categoryName = document.getElementById('new-category-name').value.trim();
    const categoryDescription = document.getElementById('new-category-description').value.trim();

    if (!categoryName) {
        alert('Please enter a category name.');
        return;
    }

    // Find the forum row for the given projectId to get forum_id
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


    const { data, error } = await supabaseClient
        .from('categories')
        .insert([
            {
                forum_id: forumId,
                category_name: categoryName,
                description: categoryDescription,
                display_order: 999 // Place new categories at the end by default
            }
        ]);

    if (error) {
        console.error('Error creating category:', error);
        alert('Failed to create category.');
        return;
    }

    // Clear input and refresh categories
    document.getElementById('new-category-name').value = '';
    document.getElementById('new-category-description').value = '';
    showForumCategories(projectId);
}


// 3) Show threads for a given category
async function showThreads(categoryId) {
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
      <input type="text" id="new-thread-title" placeholder="Thread Title" />
      <button onclick="createThread('${categoryId}')">Create Thread</button>
    </div>
  `;

    // Update currentCategoryId
    currentCategoryId = categoryId;

    const threadsList = document.getElementById('threads-list');

    // Fetch threads along with reply counts and last activity
    const { data: threads, error } = await supabaseClient
        .from('threads')
        .select(`
      id,
      title,
      created_at,
      is_locked,
      is_pinned,
      view_count,
      posts (
        id,
        created_at
      )
    `)
        .eq('category_id', categoryId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching threads:', error);
        threadsList.innerHTML = `<p>Failed to load threads.</p>`;
        return;
    }

    if (!threads || !threads.length) {
        threadsList.innerHTML = `<p>No threads found in this category.</p>`;
    } else {
        // Render each thread with counters
        const html = threads.map(thread => {
            const replyCount = thread.posts.length;
            const lastActivity = thread.posts.length > 0
                ? new Date(Math.max(...thread.posts.map(post => new Date(post.created_at).getTime())))
                : new Date(thread.created_at);

            return `
        <div class="forum-card thread-card" onclick="showPosts('${thread.id}')">
          <div class="thread-main">
            <div class="forum-card-title">${thread.title}</div>
            <div class="thread-counters">
              <span class="counter"><i class="fas fa-reply"></i> ${replyCount}</span>
              <span class="counter"><i class="fas fa-eye"></i> ${thread.view_count}</span>
              <span class="counter"><i class="fas fa-clock"></i> <span title="${lastActivity.toLocaleString()}">${timeAgo(lastActivity)}</span></span>
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
        threadsList.innerHTML = html;
    }
}

// Helper function to format time ago
function timeAgo(date) {
    const now = new Date();
    const seconds = Math.round((now - date) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 60) {
        return 'Just now';
    } else if (minutes < 60) {
        return `${minutes} minutes ago`;
    } else if (hours < 24) {
        return `${hours} hours ago`;
    } else {
        return `${days} days ago`;
    }
}


// 3b) Create a new thread
async function createThread(categoryId) {
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

    const { data, error } = await supabaseClient
        .from('threads')
        .insert([
            {
                category_id: categoryId,
                user_id: session.user.id,
                title: threadTitle
            }
        ]);

    if (error) {
        console.error('Error creating thread:', error);
        alert('Failed to create thread.');
        return;
    }

    // Clear input and refresh
    document.getElementById('new-thread-title').value = '';
    showThreads(categoryId);
}

// 4) Show posts for a given thread
async function showPosts(threadId) {
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
      <textarea id="new-post-content" rows="3" placeholder="Write your reply here..."></textarea>
      <button onclick="createPost('${threadId}', null)">Submit Reply</button>
    </div>
  `;

    // Update currentThreadId
    currentThreadId = threadId;

    // Increment view_count using the stored procedure
    await incrementViewCount(threadId);

    const postsList = document.getElementById('posts-list');

    // Fetch posts from the updated view to get usernames
    const { data: posts, error } = await supabaseClient
        .from('posts_with_usernames') // Use the updated view
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
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching posts:', error);
        postsList.innerHTML = `<p>Failed to load posts.</p>`;
        return;
    }

    if (!posts || !posts.length) {
        postsList.innerHTML = `<p>No posts yet. Be the first to reply!</p>`;
        return;
    }

    // Get current user session for delete and edit button visibility
    const { data: { session } } = await supabaseClient.auth.getSession();
    const currentUserId = session?.user?.id;

    // Function to recursively build the nested post structure
    function buildNestedPosts(posts, parentId = null, level = 0) {
        const nestedPosts = [];
        for (const post of posts) {
            if (post.reply_to_post_id === parentId) {
                const replies = buildNestedPosts(posts, post.id, level + 1);
                nestedPosts.push({ ...post, replies, level });
            }
        }
        return nestedPosts;
    }

    const nestedPosts = buildNestedPosts(posts);

    function renderPosts(posts) {
        let html = '';
        for (const post of posts) {
            const isAuthor = currentUserId === post.user_id;
            const isEdited = new Date(post.created_at).getTime() !== new Date(post.updated_at).getTime();
            // Safely access username; if not available, fallback to user_id
            const username = post.username || post.user_id;
            html += `
          <div class="post-card" style="margin-left: ${post.level * 20}px;">
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
                    <button onclick="cancelEdit('${post.id}', '${post.content}')">Cancel</button>
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
              <textarea id="reply-content-${post.id}" rows="2" placeholder="Write your reply..."></textarea>
              <button onclick="createPost('${threadId}', '${post.id}')">Submit Reply</button>
               <button onclick="hideReplyForm('${post.id}')">Cancel</button>
            </div>
          </div>
        ${renderPosts(post.replies)}
      `;
        }
        return html;
    }

    postsList.innerHTML = renderPosts(nestedPosts);
    // Re-render any HTML content to ensure styles are applied from text editor
    postsList.querySelectorAll('.post-content').forEach(postContentDiv => {
        postContentDiv.innerHTML = postContentDiv.textContent; // Re-set innerHTML to process HTML tags
    });
}


// Function to increment view_count using the stored procedure
async function incrementViewCount(threadId) {
    const { error } = await supabaseClient
        .rpc('increment_view_count', { thread_id: threadId });

    if (error) {
        console.error('Error incrementing view count:', error);
    }
}

// Function to edit a post
function editPost(postId) {
    const contentDiv = document.getElementById(`post-content-${postId}`);
    const editForm = document.getElementById(`edit-form-${postId}`);
    if (contentDiv && editForm) {
        contentDiv.style.display = 'none';
        editForm.style.display = 'block';
    }
}

// Function to save an edited post
async function savePost(postId) {
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
        }
    }

}

// Function to cancel post edit
function cancelEdit(postId, originalContent) {
    const contentDiv = document.getElementById(`post-content-${postId}`);
    const editForm = document.getElementById(`edit-form-${postId}`);

    if (contentDiv && editForm) {
        contentDiv.innerHTML = originalContent;
        contentDiv.style.display = 'block';
        editForm.style.display = 'none';
    }
}

// Function to delete a post
async function deletePost(postId) {
    if (confirm('Are you sure you want to delete this post?')) {
        const { error } = await supabaseClient
            .from('posts')
            .delete()
            .eq('id', postId);

        if (error) {
            console.error('Error deleting post:', error);
            alert('Failed to delete post.');
        } else {
            // Refresh posts after deletion
            showPosts(currentThreadId);
        }
    }
}

// Function to show the reply form for a specific post
function showReplyForm(postId) {
    const replyForm = document.getElementById(`reply-form-${postId}`);
    if (replyForm) {
        replyForm.style.display = 'block';
    }
}

// Function to hide the reply form for a specific post
function hideReplyForm(postId) {
    const replyForm = document.getElementById(`reply-form-${postId}`);
    if (replyForm) {
        replyForm.style.display = 'none';
    }
}

// 4b) Create a new post (reply) in the thread
async function createPost(threadId, parentPostId) {
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

    if (parentPostId) {
        newPost.reply_to_post_id = parentPostId;
    }

    const { error } = await supabaseClient
        .from('posts')
        .insert([newPost]);

    if (error) {
        console.error('Error creating post:', error);
        alert('Failed to create post.');
        return;
    }

    // Clear input and reload posts
    document.getElementById(textareaId).value = '';
    if (parentPostId) {
        hideReplyForm(parentPostId);
    } else {
        // If it's a top-level reply, ensure the focus stays on the main reply box (optional)
        document.getElementById('new-post-content').focus();
    }
    showPosts(threadId);
}

// Text styling functions
function applyStyle(style, textareaId) {
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
    // Adjust cursor position
    textarea.focus();
    textarea.selectionStart = start + replacement.length;
    textarea.selectionEnd = start + replacement.length;
}

function openLinkDialog(textareaId) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    const url = prompt('Enter the URL:');
    if (url) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selection = textarea.value.substring(start, end);
        const link = `<a href="${url}" target="_blank" rel="noopener noreferrer">${selection}</a>`; // Added target="_blank" and rel attributes
        textarea.value = textarea.value.substring(0, start) + link + textarea.value.substring(end);
        // Adjust cursor position
        textarea.focus();
        textarea.selectionStart = start + link.length;
        textarea.selectionEnd = start + link.length;
    }
}


// Back navigation functions
function goBackToForums() {
    showAllForums();
    // Reset state variables
    currentProjectId = null;
    currentCategoryId = null;
    currentThreadId = null;
}

function goBackToCategories() {
    if (currentProjectId) {
        showForumCategories(currentProjectId);
        // Reset thread and post state
        currentThreadId = null;
    } else {
        showAllForums();
    }
}

function goBackToThreads() {
    if (currentCategoryId) {
        showThreads(currentCategoryId);
        // Reset post state
        currentThreadId = null;
    } else if (currentProjectId) {
        showForumCategories(currentProjectId);
    } else {
        showAllForums();
    }
}
