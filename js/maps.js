// maps.js

let map;
let drawnItems;
let currentProjectId;
let currentMapId;
let currentPopup = null;
let currentBasemap = 'osm'; // Default basemap is OpenStreetMap
let popupInitialValues = {}; // Store initial values of popup fields

// --- Modified: Accept an optional defaultName parameter
async function showMapCreationContainer(projectId, defaultName = null) {
  clearMap();
  clearProjectMaps();
  document.getElementById('map-container').style.display = 'block';

  // Use the defaultName (typically the file name) as the prompt default.
  let mapName = prompt("Enter a name for the new map:", defaultName || "New Map");
  if (!mapName) {
    alert("Map creation cancelled. Please provide a map name.");
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    alert("User not authenticated.");
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('maps')
      .insert({
        project_id: projectId,
        description: mapName,  // Use mapName (which defaults to the file name if provided)
        map_object: { type: 'FeatureCollection', features: [] },
        created_by: session.user.id
      })
      .select();
    if (error) {
      console.error('Error creating new map:', error);
      alert('Error creating new map: ' + error.message);
      return;
    }
    if (data && data.length > 0) {
      currentMapId = data[0].id;
    }
  } catch (err) {
    console.error('Error creating new map:', err);
    alert('Error creating new map');
    return;
  }

  let mapFormContainer = document.getElementById('map-form-container');
  if (!mapFormContainer) {
    mapFormContainer = document.createElement('div');
    mapFormContainer.setAttribute('id', 'map-form-container');
    document.getElementById('mapping-tools').appendChild(mapFormContainer);
  }
  mapFormContainer.innerHTML = '';
  mapFormContainer.style.display = 'none';

  initMap(projectId);
}

function initMap(projectId) {
  currentProjectId = projectId;
  let mapContainer = document.getElementById('map-container');
  if (!mapContainer) {
    mapContainer = document.createElement('div');
    mapContainer.setAttribute('id', 'map-container');
    mapContainer.style.height = '600px';
    const section = document.getElementById('mapping-tools');
    section.appendChild(mapContainer);
  }
  mapContainer.style.display = 'block';

  // Add basemap toggle switch container if needed
  if (!document.getElementById('basemap-toggle-container')) {
    const basemapToggleContainer = document.createElement('div');
    basemapToggleContainer.setAttribute('id', 'basemap-toggle-container');
    basemapToggleContainer.style.position = 'absolute';
    basemapToggleContainer.style.top = '10px';
    basemapToggleContainer.style.right = '10px';
    basemapToggleContainer.style.zIndex = '1000';

    const toggleWrapper = document.createElement('div');
    toggleWrapper.classList.add('basemap-toggle-wrapper');

    const basemapToggleLabel = document.createElement('label');
    basemapToggleLabel.classList.add('switch');
    const basemapToggleInput = document.createElement('input');
    basemapToggleInput.type = 'checkbox';
    basemapToggleInput.id = 'basemap-toggle';
    const basemapToggleSpan = document.createElement('span');
    basemapToggleSpan.classList.add('slider', 'round');
    basemapToggleLabel.appendChild(basemapToggleInput);
    basemapToggleLabel.appendChild(basemapToggleSpan);
    toggleWrapper.appendChild(basemapToggleLabel);

    const toggleText = document.createElement('div');
    toggleText.setAttribute('id', 'basemap-toggle-text');
    toggleText.textContent = 'Satellite View';
    toggleWrapper.appendChild(toggleText);

    basemapToggleContainer.appendChild(toggleWrapper);
    mapContainer.appendChild(basemapToggleContainer);
  }

  if (!map) {
    map = L.map(mapContainer, {
      maxZoom: 19,
      zoomControl: true
    });

    const africaCenter = [0, 20];
    map.setView(africaCenter, 2);

    // Initial Basemap - OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    currentBasemap = 'osm';

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      edit: {
        featureGroup: drawnItems,
        remove: true
      },
      draw: {
        polygon: true,
        polyline: false,
        rectangle: false,
        circle: false,
        marker: true,
        circlemarker: false
      }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, async function (event) {
      const layer = event.layer;
      const feature = layer.toGeoJSON();

      if (!feature.properties) {
        feature.properties = {};
      }
      // Default properties for a new feature
      feature.properties.description = 'New Object Description';
      feature.properties.site_information = 'New Site Information';
      feature.properties.website = 'https://example.com';

      drawnItems.addLayer(layer);

      await saveMapObject(projectId, feature, layer);
      bindPopupToLayer(layer, projectId, feature);
    });

    map.on(L.Draw.Event.EDITED, function(e) {
      e.layers.eachLayer(function(layer) {
        const feature = layer.toGeoJSON();
        if (!feature.properties) {
          feature.properties = {};
        }
        bindPopupToLayer(layer, projectId, feature);
        saveMapObject(projectId, feature, layer);
      });
    });

    map.on(L.Draw.Event.DELETED, function(e) {
      e.layers.eachLayer(function(layer) {
        const feature = layer.toGeoJSON();
        deleteMapObject(projectId, feature, layer);
      });
    });

    // Basemap toggle functionality
    document.getElementById('basemap-toggle').addEventListener('change', function() {
      toggleBasemap();
    });
  }
}

