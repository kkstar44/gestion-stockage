import { supabase, checkAuth, getUserProfile } from './supabase.js';

let currentUser = null;
let userProfile = null;
let allMaterials = [];
let currentFilter = 'all';
let materialToExit = null;

// Initialisation
init();

async function init() {
    // Vérifier l'authentification
    const session = await checkAuth();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = session.user;
    
    // Charger le profil utilisateur
    userProfile = await getUserProfile(currentUser.id);
    if (!userProfile) {
        alert('Erreur de chargement du profil');
        return;
    }
    
    // Afficher le nom de l'utilisateur
    document.getElementById('userName').textContent = 
        userProfile.full_name || userProfile.email;
    
    // Configurer l'interface selon le rôle
    setupUIForRole();
    
    // Charger les données
    await loadMaterials();
    await updateStats();
    
    // Configurer les événements
    setupEventListeners();
    
    // Écouter les changements en temps réel
    subscribeToChanges();
}

// Configuration de l'UI selon le rôle
function setupUIForRole() {
    const isAdmin = userProfile.role === 'admin';
    const addBtn = document.getElementById('addMaterialBtn');
    const clientsCard = document.getElementById('clientsCard');
    const clientSelectGroup = document.getElementById('clientSelectGroup');
    
    if (isAdmin) {
        addBtn.style.display = 'block';
        clientsCard.style.display = 'block';
        clientSelectGroup.style.display = 'block';
        loadClients(); // Charger la liste des clients
    } else {
        addBtn.style.display = 'none';
        clientsCard.style.display = 'none';
        clientSelectGroup.style.display = 'none';
    }
}

// Charger les matières premières
async function loadMaterials() {
    let query = supabase
        .from('materials')
        .select(`
            *,
            profiles:client_id(full_name, company_name, email)
        `)
        .order('reception_date', { ascending: false });
    
    // Les clients ne voient que leurs propres matières
    if (userProfile.role === 'client') {
        query = query.eq('client_id', currentUser.id);
    }
    
    const { data, error } = await query;
    
    if (error) {
        console.error('Erreur chargement:', error);
        document.getElementById('materialsList').innerHTML = 
            '<p class="error">Erreur de chargement des données</p>';
        return;
    }
    
    allMaterials = data || [];
    displayMaterials(allMaterials);
}

// Afficher les matières
function displayMaterials(materials) {
    const container = document.getElementById('materialsList');
    
    if (materials.length === 0) {
        container.innerHTML = '<p class="loading">Aucune matière première enregistrée</p>';
        return;
    }
    
    container.innerHTML = materials.map(material => `
        <div class="material-card ${material.exit_date ? 'exited' : ''}">
            ${material.exit_date ? '<span class="exit-badge">📤 SORTI</span>' : ''}
            <div class="material-info">
                <h3>${material.material_name}</h3>
                <div class="material-details">
                    <div class="material-detail">
                        <strong>Type:</strong> ${material.material_type}
                    </div>
                    <div class="material-detail">
                        <strong>Quantité:</strong> ${material.quantity} ${material.unit}
                    </div>
                    <div class="material-detail">
                        <strong>Emplacement:</strong> ${material.storage_location}
                    </div>
                    <div class="material-detail">
                        <strong>Date:</strong> ${formatDate(material.reception_date)}
                    </div>
                    ${material.exit_date ? `
                        <div class="material-detail">
                            <strong>Date de sortie:</strong> ${formatDate(material.exit_date)}
                        </div>
                    ` : ''}
                    ${material.estimated_value ? `
                        <div class="material-detail">
                            <strong>Valeur:</strong> ${material.estimated_value} €
                        </div>
                    ` : ''}
                    ${userProfile.role === 'admin' && material.profiles ? `
                        <div class="material-detail">
                            <strong>Client:</strong> ${material.profiles.company_name || material.profiles.full_name}
                        </div>
                    ` : ''}
                </div>
            </div>
            <div class="material-actions">
                <button class="btn btn-sm btn-primary" onclick="viewDetails('${material.id}')">
                    👁️ Détails
                </button>
                ${!material.exit_date ? `
                    <button class="btn btn-sm btn-warning" onclick="confirmExit('${material.id}')">
                        📤 Sortir
                    </button>
                ` : `
                    <button class="btn btn-sm btn-success" onclick="cancelExit('${material.id}')">
                        ↩️ Annuler
                    </button>
                `}
                ${userProfile.role === 'admin' ? `
                    <button class="btn btn-sm btn-secondary" onclick="editMaterial('${material.id}')">
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMaterial('${material.id}')">
                        🗑️
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Mettre à jour les statistiques
async function updateStats() {
    const totalItems = allMaterials.length;
    const totalValue = allMaterials.reduce((sum, m) => 
        sum + (parseFloat(m.estimated_value) || 0), 0
    );
    
    // Compter les articles sortis
    const exitedItems = allMaterials.filter(m => m.exit_date !== null).length;
    
    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('totalValue').textContent = 
        totalValue.toLocaleString('fr-FR') + ' €';
    document.getElementById('exitedItems').textContent = exitedItems;
    
    // Compter les clients (admin uniquement)
    if (userProfile.role === 'admin') {
        const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'client');
        
        document.getElementById('totalClients').textContent = count || 0;
    }
}

// Charger la liste des clients (admin uniquement)
async function loadClients() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'client')
        .order('company_name');
    
    if (error) {
        console.error('Erreur chargement clients:', error);
        return;
    }
    
    const select = document.getElementById('clientSelect');
    select.innerHTML = '<option value="">Sélectionner un client</option>' +
        data.map(client => 
            `<option value="${client.id}">${client.company_name || client.full_name}</option>`
        ).join('');
}

