import { supabase, checkAuth, getUserProfile } from './supabase.js';

let currentUser = null;
let userProfile = null;
let allMaterials = [];

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

// Afficher les matières (exclut celles à quantité 0)
async function displayMaterials(materials, showArchived = false) {
    const container = document.getElementById('materialsList');
    
    // Filtrer selon le mode (stock actif ou archives)
    const filteredMaterials = showArchived 
        ? materials.filter(m => m.quantity <= 0)
        : materials.filter(m => m.quantity > 0);
    
    if (filteredMaterials.length === 0) {
        container.innerHTML = showArchived 
            ? '<p class="loading">Aucune matière épuisée</p>'
            : '<p class="loading">Aucune matière première en stock</p>';
        return;
    }
    
    // Pour les archives, récupérer les quantités initiales
    let initialQuantities = {};
    if (showArchived && filteredMaterials.length > 0) {
        const materialIds = filteredMaterials.map(m => m.id);
        const { data: movements } = await supabase
            .from('movements')
            .select('material_id, quantity')
            .in('material_id', materialIds)
            .eq('type', 'entree')
            .order('created_at', { ascending: true });
        
        if (movements) {
            // Prendre la première entrée (dépôt initial) pour chaque matière
            movements.forEach(m => {
                if (!initialQuantities[m.material_id]) {
                    initialQuantities[m.material_id] = m.quantity;
                }
            });
        }
    }
    
    container.innerHTML = filteredMaterials.map(material => {
        const displayQuantity = showArchived 
            ? (initialQuantities[material.id] || material.quantity)
            : material.quantity;
        const quantityLabel = showArchived ? 'Qté initiale' : 'Quantité';
        
        return `
        <div class="material-card ${showArchived ? 'archived' : ''}">
            <div class="material-info">
                <h3>${material.material_name} ${showArchived ? '<span style="color: var(--text-light); font-size: 0.8em;">(épuisé)</span>' : ''}</h3>
                <div class="material-details">
                    <div class="material-detail">
                        <strong>Type:</strong> ${material.material_type}
                    </div>
                    <div class="material-detail">
                        <strong>${quantityLabel}:</strong> ${displayQuantity} ${material.unit}
                    </div>
                    <div class="material-detail">
                        <strong>Emplacement:</strong> ${material.storage_location}
                    </div>
                    <div class="material-detail">
                        <strong>Date:</strong> ${formatDate(material.reception_date)}
                    </div>
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
                <button class="btn btn-sm btn-primary" onclick="viewDetails('${material.id}')" title="Voir détails">
                    👁️
                </button>
                <button class="btn btn-sm btn-secondary" onclick="viewHistory('${material.id}')" title="Historique">
                    📜
                </button>
                ${userProfile.role === 'admin' && !showArchived ? `
                    <button class="btn btn-sm btn-warning" onclick="openMovementModal('${material.id}', 'sortie')" title="Sortie stock">
                        📤
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="editMaterial('${material.id}')" title="Modifier">
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMaterial('${material.id}')" title="Supprimer">
                        🗑️
                    </button>
                ` : ''}
                ${userProfile.role === 'admin' && showArchived ? `
                    <button class="btn btn-sm btn-danger" onclick="deleteMaterial('${material.id}')" title="Supprimer définitivement">
                        🗑️
                    </button>
                ` : ''}
            </div>
        </div>
    `}).join('');
}

// Mettre à jour les statistiques (exclut les matières à quantité 0)
async function updateStats() {
    // Filtrer uniquement les matières en stock (quantité > 0)
    const activeMaterials = allMaterials.filter(m => m.quantity > 0);
    const archivedCount = allMaterials.filter(m => m.quantity <= 0).length;
    
    const totalItems = activeMaterials.length;
    const totalValue = activeMaterials.reduce((sum, m) => 
        sum + (parseFloat(m.estimated_value) || 0), 0
    );
    
    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('totalValue').textContent = 
        totalValue.toLocaleString('fr-FR') + ' €';
    
    // Mettre à jour le bouton archives s'il existe
    const archivesBtn = document.getElementById('archivesBtn');
    if (archivesBtn) {
        archivesBtn.textContent = `📁 Archives (${archivedCount})`;
    }
    
    // Compter les clients (admin uniquement)
    if (userProfile.role === 'admin') {
        const { count: clientCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'client');
        
        document.getElementById('totalClients').textContent = clientCount || 0;
        
        // Compter les admins
        const { count: adminCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'admin');
        
        document.getElementById('totalAdmins').textContent = adminCount || 0;
        document.getElementById('adminsCard').style.display = 'flex';
    }
}

