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
        loadClients();
    } else {
        addBtn.style.display = 'none';
        clientsCard.style.display = 'none';
        clientSelectGroup.style.display = 'none';
    }
}

// Charger les matériaux
async function loadMaterials() {
    try {
        let query = supabase
            .from('materials')
            .select(`
                *,
                clients (
                    company_name
                )
            `)
            .order('created_at', { ascending: false });

        const { data, error } = await query;

        if (error) throw error;

        allMaterials = data || [];
        displayMaterials(allMaterials);
        
    } catch (error) {
        console.error('Erreur:', error);
        document.getElementById('materialsList').innerHTML = 
            `<p class="error">Erreur de chargement: ${error.message}</p>`;
    }
}

// Afficher les matériaux
function displayMaterials(materials) {
    const container = document.getElementById('materialsList');
    
    if (!materials || materials.length === 0) {
        container.innerHTML = '<p class="no-data">Aucun matériau trouvé</p>';
        return;
    }

    // Filtrer selon le statut
    let filteredMaterials = materials;
    if (currentFilter === 'in_stock') {
        filteredMaterials = materials.filter(m => !m.exit_date);
    } else if (currentFilter === 'exited') {
        filteredMaterials = materials.filter(m => m.exit_date);
    }

    if (filteredMaterials.length === 0) {
        container.innerHTML = '<p class="no-data">Aucun matériau trouvé pour ce filtre</p>';
        return;
    }

    container.innerHTML = filteredMaterials.map(material => {
        const isAdmin = userProfile.role === 'admin';
        const isExited = material.exit_date;
        const clientName = material.clients?.company_name || 'N/A';
        
        return `
            <div class="material-card ${isExited ? 'exited' : ''}">
                <div class="material-header">
                    <h3>${material.material_name}</h3>
                    ${isExited ? '<span class="badge badge-exited">SORTI</span>' : '<span class="badge badge-stock">EN STOCK</span>'}
                </div>
                <div class="material-body">
                    <p><strong>Type:</strong> ${material.material_type}</p>
                    <p><strong>Quantité:</strong> ${material.quantity} ${material.unit}</p>
                    <p><strong>Emplacement:</strong> ${material.storage_location}</p>
                    <p><strong>Date réception:</strong> ${formatDate(material.reception_date)}</p>
                    ${isAdmin ? `<p><strong>Client:</strong> ${clientName}</p>` : ''}
                    ${material.estimated_value ? `<p><strong>Valeur:</strong> ${material.estimated_value} €</p>` : ''}
                    ${isExited ? `<p><strong>Date sortie:</strong> ${formatDate(material.exit_date)}</p>` : ''}
                </div>
                <div class="material-actions">
                    <button onclick="viewDetails('${material.id}')" class="btn btn-info btn-sm">
                        👁️ Détails
                    </button>
                    ${isAdmin && !isExited ? `
                        <button onclick="editMaterial('${material.id}')" class="btn btn-primary btn-sm">
                            ✏️ Éditer
                        </button>
                        <button onclick="openExitModal('${material.id}')" class="btn btn-warning btn-sm">
                            📤 Sortir
                        </button>
                        <button onclick="deleteMaterial('${material.id}')" class="btn btn-danger btn-sm">
                            🗑️ Supprimer
                        </button>
                    ` : ''}
                    ${isAdmin && isExited ? `
                        <button onclick="cancelExit('${material.id}')" class="btn btn-secondary btn-sm">
                            ↩️ Annuler sortie
                        </button>
                        <button onclick="deleteMaterial('${material.id}')" class="btn btn-danger btn-sm">
                            🗑️ Supprimer
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Mettre à jour les statistiques
async function updateStats() {
    const inStock = allMaterials.filter(m => !m.exit_date);
    const exited = allMaterials.filter(m => m.exit_date);
    const totalValue = inStock.reduce((sum, m) => sum + (parseFloat(m.estimated_value) || 0), 0);
    
    document.getElementById('totalItems').textContent = inStock.length;
    document.getElementById('exitedItems').textContent = exited.length;
    document.getElementById('totalValue').textContent = totalValue.toFixed(2) + ' €';
}

// Charger les clients
async function loadClients() {
    try {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('company_name');

        if (error) throw error;

        const select = document.getElementById('clientSelect');
        select.innerHTML = '<option value="">Sélectionner un client...</option>';
        
        data.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.company_name;
            select.appendChild(option);
        });

        document.getElementById('totalClients').textContent = data.length;
        
    } catch (error) {
        console.error('Erreur chargement clients:', error);
    }
}

// Configuration des événements
function setupEventListeners() {
    // Bouton d'ajout
    const addBtn = document.getElementById('addMaterialBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => openModal());
    }

    // Recherche
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filtered = allMaterials.filter(m => 
                m.material_name.toLowerCase().includes(searchTerm) ||
                m.material_type.toLowerCase().includes(searchTerm) ||
                m.storage_location.toLowerCase().includes(searchTerm)
            );
            displayMaterials(filtered);
        });
    }

    // Formulaire
    const form = document.getElementById('materialForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Fermeture des modals
    const closeButtons = document.querySelectorAll('.modal .close');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal();
            closeExitModal();
            closeDetailsModal();
        });
    });

    // Clic en dehors du modal
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeModal();
            closeExitModal();
            closeDetailsModal();
        }
    });
}