// Configuration des événements
function setupEventListeners() {
    // Bouton ajouter
    document.getElementById('addMaterialBtn').addEventListener('click', openModal);
    
    // Fermer les modals
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    
    // Soumettre le formulaire
    document.getElementById('materialForm').addEventListener('submit', handleFormSubmit);
    
    // Fermer en cliquant en dehors
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
    
    // Filtres de statut
    document.getElementById('filterAll').addEventListener('click', () => filterByStatus('all'));
    document.getElementById('filterInStock').addEventListener('click', () => filterByStatus('in_stock'));
    document.getElementById('filterExited').addEventListener('click', () => filterByStatus('exited'));
}

// Ouvrir le modal d'ajout/modification
function openModal(materialId = null) {
    const modal = document.getElementById('materialModal');
    const form = document.getElementById('materialForm');
    const title = document.getElementById('modalTitle');
    
    form.reset();
    
    if (materialId) {
        title.textContent = '✏️ Modifier une matière première';
        const material = allMaterials.find(m => m.id === materialId);
        if (material) {
            document.getElementById('materialId').value = material.id;
            document.getElementById('materialName').value = material.material_name;
            document.getElementById('materialType').value = material.material_type;
            document.getElementById('quantity').value = material.quantity;
            document.getElementById('unit').value = material.unit;
            document.getElementById('storageLocation').value = material.storage_location;
            document.getElementById('receptionDate').value = material.reception_date;
            document.getElementById('certificateNumber').value = material.certificate_number || '';
            document.getElementById('estimatedValue').value = material.estimated_value || '';
            document.getElementById('notes').value = material.notes || '';
            
            if (userProfile.role === 'admin') {
                document.getElementById('clientSelect').value = material.client_id || '';
            }
        }
    } else {
        title.textContent = '➕ Ajouter une matière première';
        document.getElementById('materialId').value = '';
    }
    
    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('materialModal').style.display = 'none';
}

// Modifier une matière
window.editMaterial = function(id) {
    openModal(id);
};

// Soumettre le formulaire
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const materialId = document.getElementById('materialId').value;
    const materialData = {
        material_name: document.getElementById('materialName').value,
        material_type: document.getElementById('materialType').value,
        quantity: parseFloat(document.getElementById('quantity').value),
        unit: document.getElementById('unit').value,
        storage_location: document.getElementById('storageLocation').value,
        reception_date: document.getElementById('receptionDate').value,
        certificate_number: document.getElementById('certificateNumber').value || null,
        estimated_value: parseFloat(document.getElementById('estimatedValue').value) || null,
        notes: document.getElementById('notes').value || null,
        updated_at: new Date().toISOString()
    };
    
    // Admin peut assigner un client
    if (userProfile.role === 'admin') {
        const clientId = document.getElementById('clientSelect').value;
        materialData.client_id = clientId || null;
    }
    
    let result;
    
    if (materialId) {
        // Mise à jour
        result = await supabase
            .from('materials')
            .update(materialData)
            .eq('id', materialId)
            .select();
    } else {
        // Création
        if (userProfile.role === 'client') {
            materialData.client_id = currentUser.id;
        }
        
        result = await supabase
            .from('materials')
            .insert([materialData])
            .select();
    }
    
    if (result.error) {
        console.error('Erreur complète:', result.error);
        alert('Erreur: ' + result.error.message);
        return;
    }
    
    console.log('Matériau enregistré:', result.data);
    
    closeModal();
    
    // Attendre un peu avant de recharger
    setTimeout(async () => {
        await loadMaterials();
        await updateStats();
    }, 500);
}

