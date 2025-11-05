import { supabase } from './supabase.js';

// Vérifier si déjà connecté
checkIfLoggedIn();

async function checkIfLoggedIn() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        window.location.href = 'dashboard.html';
    }
}

// Afficher le formulaire de signup si paramètre dans l'URL
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('signup') === 'true') {
        showSignup();
    }
});

// Basculer entre login et signup
window.showSignup = function() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signupForm').style.display = 'block';
};

window.showLogin = function() {
    document.getElementById('signupForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
};

// Gestion du formulaire de connexion
document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
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

// Gestion du formulaire d'inscription
document.getElementById('signupFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('signupName').value;
    const company = document.getElementById('signupCompany').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    if (password.length < 6) {
        showMessage('Le mot de passe doit contenir au moins 6 caractères', 'error');
        return;
    }
    
    showMessage('Création du compte...', 'info');
    
    // Créer l'utilisateur
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                full_name: name,
                company: company
            }
        }
    });
    
    if (error) {
        showMessage('Erreur: ' + error.message, 'error');
        return;
    }
    
    // Mettre à jour le profil avec les infos supplémentaires
    if (data.user) {
        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                full_name: name,
                company: company
            })
            .eq('id', data.user.id);
        
        if (profileError) {
            console.error('Erreur mise à jour profil:', profileError);
        }
    }
    
    showMessage('Compte créé avec succès! Redirection...', 'success');
    setTimeout(() => {
        window.location.href = 'dashboard.html';
    }, 1500);
});

// Fonction pour afficher des messages
function showMessage(text, type) {
    const messageDiv = document.getElementById('authMessage');
    messageDiv.textContent = text;
    messageDiv.className = 'message ' + type;
    messageDiv.style.display = 'block';
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
}