// Filtrer par statut
window.filterByStatus = function(status) {
    currentFilter = status;
    
    // Mettre à jour l'UI des boutons
    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    displayMaterials(allMaterials);
};

// Ouvrir le modal d'ajout/édition
function openModal(material = null) {
    const modal = document.getElementById('materialModal');
    const form = document.getElementById('materialForm');
    const title = document.getElementById('modalTitle');
    
    if (material) {
        title.textContent = 'Éditer la matière première';
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
    } else {
        title.textContent = 'Ajouter une matière première';
        form.reset();
        document.getElementById('materialId').value = '';
        document.getElementById('receptionDate').valueAsDate = new Date();
    }
    
    modal.style.display = 'block';
}

// Fermer le modal
window.closeModal = function() {
    document.getElementById('materialModal').style.display = 'none';
    document.getElementById('materialForm').reset();
};

// Soumettre le formulaire
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('materialId').value;
    const isAdmin = userProfile.role === 'admin';
    
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

    // Ajouter le client_id seulement si admin
    if (isAdmin) {
        const clientId = document.getElementById('clientSelect').value;
        if (!clientId) {
            alert('Veuillez sélectionner un client');
            return;
        }
        materialData.client_id = clientId;
    } else {
        // Pour les clients, utiliser leur propre ID
        materialData.client_id = userProfile.id;
    }

    try {
        let result;
        if (id) {
            // Mise à jour
            result = await supabase
                .from('materials')
                .update(materialData)
                .eq('id', id);
        } else {
            // Création
            materialData.created_at = new Date().toISOString();
            result = await supabase
                .from('materials')
                .insert([materialData]);
        }

        if (result.error) throw result.error;

        closeModal();
        await loadMaterials();
        await updateStats();
        
    } catch (error) {
        console.error('Erreur complète:', error);
        alert('Erreur: ' + error.message);
    }
}

// Éditer un matériau
window.editMaterial = async function(id) {
    const material = allMaterials.find(m => m.id === id);
    if (material) {
        openModal(material);
    }
};

// Supprimer un matériau
window.deleteMaterial = async function(id) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce matériau ?')) return;
    
    const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', id);
    
    if (error) {
        alert('Erreur: ' + error.message);
        return;
    }
    
    await loadMaterials();
    await updateStats();
};

// Voir les détails
window.viewDetails = function(id) {
    const material = allMaterials.find(m => m.id === id);
    if (!material) return;
    
    const clientName = material.clients?.company_name || 'N/A';
    const isExited = material.exit_date;
    
    const detailsHTML = `
        <h2>📦 ${material.material_name}</h2>
        <div class="details-grid">
            <div class="detail-item">
                <strong>Type:</strong>
                <span>${material.material_type}</span>
            </div>
            <div class="detail-item">
                <strong>Quantité:</strong>
                <span>${material.quantity} ${material.unit}</span>
            </div>
            <div class="detail-item">
                <strong>Emplacement:</strong>
                <span>${material.storage_location}</span>
            </div>
            <div class="detail-item">
                <strong>Date de réception:</strong>
                <span>${formatDate(material.reception_date)}</span>
            </div>
            ${material.certificate_number ? `
                <div class="detail-item">
                    <strong>N° Certificat:</strong>
                    <span>${material.certificate_number}</span>
                </div>
            ` : ''}
            ${material.estimated_value ? `
                <div class="detail-item">
                    <strong>Valeur estimée:</strong>
                    <span>${material.estimated_value} €</span>
                </div>
            ` : ''}
            ${userProfile.role === 'admin' ? `
                <div class="detail-item">
                    <strong>Client:</strong>
                    <span>${clientName}</span>
                </div>
            ` : ''}
            ${isExited ? `
                <div class="detail-item">
                    <strong>Date de sortie:</strong>
                    <span>${formatDate(material.exit_date)}</span>
                </div>
            ` : ''}
            ${material.notes ? `
                <div class="detail-item full-width">
                    <strong>Notes:</strong>
                    <span>${material.notes}</span>
                </div>
            ` : ''}
            <div class="detail-item">
                <strong>Créé le:</strong>
                <span>${formatDateTime(material.created_at)}</span>
            </div>
            <div class="detail-item">
                <strong>Modifié le:</strong>
                <span>${formatDateTime(material.updated_at)}</span>
            </div>
        </div>
    `;
    
    document.getElementById('detailsContent').innerHTML = detailsHTML;
    document.getElementById('detailsModal').style.display = 'block';
};

// Fermer le modal de détails
window.closeDetailsModal = function() {
    document.getElementById('detailsModal').style.display = 'none';
};

// Ouvrir le modal de sortie
window.openExitModal = function(id) {
    const material = allMaterials.find(m => m.id === id);
    if (!material) return;
    
    materialToExit = id;
    document.getElementById('exitMaterialName').textContent = material.material_name;
    document.getElementById('exitModal').style.display = 'block';
};

// Fermer le modal de sortie
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
            exit_date: new Date().toISOString().split('T')[0],
            updated_at: new Date().toISOString()
        })
        .eq('id', materialToExit);
    
    if (error) {
        alert('Erreur: ' + error.message);
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
