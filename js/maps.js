// maps.js

let map;
let drawnItems;
let currentProjectId;
let currentMapId;
let currentPopup = null;
let currentBasemap = 'osm'; // Default basemap is OpenStreetMap
let popupInitialValues = {}; // Store initial values of popup fields

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

    // Add basemap toggle switch container
    if (!document.getElementById('basemap-toggle-container')) {
        const basemapToggleContainer = document.createElement('div');
        basemapToggleContainer.setAttribute('id', 'basemap-toggle-container');
        basemapToggleContainer.style.position = 'absolute';
        basemapToggleContainer.style.top = '10px';
        basemapToggleContainer.style.right = '10px';
        basemapToggleContainer.style.zIndex = '1000'; // Ensure it's on top of map controls

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
        toggleText.textContent = 'Satellite View'; // Initial text
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
            // Default properties for a new feature (object)
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
        // Remove previous click event listener - using standard JS removeEventListener
        deleteBtn.removeEventListener('click', deleteBtn.clickHandler); // Remove if previously set

        // Define and attach new click event listener
        deleteBtn.clickHandler = async function() { // Store handler in the element itself
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

        // Compare initial and current values
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
        popupInitialValues = {}; // Clear initial values
    });
}

function showMapObjectForm(projectId, feature, layer) {}

async function saveMapObject(projectId, feature, layer) {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (!session) {
        console.error('User not authenticated:', sessionError);
        alert('You must be logged in to save map objects.');
        return;
    }
    const createdBy = session.user.id;

    // INSERT NEW FEATURE
    if (!feature.properties._leaflet_id) { // Using _leaflet_id as a proxy for new feature
        console.log('saveMapObject - INSERT, feature:', feature); // Debugging Log

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

            let existingMapObject = currentMapData.map_object || { type: 'FeatureCollection', features: [] }; // Default to FeatureCollection
            if (existingMapObject.type !== 'FeatureCollection') {
                existingMapObject = { type: 'FeatureCollection', features: existingMapObject ? [existingMapObject] : [] };
            }
            existingMapObject.features = [...existingMapObject.features, feature];

            const { data: updateData, error: updateError } = await supabaseClient
                .from('maps')
                .update({ map_object: existingMapObject })
                .eq('id', currentMapId)
                .select('map_object'); // Select map_object to get updated version

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
        // UPDATE EXISTING FEATURE
        console.log('saveMapObject - UPDATE, feature:', feature); // Debugging Log

        try {
            // 1. Fetch the current map data (FeatureCollection)
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

            // 2. Find the feature to update within the features array
            // Identify feature by comparing properties - description, site_information, website
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

            // 3. Update the properties and geometry of the found feature
            existingMapObject.features[featureIndex] = feature;

            // 4. Update the entire map_object in Supabase
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
            loadMapData(projectId, currentMapId); // Reload to show updated data

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
        // 1. Fetch the current map data (FeatureCollection)
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

        // 2. Filter out the feature to delete
        // Identify feature by comparing properties - description, site_information, website
        existingMapObject.features = existingMapObject.features.filter(f => !(
            f.properties &&
            f.properties.description === feature.properties.description &&
            f.properties.site_information === feature.properties.site_information &&
            f.properties.website === feature.properties.website
        ));

        // 3. Update the entire map_object in Supabase
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

// Modified: Now prompts for a new map name, retrieves the current session, and creates a new map record (including created_by) in Supabase.
async function showMapCreationContainer(projectId) {
    clearMap();
    clearProjectMaps();
    document.getElementById('map-container').style.display = 'block';

    let mapName = prompt("Enter a name for the new map:");
    if (!mapName) {
        alert("Map creation cancelled. Please provide a map name.");
        return;
    }

    // Retrieve session so we can set created_by
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
                description: mapName,
                map_object: { type: 'FeatureCollection', features: [] },
                created_by: session.user.id
            })
            .select();
        if (error) {
            console.error('Error creating new map:', error);
            alert('Error creating new map: ' + error.message);
            return;
        }
        // Assuming the insert returns an array with the new map row
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
                // Use the description column for the map name/button text
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

        if (mapObjectData && mapObjectData.map_object) { // Check if map_object exists
            const mapObjects = mapObjectData.map_object; // Directly use map_object

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
        clearProjectMaps();
        clearMap();
        document.getElementById('map-container').style.display = 'none';
        $('#mapping-tools .project-cards-container').removeClass('selected');
    });

    async function initializeMappingTools() {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();

        if (sessionData?.session) {
            // Modified: Use an async handler for the create-map-btn click event
            $('#create-map-btn').click(async () => {
                if (currentProjectId) {
                    await showMapCreationContainer(currentProjectId);
                } else {
                    alert('Please select a project first to create a map.');
                }
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
    vertical-align: middle; /* Align text vertically with switch */
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

/* Rounded sliders */
.slider.round {
  border-radius: 34px;
}

.slider.round:before {
  border-radius: 50%;
}
`;
document.head.appendChild(style);
