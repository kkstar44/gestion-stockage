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

// Afficher les matières
function displayMaterials(materials) {
    const container = document.getElementById('materialsList');
    
    if (materials.length === 0) {
        container.innerHTML = '<p class="loading">Aucune matière première enregistrée</p>';
        return;
    }
    
    container.innerHTML = materials.map(material => `
        <div class="material-card">
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
                ${userProfile.role === 'admin' ? `
                    <button class="btn btn-sm btn-success" onclick="openMovementModal('${material.id}', 'entree')" title="Entrée stock">
                        📥
                    </button>
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
    
    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('totalValue').textContent = 
        totalValue.toLocaleString('fr-FR') + ' €';
    
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
// ← J'AI SUPPRIMÉ L'ACCOLADE EN TROP ICI

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
    document.getElementById('clientModal').style.display = 'block';
};

window.closeClientModal = function() {
    document.getElementById('clientModal').style.display = 'none';
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

async function handleClientFormSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('clientName').value;
    const company = document.getElementById('clientCompany').value;
    const email = document.getElementById('clientEmail').value;
    const password = document.getElementById('clientPassword').value;
    
    if (password.length < 6) {
        alert('Le mot de passe doit contenir au moins 6 caractères');
        return;
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
        // Créer ou mettre à jour le profil
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: data.user.id,
                full_name: name,
                company_name: company,
                email: email,
                role: 'client'
            });
        
        if (profileError) {
            console.error('Erreur profil:', profileError);
            alert('Compte créé mais erreur profil: ' + profileError.message);
        } else {
            alert('Compte client créé avec succès!\nUn email de confirmation a été envoyé à ' + email);
        }
    }
    
    closeClientModal();
    await loadClients();
    await updateStats();
}

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

// ========== UTILITAIRES ==========

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('fr-FR');
}

function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('fr-FR');
}
