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
                clients (
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
    
    // Filtrer selon la recherche
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    if (searchTerm) {
        filteredMaterials = filteredMaterials.filter(material => 
            material.material_name?.toLowerCase().includes(searchTerm) ||
            material.material_type?.toLowerCase().includes(searchTerm) ||
            material.supplier?.toLowerCase().includes(searchTerm) ||
            material.storage_location?.toLowerCase().includes(searchTerm)
        );
    }

    if (filteredMaterials.length === 0) {
        container.innerHTML = '<p class="loading">Aucun matériau trouvé</p>';
        return;
    }

    container.innerHTML = filteredMaterials.map(material => {
        const isExited = !!material.exit_date;
        const exitedClass = isExited ? 'exited' : '';
        const statusBadge = isExited 
            ? '<span class="status-badge exited">📤 SORTI</span>'
            : '<span class="status-badge in-stock">✅ EN STOCK</span>';
        
        const exitDateDisplay = isExited 
            ? `<div class="exit-date">📤 Sorti le: ${formatDate(material.exit_date)}</div>`
            : '';

        // Boutons selon le rôle et le statut
        let actionButtons = '';
        if (currentUser.user_metadata?.role === 'admin') {
            if (!isExited) {
                actionButtons = `
                    <button onclick="editMaterial(${material.id})" class="btn btn-secondary btn-sm">✏️ Modifier</button>
                    <button onclick="openExitModal(${material.id})" class="btn btn-warning btn-sm">📤 Sortie</button>
                    <button onclick="deleteMaterial(${material.id})" class="btn btn-danger btn-sm">🗑️ Supprimer</button>
                `;
            } else {
                actionButtons = `
                    <button onclick="cancelExit(${material.id})" class="btn btn-success btn-sm">↩️ Annuler sortie</button>
                    <button onclick="deleteMaterial(${material.id})" class="btn btn-danger btn-sm">🗑️ Supprimer</button>
                `;
            }
        }

        actionButtons += `<button onclick="viewDetails(${material.id})" class="btn btn-primary btn-sm">👁️ Détails</button>`;

        return `
            <div class="material-card ${exitedClass}">
                <div class="material-info">
                    ${statusBadge}
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
                            <strong>Fournisseur:</strong> ${material.supplier}
                        </div>
                        ${material.clients ? `
                            <div class="material-detail">
                                <strong>Client:</strong> ${material.clients.company_name}
                            </div>
                        ` : ''}
                        <div class="material-detail">
                            <strong>Réception:</strong> ${formatDate(material.reception_date)}
                        </div>
                    </div>
                    ${exitDateDisplay}
                </div>
                <div class="material-actions">
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
}

// Mettre à jour les statistiques
function updateStats() {
    const inStockMaterials = allMaterials.filter(m => !m.exit_date);
    const exitedMaterials = allMaterials.filter(m => m.exit_date);
    
    document.getElementById('totalItems').textContent = inStockMaterials.length;
    document.getElementById('totalExited').textContent = exitedMaterials.length;
    
    const totalValue = inStockMaterials.reduce((sum, m) => sum + (parseFloat(m.estimated_value) || 0), 0);
    document.getElementById('totalValue').textContent = totalValue.toFixed(2) + ' €';
}

// Ouvrir le modal de sortie
window.openExitModal = function(materialId) {
    materialToExit = allMaterials.find(m => m.id === materialId);
    if (!materialToExit) return;
    
    document.getElementById('exitMessage').textContent = 
        `Voulez-vous vraiment enregistrer la sortie de "${materialToExit.material_name}" ?`;
    
    // Pré-remplir avec la date du jour
    document.getElementById('exitDate').valueAsDate = new Date();
    
    document.getElementById('exitModal').style.display = 'block';
};

// Fermer le modal de sortie
window.closeExitModal = function() {
    document.getElementById('exitModal').style.display = 'none';
    materialToExit = null;
};

// Confirmer la sortie
window.confirmExit = async function() {
    if (!materialToExit) return;
    
    const exitDate = document.getElementById('exitDate').value;
    if (!exitDate) {
        alert('Veuillez sélectionner une date de sortie');
        return;
    }
    
    try {
        const { error } = await supabase
            .from('materials')
            .update({ exit_date: exitDate })
            .eq('id', materialToExit.id);
        
        if (error) throw error;
        
        showMessage('✅ Sortie enregistrée avec succès !', 'success');
        closeExitModal();
        loadMaterials();
    } catch (error) {
        console.error('Erreur:', error);
        showMessage('❌ Erreur lors de l\'enregistrement de la sortie', 'error');
    }
};

// Annuler une sortie
window.cancelExit = async function(materialId) {
    if (!confirm('Voulez-vous vraiment annuler la sortie de ce matériau ?')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('materials')
            .update({ exit_date: null })
            .eq('id', materialId);
        
        if (error) throw error;
        
        showMessage('✅ Sortie annulée avec succès !', 'success');
        loadMaterials();
    } catch (error) {
        console.error('Erreur:', error);
        showMessage('❌ Erreur lors de l\'annulation', 'error');
    }
};

// Charger les clients
async function loadClients() {
    if (currentUser.user_metadata?.role !== 'admin') return;
    
    try {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('company_name');

        if (error) throw error;

        const select = document.getElementById('clientSelect');
        select.innerHTML = '<option value="">Sélectionner un client...</option>' +
            (data || []).map(client => 
                `<option value="${client.id}">${client.company_name}</option>`
            ).join('');

        // Mettre à jour les stats clients
        document.getElementById('totalClients').textContent = (data || []).length;
    } catch (error) {
        console.error('Erreur:', error);
    }
}

// Configuration des événements
function setupEventListeners() {
    // Recherche
    document.getElementById('searchInput').addEventListener('input', displayMaterials);
    
    // Filtres
    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.filter;
            displayMaterials();
        });
    });
    
    // Bouton d'ajout
    const addBtn = document.getElementById('addMaterialBtn');
    if (addBtn) {
        addBtn.addEventListener('click', openAddModal);
    }
    
    // Formulaire
    document.getElementById('materialForm').addEventListener('submit', handleSubmit);
    
    // Fermeture des modals
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
    
    // Fermeture en cliquant en dehors
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

// Ouvrir le modal d'ajout
function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Ajouter une matière première';
    document.getElementById('materialForm').reset();
    document.getElementById('materialForm').dataset.editId = '';
    document.getElementById('clientSelectGroup').style.display = 'block';
    document.getElementById('materialModal').style.display = 'block';
}

// Éditer un matériau
window.editMaterial = async function(materialId) {
    const material = allMaterials.find(m => m.id === materialId);
    if (!material) return;
    
    document.getElementById('modalTitle').textContent = 'Modifier la matière première';
    document.getElementById('materialForm').dataset.editId = materialId;
    
    // Remplir le formulaire
    document.getElementById('materialName').value = material.material_name || '';
    document.getElementById('materialType').value = material.material_type || '';
    document.getElementById('quantity').value = material.quantity || '';
    document.getElementById('unit').value = material.unit || '';
    document.getElementById('supplier').value = material.supplier || '';
    document.getElementById('storageLocation').value = material.storage_location || '';
    document.getElementById('receptionDate').value = material.reception_date || '';
    document.getElementById('certificateNumber').value = material.certificate_number || '';
    document.getElementById('estimatedValue').value = material.estimated_value || '';
    document.getElementById('notes').value = material.notes || '';
    
    if (material.client_id) {
        document.getElementById('clientSelect').value = material.client_id;
        document.getElementById('clientSelectGroup').style.display = 'block';
    }
    
    document.getElementById('materialModal').style.display = 'block';
};

// Fermer le modal
window.closeModal = function() {
    document.getElementById('materialModal').style.display = 'none';
};

// Soumettre le formulaire
async function handleSubmit(e) {
    e.preventDefault();
    
    const formData = {
        material_name: document.getElementById('materialName').value,
        material_type: document.getElementById('materialType').value,
        quantity: parseFloat(document.getElementById('quantity').value),
        unit: document.getElementById('unit').value,
        supplier: document.getElementById('supplier').value,
        storage_location: document.getElementById('storageLocation').value,
        reception_date: document.getElementById('receptionDate').value,
        certificate_number: document.getElementById('certificateNumber').value,
        estimated_value: parseFloat(document.getElementById('estimatedValue').value) || 0,
        notes: document.getElementById('notes').value,
        client_id: document.getElementById('clientSelect').value || null
    };
    
    const editId = document.getElementById('materialForm').dataset.editId;
    
    try {
        if (editId) {
            const { error } = await supabase
                .from('materials')
                .update(formData)
                .eq('id', editId);
            
            if (error) throw error;
            showMessage('✅ Matériau modifié avec succès !', 'success');
        } else {
            const { error } = await supabase
                .from('materials')
                .insert([formData]);
            
            if (error) throw error;
            showMessage('✅ Matériau ajouté avec succès !', 'success');
        }
        
        closeModal();
        loadMaterials();
    } catch (error) {
        console.error('Erreur:', error);
        showMessage('❌ Erreur lors de l\'enregistrement', 'error');
    }
}

// Supprimer un matériau
window.deleteMaterial = async function(materialId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce matériau ?')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('materials')
            .delete()
            .eq('id', materialId);
        
        if (error) throw error;
        
        showMessage('✅ Matériau supprimé avec succès !', 'success');
        loadMaterials();
    } catch (error) {
        console.error('Erreur:', error);
        showMessage('❌ Erreur lors de la suppression', 'error');
    }
};

// Voir les détails
window.viewDetails = function(materialId) {
    const material = allMaterials.find(m => m.id === materialId);
    if (!material) return;
    
    const isExited = !!material.exit_date;
    const statusBadge = isExited 
        ? '<span class="status-badge exited">📤 SORTI</span>'
        : '<span class="status-badge in-stock">✅ EN STOCK</span>';
    
    const exitInfo = isExited 
        ? `<p><strong>Date de sortie:</strong> ${formatDate(material.exit_date)}</p>`
        : '';
    
    document.getElementById('detailsContent').innerHTML = `
        <h2>${material.material_name} ${statusBadge}</h2>
        <div style="margin-top: 2rem;">
            <p><strong>Type:</strong> ${material.material_type}</p>
            <p><strong>Quantité:</strong> ${material.quantity} ${material.unit}</p>
            <p><strong>Fournisseur:</strong> ${material.supplier}</p>
            <p><strong>Emplacement:</strong> ${material.storage_location}</p>
            <p><strong>Date de réception:</strong> ${formatDate(material.reception_date)}</p>
            ${exitInfo}
            ${material.certificate_number ? `<p><strong>N° certificat:</strong> ${material.certificate_number}</p>` : ''}
            ${material.estimated_value ? `<p><strong>Valeur estimée:</strong> ${material.estimated_value} €</p>` : ''}
            ${material.clients ? `<p><strong>Client:</strong> ${material.clients.company_name}</p>` : ''}
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