function toggleBasemap() {
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  });
  const esriLayer = L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri - Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
  });

  if (currentBasemap === 'osm') {
    map.eachLayer(layer => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });
    esriLayer.addTo(map);
    document.getElementById('basemap-toggle-text').textContent = 'Street View';
    currentBasemap = 'esri';
  } else {
    map.eachLayer(layer => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });
    osmLayer.addTo(map);
    document.getElementById('basemap-toggle-text').textContent = 'Satellite View';
    currentBasemap = 'osm';
  }
}

function bindPopupToLayer(layer, projectId, feature) {
  let popupContent = `
    <div>
      <h3>Description:</h3>
      <p contenteditable="true" class="map-popup-editable" data-field="description">${feature.properties.description || 'N/A'}</p>
      <h3>Site Information:</h3>
      <p contenteditable="true" class="map-popup-editable" data-field="site_information">${feature.properties.site_information || 'N/A'}</p>
      <h3>Website:</h3>
      <p contenteditable="true" class="map-popup-editable" data-field="website">${feature.properties.website || 'N/A'}</p>
      <button class="action-btn delete-feature-btn">Delete Object</button>
    </div>
  `;
  layer.bindPopup(popupContent);

  layer.on('popupopen', function() {
    currentPopup = layer.getPopup();
    const popupElement = currentPopup.getElement();
    if (!popupElement) return;

    // Store initial values when popup opens
    popupInitialValues = {
      description: feature.properties.description || 'N/A',
      site_information: feature.properties.site_information || 'N/A',
      website: feature.properties.website || 'N/A'
    };

    const deleteBtn = popupElement.querySelector('.delete-feature-btn');
    deleteBtn.removeEventListener('click', deleteBtn.clickHandler);
    deleteBtn.clickHandler = async function() {
      await deleteMapObject(projectId, feature, layer);
      map.closePopup(currentPopup);
      currentPopup = null;
    };
    deleteBtn.addEventListener('click', deleteBtn.clickHandler);
  });

  layer.on('popupclose', async function() {
    if (!currentPopup) return;
    const popupElement = currentPopup.getElement();
    if (!popupElement) return;
    const editables = popupElement.querySelectorAll('.map-popup-editable');
    let currentValues = {};
    editables.forEach(editable => {
      currentValues[editable.dataset.field] = editable.textContent;
    });
    if (
      popupInitialValues.description !== currentValues.description ||
      popupInitialValues.site_information !== currentValues.site_information ||
      popupInitialValues.website !== currentValues.website
    ) {
      feature.properties.description = currentValues.description;
      feature.properties.site_information = currentValues.site_information;
      feature.properties.website = currentValues.website;
      console.log('Popup closed - changes detected, saving...', feature.properties);
      await saveMapObject(projectId, feature, layer);
    } else {
      console.log('Popup closed - no changes detected.');
    }
    currentPopup = null;
    popupInitialValues = {};
  });
}

