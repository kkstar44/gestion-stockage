import { SUPABASE_CONFIG } from './config.js';

// Initialisation de Supabase
const supabaseUrl = SUPABASE_CONFIG.url;
const supabaseKey = SUPABASE_CONFIG.anonKey;

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'VOTRE_SUPABASE_URL') {
    console.error('⚠️ Configuration Supabase manquante! Vérifiez js/config.js');
}

export const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

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
