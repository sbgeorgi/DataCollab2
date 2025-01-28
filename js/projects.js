// projects.js

// Ensure that the Supabase client is initialized
if (typeof supabaseClient === 'undefined') {
    console.error('Supabase client is not initialized. Make sure js/supabase.js is loaded correctly.');
}

// Handle Logout
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            alert('Error logging out: ' + error.message);
        } else {
            window.location.href = 'index.html';
        }
    });
}

// On page load, ensure the user is authenticated and has completed affiliation
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

        if (!session) {
            // No active session, redirect to login
            window.location.href = 'index.html';
        } else {
            // Check if user's affiliation is completed
            checkAffiliation();
        }
    } catch (err) {
        console.error('Error during session handling:', err);
        alert('An unexpected error occurred. Please try again.');
    }
});

// Function to check user's affiliation status
async function checkAffiliation() {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (session) {
        const { data: affiliation, error: affiliationError } = await supabaseClient
            .from('affiliations')
            .select('id')
            .eq('user_id', session.user.id)
            .single();

        if (affiliationError || !affiliation) {
            window.location.href = 'affiliation.html';
        }
    }
}

// Tab switching logic
const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.section');
const projectForm = document.getElementById('project-form');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const sectionId = tab.getAttribute('data-section');
        setActiveSection(sectionId);
    });
});

// Function to set the active section
function setActiveSection(sectionId) {
    // Remove active class from all tabs and sections
    tabs.forEach(t => t.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));

    // Add active class to the clicked tab and corresponding section
    const activeTab = document.querySelector(`.tab[data-section="${sectionId}"]`);
    const activeSection = document.getElementById(sectionId);
    if (activeTab) activeTab.classList.add('active');
    if (activeSection) activeSection.classList.add('active');

    // Load projects or other content based on the active section
    if (sectionId === 'general' || sectionId === 'data-management' || sectionId === 'mapping-tools' || sectionId === 'analytics' || sectionId === 'edit-project') {
        loadProjects(sectionId);
    } else if (sectionId === 'edit-project') {
        // Specific logic for edit-project (if needed)
    }
}

// Initialize Select2 for University Select with AJAX
initializeSelect2Dropdowns();

// Handle project form submission
if (projectForm) {
    projectForm.addEventListener('submit', handleProjectSubmission);
}

// Function to initialize Select2 dropdowns
function initializeSelect2Dropdowns() {
    const commonSelect2Options = {
        placeholder: "Search for a university",
        theme: "bootstrap-5",
        allowClear: true,
        ajax: {
            url: 'http://universities.hipolabs.com/search',
            dataType: 'json',
            delay: 250,
            data: function (params) {
                return {
                    name: params.term
                };
            },
            processResults: function (data) {
                const results = data.map(university => ({
                    id: university.name,
                    text: university.name
                }));
                return {
                    results: results
                };
            },
            cache: true
        },
        minimumInputLength: 2,
        templateResult: formatUniversityOption,
        templateSelection: formatUniversityOptionSelection
    };

    $('#lead-university').select2(commonSelect2Options).on('select2:select', function (e) {
        const selectedData = e.params.data;
        updateSelectedUniversityContainer('selected-lead-university', selectedData.text, false);
        // Keep the selected value in the Select2 dropdown
        $(this).val(selectedData.id).trigger('change');
    });

    $('#collaborating-partners').select2(commonSelect2Options).on('select2:select', function (e) {
        const selectedData = e.params.data;
        updateSelectedUniversityContainer('selected-collaborating-partners', selectedData.text, true);
        // For multiple selections, trigger change to update the dropdown
        $(this).trigger('change');
    });

    $('.selected-university-container').on('click', '.remove-university', function () {
        const universityToRemove = $(this).data('university');
        const containerId = $(this).closest('.selected-university-container').attr('id');
        removeUniversityFromContainer(containerId, universityToRemove);
    });
}

