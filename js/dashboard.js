import { supabase, checkAuth } from './supabase.js';

let currentUser = null;
let allMaterials = [];
let currentFilter = 'all';
let materialToExit = null;

// Vérification de l'authentification
async function init() {
    currentUser = await checkAuth();
    if (!currentUser) {
        window.location.href = 'auth.html';
        return;
    }
    
    document.getElementById('userName').textContent = currentUser.email;
    
    // Afficher le bouton d'ajout seulement pour les admins
    if (currentUser.user_metadata?.role === 'admin') {
        document.getElementById('addMaterialBtn').style.display = 'block';
        document.getElementById('clientsCard').style.display = 'flex';
    }
    
    loadMaterials();
    loadClients();
    setupEventListeners();
}

// Charger les matériaux
async function loadMaterials() {
    try {
        const { data, error } = await supabase
            .from('materials')
            .select(`
                *,
                profiles (
                    company_name
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allMaterials = data || [];
        displayMaterials();
        updateStats();
    } catch (error) {
        console.error('Erreur:', error);
        showMessage('Erreur lors du chargement des données', 'error');
    }
}

// Afficher les matériaux avec filtres
function displayMaterials() {
    const container = document.getElementById('materialsList');
    
    // Filtrer selon le statut
    let filteredMaterials = allMaterials;
    
    if (currentFilter === 'in_stock') {
        filteredMaterials = allMaterials.filter(m => !m.exit_date);
    } else if (currentFilter === 'exited') {
        filteredMaterials = allMaterials.filter(m => m.exit_date);
    }
    
    if (filteredMaterials.length === 0) {
        container.innerHTML = '<p class="no-data">Aucun matériel trouvé</p>';
        return;
    }
    
    container.innerHTML = filteredMaterials.map(material => `
        <div class="material-card ${material.exit_date ? 'exited' : ''}">
            <div class="material-header">
                <h3>${material.name}</h3>
                <span class="badge ${material.exit_date ? 'badge-exited' : 'badge-stock'}">
                    ${material.exit_date ? '📤 SORTI' : '✅ EN STOCK'}
                </span>
            </div>
            <p><strong>Référence:</strong> ${material.reference || 'N/A'}</p>
            <p><strong>Quantité:</strong> ${material.quantity}</p>
            ${material.profiles ? `<p><strong>Client:</strong> ${material.profiles.company_name}</p>` : ''}
            ${material.exit_date ? `<p><strong>Date de sortie:</strong> ${formatDate(material.exit_date)}</p>` : ''}
            
            <div class="material-actions">
                <button onclick="showDetails('${material.id}')" class="btn-secondary">
                    👁️ Détails
                </button>
                
                ${!material.exit_date && currentUser.user_metadata?.role === 'admin' ? `
                    <button onclick="showExitModal('${material.id}')" class="btn-primary">
                        📤 Sortie
                    </button>
                ` : ''}
                
                ${material.exit_date && currentUser.user_metadata?.role === 'admin' ? `
                    <button onclick="cancelExit('${material.id}')" class="btn-secondary">
                        ↩️ Annuler sortie
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Charger les clients
async function loadClients() {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'client')
            .order('company_name');

        if (error) throw error;

        document.getElementById('clientsCount').textContent = data?.length || 0;
    } catch (error) {
        console.error('Erreur chargement clients:', error);
    }
}

// Mettre à jour les statistiques
function updateStats() {
    const inStock = allMaterials.filter(m => !m.exit_date).length;
    const exited = allMaterials.filter(m => m.exit_date).length;
    
    document.getElementById('totalMaterials').textContent = allMaterials.length;
    document.getElementById('materialsInStock').textContent = inStock;
    document.getElementById('materialsExited').textContent = exited;
}

// Configuration des écouteurs d'événements
function setupEventListeners() {
    // Boutons de filtre
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            displayMaterials();
        });
    });
    
    // Modale de sortie
    document.querySelector('.close').addEventListener('click', closeExitModal);
    document.getElementById('cancelExit').addEventListener('click', closeExitModal);
    document.getElementById('confirmExit').addEventListener('click', confirmMaterialExit);
    
    // Fermer modale en cliquant à l'extérieur
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('exitModal');
        if (event.target === modal) {
            closeExitModal();
        }
        
        const detailsModal = document.getElementById('detailsModal');
        if (event.target === detailsModal) {
            closeDetailsModal();
        }
    });
}

// Afficher la modale de sortie
window.showExitModal = function(materialId) {
    materialToExit = materialId;
    document.getElementById('exitDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('exitModal').style.display = 'block';
};

// Fermer la modale de sortie
function closeExitModal() {
    document.getElementById('exitModal').style.display = 'none';
    materialToExit = null;
}

// Confirmer la sortie du matériel
async function confirmMaterialExit() {
    if (!materialToExit) return;
    
    const exitDate = document.getElementById('exitDate').value;
    
    if (!exitDate) {
        showMessage('Veuillez sélectionner une date', 'error');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('materials')
            .update({ 
                exit_date: exitDate,
                updated_at: new Date().toISOString()
            })
            .eq('id', materialToExit);

        if (error) throw error;

        showMessage('Sortie enregistrée avec succès', 'success');
        closeExitModal();
        loadMaterials();
    } catch (error) {
        console.error('Erreur:', error);
        showMessage('Erreur lors de l\'enregistrement de la sortie', 'error');
    }
}

// Annuler la sortie d'un matériel
window.cancelExit = async function(materialId) {
    if (!confirm('Voulez-vous vraiment annuler cette sortie ?')) return;
    
    try {
        const { error } = await supabase
            .from('materials')
            .update({ 
                exit_date: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', materialId);

        if (error) throw error;

        showMessage('Sortie annulée avec succès', 'success');
        loadMaterials();
    } catch (error) {
        console.error('Erreur:', error);
        showMessage('Erreur lors de l\'annulation', 'error');
    }
};

// Afficher les détails d'un matériel
window.showDetails = function(materialId) {
    const material = allMaterials.find(m => m.id === materialId);
    if (!material) return;
    
    document.getElementById('detailsContent').innerHTML = `
        <h2>${material.name}</h2>
        <div class="details-grid">
            <p><strong>Référence:</strong> ${material.reference || 'N/A'}</p>
            <p><strong>Quantité:</strong> ${material.quantity}</p>
            <p><strong>Statut:</strong> ${material.exit_date ? '📤 Sorti' : '✅ En stock'}</p>
            <p><strong>Date d'ajout:</strong> ${formatDate(material.created_at)}</p>
            ${material.exit_date ? `<p><strong>Date de sortie:</strong> ${formatDate(material.exit_date)}</p>` : ''}
            ${material.profiles ? `<p><strong>Client:</strong> ${material.profiles.company_name}</p>` : ''}
            ${material.notes ? `<p><strong>Notes:</strong> ${material.notes}</p>` : ''}
        </div>
    `;
    
    document.getElementById('detailsModal').style.display = 'block';
};

window.closeDetailsModal = function() {
    document.getElementById('detailsModal').style.display = 'none';
};

// Déconnexion
window.logout = async function() {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
};

// Formatage de date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR');
}

// Afficher un message
function showMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    document.querySelector('.dashboard-content').prepend(messageDiv);
    
    setTimeout(() => messageDiv.remove(), 5000);
}

// Initialiser au chargement
init();
