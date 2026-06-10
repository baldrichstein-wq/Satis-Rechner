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

            if (!user) return;

            // Eingeloggt: Standard-Optionen anzeigen
            calcLinks.style.display = 'inline-block';
            loginNavBtn.style.display = 'none';
            logoutNavBtn.style.display = 'inline-block';
            usernameDisplay.textContent = `${user.name} [${user.role.toUpperCase()}]`;

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
    });

    // Formular-Absendung abfangen (Lokale Simulation - Login)
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUser').value;
        const role = username.toLowerCase() === 'admin' ? 'admin' : 'user';
        
        window.satisfactoryUI.updateNavigation({ name: username, role: role });
        modal.style.display = 'none';
    });

    // Formular-Absendung für die Registrierung
    document.getElementById('registerForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('regUser').value;
        window.satisfactoryUI.updateNavigation({ name: username, role: 'user' });
        modal.style.display = 'none';
        alert(`Simulierter Account für ${username} erstellt!`);
    });
});