// Supprimer une matière
window.deleteMaterial = async function(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette matière première ?')) {
        return;
    }
    
    const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', id);
    
    if (error) {
        alert('Erreur de suppression: ' + error.message);
        return;
    }
    
    await loadMaterials();
    await updateStats();
};

// Voir les détails
window.viewDetails = function(id) {
    const material = allMaterials.find(m => m.id === id);
    if (!material) return;
    
    const detailsHTML = `
        <h2>📦 ${material.material_name}</h2>
        <div class="material-details" style="grid-template-columns: 1fr; gap: 1rem; margin-top: 1.5rem;">
            <div><strong>Type:</strong> ${material.material_type}</div>
            <div><strong>Quantité:</strong> ${material.quantity} ${material.unit}</div>
            <div><strong>Emplacement:</strong> ${material.storage_location}</div>
            <div><strong>Date de réception:</strong> ${formatDate(material.reception_date)}</div>
            ${material.certificate_number ? `<div><strong>N° Certificat:</strong> ${material.certificate_number}</div>` : ''}
            ${material.estimated_value ? `<div><strong>Valeur estimée:</strong> ${material.estimated_value} €</div>` : ''}
            ${material.exit_date ? `<div><strong>Date de sortie:</strong> ${formatDate(material.exit_date)}</div>` : ''}
            ${material.notes ? `<div><strong>Notes:</strong><br>${material.notes}</div>` : ''}
            ${userProfile.role === 'admin' && material.profiles ? `
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
                    <strong>Client:</strong><br>
                    ${material.profiles.company_name || material.profiles.full_name}<br>
                    ${material.profiles.email}
                </div>
            ` : ''}
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--text-light); font-size: 0.875rem;">
                Créé le: ${formatDateTime(material.created_at)}
            </div>
        </div>
    `;
    
    document.getElementById('detailsContent').innerHTML = detailsHTML;
    document.getElementById('detailsModal').style.display = 'block';
};

window.closeDetailsModal = function() {
    document.getElementById('detailsModal').style.display = 'none';
};

// Filtrer par statut
function filterByStatus(status) {
    currentFilter = status;
    
    // Mettre à jour les boutons actifs
    document.querySelectorAll('.filter-buttons button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (status === 'all') {
        document.getElementById('filterAll').classList.add('active');
    } else if (status === 'in_stock') {
        document.getElementById('filterInStock').classList.add('active');
    } else if (status === 'exited') {
        document.getElementById('filterExited').classList.add('active');
    }
    
    let filtered = allMaterials;
    if (status === 'in_stock') {
        filtered = allMaterials.filter(m => !m.exit_date);
    } else if (status === 'exited') {
        filtered = allMaterials.filter(m => m.exit_date);
    }
    
    displayMaterials(filtered);
}

// Confirmer la sortie
window.confirmExit = function(id) {
    materialToExit = allMaterials.find(m => m.id === id);
    if (!materialToExit) return;
    
    document.getElementById('exitMaterialName').textContent = materialToExit.material_name;
    document.getElementById('exitModal').style.display = 'block';
};

window.closeExitModal = function() {
    document.getElementById('exitModal').style.display = 'none';
    materialToExit = null;
};

// Effectuer la sortie
window.performExit = async function() {
    if (!materialToExit) return;
    
    const { error } = await supabase
        .from('materials')
        .update({ 
            exit_date: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', materialToExit.id);
    
    if (error) {
        alert('Erreur lors de la sortie: ' + error.message);
        return;
    }
    
    closeExitModal();
    await loadMaterials();
    await updateStats();
};

// Annuler une sortie
window.cancelExit = async function(id) {
    if (!confirm('Voulez-vous vraiment annuler cette sortie ?')) return;
    
    const { error } = await supabase
        .from('materials')
        .update({ 
            exit_date: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    await loadMaterials();
    await updateStats();
};

// Écouter les changements en temps réel
function subscribeToChanges() {
    supabase
        .channel('materials_changes')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'materials' },
            async (payload) => {
                console.log('Changement détecté:', payload);
                await loadMaterials();
                await updateStats();
            }
        )
        .subscribe();
}

// Déconnexion
window.logout = async function() {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
};

// Utilitaires
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('fr-FR');
}

function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('fr-FR');
}