// Charger la liste des clients (admin uniquement)
async function loadClients() {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, company_name, email')
        .eq('role', 'client')
        .order('full_name');
    
    if (error) {
        console.error('Erreur chargement clients:', error);
        return;
    }
    
    const select = document.getElementById('clientSelect');
    select.innerHTML = '<option value="">Sélectionner un client...</option>';
    
    data.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = `${client.company_name || client.full_name} (${client.email})`;
        select.appendChild(option);
    });
}

// Configurer les événements
function setupEventListeners() {
    // Bouton ajouter matière
    const addBtn = document.getElementById('addMaterialBtn');
    if (addBtn) {
        addBtn.addEventListener('click', openAddModal);
    }
    
    // Recherche
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const filtered = allMaterials.filter(m => 
            m.material_name.toLowerCase().includes(search) ||
            m.material_type.toLowerCase().includes(search) ||
            m.storage_location.toLowerCase().includes(search)
        );
        displayMaterials(filtered);
    });
    
    // Formulaire matière
    document.getElementById('materialForm').addEventListener('submit', handleFormSubmit);
    
    // Formulaire client
    document.getElementById('clientForm').addEventListener('submit', handleClientFormSubmit);
    
    // Formulaire édition client
    document.getElementById('editClientForm').addEventListener('submit', handleEditClientFormSubmit);
    
    // Formulaire mouvement
    document.getElementById('movementForm').addEventListener('submit', handleMovementFormSubmit);
    
    // Fermeture modals au clic extérieur
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

// Ouvrir le modal d'ajout
function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Ajouter une matière première';
    document.getElementById('materialForm').reset();
    document.getElementById('materialId').value = '';
    
    // Date du jour par défaut
    document.getElementById('receptionDate').valueAsDate = new Date();
    
    document.getElementById('materialModal').style.display = 'block';
}

// Fermer le modal
window.closeModal = function() {
    document.getElementById('materialModal').style.display = 'none';
};