async function saveMapObject(projectId, feature, layer) {
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (!session) {
    console.error('User not authenticated:', sessionError);
    alert('You must be logged in to save map objects.');
    return;
  }
  const createdBy = session.user.id;

  // INSERT NEW FEATURE
  if (!feature.properties._leaflet_id) {
    console.log('saveMapObject - INSERT, feature:', feature);
    try {
      const { data: currentMapData, error: fetchError } = await supabaseClient
        .from('maps')
        .select('map_object')
        .eq('id', currentMapId)
        .single();
      if (fetchError) {
        console.error('Error fetching current map data:', fetchError);
        alert('Failed to fetch current map data.');
        return;
      }
      let existingMapObject = currentMapData.map_object || { type: 'FeatureCollection', features: [] };
      if (existingMapObject.type !== 'FeatureCollection') {
        existingMapObject = { type: 'FeatureCollection', features: existingMapObject ? [existingMapObject] : [] };
      }
      existingMapObject.features = [...existingMapObject.features, feature];
      const { data: updateData, error: updateError } = await supabaseClient
        .from('maps')
        .update({ map_object: existingMapObject })
        .eq('id', currentMapId)
        .select('map_object');
      if (updateError) {
        console.error('Error updating map object in Supabase:', updateError);
        alert('Failed to update map object in Supabase.');
        return;
      }
      console.log('Map object updated successfully with new feature.');
      loadMapData(projectId, currentMapId);
    } catch (error) {
      console.error('Error during saveMapObject (INSERT):', error);
      alert('Error saving map object.');
    }
  } else {
    console.log('saveMapObject - UPDATE, feature:', feature);
    try {
      const { data: currentMapData, error: fetchError } = await supabaseClient
        .from('maps')
        .select('map_object')
        .eq('id', currentMapId)
        .single();
      if (fetchError) {
        console.error('Error fetching current map data:', fetchError);
        alert('Failed to fetch current map data for update.');
        return;
      }
      let existingMapObject = currentMapData.map_object;
      if (!existingMapObject || existingMapObject.type !== 'FeatureCollection' || !Array.isArray(existingMapObject.features)) {
        console.error('Invalid map_object structure for update.');
        alert('Invalid map data structure.');
        return;
      }
      const featureIndex = existingMapObject.features.findIndex(f =>
        f.properties &&
        f.properties.description === feature.properties.description &&
        f.properties.site_information === feature.properties.site_information &&
        f.properties.website === feature.properties.website
      );
      if (featureIndex === -1) {
        console.error('Feature not found in map_object for update.');
        alert('Feature not found for update.');
        return;
      }
      existingMapObject.features[featureIndex] = feature;
      const { error: updateError } = await supabaseClient
        .from('maps')
        .update({ map_object: existingMapObject })
        .eq('id', currentMapId);
      if (updateError) {
        console.error('Error updating map object in Supabase:', updateError);
        alert('Failed to update map object in Supabase.');
        return;
      }
      console.log('Map object updated successfully after feature edit.');
      loadMapData(projectId, currentMapId);
    } catch (error) {
      console.error('Error during saveMapObject (UPDATE):', error);
      alert('Error updating map object.');
    }
  }
}

async function deleteMapObject(projectId, feature, layer) {
  const confirmDelete = confirm('Are you sure you want to remove this map object?');
  if (!confirmDelete) return;
  try {
    const { data: currentMapData, error: fetchError } = await supabaseClient
      .from('maps')
      .select('map_object')
      .eq('id', currentMapId)
      .single();
    if (fetchError) {
      console.error('Error fetching current map data:', fetchError);
      alert('Failed to fetch current map data for delete.');
      return;
    }
    let existingMapObject = currentMapData.map_object;
    if (!existingMapObject || existingMapObject.type !== 'FeatureCollection' || !Array.isArray(existingMapObject.features)) {
      console.error('Invalid map_object structure for delete.');
      alert('Invalid map data structure.');
      return;
    }
    existingMapObject.features = existingMapObject.features.filter(f => !(
      f.properties &&
      f.properties.description === feature.properties.description &&
      f.properties.site_information === feature.properties.site_information &&
      f.properties.website === feature.properties.website
    ));
    const { error: updateError } = await supabaseClient
      .from('maps')
      .update({ map_object: existingMapObject })
      .eq('id', currentMapId);
    if (updateError) {
      console.error('Error updating map object in Supabase after delete:', updateError);
      alert('Failed to delete map object from Supabase.');
      return;
    }
    console.log('Map object updated successfully after feature delete.');
    drawnItems.removeLayer(layer);
    if (drawnItems.getLayers().length === 0) {
      if (map) {
        map.remove();
        map = null;
      }
      document.getElementById('map-container').style.display = 'none';
    }
  } catch (error) {
    console.error('Error during deleteMapObject:', error);
    alert('Error deleting map object.');
  }
}

