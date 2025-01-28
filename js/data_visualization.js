// data_visualization.js

$(document).ready(function () {
    let selectedProjectId = null;
    let selectedDataTableId = null;
    let dataTableVis = null;
    let currentTableData = [];
    let currentChart = null; // To store the current chart instance
    let trendlineAdded = false; // Flag to check if trendline is added

    // Function to load projects for selection
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

        const projectCardsContainer = $('#visualization-project-cards');
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

    // Handle project card selection
    function handleProjectSelection() {
        $('#visualization-project-cards .project-card').off('click');
        $('#visualization-project-cards .project-card').on('click', function () {
            $('#visualization-project-cards .project-card').removeClass('selected');
            $(this).addClass('selected');
            selectedProjectId = $(this).data('project-id');
            $('.data-table-selection').show();
            loadProjectDataTables(selectedProjectId);
        });
    }

    // Function to fetch and display data tables for a project
    async function loadProjectDataTables(projectId) {
        if (!projectId) {
            console.log('No project selected to load data tables.');
            $('#data-table-vis-buttons').empty();
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

        const buttonsContainer = $('#data-table-vis-buttons');
        buttonsContainer.empty();

        if (data && data.length > 0) {
            data.forEach(table => {
                const button = $(`<button class="data-table-vis-button action-btn" data-table-id="${table.id}">${table.file_name}</button>`);
                button.on('click', function () {
                    $('.data-table-vis-button').removeClass('selected');
                    $(this).addClass('selected');
                    selectedDataTableId = $(this).data('table-id');
                    displayDataTable(table.data);
                    $('.visualization-controls').show();
                });
                buttonsContainer.append(button);
            });
            $('.data-table-selection').show();
        } else {
            console.log('No data tables found for this project.');
            $('#data-table-vis-buttons').empty();
            hideDataTable();
            $('.data-table-selection').hide();
            $('.visualization-controls').hide();
        }
    }

    // Function to display data in DataTable with column selection checkboxes
    function displayDataTable(data) {
        currentTableData = data; // Store the data
        const columns = Object.keys(data[0]).map(key => ({
            title: `${key} <label class="custom-checkbox"><input type="checkbox" class="column-selector" data-column="${key}"><span class="checkmark"></span></label>`,
            data: key
        }));

        if ($.fn.DataTable.isDataTable('#data-table-vis')) {
            $('#data-table-vis').DataTable().destroy();
        }
        $('#data-table-vis').empty();

        dataTableVis = $('#data-table-vis').DataTable({
            data: data,
            columns: columns,
            // Removed buttons functionality
            paging: true,
            pageLength: 10,
            autoWidth: false,
            scrollX: true,
            columnDefs: [{
                targets: 0,
                orderable: false
            }],
            order: [[1, 'asc']]
        });

        // Reset trendline state when a new table is loaded
        resetTrendline();

        $('.data-table-wrapper').show();
    }

    function hideDataTable() {
        if ($.fn.DataTable.isDataTable('#data-table-vis')) {
            $('#data-table-vis').DataTable().destroy();
            $('#data-table-vis').empty();
        }
        $('.data-table-wrapper').hide();
    }

    // Handle plotting when the button is clicked
    $('#plot-button').on('click', function () {
        const selectedColumns = $('.column-selector:checked').map(function () {
            return $(this).data('column');
        }).get();

        if (selectedColumns.length < 1) {
            alert('Please select at least one column to plot.');
            return;
        }

        const chartType = $('#chart-type').val();
        plotData(chartType, selectedColumns);
    });

    // Function to handle plotting the data using Chart.js
    function plotData(chartType, columns) {
        const ctx = $('#myChart')[0].getContext('2d');

        // Destroy the previous chart if it exists
        if (currentChart) {
            currentChart.destroy();
            currentChart = null;
        }

        if (chartType === 'pie' && columns.length === 1) {
            // Handle pie chart with frequency distribution
            const counts = {};
            currentTableData.forEach(row => {
                const key = row[columns[0]];
                counts[key] = (counts[key] || 0) + 1;
            });
            const labels = Object.keys(counts);
            const data = Object.values(counts);

            const dataset = {
                label: columns[0],
                data: data,
                backgroundColor: labels.map(() => getRandomColor()),
            };

            currentChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [dataset]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: 'Frequency Distribution of ' + columns[0]
                        }
                    }
                }
            });

            // Update chart details
            $('#chart-data-details').empty();
            $('#chart-data-details').append(`<li>Chart Type: <span>${capitalizeFirstLetter(chartType)}</span></li>`);
            $('#chart-data-details').append(`<li>Variable: <span>${columns[0]}</span></li>`);
            $('#chart-data-details').append(`<li>Data Representation: <span>Frequency Distribution</span></li>`);

            // Hide the "Add Trendline" button as it doesn't apply to pie charts
            $('#add-trendline-button').hide();
            trendlineAdded = false;

        } else {
            // Handle other chart types and multiple columns
            // Sort data based on the first selected column (X-axis)
            const sortedData = [...currentTableData].sort((a, b) => {
                const valA = a[columns[0]];
                const valB = b[columns[0]];
                if (typeof valA === 'string' && typeof valB === 'string') {
                    return valA.localeCompare(valB, undefined, { numeric: true }); // Handle numeric strings correctly
                }
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return valA - valB; // Handle numbers normally
                }
                // Handle non string or number data by comparing using the string value
                return String(valA).localeCompare(String(valB), undefined, { numeric: true });
            });

            const labels = sortedData.map(row => row[columns[0]]);
            const datasets = [];

            // Create datasets for each selected column (except the first one used for labels)
            for (let i = 1; i < columns.length; i++) {
                const columnName = columns[i];
                const dataset = {
                    label: columnName,
                    data: sortedData.map(row => row[columnName]),
                    borderWidth: 1,
                    fill: false,
                    backgroundColor: getRandomColor(),
                    borderColor: getRandomColor(),
                    tension: 0.1
                };
                datasets.push(dataset);
            }

            currentChart = new Chart(ctx, {
                type: chartType,
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: 'Data Visualization'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });

            // Update chart details
            $('#chart-data-details').empty();
            $('#chart-data-details').append(`<li>Chart Type: <span>${capitalizeFirstLetter(chartType)}</span></li>`);
            $('#chart-data-details').append(`<li>X-Axis: <span>${columns[0]}</span></li>`);
            if (columns.length > 1) {
                $('#chart-data-details').append(`<li>Y-Axis: <span>${columns.slice(1).join(', ')}</span></li>`);
            }

            // Show the "Add Trendline" button and reset its state
            $('#add-trendline-button').show().text('Add Trendline');
            trendlineAdded = false;

            // Ensure the trendline button is set to add functionality
            $('#add-trendline-button').off('click').on('click', function () {
                if (!currentChart || trendlineAdded) {
                    return;
                }

                addTrendline();
            });
        }
    }

    // Function to capitalize first letter
    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    // Function to generate random color
    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    // Function to add trendline
    function addTrendline() {
        if (!currentChart || trendlineAdded) {
            return;
        }

        // Assuming the first dataset is the primary data for trendline
        const primaryDataset = currentChart.data.datasets[0];
        const xData = currentChart.data.labels;
        const yData = primaryDataset.data;

        // Convert xData to numerical values if they are not
        const numericalXData = xData.map(x => Number(x) || 0);

        // Calculate linear regression
        const regression = linearRegression(numericalXData, yData);
        const trendlineData = numericalXData.map(x => regression.slope * x + regression.intercept);

        // Add trendline dataset
        const trendlineDataset = {
            label: 'Trendline',
            data: trendlineData,
            type: 'line',
            fill: false,
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            borderDash: [5, 5]
        };

        currentChart.data.datasets.push(trendlineDataset);
        currentChart.update();

        // Update chart details
        $('#chart-data-details').append(`<li>Trendline: <span>Linear Regression</span></li>`);

        // Update button state
        $('#add-trendline-button').text('Remove Trendline');
        trendlineAdded = true;

        // Change the button to toggle trendline
        $('#add-trendline-button').off('click').on('click', function () {
            removeTrendline();
        });
    }

    // Function to remove trendline
    function removeTrendline() {
        if (!currentChart || !trendlineAdded) {
            return;
        }

        // Remove the trendline dataset (assuming it's the last one)
        currentChart.data.datasets.pop();
        currentChart.update();

        // Update chart details
        $('#chart-data-details').find('li:contains("Trendline")').remove();

        // Update button state
        $('#add-trendline-button').text('Add Trendline');
        trendlineAdded = false;

        // Reattach the add trendline functionality
        $('#add-trendline-button').off('click').on('click', function () {
            if (!currentChart || trendlineAdded) {
                return;
            }

            addTrendline();
        });
    }

    // Function to perform linear regression
    function linearRegression(x, y) {
        const n = x.length;
        let sum_x = 0;
        let sum_y = 0;
        let sum_xy = 0;
        let sum_xx = 0;

        for (let i = 0; i < n; i++) {
            sum_x += x[i];
            sum_y += y[i];
            sum_xy += x[i] * y[i];
            sum_xx += x[i] * x[i];
        }

        const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
        const intercept = (sum_y - slope * sum_x) / n;

        return { slope, intercept };
    }

    // Function to reset trendline state
    function resetTrendline() {
        if (currentChart) {
            // Remove any existing trendline datasets
            const lastDataset = currentChart.data.datasets[currentChart.data.datasets.length - 1];
            if (lastDataset.label === 'Trendline') {
                currentChart.data.datasets.pop();
                currentChart.update();
            }
        }
        trendlineAdded = false;
        $('#add-trendline-button').hide().text('Add Trendline');
    }

    // Initialize the page
    async function initializeVisualizationPage() {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionData?.session) {
            await loadProjects();
        } else {
            window.location.href = '/login.html';
        }
    }

    initializeVisualizationPage();
});
