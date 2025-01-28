// project_edit.js

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
            // Initialize Select2 dropdowns
            initializeSelect2Dropdowns();
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

// Function to populate the edit form with project details
async function populateEditForm(projectId) {
    if (!projectId) {
        console.error('No project selected for editing.');
        return;
    }

    try {
        const { data: project, error } = await supabaseClient
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error) throw error;

        // Populate the form fields
        document.getElementById('edit-project-name').value = project.project_name;
        document.getElementById('edit-project-description').value = project.project_description;

        // Initialize and set value for lead university
        $('#edit-lead-university').val(project.lead_university).trigger('change');
        const leadUniversityOption = new Option(project.lead_university, project.lead_university, true, true);
        $('#edit-lead-university').append(leadUniversityOption).trigger('change');

        document.getElementById('edit-project-status').value = project.project_status;
        document.getElementById('edit-start-date').value = project.start_date;
        document.getElementById('edit-end-date').value = project.end_date;

        // Initialize and set values for collaborating partners
        $('#edit-collaborating-partners').val(project.collaborating_partners).trigger('change');
        const selectedCollaboratingPartnersContainer = document.getElementById('edit-selected-collaborating-partners');
        selectedCollaboratingPartnersContainer.innerHTML = '';
        if (Array.isArray(project.collaborating_partners)) {
            project.collaborating_partners.forEach(partner => {
                // Create and append the option for each partner
                const partnerOption = new Option(partner, partner, true, true);
                $('#edit-collaborating-partners').append(partnerOption).trigger('change');
                 // Update the selected university container to display initial partners visually
                updateSelectedUniversityContainer('edit-selected-collaborating-partners', partner, true);
            });
        }
        // At this point, the Select2 dropdown for 'edit-collaborating-partners' is initialized and
        // populated with the existing collaborating partners.
        // To add more partners, the user should be able to search in the dropdown and select new universities.
        // The 'select2:select' event listener attached to '#edit-collaborating-partners' in 'initializeSelect2Dropdowns'
        // function will handle adding newly selected partners to the list.


    } catch (err) {
        console.error('Error fetching project details:', err);
        alert('Failed to fetch project details.');
    }
}

// Handle project update
document.getElementById('update-project-btn').addEventListener('click', async (event) => {
    event.preventDefault(); // Prevent form from submitting in the traditional way

    const projectId = document.querySelector('.project-card.selected')?.dataset.projectId;
    if (!projectId) {
        alert('Please select a project to edit.');
        return;
    }

    // Get the updated collaborating partners from the Select2 dropdown.
    // $('#edit-collaborating-partners').val() will return an array of all selected partner names,
    // including any newly added partners through the Select2 interface.
    const updatedProjectData = {
        project_description: document.getElementById('edit-project-description').value,
        lead_university: $('#edit-lead-university').val(), // Get the value directly from Select2
        project_status: document.getElementById('edit-project-status').value,
        start_date: document.getElementById('edit-start-date').value,
        end_date: document.getElementById('edit-end-date').value,
        collaborating_partners: $('#edit-collaborating-partners').val()
    };

    try {
        const { data, error } = await supabaseClient
            .from('projects')
            .update(updatedProjectData)
            .eq('id', projectId);

        if (error) throw error;

        alert('Project updated successfully!');
        loadProjects('edit-project'); // Refresh the projects in the edit-project section
    } catch (err) {
        console.error('Error updating project:', err);
        alert('Failed to update project.');
    }
});

// Function to initialize Select2 dropdowns with local JSON
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
    $('#edit-lead-university').select2(commonSelect2Options).on('select2:select', function (e) {
        const selectedData = e.params.data;
        let universityName;

        if (selectedData.id === 'add_university_option') {
            universityName = prompt('Enter the name of the new university:');
            if (universityName) {
                updateSelectedUniversityContainer('edit-selected-lead-university', universityName, false);
            }
        } else {
            universityName = selectedData.text;
            updateSelectedUniversityContainer('edit-selected-lead-university', universityName, false);
        }

        // Keep the selected value in the Select2 dropdown
        $(this).val(null).trigger('change');
    });

    // Initialize Select2 for Collaborating Partners
    $('#edit-collaborating-partners').select2(commonSelect2Options).on('select2:select', function (e) {
        const selectedData = e.params.data;
        let universityName;

        if (selectedData.id === 'add_university_option') {
            universityName = prompt('Enter the name of the new university:');
            if (universityName) {
                updateSelectedUniversityContainer('edit-selected-collaborating-partners', universityName, true);
            }
        } else {
            universityName = selectedData.text;
            updateSelectedUniversityContainer('edit-selected-collaborating-partners', universityName, true);
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

     // Trigger change on the corresponding Select2 element to keep value in sync
    if (containerId === 'edit-selected-lead-university') {
        $('#edit-lead-university').val(universityName).trigger('change');
    } else if (containerId === 'edit-selected-collaborating-partners') {
        const currentValues = $('#edit-collaborating-partners').val() || [];
        if (!currentValues.includes(universityName)) {
            currentValues.push(universityName);
            $('#edit-collaborating-partners').val(currentValues).trigger('change');
        }
    }
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

    if (containerId === 'edit-selected-lead-university') {
        // Reset the lead university dropdown
        $('#edit-lead-university').val(null).trigger('change');
    } else if (containerId === 'edit-selected-collaborating-partners') {
        updateCollaboratingPartnersSelect();
    }
}

// Function to update the collaborating partners select dropdown
function updateCollaboratingPartnersSelect() {
    const selectedUniversities = Array.from(document.getElementById('edit-selected-collaborating-partners').querySelectorAll('.selected-university span:first-child'))
        .map(span => span.textContent);
    $('#edit-collaborating-partners').val(selectedUniversities).trigger('change');
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