async function handleProjectSelection(sectionId, projectId) {
  console.log(`Project selected in section ${sectionId}:`, projectId);
  currentProjectId = projectId;

  const sectionActionButtons = document.querySelectorAll(`#${sectionId} .action-btn`);
  sectionActionButtons.forEach(button => {
    button.disabled = true;
  });
  document.querySelector('#create-map-btn').disabled = true;
  document.querySelector('#import-map-data-btn').disabled = true; // disable import button until a map is loaded

  const selectedProjectCard = document.querySelector(`#${sectionId} .project-cards-container .project-card.selected`);
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
          updateProjectButton.style.display = 'block';
          updateProjectButton.disabled = false;
        }
        break;
      case 'data-management':
        break;
      case 'mapping-tools':
        document.querySelector('#create-map-btn').disabled = false;
        document.querySelector('#import-map-data-btn').disabled = false;
        loadProjectMaps(projectId);
        break;
      case 'analytics':
        const generateReportButton = document.querySelector(`#${sectionId} #generate-report-btn`);
        const viewInsightsButton = document.querySelector(`#${sectionId} #view-insights-btn`);
        if (generateReportButton) generateReportButton.disabled = false;
        if (viewInsightsButton) viewInsightsButton.disabled = false;
        break;
    }
  } else {
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
    if (sectionId === 'mapping-tools') {
      document.querySelector('#create-map-btn').disabled = true;
      document.querySelector('#import-map-data-btn').disabled = true;
      clearProjectMaps();
      clearMap();
      document.getElementById('map-container').style.display = 'none';
    }
  }
}

function clearMap() {
  if (map) {
    if (drawnItems) {
      drawnItems.clearLayers();
    }
    map.remove();
    map = null;
  }
  const mapContainer = document.getElementById('map-container');
  if (mapContainer) {
    mapContainer.innerHTML = '';
  }
}

function clearProjectMaps() {
  const projectMapsContainer = document.getElementById('project-maps-container');
  if (projectMapsContainer) {
    projectMapsContainer.innerHTML = '';
  }
}

// --- NEW: Import Map Data functionality

async function importMapData() {
  if (!currentProjectId) {
    alert("Please select a project first.");
    return;
  }
  // If no map record exists, automatically create one using the file name (defaultName will be passed later)
  if (!currentMapId) {
    // Do nothing here; we will create the map after reading the file.
  }
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = ".xlsx,.xls,.xlsm,.xltx,.xlsb,.csv,.json," +
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
    "application/vnd.ms-excel," +
    "application/vnd.ms-excel.sheet.macroEnabled.12," +
    "application/vnd.openxmlformats-officedocument.spreadsheetml.template," +
    "application/vnd.ms-excel.sheet.binary.macroEnabled.12";
  fileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
      processMapImportFile(file);
    }
  });
  fileInput.click();
}

function processMapImportFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const fileContent = e.target.result;
    const fileName = file.name;
    const fileExtension = fileName.split(".").pop().toLowerCase();
    let parsedData;
    if (fileExtension === "json") {
      try {
        parsedData = JSON.parse(fileContent);
      } catch (error) {
        alert("Error parsing JSON file.");
        return;
      }
    } else if (fileExtension === "csv") {
      Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
          parsedData = results.data;
          showImportModal(parsedData, fileName);
        },
        error: function(err) {
          alert("Error parsing CSV file.");
        }
      });
      return;
    } else if (["xlsx", "xls", "xlsm", "xltx", "xlsb"].includes(fileExtension)) {
      try {
        const data = new Uint8Array(fileContent);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        parsedData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      } catch (error) {
        alert("Error parsing Excel file.");
        return;
      }
    } else {
      alert("Unsupported file type.");
      return;
    }
    showImportModal(parsedData, fileName);
  };
  if (["xlsx", "xls", "xlsm", "xltx", "xlsb"].includes(file.name.split(".").pop().toLowerCase())) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
}

