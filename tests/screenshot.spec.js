// Script de screenshot automatique pour vérification visuelle
require('dotenv').config();
const { test } = require('@playwright/test');

const SITE_URL = 'https://kkstar44.github.io/gestion-stockage/';

// Identifiants de test (depuis .env)
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

test('Screenshot page accueil', async ({ page }) => {
    await page.goto(SITE_URL);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/01-accueil.png', fullPage: true });
});

test('Screenshot page de connexion', async ({ page }) => {
    await page.goto(SITE_URL + 'login.html');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/02-login.png', fullPage: true });
});

test('Screenshot dashboard connecté', async ({ page }) => {
    // Aller sur la page de connexion
    await page.goto(SITE_URL + 'login.html');
    await page.waitForLoadState('networkidle');
    
    // Remplir le formulaire de connexion
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    
    // Cliquer sur le bouton de connexion
    await page.click('button[type="submit"]');
    
    // Attendre la redirection vers le dashboard
    await page.waitForURL('**/dashboard.html', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Attendre le chargement des données
    await page.waitForTimeout(3000);
    
    // Screenshot du dashboard
    await page.screenshot({ path: 'screenshots/03-dashboard.png', fullPage: true });
});

test('Screenshot formulaire ajout matière', async ({ page }) => {
    // Connexion
    await page.goto(SITE_URL + 'login.html');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard.html', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Ouvrir le modal d'ajout
    await page.click('#addMaterialBtn');
    await page.waitForTimeout(500);
    
    // Screenshot du formulaire
    await page.screenshot({ path: 'screenshots/04-formulaire-ajout.png', fullPage: true });
});
