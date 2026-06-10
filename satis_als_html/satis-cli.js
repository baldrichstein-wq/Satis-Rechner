const Database = require('better-sqlite3');
const crypto = require('crypto');
const readline = require('readline/promises');
const processVars = require('process');

const input = processVars.stdin;
const output = processVars.stdout;
const rl = readline.createInterface({ input, output });

// --- Datenbank Setup ---
const DB_NAME = "satisfactory_recipes_test.db";
let currentUser = null; // Speichert { id, name, role }

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function initDb() {
    const db = new Database(DB_NAME);

    db.prepare(`
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            output_items TEXT NOT NULL,
            input_items TEXT NOT NULL,
            building TEXT NOT NULL
        )
    `).run();

    db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    `).run();

    // Standard-Admin erstellen
    const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
    if (userCount === 0) {
        const adminPw = hashPassword("admin123");
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
          .run('Admin', adminPw, 'Admin');
        console.log("Standard-Admin erstellt: Admin / admin123");
    }

    // Standardrezepte
    const recipeCount = db.prepare('SELECT count(*) as count FROM recipes').get().count;
    if (recipeCount === 0) {
        const defaultRecipes = [
            ['Eisenbarren', 'Eisenbarren:30.0', 'Eisenerz:30.0', 'Schmelzofen'],
            ['Alternatives Rezept: Gusseisenschrauben', 'Schrauben:50.0', 'Eisenbarren:12.5', 'Constructor'],
            ['Eisenstangen', 'Eisenstangen:15.0', 'Eisenbarren:15.0', 'Constructor'],
            ['Eisenplatten', 'Eisenplatten:20.0', 'Eisenbarren:30.0', 'Constructor'],
            ['Schrauben', 'Schrauben:40.0', 'Eisenstangen:10.0', 'Constructor'],
            ['AluminiumSchrott', 'AluminiumSchrott:360.0,Wasser:120.0', 'Kohle:120.0,Aluminiumoxid:240.0', 'Raffinerie']
        ];

        const insert = db.prepare('INSERT INTO recipes (name, output_items, input_items, building) VALUES (?, ?, ?, ?)');
        const insertMany = db.transaction((recipes) => {
            for (const r of recipes) insert.run(r[0], r[1], r[2], r[3]);
        });
        insertMany(defaultRecipes);
    }
    db.close();
}

// --- Authentifizierung ---
async function login() {
    console.log("\n--- Login ---");
    const username = await rl.question("Benutzername: ");
    const password = await rl.question("Passwort: ");
    const hashed = hashPassword(password);

    const db = new Database(DB_NAME);
    const user = db.prepare('SELECT id, username, role FROM users WHERE username = ? AND password = ?').get(username, hashed);
    db.close();

    if (user) {
        currentUser = { id: user.id, name: user.username, role: user.role.toLowerCase() };
        console.log(`\nWillkommen, ${user.username}! (Rolle: ${user.role})`);
        return true;
    } else {
        console.log("\nLogin fehlgeschlagen. Falscher Name oder Passwort.");
        return false;
    }
}

async function register() {
    console.log("\n--- Registrierung ---");
    const username = (await rl.question("Wähle einen Benutzernamen: ")).trim();
    if (!username) {
        console.log("Name darf nicht leer sein.");
        return false;
    }

    const password = await rl.question("Wähle ein Passwort: ");
    if (password.length < 3) {
        console.log("Passwort zu kurz (min. 3 Zeichen).");
        return false;
    }

    const hashed = hashPassword(password);
    const role = "user";

    const db = new Database(DB_NAME);
    try {
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
          .run(username, hashed, role);
        console.log(`\nAccount für '${username}' erstellt! Logge dich nun ein.`);
        return true;
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            console.log("\nFehler: Name bereits vergeben.");
        } else {
            console.log("\nFehler bei der Registrierung:", err.message);
        }
        return false;
    } finally {
        db.close();
    }
}

// --- Berechtigungs-Prüfungen ---
function requireAdmin() {
    if (currentUser && currentUser.role === 'admin') return true;
    console.log("\n[ZUGRIFF VERWEIGERT] Erfordert Admin-Rechte.");
    return false;
}

function canEdit() {
    if (currentUser && ['admin', 'moderator'].includes(currentUser.role)) return true;
    console.log("\n[ZUGRIFF VERWEIGERT] Erfordert Moderator- oder Admin-Rechte.");
    return false;
}

// --- Benutzerverwaltung ---
async function deleteUser() {
    if (!requireAdmin()) return;
    const db = new Database(DB_NAME);
    const users = db.prepare('SELECT id, username, role FROM users').all();
    
    for (const u of users) {
        console.log(`ID: ${u.id} | Name: ${u.username.padEnd(15)} | Rolle: ${u.role}`);
    }

    try {
        const uidInput = await rl.question("\nID zum Löschen (0 zum Abbrechen): ");
        const uid = parseInt(uidInput, 10);
        if (uid === 0 || isNaN(uid)) return;

        if (uid === currentUser.id) {
            console.log("Fehler: Du kannst dich nicht selbst löschen!");
            return;
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(uid);
        console.log("Gelöscht.");
    } catch (e) {
        console.log("Fehler.");
    } finally {
        db.close();
    }
}

// --- Rezept-Funktionen ---
function getAllRecipes() {
    const db = new Database(DB_NAME);
    const rows = db.prepare('SELECT * FROM recipes').all();
    db.close();
    return rows;
}

function showSubRecipes(itemName, depth = 3) {
    const indent = "  ".repeat(depth);
    const db = new Database(DB_NAME);
    const subRecipes = db.prepare("SELECT name, input_items, building FROM recipes WHERE output_items LIKE ?").all(`%${itemName}%`);
    db.close();

    if (subRecipes.length > 0) {
        for (const { name, input_items, building } of subRecipes) {
            console.log(`${indent}Lösungsweg für ${itemName}: ${name} (${building})`);
            for (const pair of input_items.split(',')) {
                if (pair.includes(':')) {
                    const [it, _] = pair.split(':');
                    console.log(`${indent}  -> Benötigt: ${it}`);
                }
            }
        }
    } else {
        console.log(`${indent}(Kein Rezept für ${itemName} in DB gefunden - Rohstoff?)`);
    }
}

async function performCalculation(recipeRow) {
    try {
        const { id, name, output_items, input_items, building } = recipeRow;
        
        const firstOutput = output_items.split(',')[0];
        const [mainOutName, mainOutQtyStr] = firstOutput.split(':');
        const mainOutQty = parseFloat(mainOutQtyStr);
        
        const desiredInput = await rl.question(`\nGewünschte Menge ${mainOutName}/Min: `);
        const desired = parseFloat(desiredInput);
        if (isNaN(desired)) throw new Error("Ungültige Zahl eingegeben.");

        const factor = desired / mainOutQty;
        
        console.log("-".repeat(50));
        console.log(`PRODUKTION: ${name.toUpperCase()}`);
        console.log(`Benötigte Gebäude: ${building} x ${factor.toFixed(2)}`);
        console.log("-".repeat(50));
        
        console.log("PRODUZIERTE ITEMS (Output):");
        for (const pair of output_items.split(',')) {
            if (pair.includes(':')) {
                const [it, qty] = pair.split(':');
                console.log(`  + ${it}: ${(parseFloat(qty) * factor).toFixed(2)}/min`);
            }
        }
        
        console.log("\nBENÖTIGTE RESSOURCEN & HERSTELLUNG:");
        for (const pair of input_items.split(',')) {
            if (pair.includes(':')) {
                const [it, qty] = pair.split(':');
                const totalNeeded = parseFloat(qty) * factor;
                console.log(`\n> ${it}: ${totalNeeded.toFixed(2)}/min benötigt`);
                showSubRecipes(it);
            }
        }
        console.log("-".repeat(50));

        while (true) {
            const wait = (await rl.question("\nDrücke 'q' und Enter, um zum Menü zurückzukehren: ")).toLowerCase();
            if (wait === 'q') break;
        }
    } catch (e) {
        console.log(`Fehler bei der Berechnung: ${e.message}`);
        await rl.question("\nDrücke Enter, um fortzufahren...");
    }
}

async function calculateRecipe() {
    const recipes = getAllRecipes();
    if (recipes.length === 0) return;
    
    console.log("\n--- Standard Berechnung ---");
    for (const r of recipes) {
        console.log(`[${r.id}] ${r.name}`);
    }
    
    try {
        const ridInput = await rl.question("\nRezept ID wählen: ");
        const rid = parseInt(ridInput, 10);
        if (isNaN(rid)) {
            console.log("Ungültige ID.");
            return;
        }
        
        const db = new Database(DB_NAME);
        const res = db.prepare('SELECT * FROM recipes WHERE id = ?').get(rid);
        db.close();
        
        if (res) await performCalculation(res);
    } catch (e) {
        console.log("Ungültige ID.");
    }
}

async function calculateAlternativeRecipe() {
    const itemName = (await rl.question("\nWelches Item möchtest du herstellen? (z.B. Schrauben): ")).trim();
    
    const db = new Database(DB_NAME);
    const results = db.prepare("SELECT * FROM recipes WHERE output_items LIKE ?").all(`%${itemName}%`);
    db.close();
    
    if (results.length === 0) {
        console.log(`Keine Rezepte für '${itemName}' gefunden.`);
        return;
    }

    console.log(`\n--- Verfügbare Rezepte für ${itemName} ---`);
    results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.name} (Gebäude: ${r.building})`);
    });
    
    try {
        const choiceInput = await rl.question("\nWähle eine Option (Zahl): ");
        const choice = parseInt(choiceInput, 10) - 1;
        if (!isNaN(choice) && choice >= 0 && choice < results.length) {
            await performCalculation(results[choice]);
        } else {
            console.log("Ungültige Wahl.");
        }
    } catch (e) {
        console.log("Bitte eine Zahl eingeben.");
    }
}