// Function to update the selected university container
function updateSelectedUniversityContainer(containerId, universityName, isMultiple) {
    const container = document.getElementById(containerId);
    if (!isMultiple) {
        container.innerHTML = '';
    }
    const universityElement = document.createElement('div');
    universityElement.classList.add('selected-university');
    universityElement.innerHTML = `
        <span>${universityName}</span>
        <span class="remove-university" data-university="${universityName}">×</span>
    `;
    container.appendChild(universityElement);
}

// Function to remove a university from the container
function removeUniversityFromContainer(containerId, universityName) {
    const container = document.getElementById(containerId);
    const universityElements = container.querySelectorAll('.selected-university');
    universityElements.forEach(element => {
        if (element.querySelector('span').textContent === universityName) {
            element.remove();
        }
    });

    if (containerId === 'selected-lead-university') {
        // Reset the lead university dropdown
        $('#lead-university').val(null).trigger('change');
    } else if (containerId === 'selected-collaborating-partners') {
        updateCollaboratingPartnersSelect();
    }
}

// Function to update the collaborating partners select dropdown
function updateCollaboratingPartnersSelect() {
    const selectedUniversities = Array.from(document.getElementById('selected-collaborating-partners').querySelectorAll('.selected-university span:first-child'))
        .map(span => span.textContent);
    $('#collaborating-partners').val(selectedUniversities).trigger('change');
}

// Function to format university option with icon for Select2 dropdown
function formatUniversityOption(state) {
    if (!state.id) {
        return state.text;
    }
    return $('<span><i class="fas fa-university" style="margin-right: 8px;"></i>' + state.text + '</span>');
}

// Function to format university selection with icon for Select2 dropdown
function formatUniversityOptionSelection(state) {
    if (!state.id) {
        return state.text;
    }
    return $('<span><i class="fas fa-university" style="margin-right: 8px;"></i>' + state.text + '</span>');
}

// Function to handle project form submission
async function handleProjectSubmission(event) {
    event.preventDefault();

    const projectName = document.getElementById('project-name').value;
    const projectDescription = document.getElementById('project-description').value;
    const leadUniversity = $('#lead-university').val(); // Get value directly from the dropdown
    const projectStatus = document.getElementById('project-status').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const collaboratingPartners = $('#collaborating-partners').val(); // Get values directly from the dropdown

    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (!session) {
        console.error('User not authenticated:', sessionError);
        alert('You must be logged in to create a project.');
        return;
    }

    const { data, error } = await supabaseClient
        .from('projects')
        .insert([
            {
                user_id: session.user.id,
                project_name: projectName,
                project_description: projectDescription,
                lead_university: leadUniversity,
                project_status: projectStatus,
                start_date: startDate,
                end_date: endDate,
                collaborating_partners: collaboratingPartners
            }
        ]);

    if (error) {
        console.error('Error creating project:', error);
        alert('Failed to create project.');
    } else {
        console.log('Project created successfully:', data);
        alert('Project created successfully!');
        // Optionally, reset the form or update the UI as needed
        document.getElementById('project-form').reset();
        document.getElementById('selected-lead-university').innerHTML = '';
        document.getElementById('selected-collaborating-partners').innerHTML = '';
        // Refresh the list of projects in the relevant sections
        loadProjects('general');
        loadProjects('data-management');
        loadProjects('mapping-tools');
        loadProjects('analytics');
        // Optionally, switch to the 'general' tab or another appropriate tab
        setActiveSection('general');
    }
}

