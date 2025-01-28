// settings.js

// Ensure that the Supabase client is initialized
if (typeof supabaseClient === 'undefined') {
    console.error('Supabase client is not initialized. Make sure js/supabase.js is loaded correctly.');
}

// Handle Logout
const logoutBtn = document.getElementById('logout-btn');
logoutBtn.addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        alert('Error logging out: ' + error.message);
    } else {
        window.location.href = 'index.html';
    }
});

// Profile popup logic
const settingsBtn = document.getElementById('settings-btn');
const profileOverlay = document.getElementById('profile-overlay');
const closeProfileBtn = document.getElementById('close-profile');
const profileContent = document.getElementById('profile-content');
let currentAffiliationData = {};
let activeEditSection = null;

const profileIconContainer = document.getElementById('profile-icon-container');
const fileInput = document.getElementById('file-input');
const profileImage = document.getElementById('profile-image');

let hasLoadedInitialImage = false;

// Fetch session and initial profile image on DOMContentLoaded
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

        if (session) {
            const userId = session.user.id;

            // Fetch the profile image
            const { data: list, error: listError } = await supabaseClient
                .storage
                .from('Profile_Images')
                .list(`${userId}/`);

            if (!listError && list.length > 0) {
                // Assuming only one image, retrieve the first one
                const imageName = list[0].name;

                const { data: publicUrlData, error: urlError } = supabaseClient
                    .storage
                    .from('Profile_Images')
                    .getPublicUrl(`${userId}/${imageName}`);

                if (!urlError && publicUrlData) {
                    const imageUrl = publicUrlData.publicUrl;
                    // Set the profile image
                    profileImage.src = imageUrl;
                } else {
                    console.warn('Error fetching public URL:', urlError);
                }
            } else {
                console.warn('No profile image found. Using default icon.');
            }
        } else {
            // No active session, redirect to login
            window.location.href = 'index.html';
        }
    } catch (err) {
        console.error('Error during session handling:', err);
        alert('An unexpected error occurred. Please try again.');
    }
});