async function inputMultipleItems(promptType) {
    const itemsList = [];
    console.log(`\n--- ${promptType} eingeben (Beenden mit 'fertig') ---`);
    while (true) {
        const name = (await rl.question(`${promptType} Name: `)).trim();
        if (name.toLowerCase() === 'fertig') break;
        if (!name) continue;
        const qty = await rl.question(`Menge von ${name} pro Min: `);
        itemsList.push(`${name}:${qty}`);
    }
    return itemsList.join(",");
}

async function addRecipe() {
    if (!canEdit()) return; // Moderatoren und Admins erlaubt
    console.log("\n--- Neues Rezept hinzufügen ---");
    const name = await rl.question("Rezept Name: ");
    const outputItems = await inputMultipleItems("Ausgabe-Item");
    const inputItems = await inputMultipleItems("Zutat");
    const building = await rl.question("Gebäude: ");
    
    const db = new Database(DB_NAME);
    db.prepare('INSERT INTO recipes (name, output_items, input_items, building) VALUES (?, ?, ?, ?)')
      .run(name, outputItems, inputItems, building);
    db.close();
    console.log("Rezept hinzugefügt!");
}

async function deleteRecipe() {
    if (!requireAdmin()) return; // Nur Admins
    const db = new Database(DB_NAME);
    const recipes = db.prepare('SELECT id, name, building FROM recipes').all();
    if (recipes.length === 0) {
        console.log("Keine Rezepte vorhanden.");
        db.close();
        return;
    }
    for (const r of recipes) {
        console.log(`ID: ${r.id} | Name: ${r.name.padEnd(30)} | Gebäude: ${r.building}`);
    }
    try {
        const ridInput = await rl.question("\nID zum Löschen (0 zum Abbrechen): ");
        const rid = parseInt(ridInput, 10);
        if (rid === 0 || isNaN(rid)) return;
        db.prepare('DELETE FROM recipes WHERE id = ?').run(rid);
        console.log("Rezept gelöscht.");
    } catch (e) {
        console.log("Fehler.");
    } finally {
        db.close();
    }
}