// Éditer une matière
window.editMaterial = async function(id) {
    const material = allMaterials.find(m => m.id === id);
    if (!material) return;
    
    document.getElementById('modalTitle').textContent = 'Modifier la matière première';
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
        document.getElementById('clientSelect').value = material.client_id;
    }
    
    document.getElementById('materialModal').style.display = 'block';
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
        notes: document.getElementById('notes').value || null
    };
    
    // Ajouter le client_id si admin
    if (userProfile.role === 'admin') {
        materialData.client_id = document.getElementById('clientSelect').value;
        if (!materialData.client_id) {
            alert('Veuillez sélectionner un client');
            return;
        }
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
        
        // Enregistrer automatiquement le mouvement d'entrée
        if (!result.error && result.data && result.data[0]) {
            const newMaterial = result.data[0];
            await supabase
                .from('movements')
                .insert({
                    material_id: newMaterial.id,
                    type: 'entree',
                    quantity: newMaterial.quantity,
                    notes: 'Dépôt initial',
                    created_by: currentUser.id
                });
            
            // Envoyer notification email au client (admin uniquement)
            if (userProfile.role === 'admin') {
                await sendMaterialNotification(newMaterial, materialData.client_id);
            }
        }
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

// ========== GESTION DES CLIENTS (Admin) ==========

let allClients = [];

window.openClientModal = function() {
    document.getElementById('clientForm').reset();
    document.getElementById('clientRole').value = 'client';
    updateCreateUserForm();
    document.getElementById('clientModal').style.display = 'block';
};

window.closeClientModal = function() {
    document.getElementById('clientModal').style.display = 'none';
};

// Mettre à jour le formulaire selon le type de compte
window.updateCreateUserForm = function() {
    const role = document.getElementById('clientRole').value;
    const companyGroup = document.getElementById('companyGroup');
    const title = document.getElementById('createUserTitle');
    
    if (role === 'admin') {
        companyGroup.style.display = 'none';
        title.textContent = '➕ Créer un compte administrateur';
    } else {
        companyGroup.style.display = 'block';
        title.textContent = '➕ Créer un compte client';
    }
};

// Liste des clients
window.openClientsListModal = async function() {
    const { data: clients, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'client')
        .order('full_name');
    
    if (error) {
        alert('Erreur chargement clients: ' + error.message);
        return;
    }
    
    allClients = clients || [];
    
    let html = '';
    if (allClients.length === 0) {
        html = '<p style="color: var(--text-light); text-align: center;">Aucun client enregistré</p>';
    } else {
        html = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: var(--bg); text-align: left;">
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Nom</th>
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Entreprise</th>
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Email</th>
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${allClients.map(client => `
                        <tr>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">${client.full_name || '-'}</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">${client.company_name || '-'}</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">${client.email || '-'}</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">
                                <button class="btn btn-sm btn-secondary" onclick="openEditClientModal('${client.id}')" title="Modifier">✏️</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteClient('${client.id}')" title="Supprimer">🗑️</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    document.getElementById('clientsListContent').innerHTML = html;
    document.getElementById('clientsListModal').style.display = 'block';
};

window.closeClientsListModal = function() {
    document.getElementById('clientsListModal').style.display = 'none';
};

// Éditer un client
window.openEditClientModal = function(clientId) {
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;
    
    document.getElementById('editClientId').value = client.id;
    document.getElementById('editClientName').value = client.full_name || '';
    document.getElementById('editClientCompany').value = client.company_name || '';
    document.getElementById('editClientEmail').value = client.email || '';
    
    document.getElementById('editClientModal').style.display = 'block';
};

window.closeEditClientModal = function() {
    document.getElementById('editClientModal').style.display = 'none';
};

async function handleEditClientFormSubmit(e) {
    e.preventDefault();
    
    const clientId = document.getElementById('editClientId').value;
    const fullName = document.getElementById('editClientName').value;
    const companyName = document.getElementById('editClientCompany').value;
    
    const { error } = await supabase
        .from('profiles')
        .update({
            full_name: fullName,
            company_name: companyName
        })
        .eq('id', clientId);
    
    if (error) {
        alert('Erreur modification: ' + error.message);
        return;
    }
    
    alert('Client modifié avec succès!');
    closeEditClientModal();
    await openClientsListModal(); // Rafraîchir la liste
    await loadClients(); // Rafraîchir le select
}

// Supprimer un client
window.deleteClient = async function(clientId) {
    const client = allClients.find(c => c.id === clientId);
    if (!client) return;
    
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le client "${client.full_name || client.email}" ?\n\nAttention: Cela supprimera aussi toutes ses matières et mouvements!`)) {
        return;
    }
    
    // Supprimer les mouvements liés aux matières du client
    const { data: materials } = await supabase
        .from('materials')
        .select('id')
        .eq('client_id', clientId);
    
    if (materials && materials.length > 0) {
        const materialIds = materials.map(m => m.id);
        await supabase
            .from('movements')
            .delete()
            .in('material_id', materialIds);
    }
    
    // Supprimer les matières du client
    await supabase
        .from('materials')
        .delete()
        .eq('client_id', clientId);
    
    // Supprimer le profil
    const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', clientId);
    
    if (profileError) {
        alert('Erreur suppression profil: ' + profileError.message);
        return;
    }
    
    // Supprimer l'utilisateur auth (optionnel, peut nécessiter des droits admin)
    // Note: Ceci peut ne pas fonctionner avec la clé anon
    
    alert('Client supprimé avec succès!');
    await openClientsListModal(); // Rafraîchir la liste
    await loadClients(); // Rafraîchir le select
    await updateStats();
};

// ========== GESTION DES ADMINISTRATEURS ==========

window.openAdminsListModal = async function() {
    const { data: admins, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'admin')
        .order('full_name');
    
    if (error) {
        alert('Erreur chargement admins: ' + error.message);
        return;
    }
    
    const currentUserId = (await supabase.auth.getUser()).data.user?.id;
    
    let html = '';
    if (!admins || admins.length === 0) {
        html = '<p style="color: var(--text-light); text-align: center;">Aucun administrateur</p>';
    } else {
        html = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: var(--bg); text-align: left;">
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Nom</th>
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Email</th>
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${admins.map(admin => `
                        <tr>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">
                                ${admin.full_name || '-'}
                                ${admin.id === currentUserId ? '<span style="color: var(--primary); font-size: 0.75rem;"> (vous)</span>' : ''}
                            </td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">${admin.email || '-'}</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">
                                ${admin.id === currentUserId 
                                    ? '<span style="color: var(--text-light); font-size: 0.875rem;">-</span>' 
                                    : `<button class="btn btn-sm btn-danger" onclick="deleteAdmin('${admin.id}')" title="Supprimer">🗑️</button>`
                                }
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    document.getElementById('adminsListContent').innerHTML = html;
    document.getElementById('adminsListModal').style.display = 'block';
};

window.closeAdminsListModal = function() {
    document.getElementById('adminsListModal').style.display = 'none';
};

window.deleteAdmin = async function(adminId) {
    // Vérifier qu'on ne supprime pas soi-même
    const currentUserId = (await supabase.auth.getUser()).data.user?.id;
    if (adminId === currentUserId) {
        alert('Vous ne pouvez pas supprimer votre propre compte!');
        return;
    }
    
    // Vérifier qu'il reste au moins un admin
    const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin');
    
    if (count <= 1) {
        alert('Impossible de supprimer le dernier administrateur!');
        return;
    }
    
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet administrateur ?\n\nCette action est irréversible.')) {
        return;
    }
    
    // Supprimer le profil
    const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', adminId);
    
    if (profileError) {
        alert('Erreur suppression admin: ' + profileError.message);
        return;
    }
    
    alert('Administrateur supprimé avec succès!');
    await openAdminsListModal(); // Rafraîchir la liste
    await updateStats();
};

async function handleClientFormSubmit(e) {
    e.preventDefault();
    
    const role = document.getElementById('clientRole').value;
    const name = document.getElementById('clientName').value;
    const company = role === 'client' ? document.getElementById('clientCompany').value : '';
    const email = document.getElementById('clientEmail').value;
    const password = document.getElementById('clientPassword').value;
    
    if (password.length < 6) {
        alert('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }
    
    // Confirmation pour création admin
    if (role === 'admin') {
        if (!confirm('Vous êtes sur le point de créer un compte ADMINISTRATEUR.\nCet utilisateur aura tous les droits.\n\nContinuer ?')) {
            return;
        }
    }
    
    // Créer l'utilisateur via Supabase Auth
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                full_name: name,
                company_name: company
            },
            emailRedirectTo: 'https://kkstar44.github.io/gestion-stockage/dashboard.html'
        }
    });
    
    if (error) {
        alert('Erreur création compte: ' + error.message);
        return;
    }
    
    if (data.user) {
        // Créer ou mettre à jour le profil avec le rôle choisi
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: data.user.id,
                full_name: name,
                company_name: company,
                email: email,
                role: role
            });
        
        if (profileError) {
            console.error('Erreur profil:', profileError);
            alert('Compte créé mais erreur profil: ' + profileError.message);
        } else {
            const roleLabel = role === 'admin' ? 'administrateur' : 'client';
            // Afficher les accès pour copie
            showCredentialsModal(roleLabel, name, email, password);
        }
    }
    
    closeClientModal();
    await loadClients();
    await updateStats();
}

// Afficher les identifiants après création
function showCredentialsModal(roleLabel, name, email, password) {
    const credentialsText = `
🔐 ACCÈS ${roleLabel.toUpperCase()}

Nom: ${name}
Email: ${email}
Mot de passe: ${password}

Lien de connexion:
https://kkstar44.github.io/gestion-stockage/

⚠️ Un email de confirmation a été envoyé.
L'utilisateur doit cliquer sur le lien dans l'email avant de pouvoir se connecter.
    `.trim();
    
    const modalHTML = `
        <div id="credentialsModal" class="modal" style="display: block;">
            <div class="modal-content">
                <span class="close" onclick="closeCredentialsModal()">&times;</span>
                <h2>✅ Compte ${roleLabel} créé avec succès!</h2>
                <p style="margin-bottom: 1rem;">Voici les identifiants à transmettre à l'utilisateur :</p>
                <textarea id="credentialsText" readonly style="width: 100%; height: 200px; font-family: monospace; padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; resize: none;">${credentialsText}</textarea>
                <div class="form-actions" style="margin-top: 1rem;">
                    <button class="btn btn-primary" onclick="copyCredentials()">📋 Copier les accès</button>
                    <button class="btn btn-secondary" onclick="closeCredentialsModal()">Fermer</button>
                </div>
            </div>
        </div>
    `;
    
    // Ajouter le modal au DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

window.copyCredentials = function() {
    const textarea = document.getElementById('credentialsText');
    textarea.select();
    document.execCommand('copy');
    alert('Accès copiés dans le presse-papier !');
};

window.closeCredentialsModal = function() {
    const modal = document.getElementById('credentialsModal');
    if (modal) modal.remove();
};

// ========== GESTION DES MOUVEMENTS ==========

window.openMovementModal = function(materialId, type) {
    const material = allMaterials.find(m => m.id === materialId);
    if (!material) return;
    
    document.getElementById('movementMaterialId').value = materialId;
    document.getElementById('movementType').value = type;
    document.getElementById('movementMaterialName').textContent = material.material_name;
    document.getElementById('movementUnit').textContent = material.unit;
    document.getElementById('movementQuantity').value = '';
    document.getElementById('movementNotes').value = '';
    
    const title = type === 'entree' ? '📥 Entrée de stock' : '📤 Sortie de stock';
    document.getElementById('movementModalTitle').textContent = title;
    
    const submitBtn = document.getElementById('movementSubmitBtn');
    submitBtn.className = type === 'entree' ? 'btn btn-success' : 'btn btn-warning';
    submitBtn.textContent = type === 'entree' ? 'Enregistrer l\'entrée' : 'Enregistrer la sortie';
    
    document.getElementById('movementModal').style.display = 'block';
};

window.closeMovementModal = function() {
    document.getElementById('movementModal').style.display = 'none';
};

async function handleMovementFormSubmit(e) {
    e.preventDefault();
    
    const materialId = document.getElementById('movementMaterialId').value;
    const type = document.getElementById('movementType').value;
    const quantity = parseFloat(document.getElementById('movementQuantity').value);
    const notes = document.getElementById('movementNotes').value;
    
    const material = allMaterials.find(m => m.id === materialId);
    if (!material) return;
    
    // Vérifier qu'on ne sort pas plus que le stock disponible
    if (type === 'sortie' && quantity > material.quantity) {
        alert(`Stock insuffisant! Disponible: ${material.quantity} ${material.unit}`);
        return;
    }
    
    // Enregistrer le mouvement
    const { error: movementError } = await supabase
        .from('movements')
        .insert({
            material_id: materialId,
            type: type,
            quantity: quantity,
            notes: notes,
            created_by: currentUser.id
        });
    
    if (movementError) {
        alert('Erreur enregistrement mouvement: ' + movementError.message);
        return;
    }
    
    // Mettre à jour la quantité de la matière
    const newQuantity = type === 'entree' 
        ? material.quantity + quantity 
        : material.quantity - quantity;
    
    const { error: updateError } = await supabase
        .from('materials')
        .update({ quantity: newQuantity })
        .eq('id', materialId);
    
    if (updateError) {
        alert('Erreur mise à jour stock: ' + updateError.message);
        return;
    }
    
    closeMovementModal();
    await loadMaterials();
    await updateStats();
}

// ========== HISTORIQUE DES MOUVEMENTS ==========

window.viewHistory = async function(materialId) {
    const material = allMaterials.find(m => m.id === materialId);
    if (!material) return;
    
    // Charger les mouvements sans jointure
    const { data: movements, error } = await supabase
        .from('movements')
        .select('*')
        .eq('material_id', materialId)
        .order('created_at', { ascending: false });
    
    if (error) {
        alert('Erreur chargement historique: ' + error.message);
        return;
    }
    
    // Charger les infos des créateurs séparément si nécessaire
    let creatorsMap = {};
    if (movements && movements.length > 0) {
        const creatorIds = [...new Set(movements.map(m => m.created_by).filter(Boolean))];
        if (creatorIds.length > 0) {
            const { data: creators } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .in('id', creatorIds);
            
            if (creators) {
                creators.forEach(c => creatorsMap[c.id] = c);
            }
        }
    }
    
    let historyHTML = `
        <h3 style="margin-bottom: 1rem; color: var(--primary);">${material.material_name}</h3>
        <p style="margin-bottom: 1rem;">Stock actuel: <strong>${material.quantity} ${material.unit}</strong></p>
    `;
    
    if (!movements || movements.length === 0) {
        historyHTML += '<p style="color: var(--text-light);">Aucun mouvement enregistré pour cette matière.</p>';
    } else {
        historyHTML += `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: var(--bg); text-align: left;">
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Date</th>
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Type</th>
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Quantité</th>
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Notes</th>
                        <th style="padding: 0.75rem; border-bottom: 2px solid var(--border);">Par</th>
                    </tr>
                </thead>
                <tbody>
                    ${movements.map(m => {
                        const creator = creatorsMap[m.created_by];
                        return `
                        <tr>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">${formatDateTime(m.created_at)}</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">
                                <span style="color: ${m.type === 'entree' ? 'var(--success)' : 'var(--warning)'};">
                                    ${m.type === 'entree' ? '📥 Entrée' : '📤 Sortie'}
                                </span>
                            </td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">${m.quantity} ${material.unit}</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">${m.notes || '-'}</td>
                            <td style="padding: 0.75rem; border-bottom: 1px solid var(--border);">${creator?.full_name || creator?.email || '-'}</td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        `;
    }
    
    document.getElementById('historyContent').innerHTML = historyHTML;
    document.getElementById('historyModal').style.display = 'block';
};

window.closeHistoryModal = function() {
    document.getElementById('historyModal').style.display = 'none';
};

// ========== ARCHIVES ==========

let showingArchives = false;

window.toggleArchives = function() {
    showingArchives = !showingArchives;
    
    const archivesBtn = document.getElementById('archivesBtn');
    const archivedCount = allMaterials.filter(m => m.quantity <= 0).length;
    
    if (showingArchives) {
        archivesBtn.textContent = '📦 Stock actif';
        archivesBtn.classList.add('btn-warning');
        archivesBtn.classList.remove('btn-secondary');
        displayMaterials(allMaterials, true); // Afficher les archives
    } else {
        archivesBtn.textContent = `📁 Archives (${archivedCount})`;
        archivesBtn.classList.remove('btn-warning');
        archivesBtn.classList.add('btn-secondary');
        displayMaterials(allMaterials, false); // Afficher le stock actif
    }
};

// ========== UTILITAIRES ==========

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('fr-FR');
}

function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('fr-FR');
}

// ========== NOTIFICATION EMAIL ==========

async function sendMaterialNotification(material, clientId) {
    try {
        // Récupérer les infos du client
        const { data: client, error: clientError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', clientId)
            .single();
        
        if (clientError || !client) {
            console.error('Erreur récupération client:', clientError);
            return;
        }
        
        if (!client.email) {
            console.log('Client sans email, notification non envoyée');
            return;
        }
        
        // Appeler la Edge Function
        const { data, error } = await supabase.functions.invoke('send-material-notification', {
            body: {
                material: material,
                client: client
            }
        });
        
        if (error) {
            console.error('Erreur envoi notification:', error);
        } else {
            console.log('Notification envoyée:', data);
        }
    } catch (err) {
        console.error('Erreur notification:', err);
    }
}