// Open Profile Modal
settingsBtn.addEventListener('click', async () => {
    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

        if (session) {
            const userId = session.user.id;

            if (!hasLoadedInitialImage) {
                try {
                    const { data: list, error: listError } = await supabaseClient
                        .storage
                        .from('Profile_Images')
                        .list(`${userId}/`);

                    if (listError) {
                        console.error('Error fetching image list:', listError);
                    } else if (list.length > 0) {

                        // Assuming only one image, retrieve the first one
                        const imageName = list[0].name;

                        const { data: publicUrlData, error: urlError } = supabaseClient
                            .storage
                            .from('Profile_Images')
                            .getPublicUrl(`${userId}/${imageName}`);

                        if (!urlError && publicUrlData) {
                            const imageUrl = publicUrlData.publicUrl;
                            profileImage.src = imageUrl;
                            profileIconContainer.classList.add('has-image');

                            profileImage.onerror = () => {
                                profileImage.src = 'assets/profile_icon.png';
                                console.error('Failed to load profile image.');
                            };
                        } else {
                            console.warn('Error fetching public URL:', urlError);
                        }

                    } else {
                        console.warn('No profile image found. Using default icon.');
                        profileImage.src = 'assets/profile_icon.png';
                        profileIconContainer.classList.remove('has-image');
                    }
                } catch (err) {
                    console.error('Error during image load:', err);
                }
                hasLoadedInitialImage = true; // Flag to indicate initial image check
            }

            const { data: affiliationData, error: affiliationError } = await supabaseClient
                .from('affiliations')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (affiliationError) {
                console.error('Error fetching affiliation data:', affiliationError);
                alert('Could not load profile information.');
                return;
            }
            currentAffiliationData = { ...affiliationData };


            profileContent.innerHTML = `
               <!-- First Name Section -->
               <div class="profile-section" data-field="first_name">
                 <label>First Name<span class="required">*</span></label>
                  <span class="value">${affiliationData.first_name}</span>
                 <input type="text" class="edit-input" value="${affiliationData.first_name}">
                   <button class="edit-button"><img src="assets/edit.png" alt="Edit"></button>
              </div>

              <!-- Last Name Section -->
              <div class="profile-section" data-field="last_name">
                <label>Last Name<span class="required">*</span></label>
                <span class="value">${affiliationData.last_name}</span>
                  <input type="text" class="edit-input" value="${affiliationData.last_name}">
                  <button class="edit-button"><img src="assets/edit.png" alt="Edit"></button>
           </div>

              <!-- Username Section -->
              <div class="profile-section" data-field="username">
                <label>Username<span class="required">*</span></label>
                 <span class="value">${affiliationData.username}</span>
                <input type="text" class="edit-input" value="${affiliationData.username}">
                 <button class="edit-button"><img src="assets/edit.png" alt="Edit"></button>
             </div>

               <!-- Existing Sections -->
               <div class="profile-section" data-field="university">
                 <label>University</label>
                  <span class="value">${affiliationData.university}</span>
                 <input type="text" class="edit-input" value="${affiliationData.university}">
                   <button class="edit-button"><img src="assets/edit.png" alt="Edit"></button>
                </div>
                <div class="profile-section" data-field="department">
                  <label>Department</label>
                  <span class="value">${affiliationData.department}</span>
                    <input type="text" class="edit-input" value="${affiliationData.department}">
                    <button class="edit-button"><img src="assets/edit.png" alt="Edit"></button>
               </div>
                <div class="profile-section" data-field="job_title">
                  <label>Job Title</label>
                   <span class="value">${affiliationData.job_title}</span>
                  <input type="text" class="edit-input" value="${affiliationData.job_title}">
                   <button class="edit-button"><img src="assets/edit.png" alt="Edit"></button>
               </div>
                <div class="profile-section" data-field="research_interests">
                 <label>Research Interests</label>
                  <span class="value">${affiliationData.research_interests}</span>
                   <input type="text" class="edit-input" value="${affiliationData.research_interests}">
                   <button class="edit-button"><img src="assets/edit.png" alt="Edit"></button>
               </div>
              <div class="profile-section" data-field="personal_webpage">
                <label>Personal Webpage</label>
                <span class="value">${affiliationData.personal_webpage || 'Not provided'}</span>
                 <input type="text" class="edit-input" value="${affiliationData.personal_webpage || ''}">
                 <button class="edit-button"><img src="assets/edit.png" alt="Edit"></button>
                </div>
               <div class="profile-section" data-field="whatsapp">
                 <label>WhatsApp</label>
                <span class="value">${affiliationData.whatsapp || 'Not provided'}</span>
               <input type="text" class="edit-input" value="${affiliationData.whatsapp || ''}">
                <button class="edit-button"><img src="assets/edit.png" alt="Edit"></button>
               </div>
             `;
            profileOverlay.style.display = 'flex';

            // Profile Image Upload Handling
            profileIconContainer.addEventListener('click', () => {
                fileInput.click();
            });

            // Add event listeners for edit buttons
            profileContent.querySelectorAll('.profile-section').forEach(section => {
                const editButton = section.querySelector('.edit-button');
                const acceptButton = document.createElement('button');
                acceptButton.classList.add('accept-button');
                acceptButton.innerHTML = '<img src="assets/accept.png" alt="Accept">';
                acceptButton.style.display = 'none'; // initially hidden

                const valueDisplay = section.querySelector('.value');
                const editInput = section.querySelector('.edit-input');
                const field = section.dataset.field;


                editButton.addEventListener('click', () => {

                    if (activeEditSection && activeEditSection !== section) {
                        discardEdit(activeEditSection);
                    }

                    valueDisplay.style.display = 'none';
                    editInput.classList.add('edit-mode');
                    editButton.style.display = 'none';
                    section.appendChild(acceptButton);
                    acceptButton.style.display = 'none'; // Hide initially
                    activeEditSection = section;

                    // Event listener to show accept icon if the user changes the value
                    editInput.addEventListener('input', () => {
                        if (editInput.value.trim() !== currentAffiliationData[field]) {
                            acceptButton.style.display = '';
                        } else {
                            acceptButton.style.display = 'none';
                        }
                    }, { once: true }); // Ensure the listener is added only once
                });


                acceptButton.addEventListener('click', async () => {
                    const newValue = editInput.value.trim();
                    valueDisplay.textContent = newValue || 'Not provided';
                    valueDisplay.style.display = '';
                    editInput.classList.remove('edit-mode');
                    editButton.style.display = '';
                    acceptButton.remove();
                    currentAffiliationData[field] = newValue;
                    activeEditSection = null;
                    // Update Supabase data
                    try {
                        const { error } = await supabaseClient
                            .from('affiliations')
                            .update(
                                { [field]: newValue }
                            )
                            .eq('user_id', session.user.id)

                        if (error) {
                            console.error('Error updating affiliation data:', error);
                            alert('Error updating profile, please try again');
                        } else {
                            alert('Profile data has been updated');
                        }

                    } catch (err) {
                        console.error('Error updating data for profile:', err);
                        alert('An error occurred while trying to update profile data');
                    }

                });

            });


        } else {
            window.location.href = 'index.html';
        }
    } catch (err) {
        console.error('Error fetching data for profile:', err);
        alert('An error occurred while trying to fetch profile data');
    }
});

