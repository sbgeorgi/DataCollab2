$(document).ready(function () {
    let selectedProjectId = null;
    let dataTable = null;

    // We'll store a deep copy of the originally loaded data here.
    let originalData = [];
    // Keep track of pending changes: { rowIndex: { columnName: newValue, ... }, ... }
    let pendingChanges = {};
    // Use this for checking how many cells are changed (including multiple changes in the same cell).
    // But we only want unique cells that differ from original, so we'll track them carefully.

    const excelMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'application/vnd.ms-excel.sheet.macroEnabled.12', // .xlsm
        'application/vnd.openxmlformats-officedocument.spreadsheetml.template', // .xltx
        'application/vnd.ms-excel.sheet.binary.macroEnabled.12' // .xlsb
    ];

    // Function to fetch available data tables for a selected project
    async function loadProjectDataTables(projectId) {
        if (!projectId) {
            console.log('No project selected to load data tables.');
            $('#data-table-buttons').empty();
            hideDataTable();
            return;
        }

        const { data, error } = await supabaseClient
            .from('project_data')
            .select('id, file_name, data')
            .eq('project_id', projectId);

        if (error) {
            console.error('Error fetching project data tables:', error);
            return;
        }

        if (data && data.length > 0) {
            createDataTableButtons(data);
        } else {
            console.log('No data tables found for this project.');
            $('#data-table-buttons').empty();
            hideDataTable();
        }
    }

    // Function to create buttons for selecting a data table
    function createDataTableButtons(dataTables) {
        const buttonsContainer = $('#data-table-buttons');
        buttonsContainer.empty();

        const uniqueFiles = new Map();

        dataTables.forEach(table => {
            if (!uniqueFiles.has(table.file_name)) {
                uniqueFiles.set(table.file_name, table);
            }
        });

        uniqueFiles.forEach((table, fileName) => {
            const button = $(`<button class="data-table-button dt-button" data-file-id="${table.id}" data-file-name="${fileName}">${fileName}</button>`);
            button.on('click', function () {
                $('.data-table-button').removeClass('selected');
                $(this).addClass('selected');
                displaySelectedDataTable(table);
            });
            buttonsContainer.append(button);
        });

        if (uniqueFiles.size > 0) {
            buttonsContainer.show();
        } else {
            buttonsContainer.hide();
        }
    }

    // Function to display the selected data table
    function displaySelectedDataTable(selectedTable) {
        const data = selectedTable.data;

        if (data && data.length > 0) {
            displayDataInDataTable(data, selectedTable.id);
        } else {
            console.log('Selected data table is empty.');
            hideDataTable();
        }
    }

    // Handle project card selection within the data-management section
    function handleProjectSelection() {
        $('#data-management-project-cards .project-card').off('click');
        $('#data-management-project-cards .project-card').on('click', function() {
            $('#data-management-project-cards .project-card').removeClass('selected');
            $(this).addClass('selected');
            selectedProjectId = $(this).data('project-id');
            $('#import-data-btn').prop('disabled', false);
            $('#export-data-btn').prop('disabled', false);

            loadProjectDataTables(selectedProjectId);
            console.log("Project selected in section data-management:", selectedProjectId);
        });
    }

    // Load projects and populate the project cards (Specifically for Data Management)
    async function loadProjects() {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (!sessionData?.session) {
            window.location.href = '/login.html';
            return;
        }
        const user = sessionData.session.user;

        const { data: projects, error } = await supabaseClient
            .from('projects')
            .select('id, project_name, project_description')
            .eq('user_id', user.id);

        if (error) {
            console.error('Error loading projects:', error);
            alert('Error loading projects: ' + error.message);
            return;
        }

        const projectCardsContainer = $('#data-management-project-cards');
        projectCardsContainer.empty();

        if (!projects || projects.length === 0) {
            projectCardsContainer.append('<p>No projects found.</p>');
            return;
        }

        projects.forEach(project => {
            const card = $(`
                <div class="project-card" data-project-id="${project.id}">
                    <h3>${project.project_name}</h3>
                    <p>${project.project_description}</p>
                </div>
            `);
            projectCardsContainer.append(card);
        });

        handleProjectSelection();
    }

    // Handle tab switching for Data Management
    $('.tab[data-section="data-management"]').on('click', async function () {
        await loadProjects();
        selectedProjectId = null;
        $('#import-data-btn').prop('disabled', true);
        $('#export-data-btn').prop('disabled', true);
        hideDataTable();
        $('#data-table-buttons').empty().hide();
        $('#data-management-project-cards .project-card').removeClass('selected');
    });

    // Handle file upload
    function handleFileUpload() {
        if (!selectedProjectId) {
            alert('Please select a project first.');
            return;
        }
        const fileInput = $('<input type="file">');
        fileInput.attr('accept', '.xlsx,.xls,.xlsm,.xltx,.xlsb,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.template,application/vnd.ms-excel.sheet.binary.macroEnabled.12');
        fileInput.on('change', function (event) {
            const file = event.target.files[0];
            if (file) {
                uploadFile(file);
            }
        });
        fileInput.click();
    }

    // Upload the file to Supabase Storage
    async function uploadFile(file) {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (!session) {
            console.error('User is not logged in:', sessionError);
            alert('You must be logged in to upload files.');
            return;
        }

        const userId = session.user.id;
        const fileExt = file.name.split('.').pop();
        const uniqueFileName = `data_${Date.now()}.${fileExt}`;
        const filePath = `${userId}/${selectedProjectId}/${uniqueFileName}`;

        const { data, error } = await supabaseClient.storage
            .from('project_data_imports')
            .upload(filePath, file);

        if (error) {
            console.error('Error uploading file:', error);
            alert('Error uploading file: ' + error.message);
            return;
        }

        console.log('File uploaded successfully:', data);
        const storagePath = data.path;
        processFileData(file, storagePath);
    }

    // Process the file data (parse and display in DataTable)
    async function processFileData(file, storagePath) {
        const reader = new FileReader();
        reader.onload = async function (e) {
            const fileContent = e.target.result;
            let parsedData;

            const fileType = file.type;
            const fileName = file.name;
            const fileExtension = fileName.split('.').pop().toLowerCase();

            if (fileType === 'application/json') {
                parsedData = parseJsonData(fileContent);
            } else if (fileType === 'text/csv' || fileExtension === 'csv') {
                parsedData = await parseCsvData(fileContent);
            } else if (excelMimeTypes.includes(fileType) || ['xlsx','xls','xlsm','xltx','xlsb'].includes(fileExtension)) {
                parsedData = parseExcelData(fileContent, fileExtension);
            } else {
                alert('Unsupported file type.');
                return;
            }

            if (!parsedData) {
                console.error('Error parsing file data.');
                return;
            }

            await insertDataIntoTable(parsedData, fileName, file.type, storagePath);
            loadProjectDataTables(selectedProjectId);
        };

        reader.onerror = function () {
            console.error('Error reading file.');
            alert('Error reading file.');
        };

        if (excelMimeTypes.includes(file.type) || ['xlsx','xls','xlsm','xltx','xlsb'].includes(file.name.split('.').pop().toLowerCase())) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    }

    // Parse CSV data using Papa Parse
    async function parseCsvData(fileContent) {
        return new Promise((resolve, reject) => {
            Papa.parse(fileContent, {
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    resolve(results.data);
                },
                error: function (error) {
                    reject(error);
                }
            });
        });
    }

    // Parse JSON data
    function parseJsonData(fileContent) {
        try {
            return JSON.parse(fileContent);
        } catch (error) {
            console.error('Error parsing JSON:', error);
            alert('Error parsing JSON data.');
            return null;
        }
    }

    // Parse Excel data using XLSX library
    function parseExcelData(fileContent, fileExtension) {
        try {
            const data = new Uint8Array(fileContent);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            return jsonData;
        } catch (error) {
            console.error('Error parsing Excel file:', error);
            alert('Error parsing Excel file.');
            return null;
        }
    }

    // Display data in DataTable
    function displayDataInDataTable(data, tableId) {
        // Reset pending changes each time we load a new table
        pendingChanges = {};
        originalData = JSON.parse(JSON.stringify(data)); // Deep copy of the loaded data

        if ($.fn.DataTable.isDataTable('#data-table')) {
            $('#data-table').DataTable().destroy();
            $('#data-table').empty();
        }

        if (!data || data.length === 0) {
            console.log('No data to display.');
            return;
        }

        $('#data-table').show();

        const columns = Object.keys(data[0]).map(key => ({
            title: key,
            data: key
        }));

        dataTable = $('#data-table').DataTable({
            data: data,
            columns: columns,
            dom: 'Bfrtip',
            buttons: ['copy', 'csv', 'excel', 'pdf', 'print'],
            select: true,
            responsive: true
        });

        handleCellEditing(tableId);
        // Hide the save edits button on new table load (no changes yet)
        $('#save-edits-btn').hide();
    }

    // Function to handle cell editing
    function handleCellEditing(currentTableId) {
        $('#data-table').off('click', 'tbody td').on('click', 'tbody td', function () {
            if ($(this).hasClass('editing')) return;

            const cell = dataTable.cell(this);
            const rowIdx = cell.index().row;
            const colIdx = cell.index().column;
            const columnName = dataTable.column(colIdx).header().textContent;

            // Get the original value from our stored originalData, not the current cell value
            const originalValue = originalData[rowIdx][columnName];
            const currentValue = cell.data();

            // Create a text input with the current cell's value
            const input = $('<input type="text" />').val(currentValue);
            $(this).html(input);
            $(this).addClass('editing');
            input.focus().select();

            input.on('blur keydown', function (e) {
                if (e.type === 'blur' || e.key === 'Enter') {
                    const newValue = $(this).val();

                    // Compare to original data, not the previous value
                    const isDifferent = (newValue !== originalValue);

                    if (isDifferent) {
                        // Store pending change
                        if (!pendingChanges[rowIdx]) {
                            pendingChanges[rowIdx] = {};
                        }
                        pendingChanges[rowIdx][columnName] = newValue;

                        // Only highlight if different from original
                        cell.node().style.backgroundColor = '#ffeb3b';
                    } else {
                        // If back to original, remove pending change
                        if (pendingChanges[rowIdx] && pendingChanges[rowIdx][columnName]) {
                            delete pendingChanges[rowIdx][columnName];
                            if (Object.keys(pendingChanges[rowIdx]).length === 0) {
                                delete pendingChanges[rowIdx];
                            }
                        }
                        // Remove highlight if back to original
                        cell.node().style.backgroundColor = '';
                    }

                    // Update cell data and remove editing class
                    cell.data(newValue).draw();
                    $(cell.node()).removeClass('editing');

                    updateSaveButtonVisibility();
                } else if (e.key === 'Escape') {
                    // Cancel editing, revert to current value
                    cell.data(currentValue).draw();
                    $(cell.node()).removeClass('editing');
                }
            });
        });

        // Bind click on the Save Changes button
        $('#save-edits-btn').off('click').on('click', async function () {
            // REMOVED unnecessary check that prevented saving with <= 1 changes
            // if (countTotalChangedCells() <= 1) {
            //     alert('You have not made more than one cell change yet.');
            //     return;
            // }

            // Disable button while saving
            $('#save-edits-btn').prop('disabled', true).text('Saving...');

            try {
                // Current data from DataTable
                const currentData = dataTable.data().toArray();

                // Apply changes in memory
                for (const [rowId, rowChanges] of Object.entries(pendingChanges)) {
                    for (const [colName, newValue] of Object.entries(rowChanges)) {
                        currentData[rowId][colName] = newValue;
                    }
                }

                // Reflect changes in the actual DataTable
                dataTable.clear().rows.add(currentData).draw();

                // Update DB in project_data table
                const updatedData = currentData;
                const { data, error } = await supabaseClient
                    .from('project_data')
                    .update({
                        data: updatedData,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', currentTableId);

                if (error) {
                    console.error('Error updating data:', error);
                    alert('Error saving changes: ' + error.message);
                } else {
                    console.log('Data updated successfully');
                    alert('Changes saved successfully.');

                    // Remove highlights from all cells after successful save
                    dataTable.cells().every(function () {
                        this.node().style.backgroundColor = '';
                    });

                    // Clear pending changes
                    pendingChanges = {};
                    $('#save-edits-btn').hide();
                }
            } catch (err) {
                console.error('Exception while saving changes:', err);
                alert('An error occurred while saving changes.');
            } finally {
                $('#save-edits-btn').prop('disabled', false).text('Save Changes');
            }
        });
    }

    // Utility to explicitly hide the DataTable
    function hideDataTable() {
        if ($.fn.DataTable.isDataTable('#data-table')) {
            $('#data-table').DataTable().destroy();
            $('#data-table').empty();
        }
        $('#data-table').hide();
    }

    // Insert data into project_data table
    async function insertDataIntoTable(data, fileName, fileType, storagePath) {
        if (!selectedProjectId) {
            console.error('No project selected, cannot insert data.');
            alert('Please select a project before importing data.');
            return;
        }

        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (!sessionData?.session) {
            console.error('User not authenticated:', sessionError);
            alert('You must be logged in to import data.');
            return;
        }

        const createdBy = sessionData.session.user.id;

        const entry = {
            project_id: selectedProjectId,
            created_by: createdBy,
            data: data,
            file_name: fileName,
            file_type: fileType,
            storage_path: storagePath,
            import_status: 'completed'
        };

        const { error } = await supabaseClient.from('project_data').insert([entry]);

        if (error) {
            console.error('Error inserting data:', error);
            alert('Error inserting data: ' + error.message);
        } else {
            console.log('Data inserted successfully');
            loadProjectDataTables(selectedProjectId);
        }
    }

    // Helper to count total changed cells across all rows
    function countTotalChangedCells() {
        let totalChanges = 0;
        for (const rowId in pendingChanges) {
            const rowChangeCount = Object.keys(pendingChanges[rowId]).length;
            totalChanges += rowChangeCount;
        }
        return totalChanges;
    }

    // Show/hide Save button based on how many cells are changed
    // Show if > 0 cell changed, hide otherwise.
    function updateSaveButtonVisibility() {
        const totalCellsChanged = countTotalChangedCells();
        if (totalCellsChanged > 0) { // Modified to show button after 1 edit
            $('#save-edits-btn').show();
        } else {
            $('#save-edits-btn').hide();
        }
    }

    // Initialize Data Import
    async function initializeDataImport() {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();

        if (sessionData?.session) {
            $('#import-data-btn').click(handleFileUpload);
            handleProjectSelection();
            hideDataTable();
            $('#data-table-buttons').hide();

            if ($('.tab.active').data('section') === 'data-management') {
                await loadProjects();
            }
        } else {
            window.location.href = '/login.html';
        }
    }

    // Call the initialization function
    initializeDataImport();
});