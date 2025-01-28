// js/supabase.js

// Initialize Supabase
const supabaseUrl = 'https://zdoqcpbaujkcvagshhyw.supabase.co'; // Replace with your actual Supabase URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkb3FjcGJhdWprY3ZhZ3NoaHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYxODQ4NTIsImV4cCI6MjA1MTc2MDg1Mn0.xz_QHJlYHVtq3dxjPNtNe1LERj1PzGN1YfUBkhkaX58'; // Replace with your actual anon key
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Log to verify initialization (optional)
console.log('Supabase client initialized:', supabaseClient);

/**
 * Utility function to check if the authenticated user has completed their affiliation information.
 * If not, redirects them to 'affiliation.html'. If yes, redirects to 'placeholder.html'.
 */
async function checkAffiliation() {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

    if (session) {
        const userId = session.user.id;

        // Query the affiliations table to check if the user has an affiliation record
        const { data: affiliationData, error: affiliationError } = await supabaseClient
            .from('affiliations')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (affiliationError) {
            if (affiliationError.code === 'PGRST116') { // No rows found
                // Redirect to affiliation.html if affiliation info is missing
                window.location.href = 'affiliation.html';
            } else {
                console.error('Error fetching affiliation data:', affiliationError);
                // Optionally, display an error message to the user
                alert('An error occurred while verifying your affiliation. Please try again later.');
            }
        } else {
            // Affiliation info exists, proceed to placeholder or main app
            window.location.href = 'placeholder.html';
        }
    } else {
        // No active session, redirect to login
        window.location.href = 'index.html';
    }
}

// Handle Login Form Submission
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get form values
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            // Sign in the user
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                document.getElementById('login-message').innerText = error.message;
                document.getElementById('login-message').style.color = 'red';
            } else {
                // After successful login, check affiliation status
                checkAffiliation();
            }
        } catch (err) {
            console.error('Error during login:', err);
            document.getElementById('login-message').innerText = 'An unexpected error occurred.';
            document.getElementById('login-message').style.color = 'red';
        }
    });

    // Check if user is already authenticated on page load
    window.addEventListener('DOMContentLoaded', async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            // If session exists, check affiliation status
            checkAffiliation();
        }
    });
}

// Handle Registration Form Submission
const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get form values
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const passwordConfirm = document.getElementById('register-password-confirm').value;

        // Basic validation
        if (password !== passwordConfirm) {
            document.getElementById('register-message').innerText = "Passwords do not match.";
            document.getElementById('register-message').style.color = 'red';
            return;
        }

        try {
            // Register the user
            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
            });

            if (error) {
                document.getElementById('register-message').innerText = error.message;
                document.getElementById('register-message').style.color = 'red';
            } else {
                document.getElementById('register-message').style.color = 'green';
                document.getElementById('register-message').innerText = "Registration successful! Please check your email to confirm.";
                // Optionally, redirect to affiliation.html after email confirmation
                // Alternatively, prompt the user to log in after confirmation
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 3000);
            }
        } catch (err) {
            console.error('Error during registration:', err);
            document.getElementById('register-message').innerText = 'An unexpected error occurred.';
            document.getElementById('register-message').style.color = 'red';
        }
    });

    // Check if user is already authenticated on page load
    window.addEventListener('DOMContentLoaded', async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            // If session exists, check affiliation status
            checkAffiliation();
        }
    });
}

/**
 * Additional Functions for Protected Pages (e.g., placeholder.html)
 * These can be modularized or included as needed.
 */

// Function to handle redirection based on affiliation status
async function handleProtectedPage() {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

    if (session) {
        const userId = session.user.id;

        // Query the affiliations table to check if the user has an affiliation record
        const { data: affiliationData, error: affiliationError } = await supabaseClient
            .from('affiliations')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (affiliationError) {
            if (affiliationError.code === 'PGRST116') { // No rows found
                // Redirect to affiliation.html if affiliation info is missing
                window.location.href = 'affiliation.html';
            } else {
                console.error('Error fetching affiliation data:', affiliationError);
                // Optionally, display an error message to the user
                alert('An error occurred while verifying your affiliation. Please try again later.');
            }
        }
        // If affiliation exists, do nothing (stay on the current page)
    } else {
        // No active session, redirect to login
        window.location.href = 'index.html';
    }
}
