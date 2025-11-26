import { supabase } from './supabase.js';

// Vérifier si déjà connecté
checkIfLoggedIn();

async function checkIfLoggedIn() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        window.location.href = 'dashboard.html';
    }
}

// Gestion du formulaire de connexion
const loginForm = document.getElementById('loginFormElement');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        showMessage('Connexion en cours...', 'info');
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            showMessage('Erreur: ' + error.message, 'error');
            return;
        }
        
        showMessage('Connexion réussie! Redirection...', 'success');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
    });
}

// Fonction pour afficher des messages
function showMessage(text, type) {
    const messageDiv = document.getElementById('authMessage');
    if (!messageDiv) return;
    
    messageDiv.textContent = text;
    messageDiv.className = 'message ' + type;
    messageDiv.style.display = 'block';
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
}