function showImportModal(data, defaultName) {
  // Build a modal overlay with selectors to choose coordinate mode and map columns.
  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  let modalHTML = `
    <div class="import-modal-overlay" id="import-modal-overlay">
      <div class="import-modal">
        <h2>Import Map Data</h2>
        <p>Select how to interpret the imported data:</p>
        <div>
          <label><input type="radio" name="coord-mode" value="point" checked> Point (choose separate Latitude &amp; Longitude columns)</label>
          <label style="margin-left:20px;"><input type="radio" name="coord-mode" value="polygon"> Polygon (choose a column with polygon coordinates)</label>
        </div>
        <div id="point-selectors" style="margin-top:10px;">
          <label>Latitude Column:
            <select id="lat-column">
              ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
            </select>
          </label>
          <label style="margin-left:10px;">Longitude Column:
            <select id="lon-column">
              ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
            </select>
          </label>
        </div>
        <div id="polygon-selector" style="margin-top:10px; display:none;">
          <label>Polygon Column:
            <select id="poly-column">
              ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
            </select>
          </label>
        </div>
        <div style="margin-top:10px;">
          <label>Name Column:
            <select id="name-column">
              ${headers.map(h => `<option value="${h}">${h}</option>`).join('')}
            </select>
          </label>
        </div>
        <div style="margin-top:10px;">
          <p>Preview (first 5 rows):</p>
          <table>
            <thead>
              <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${data.slice(0, 5).map(row => `<tr>${headers.map(h => `<td>${row[h]}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button id="cancel-import-btn" class="action-btn">Cancel</button>
          <button id="confirm-import-btn" class="action-btn">Import</button>
        </div>
      </div>
    </div>
  `;
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer);

  // Toggle display of point vs polygon selectors
  const coordRadios = document.getElementsByName("coord-mode");
  coordRadios.forEach(radio => {
    radio.addEventListener("change", function() {
      if (this.value === "point") {
        document.getElementById("point-selectors").style.display = "block";
        document.getElementById("polygon-selector").style.display = "none";
      } else {
        document.getElementById("point-selectors").style.display = "none";
        document.getElementById("polygon-selector").style.display = "block";
      }
    });
  });

  document.getElementById("cancel-import-btn").addEventListener("click", function() {
    document.getElementById("import-modal-overlay").remove();
  });

  document.getElementById("confirm-import-btn").addEventListener("click", async function() {
    const coordMode = document.querySelector('input[name="coord-mode"]:checked').value;
    const nameCol = document.getElementById("name-column").value;
    let features = [];
    data.forEach(row => {
      // Skip rows with empty name
      if (!row[nameCol]) return;
      let properties = {
        name: row[nameCol],
        description: row["Description"] || '',
        site_information: row["Site Information"] || '',
        website: row["Website"] || ''
      };
      // Also, include any additional fields in extra_fields
      let extra_fields = {};
      Object.keys(row).forEach(h => {
        if (![nameCol, "Description", "Site Information", "Website"].includes(h)) {
          extra_fields[h] = row[h];
        }
      });
      properties.extra_fields = extra_fields;
      let geometry;
      if (coordMode === "point") {
        const lat = parseFloat(row[document.getElementById("lat-column").value]);
        const lon = parseFloat(row[document.getElementById("lon-column").value]);
        if (isNaN(lat) || isNaN(lon)) return;
        geometry = { type: "Point", coordinates: [lon, lat] };
      } else {
        try {
          geometry = JSON.parse(row[document.getElementById("poly-column").value]);
        } catch (error) {
          console.error("Error parsing polygon data:", error);
          return;
        }
      }
      const feature = {
        type: "Feature",
        geometry: geometry,
        properties: properties
      };
      features.push(feature);
    });
    // If no map record exists, automatically create one using the defaultName (fileName)
    if (!currentMapId) {
      await showMapCreationContainer(currentProjectId, defaultName);
      if (!currentMapId) {
        alert("Map creation failed. Please try again.");
        return;
      }
    }
    // Now add the new features into the current map
    await addImportedFeatures(features);
    document.getElementById("import-modal-overlay").remove();
  });
}

async function addImportedFeatures(features) {
  if (!features || features.length === 0) {
    alert("No valid features to import.");
    return;
  }
  // Ensure that the map is initialized.
  if (!map) {
    initMap(currentProjectId);
  }
  // Ensure drawnItems is available.
  if (!drawnItems) {
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
  }

  // First, update Supabase with the new features.
  const { data: currentMapData, error: fetchError } = await supabaseClient
    .from('maps')
    .select('map_object, description')
    .eq('id', currentMapId)
    .single();
  if (fetchError) {
    console.error("Error fetching current map data:", fetchError);
    alert("Failed to fetch current map data.");
    return;
  }
  let existingMapObject = currentMapData.map_object || { type: 'FeatureCollection', features: [] };
  if (existingMapObject.type !== 'FeatureCollection') {
    existingMapObject = { type: 'FeatureCollection', features: existingMapObject ? [existingMapObject] : [] };
  }
  // Append the imported features.
  existingMapObject.features = [...existingMapObject.features, ...features];
  // (Optional) If the current map record does not have a description, update it to the file name
  let updatePayload = { map_object: existingMapObject };
  if (!currentMapData.description || currentMapData.description.trim() === "") {
    updatePayload.description = "Imported Data"; // Alternatively, use a file name if you wish
  }
  const { error: updateError } = await supabaseClient
    .from('maps')
    .update(updatePayload)
    .eq('id', currentMapId);
  if (updateError) {
    console.error("Error updating map with imported features:", updateError);
    alert("Failed to update map with imported features.");
    return;
  }
  // Now reload the map data from Supabase to ensure the new features are loaded.
  await loadMapData(currentProjectId, currentMapId);
  alert("Imported " + features.length + " features successfully.");
}

async function loadProjectMaps(projectId) {
  clearProjectMaps();
  clearMap();
  document.getElementById('map-container').style.display = 'none';

  const projectMapsContainer = document.getElementById('project-maps-container');
  if (!projectMapsContainer) {
    console.error('Project maps container not found.');
    return;
  }
  projectMapsContainer.innerHTML = '';

  try {
    const { data: mapList, error } = await supabaseClient
      .from('maps')
      .select('id, map_object, description')
      .eq('project_id', projectId);
    if (error) {
      throw error;
    }
    if (mapList && mapList.length > 0) {
      mapList.forEach(mapItem => {
        const mapButton = document.createElement('button');
        const mapDescription = mapItem.map_object?.properties?.description || mapItem.description || 'Map';
        mapButton.textContent = mapDescription;
        mapButton.title = mapDescription;
        mapButton.classList.add('action-btn');
        mapButton.setAttribute('data-map-id', mapItem.id);
        mapButton.addEventListener('click', () => {
          loadMapData(projectId, mapItem.id);
          projectMapsContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
          mapButton.classList.add('active');
        });
        projectMapsContainer.appendChild(mapButton);
      });
    } else {
      projectMapsContainer.innerHTML = '<p>No maps created for this project yet.</p>';
    }
  } catch (error) {
    console.error('Error loading project maps:', error);
    projectMapsContainer.innerHTML = '<p>Error loading maps.</p>';
  }
}

async function loadMapData(projectId, mapId) {
  currentMapId = mapId;
  clearMap();
  initMap(projectId);
  document.getElementById('map-container').style.display = 'block';

  if (drawnItems) {
    drawnItems.clearLayers();
  }
  const mapFormContainer = document.getElementById('map-form-container');
  if (mapFormContainer) {
    mapFormContainer.innerHTML = '';
    mapFormContainer.style.display = 'none';
  }
  try {
    const { data: mapObjectData, error } = await supabaseClient
      .from('maps')
      .select('id, map_object, description, site_information, website')
      .eq('id', mapId)
      .eq('project_id', projectId)
      .single();
    if (error) throw error;
    if (mapObjectData && mapObjectData.map_object) {
      const mapObjects = mapObjectData.map_object;
      let features = [];
      if (mapObjects && mapObjects.features) {
        features = mapObjects.features;
      } else if (mapObjects && mapObjects.type === 'Feature') {
        features = [mapObjects];
      }
      features.forEach((feature) => {
        if (!feature.properties) {
          feature.properties = {};
        }
        const geoJsonLayer = L.geoJSON(feature, {
          onEachFeature: function (feature, layer) {
            if (feature.properties) {
              bindPopupToLayer(layer, projectId, feature);
            }
          }
        }).addTo(map);
        drawnItems.addLayer(geoJsonLayer);
      });
      if (drawnItems.getLayers().length > 0) {
        map.fitBounds(drawnItems.getBounds());
      }
    } else {
      console.log('No map objects found for map ID:', mapId);
      alert('No map objects found for selected map.');
    }
  } catch (err) {
    console.error('Error loading map data:', err);
    alert('Failed to load map data.');
  }
}

$(document).ready(function () {
  let selectedProjectId = null;
  function setupProjectCardSelection(sectionId) {
    $(`#${sectionId} .project-cards-container`).off('click', '.project-card');
    $(`#${sectionId} .project-cards-container`).on('click', '.project-card', function() {
      $(`#${sectionId} .project-cards-container .project-card`).removeClass('selected');
      $(this).addClass('selected');
      const projectId = $(this).data('project-id');
      selectedProjectId = projectId;
      handleProjectSelection(sectionId, projectId);
    });
  }
  async function loadProjectsForSection(sectionId) {
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
    const projectCardsContainer = $(`#${sectionId} .project-cards-container`);
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
    setupProjectCardSelection(sectionId);
  }
  $('.tab[data-section="mapping-tools"]').on('click', async function () {
    await loadProjectsForSection('mapping-tools');
    document.querySelector('#create-map-btn').disabled = true;
    document.querySelector('#import-map-data-btn').disabled = true;
    clearProjectMaps();
    clearMap();
    document.getElementById('map-container').style.display = 'none';
    $('#mapping-tools .project-cards-container').removeClass('selected');
  });
  async function initializeMappingTools() {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionData?.session) {
      $('#create-map-btn').click(async () => {
        if (currentProjectId) {
          await showMapCreationContainer(currentProjectId);
        } else {
          alert('Please select a project first to create a map.');
        }
      });
      // Bind the new Import Map Data button
      $('#import-map-data-btn').click(async () => {
        importMapData();
      });
      setupProjectCardSelection('mapping-tools');
      document.getElementById('map-container').style.display = 'none';
      if ($('.tab.active').data('section') === 'mapping-tools') {
        await loadProjectsForSection('mapping-tools');
      }
    } else {
      window.location.href = '/login.html';
    }
  }
  function initializeActiveTabSection() {
    const activeSection = $('.tab.active').data('section');
    if (activeSection === 'mapping-tools') {
      initializeMappingTools();
    }
  }
  initializeActiveTabSection();
  $('.tab').on('click', function() {
    const sectionId = $(this).data('section');
    if (sectionId === 'mapping-tools') {
      initializeMappingTools();
    }
  });
});

/* CSS for Toggle Switch */
const style = document.createElement('style');
style.innerHTML = `
.basemap-toggle-wrapper {
    background-color: white;
    border-radius: 20px;
    padding: 5px 10px;
    display: flex;
    align-items: center;
}

#basemap-toggle-text {
    color: black;
    margin-left: 10px;
    font-weight: bold;
    font-size: 1.1em;
    vertical-align: middle;
}

.switch {
  position: relative;
  display: inline-block;
  width: 60px;
  height: 34px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  -webkit-transition: .4s;
  transition: .4s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 26px;
  width: 26px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  -webkit-transition: .4s;
  transition: .4s;
}

input:checked + .slider {
  background-color: #2196F3;
}

input:focus + .slider {
  box-shadow: 0 0 1px #2196F3;
}

input:checked + .slider:before {
  -webkit-transform: translateX(26px);
  -ms-transform: translateX(26px);
  transform: translateX(26px);
}

.slider.round {
  border-radius: 34px;
}

.slider.round:before {
  border-radius: 50%;
}
`;
document.head.appendChild(style);
