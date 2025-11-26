import { SUPABASE_CONFIG } from './config.js';

// Initialisation de Supabase
const supabaseUrl = SUPABASE_CONFIG.url;
const supabaseKey = SUPABASE_CONFIG.anonKey;

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'VOTRE_SUPABASE_URL') {
    console.error('⚠️ Configuration Supabase manquante! Vérifiez js/config.js');
}

// Créer le client Supabase avec persistance en sessionStorage (pas localStorage)
// La session sera perdue à la fermeture du navigateur/onglet
export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        storageKey: 'gestion-stockage-auth',
        storage: window.sessionStorage // Utilise sessionStorage au lieu de localStorage
    }
});

// ========== GESTION DE L'INACTIVITÉ ==========
const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes en millisecondes
let inactivityTimer = null;

function resetInactivityTimer() {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }
    inactivityTimer = setTimeout(async () => {
        // Déconnecter l'utilisateur après inactivité
        console.log('Déconnexion pour inactivité');
        await supabase.auth.signOut();
        alert('Vous avez été déconnecté pour inactivité.');
        window.location.href = 'login.html';
    }, INACTIVITY_TIMEOUT);
}

// Écouter les événements d'activité utilisateur
function setupInactivityDetection() {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, { passive: true });
    });
    // Démarrer le timer
    resetInactivityTimer();
}

// Initialiser la détection d'inactivité si on est sur une page protégée
if (window.location.pathname.includes('dashboard')) {
    setupInactivityDetection();
}

// Fonction utilitaire pour vérifier l'authentification
export async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// Fonction utilitaire pour obtenir le profil utilisateur
export async function getUserProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (error) {
        console.error('Erreur profil:', error);
        return null;
    }
    
    return data;
}