async function editRecipe() {
    if (!canEdit()) return; // Moderatoren und Admins erlaubt
    const recipes = getAllRecipes();
    if (recipes.length === 0) {
        console.log("\nKeine Rezepte zum Bearbeiten vorhanden.");
        return;
    }

    console.log("\n--- Rezept bearbeiten ---");
    for (const r of recipes) {
        console.log(`[${r.id}] ${r.name} (Produziert: ${r.output_items})`);
    }
    
    try {
        const userInput = await rl.question("\nID des zu bearbeitenden Rezepts (0 zum Abbrechen): ");
        if (!userInput || parseInt(userInput, 10) === 0) return;
        const recipeId = parseInt(userInput, 10);

        const db = new Database(DB_NAME);
        const old = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);

        if (!old) {
            console.log("ID nicht gefunden.");
            db.close();
            return;
        }

        console.log(`\nBearbeite '${old.name}'. Tipp: ENTER drücken, um alten Wert zu behalten.`);
        const newName = (await rl.question(`Name [${old.name}]: `)) || old.name;
        const newBuilding = (await rl.question(`Gebäude [${old.building}]: `)) || old.building;

        let newOutputItems = old.output_items;
        const changeOut = (await rl.question(`Ausgaben neu definieren? (Aktuell: ${old.output_items}) (j/n): `)).toLowerCase();
        if (changeOut === 'j') {
            newOutputItems = await inputMultipleItems("Ausgabe-Item");
        }

        let newInputItems = old.input_items;
        const changeIn = (await rl.question(`Zutaten neu definieren? (Aktuell: ${old.input_items}) (j/n): `)).toLowerCase();
        if (changeIn === 'j') {
            newInputItems = await inputMultipleItems("Zutat");
        }

        db.prepare(`
            UPDATE recipes 
            SET name = ?, output_items = ?, input_items = ?, building = ?
            WHERE id = ?
        `).run(newName, newOutputItems, newInputItems, newBuilding, recipeId);
        
        db.close();
        console.log("\nRezept erfolgreich aktualisiert!");
    } catch (e) {
        console.log("Ungültige Eingabe.");
    }
}

