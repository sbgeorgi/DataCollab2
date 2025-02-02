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

    // Tab switching logic
    const tabs = document.querySelectorAll('.tab');
    const sections = document.querySelectorAll('.section');
    const projectForm = document.getElementById('project-form');

    // Disable browser's default validation
    if (projectForm) {
        projectForm.noValidate = true;
        projectForm.addEventListener('submit', handleProjectSubmission);
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const sectionId = tab.getAttribute('data-section');
            setActiveSection(sectionId);
        });
    });

    // Initialize Select2 dropdowns
    initializeSelect2Dropdowns();

    // Initially load projects for the default active tab (if any)
    const defaultActiveTab = document.querySelector('.tab.active');
    if (defaultActiveTab) {
        setActiveSection(defaultActiveTab.getAttribute('data-section'));
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

let dataManagementProjectsLoaded = false; // Flag to track if Data Management projects are loaded

// Function to set the active section
function setActiveSection(sectionId) {
    const tabs = document.querySelectorAll('.tab');
    const sections = document.querySelectorAll('.section');
    const createMapBtn = document.getElementById('create-map-btn');

    // Remove active class from all tabs and sections
    tabs.forEach(t => t.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));

    // Add active class to the clicked tab and corresponding section
    const activeTab = document.querySelector(`.tab[data-section="${sectionId}"]`);
    const activeSection = document.getElementById(sectionId);
    if (activeTab) activeTab.classList.add('active');
    if (activeSection) activeSection.classList.add('active');

    // Load projects or other content based on the active section
    if (['general', 'data-management', 'mapping-tools', 'analytics', 'edit-project'].includes(sectionId)) {
        // --- MODIFICATION: Load Data Management projects only once ---
        if (sectionId === 'data-management') {
            if (!dataManagementProjectsLoaded) {
                console.log("Loading projects for Data Management section (first time)"); // Debug log
                loadProjects(sectionId);
                dataManagementProjectsLoaded = true;
            } else {
                console.log("Data Management projects already loaded, skipping reload."); // Debug log
            }
        } else {
            loadProjects(sectionId); // Load projects for other sections as before
        }
    }

    // Show/hide Create Map button based on active tab
    if (sectionId === 'mapping-tools') {
        createMapBtn.style.display = 'block';
    } else {
        createMapBtn.style.display = 'none';
    }
}

