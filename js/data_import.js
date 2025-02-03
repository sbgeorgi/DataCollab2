$(document).ready(function () {
    let selectedProjectId = null;
    let dataTable = null;
    // Global copy of the currently displayed table data
    let currentTableData = [];
    // The currently loaded project_data record from Supabase
    let currentTableRecord = null;
    // Object to store pending changes (cell edits, column/row additions, renames, deletions)
    let pendingChanges = {};
    // Deep copy of the originally loaded data for change comparisons
    let originalData = [];
  
    // For multi-cell selection (a simplified implementation)
    let isSelecting = false;
    let selectionStart = null;
    let selectionEnd = null;
  
    const excelMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
    ];
  
    // Helper: Normalize data so that every row has the same set of keys.
    function normalizeDataRows(data) {
      if (!data || data.length === 0) return data;
      let allKeys = new Set();
      data.forEach(row => {
        Object.keys(row).forEach(key => allKeys.add(key));
      });
      allKeys = Array.from(allKeys);
      data.forEach(row => {
        allKeys.forEach(key => {
          if (!row.hasOwnProperty(key)) {
            row[key] = "";
          }
        });
      });
      return data;
    }
  
    // -----------------------------
    // PROJECT DATA TABLE FUNCTIONS
    // -----------------------------
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
  
    function displaySelectedDataTable(selectedTable) {
      const data = selectedTable.data;
      if (data && data.length > 0) {
        currentTableRecord = selectedTable;
        currentTableData = normalizeDataRows(JSON.parse(JSON.stringify(data)));
        displayDataInDataTable(currentTableData, selectedTable.id, selectedTable.file_name);
      } else {
        console.log('Selected data table is empty.');
        hideDataTable();
      }
    }
  
    // -----------------------------
    // TABLE RENDERING, EDITING, ADDING & DELETING
    // -----------------------------
    function displayDataInDataTable(data, tableRecordId, defaultTableName) {
      data = normalizeDataRows(data);
      pendingChanges = {};
      originalData = JSON.parse(JSON.stringify(data));
      $('#table-name-input').val(defaultTableName || 'Untitled DataTable');
      $('#table-name-container').show();
      if ($.fn.DataTable.isDataTable('#data-table')) {
        $('#data-table').DataTable().destroy();
        $('#data-table').empty();
      }
      if (!data || data.length === 0) {
        console.log('No data to display.');
        return;
      }
      $('#data-table').show();
      // Create column definitions based on the keys in the first (normalized) row.
      let columns = Object.keys(data[0]).map(key => {
        return {
          title: key + ' <i class="fa fa-trash delete-col-icon" data-col="'+key+'" style="cursor:pointer; color:red"></i>',
          data: key
        };
      });
      dataTable = $('#data-table').DataTable({
        data: data,
        columns: columns,
        dom: 'Bfrtip',
        buttons: ['copy', 'csv', 'excel', 'pdf', 'print'],
        select: true,
        responsive: true,
        ordering: false
      });
      // Append a header cell with a "+" icon for adding columns.
      if ($('#data-table thead tr th.add-column-header').length === 0) {
        $('#data-table thead tr').append('<th class="add-column-header" style="cursor:pointer;"> + </th>');
      }
      $('#data-table thead').off('click', 'th.add-column-header').on('click', 'th.add-column-header', function () {
        addColumn();
      });
      // --- Use DataTables API to get the column data source rather than parsing header text ---
      $('#data-table thead').off('dblclick').on('dblclick', 'th:not(.add-column-header)', function (e) {
        if ($(e.target).hasClass('delete-col-icon')) return;
        let colIndex = dataTable.column(this).index();
        // Use dataSrc() to reliably obtain the property name.
        let currentName = dataTable.column(colIndex).dataSrc();
        let th = $(this);
        let input = $(`<input type="text" value="${currentName}" style="width:100%;" />`);
        th.html(input);
        input.focus().select();
        input.on('blur keydown', function (ev) {
          if (ev.type === 'blur' || ev.key === 'Enter') {
            let newName = $(this).val().trim();
            if (newName && newName !== currentName) {
              renameColumn(currentName, newName);
              pendingChanges['colRename'] = pendingChanges['colRename'] || {};
              pendingChanges['colRename'][currentName] = newName;
            }
            th.html(newName + ' <i class="fa fa-trash delete-col-icon" data-col="'+newName+'" style="cursor:pointer; color:red"></i>');
            updateSaveButtonVisibility();
          }
        });
      });
      // Bind column deletion via trash icon.
      $('#data-table thead').off('click', '.delete-col-icon').on('click', '.delete-col-icon', function(e) {
        e.stopPropagation();
        let colName = $(this).data('col');
        if (confirm(`Delete column "${colName}" from the table?`)) {
          deleteColumn(colName);
        }
      });
      // Row selection with ctrl-click support.
      $('#data-table tbody').off('click').on('click', 'tr', function (e) {
        if (e.ctrlKey) {
          $(this).toggleClass('selected');
        } else {
          $('#data-table tbody tr').removeClass('selected');
          $(this).addClass('selected');
        }
        if ($('#data-table tbody tr.selected').length > 0) {
          $('#delete-row-btn').show();
        } else {
          $('#delete-row-btn').hide();
        }
      });
      // Bind cell editing and multi-cell selection.
      bindCellEditingAndSelection(tableRecordId);
      updateSaveButtonVisibility();
    }
  
    // Rename a column by updating every row’s key.
    function renameColumn(oldName, newName) {
      currentTableData = currentTableData.map(row => {
        let value = row.hasOwnProperty(oldName) ? row[oldName] : "";
        row[newName] = value;
        delete row[oldName];
        return row;
      });
      originalData = originalData.map(row => {
        let value = row.hasOwnProperty(oldName) ? row[oldName] : "";
        row[newName] = value;
        delete row[oldName];
        return row;
      });
      // Re-normalize and re-render the table.
      currentTableData = normalizeDataRows(currentTableData);
      displayDataInDataTable(currentTableData, currentTableRecord.id, $('#table-name-input').val());
    }
  
    function deleteColumn(colName) {
      currentTableData = currentTableData.map(row => {
        delete row[colName];
        return row;
      });
      currentTableData = normalizeDataRows(currentTableData);
      displayDataInDataTable(currentTableData, currentTableRecord.id, $('#table-name-input').val());
      pendingChanges['columnDeletion'] = true;
      updateSaveButtonVisibility();
    }
  
    function deleteSelectedRows() {
      const selectedRows = dataTable.rows('.selected').indexes().toArray();
      if (selectedRows.length === 0) {
        alert('Please select at least one row to delete.');
        return;
      }
      currentTableData = currentTableData.filter((row, index) => !selectedRows.includes(index));
      currentTableData = normalizeDataRows(currentTableData);
      displayDataInDataTable(currentTableData, currentTableRecord.id, $('#table-name-input').val());
      pendingChanges['rowDeletion'] = true;
      updateSaveButtonVisibility();
    }
  
    function addRow() {
      if (currentTableData.length === 0) {
        alert('No columns exist. Please add a column first.');
        return;
      }
      let newRow = {};
      Object.keys(currentTableData[0]).forEach(key => { newRow[key] = ""; });
      currentTableData.push(newRow);
      currentTableData = normalizeDataRows(currentTableData);
      displayDataInDataTable(currentTableData, currentTableRecord.id, $('#table-name-input').val());
      pendingChanges['rowAddition'] = true;
      updateSaveButtonVisibility();
    }
  
    function addColumn() {
      let existingKeys = currentTableData.length > 0 ? Object.keys(currentTableData[0]) : [];
      let baseName = "New Column";
      let newName = baseName;
      let count = 1;
      while (existingKeys.includes(newName)) {
        newName = baseName + " " + (++count);
      }
      currentTableData = currentTableData.map(row => {
        row[newName] = "";
        return row;
      });
      currentTableData = normalizeDataRows(currentTableData);
      displayDataInDataTable(currentTableData, currentTableRecord.id, $('#table-name-input').val());
      pendingChanges['columnAddition'] = true;
      updateSaveButtonVisibility();
    }
  
    function bindCellEditingAndSelection(currentTableId) {
      $('#data-table tbody').off('mousedown mouseup mouseover');
      $('#data-table').off('click', 'tbody td').on('click', 'tbody td', function (e) {
        if (isSelecting) return;
        if ($(this).hasClass('editing')) return;
        const cell = dataTable.cell(this);
        const rowIdx = cell.index().row;
        const colIdx = cell.index().column;
        // Use dataSrc() for reliability.
        const columnName = dataTable.column(colIdx).dataSrc();
        const originalValue = originalData[rowIdx][columnName];
        const currentValue = cell.data();
        const input = $('<input type="text" />').val(currentValue);
        $(this).html(input);
        $(this).addClass('editing');
        input.focus().select();
        input.on('blur keydown', function (ev) {
          if (ev.type === 'blur' || ev.key === 'Enter') {
            const newValue = $(this).val();
            const isDifferent = (newValue !== originalValue);
            if (isDifferent) {
              if (!pendingChanges[rowIdx]) { pendingChanges[rowIdx] = {}; }
              pendingChanges[rowIdx][columnName] = newValue;
              cell.node().style.backgroundColor = '#ffeb3b';
              currentTableData[rowIdx][columnName] = newValue;
            } else {
              if (pendingChanges[rowIdx] && pendingChanges[rowIdx][columnName]) {
                delete pendingChanges[rowIdx][columnName];
                if (Object.keys(pendingChanges[rowIdx]).length === 0) { delete pendingChanges[rowIdx]; }
              }
              cell.node().style.backgroundColor = '';
            }
            cell.data(newValue).draw();
            $(cell.node()).removeClass('editing');
            updateSaveButtonVisibility();
          } else if (ev.key === 'Escape') {
            cell.data(currentValue).draw();
            $(cell.node()).removeClass('editing');
          }
        });
      });
      $('#data-table tbody').on('mousedown', 'td', function (e) {
        isSelecting = true;
        selectionStart = dataTable.cell(this).index();
        $('.multi-selected').removeClass('multi-selected');
      }).on('mouseover', 'td', function (e) {
        if (!isSelecting) return;
        selectionEnd = dataTable.cell(this).index();
        highlightSelection(selectionStart, selectionEnd);
      }).on('mouseup', 'td', function (e) {
        isSelecting = false;
      });
    }
  
    function highlightSelection(start, end) {
      $('.multi-selected').removeClass('multi-selected');
      let startRow = Math.min(start.row, end.row);
      let endRow = Math.max(start.row, end.row);
      let startCol = Math.min(start.column, end.column);
      let endCol = Math.max(start.column, end.column);
      for (let i = startRow; i <= endRow; i++) {
        for (let j = startCol; j <= endCol; j++) {
          $(dataTable.cell(i, j).node()).addClass('multi-selected');
        }
      }
    }
  
    $('#save-edits-btn').off('click').on('click', async function () {
      $(this).prop('disabled', true).text('Saving...');
      try {
        const newTableName = $('#table-name-input').val();
        const updatedData = normalizeDataRows(currentTableData);
        const { data, error } = await supabaseClient
          .from('project_data')
          .update({
            data: updatedData,
            file_name: newTableName,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentTableRecord.id);
        if (error) {
          console.error('Error updating data:', error);
          alert('Error saving changes: ' + error.message);
        } else {
          console.log('Data updated successfully');
          alert('Changes saved successfully.');
          dataTable.cells().every(function () {
            this.node().style.backgroundColor = '';
          });
          pendingChanges = {};
        }
      } catch (err) {
        console.error('Exception while saving changes:', err);
        alert('An error occurred while saving changes.');
      } finally {
        $('#save-edits-btn').prop('disabled', false).text('Save Changes');
        updateSaveButtonVisibility();
      }
    });
  
    function hideDataTable() {
      if ($.fn.DataTable.isDataTable('#data-table')) {
        $('#data-table').DataTable().destroy();
        $('#data-table').empty();
      }
      $('#data-table').hide();
      $('#table-name-container').hide();
      $('#delete-row-btn').hide();
    }
  
    function updateSaveButtonVisibility() {
      let totalChanges = 0;
      for (const key in pendingChanges) {
        if (typeof pendingChanges[key] === 'object') {
          totalChanges += Object.keys(pendingChanges[key]).length;
        } else {
          totalChanges++;
        }
      }
      if (totalChanges > 0) {
        $('#save-edits-btn').show();
      } else {
        $('#save-edits-btn').hide();
      }
    }
  
    // -----------------------------
    // FILE IMPORT HANDLERS (existing)
    // -----------------------------
    function handleFileUpload() {
      if (!selectedProjectId) {
        alert('Please select a project first.');
        return;
      }
      const fileInput = $('<input type="file">');
      fileInput.attr('accept', '.xlsx,.xls,.xlsm,.xltx,.xlsb,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.template,application/vnd.ms-excel.sheet.binary.macroEnabled.12');
      fileInput.on('change', function (event) {
        const file = event.target.files[0];
        if (file) { uploadFile(file); }
      });
      fileInput.click();
    }
  
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
  
    async function parseCsvData(fileContent) {
      return new Promise((resolve, reject) => {
        Papa.parse(fileContent, {
          header: true,
          skipEmptyLines: true,
          complete: function (results) { resolve(results.data); },
          error: function (error) { reject(error); }
        });
      });
    }
  
    function parseJsonData(fileContent) {
      try { return JSON.parse(fileContent); }
      catch (error) {
        console.error('Error parsing JSON:', error);
        alert('Error parsing JSON data.');
        return null;
      }
    }
  
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
  
    // -----------------------------
    // NEW: Create DataTable Feature
    // -----------------------------
    async function createDataTable() {
      if (!selectedProjectId) {
        alert('Please select a project first.');
        return;
      }
      const defaultCols = {};
      for (let i = 1; i <= 5; i++) {
        defaultCols['Column ' + i] = "";
      }
      let newTableData = [];
      for (let r = 0; r < 10; r++) {
        newTableData.push(Object.assign({}, defaultCols));
      }
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (!sessionData?.session) {
        alert('You must be logged in to create a data table.');
        return;
      }
      const createdBy = sessionData.session.user.id;
      const defaultTableName = 'Untitled DataTable';
      const entry = {
        project_id: selectedProjectId,
        created_by: createdBy,
        data: newTableData,
        file_name: defaultTableName,
        file_type: 'created',
        import_status: 'completed'
      };
      const { data, error } = await supabaseClient.from('project_data').insert([entry]).select();
      if (error) {
        console.error('Error creating data table:', error);
        alert('Error creating data table: ' + error.message);
        return;
      }
      const newRecord = data[0];
      currentTableRecord = newRecord;
      currentTableData = newTableData;
      displayDataInDataTable(currentTableData, newRecord.id, defaultTableName);
    }
  
    // -----------------------------
    // PROJECT SELECTION & INIT
    // -----------------------------
    function handleProjectSelection() {
      $('#data-management-project-cards .project-card').off('click');
      $('#data-management-project-cards .project-card').on('click', function () {
        $('#data-management-project-cards .project-card').removeClass('selected');
        $(this).addClass('selected');
        selectedProjectId = $(this).data('project-id');
        $('#import-data-btn').prop('disabled', false);
        $('#create-datatable-btn').prop('disabled', false);
        loadProjectDataTables(selectedProjectId);
        console.log("Project selected in section data-management:", selectedProjectId);
      });
    }
  
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
  
    // -----------------------------
    // BIND BUTTONS & INIT
    // -----------------------------
    $('.tab[data-section="data-management"]').on('click', async function () {
      await loadProjects();
      selectedProjectId = null;
      $('#import-data-btn').prop('disabled', true);
      $('#create-datatable-btn').prop('disabled', true);
      hideDataTable();
      $('#data-table-buttons').empty().hide();
      $('#data-management-project-cards .project-card').removeClass('selected');
    });
  
    $('#import-data-btn').click(handleFileUpload);
    $('#create-datatable-btn').click(createDataTable);
    $('#delete-row-btn').click(function () {
      deleteSelectedRows();
    });
  
    async function initializeDataImport() {
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionData?.session) {
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
    initializeDataImport();
  });
  