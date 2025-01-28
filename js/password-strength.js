// password-strength.js

document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('register-password');
    const strengthBar = document.getElementById('password-strength-bar');
    const strengthText = document.getElementById('password-strength-text');
    const registerForm = document.getElementById('register-form');
    const registerMessage = document.getElementById('register-message');

    // Password Strength Evaluation
    passwordInput.addEventListener('input', () => {
        const password = passwordInput.value;
        const strength = evaluatePasswordStrength(password);

        // Remove all strength classes
        strengthBar.classList.remove('strength-weak', 'strength-fair', 'strength-good', 'strength-strong');

        // Apply new strength class based on score
        switch (strength.score) {
            case 0:
                strengthBar.style.width = '0%';
                strengthBar.style.backgroundColor = '#ddd';
                strengthText.textContent = 'Password must be at least 8 characters long and include uppercase letters, lowercase letters, numbers, and special characters.';
                break;
            case 1:
                strengthBar.classList.add('strength-weak');
                strengthText.textContent = 'Weak password.';
                break;
            case 2:
                strengthBar.classList.add('strength-fair');
                strengthText.textContent = 'Fair password.';
                break;
            case 3:
                strengthBar.classList.add('strength-good');
                strengthText.textContent = 'Good password.';
                break;
            case 4:
                strengthBar.classList.add('strength-strong');
                strengthText.textContent = 'Strong password.';
                break;
            default:
                strengthBar.style.width = '0%';
                strengthBar.style.backgroundColor = '#ddd';
                strengthText.textContent = 'Password must be at least 8 characters long and include uppercase letters, lowercase letters, numbers, and special characters.';
        }
    });

    /**
     * Evaluates the strength of a given password.
     * @param {string} password - The password to evaluate.
     * @returns {Object} - An object containing the score and message.
     */
    function evaluatePasswordStrength(password) {
        let score = 0;

        // Criteria definitions
        const criteria = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password),
            specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };

        // Increment score for each met criterion
        if (criteria.length) score++;
        if (criteria.uppercase) score++;
        if (criteria.lowercase) score++;
        if (criteria.number) score++;
        if (criteria.specialChar) score++;

        // Determine overall strength
        if (score <= 2) {
            return { score: 1, message: 'Weak password.' };
        } else if (score === 3) {
            return { score: 2, message: 'Fair password.' };
        } else if (score === 4) {
            return { score: 3, message: 'Good password.' };
        } else if (score === 5) {
            return { score: 4, message: 'Strong password.' };
        } else {
            return { score: 0, message: 'Password must be at least 8 characters long and include uppercase letters, lowercase letters, numbers, and special characters.' };
        }
    }

    // Optional: Prevent form submission if password is weak
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            const password = passwordInput.value;
            const strength = evaluatePasswordStrength(password);

            if (strength.score < 3) { // Require at least 'Good' strength
                e.preventDefault();
                registerMessage.style.color = 'red';
                registerMessage.textContent = 'Please choose a stronger password before registering.';
            }
        });
    }
});