// Function to initialize Select2 dropdowns
function initializeSelect2Dropdowns() {
    const commonSelect2Options = {
        placeholder: "Search for a university",
        theme: "bootstrap-5",
        allowClear: true,
        ajax: {
            transport: function (params, success, failure) {
                // Fetch the local JSON file
                fetch('assets/world_universities_and_domains.json')
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Network response was not ok');
                        }
                        return response.json();
                    })
                    .then(data => {
                        // Filter universities based on the input term
                        const term = params.data.term?.toLowerCase() || '';
                        const filtered = data.filter(university =>
                            university.name.toLowerCase().includes(term)
                        );

                        // Map the filtered results to Select2's expected format
                        const results = filtered.map(university => ({
                            id: university.name,
                            text: university.name,
                        }));

                        // If no results, provide an option to add a new university
                        if (results.length === 0 && term.trim() !== '') {
                            results.push({
                                id: 'add_university_option',
                                text: 'Add University "' + params.data.term + '"',
                                custom: true
                            });
                        }

                        success({ results });
                    })
                    .catch(error => {
                        console.error('Error loading universities:', error);
                        failure(error);
                    });
            },
            processResults: function (data) {
                return data;
            },
        },
        minimumInputLength: 2,
        templateResult: formatUniversityOption,
        templateSelection: formatUniversityOptionSelection,
    };

    // Initialize Select2 for Lead University
    $('#lead-university').select2(commonSelect2Options).on('select2:select', function (e) {
        const selectedData = e.params.data;
        let universityName;

        if (selectedData.id === 'add_university_option') {
            universityName = prompt('Enter the name of the new university:');
            if (universityName) {
                updateSelectedUniversityContainer('selected-lead-university', universityName, false);
            }
        } else {
            universityName = selectedData.text;
            updateSelectedUniversityContainer('selected-lead-university', universityName, false);
        }

        // Keep the selected value in the Select2 dropdown
        $(this).val(null).trigger('change');
    });

    // Initialize Select2 for Collaborating Partners
    $('#collaborating-partners').select2(commonSelect2Options).on('select2:select', function (e) {
        const selectedData = e.params.data;
        let universityName;

        if (selectedData.id === 'add_university_option') {
            universityName = prompt('Enter the name of the new university:');
            if (universityName) {
                updateSelectedUniversityContainer('selected-collaborating-partners', universityName, true);
            }
        } else {
            universityName = selectedData.text;
            updateSelectedUniversityContainer('selected-collaborating-partners', universityName, true);
        }

        // Keep the selected value in the Select2 dropdown
        $(this).val(null).trigger('change');
    });

    // Event listener for removing universities
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

    if (state.id === 'add_university_option') {
        return $('<span class="select2-results__option--add-university">Add University <i class="fas fa-check"></i></span>');
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

    // Custom Validation: Check if Lead University is selected
    const selectedLeadUniversityElement = document.querySelector('#selected-lead-university .selected-university span');
    const leadUniversity = selectedLeadUniversityElement ? selectedLeadUniversityElement.textContent.trim() : null;

    if (!leadUniversity) {
        alert("Please select an item from the list");
        return;
    }

    const projectName = document.getElementById('project-name').value.trim();
    const projectDescription = document.getElementById('project-description').value.trim();
    const projectStatus = document.getElementById('project-status').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const collaboratingPartnersElements = document.querySelectorAll('#selected-collaborating-partners .selected-university span');
    const collaboratingPartners = Array.from(collaboratingPartnersElements).map(span => span.textContent.trim());

    // Additional Validation (Optional): Ensure project name and description are not empty
    if (!projectName) {
        alert("Project Name is required.");
        return;
    }

    if (!projectDescription) {
        alert("Project Description is required.");
        return;
    }

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
    console.log("Loading projects for section:", sectionId); // Debug log - added to track function calls
    const section = document.getElementById(sectionId);
    if (!section) return;

    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (!session) {
        console.error('User not authenticated:', sessionError);
        return;
    }

    let query = supabaseClient.from('projects').select('*');

    if (sectionId !== 'general') {
        // For sections other than general, fetch only projects user is part of
        const userProjects = await loadUserProjects();
        const projectIds = userProjects.map(up => up.project_id);
        if (projectIds.length > 0) {
            query = query.in('id', projectIds);
        } else {
            // If user is not part of any projects, return empty array to display no projects
            query = query.in('id', []);
        }
    }

    const { data: projects, error } = await query;

    if (error) {
        console.error('Error fetching projects:', error);
        return;
    }

    console.log("Fetched projects data:", projects); // Debug log - added to track fetched data

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

    if (sectionId === 'general') {
        // For general tab, check membership and create cards with join/leave button
        const userProjects = await loadUserProjects();
        const userProjectIds = new Set(userProjects.map(up => up.project_id));
        const projectCards = projects.map(project => createProjectCard(project, sectionId, userProjectIds.has(project.id))).join('');
        projectCardsContainer.innerHTML = projectCards;
    } else {
        // For other tabs, just create project cards
        const projectCards = projects.map(project => createProjectCard(project, sectionId)).join('');
        projectCardsContainer.innerHTML = projectCards;
    }

    // Add event listeners to project cards for selection
    const projectCardsElements = projectCardsContainer.querySelectorAll('.project-card');
    projectCardsElements.forEach(card => {
        card.addEventListener('click', (e) => {
            // -- MODIFICATION: We removed the code that prevented selection if the user clicked the forum button. --
            // Previously:
            // if (e.target.classList.contains('forum-btn') || e.target.classList.contains('join-leave-btn')) {
            //     return;
            // }

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
function createProjectCard(project, sectionId, isMember = false) {
    // --- NEW CODE: Add "Go to Forum" and "Join/Leave" button in the 'general' section ---
    let actionButtonsHTML = '';
    if (sectionId === 'general') {
        actionButtonsHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <button class="forum-btn action-btn" onclick="redirectToForum('${project.id}')">
                    Go to Forum
                </button>
            </div>
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
                    ${actionButtonsHTML}
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

let currentSelectedProjectId = null; // Keep track of selected project ID

// Function to handle project selection (add your logic here)
async function handleProjectSelection(sectionId, projectId) {
    console.log(`Project selected in section ${sectionId}:`, projectId);
    currentSelectedProjectId = projectId; // Update the globally tracked project ID

    // Reset all buttons to disabled state (except join/leave in general tab)
    if (sectionId !== 'general') {
        document.querySelectorAll('.action-btn').forEach(button => {
            button.disabled = true;
        });
    }

    // Get the selected project card
    const selectedProjectCard = document.querySelector('.project-card.selected');

    // Hide join/leave button container initially
    const joinLeaveButtonContainer = document.getElementById('join-leave-button-container');
    if (joinLeaveButtonContainer) {
        joinLeaveButtonContainer.style.display = 'none';
    }

    // If a project is selected, enable corresponding buttons and show form
    if (selectedProjectCard) {
        if (sectionId === 'general') {
            // For General tab, show Join/Leave button
            if (joinLeaveButtonContainer) {
                joinLeaveButtonContainer.style.display = 'block';
            }
            const joinLeaveProjectBtn = document.getElementById('join-leave-project-btn');
            if (joinLeaveProjectBtn) {
                const isMember = await isUserMemberOfProject(projectId);
                joinLeaveProjectBtn.textContent = isMember ? 'Leave Project' : 'Join Project';
                joinLeaveProjectBtn.onclick = () => handleJoinLeaveProject(projectId, isMember);
            }
        } else {
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

// Function to handle Join/Leave Project action
async function handleJoinLeaveProject(projectId, isMember) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (!session) {
        console.error('User not authenticated:', sessionError);
        alert('You must be logged in to join or leave a project.');
        return;
    }
    const userId = session.user.id;

    if (isMember) {
        await leaveProject(projectId, userId);
        alert('You have left the project.');
    } else {
        await joinProject(projectId, userId);
        alert('You have joined the project!');
    }
    // Reload projects to update the button and project lists
    loadProjects('general');
    // Refresh other sections as well, so projects will appear/disappear based on membership
    loadProjects('data-management');
    loadProjects('mapping-tools');
    loadProjects('analytics');
    loadProjects('edit-project');

    // After join/leave, re-evaluate the button state for the currently selected project (if any)
    if (currentSelectedProjectId) {
        handleProjectSelection('general', currentSelectedProjectId);
    }
}

// Function to check if user is a member of a project
async function isUserMemberOfProject(projectId) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (!session) {
        console.error("User is not logged in:", sessionError);
        return false; // Not logged in, cannot be member
    }
    const userId = session.user.id;

    const { data, error } = await supabaseClient
        .from('project_users')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId);

    if (error) {
        console.error('Error checking project membership:', error);
        return false; // Assume not a member in case of error
    }

    // Check if the data array is not null and has at least one element
    return data && data.length > 0;
}

// Function to add user to a project
async function joinProject(projectId, userId) {
    const { error } = await supabaseClient
        .from('project_users')
        .insert([{ project_id: projectId, user_id: userId }]);
    if (error) {
        console.error('Error joining project:', error);
        alert('Failed to join project.');
    }
}

// Function to remove user from a project
async function leaveProject(projectId, userId) {
    const { error } = await supabaseClient
        .from('project_users')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);
    if (error) {
        console.error('Error leaving project:', error);
        alert('Failed to leave project.');
    }
}

// Function to load projects that the current user is a member of
async function loadUserProjects() {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (!session) {
        console.error('User not authenticated:', sessionError);
        return []; // Return empty array if not logged in
    }
    const userId = session.user.id;

    const { data, error } = await supabaseClient
        .from('project_users')
        .select('project_id')
        .eq('user_id', userId);

    if (error) {
        console.error('Error fetching user projects:', error);
        return []; // Return empty array in case of error
    }
    return data || [];
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
                    const inputListener = () => {
                        if (editInput.value.trim() !== currentAffiliationData[field]) {
                            acceptButton.style.display = '';
                        } else {
                            acceptButton.style.display = 'none';
                        }
                    };
                    editInput.addEventListener('input', inputListener, { once: true }); // Ensure the listener is added only once per edit session

                    // Reset the display if input is not changed
                    editInput.addEventListener('blur', () => {
                        if (acceptButton.style.display === 'none') {
                            valueDisplay.style.display = '';
                            editInput.classList.remove('edit-mode');
                            editButton.style.display = '';
                            acceptButton.remove();
                            activeEditSection = null;
                        }
                    }, { once: true });
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
        alert('An error occurred while trying to fetch profile data.');
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