async function manageUsers() {
    if (!requireAdmin()) return; // Nur Admins
    const db = new Database(DB_NAME);
    const users = db.prepare('SELECT id, username, role FROM users').all();
    for (const u of users) {
        console.log(`ID: ${u.id} | Name: ${u.username.padEnd(15)} | Rolle: ${u.role}`);
    }
    try {
        const uidInput = await rl.question("\nID zur Rollenänderung: ");
        const uid = parseInt(uidInput, 10);
        const newRole = (await rl.question("Neue Rolle (user/moderator/admin): ")).toLowerCase();
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(newRole, uid);
        console.log("Rolle aktualisiert.");
    } catch (e) {
        console.log("Fehler.");
    } finally {
        db.close();
    }
}

// --- Hauptmenü ---
async function mainMenu() {
    initDb();
    
    let running = true;
    while (running) {
        if (!currentUser) {
            console.log("\n--- Satisfactory Rechner ---");
            console.log("1. Login");
            console.log("2. Registrieren");
            console.log("3. Beenden");
            const choice = await rl.question("Wahl: ");
            if (choice === '1') await login();
            else if (choice === '2') await register();
            else if (choice === '3') running = false;
        } else {
            const role = currentUser.role;
            console.log(`\n--- Hauptmenü (${currentUser.name} | ${role}) ---`);
            console.log("1. Rezept berechnen (Liste)");
            console.log("2. Berechnen mit Alternativen (Suche nach Item)");
            
            // Moderatoren und Admins
            if (['admin', 'moderator'].includes(role)) {
                console.log("3. Rezept bearbeiten");
                console.log("4. Rezept hinzufügen");
            }
            
            // Nur Admins
            if (role === 'admin') {
                console.log("5. Rezept löschen");
                console.log("6. Benutzerrollen verwalten");
                console.log("7. Benutzer löschen");
            }
            
            console.log("8. Logout");
            console.log("9. Beenden");
            
            const choice = await rl.question("Auswahl: ");
            
            if (choice === '1') {
                await calculateRecipe();
            } else if (choice === '2') {
                await calculateAlternativeRecipe();
            } else if (choice === '3' && ['admin', 'moderator'].includes(role)) {
                await editRecipe();
            } else if (choice === '4' && ['admin', 'moderator'].includes(role)) {
                await addRecipe();
            } else if (choice === '5' && role === 'admin') {
                await deleteRecipe();
            } else if (choice === '6' && role === 'admin') {
                await manageUsers();
            } else if (choice === '7' && role === 'admin') {
                await deleteUser();
            } else if (choice === '8') {
                currentUser = null;
            } else if (choice === '9') {
                running = false;
            }
        }
    }

    console.log("Programm beendet.");
    if (rl) rl.close();
}

// Startet die Terminal-App
mainMenu();