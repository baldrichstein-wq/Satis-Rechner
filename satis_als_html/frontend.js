document.addEventListener('DOMContentLoaded', () => {
    // DOM Elemente
    const modal = document.getElementById('authModal');
    const loginNavBtn = document.getElementById('loginNavBtn');
    const logoutNavBtn = document.getElementById('logoutNavBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const usernameDisplay = document.getElementById('usernameDisplay');
    
    // Navigations-Gruppen
    const calcLinks = document.getElementById('calcLinks');
    const modLinks = document.getElementById('modLinks');
    const adminLinks = document.getElementById('adminLinks');

    // Form Container
    const loginContainer = document.getElementById('loginFormContainer');
    const registerContainer = document.getElementById('registerFormContainer');
    const toRegister = document.getElementById('toRegister');
    const toLogin = document.getElementById('toLogin');

    // Funktion zur Steuerung der Sichtbarkeit
    window.satisfactoryUI = {
        updateNavigation: function(user) {
            // Alle dynamischen Gruppen verstecken
            calcLinks.style.display = 'none';
            modLinks.style.display = 'none';
            adminLinks.style.display = 'none';
            loginNavBtn.style.display = 'inline-block';
            logoutNavBtn.style.display = 'none';

            if (!user) {
                // Wenn ausgeloggt, Benutzername leeren
                if(usernameDisplay) usernameDisplay.textContent = '';
                return;
            }

            // Eingeloggt: Standard-Optionen anzeigen
            calcLinks.style.display = 'inline-block';
            loginNavBtn.style.display = 'none';
            logoutNavBtn.style.display = 'inline-block';
            
            if(usernameDisplay) {
                usernameDisplay.textContent = `${user.name} [${user.role.toUpperCase()}]`;
            }

            // Rollenspezifische Menüs einblenden
            if (user.role === 'moderator') {
                modLinks.style.display = 'inline-block';
            } else if (user.role === 'admin') {
                modLinks.style.display = 'inline-block';
                adminLinks.style.display = 'inline-block';
            }
        }
    };

    // --- Event Listener für das Overlay ---
    loginNavBtn.addEventListener('click', (e) => { e.preventDefault(); modal.style.display = 'flex'; });
    closeModalBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    
    // Formular-Wechsel
    toRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
    });

    toLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
    });

    // Abmelden-Button zurücksetzen
    logoutNavBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.satisfactoryUI.updateNavigation(null);
        alert("Erfolgreich abgemeldet.");
    });

    // --- NEU: Echter Login über das Backend ---
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUser').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();

            if (data.success) {
                // Backend bestätigt den Login
                window.satisfactoryUI.updateNavigation(data.user);
                modal.style.display = 'none';
                
                // Formular leeren für die Sicherheit
                document.getElementById('loginForm').reset();
            } else {
                // Passwort oder Name falsch
                alert(data.message || "Login fehlgeschlagen.");
            }
        } catch (error) {
            console.error("Login Error:", error);
            alert("Konnte keine Verbindung zum Server herstellen. Läuft server.js?");
        }
    });

    // --- NEU: Echte Registrierung über das Backend ---
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUser').value;
        const password = document.getElementById('regPassword').value;
        
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();

            if (data.success) {
                // Backend bestätigt die Erstellung
                window.satisfactoryUI.updateNavigation(data.user);
                modal.style.display = 'none';
                alert(`Account für ${data.user.name} erfolgreich erstellt und eingeloggt!`);
                
                // Formular leeren
                document.getElementById('registerForm').reset();
            } else {
                // Name z.B. schon vergeben oder Fehler
                alert(data.message || "Registrierung fehlgeschlagen.");
            }
        } catch (error) {
            console.error("Register Error:", error);
            alert("Konnte keine Verbindung zum Server herstellen. Läuft server.js?");
        }
    
    });
    // --- BERECHNUNGS-LOGIK (Standard Rezept) ---
    const btnCalcStandard = document.getElementById('btnCalcStandard');
    const dynamicView = document.getElementById('dynamicView');

    // 1. Klick auf "Rezept berechnen" -> Liste abrufen
    btnCalcStandard.addEventListener('click', async (e) => {
        e.preventDefault();
        dynamicView.innerHTML = '<p>Lade Rezepte vom Server...</p>';

        try {
            const response = await fetch('/api/recipes');
            const recipes = await response.json();

            let html = '<h2>Standard Berechnung</h2>';
            html += '<p>Wähle ein Rezept aus der Liste aus:</p>';
            html += '<ul style="list-style: none; padding: 0;">';
            
            // Buttons für jedes Rezept generieren
            recipes.forEach(r => {
                html += `
                    <li style="margin-bottom: 10px;">
                        <button class="recipe-btn submit-btn" data-id="${r.id}" style="width: auto; padding: 10px;">
                            ${r.name} (Gebäude: ${r.building})
                        </button>
                    </li>`;
            });
            html += '</ul>';

            dynamicView.innerHTML = html;

            // Klick-Events für die neu erstellten Rezept-Buttons
            document.querySelectorAll('.recipe-btn').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    const recipeId = event.target.getAttribute('data-id');
                    const recipeName = event.target.textContent;
                    showCalculationForm(recipeId, recipeName);
                });
            });

        } catch (error) {
            console.error(error);
            dynamicView.innerHTML = '<p>Fehler beim Laden der Rezepte. Läuft der Server?</p>';
        }
    });

    // 2. Menge abfragen
    function showCalculationForm(recipeId, recipeName) {
        dynamicView.innerHTML = `
            <h2>Menge festlegen</h2>
            <p>Ausgewählt: <strong>${recipeName}</strong></p>
            <div class="form-group" style="max-width: 300px;">
                <label>Gewünschte Menge pro Minute:</label>
                <input type="number" id="desiredAmount" min="0.1" step="0.1" value="10">
            </div>
            <button id="startCalcBtn" class="submit-btn" style="width: auto;">Berechnen</button>
        `;

        document.getElementById('startCalcBtn').addEventListener('click', () => {
            const amount = document.getElementById('desiredAmount').value;
            performCalculation(recipeId, amount);
        });
    }

    // 3. Berechnung anfordern und Ergebnis rendern
    async function performCalculation(recipeId, desiredAmount) {
        dynamicView.innerHTML = '<p>Berechne die optimale Fabrik...</p>';
        
        try {
            const response = await fetch('/api/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipeId: recipeId, desiredAmount: parseFloat(desiredAmount) })
            });
            
            const data = await response.json();
            
            if (data.success) {
                const res = data.result;
                
                // HTML für die Ausgaben (Outputs) zusammenbauen
                const outputsHtml = res.outputs.map(out => 
                    `<li>+ <strong>${out.item}</strong>: ${out.amountPerMin}/min</li>`
                ).join('');

                // HTML für die Zutaten (Inputs) inklusive Sub-Rezepte zusammenbauen
                const inputsHtml = res.inputs.map(inp => {
                    let html = `<li>> <strong>${inp.item}</strong>: ${inp.amountPerMin}/min benötigt`;
                    
                    if (inp.subRecipes && inp.subRecipes.length > 0) {
                        html += `<ul style="font-size: 0.9em; color: #666;"><em>Lösungswege in DB gefunden:</em>`;
                        inp.subRecipes.forEach(sub => {
                            html += `<li>${sub.recipeName} (${sub.building})</li>`;
                        });
                        html += `</ul>`;
                    } else {
                        html += ` <em>(Rohstoff oder kein Rezept gefunden)</em>`;
                    }
                    html += `</li>`;
                    return html;
                }).join('');

                // Alles in die View pushen
                dynamicView.innerHTML = `
                    <h2>Berechnungsergebnis: ${res.recipeName}</h2>
                    <div style="background: #f4f4f4; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                        <h3 style="margin-top: 0;">Benötigte Gebäude:</h3>
                        <p style="font-size: 1.2em; color: #ff6600;"><strong>${res.requiredBuildings}x ${res.building}</strong></p>
                    </div>
                    
                    <h3>Produzierte Items (Output):</h3>
                    <ul>${outputsHtml}</ul>

                    <h3>Benötigte Ressourcen & Herstellung:</h3>
                    <ul>${inputsHtml}</ul>
                    
                    <button id="resetCalcBtn" class="submit-btn" style="width: auto; margin-top: 20px;">Neue Berechnung</button>
                `;

                // Button für eine neue Berechnung direkt anschließen
                document.getElementById('resetCalcBtn').addEventListener('click', () => {
                    btnCalcStandard.click(); // Simuliert einen Klick auf den Hauptbutton im Menü
                });

            } else {
                dynamicView.innerHTML = `<p>Fehler: ${data.message}</p>`;
            }
        } catch (error) {
            console.error(error);
            dynamicView.innerHTML = '<p>Konnte Berechnung nicht durchführen.</p>';
        }
    }
});