document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. LOKALE DATENBANK (localStorage) SETUP
    // ==========================================
    
    function initLocalDB() {
        // Standard-Rezepte anlegen, wenn der Speicher leer ist
        if (!localStorage.getItem('satis_recipes')) {
            const defaultRecipes = [
                { id: 1, name: 'Eisenbarren', output_items: 'Eisenbarren:30.0', input_items: 'Eisenerz:30.0', building: 'Schmelzofen' },
                { id: 2, name: 'Alternatives Rezept: Gusseisenschrauben', output_items: 'Schrauben:50.0', input_items: 'Eisenbarren:12.5', building: 'Constructor' },
                { id: 3, name: 'Eisenstangen', output_items: 'Eisenstangen:15.0', input_items: 'Eisenbarren:15.0', building: 'Constructor' },
                { id: 4, name: 'Eisenplatten', output_items: 'Eisenplatten:20.0', input_items: 'Eisenbarren:30.0', building: 'Constructor' },
                { id: 5, name: 'Schrauben', output_items: 'Schrauben:40.0', input_items: 'Eisenstangen:10.0', building: 'Constructor' },
                { id: 6, name: 'AluminiumSchrott', output_items: 'AluminiumSchrott:360.0,Wasser:120.0', input_items: 'Kohle:120.0,Aluminiumoxid:240.0', building: 'Raffinerie' }
            ];
            localStorage.setItem('satis_recipes', JSON.stringify(defaultRecipes));
        }
    }

    // Hilfsfunktionen für den Datenbank-Zugriff
    const db = {
        getRecipes: () => JSON.parse(localStorage.getItem('satis_recipes')),
        saveRecipes: (recipes) => localStorage.setItem('satis_recipes', JSON.stringify(recipes)),
        generateId: (items) => items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1
    };

    initLocalDB(); // Datenbank beim App-Start laden
    const dynamicView = document.getElementById('dynamicView');

    // ==========================================
    // 2. HAMBURGER MENU (Handy-Optimierung)
    // ==========================================
    const menuToggle = document.getElementById('menuToggle');
    const navCenter = document.getElementById('navCenter');

    if (menuToggle && navCenter) {
        // Klick auf die 3 Striche öffnet/schließt das Menü
        menuToggle.addEventListener('click', () => {
            navCenter.classList.toggle('active');
            menuToggle.classList.toggle('open');
        });

        // Menü automatisch einklappen, wenn ein Link angeklickt wird
        navCenter.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navCenter.classList.remove('active');
                menuToggle.classList.remove('open');
            });
        });
    }

    // ==========================================
    // 3. BERECHNUNGS-LOGIK
    // ==========================================
    const btnCalcStandard = document.getElementById('btnCalcStandard');
    const btnCalcAlt = document.getElementById('btnCalcAlt');

    // Standard-Berechnung
    btnCalcStandard.addEventListener('click', (e) => {
        e.preventDefault();
        const recipes = db.getRecipes();
        let html = '<h2>Standard Berechnung</h2><p>Wähle ein Rezept aus:</p><ul style="list-style: none; padding: 0;">';
        recipes.forEach(r => {
            html += `<li style="margin-bottom: 10px;"><button class="recipe-btn submit-btn" data-id="${r.id}" style="width: auto; padding: 10px;">${r.name} (Gebäude: ${r.building})</button></li>`;
        });
        html += '</ul>';
        dynamicView.innerHTML = html;

        document.querySelectorAll('.recipe-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                showCalculationForm(event.target.getAttribute('data-id'), event.target.textContent);
            });
        });
    });

    // Alternative Rezepte suchen
    btnCalcAlt.addEventListener('click', (e) => {
        e.preventDefault();
        dynamicView.innerHTML = `
            <h2>Alternative Rezepte suchen</h2>
            <div class="form-group" style="max-width: 300px;">
                <input type="text" id="searchItem" placeholder="z.B. Schrauben">
            </div>
            <button id="searchRecipeBtn" class="submit-btn" style="width: auto;">Suchen</button>
            <div id="searchResults" style="margin-top: 20px;"></div>
        `;

        document.getElementById('searchRecipeBtn').addEventListener('click', () => {
            const item = document.getElementById('searchItem').value.trim().toLowerCase();
            if (!item) return;

            const recipes = db.getRecipes();
            const results = recipes.filter(r => r.output_items.toLowerCase().includes(item));
            const resultsDiv = document.getElementById('searchResults');

            if (results.length === 0) {
                resultsDiv.innerHTML = '<p>Keine Rezepte gefunden.</p>'; return;
            }

            let html = '<ul style="list-style: none; padding: 0;">';
            results.forEach(r => {
                html += `<li style="margin-bottom: 10px;"><button class="recipe-btn submit-btn" data-id="${r.id}" style="width: auto; padding: 10px; background-color: #0078d7;">${r.name} (${r.building})</button></li>`;
            });
            resultsDiv.innerHTML = html + '</ul>';

            resultsDiv.querySelectorAll('.recipe-btn').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    showCalculationForm(event.target.getAttribute('data-id'), event.target.textContent);
                });
            });
        });
    });

    // Menge abfragen
    function showCalculationForm(recipeId, recipeName) {
        dynamicView.innerHTML = `
            <h2>Menge festlegen</h2>
            <p>Ausgewählt: <strong>${recipeName}</strong></p>
            <div class="form-group" style="max-width: 300px;">
                <label>Menge pro Minute:</label>
                <input type="number" id="desiredAmount" min="0.1" step="0.1" value="10">
            </div>
            <button id="startCalcBtn" class="submit-btn" style="width: auto;">Berechnen</button>
        `;

        document.getElementById('startCalcBtn').addEventListener('click', () => {
            performCalculation(recipeId, parseFloat(document.getElementById('desiredAmount').value));
        });
    }

    // Mathe-Engine (Offline)
    function performCalculation(recipeId, desiredAmount) {
        const recipes = db.getRecipes();
        const recipe = recipes.find(r => r.id == recipeId);
        if (!recipe) return;

        const firstOutput = recipe.output_items.split(',')[0];
        const mainOutQty = parseFloat(firstOutput.split(':')[1]);
        const factor = desiredAmount / mainOutQty;

        // Outputs
        let outputsHtml = '';
        recipe.output_items.split(',').forEach(pair => {
            const [it, qty] = pair.split(':');
            outputsHtml += `<li>+ <strong>${it}</strong>: ${(parseFloat(qty) * factor).toFixed(2)}/min</li>`;
        });

        // Inputs & Sub-Recipes
        let inputsHtml = '';
        recipe.input_items.split(',').forEach(pair => {
            const [it, qty] = pair.split(':');
            const totalNeeded = parseFloat(qty) * factor;
            
            // Sub-Rezepte lokal suchen
            const subRecipes = recipes.filter(r => r.output_items.includes(it));
            
            inputsHtml += `<li>> <strong>${it}</strong>: ${totalNeeded.toFixed(2)}/min benötigt`;
            if (subRecipes.length > 0) {
                inputsHtml += `<ul style="font-size: 0.9em; color: #666;"><em>Gefundene Lösungswege:</em>`;
                subRecipes.forEach(sub => inputsHtml += `<li>${sub.name} (${sub.building})</li>`);
                inputsHtml += `</ul>`;
            } else {
                inputsHtml += ` <em>(Rohstoff)</em>`;
            }
            inputsHtml += `</li>`;
        });

        dynamicView.innerHTML = `
            <h2>Berechnung: ${recipe.name}</h2>
            <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                <h3>Benötigte Gebäude:</h3>
                <p style="font-size: 1.2em; color: #ff6600;"><strong>${factor.toFixed(2)}x ${recipe.building}</strong></p>
            </div>
            <h3>Output:</h3><ul>${outputsHtml}</ul>
            <h3>Input:</h3><ul>${inputsHtml}</ul>
            <button id="resetCalcBtn" class="submit-btn" style="width: auto; margin-top: 20px;">Neue Berechnung</button>
        `;
        document.getElementById('resetCalcBtn').addEventListener('click', () => btnCalcStandard.click());
    }

    // ==========================================
    // 4. REZEPT-VERWALTUNG
    // ==========================================
    const btnAddRecipe = document.getElementById('btnAddRecipe');
    const btnEditRecipe = document.getElementById('btnEditRecipe');
    const btnDeleteRecipe = document.getElementById('btnDeleteRecipe');

    // Rezept hinzufügen
    btnAddRecipe.addEventListener('click', (e) => {
        e.preventDefault();
        dynamicView.innerHTML = `
            <h2>Neues Rezept</h2>
            <form id="addRecipeForm" style="max-width: 400px;">
                <div class="form-group"><label>Name:</label><input type="text" id="addName" required></div>
                <div class="form-group"><label>Output (Item:Menge, ...):</label><input type="text" id="addOutput" required></div>
                <div class="form-group"><label>Input (Item:Menge, ...):</label><input type="text" id="addInput" required></div>
                <div class="form-group"><label>Gebäude:</label><input type="text" id="addBuilding" required></div>
                <button type="submit" class="submit-btn">Speichern</button>
            </form>
        `;
        document.getElementById('addRecipeForm').addEventListener('submit', (event) => {
            event.preventDefault();
            const recipes = db.getRecipes();
            recipes.push({
                id: db.generateId(recipes),
                name: document.getElementById('addName').value.trim(),
                output_items: document.getElementById('addOutput').value.trim(),
                input_items: document.getElementById('addInput').value.trim(),
                building: document.getElementById('addBuilding').value.trim()
            });
            db.saveRecipes(recipes);
            alert("Rezept gespeichert!");
            btnCalcStandard.click(); // Springt zurück zur Übersicht
        });
    });

    // Rezept bearbeiten
    btnEditRecipe.addEventListener('click', (e) => {
        e.preventDefault();
        const recipes = db.getRecipes();
        let html = '<h2>Rezept bearbeiten</h2><ul style="list-style: none; padding: 0;">';
        recipes.forEach(r => {
            html += `<li style="margin-bottom: 10px;"><button class="edit-btn submit-btn" data-id="${r.id}" style="width: auto; padding: 10px; background: #ff9900;">&#9998; ${r.name}</button></li>`;
        });
        dynamicView.innerHTML = html + '</ul>';

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const id = parseInt(event.target.getAttribute('data-id'));
                const recipe = db.getRecipes().find(r => r.id === id);
                
                dynamicView.innerHTML = `
                    <h2>Bearbeiten: ${recipe.name}</h2>
                    <form id="editRecipeForm" style="max-width: 400px;">
                        <div class="form-group"><label>Name:</label><input type="text" id="editName" value="${recipe.name}" required></div>
                        <div class="form-group"><label>Output:</label><input type="text" id="editOutput" value="${recipe.output_items}" required></div>
                        <div class="form-group"><label>Input:</label><input type="text" id="editInput" value="${recipe.input_items}" required></div>
                        <div class="form-group"><label>Gebäude:</label><input type="text" id="editBuilding" value="${recipe.building}" required></div>
                        <button type="submit" class="submit-btn">Aktualisieren</button>
                    </form>
                `;

                document.getElementById('editRecipeForm').addEventListener('submit', (ev) => {
                    ev.preventDefault();
                    let allRecipes = db.getRecipes();
                    const index = allRecipes.findIndex(r => r.id === id);
                    if(index !== -1) {
                        allRecipes[index] = {
                            id: id,
                            name: document.getElementById('editName').value.trim(),
                            output_items: document.getElementById('editOutput').value.trim(),
                            input_items: document.getElementById('editInput').value.trim(),
                            building: document.getElementById('editBuilding').value.trim()
                        };
                        db.saveRecipes(allRecipes);
                        alert("Rezept aktualisiert!");
                        btnEditRecipe.click(); // Ansicht neu laden
                    }
                });
            });
        });
    });

    // Rezept löschen
    btnDeleteRecipe.addEventListener('click', (e) => {
        e.preventDefault();
        const recipes = db.getRecipes();
        let html = '<h2>Rezept löschen</h2><ul style="list-style: none; padding: 0;">';
        recipes.forEach(r => {
            html += `<li style="margin-bottom: 10px;"><button class="del-btn submit-btn" data-id="${r.id}" style="width: auto; padding: 10px; background: #cc0000;">Löschen: ${r.name}</button></li>`;
        });
        dynamicView.innerHTML = html + '</ul>';

        document.querySelectorAll('.del-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                if (confirm("Möchtest du dieses Rezept wirklich endgültig löschen?")) {
                    const id = parseInt(event.target.getAttribute('data-id'));
                    db.saveRecipes(db.getRecipes().filter(r => r.id !== id));
                    btnDeleteRecipe.click(); // Ansicht neu laden
                }
            });
        });
    });
});

// ==========================================
// 5. SERVICE WORKER REGISTRIERUNG (Für PWA)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker erfolgreich registriert!', reg))
            .catch(err => console.error('Service Worker Registrierung fehlgeschlagen:', err));
    });
}