// Function to load and display project cards
async function loadProjects(sectionId) {
    console.log("Loading projects for section:", sectionId);
    const section = document.getElementById(sectionId);
    if (!section) return;

    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (!session) {
        console.error('User not authenticated:', sessionError);
        return;
    }

    const { data: projects, error } = await supabaseClient
        .from('projects')
        .select('*')
        .eq('user_id', session.user.id);

    if (error) {
        console.error('Error fetching projects:', error);
        return;
    }

    // Find the container for project cards within the section
    let projectCardsContainer = section.querySelector('.project-cards-container');

    // If the container doesn't exist, create it
    if (!projectCardsContainer) {
        projectCardsContainer = document.createElement('div');
        projectCardsContainer.classList.add('project-cards-container');
        section.appendChild(projectCardsContainer); // Append after existing content
    }

    // Clear any existing project cards
    projectCardsContainer.innerHTML = '';

    // Create and append project cards to the container
    const projectCards = projects.map(project => createProjectCard(project, sectionId)).join('');
    projectCardsContainer.innerHTML = projectCards;

    // Add event listeners to project cards for selection
    const projectCardsElements = projectCardsContainer.querySelectorAll('.project-card');
    projectCardsElements.forEach(card => {
        card.addEventListener('click', (e) => {
            // If the user clicked the "Go to Forum" button, don't toggle selection
            if (e.target.classList.contains('forum-btn')) {
                return;
            }

            // Get the selected project ID
            const selectedProjectId = card.dataset.projectId;

            // Only proceed if the clicked card is not already selected
            if (!card.classList.contains('selected')) {
                // Remove active class from any previously selected card
                const selectedProjectCard = document.querySelector('.project-card.selected');
                if (selectedProjectCard) {
                    selectedProjectCard.classList.remove('selected');
                }

                // Add active class to the clicked card
                card.classList.add('selected');

                // Handle project selection based on sectionId (if needed)
                handleProjectSelection(sectionId, selectedProjectId);
            } else {
                // If the clicked card is already selected, deselect it
                card.classList.remove('selected');
                // Optionally, disable the button or perform other actions
                handleProjectSelection(sectionId, null);
            }
        });
    });
}

// Function to create a project card
function createProjectCard(project, sectionId) {
    // --- NEW CODE: Add "Go to Forum" button in the 'general' section ---
    let forumButtonHTML = '';
    if (sectionId === 'general') {
        forumButtonHTML = `
            <button class="forum-btn" onclick="redirectToForum('${project.id}')">
                Go to Forum
            </button>
        `;
    }
    // ------------------------------------------------------------------

    // Customize the card based on the section
    switch (sectionId) {
        case 'general':
            return `
                <div class="project-card" data-project-id="${project.id}">
                    <h3>${project.project_name}</h3>
                    <p>${project.project_description}</p>
                    <p>Lead University: ${project.lead_university}</p>
                    <p>Status: ${project.project_status}</p>
                    <p>Start Date: ${project.start_date || 'N/A'}</p>
                    <p>End Date: ${project.end_date || 'N/A'}</p>
                    ${forumButtonHTML}
                </div>
            `;
        case 'data-management':
        case 'mapping-tools':
        case 'analytics':
        case 'edit-project':
            return `
                <div class="project-card" data-project-id="${project.id}">
                    <h3>${project.project_name}</h3>
                    <p>${project.project_description}</p>
                </div>
            `;
        default:
            return '';
    }
}

// Simple helper to redirect to the forum for a specific project
function redirectToForum(projectId) {
    // We’ll pass a query parameter so forum.html knows which project’s forum to load
    window.location.href = `forum.html?forumForProjectId=${projectId}`;
}

