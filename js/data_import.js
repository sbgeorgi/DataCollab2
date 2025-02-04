// data_import.js
$(document).ready(function () {
  /**********************
   * GLOBAL VARIABLES (using let/const)
   **********************/
  let selectedProjectId = null;
  let currentTableData = []; // Array of row objects holding saved data
  let currentHeaders = [];   // Array of header names (order is preserved)
  let currentTableRecord = null; // Currently loaded record from Supabase
  let pendingChanges = {};   // To store pending changes before saving
  let originalData = [];     // Deep copy for comparison

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
  function computeHeaders() {
    if (currentHeaders && currentHeaders.length > 0) {
      return currentHeaders;
    }
    if (currentTableData.length > 0) {
      currentHeaders = Object.keys(currentTableData[0]);
      return currentHeaders;
    }
    currentHeaders = ["Column 1", "Column 2", "Column 3", "Column 4", "Column 5"];
    return currentHeaders;
  }

  // Record a cell change.
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

  /**********************
   * SPREADSHEET RENDERING
   **********************/
  // Render the spreadsheet-style table into the element with id="data-table".
  // Improvements:
  // - Uses a document fragment to batch DOM updates.
  // - Avoids re-binding events on every cell by using delegated event handlers.
  function renderSpreadsheet() {
    const headers = computeHeaders();
    currentTableData = normalizeDataRows(currentTableData, headers);

    const numDataRows = currentTableData.length;
    const numRows = numDataRows + EXTRA_ROWS;
    const numDataCols = headers.length;
    const numCols = numDataCols + EXTRA_COLS;

    // Build the table using a document fragment.
    const frag = document.createDocumentFragment();
    const table = document.createElement('table');
    table.id = "spreadsheet-table";
    table.className = "spreadsheet-table";
    table.style.tableLayout = "fixed";
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";

    // Build table header.
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (let col = 0; col < numCols; col++) {
      const th = document.createElement('th');
      th.dataset.col = col;
      th.className = "spreadsheet-th";
      th.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: left; position: relative; width:80px; overflow: hidden;";
      th.textContent = (col < numDataCols) ? headers[col] : "New Column";
      if (col < numDataCols) {
        const trash = document.createElement('i');
        trash.className = "fa fa-trash delete-col-icon";
        trash.dataset.col = col;
        trash.style.cssText = "cursor:pointer; color:red; margin-left:5px;";
        th.appendChild(trash);
      }
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Build table body.
    const tbody = document.createElement('tbody');
    for (let row = 0; row < numRows; row++) {
      const tr = document.createElement('tr');
      tr.dataset.row = row;
      for (let col = 0; col < numCols; col++) {
        const td = document.createElement('td');
        td.dataset.row = row;
        td.dataset.col = col;
        td.className = "spreadsheet-td";
        td.style.cssText = "border: 1px solid #ccc; padding: 5px; min-width:80px; width:80px; overflow: hidden; cursor: pointer;";
        let cellValue = "";
        if (row < numDataRows && col < numDataCols) {
          cellValue = currentTableData[row][headers[col]];
        }
        // Highlight if there is a pending change.
        if (row < numDataRows && col < numDataCols && pendingChanges[row] && pendingChanges[row][headers[col]] !== undefined) {
          td.style.backgroundColor = "#ffeb3b";
        }
        td.textContent = cellValue;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // Update the DOM in one operation.
    $("#data-table").empty().append(table);
    $(".header-container").show();
  }

  // Expand the data structure if a cell in an extra row/column is edited.
  function ensureCellExists(rowIdx, colIdx) {
    const headers = computeHeaders();
    const numDataRows = currentTableData.length;
    const numDataCols = headers.length;

    if (colIdx >= numDataCols) {
      const colsToAdd = colIdx - numDataCols + 1;
      for (let i = 0; i < colsToAdd; i++) {
        const newColName = getUniqueNewColumnName();
        currentHeaders.push(newColName);
        currentTableData.forEach(row => {
          row[newColName] = "";
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

  // Generate a unique new column name.
  function getUniqueNewColumnName() {
    const baseName = "New Column";
    let newName = baseName;
    let count = 1;
    while (currentHeaders.includes(newName)) {
      newName = baseName + " " + (++count);
    }
    return newName;
  }

  // Delegate cell editing events using a single delegated handler.
  $("#data-table").off("click", ".spreadsheet-td").on("click", ".spreadsheet-td", function (e) {
    const $td = $(this);
    if ($td.hasClass("editing")) return;
    const rowIdx = parseInt($td.data("row"));
    const colIdx = parseInt($td.data("col"));
    const headers = computeHeaders();
    const cellOriginalValue = (originalData[rowIdx] && originalData[rowIdx][headers[colIdx]]) || "";
    const currentValue = $td.text();
    $td.addClass("editing");
    const $input = $(`<input type="text" value="${currentValue}" style="width: 100%; box-sizing: border-box; border: none; outline: none;" />`);
    $td.empty().append($input);
    $input.focus().select();

    // Debounce blur/keydown handling with a small delay.
    const finishEditing = (ev) => {
      if (ev.type === "blur" || ev.key === "Enter") {
        const newValue = $input.val();
        ensureCellExists(rowIdx, colIdx);
        const header = (colIdx < headers.length) ? headers[colIdx] : currentHeaders[colIdx];
        if (cellOriginalValue !== newValue) {
          currentTableData[rowIdx][header] = newValue;
          recordCellChange(rowIdx, header, newValue);
        } else if (pendingChanges[rowIdx] && pendingChanges[rowIdx][header] !== undefined) {
          delete pendingChanges[rowIdx][header];
          if (Object.keys(pendingChanges[rowIdx]).length === 0) {
            delete pendingChanges[rowIdx];
          }
          updateSaveButtonVisibility();
        }
        // Use requestAnimationFrame to schedule the re-render for smoother visuals.
        requestAnimationFrame(() => renderSpreadsheet());
      } else if (ev.key === "Escape") {
        requestAnimationFrame(() => renderSpreadsheet());
      }
    };
    $input.one("blur", finishEditing).on("keydown", finishEditing);
  });

  // Delegate header editing on double-click.
  $("#data-table").off("dblclick", ".spreadsheet-th").on("dblclick", ".spreadsheet-th", function (e) {
    const $th = $(this);
    const colIdx = parseInt($th.data("col"));
    if (colIdx >= currentHeaders.length) return;
    const currentName = currentHeaders[colIdx];
    const $input = $(`<input type="text" value="${currentName}" style="width: 100%; box-sizing: border-box; border: none; outline: none;" />`);
    $th.empty().append($input);
    $input.focus().select();
    $input.one("blur keydown", function (ev) {
      if (ev.type === "blur" || ev.key === "Enter") {
        const newName = $(this).val().trim();
        if (newName && newName !== currentName) {
          currentHeaders[colIdx] = newName;
          currentTableData.forEach(row => {
            row[newName] = row[currentName];
            delete row[currentName];
          });
          pendingChanges["colRename"] = pendingChanges["colRename"] || {};
          pendingChanges["colRename"][currentName] = newName;
        }
        requestAnimationFrame(() => renderSpreadsheet());
      } else if (ev.key === "Escape") {
        requestAnimationFrame(() => renderSpreadsheet());
      }
    });
  });

  // Delegate deletion of columns via the trash icon.
  $("#data-table").off("click", ".delete-col-icon").on("click", ".delete-col-icon", function (e) {
    e.stopPropagation();
    const colIdx = parseInt($(this).data("col"));
    const headers = computeHeaders();
    if (colIdx < headers.length) {
      const colName = headers[colIdx];
      if (confirm(`Delete column "${colName}" from the table?`)) {
        currentHeaders.splice(colIdx, 1);
        currentTableData.forEach(row => {
          delete row[colName];
        });
        pendingChanges["columnDeletion"] = true;
        requestAnimationFrame(() => renderSpreadsheet());
      }
    }
  });

  /**********************
   * SAVE CHANGES
   **********************/
  $("#save-edits-btn").off("click").on("click", async function () {
    $(this).prop("disabled", true).text("Saving...");
    try {
      const newTableName = $("#table-name-input").val();
      const updatedData = normalizeDataRows(currentTableData, currentHeaders);
      const { error } = await supabaseClient
        .from("project_data")
        .update({
          data: updatedData,
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
        currentTableRecord.data = updatedData;
        originalData = JSON.parse(JSON.stringify(updatedData));
        pendingChanges = {};
        renderSpreadsheet();
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
    let defaultHeaders = ["Column 1", "Column 2", "Column 3", "Column 4", "Column 5"];
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
    renderSpreadsheet();
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
      renderSpreadsheet();
    } else {
      console.log("Selected data table is empty.");
      hideDataTable();
    }
  }

  function hideDataTable() {
    $("#data-table").empty();
    $("#table-name-container").hide();
  }

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
