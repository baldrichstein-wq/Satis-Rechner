const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_NAME = "satisfactory_recipes_test.db";

// --- Middleware ---
app.use(cors());
app.use(express.json()); // Ermöglicht das Lesen von JSON-Inhalten in Anfragen
app.use(express.static(path.join(__dirname, '.'))); // Liefert index.html, CSS und frontend.js direkt aus

// --- Hilfsfunktionen ---
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Hilfsfunktion, um Lösungswege (Sub-Rezepte) für eine Zutat zu finden
function getSubRecipes(itemName, db) {
    const subRecipes = db.prepare("SELECT name, input_items, building FROM recipes WHERE output_items LIKE ?").all(`%${itemName}%`);
    return subRecipes.map(r => {
        const ingredients = [];
        for (const pair of r.input_items.split(',')) {
            if (pair.includes(':')) {
                const [it] = pair.split(':');
                ingredients.push(it);
            }
        }
        return {
            recipeName: r.name,
            building: r.building,
            neededIngredients: ingredients
        };
    });
}

// --- Datenbank Setup (Aus satis-cli.js übernommen) ---
function initDb() {
    const db = new Database(DB_NAME);

    // Rezepte-Tabelle
    db.prepare(`
        CREATE TABLE IF NOT EXISTS recipes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            output_items TEXT NOT NULL,
            input_items TEXT NOT NULL,
            building TEXT NOT NULL
        )
    `).run();

    // Benutzer-Tabelle
    db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    `).run();

    // Standard-Admin erstellen (Falls noch kein User existiert)
    const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
    if (userCount === 0) {
        const adminPw = hashPassword("admin123");
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
          .run('Admin', adminPw, 'admin'); // Kleingeschrieben für Kompatibilität mit frontend.js
        console.log("Standard-Admin erstellt: Admin / admin123");
    }

    // Standardrezepte einfügen (Falls noch leer)
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
        console.log("Standardrezepte in DB initialisiert.");
    }
    db.close();
}

// Initialisiere die Datenbank beim Serverstart
initDb();


// ==========================================
// --- API ENDPUNKTE (Routen für Browser) ---
// ==========================================

// --- 1. AUTHENTIFIZIERUNG ---

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: "Felder unvollständig." });

    const hashed = hashPassword(password);
    const db = new Database(DB_NAME);
    try {
        const user = db.prepare('SELECT id, username, role FROM users WHERE username = ? AND password = ?').get(username, hashed);
        if (user) {
            res.json({ success: true, user: { name: user.username, role: user.role.toLowerCase() } });
        } else {
            res.status(401).json({ success: false, message: "Falscher Name oder Passwort." });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    } finally {
        db.close();
    }
});

// Registrierung
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || password.length < 3) {
        return res.status(400).json({ success: false, message: "Name leer oder Passwort zu kurz (min. 3 Zeichen)." });
    }

    const hashed = hashPassword(password);
    const db = new Database(DB_NAME);
    try {
        db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
          .run(username, hashed, 'user');
        res.json({ success: true, user: { name: username, role: 'user' } });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ success: false, message: "Fehler: Name bereits vergeben." });
        } else {
            res.status(500).json({ success: false, message: err.message });
        }
    } finally {
        db.close();
    }
});


// --- 2. REZEPTVERWALTUNG (CRUD) ---

// Alle Rezepte abrufen (Für Standard-Berechnungs-Liste)
app.get('/api/recipes', (req, res) => {
    const db = new Database(DB_NAME);
    try {
        const recipes = db.prepare('SELECT * FROM recipes').all();
        res.json(recipes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        db.close();
    }
});

// Rezepte nach Ziel-Item durchsuchen (Für Berechnungen mit Alternativrezepten)
app.get('/api/recipes/search', (req, res) => {
    const { item } = req.query;
    if (!item) return res.status(400).json({ error: "Suchbegriff fehlt." });

    const db = new Database(DB_NAME);
    try {
        const results = db.prepare("SELECT * FROM recipes WHERE output_items LIKE ?").all(`%${item}%`);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        db.close();
    }
});

// Rezept hinzufügen
app.post('/api/recipes', (req, res) => {
    const { name, output_items, input_items, building } = req.body;
    const db = new Database(DB_NAME);
    try {
        db.prepare('INSERT INTO recipes (name, output_items, input_items, building) VALUES (?, ?, ?, ?)')
          .run(name, output_items, input_items, building);
        res.json({ success: true, message: "Rezept erfolgreich hinzugefügt!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    } finally {
        db.close();
    }
});

// Rezept bearbeiten
app.put('/api/recipes/:id', (req, res) => {
    const { id } = req.params;
    const { name, output_items, input_items, building } = req.body;
    const db = new Database(DB_NAME);
    try {
        db.prepare(`
            UPDATE recipes 
            SET name = ?, output_items = ?, input_items = ?, building = ?
            WHERE id = ?
        `).run(name, output_items, input_items, building, id);
        res.json({ success: true, message: "Rezept erfolgreich aktualisiert!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    } finally {
        db.close();
    }
});

// Rezept löschen
app.delete('/api/recipes/:id', (req, res) => {
    const { id } = req.params;
    const db = new Database(DB_NAME);
    try {
        db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
        res.json({ success: true, message: "Rezept erfolgreich gelöscht!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    } finally {
        db.close();
    }
});


// --- 3. REZEPT-BERECHNUNGS-ENGINE ---

// Mathematische Skalierung und Zutatensuche
app.post('/api/calculate', (req, res) => {
    const { recipeId, desiredAmount } = req.body;
    if (!recipeId || isNaN(desiredAmount)) return res.status(400).json({ success: false, message: "Ungültige Eingabewerte." });

    const db = new Database(DB_NAME);
    try {
        const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
        if (!recipe) return res.status(404).json({ success: false, message: "Rezept nicht gefunden." });

        const firstOutput = recipe.output_items.split(',')[0];
        const [mainOutName, mainOutQtyStr] = firstOutput.split(':');
        const mainOutQty = parseFloat(mainOutQtyStr);

        // Skalierungsfaktor ermitteln
        const factor = desiredAmount / mainOutQty;

        // JSON-Struktur für die Web-Anzeige zusammenbauen
        const calculationResult = {
            recipeName: recipe.name,
            building: recipe.building,
            requiredBuildings: parseFloat(factor.toFixed(2)),
            outputs: [],
            inputs: []
        };

        // Produzierte Items berechnen
        for (const pair of recipe.output_items.split(',')) {
            if (pair.includes(':')) {
                const [it, qty] = pair.split(':');
                calculationResult.outputs.push({
                    item: it,
                    amountPerMin: parseFloat((parseFloat(qty) * factor).toFixed(2))
                });
            }
        }

        // Benötigte Zutaten & Lösungswege (Sub-Rezepte) berechnen
        for (const pair of recipe.input_items.split(',')) {
            if (pair.includes(':')) {
                const [it, qty] = pair.split(':');
                const totalNeeded = parseFloat(qty) * factor;

                // Lösungswege via Unterfunktion ermitteln
                const alternativePaths = getSubRecipes(it, db);

                calculationResult.inputs.push({
                    item: it,
                    amountPerMin: parseFloat(totalNeeded.toFixed(2)),
                    subRecipes: alternativePaths
                });
            }
        }

        res.json({ success: true, result: calculationResult });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    } finally {
        db.close();
    }
});


// --- 4. BENUTZERVERWALTUNG (ADMIN FEATURES) ---

// Alle Benutzer auflisten
app.get('/api/users', (req, res) => {
    const db = new Database(DB_NAME);
    try {
        const users = db.prepare('SELECT id, username, role FROM users').all();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        db.close();
    }
});

// Benutzerrolle ändern
app.put('/api/users/:id/role', (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    if (!role) return res.status(400).json({ success: false, message: "Rolle fehlt." });

    const db = new Database(DB_NAME);
    try {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role.toLowerCase(), id);
        res.json({ success: true, message: "Rolle erfolgreich aktualisiert!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    } finally {
        db.close();
    }
});

// Benutzer löschen
app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    const db = new Database(DB_NAME);
    try {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        res.json({ success: true, message: "Benutzer erfolgreich entfernt." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    } finally {
        db.close();
    }
});


// --- Server starten ---
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`Satisfactory-Webserver gestartet!`);
    console.log(`Öffne im Browser: http://localhost:${PORT}`);
    console.log(`====================================================`);
});