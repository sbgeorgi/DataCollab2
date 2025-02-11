// data_import.js
$(document).ready(function () {
  /**********************
   * GLOBAL VARIABLES (using let/const)
   **********************/
  let selectedProjectId = null;
  let currentTableData = []; // Array of row objects holding saved data
  let currentHeaders = [];   // Array of column keys (order is preserved)
  let currentTableRecord = null; // Currently loaded record from Supabase
  let pendingChanges = {};   // To store pending changes before saving
  let originalData = [];     // Deep copy for comparison
  let hot; // Handsontable instance // HANDSONTABLE INTEGRATION

  // Constants for extra rows/cols to show beyond current data:
  const EXTRA_ROWS = 5;
  const EXTRA_COLS = 3;

  // Mime types for Excel files.
  const excelMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
  ];

  /**********************
   * HELPER FUNCTIONS
   **********************/
  // Ensure every row has all keys from headers.
  function normalizeDataRows(data, headers) {
    if (!data || data.length === 0) return data;
    data.forEach(row => {
      headers.forEach(key => {
        if (!row.hasOwnProperty(key)) {
          row[key] = "";
        }
      });
    });
    return data;
  }

  // Return the headers (using global currentHeaders if available).
  // If no headers exist yet then (for a new table) we default to five columns
  // with internal keys "col1", "col2", … which render as blank.
  function computeHeaders() {
    if (currentHeaders && currentHeaders.length > 0) {
      return currentHeaders;
    }
    if (currentTableData.length > 0) {
      currentHeaders = Object.keys(currentTableData[0]);
      return currentHeaders;
    }
    currentHeaders = ["col1", "col2", "col3", "col4", "col5"];
    return currentHeaders;
  }

  // Record a cell change. // HANDSONTABLE INTEGRATION - No longer directly used, Handsontable manages changes
  function recordCellChange(rowIdx, header, newValue) {
    if (
      originalData[rowIdx] &&
      originalData[rowIdx][header] === newValue &&
      pendingChanges[rowIdx] &&
      pendingChanges[rowIdx][header] !== undefined
    ) {
      delete pendingChanges[rowIdx][header];
      if (Object.keys(pendingChanges[rowIdx]).length === 0) {
        delete pendingChanges[rowIdx];
      }
    } else if (
      !originalData[rowIdx] ||
      originalData[rowIdx][header] !== newValue
    ) {
      pendingChanges[rowIdx] = pendingChanges[rowIdx] || {};
      pendingChanges[rowIdx][header] = newValue;
    }
    updateSaveButtonVisibility();
  }

  // Generate a unique new column key for extra columns (e.g. "col6")
  function getUniqueNewColumnKey() {
    let max = 0;
    currentHeaders.forEach(header => {
      const match = header.match(/^col(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > max) max = num;
      }
    });
    return "col" + (max + 1);
  }

  // Generate a unique default header name (for auto-renaming upon cell edit)
  function getUniqueDefaultHeaderName() {
    const baseName = "Default Value";
    let newName = baseName;
    let count = 1;
    while (currentHeaders.includes(newName)) {
      count++;
      newName = baseName + " " + count;
    }
    return newName;
  }

  /**********************
   * SPREADSHEET RENDERING // HANDSONTABLE INTEGRATION - REPLACED BY HANDSONTABLE
   **********************/
  // Render the spreadsheet-style table into the element with id="data-table".
  // Uses a document fragment to batch DOM updates and delegated events.
  function renderSpreadsheet() {
    // NO LONGER USED - HANDSONTABLE HANDLES RENDERING
  }

  // Expand the data structure if a cell in an extra row/column is edited.
  function ensureCellExists(rowIdx, colIdx) {
    const headers = computeHeaders();
    const numDataRows = currentTableData.length;
    const numDataCols = headers.length;

    if (colIdx >= numDataCols) {
      const colsToAdd = colIdx - numDataCols + 1;
      for (let i = 0; i < colsToAdd; i++) {
        const newColKey = getUniqueNewColumnKey();
        currentHeaders.push(newColKey);
        currentTableData.forEach(row => {
          row[newColKey] = "";
        });
      }
    }

    if (rowIdx >= numDataRows) {
      const rowsToAdd = rowIdx - numDataRows + 1;
      const headersNow = computeHeaders();
      for (let i = 0; i < rowsToAdd; i++) {
        const newRow = {};
        headersNow.forEach(header => {
          newRow[header] = "";
        });
        currentTableData.push(newRow);
      }
    }
  }

  // Delegate cell editing events using a single delegated handler.
  $("#data-table").off("click", ".spreadsheet-td") //.on("click", ".spreadsheet-td", function (e) { // HANDSONTABLE INTEGRATION - NO LONGER USED
  // });

  // Delegate header editing on double-click.
  $("#data-table").off("dblclick", ".spreadsheet-th") //.on("dblclick", ".spreadsheet-th", function (e) { // HANDSONTABLE INTEGRATION - NO LONGER USED
  // });

  // Delegate deletion of columns via the trash icon.
  $("#data-table").off("click", ".delete-col-icon") //.on("click", ".delete-col-icon", function (e) { // HANDSONTABLE INTEGRATION - NO LONGER USED
  // });

  /**********************
   * SAVE CHANGES
   **********************/
  $("#save-edits-btn").off("click").on("click", async function () {
    $(this).prop("disabled", true).text("Saving...");
    try {
      const newTableName = $("#table-name-input").val();
      // HANDSONTABLE INTEGRATION START - Get data from Handsontable
      const updatedData = hot.getData();
      const headers = hot.getColHeader(); // Get headers directly from Handsontable
      const normalizedData = normalizeDataRows(updatedData, headers); // Normalize data with headers
      // HANDSONTABLE INTEGRATION END

      const { error } = await supabaseClient
        .from("project_data")
        .update({
          data: normalizedData, // Use normalized data
          file_name: newTableName,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentTableRecord.id);
      if (error) {
        console.error("Error updating data:", error);
        alert("Error saving changes: " + error.message);
      } else {
        console.log("Data updated successfully");
        alert("Changes saved successfully.");
        currentTableRecord.data = normalizedData; // Update with normalized data
        originalData = JSON.parse(JSON.stringify(normalizedData)); // Update original data
        pendingChanges = {};
        // renderSpreadsheet(); // HANDSONTABLE INTEGRATION - No need to re-render, Handsontable is updated
      }
    } catch (err) {
      console.error("Exception while saving changes:", err);
      alert("An error occurred while saving changes.");
    } finally {
      $("#save-edits-btn").prop("disabled", false).text("Save Changes");
      updateSaveButtonVisibility();
    }
  });

  function updateSaveButtonVisibility() {
    // HANDSONTABLE INTEGRATION - Pending changes logic might need adjustments depending on how Handsontable tracks changes. For now keep as is, and adjust if needed.
    let totalChanges = 0;
    for (const key in pendingChanges) {
      if (typeof pendingChanges[key] === "object") {
        totalChanges += Object.keys(pendingChanges[key]).length;
      } else {
        totalChanges++;
      }
    }
    if (totalChanges > 0) {
      $("#save-edits-btn").show();
    } else {
      $("#save-edits-btn").hide();
    }
  }

  /**********************
   * FILE IMPORT HANDLERS (unchanged with minor optimizations)
   **********************/
  function handleFileUpload() {
    if (!selectedProjectId) {
      alert("Please select a project first.");
      return;
    }
    const fileInput = $("<input type='file'>").attr("accept", ".xlsx,.xls,.xlsm,.xltx,.xlsb,.csv,.json," +
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
      "application/vnd.ms-excel," +
      "application/vnd.ms-excel.sheet.macroEnabled.12," +
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template," +
      "application/vnd.ms-excel.sheet.binary.macroEnabled.12");
    fileInput.on("change", function (event) {
      const file = event.target.files[0];
      if (file) {
        uploadFile(file);
      }
    });
    fileInput.click();
  }

  async function uploadFile(file) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (!session) {
      console.error("User is not logged in:", sessionError);
      alert("You must be logged in to upload files.");
      return;
    }
    const userId = session.user.id;
    const fileExt = file.name.split(".").pop();
    const uniqueFileName = `data_${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${selectedProjectId}/${uniqueFileName}`;
    const { data, error } = await supabaseClient.storage
      .from("project_data_imports")
      .upload(filePath, file);
    if (error) {
      console.error("Error uploading file:", error);
      alert("Error uploading file: " + error.message);
      return;
    }
    console.log("File uploaded successfully:", data);
    processFileData(file, data.path);
  }

  async function processFileData(file, storagePath) {
    const reader = new FileReader();
    reader.onload = async function (e) {
      const fileContent = e.target.result;
      let parsedData;
      const fileType = file.type;
      const fileName = file.name;
      const fileExtension = fileName.split(".").pop().toLowerCase();
      if (fileType === "application/json") {
        parsedData = parseJsonData(fileContent);
      } else if (fileType === "text/csv" || fileExtension === "csv") {
        parsedData = await parseCsvData(fileContent);
      } else if (
        excelMimeTypes.includes(fileType) ||
        ["xlsx", "xls", "xlsm", "xltx", "xlsb"].includes(fileExtension)
      ) {
        parsedData = parseExcelData(fileContent, fileExtension);
      } else {
        alert("Unsupported file type.");
        return;
      }
      if (!parsedData) {
        console.error("Error parsing file data.");
        return;
      }
      await insertDataIntoTable(parsedData, fileName, file.type, storagePath);
      loadProjectDataTables(selectedProjectId);
    };
    reader.onerror = function () {
      console.error("Error reading file.");
      alert("Error reading file.");
    };
    if (
      excelMimeTypes.includes(file.type) ||
      ["xlsx", "xls", "xlsm", "xltx", "xlsb"].includes(file.name.split(".").pop().toLowerCase())
    ) {
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
        complete: function (results) {
          resolve(results.data);
        },
        error: function (error) {
          reject(error);
        }
      });
    });
  }

  function parseJsonData(fileContent) {
    try {
      return JSON.parse(fileContent);
    } catch (error) {
      console.error("Error parsing JSON:", error);
      alert("Error parsing JSON data.");
      return null;
    }
  }

  function parseExcelData(fileContent, fileExtension) {
    try {
      const data = new Uint8Array(fileContent);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      return jsonData;
    } catch (error) {
      console.error("Error parsing Excel file:", error);
      alert("Error parsing Excel file.");
      return null;
    }
  }

  async function insertDataIntoTable(data, fileName, fileType, storagePath) {
    if (!selectedProjectId) {
      console.error("No project selected, cannot insert data.");
      alert("Please select a project before importing data.");
      return;
    }
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (!sessionData?.session) {
      console.error("User not authenticated:", sessionError);
      alert("You must be logged in to import data.");
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
      import_status: "completed"
    };
    const { error } = await supabaseClient.from("project_data").insert([entry]);
    if (error) {
      console.error("Error inserting data:", error);
      alert("Error inserting data: " + error.message);
    } else {
      console.log("Data inserted successfully");
      loadProjectDataTables(selectedProjectId);
    }
  }

  /**********************
   * CREATE NEW DATATABLE (manually)
   **********************/
  async function createDataTable() {
    if (!selectedProjectId) {
      alert("Please select a project first.");
      return;
    }
    let newTableName = prompt("Enter a name for your new data table:", "Untitled DataTable");
    if (!newTableName) {
      alert("Data table creation cancelled. A table name is required.");
      return;
    }
    // For a new (blank) table we start with 5 columns.
    // The internal keys are "col1", "col2", … but they will render as blank.
    let defaultHeaders = ["col1", "col2", "col3", "col4", "col5"];
    currentHeaders = defaultHeaders.slice();
    let newTableData = [];
    for (let r = 0; r < 10; r++) {
      let row = {};
      defaultHeaders.forEach(col => row[col] = "");
      newTableData.push(row);
    }
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (!sessionData?.session) {
      alert("You must be logged in to create a data table.");
      return;
    }
    const createdBy = sessionData.session.user.id;
    const entry = {
      project_id: selectedProjectId,
      created_by: createdBy,
      data: newTableData,
      file_name: newTableName,
      file_type: "created",
      import_status: "completed"
    };
    const { data, error } = await supabaseClient.from("project_data").insert([entry]).select();
    if (error) {
      console.error("Error creating data table:", error);
      alert("Error creating data table: " + error.message);
      return;
    }
    const newRecord = data[0];
    currentTableRecord = newRecord;
    currentTableData = newTableData;
    $("#table-name-input").val(newTableName);
    $(".header-container").show();
    originalData = JSON.parse(JSON.stringify(newTableData));
    // renderSpreadsheet(); // HANDSONTABLE INTEGRATION - No longer used
    initializeHandsontable(currentTableData); // HANDSONTABLE INTEGRATION - Initialize Handsontable
    loadProjectDataTables(selectedProjectId);
  }

  /**********************
   * PROJECT DATA TABLE FUNCTIONS
   **********************/
  async function loadProjectDataTables(projectId) {
    if (!projectId) {
      console.log("No project selected to load data tables.");
      $("#data-table-buttons").empty();
      hideDataTable();
      return;
    }
    const { data, error } = await supabaseClient
      .from("project_data")
      .select("id, file_name, data")
      .eq("project_id", projectId);
    if (error) {
      console.error("Error fetching project data tables:", error);
      return;
    }
    if (data && data.length > 0) {
      createDataTableButtons(data);
    } else {
      console.log("No data tables found for this project.");
      $("#data-table-buttons").empty();
      hideDataTable();
    }
  }

  function createDataTableButtons(dataTables) {
    const buttonsContainer = $("#data-table-buttons");
    buttonsContainer.empty();
    const uniqueFiles = new Map();
    dataTables.forEach(table => {
      if (!uniqueFiles.has(table.file_name)) {
        uniqueFiles.set(table.file_name, table);
      }
    });
    uniqueFiles.forEach((table, fileName) => {
      const button = $(`
        <button class="data-table-button dt-button" data-file-id="${table.id}" data-file-name="${fileName}">
          ${fileName}
        </button>
      `);
      button.on("click", function () {
        $(".data-table-button").removeClass("selected");
        $(this).addClass("selected");
        displaySelectedDataTable(table);
      });
      buttonsContainer.append(button);
    });
    if (currentTableRecord) {
      buttonsContainer.find(`button[data-file-id="${currentTableRecord.id}"]`).addClass("selected");
    }
    buttonsContainer.toggle(uniqueFiles.size > 0);
  }

  function displaySelectedDataTable(selectedTable) {
    const data = selectedTable.data;
    if (data && data.length > 0) {
      currentTableRecord = selectedTable;
      currentTableData = JSON.parse(JSON.stringify(data));
      currentHeaders = Object.keys(currentTableData[0]);
      originalData = JSON.parse(JSON.stringify(currentTableData));
      $("#table-name-input").val(selectedTable.file_name || "Untitled DataTable");
      $(".header-container").show();
      // renderSpreadsheet(); // HANDSONTABLE INTEGRATION - No longer used
      initializeHandsontable(currentTableData); // HANDSONTABLE INTEGRATION - Initialize Handsontable
    } else {
      console.log("Selected data table is empty.");
      hideDataTable();
    }
  }

  function hideDataTable() {
    // HANDSONTABLE INTEGRATION START - Destroy Handsontable instance when hiding table
    if (hot) {
      hot.destroy();
      hot = null;
    }
    // HANDSONTABLE INTEGRATION END
    $("#data-table").empty();
    $("#table-name-container").hide();
  }

  /**********************
   * HANDSONTABLE INITIALIZATION AND CONFIGURATION // HANDSONTABLE INTEGRATION START
   **********************/
  function initializeHandsontable(data) {
    const container = document.getElementById('data-table');
    if (!container) {
      console.error("Data table container element not found.");
      return;
    }

    if (hot) { // If Handsontable instance already exists, destroy it first
      hot.destroy();
    }

    hot = new Handsontable(container, {
      data: data,
      colHeaders: computeHeaders(), // Use computed headers
      rowHeaders: true,
      stretchH: 'all',
      licenseKey: 'non-commercial-and-evaluation', // for non-commercial use
      contextMenu: true, // Enable context menu for copy/paste etc.
      manualColumnResize: true,
      manualRowResize: true,
      // editing and deleting is enabled by default
      columns: currentHeaders.map(header => { // Define columns based on headers for flexibility
        return {
          title: /^col\d+$/.test(header) ? '' : header, // Show blank header if it's default column key
          data: header // Bind column to header key
        };
      }),
      afterChange: function (changes, source) { // Handle changes in data
        if (source === 'loadData') {
          return; //don't save or do anything if data is loaded
        }
        if (!changes) return; // No changes detected

        changes.forEach(([rowIdx, header, oldValue, newValue]) => {
          if (header !== 'rowHeader' ) { // Ignore row header changes
              recordCellChange(rowIdx, header, newValue); // Track changes - though might not be needed with Handsontable's change tracking
          }
        });
      },
      afterColumnRemove: function(index, amount) {
          pendingChanges["columnDeletion"] = true; // Track column deletion
          updateSaveButtonVisibility();
      },
      afterColumnRename: function(index, newName) {
          const oldName = currentHeaders[index];
          if (newName && newName !== oldName) {
              currentHeaders[index] = newName; // Update header array
              pendingChanges["colRename"] = pendingChanges["colRename"] || {};
              pendingChanges["colRename"][oldName] = newName; // Track column rename
              updateSaveButtonVisibility();
          }
      },
      afterCreateCol: function(index, amount, source) {
          pendingChanges["columnAddition"] = true; // Track column addition
          updateSaveButtonVisibility();
      },
      afterCreateRow: function(index, amount, source) {
          pendingChanges["rowAddition"] = true; // Track row addition
          updateSaveButtonVisibility();
      },
      afterRemoveRow: function(index, amount, visualRows, removedData) {
          pendingChanges["rowDeletion"] = true; // Track row deletion
          updateSaveButtonVisibility();
      },
    });
  }
  /**********************
   * HANDSONTABLE INITIALIZATION AND CONFIGURATION // HANDSONTABLE INTEGRATION END
   **********************/


  /**********************
   * PROJECT SELECTION & INIT
   **********************/
  function handleProjectSelection() {
    $("#data-management-project-cards .project-card").off("click").on("click", function () {
      $("#data-management-project-cards .project-card").removeClass("selected");
      $(this).addClass("selected");
      selectedProjectId = $(this).data("project-id");
      $("#import-data-btn").prop("disabled", false);
      $("#create-datatable-btn").prop("disabled", false);
      loadProjectDataTables(selectedProjectId);
      console.log("Project selected in section data-management:", selectedProjectId);
    });
  }

  async function loadProjects() {
    const { data: sessionData, error } = await supabaseClient.auth.getSession();
    if (!sessionData?.session) {
      window.location.href = "/login.html";
      return;
    }
    const user = sessionData.session.user;
    const { data: projects, error: projError } = await supabaseClient
      .from("projects")
      .select("id, project_name, project_description")
      .eq("user_id", user.id);
    if (projError) {
      console.error("Error loading projects:", projError);
      alert("Error loading projects: " + projError.message);
      return;
    }
    const projectCardsContainer = $("#data-management-project-cards");
    projectCardsContainer.empty();
    if (!projects || projects.length === 0) {
      projectCardsContainer.append("<p>No projects found.</p>");
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
  $(".tab[data-section='data-management']").on("click", async function () {
    await loadProjects();
    selectedProjectId = null;
    $("#import-data-btn").prop("disabled", true);
    $("#create-datatable-btn").prop("disabled", true);
    hideDataTable();
    $("#data-table-buttons").empty().hide();
    $("#data-management-project-cards .project-card").removeClass("selected");
  });

  $("#import-data-btn").click(handleFileUpload);
  $("#create-datatable-btn").click(createDataTable);

  async function initializeDataImport() {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionData?.session) {
      handleProjectSelection();
      hideDataTable();
      $("#data-table-buttons").hide();
      if ($(".tab.active").data("section") === "data-management") {
        await loadProjects();
      }
    } else {
      window.location.href = "/login.html";
    }
  }
  initializeDataImport();
});