// Function to handle project selection (add your logic here)
function handleProjectSelection(sectionId, projectId) {
    console.log(`Project selected in section ${sectionId}:`, projectId);

    // Reset all buttons to disabled state
    document.querySelectorAll('.action-btn').forEach(button => {
        button.disabled = true;
    });

    // Get the selected project card
    const selectedProjectCard = document.querySelector('.project-card.selected');

    // If a project is selected, enable corresponding buttons and show form
    if (selectedProjectCard) {
        switch (sectionId) {
            case 'edit-project':
                const editProjectForm = document.getElementById('edit-project-form');
                const updateProjectButton = document.getElementById('update-project-btn');
                if (editProjectForm) {
                    editProjectForm.style.display = 'flex';
                    populateEditForm(projectId);
                }
                if (updateProjectButton) {
                    updateProjectButton.style.display = 'block'; // Show the button
                    updateProjectButton.disabled = false; // Enable the button
                }
                break;
            case 'data-management':
                const importButton = document.querySelector(`#${sectionId} .action-btn#import-data-btn`);
                const exportButton = document.querySelector(`#${sectionId} .action-btn#export-data-btn`);
                if (importButton) importButton.disabled = false;
                if (exportButton) exportButton.disabled = false;
                break;
            case 'mapping-tools':
                const createMapButton = document.querySelector(`#${sectionId} #create-map-btn`);
                const editMapButton = document.querySelector(`#${sectionId} #edit-map-btn`);
                if (createMapButton) createMapButton.disabled = false;
                if (editMapButton) editMapButton.disabled = false;
                break;
            case 'analytics':
                const generateReportButton = document.querySelector(`#${sectionId} #generate-report-btn`);
                const viewInsightsButton = document.querySelector(`#${sectionId} #view-insights-btn`);
                if (generateReportButton) generateReportButton.disabled = false;
                if (viewInsightsButton) viewInsightsButton.disabled = false;
                break;
        }
    } else {
        // If no project is selected, hide the edit form and button
        if (sectionId === 'edit-project') {
            const editProjectForm = document.getElementById('edit-project-form');
            const updateProjectButton = document.getElementById('update-project-btn');
            if (editProjectForm) {
                editProjectForm.style.display = 'none';
            }
            if (updateProjectButton) {
                updateProjectButton.style.display = 'none';
            }
        }
    }
}

// Function to populate the edit project form with existing data
async function populateEditForm(projectId) {
    try {
        const { data: project, error } = await supabaseClient
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error) {
            console.error('Error fetching project data:', error);
            alert('Failed to fetch project data.');
            return;
        }

        // Populate the form fields
        document.getElementById('edit-project-name').value = project.project_name;
        document.getElementById('edit-project-description').value = project.project_description;
        $('#edit-lead-university').val(project.lead_university).trigger('change');
        document.getElementById('edit-project-status').value = project.project_status;
        document.getElementById('edit-start-date').value = project.start_date;
        document.getElementById('edit-end-date').value = project.end_date;
        $('#edit-collaborating-partners').val(project.collaborating_partners).trigger('change');

        // Update the selected universities containers
        document.getElementById('edit-selected-lead-university').innerHTML = `
            <div class="selected-university">
                <span>${project.lead_university}</span>
                <span class="remove-university" data-university="${project.lead_university}">×</span>
            </div>
        `;

        if (project.collaborating_partners && project.collaborating_partners.length > 0) {
            const collaboratingPartnersContainer = document.getElementById('edit-selected-collaborating-partners');
            collaboratingPartnersContainer.innerHTML = '';
            project.collaborating_partners.forEach(partner => {
                collaboratingPartnersContainer.innerHTML += `
                    <div class="selected-university">
                        <span>${partner}</span>
                        <span class="remove-university" data-university="${partner}">×</span>
                    </div>
                `;
            });
        }
    } catch (err) {
        console.error('Error populating edit form:', err);
        alert('An error occurred while populating the edit form.');
    }
}

// Profile popup logic
const profileBtn = document.getElementById('profile-btn');
const profileOverlay = document.getElementById('profile-overlay');
const closeProfileBtn = document.getElementById('close-profile');
const profileContent = document.getElementById('profile-content');
let currentAffiliationData = {};
let activeEditSection = null;

const profileIconContainer = document.getElementById('profile-icon-container');
const fileInput = document.getElementById('file-input');
const profileImage = document.getElementById('profile-image');

let hasLoadedInitialImage = false;

// Open Profile Modal
profileBtn.addEventListener('click', async () => {
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

            // Update profile content with reordered fields
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
                    }, { once: true }); // Ensure the listener is added only once per edit session
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