function discardEdit(section) {
    const valueDisplay = section.querySelector('.value');
    const editInput = section.querySelector('.edit-input');
    const editButton = section.querySelector('.edit-button');
    const acceptButton = section.querySelector('.accept-button');
    const field = section.dataset.field;
    editInput.classList.remove('edit-mode');
    valueDisplay.style.display = '';
    editButton.style.display = '';
    if (acceptButton) {
        acceptButton.remove();
    }
    editInput.value = currentAffiliationData[field] || '';

    activeEditSection = null;
}

fileInput.addEventListener('change', async (e) => {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (session) {
        await handleImageUpload(e.target.files[0], session);
    } else if (sessionError) {
        console.error('Error fetching session:', sessionError);
        alert('Error fetching session. Try again.');
    }
});

profileIconContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    profileIconContainer.style.borderColor = '#2ecc71'; // highlight on dragover
});

profileIconContainer.addEventListener('dragleave', () => {
    profileIconContainer.style.borderColor = '#9b59b6'; // reset on dragleave
});

profileIconContainer.addEventListener('drop', async (e) => {
    e.preventDefault();
    profileIconContainer.style.borderColor = '#9b59b6'; // reset border color on drop
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (session) {
        await handleImageUpload(e.dataTransfer.files[0], session);
    } else if (sessionError) {
        console.error('Error fetching session:', sessionError);
        alert('Error fetching session. Try again.');
    }

});


async function handleImageUpload(file, session) {
    if (file) {
        // Check if the file size is greater than 2MB
        if (file.size > 2 * 1024 * 1024) {
            alert('File size must be less than 2MB.');
            fileInput.value = '';
            return;
        }

        // Authentication check (using the session object)
        if (!session) {
            console.error('Error: Session is not defined', session);
            alert('There is no current session, try again later!');
            return;
        }

        const userId = session.user.id;
        const fileExt = file.name.split('.').pop();
        const newFileName = `profile_${userId}.${fileExt}`;
        const filePath = `${userId}/${newFileName}`;

        try {
            // Remove the existing profile image if it exists
            const { data: existingFiles, error: listError } = await supabaseClient
                .storage
                .from('Profile_Images')
                .list(userId, {
                    search: `profile_${userId}`
                });

            if (listError) {
                console.error('Error listing existing files', listError);
                alert('Error trying to find profile picture');
                return;
            }

            if (existingFiles && existingFiles.length > 0) {
                const { error: removeError } = await supabaseClient
                    .storage
                    .from('Profile_Images')
                    .remove([`${userId}/${existingFiles[0].name}`]);

                if (removeError) {
                    console.error('Error removing existing profile image:', removeError);
                    alert('Error removing existing profile image.');
                    return;
                }
            }

            // Upload the new profile image
            const { data, error: uploadError } = await supabaseClient
                .storage
                .from('Profile_Images')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true, // Use upsert to replace if necessary
                });

            // Authorization/Upload Error Handling
            if (uploadError) {
                if (uploadError.status === 403) { // 403 Forbidden
                    alert('Unauthorized: You do not have permission to upload files here.');
                } else {
                    alert(`Error uploading profile pic: ${uploadError.message}`);
                }
                console.error('Error uploading profile pic:', uploadError);
                fileInput.value = '';
                return;
            }

            const { data: publicUrlData, error: urlError } = supabaseClient
                .storage
                .from('Profile_Images')
                .getPublicUrl(filePath);

            if (!urlError && publicUrlData) {
                const imageUrl = publicUrlData.publicUrl;
                profileImage.src = imageUrl;
                profileIconContainer.classList.add('has-image');
            } else {
                console.warn('Error fetching public URL:', urlError);
                alert('Profile image uploaded but failed to retrieve URL.');
            }

            fileInput.value = ''; // Clear the file input

        } catch (err) {
            console.error('Unexpected error:', err);
            alert('Unexpected error occurred during profile pic upload.');
        }
    }
}



closeProfileBtn.addEventListener('click', () => {
    if (activeEditSection) {
        discardEdit(activeEditSection);
        activeEditSection = null;
    }
    profileOverlay.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === profileOverlay) {
        if (activeEditSection) {
            discardEdit(activeEditSection);
            activeEditSection = null;
        }
        profileOverlay.style.display = 'none';
    }
});
